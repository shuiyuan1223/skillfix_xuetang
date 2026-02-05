/**
 * Huawei Health Data Source
 *
 * Implements HealthDataSource interface using Huawei Health Kit API.
 * Returns real data when available, null/empty when not (no mock fallback).
 */

import type {
  HealthDataSource,
  HealthMetrics,
  HeartRateData,
  SleepData,
  WorkoutData,
  StressData,
  SpO2Data,
  ECGData,
} from "../interface.js";
import { HuaweiHealthApi, huaweiHealthApi, createHuaweiHealthApiForUser } from "./huawei-api.js";
import { HuaweiAuth, huaweiAuth } from "./huawei-auth.js";
import { mapActivityType } from "./huawei-types.js";
import { getUserStore } from "./user-store.js";

export class HuaweiHealthDataSource implements HealthDataSource {
  readonly name = "huawei";

  private api: HuaweiHealthApi;
  private auth: HuaweiAuth;
  private userUuid: string | null = null;

  /**
   * Create a HuaweiHealthDataSource
   * @param userUuid - Optional user UUID for multi-user mode. If provided, uses SQLite token storage.
   * @param api - Optional custom API instance
   * @param auth - Optional custom auth instance
   */
  constructor(userUuid?: string, api?: HuaweiHealthApi, auth: HuaweiAuth = huaweiAuth) {
    this.userUuid = userUuid || null;
    this.auth = auth;

    // If userUuid is provided, create a user-specific API instance
    if (userUuid) {
      this.api = api || createHuaweiHealthApiForUser(userUuid);
    } else {
      this.api = api || huaweiHealthApi;
    }
  }

  /**
   * Ensure valid token for this data source (handles multi-user)
   */
  private async ensureToken(): Promise<void> {
    if (this.userUuid) {
      // Multi-user mode: use SQLite token
      await this.auth.ensureValidTokenForUser(this.userUuid, getUserStore());
    } else {
      // Single-user mode: use file token
      await this.ensureToken();
    }
  }

  /**
   * Get health metrics from Huawei API
   * (steps, distance, calories, active minutes)
   */
  async getMetrics(date: string): Promise<HealthMetrics> {
    try {
      await this.ensureToken();
      const data = await this.api.getPolymerizeData(date);
      return {
        date,
        steps: data.steps,
        distance: data.distance,
        calories: data.calories,
        activeMinutes: data.activeMinutes,
      };
    } catch (error) {
      console.warn("Failed to fetch Huawei metrics:", error);
      // Return zeros instead of mock data
      return { date, steps: 0, distance: 0, calories: 0, activeMinutes: 0 };
    }
  }

  /**
   * Get heart rate data from Huawei API
   */
  async getHeartRate(date: string): Promise<HeartRateData> {
    try {
      await this.ensureToken();
      const result = await this.api.getHeartRateData(date);
      return {
        date,
        restingAvg: result.avg,
        maxToday: result.max,
        minToday: result.min,
        readings: result.readings,
      };
    } catch (error) {
      console.warn("Failed to fetch Huawei heart rate:", error);
      return { date, restingAvg: 0, maxToday: 0, minToday: 0, readings: [] };
    }
  }

