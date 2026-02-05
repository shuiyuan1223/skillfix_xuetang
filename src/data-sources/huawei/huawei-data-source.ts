/**
 * Huawei Health Data Source
 *
 * Implements HealthDataSource interface using Huawei Health Kit API.
 * Falls back to mock data for unsupported data types (heart rate, sleep).
 */

import type {
  HealthDataSource,
  HealthMetrics,
  HeartRateData,
  SleepData,
  WorkoutData,
} from "../interface.js";
import { MockDataSource } from "../mock.js";
import { HuaweiHealthApi, huaweiHealthApi } from "./huawei-api.js";
import { HuaweiAuth, huaweiAuth } from "./huawei-auth.js";
import { mapActivityType } from "./huawei-types.js";

export class HuaweiHealthDataSource implements HealthDataSource {
  readonly name = "huawei";

  private api: HuaweiHealthApi;
  private auth: HuaweiAuth;
  private mockFallback: MockDataSource;

  constructor(api: HuaweiHealthApi = huaweiHealthApi, auth: HuaweiAuth = huaweiAuth) {
    this.api = api;
    this.auth = auth;
    this.mockFallback = new MockDataSource();
  }

  /**
   * Get health metrics from Huawei API
   * (steps, distance, calories, active minutes)
   */
  async getMetrics(date: string): Promise<HealthMetrics> {
    try {
      // Try to ensure valid token (will refresh if expired)
      await this.auth.ensureValidToken();
    } catch {
      console.warn("Huawei not authenticated, using mock data");
      return this.mockFallback.getMetrics(date);
    }

    try {
      const data = await this.api.getPolymerizeData(date);
      return {
        date,
        steps: data.steps,
        distance: data.distance,
        calories: data.calories,
        activeMinutes: data.activeMinutes,
      };
    } catch (error) {
      console.warn("Failed to fetch Huawei metrics, using mock:", error);
      return this.mockFallback.getMetrics(date);
    }
  }

  /**
   * Get heart rate data from Huawei API
   */
  async getHeartRate(date: string): Promise<HeartRateData> {
    try {
      await this.auth.ensureValidToken();
    } catch {
      console.warn("Huawei not authenticated, using mock heart rate data");
      return this.mockFallback.getHeartRate(date);
    }

    try {
      const result = await this.api.getHeartRateData(date);

      if (result.readings.length === 0) {
        console.warn("No heart rate data from Huawei, using mock");
        return this.mockFallback.getHeartRate(date);
      }

      return {
        date,
        restingAvg: result.avg,
        maxToday: result.max,
        minToday: result.min,
        readings: result.readings,
      };
    } catch (error) {
      console.warn("Failed to fetch Huawei heart rate, using mock:", error);
      return this.mockFallback.getHeartRate(date);
    }
  }

  /**
   * Get sleep data from Huawei API
   */
  async getSleep(date: string): Promise<SleepData | null> {
    try {
      await this.auth.ensureValidToken();
    } catch {
      console.warn("Huawei not authenticated, using mock sleep data");
      return this.mockFallback.getSleep(date);
    }

    try {
      const result = await this.api.getSleepData(date);

      if (!result) {
        console.warn("No sleep data from Huawei, using mock");
        return this.mockFallback.getSleep(date);
      }

      // Use API-provided stage durations if available, otherwise calculate from segments
      let stages = { deep: 0, light: 0, rem: 0, awake: 0 };

      if (result.deepSleepMinutes !== undefined || result.lightSleepMinutes !== undefined) {
        // Use direct values from API
        stages = {
          deep: result.deepSleepMinutes || 0,
          light: result.lightSleepMinutes || 0,
          rem: result.remMinutes || 0,
          awake: result.awakeMinutes || 0,
        };
      } else if (result.segments.length > 0) {
        // Calculate from segments (Huawei sleep_state: 1=awake, 2=light, 3=deep, 4=REM, 5=nap)
        for (const seg of result.segments) {
          const duration = Math.round((seg.endTime - seg.startTime) / (60 * 1000));
          switch (seg.sleepType) {
            case 1:
              stages.awake += duration;
              break;
            case 2:
              stages.light += duration;
              break;
            case 3:
              stages.deep += duration;
              break;
            case 4:
              stages.rem += duration;
              break;
            case 5: // nap - count as light sleep
              stages.light += duration;
              break;
          }
        }
      }

      // Use API sleep score if available, otherwise calculate
      const qualityScore =
        result.sleepScore !== undefined
          ? result.sleepScore
          : (() => {
              const sleepMinutes = stages.deep + stages.light + stages.rem;
              return sleepMinutes > 0
                ? Math.round(((stages.deep + stages.rem) / sleepMinutes) * 100)
                : 0;
            })();

      return {
        date,
        durationHours: Math.round((result.totalMinutes / 60) * 10) / 10,
        qualityScore,
        bedTime: result.bedTime,
        wakeTime: result.wakeTime,
        stages,
      };
    } catch (error) {
      console.warn("Failed to fetch Huawei sleep, using mock:", error);
      return this.mockFallback.getSleep(date);
    }
  }

  /**
   * Get workout data from Huawei API
   */
  async getWorkouts(date: string): Promise<WorkoutData[]> {
    try {
      // Try to ensure valid token (will refresh if expired)
      await this.auth.ensureValidToken();
    } catch {
      console.warn("Huawei not authenticated, using mock data");
      return this.mockFallback.getWorkouts(date);
    }

    try {
      const records = await this.api.getActivityRecords(date, date);

      return records.map((record) => ({
        id: record.id,
        date,
        type: mapActivityType(record.activityType),
        durationMinutes: record.duration,
        caloriesBurned: record.calories || 0,
        distanceKm: record.distance ? record.distance / 1000 : undefined,
        avgHeartRate: record.avgHeartRate,
      }));
    } catch (error) {
      console.warn("Failed to fetch Huawei workouts, using mock:", error);
      return this.mockFallback.getWorkouts(date);
    }
  }

  /**
   * Get weekly step data
   */
  async getWeeklySteps(endDate: string): Promise<Array<{ date: string; steps: number }>> {
    const result: Array<{ date: string; steps: number }> = [];
    const end = new Date(endDate);

    for (let i = 6; i >= 0; i--) {
      const d = new Date(end);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      const metrics = await this.getMetrics(dateStr);
      result.push({ date: dateStr, steps: metrics.steps });
    }

    return result;
  }

  /**
   * Get weekly sleep data (Mock fallback)
   */
  async getWeeklySleep(endDate: string): Promise<Array<{ date: string; hours: number }>> {
    // Sleep requires advanced permission, use mock
    return this.mockFallback.getWeeklySleep(endDate);
  }

  /**
   * Check if the data source is properly configured and authenticated
   */
  isReady(): boolean {
    return this.auth.isAuthenticated();
  }
}

// Default instance
export const huaweiDataSource = new HuaweiHealthDataSource();
