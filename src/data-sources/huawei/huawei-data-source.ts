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
  BloodPressureData,
  BloodGlucoseData,
  BodyCompositionData,
  BodyTemperatureData,
  NutritionData,
  MenstrualCycleData,
  VO2MaxData,
  EmotionData,
  HRVData,
} from '../interface.js';
import type { HuaweiHealthApi } from './huawei-api.js';
import { huaweiHealthApi, createHuaweiHealthApiForUser } from './huawei-api.js';
import type { HuaweiAuth } from './huawei-auth.js';
import { huaweiAuth } from './huawei-auth.js';
import { mapActivityType } from './huawei-types.js';
import { getUserStore } from './user-store.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('Huawei/DataSource');

/** Serialize error for structured logging (Error objects stringify to {} by default) */
function errMsg(error: unknown): { message: string; code?: string } {
  if (error instanceof Error) {
    return {
      message: error.message,
      ...('code' in error ? { code: String((error as any).code) } : {}),
    };
  }
  return { message: String(error) };
}

/** Get date string in local timezone (YYYY-MM-DD) */
function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export class HuaweiHealthDataSource implements HealthDataSource {
  readonly name = 'huawei';

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

  // Token deduplication: avoids redundant validation when many data methods
  // fire concurrently (e.g., during dashboard load with 20+ parallel fetchers).
  private _tokenPromise: Promise<void> | null = null;
  private _tokenValidUntil = 0;

  /**
   * Ensure valid token for this data source (handles multi-user).
   * If the exact UUID has no token, falls back to the first available token
   * in the store (handles UUID mismatch after re-auth).
   *
   * Uses promise deduplication: concurrent callers share the same validation
   * promise, and the result is cached for 10 seconds.
   */
  private async ensureToken(): Promise<void> {
    // Fast path: token was validated recently
    if (Date.now() < this._tokenValidUntil) return;
    // Dedup: reuse in-flight validation
    if (this._tokenPromise) {
      await this._tokenPromise;
      return;
    }

    this._tokenPromise = this._doEnsureToken();
    try {
      await this._tokenPromise;
      this._tokenValidUntil = Date.now() + 10_000; // 10s grace period
    } finally {
      this._tokenPromise = null;
    }
  }

  private async _doEnsureToken(): Promise<void> {
    if (this.userUuid) {
      // Multi-user mode: use SQLite token
      try {
        await this.auth.ensureValidTokenForUser(this.userUuid, getUserStore());
      } catch (e) {
        // Fallback: if this UUID has no token, try finding any valid token in the store
        const store = getUserStore();
        const allUuids = store.listUserUuids();
        if (allUuids.length > 0) {
          const fallbackUuid = allUuids[0];
          log.warn('Token not found for UUID, falling back to available token', {
            requestedUuid: this.userUuid.slice(0, 8),
            fallbackUuid: fallbackUuid.slice(0, 8),
          });
          await this.auth.ensureValidTokenForUser(fallbackUuid, store);
          // Update both the data source and API to use the correct UUID
          this.userUuid = fallbackUuid;
          this.api = createHuaweiHealthApiForUser(fallbackUuid);
          return;
        }
        throw e;
      }
    } else {
      // Single-user mode: use file token
      await this.auth.ensureValidToken();
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
      log.warn('Failed to fetch metrics', errMsg(error));
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
      log.warn('Failed to fetch heart rate', errMsg(error));
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
            default:
              break;
          }
        }
      }

      const qualityScore =
        result.sleepScore !== undefined
          ? result.sleepScore
          : (() => {
              const sleepMinutes = stages.deep + stages.light + stages.rem;
              return sleepMinutes > 0 ? Math.round(((stages.deep + stages.rem) / sleepMinutes) * 100) : 0;
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
      log.warn('Failed to fetch sleep', errMsg(error));
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
      log.warn('Failed to fetch workouts', errMsg(error));
      return [];
    }
  }

  /**
   * Get weekly step data using bulk getMetricsRange (3 parallel API calls
   * instead of 7 sequential per-day calls).
   */
  async getWeeklySteps(endDate: string): Promise<Array<{ date: string; steps: number }>> {
    const end = new Date(endDate);
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    const startStr = toLocalDateStr(start);

    const rangeData = await this.getMetricsRange(startStr, endDate);
    const stepsMap = new Map(rangeData.map((d) => [d.date, d.steps]));

    const result: Array<{ date: string; steps: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(end);
      d.setDate(d.getDate() - i);
      const dateStr = toLocalDateStr(d);
      result.push({ date: dateStr, steps: stepsMap.get(dateStr) ?? 0 });
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
      log.warn('Failed to fetch weekly sleep', errMsg(error));
      // Return empty array for each day
      const result: Array<{ date: string; hours: number }> = [];
      const end = new Date(endDate);
      for (let i = 6; i >= 0; i--) {
        const d = new Date(end);
        d.setDate(d.getDate() - i);
        result.push({ date: toLocalDateStr(d), hours: 0 });
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
      log.warn('Not authenticated, no stress data available');
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
      log.warn('Failed to fetch stress data', errMsg(error));
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
      log.warn('Not authenticated, no SpO2 data available');
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
      log.warn('Failed to fetch SpO2 data', errMsg(error));
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
      log.warn('Not authenticated, no resting heart rate available');
      return null;
    }

    try {
      return await this.api.getRestingHeartRateData(date);
    } catch (error) {
      log.warn('Failed to fetch resting heart rate', errMsg(error));
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
      log.warn('Not authenticated, no ECG data available');
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
      log.warn('Failed to fetch ECG data', errMsg(error));
      return null;
    }
  }

  /**
   * Get blood pressure data from Huawei API.
   * Uses 7-day lookback since BP isn't measured daily.
   */
  async getBloodPressure(date: string): Promise<BloodPressureData | null> {
    try {
      await this.ensureToken();
    } catch {
      return null;
    }
    try {
      // Query 7-day range in a single API call (BP is intermittent)
      const result = await this.api.getBloodPressureData(date, 7);
      if (!result) {
        return null;
      }
      return { date, ...result };
    } catch (error) {
      log.warn('Failed to fetch blood pressure', errMsg(error));
      return null;
    }
  }

  /**
   * Get blood glucose data from Huawei API
   */
  async getBloodGlucose(date: string): Promise<BloodGlucoseData | null> {
    try {
      await this.ensureToken();
    } catch {
      return null;
    }
    try {
      const result = await this.api.getBloodGlucoseData(date);
      if (!result) {
        return null;
      }
      return { date, ...result };
    } catch (error) {
      log.warn('Failed to fetch blood glucose', errMsg(error));
      return null;
    }
  }

  /**
   * Get body composition data from Huawei API
   */
  async getBodyComposition(date: string): Promise<BodyCompositionData | null> {
    try {
      await this.ensureToken();
    } catch {
      return null;
    }
    try {
      const result = await this.api.getBodyCompositionData(date);
      if (!result) {
        return null;
      }
      return { date, ...result };
    } catch (error) {
      log.warn('Failed to fetch body composition', errMsg(error));
      return null;
    }
  }

  /**
   * Get body temperature data from Huawei API
   */
  async getBodyTemperature(date: string): Promise<BodyTemperatureData | null> {
    try {
      await this.ensureToken();
    } catch {
      return null;
    }
    try {
      const result = await this.api.getBodyTemperatureData(date);
      if (!result) {
        return null;
      }
      return { date, ...result };
    } catch (error) {
      log.warn('Failed to fetch body temperature', errMsg(error));
      return null;
    }
  }

  /**
   * Get nutrition data from Huawei API
   */
  async getNutrition(date: string): Promise<NutritionData | null> {
    try {
      await this.ensureToken();
    } catch {
      return null;
    }
    try {
      const result = await this.api.getNutritionData(date);
      if (!result) {
        return null;
      }
      return { date, ...result };
    } catch (error) {
      log.warn('Failed to fetch nutrition', errMsg(error));
      return null;
    }
  }

  /**
   * Get menstrual cycle data from Huawei API
   */
  async getMenstrualCycle(date: string): Promise<MenstrualCycleData | null> {
    try {
      await this.ensureToken();
    } catch {
      return null;
    }
    try {
      const result = await this.api.getMenstrualCycleData(date);
      if (!result) {
        return null;
      }
      return { date, ...result };
    } catch (error) {
      log.warn('Failed to fetch menstrual cycle', errMsg(error));
      return null;
    }
  }

  /**
   * Get VO2Max data from Huawei API
   */
  async getVO2Max(date: string): Promise<VO2MaxData | null> {
    try {
      await this.ensureToken();
    } catch {
      return null;
    }
    try {
      const result = await this.api.getVO2MaxData(date);
      if (!result) {
        return null;
      }
      return { date, ...result };
    } catch (error) {
      log.warn('Failed to fetch VO2Max', errMsg(error));
      return null;
    }
  }

  /**
   * Get emotion data from Huawei API
   */
  async getEmotion(date: string): Promise<EmotionData | null> {
    try {
      await this.ensureToken();
    } catch {
      return null;
    }
    try {
      const result = await this.api.getEmotionData(date);
      if (!result) {
        return null;
      }
      return { date, ...result };
    } catch (error) {
      log.warn('Failed to fetch emotion', errMsg(error));
      return null;
    }
  }

  /**
   * Get HRV (heart rate variability) data from Huawei API
   */
  async getHRV(date: string): Promise<HRVData | null> {
    try {
      await this.ensureToken();
    } catch {
      return null;
    }
    try {
      const result = await this.api.getHRVData(date);
      if (!result) {
        return null;
      }
      return { date, ...result };
    } catch (error) {
      log.warn('Failed to fetch HRV', errMsg(error));
      return null;
    }
  }

  /**
   * Get metrics for a date range using groupByTime optimization.
   * Uses polymerize with groupByTime=1day for efficient 2-year data fetching.
   * 730 days → ~9 API calls (in 90-day chunks) instead of 730 individual calls.
   */
  async getMetricsRange(
    startDate: string,
    endDate: string
  ): Promise<
    Array<{
      date: string;
      steps: number;
      calories: number;
      distance: number;
      activeMinutes: number;
    }>
  > {
    try {
      await this.ensureToken();
    } catch {
      return [];
    }

    try {
      // Fetch steps, calories, distance in parallel using groupByTime
      const [stepsData, caloriesData, distanceData] = await Promise.all([
        this.api.getPolymerizeDataRange('com.huawei.continuous.steps.delta', startDate, endDate),
        this.api.getPolymerizeDataRange('com.huawei.continuous.calories.burnt', startDate, endDate),
        this.api.getPolymerizeDataRange('com.huawei.continuous.distance.delta', startDate, endDate),
      ]);

      // Build lookup maps — sum all field values since fieldName varies by data type
      // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
      const sumValues = (vals: Record<string, number>) => Object.values(vals).reduce((a, b) => a + b, 0);
      const stepsMap = new Map(stepsData.map((d) => [d.date, sumValues(d.values)]));
      const caloriesMap = new Map(caloriesData.map((d) => [d.date, sumValues(d.values)]));
      const distanceMap = new Map(distanceData.map((d) => [d.date, sumValues(d.values)]));

      // Build result for all dates in range
      const result: Array<{
        date: string;
        steps: number;
        calories: number;
        distance: number;
        activeMinutes: number;
      }> = [];
      const current = new Date(startDate);
      const end = new Date(endDate);
      while (current <= end) {
        const dateStr = toLocalDateStr(current);
        result.push({
          date: dateStr,
          steps: Math.round(stepsMap.get(dateStr) || 0),
          calories: Math.round(caloriesMap.get(dateStr) || 0),
          distance: Math.round(distanceMap.get(dateStr) || 0),
          activeMinutes: 0, // Not available via groupByTime; use dailyActivitySummary for single-day
        });
        current.setDate(current.getDate() + 1);
      }

      return result;
    } catch (error) {
      log.warn('Failed to fetch metrics range with groupByTime', errMsg(error));
      return [];
    }
  }

  /**
   * Get sleep data for a date range.
   * Tries the weekly healthRecords API first; on failure, falls back to
   * individual-day getSleep() calls which have built-in date fallback logic.
   */
  async getSleepRange(
    startDate: string,
    endDate: string
  ): Promise<Array<{ date: string; hours: number; qualityScore?: number }>> {
    try {
      await this.ensureToken();
    } catch (error) {
      log.warn('Not authenticated, no sleep range data available', errMsg(error));
      return [];
    }

    // --- Primary path: weekly healthRecords API ---
    try {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const dayDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

      if (dayDiff <= 7) {
        const data = await this.api.getWeeklySleepData(endDate);
        if (data.length > 0) {
          return data.map((d) => ({ date: d.date, hours: d.hours, qualityScore: d.sleepScore }));
        }
      } else {
        // For longer ranges, fetch in 7-day chunks
        const result: Array<{ date: string; hours: number; qualityScore?: number }> = [];
        const current = new Date(end);

        while (current >= start) {
          const chunkEnd = toLocalDateStr(current);
          const chunkData = await this.api.getWeeklySleepData(chunkEnd);
          for (const d of chunkData) {
            if (new Date(d.date) >= start && new Date(d.date) <= end) {
              if (!result.some((r) => r.date === d.date)) {
                result.push({ date: d.date, hours: d.hours, qualityScore: d.sleepScore });
              }
            }
          }
          current.setDate(current.getDate() - 7);
        }

        if (result.length > 0) {
          return result.sort((a, b) => a.date.localeCompare(b.date));
        }
      }
    } catch (error) {
      log.warn('Weekly sleep API failed, falling back to per-day queries', errMsg(error));
    }

    // --- Fallback path: individual day queries (uses getSleep with date fallback) ---
    try {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const result: Array<{ date: string; hours: number; qualityScore?: number }> = [];

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = toLocalDateStr(d);
        const sleep = await this.getSleep(dateStr);
        if (sleep) {
          result.push({
            date: sleep.date,
            hours: sleep.durationHours,
            qualityScore: sleep.qualityScore,
          });
        }
      }

      if (result.length > 0) {
        log.info('Sleep range fetched via per-day fallback', { count: result.length });
      }
      return result;
    } catch (error) {
      log.warn('Failed to fetch sleep range (fallback)', errMsg(error));
      return [];
    }
  }

  /**
   * Get heart rate data for a date range using groupByTime optimization
   */
  async getHeartRateRange(
    startDate: string,
    endDate: string
  ): Promise<Array<{ date: string; avg: number; max: number; min: number }>> {
    try {
      await this.ensureToken();
    } catch {
      return [];
    }

    try {
      const data = await this.api.getPolymerizeDataRange('com.huawei.instantaneous.heart_rate', startDate, endDate);

      // With groupByTime, each entry has daily aggregated HR values
      return data.map((d) => ({
        date: d.date,
        avg: Math.round(d.values.value || d.values.avg || 0),
        max: Math.round(d.values.max || d.values.value || 0),
        min: Math.round(d.values.min || d.values.value || 0),
      }));
    } catch (error) {
      log.warn('Failed to fetch heart rate range with groupByTime', errMsg(error));
      return [];
    }
  }

  /**
   * Get stress data for a date range using groupByTime
   */
  async getStressRange(
    startDate: string,
    endDate: string
  ): Promise<Array<{ date: string; avg: number; max: number; min: number }>> {
    try {
      await this.ensureToken();
    } catch {
      return [];
    }

    try {
      const data = await this.api.getPolymerizeDataRange('com.huawei.instantaneous.stress', startDate, endDate);

      return data.map((d) => ({
        date: d.date,
        avg: Math.round(d.values.value || d.values.avg || 0),
        max: Math.round(d.values.max || d.values.value || 0),
        min: Math.round(d.values.min || d.values.value || 0),
      }));
    } catch (error) {
      log.warn('Failed to fetch stress range', errMsg(error));
      return [];
    }
  }

  /**
   * Get SpO2 data for a date range using groupByTime.
   * Falls back to per-day getSpO2() if the bulk API fails.
   */
  async getSpO2Range(
    startDate: string,
    endDate: string
  ): Promise<Array<{ date: string; avg: number; max: number; min: number }>> {
    try {
      await this.ensureToken();
    } catch (error) {
      log.warn('Not authenticated, no SpO2 range data available', errMsg(error));
      return [];
    }

    // --- Primary path: polymerize groupByTime API ---
    try {
      const data = await this.api.getPolymerizeDataRange('com.huawei.instantaneous.spo2', startDate, endDate);

      if (data.length > 0) {
        return data.map((d) => ({
          date: d.date,
          avg: Math.round(d.values.value || d.values.avg || 0),
          max: Math.round(d.values.max || Math.min(100, (d.values.value || 0) + 1)),
          min: Math.round(d.values.min || Math.max(0, (d.values.value || 0) - 2)),
        }));
      }
    } catch (error) {
      log.warn('SpO2 range API failed, falling back to per-day queries', errMsg(error));
    }

    // --- Fallback path: individual day queries ---
    try {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const result: Array<{ date: string; avg: number; max: number; min: number }> = [];

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = toLocalDateStr(d);
        const spo2 = await this.getSpO2(dateStr);
        if (spo2 && spo2.avg > 0) {
          result.push({
            date: spo2.date,
            avg: spo2.avg,
            max: spo2.max,
            min: spo2.min,
          });
        }
      }

      if (result.length > 0) {
        log.info('SpO2 range fetched via per-day fallback', { count: result.length });
      }
      return result;
    } catch (error) {
      log.warn('Failed to fetch SpO2 range (fallback)', errMsg(error));
      return [];
    }
  }

  /**
   * Get blood pressure data for a date range using groupByTime
   */
  async getBloodPressureRange(
    startDate: string,
    endDate: string
  ): Promise<Array<{ date: string; avgSystolic: number; avgDiastolic: number }>> {
    try {
      await this.ensureToken();
    } catch {
      return [];
    }

    try {
      const data = await this.api.getPolymerizeDataRange('com.huawei.instantaneous.blood_pressure', startDate, endDate);

      return data
        .map((d) => ({
          date: d.date,
          avgSystolic: Math.round(d.values.systolic_pressure || d.values.value || 0),
          avgDiastolic: Math.round(d.values.diastolic_pressure || 0),
        }))
        .filter((d) => d.avgSystolic > 0);
    } catch (error) {
      log.warn('Failed to fetch blood pressure range', errMsg(error));
      return [];
    }
  }

  /**
   * Get body composition data for a date range using groupByTime
   */
  async getBodyCompositionRange(
    startDate: string,
    endDate: string
  ): Promise<Array<{ date: string; weight?: number; bmi?: number; bodyFatRate?: number }>> {
    try {
      await this.ensureToken();
    } catch {
      return [];
    }

    try {
      const data = await this.api.getPolymerizeDataRange('com.huawei.instantaneous.body_weight', startDate, endDate);

      return data
        .map((d) => ({
          date: d.date,
          weight: (() => {
            const raw = d.values.body_weight ?? d.values.value;
            return raw ? Math.round(raw * 10) / 10 : undefined;
          })(),
          bmi: d.values.bmi ? Math.round(d.values.bmi * 10) / 10 : undefined,
          bodyFatRate: d.values.body_fat_rate ? Math.round(d.values.body_fat_rate * 10) / 10 : undefined,
        }))
        .filter((d) => d.weight != null);
    } catch (error) {
      log.warn('Failed to fetch body composition range', errMsg(error));
      return [];
    }
  }

  /**
   * Get workouts for a date range
   */
  async getWorkoutsRange(startDate: string, endDate: string): Promise<WorkoutData[]> {
    try {
      await this.ensureToken();
      const records = await this.api.getActivityRecords(startDate, endDate);
      return records.map((record) => ({
        id: record.id,
        date: toLocalDateStr(record.startTime),
        type: mapActivityType(record.activityType),
        durationMinutes: record.duration,
        caloriesBurned: record.calories || 0,
        distanceKm: record.distance ? record.distance / 1000 : undefined,
        avgHeartRate: record.avgHeartRate,
      }));
    } catch (error) {
      log.warn('Failed to fetch workouts range', errMsg(error));
      return [];
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