  /**
   * Get sleep data from Huawei API
   */
  async getSleep(date: string): Promise<SleepData | null> {
    try {
      await this.ensureToken();
      const result = await this.api.getSleepData(date);

      if (!result) {
        return null; // No sleep data available
      }

      // Use API-provided stage durations if available, otherwise calculate from segments
      let stages = { deep: 0, light: 0, rem: 0, awake: 0 };

      if (result.deepSleepMinutes !== undefined || result.lightSleepMinutes !== undefined) {
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
            case 5:
              stages.light += duration;
              break;
          }
        }
      }

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
      console.warn("Failed to fetch Huawei sleep:", error);
      return null;
    }
  }

  /**
   * Get workout data from Huawei API
   */
  async getWorkouts(date: string): Promise<WorkoutData[]> {
    try {
      await this.ensureToken();
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
      console.warn("Failed to fetch Huawei workouts:", error);
      return [];
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
   * Get weekly sleep data from Huawei API
   */
  async getWeeklySleep(endDate: string): Promise<Array<{ date: string; hours: number }>> {
    try {
      await this.ensureToken();
      const data = await this.api.getWeeklySleepData(endDate);
      return data.map((d) => ({ date: d.date, hours: d.hours }));
    } catch (error) {
      console.warn("Failed to fetch Huawei weekly sleep:", error);
      // Return empty array for each day
      const result: Array<{ date: string; hours: number }> = [];
      const end = new Date(endDate);
      for (let i = 6; i >= 0; i--) {
        const d = new Date(end);
        d.setDate(d.getDate() - i);
        result.push({ date: d.toISOString().split("T")[0], hours: 0 });
      }
      return result;
    }
  }

  /**
   * Get stress data from Huawei API
   */
  async getStress(date: string): Promise<StressData | null> {
    try {
      await this.ensureToken();
    } catch {
      console.warn("Huawei not authenticated, no stress data available");
      return null;
    }

    try {
      const result = await this.api.getStressData(date);
      if (!result) {
        return null;
      }
      return {
        date,
        current: result.current,
        avg: result.avg,
        max: result.max,
        min: result.min,
        readings: result.readings,
      };
    } catch (error) {
      console.warn("Failed to fetch Huawei stress data:", error);
      return null;
    }
  }

  /**
   * Get SpO2 (blood oxygen) data from Huawei API
   */
  async getSpO2(date: string): Promise<SpO2Data | null> {
    try {
      await this.ensureToken();
    } catch {
      console.warn("Huawei not authenticated, no SpO2 data available");
      return null;
    }

    try {
      const result = await this.api.getSpO2Data(date);
      if (!result) {
        return null;
      }
      return {
        date,
        current: result.current,
        avg: result.avg,
        max: result.max,
        min: result.min,
        readings: result.readings,
      };
    } catch (error) {
      console.warn("Failed to fetch Huawei SpO2 data:", error);
      return null;
    }
  }

  /**
   * Get resting heart rate from Huawei API
   */
  async getRestingHeartRate(date: string): Promise<number | null> {
    try {
      await this.ensureToken();
    } catch {
      console.warn("Huawei not authenticated, no resting heart rate available");
      return null;
    }

    try {
      return await this.api.getRestingHeartRateData(date);
    } catch (error) {
      console.warn("Failed to fetch Huawei resting heart rate:", error);
      return null;
    }
  }

  /**
   * Get ECG (electrocardiogram) data from Huawei API
   */
  async getECG(date: string): Promise<ECGData | null> {
    try {
      await this.ensureToken();
    } catch {
      console.warn("Huawei not authenticated, no ECG data available");
      return null;
    }

    try {
      const result = await this.api.getECGData(date);
      if (!result) {
        return null;
      }
      return {
        date,
        records: result.records.map((r) => ({
          time: r.time,
          avgHeartRate: r.avgHeartRate,
          arrhythmiaType: r.arrhythmiaType,
          arrhythmiaLabel: r.arrhythmiaLabel,
        })),
        latestHeartRate: result.latestHeartRate,
        hasArrhythmia: result.hasArrhythmia,
      };
    } catch (error) {
      console.warn("Failed to fetch Huawei ECG data:", error);
      return null;
    }
  }

  /**
   * Check if the data source is properly configured and authenticated
   */
  isReady(): boolean {
    if (this.userUuid) {
      // Multi-user mode: check SQLite
      return this.auth.isUserAuthenticated(this.userUuid, getUserStore());
    }
    // Single-user mode: check file
    return this.auth.isAuthenticated();
  }
}

// Default instance
export const huaweiDataSource = new HuaweiHealthDataSource();
