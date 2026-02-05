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
   * Get heart rate data (Mock fallback - requires Health Kit advanced permission)
   */
  async getHeartRate(date: string): Promise<HeartRateData> {
    // Heart rate requires Health Kit advanced permission
    // Fall back to mock data
    return this.mockFallback.getHeartRate(date);
  }

  /**
   * Get sleep data (Mock fallback - requires Health Kit advanced permission)
   */
  async getSleep(date: string): Promise<SleepData | null> {
    // Sleep data requires Health Kit advanced permission
    // Fall back to mock data
    return this.mockFallback.getSleep(date);
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
