/**
 * Huawei Health Kit REST API Client
 *
 * Client for calling Huawei Health Kit REST API endpoints.
 */

import type { HuaweiAuth } from "./huawei-auth.js";
import { huaweiAuth as defaultAuth } from "./huawei-auth.js";
import {
  HuaweiDataType,
  type HuaweiPolymerizeResponse,
  type HuaweiApiError,
} from "./huawei-types.js";
import { loadConfig } from "../../utils/config.js";
import { saveToFileCache, getFromMemoryCache, saveToMemoryCache } from "./api-cache.js";
import { getUserStore } from "./user-store.js";
import { createLogger } from "../../utils/logger.js";
import {
  parseHeartRateResponse,
  parseStressResponse,
  parseSpO2Response,
  parseECGResponse,
  parseSleepResponse,
  parseWeeklySleepResponse,
  parseBloodPressureResponse,
  parseBloodGlucoseResponse,
  parseBodyCompositionWeightResponse,
  parseBodyCompositionHeightResponse,
  parseBodyTemperatureResponse,
  parseNutritionResponse,
  parseMenstrualFlowResponse,
  deriveMenstrualCycleInfo,
  parseVO2MaxResponse,
  parseHRVResponse,
  parseEmotionResponse,
  parsePolymerizeDataRangeChunk,
} from "./huawei-parsers.js";

const log = createLogger("Huawei/API");

// Huawei Health Kit API base URL (default, can be overridden in config)
const DEFAULT_API_BASE = "https://health-api.cloud.huawei.com";

// Track scope errors for re-auth detection
const missingScopeErrors = new Set<string>();

/**
 * Get the set of data types that failed due to missing OAuth scopes (403).
 * Used by the dashboard to show a re-auth prompt.
 */
export function getMissingScopeErrors(): string[] {
  return Array.from(missingScopeErrors);
}

/**
 * Clear the missing scope errors (e.g., after re-auth).
 */
export function clearMissingScopeErrors(): void {
  missingScopeErrors.clear();
}

function getApiBaseUrl(): string {
  const config = loadConfig();
  return config.dataSources.huawei?.apiBaseUrl || DEFAULT_API_BASE;
}

// Data type names for the API
// See: https://pub.dev/documentation/huawei_health/latest/huawei_health/DataType-class.html
const DATA_TYPE_NAMES: Record<number, string> = {
  [HuaweiDataType.STEPS]: "com.huawei.continuous.steps.delta",
  [HuaweiDataType.DISTANCE]: "com.huawei.continuous.distance.delta",
  [HuaweiDataType.CALORIES]: "com.huawei.continuous.calories.burnt",
  // ACTIVE_MINUTES: fetched from dailyActivitySummary (activeHours), not polymerize
};

// Additional data type names for other health metrics
const HEALTH_DATA_TYPES = {
  HEART_RATE: "com.huawei.instantaneous.heart_rate",
  HEART_RATE_STATISTICS: "com.huawei.continuous.heart_rate.statistics",
  RESTING_HEART_RATE: "com.huawei.instantaneous.resting_heart_rate",
  SLEEP: "com.huawei.continuous.sleep.segment",
  SLEEP_STATISTICS: "com.huawei.continuous.sleep.statistics",
  STRESS: "com.huawei.instantaneous.stress",
  SPO2: "com.huawei.instantaneous.spo2",
  ECG: "com.huawei.continuous.ecg_record",
  BLOOD_PRESSURE: "com.huawei.instantaneous.blood_pressure",
  BLOOD_GLUCOSE: "com.huawei.instantaneous.blood_glucose",
  BODY_WEIGHT: "com.huawei.instantaneous.body_weight",
  BODY_HEIGHT: "com.huawei.instantaneous.height",
  BODY_TEMPERATURE: "com.huawei.instantaneous.body.temperature",
  NUTRITION_RECORD: "com.huawei.health.record.nutrition_record",
  MENSTRUAL_FLOW: "com.huawei.continuous.menstrual_flow",
  DYSMENORRHOEA: "com.huawei.dysmenorrhoea",
  PHYSICAL_SYMPTOMS: "com.huawei.physical_symptoms",
  VO2MAX: "com.huawei.vo2max",
  HRV: "com.huawei.instantaneous.heart_rate_variability",
  EMOTION: "com.huawei.emotion",
};

export interface PolymerizeResult {
  steps: number;
  distance: number; // meters
  calories: number;
  activeMinutes: number;
}

export interface ActivityRecord {
  id: string;
  activityType: number;
  startTime: Date;
  endTime: Date;
  duration: number; // minutes
  distance?: number; // meters
  calories?: number;
  avgHeartRate?: number;
}

export class HuaweiHealthApi {
  private auth: HuaweiAuth;
  private userUuid: string | null = null;

  constructor(auth: HuaweiAuth = defaultAuth, userUuid?: string) {
    this.auth = auth;
    this.userUuid = userUuid || null;
  }

  /**
   * Get access token - handles both single-user and multi-user modes
   */
  private async getAccessToken(): Promise<string> {
    if (this.userUuid) {
      // Multi-user mode: get token from SQLite
      return this.auth.ensureValidTokenForUser(this.userUuid, getUserStore());
    }
    // Single-user mode: get token from file
    return this.auth.ensureValidToken();
  }

  /**
   * Get polymerized (aggregated) health data for a specific date
   */
  async getPolymerizeData(date: string): Promise<PolymerizeResult> {
    // Check memory cache first (include userUuid to isolate per-user cache)
    const cacheKey = "polymerize";
    const cacheParams = { date, userUuid: this.userUuid || "default" };
    const cached = getFromMemoryCache<PolymerizeResult>(cacheKey, cacheParams);
    if (cached) {
      return cached;
    }

    const accessToken = await this.getAccessToken();

    // Calculate start and end of day in local timezone
    const startDate = new Date(`${date}T00:00:00`);
    const endDate = new Date(`${date}T23:59:59.999`);
    const startTime = startDate.getTime();
    const endTime = endDate.getTime();

    // Get timezone
    const timeZoneId = Intl.DateTimeFormat().resolvedOptions().timeZone;

    // Fetch all data types in parallel
    const dataTypes = [
      HuaweiDataType.STEPS,
      HuaweiDataType.DISTANCE,
      HuaweiDataType.CALORIES,
      HuaweiDataType.ACTIVE_MINUTES,
    ];

    // Fetch polymerize data and dailyActivitySummary in parallel.
    // dailyActivitySummary provides the official deduplicated daily totals for steps,
    // which avoids double-counting from multiple sources (phone + watch).
    const [polymerizeResults, summaryResult] = await Promise.all([
      Promise.all(
        dataTypes.map((dataType) =>
          this.fetchPolymerizeData(accessToken, dataType, startTime, endTime, timeZoneId)
        )
      ),
      this.getDailyActivitySummary(date).catch((e) => {
        log.warn("Failed to get dailyActivitySummary", e);
        return null;
      }),
    ]);

    // Aggregate results from polymerize
    const aggregated: PolymerizeResult = {
      steps: 0,
      distance: 0,
      calories: 0,
      activeMinutes: 0,
    };

    polymerizeResults.forEach((result, index) => {
      const dataType = dataTypes[index];
      const data = result?.data || [];
      const totalValue = data.reduce((sum, item) => sum + (item?.value || 0), 0);

      switch (dataType) {
        case HuaweiDataType.STEPS:
          aggregated.steps = Math.round(totalValue);
          break;
        case HuaweiDataType.DISTANCE:
          aggregated.distance = Math.round(totalValue);
          break;
        case HuaweiDataType.CALORIES:
          aggregated.calories = Math.round(totalValue);
          break;
        case HuaweiDataType.ACTIVE_MINUTES:
          aggregated.activeMinutes = Math.round(totalValue);
          break;
        default:
          break;
      }
    });

    // dailyActivitySummary is the authoritative source for steps (deduplicated total).
    // Always prefer it over polymerize delta sum when available.
    if (summaryResult) {
      if (summaryResult.steps > 0) aggregated.steps = summaryResult.steps;
      if (summaryResult.calories > 0) aggregated.calories = summaryResult.calories;
      if (summaryResult.activeMinutes > 0) aggregated.activeMinutes = summaryResult.activeMinutes;
      if (summaryResult.distance > 0) aggregated.distance = summaryResult.distance;
    }

    // Fallback: compute active minutes from activity records (workouts)
    if (aggregated.activeMinutes === 0) {
      try {
        const records = await this.getActivityRecords(date, date);
        if (records.length > 0) {
          aggregated.activeMinutes = records.reduce((sum, r) => sum + (r.duration || 0), 0);
        }
      } catch (e) {
        log.warn("Failed to get activity records for activeMinutes fallback", e);
      }
    }

    // Save to cache
    saveToMemoryCache(cacheKey, cacheParams, aggregated);
    saveToFileCache(cacheKey, cacheParams, aggregated);

    return aggregated;
  }

  /**
   * Get daily activity summary (calories, active minutes, etc.)
   */
  async getDailyActivitySummary(date: string): Promise<{
    calories: number;
    activeMinutes: number;
    steps: number;
    distance: number;
  }> {
    const accessToken = await this.getAccessToken();
    // API requires timeZone in +/-HHMM format (e.g. "+0800")
    const offsetMin = -new Date().getTimezoneOffset();
    const sign = offsetMin >= 0 ? "+" : "-";
    const hh = String(Math.floor(Math.abs(offsetMin) / 60)).padStart(2, "0");
    const mm = String(Math.abs(offsetMin) % 60).padStart(2, "0");
    const timeZone = `${sign}${hh}${mm}`;

    // API requires date in YYYYMMDD format (no dashes)
    const dayStr = date.replace(/-/g, "");

    const config = loadConfig();
    const clientId = config.dataSources.huawei?.clientId || "";

    const url = `${getApiBaseUrl()}/healthkit/v2/sampleSet:dailyActivitySummary`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "x-client-id": clientId,
      },
      body: JSON.stringify({
        startDay: dayStr,
        endDay: dayStr,
        timeZone,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      log.warn("dailyActivitySummary failed", { status: response.status, body: errBody });
      return { calories: 0, activeMinutes: 0, steps: 0, distance: 0 };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = (await response.json()) as any;

    // Parse the value array from dailyActivitySummary response
    const summary = json.dailyActivitySummary?.[0];
    if (!summary?.value) {
      return { calories: 0, activeMinutes: 0, steps: 0, distance: 0 };
    }

    // Extract fields from value array: [{fieldName: "steps", integerValue: 6000}, ...]
    const fields: Record<string, number> = {};
    for (const v of summary.value) {
      if (v.fieldName && (v.integerValue !== undefined || v.floatValue !== undefined)) {
        fields[v.fieldName] = v.integerValue ?? v.floatValue ?? 0;
      }
    }

    // activeHours is in hours — convert to minutes for consistency with our data model
    const activeHours = fields.activeHours || 0;
    return {
      calories: fields.activeCalories || 0,
      activeMinutes: activeHours * 60,
      steps: fields.steps || 0,
      distance: 0,
    };
  }

  /**
   * Get activity records (workouts) for a date range
   */
  async getActivityRecords(startDate: string, endDate: string): Promise<ActivityRecord[]> {
    const accessToken = await this.getAccessToken();

    const startTime = new Date(`${startDate}T00:00:00`).getTime();
    const endTime = new Date(`${endDate}T23:59:59.999`).getTime();

    const params = new URLSearchParams({
      startTime: startTime.toString(),
      endTime: endTime.toString(),
    });
    const config = loadConfig();
    const clientId = config.dataSources.huawei?.clientId || "";
    const url = `${getApiBaseUrl()}/healthkit/v2/activityRecords?${params}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "x-client-id": clientId,
      },
    });

    if (!response.ok) {
      await this.handleError(response);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = (await response.json()) as any;
    const records = json.data || json.activityRecord || json.activityRecords || [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return records.map((record: any) => ({
      id: record.activityId || `activity-${record.startTime}`,
      activityType: record.activityType,
      startTime: new Date(record.startTime),
      endTime: new Date(record.endTime),
      duration: Math.round((record.endTime - record.startTime) / (60 * 1000)),
      distance: record.distance,
      calories: record.calories,
      avgHeartRate: record.avgHeartRate,
    }));
  }

  /**
   * Get heart rate data using polymerize API
   */
  async getHeartRateData(date: string): Promise<{
    readings: Array<{ time: string; value: number }>;
    avg: number;
    max: number;
    min: number;
  }> {
    // Check memory cache first (include userUuid to isolate per-user cache)
    const cacheKey = "heartRate";
    const cacheParams = { date, userUuid: this.userUuid || "default" };
    const cached = getFromMemoryCache<{
      readings: Array<{ time: string; value: number }>;
      avg: number;
      max: number;
      min: number;
    }>(cacheKey, cacheParams);
    if (cached) {
      return cached;
    }

    const accessToken = await this.getAccessToken();

    const startTime = new Date(`${date}T00:00:00`).getTime();
    const endTime = new Date(`${date}T23:59:59.999`).getTime();

    const config = loadConfig();
    const clientId = config.dataSources.huawei?.clientId || "";

    const url = `${getApiBaseUrl()}/healthkit/v2/sampleSet:polymerize`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "x-client-id": clientId,
      },
      body: JSON.stringify({
        polymerizeWith: [{ dataTypeName: HEALTH_DATA_TYPES.HEART_RATE }],
        startTime,
        endTime,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      log.warn("Heart rate polymerize failed", { status: response.status, errorText });
      return { readings: [], avg: 0, max: 0, min: 0 };
    }

    const json = await response.json();
    const result = parseHeartRateResponse(json);

    // Save to cache
    saveToMemoryCache(cacheKey, cacheParams, result);
    saveToFileCache(cacheKey, { ...cacheParams, rawResponse: json }, result);

    return result;
  }

  /**
   * Get resting heart rate data
   */
  async getRestingHeartRateData(date: string): Promise<number | null> {
    const cacheKey = "restingHeartRate";
    const cacheParams = { date, userUuid: this.userUuid || "default" };
    const cached = getFromMemoryCache<number>(cacheKey, cacheParams);
    if (cached !== undefined) {
      return cached;
    }

    const accessToken = await this.getAccessToken();
    const startTime = new Date(`${date}T00:00:00`).getTime();
    const endTime = new Date(`${date}T23:59:59.999`).getTime();

    const config = loadConfig();
    const clientId = config.dataSources.huawei?.clientId || "";
    const url = `${getApiBaseUrl()}/healthkit/v2/sampleSet:polymerize`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "x-client-id": clientId,
      },
      body: JSON.stringify({
        polymerizeWith: [{ dataTypeName: HEALTH_DATA_TYPES.RESTING_HEART_RATE }],
        startTime,
        endTime,
      }),
    });

    if (!response.ok) {
      log.warn("Resting heart rate failed", { status: response.status });
      return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = (await response.json()) as any;
    saveToFileCache(cacheKey, { ...cacheParams, rawResponse: json }, null);

    // Extract the latest resting heart rate value
    const groups = json.group || [];
    let latestValue: number | null = null;

    for (const group of groups) {
      for (const sampleSet of group.sampleSet || []) {
        for (const point of sampleSet.samplePoints || []) {
          const fieldValue = point.value?.[0];
          const value = Math.round(fieldValue?.floatValue ?? fieldValue?.integerValue ?? 0);
          if (value > 0) {
            latestValue = value;
          }
        }
      }
    }

    if (latestValue !== null) {
      saveToMemoryCache(cacheKey, cacheParams, latestValue);
    }
    return latestValue;
  }

  /**
   * Get stress data using polymerize API
   */
  async getStressData(date: string): Promise<{
    readings: Array<{ time: string; value: number }>;
    current: number;
    avg: number;
    max: number;
    min: number;
  } | null> {
    const cacheKey = "stress";
    const cacheParams = { date, userUuid: this.userUuid || "default" };
    const cached = getFromMemoryCache<{
      readings: Array<{ time: string; value: number }>;
      current: number;
      avg: number;
      max: number;
      min: number;
    }>(cacheKey, cacheParams);
    if (cached) {
      return cached;
    }

    const accessToken = await this.getAccessToken();
    const startTime = new Date(`${date}T00:00:00`).getTime();
    const endTime = new Date(`${date}T23:59:59.999`).getTime();

    const config = loadConfig();
    const clientId = config.dataSources.huawei?.clientId || "";
    const url = `${getApiBaseUrl()}/healthkit/v2/sampleSet:polymerize`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "x-client-id": clientId,
      },
      body: JSON.stringify({
        polymerizeWith: [{ dataTypeName: HEALTH_DATA_TYPES.STRESS }],
        startTime,
        endTime,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      log.warn("Stress data failed", { status: response.status, errorText });
      // 403 = Huawei API limitation, re-auth won't fix
      saveToFileCache(cacheKey, cacheParams, null, errorText);
      return null;
    }

    const json = await response.json();
    const result = parseStressResponse(json);

    if (!result) {
      saveToFileCache(cacheKey, { ...cacheParams, rawResponse: json }, null);
      return null;
    }

    saveToMemoryCache(cacheKey, cacheParams, result);
    saveToFileCache(cacheKey, { ...cacheParams, rawResponse: json }, result);
    return result;
  }

  /**
   * Get SpO2 (blood oxygen) data using polymerize API
   */
  async getSpO2Data(date: string): Promise<{
    readings: Array<{ time: string; value: number }>;
    current: number;
    avg: number;
    max: number;
    min: number;
  } | null> {
    const cacheKey = "spo2";
    const cacheParams = { date, userUuid: this.userUuid || "default" };
    const cached = getFromMemoryCache<{
      readings: Array<{ time: string; value: number }>;
      current: number;
      avg: number;
      max: number;
      min: number;
    }>(cacheKey, cacheParams);
    if (cached) {
      return cached;
    }

    const accessToken = await this.getAccessToken();
    const startTime = new Date(`${date}T00:00:00`).getTime();
    const endTime = new Date(`${date}T23:59:59.999`).getTime();

    const config = loadConfig();
    const clientId = config.dataSources.huawei?.clientId || "";
    const url = `${getApiBaseUrl()}/healthkit/v2/sampleSet:polymerize`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "x-client-id": clientId,
      },
      body: JSON.stringify({
        polymerizeWith: [{ dataTypeName: HEALTH_DATA_TYPES.SPO2 }],
        startTime,
        endTime,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      log.warn("SpO2 data failed", { status: response.status, errorText });
      // 403 = Huawei API limitation, re-auth won't fix
      saveToFileCache(cacheKey, cacheParams, null, errorText);
      return null;
    }

    const json = await response.json();
    const result = parseSpO2Response(json);

    if (!result) {
      saveToFileCache(cacheKey, { ...cacheParams, rawResponse: json }, null);
      return null;
    }

    saveToMemoryCache(cacheKey, cacheParams, result);
    saveToFileCache(cacheKey, { ...cacheParams, rawResponse: json }, result);
    return result;
  }

  /**
   * Get ECG (electrocardiogram) data using healthRecords API
   * Returns arrhythmia detection and heart rate from ECG readings
   * Note: Requires ecg.read permission
   */
  async getECGData(date: string): Promise<{
    records: Array<{
      time: string;
      avgHeartRate: number;
      arrhythmiaType: number; // 1=normal, 2=sinus arrhythmia, 3=AF, etc.
      arrhythmiaLabel: string;
      ecgType: number; // 1=single-lead
    }>;
    latestHeartRate: number | null;
    hasArrhythmia: boolean;
  } | null> {
    const cacheKey = "ecg";
    const cacheParams = { date, userUuid: this.userUuid || "default" };
    const cached = getFromMemoryCache<{
      records: Array<{
        time: string;
        avgHeartRate: number;
        arrhythmiaType: number;
        arrhythmiaLabel: string;
        ecgType: number;
      }>;
      latestHeartRate: number | null;
      hasArrhythmia: boolean;
    }>(cacheKey, cacheParams);
    if (cached) {
      return cached;
    }

    const accessToken = await this.getAccessToken();

    // Query a wider range to get recent ECG data (ECG measurements are infrequent)
    const queryDate = new Date(date);
    const startDate = new Date(queryDate);
    startDate.setDate(startDate.getDate() - 30); // 30 days back for ECG
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(queryDate);
    endDate.setHours(23, 59, 59, 999);

    // Timestamps in nanoseconds
    const startTime = startDate.getTime() * 1000000;
    const endTime = endDate.getTime() * 1000000;

    const config = loadConfig();
    const clientId = config.dataSources.huawei?.clientId || "";

    const params = new URLSearchParams({
      startTime: startTime.toString(),
      endTime: endTime.toString(),
      dataType: HEALTH_DATA_TYPES.ECG,
    });

    const url = `${getApiBaseUrl()}/healthkit/v2/healthRecords?${params}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "x-client-id": clientId,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      log.warn("ECG healthRecords failed", { status: response.status, errorText });
      // 403 = Huawei API limitation, re-auth won't fix
      saveToFileCache(cacheKey, cacheParams, null, errorText);
      return null;
    }

    const json = await response.json();
    saveToFileCache(cacheKey, { ...cacheParams, rawResponse: json }, null);

    const result = parseECGResponse(json);
    if (!result) return null;

    saveToMemoryCache(cacheKey, cacheParams, result);
    return result;
  }

  /**
   * Get sleep data using healthRecords API
   * Note: Requires sleep.read permission
   */
  async getSleepData(date: string): Promise<{
    segments: Array<{
      startTime: number;
      endTime: number;
      sleepType: number; // 1=awake, 2=light, 3=deep, 4=REM, 5=nap
    }>;
    totalMinutes: number;
    bedTime: string;
    wakeTime: string;
    sleepScore?: number;
    deepSleepMinutes?: number;
    lightSleepMinutes?: number;
    remMinutes?: number;
    awakeMinutes?: number;
  } | null> {
    const accessToken = await this.getAccessToken();

    // Sleep data is for the night ending on this date
    // Query a wider range (7 days) to ensure we get recent sleep data
    const queryDate = new Date(date);

    const startDate = new Date(queryDate);
    startDate.setDate(startDate.getDate() - 7);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(queryDate);
    endDate.setHours(23, 59, 59, 999);

    // Timestamps in nanoseconds (19 digits)
    const startTime = startDate.getTime() * 1000000;
    const endTime = endDate.getTime() * 1000000;

    const config = loadConfig();
    const clientId = config.dataSources.huawei?.clientId || "";

    // Use healthRecords endpoint with GET request
    const params = new URLSearchParams({
      startTime: startTime.toString(),
      endTime: endTime.toString(),
      dataType: "com.huawei.health.record.sleep",
      subDataType: "com.huawei.continuous.sleep.fragment",
    });

    const url = `${getApiBaseUrl()}/healthkit/v2/healthRecords?${params}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "x-client-id": clientId,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      log.warn("Sleep healthRecords failed", { status: response.status, errorText });
      saveToFileCache("sleep-error", { date, startTime, endTime }, null, errorText);
      return null;
    }

    const json = await response.json();
    saveToFileCache("sleep-success", { date }, json);

    return parseSleepResponse(json, date);
  }

  /**
   * Get weekly sleep data using healthRecords API
   * Returns sleep duration for each day in the past 7 days
   */
  async getWeeklySleepData(
    endDate: string
  ): Promise<Array<{ date: string; hours: number; sleepScore?: number }>> {
    const accessToken = await this.getAccessToken();

    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const start = new Date(end);
    start.setDate(start.getDate() - 7);
    start.setHours(0, 0, 0, 0);

    // Timestamps in nanoseconds
    const startTime = start.getTime() * 1000000;
    const endTime = end.getTime() * 1000000;

    const config = loadConfig();
    const clientId = config.dataSources.huawei?.clientId || "";

    const params = new URLSearchParams({
      startTime: startTime.toString(),
      endTime: endTime.toString(),
      dataType: "com.huawei.health.record.sleep",
    });

    const url = `${getApiBaseUrl()}/healthkit/v2/healthRecords?${params}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "x-client-id": clientId,
      },
    });

    if (!response.ok) {
      log.warn("Weekly sleep healthRecords failed", { status: response.status });
      return [];
    }

    const json = await response.json();
    return parseWeeklySleepResponse(json, endDate);
  }

  /**
   * Get blood pressure data using polymerize API
   */
  async getBloodPressureData(
    date: string,
    lookbackDays = 0
  ): Promise<{
    readings: Array<{ time: string; systolic: number; diastolic: number; pulse?: number }>;
    latestSystolic: number;
    latestDiastolic: number;
    avgSystolic: number;
    avgDiastolic: number;
  } | null> {
    const cacheKey = "bloodPressure";
    const cacheParams = { date, lookbackDays, userUuid: this.userUuid || "default" };
    const cached = getFromMemoryCache<{
      readings: Array<{ time: string; systolic: number; diastolic: number; pulse?: number }>;
      latestSystolic: number;
      latestDiastolic: number;
      avgSystolic: number;
      avgDiastolic: number;
    }>(cacheKey, cacheParams);
    if (cached) return cached;

    const accessToken = await this.getAccessToken();
    const endTime = new Date(`${date}T23:59:59.999`).getTime();
    const startDate = new Date(`${date}T00:00:00`);
    if (lookbackDays > 0) startDate.setDate(startDate.getDate() - lookbackDays);
    const startTime = startDate.getTime();

    const config = loadConfig();
    const clientId = config.dataSources.huawei?.clientId || "";
    const url = `${getApiBaseUrl()}/healthkit/v2/sampleSet:polymerize`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "x-client-id": clientId,
      },
      body: JSON.stringify({
        polymerizeWith: [{ dataTypeName: HEALTH_DATA_TYPES.BLOOD_PRESSURE }],
        startTime,
        endTime,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      log.warn("Blood pressure data failed", { status: response.status, errorText });
      // 403 = Huawei API limitation, re-auth won't fix
      saveToFileCache(cacheKey, cacheParams, null, errorText);
      return null;
    }

    const json = await response.json();
    const result = parseBloodPressureResponse(json);

    if (!result) {
      saveToFileCache(cacheKey, { ...cacheParams, rawResponse: json }, null);
      return null;
    }

    saveToMemoryCache(cacheKey, cacheParams, result);
    saveToFileCache(cacheKey, { ...cacheParams, rawResponse: json }, result);
    return result;
  }

  /**
   * Get blood glucose data using polymerize API
   */
  async getBloodGlucoseData(date: string): Promise<{
    readings: Array<{ time: string; value: number }>;
    latest: number;
    avg: number;
    max: number;
    min: number;
  } | null> {
    const cacheKey = "bloodGlucose";
    const cacheParams = { date, userUuid: this.userUuid || "default" };
    const cached = getFromMemoryCache<{
      readings: Array<{ time: string; value: number }>;
      latest: number;
      avg: number;
      max: number;
      min: number;
    }>(cacheKey, cacheParams);
    if (cached) return cached;

    const accessToken = await this.getAccessToken();
    const startTime = new Date(`${date}T00:00:00`).getTime();
    const endTime = new Date(`${date}T23:59:59.999`).getTime();

    const config = loadConfig();
    const clientId = config.dataSources.huawei?.clientId || "";
    const url = `${getApiBaseUrl()}/healthkit/v2/sampleSet:polymerize`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "x-client-id": clientId,
      },
      body: JSON.stringify({
        polymerizeWith: [{ dataTypeName: HEALTH_DATA_TYPES.BLOOD_GLUCOSE }],
        startTime,
        endTime,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      log.warn("Blood glucose data failed", { status: response.status, errorText });
      // 403 = Huawei API limitation, re-auth won't fix
      saveToFileCache(cacheKey, cacheParams, null, errorText);
      return null;
    }

    const json = await response.json();
    const result = parseBloodGlucoseResponse(json);

    if (!result) {
      saveToFileCache(cacheKey, { ...cacheParams, rawResponse: json }, null);
      return null;
    }

    saveToMemoryCache(cacheKey, cacheParams, result);
    saveToFileCache(cacheKey, { ...cacheParams, rawResponse: json }, result);
    return result;
  }

  /**
   * Get body composition data (weight, height, BMI, body fat rate)
   * Uses 30-day lookback to find latest measurements.
   * Per Huawei docs: body_weight contains fields: body_weight, bmi, body_fat_rate, etc.
   * Height is a separate dataType (com.huawei.instantaneous.height) returning meters.
   */
  async getBodyCompositionData(date: string): Promise<{
    weight?: number;
    height?: number;
    bmi?: number;
    bodyFatRate?: number;
    latestWeightDate?: string;
  } | null> {
    const cacheKey = "bodyComposition";
    const cacheParams = { date, userUuid: this.userUuid || "default" };
    const cached = getFromMemoryCache<{
      weight?: number;
      height?: number;
      bmi?: number;
      bodyFatRate?: number;
      latestWeightDate?: string;
    }>(cacheKey, cacheParams);
    if (cached) return cached;

    const accessToken = await this.getAccessToken();

    // 30-day lookback for body measurements
    const endDate = new Date(`${date}T23:59:59.999`);
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 30);
    const startTime = startDate.getTime();
    const endTime = endDate.getTime();

    const config = loadConfig();
    const clientId = config.dataSources.huawei?.clientId || "";
    const url = `${getApiBaseUrl()}/healthkit/v2/sampleSet:polymerize`;

    // Fetch weight (includes bmi + body_fat_rate fields) and height in parallel
    const [weightRes, heightRes] = await Promise.all(
      [HEALTH_DATA_TYPES.BODY_WEIGHT, HEALTH_DATA_TYPES.BODY_HEIGHT].map((dataTypeName) =>
        fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "x-client-id": clientId,
          },
          body: JSON.stringify({
            polymerizeWith: [{ dataTypeName }],
            startTime,
            endTime,
          }),
        }).catch(() => null)
      )
    );

    // Parse weight and height responses using extracted parsers
    const parseWeightRes = async (
      res: Response | null
    ): Promise<ReturnType<typeof parseBodyCompositionWeightResponse>> => {
      if (!res || !res.ok) return null;
      const json = await res.json();
      return parseBodyCompositionWeightResponse(json);
    };
    const parseHeightRes = async (res: Response | null): Promise<number | null> => {
      if (!res || !res.ok) return null;
      const json = await res.json();
      return parseBodyCompositionHeightResponse(json);
    };

    const [weightData, heightCm] = await Promise.all([
      parseWeightRes(weightRes),
      parseHeightRes(heightRes),
    ]);

    if (!weightData && !heightCm) {
      return null;
    }

    const result: {
      weight?: number;
      height?: number;
      bmi?: number;
      bodyFatRate?: number;
      latestWeightDate?: string;
    } = {};

    if (weightData) {
      result.weight = weightData.weight;
      result.bmi = weightData.bmi;
      result.bodyFatRate = weightData.bodyFatRate;
      result.latestWeightDate = weightData.date;
    }
    if (heightCm) {
      result.height = heightCm;
    }
    // Compute BMI if not already present from API
    if (!result.bmi && result.weight && result.height && result.height > 0) {
      const heightM = result.height / 100;
      result.bmi = Math.round((result.weight / (heightM * heightM)) * 10) / 10;
    }

    saveToMemoryCache(cacheKey, cacheParams, result);
    saveToFileCache(cacheKey, cacheParams, result);
    return result;
  }

  /**
   * Get body temperature data using polymerize API
   */
  async getBodyTemperatureData(date: string): Promise<{
    readings: Array<{ time: string; value: number }>;
    latest: number;
    avg: number;
    max: number;
    min: number;
  } | null> {
    const cacheKey = "bodyTemperature";
    const cacheParams = { date, userUuid: this.userUuid || "default" };
    const cached = getFromMemoryCache<{
      readings: Array<{ time: string; value: number }>;
      latest: number;
      avg: number;
      max: number;
      min: number;
    }>(cacheKey, cacheParams);
    if (cached) return cached;

    const accessToken = await this.getAccessToken();
    const startTime = new Date(`${date}T00:00:00`).getTime();
    const endTime = new Date(`${date}T23:59:59.999`).getTime();

    const config = loadConfig();
    const clientId = config.dataSources.huawei?.clientId || "";
    const url = `${getApiBaseUrl()}/healthkit/v2/sampleSet:polymerize`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "x-client-id": clientId,
      },
      body: JSON.stringify({
        polymerizeWith: [{ dataTypeName: HEALTH_DATA_TYPES.BODY_TEMPERATURE }],
        startTime,
        endTime,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      log.warn("Body temperature data failed", { status: response.status, errorText });
      // 403 = Huawei API limitation, re-auth won't fix
      saveToFileCache(cacheKey, cacheParams, null, errorText);
      return null;
    }

    const json = await response.json();
    const result = parseBodyTemperatureResponse(json);

    if (!result) {
      saveToFileCache(cacheKey, { ...cacheParams, rawResponse: json }, null);
      return null;
    }

    saveToMemoryCache(cacheKey, cacheParams, result);
    saveToFileCache(cacheKey, { ...cacheParams, rawResponse: json }, result);
    return result;
  }

  /**
   * Get nutrition data using healthRecords API
   * Per Huawei docs: nutrition uses healthRecords endpoint with
   * dataType = "com.huawei.health.record.nutrition_record"
   * Fields: dietaryEnergy, meal, foodName, fat, protein, carbohydrates, mealRecordTime
   */
  async getNutritionData(date: string): Promise<{
    totalCalories: number;
    protein?: number;
    fat?: number;
    carbs?: number;
    water?: number;
    meals: Array<{ time: string; calories: number }>;
  } | null> {
    const cacheKey = "nutrition";
    const cacheParams = { date, userUuid: this.userUuid || "default" };
    const cached = getFromMemoryCache<{
      totalCalories: number;
      protein?: number;
      fat?: number;
      carbs?: number;
      water?: number;
      meals: Array<{ time: string; calories: number }>;
    }>(cacheKey, cacheParams);
    if (cached) return cached;

    const accessToken = await this.getAccessToken();

    // Timestamps in nanoseconds for healthRecords endpoint
    const startTime = new Date(`${date}T00:00:00`).getTime() * 1000000;
    const endTime = new Date(`${date}T23:59:59.999`).getTime() * 1000000;

    const config = loadConfig();
    const clientId = config.dataSources.huawei?.clientId || "";

    const params = new URLSearchParams({
      startTime: startTime.toString(),
      endTime: endTime.toString(),
      dataType: HEALTH_DATA_TYPES.NUTRITION_RECORD,
    });

    const url = `${getApiBaseUrl()}/healthkit/v2/healthRecords?${params}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "x-client-id": clientId,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      log.warn("Nutrition data failed", { status: response.status, errorText });
      saveToFileCache(cacheKey, cacheParams, null, errorText);
      return null;
    }

    const json = await response.json();
    const result = parseNutritionResponse(json);

    if (!result) {
      saveToFileCache(cacheKey, { ...cacheParams, rawResponse: json }, null);
      return null;
    }

    saveToMemoryCache(cacheKey, cacheParams, result);
    saveToFileCache(cacheKey, { ...cacheParams, rawResponse: json }, result);
    return result;
  }

  /**
   * Get menstrual cycle data using polymerize API
   * Per Huawei docs, reproductive data spans multiple dataTypes:
   * - com.huawei.continuous.menstrual_flow (volume: 1-4)
   * - com.huawei.dysmenorrhoea (level: 1-3)
   * - com.huawei.physical_symptoms (physicalSymptoms)
   */
  async getMenstrualCycleData(date: string): Promise<{
    cycleDay?: number;
    phase?: "menstrual" | "follicular" | "ovulatory" | "luteal";
    periodStartDate?: string;
    cycleLength?: number;
    records: Array<{ date: string; status: string }>;
  } | null> {
    const cacheKey = "menstrualCycle";
    const cacheParams = { date, userUuid: this.userUuid || "default" };
    const cached = getFromMemoryCache<{
      cycleDay?: number;
      phase?: "menstrual" | "follicular" | "ovulatory" | "luteal";
      periodStartDate?: string;
      cycleLength?: number;
      records: Array<{ date: string; status: string }>;
    }>(cacheKey, cacheParams);
    if (cached) return cached;

    const accessToken = await this.getAccessToken();

    // Look back 45 days to capture full cycle
    const endDate = new Date(`${date}T23:59:59.999`);
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 45);
    const startTime = startDate.getTime();
    const endTime = endDate.getTime();

    const config = loadConfig();
    const clientId = config.dataSources.huawei?.clientId || "";
    const url = `${getApiBaseUrl()}/healthkit/v2/sampleSet:polymerize`;

    // Query menstrual_flow (primary indicator of period days)
    // Also try dysmenorrhoea and physical_symptoms for richer data
    const menstrualTypes = [
      HEALTH_DATA_TYPES.MENSTRUAL_FLOW,
      HEALTH_DATA_TYPES.DYSMENORRHOEA,
      HEALTH_DATA_TYPES.PHYSICAL_SYMPTOMS,
    ];

    const responses = await Promise.all(
      menstrualTypes.map((dataTypeName) =>
        fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "x-client-id": clientId,
          },
          body: JSON.stringify({
            polymerizeWith: [{ dataTypeName }],
            startTime,
            endTime,
          }),
        }).catch(() => null)
      )
    );

    // Parse menstrual_flow response
    let records: Array<{ date: string; status: string }> = [];
    const flowRes = responses[0];
    if (flowRes && flowRes.ok) {
      const flowJson = await flowRes.json();
      records = parseMenstrualFlowResponse(flowJson, date);
    }

    const result = deriveMenstrualCycleInfo(records, date);

    if (!result) {
      saveToFileCache(cacheKey, cacheParams, null);
      return null;
    }

    saveToMemoryCache(cacheKey, cacheParams, result);
    saveToFileCache(cacheKey, cacheParams, result);
    return result;
  }

  /**
   * Get VO2Max data using polymerize API
   */
  async getVO2MaxData(date: string): Promise<{
    value: number;
    level: "low" | "fair" | "good" | "excellent" | "superior";
  } | null> {
    const cacheKey = "vo2max";
    const cacheParams = { date, userUuid: this.userUuid || "default" };
    const cached = getFromMemoryCache<{
      value: number;
      level: "low" | "fair" | "good" | "excellent" | "superior";
    }>(cacheKey, cacheParams);
    if (cached) return cached;

    const accessToken = await this.getAccessToken();

    // Use 30-day lookback since VO2Max is not measured daily
    const endDate = new Date(`${date}T23:59:59.999`);
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 30);
    const startTime = startDate.getTime();
    const endTime = endDate.getTime();

    const config = loadConfig();
    const clientId = config.dataSources.huawei?.clientId || "";
    const url = `${getApiBaseUrl()}/healthkit/v2/sampleSet:polymerize`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "x-client-id": clientId,
      },
      body: JSON.stringify({
        polymerizeWith: [{ dataTypeName: HEALTH_DATA_TYPES.VO2MAX }],
        startTime,
        endTime,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      log.warn("VO2Max data failed", { status: response.status, errorText });
      // 403 = Huawei API limitation, re-auth won't fix
      saveToFileCache(cacheKey, cacheParams, null, errorText);
      return null;
    }

    const json = await response.json();
    const result = parseVO2MaxResponse(json);

    if (!result) {
      saveToFileCache(cacheKey, { ...cacheParams, rawResponse: json }, null);
      return null;
    }

    saveToMemoryCache(cacheKey, cacheParams, result);
    saveToFileCache(cacheKey, { ...cacheParams, rawResponse: json }, result);
    return result;
  }

  /**
   * Get HRV (heart rate variability) data
   * Uses heart_rate_variability or falls back to heart_rate.statistics
   */
  async getHRVData(date: string): Promise<{
    rmssd: number;
    avg: number;
    max: number;
    min: number;
    readings: Array<{ time: string; value: number }>;
  } | null> {
    const cacheKey = "hrv";
    const cacheParams = { date, userUuid: this.userUuid || "default" };
    const cached = getFromMemoryCache<{
      rmssd: number;
      avg: number;
      max: number;
      min: number;
      readings: Array<{ time: string; value: number }>;
    }>(cacheKey, cacheParams);
    if (cached) return cached;

    const accessToken = await this.getAccessToken();
    const startTime = new Date(`${date}T00:00:00`).getTime();
    const endTime = new Date(`${date}T23:59:59.999`).getTime();

    const config = loadConfig();
    const clientId = config.dataSources.huawei?.clientId || "";
    const url = `${getApiBaseUrl()}/healthkit/v2/sampleSet:polymerize`;

    // Try dedicated HRV data type first, then fall back to heart_rate.statistics
    const dataTypeNames = [HEALTH_DATA_TYPES.HRV, HEALTH_DATA_TYPES.HEART_RATE_STATISTICS];

    for (const dataTypeName of dataTypeNames) {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "x-client-id": clientId,
        },
        body: JSON.stringify({
          polymerizeWith: [{ dataTypeName }],
          startTime,
          endTime,
        }),
      });

      if (!response.ok) continue;

      const json = await response.json();
      const result = parseHRVResponse(json);

      if (!result) continue;

      saveToMemoryCache(cacheKey, cacheParams, result);
      saveToFileCache(cacheKey, { ...cacheParams, dataTypeName, rawResponse: json }, result);
      return result;
    }

    saveToFileCache(cacheKey, cacheParams, null);
    return null;
  }

  /**
   * Get emotion data using polymerize API
   * Note: May not be available on all devices/regions
   */
  async getEmotionData(date: string): Promise<{
    current: string;
    score: number;
    readings: Array<{ time: string; emotion: string; score: number }>;
  } | null> {
    const cacheKey = "emotion";
    const cacheParams = { date, userUuid: this.userUuid || "default" };
    const cached = getFromMemoryCache<{
      current: string;
      score: number;
      readings: Array<{ time: string; emotion: string; score: number }>;
    }>(cacheKey, cacheParams);
    if (cached) return cached;

    const accessToken = await this.getAccessToken();
    const startTime = new Date(`${date}T00:00:00`).getTime();
    const endTime = new Date(`${date}T23:59:59.999`).getTime();

    const config = loadConfig();
    const clientId = config.dataSources.huawei?.clientId || "";
    const url = `${getApiBaseUrl()}/healthkit/v2/sampleSet:polymerize`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "x-client-id": clientId,
      },
      body: JSON.stringify({
        polymerizeWith: [{ dataTypeName: HEALTH_DATA_TYPES.EMOTION }],
        startTime,
        endTime,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      log.warn("Emotion data failed", { status: response.status, errorText });
      // 403 = Huawei API limitation, re-auth won't fix
      saveToFileCache(cacheKey, cacheParams, null, errorText);
      return null;
    }

    const json = await response.json();
    const result = parseEmotionResponse(json);

    if (!result) {
      saveToFileCache(cacheKey, { ...cacheParams, rawResponse: json }, null);
      return null;
    }

    saveToMemoryCache(cacheKey, cacheParams, result);
    saveToFileCache(cacheKey, { ...cacheParams, rawResponse: json }, result);
    return result;
  }

  /**
   * Get polymerized data for a date range using groupByTime for daily aggregation.
   * This is the key optimization for 2-year data — instead of 730 individual API calls,
   * we batch into ~90-day chunks with groupByTime=86400000ms (1 day), resulting in ~9 calls.
   *
   * Returns raw grouped data per day with field values.
   */
  async getPolymerizeDataRange(
    dataTypeName: string,
    startDate: string,
    endDate: string
  ): Promise<Array<{ date: string; values: Record<string, number> }>> {
    const accessToken = await this.getAccessToken();
    const config = loadConfig();
    const clientId = config.dataSources.huawei?.clientId || "";
    const timeZoneId = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const url = `${getApiBaseUrl()}/healthkit/v2/sampleSet:polymerize`;

    const result: Array<{ date: string; values: Record<string, number> }> = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    const CHUNK_DAYS = 90;

    const chunkStart = new Date(start);
    while (chunkStart <= end) {
      const chunkEnd = new Date(chunkStart);
      chunkEnd.setDate(chunkEnd.getDate() + CHUNK_DAYS - 1);
      if (chunkEnd > end) chunkEnd.setTime(end.getTime());

      const chunkStartDate = `${chunkStart.getFullYear()}-${String(chunkStart.getMonth() + 1).padStart(2, "0")}-${String(chunkStart.getDate()).padStart(2, "0")}`;
      const chunkEndDate = `${chunkEnd.getFullYear()}-${String(chunkEnd.getMonth() + 1).padStart(2, "0")}-${String(chunkEnd.getDate()).padStart(2, "0")}`;
      const startTime = new Date(`${chunkStartDate}T00:00:00`).getTime();
      const endTime = new Date(`${chunkEndDate}T23:59:59.999`).getTime();

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "x-client-id": clientId,
          },
          body: JSON.stringify({
            polymerizeWith: [{ dataTypeName }],
            startTime,
            endTime,
            groupByTime: {
              duration: 86400000, // 1 day in milliseconds
              timeZoneId,
            },
          }),
        });

        if (!response.ok) {
          log.warn("Range polymerize failed", { dataTypeName, status: response.status });
          chunkStart.setDate(chunkStart.getDate() + CHUNK_DAYS);
          continue;
        }

        const json = await response.json();
        const chunkData = parsePolymerizeDataRangeChunk(json);
        result.push(...chunkData);
      } catch (error) {
        log.warn("Range polymerize error", { dataTypeName, error });
      }

      chunkStart.setDate(chunkStart.getDate() + CHUNK_DAYS);
    }

    return result;
  }

  /**
   * Test API connection by fetching today's step count
   */
  async testConnection(): Promise<{ success: boolean; steps?: number; error?: string }> {
    try {
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const data = await this.getPolymerizeData(today);
      return { success: true, steps: data.steps };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Debug method: Try a specific dataTypeName and cache the response
   * Useful for exploring what data types are available
   */
  async debugPolymerize(
    dataTypeName: string,
    date: string
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    const accessToken = await this.getAccessToken();

    const startTime = new Date(`${date}T00:00:00`).getTime();
    const endTime = new Date(`${date}T23:59:59.999`).getTime();

    const config = loadConfig();
    const clientId = config.dataSources.huawei?.clientId || "";

    const url = `${getApiBaseUrl()}/healthkit/v2/sampleSet:polymerize`;
    const params = { dataTypeName, startTime, endTime };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "x-client-id": clientId,
      },
      body: JSON.stringify({
        polymerizeWith: [{ dataTypeName }],
        startTime,
        endTime,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      saveToFileCache(`polymerize/${dataTypeName}`, params, null, errorText);
      return { success: false, error: `${response.status}: ${errorText}` };
    }

    const json = await response.json();
    saveToFileCache(`polymerize/${dataTypeName}`, params, json);
    return { success: true, data: json };
  }

  /**
   * Debug method: Try healthRecords endpoint with a specific dataType
   */
  async debugHealthRecords(
    dataType: number,
    date: string
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    const accessToken = await this.getAccessToken();

    const startTime = new Date(`${date}T00:00:00`).getTime();
    const endTime = new Date(`${date}T23:59:59.999`).getTime();

    const config = loadConfig();
    const clientId = config.dataSources.huawei?.clientId || "";

    // Try healthRecords endpoint
    const url = `${getApiBaseUrl()}/healthkit/v2/healthRecords`;
    const params = { dataType, startTime, endTime };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "x-client-id": clientId,
      },
      body: JSON.stringify({
        dataType,
        startTime,
        endTime,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      saveToFileCache(`healthRecords/${dataType}`, params, null, errorText);
      return { success: false, error: `${response.status}: ${errorText}` };
    }

    const json = await response.json();
    saveToFileCache(`healthRecords/${dataType}`, params, json);
    return { success: true, data: json };
  }

  /**
   * Debug method: Try sampleSet:read endpoint (different from polymerize)
   */
  async debugSampleSetRead(
    dataTypeName: string,
    date: string
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    const accessToken = await this.getAccessToken();

    // For sleep, use overnight time range
    const prevDay = new Date(date);
    prevDay.setDate(prevDay.getDate() - 1);
    const startTime = new Date(`${prevDay.toISOString().split("T")[0]}T18:00:00Z`).getTime();
    const endTime = new Date(`${date}T12:00:00Z`).getTime();

    const config = loadConfig();
    const clientId = config.dataSources.huawei?.clientId || "";

    const url = `${getApiBaseUrl()}/healthkit/v2/sampleSet:read`;
    const params = { dataTypeName, startTime, endTime };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "x-client-id": clientId,
      },
      body: JSON.stringify({
        dataTypeName,
        startTime,
        endTime,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      saveToFileCache(`sampleSet-read/${dataTypeName}`, params, null, errorText);
      return { success: false, error: `${response.status}: ${errorText}` };
    }

    const json = await response.json();
    saveToFileCache(`sampleSet-read/${dataTypeName}`, params, json);
    return { success: true, data: json };
  }

  /**
   * Debug method: Try healthRecordController endpoint for sleep
   * According to Huawei docs, sleep data is accessed via healthRecordController
   */
  async debugHealthRecordController(
    healthRecordDataType: string,
    date: string
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    const accessToken = await this.getAccessToken();

    // For sleep, use overnight time range
    const prevDay = new Date(date);
    prevDay.setDate(prevDay.getDate() - 1);
    const startTime = new Date(`${prevDay.toISOString().split("T")[0]}T18:00:00Z`).getTime();
    const endTime = new Date(`${date}T12:00:00Z`).getTime();

    const config = loadConfig();
    const clientId = config.dataSources.huawei?.clientId || "";

    // Try healthRecordController endpoint
    const url = `${getApiBaseUrl()}/healthkit/v2/healthRecordController:getHealthRecord`;
    const params = { healthRecordDataType, startTime, endTime };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "x-client-id": clientId,
      },
      body: JSON.stringify({
        healthRecordDataType,
        startTime,
        endTime,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      saveToFileCache(`healthRecord/${healthRecordDataType}`, params, null, errorText);
      return { success: false, error: `${response.status}: ${errorText}` };
    }

    const json = await response.json();
    saveToFileCache(`healthRecord/${healthRecordDataType}`, params, json);
    return { success: true, data: json };
  }

  /**
   * Debug method: List all available data types by trying common ones
   */
  async debugExploreDataTypes(date: string): Promise<void> {
    log.info("Exploring available data types...");

    // Common dataTypeName patterns to try
    const dataTypeNames = [
      // Steps/Activity
      "com.huawei.continuous.steps.delta",
      "com.huawei.continuous.steps.total",
      "com.huawei.instantaneous.steps",
      // Heart rate
      "com.huawei.instantaneous.heart_rate",
      "com.huawei.continuous.heart_rate.statistics",
      // Sleep - try various patterns
      "com.huawei.continuous.sleep.segment",
      "com.huawei.continuous.sleep.statistics",
      "com.huawei.sleep",
      "com.huawei.instantaneous.sleep",
      "com.huawei.health.sleep",
      "com.huawei.continuous.sleep",
      // Calories
      "com.huawei.continuous.calories.burnt",
      "com.huawei.continuous.calories.delta",
      // Distance
      "com.huawei.continuous.distance.delta",
      "com.huawei.continuous.distance.total",
      // Other
      "com.huawei.continuous.activity.duration",
      "com.huawei.instantaneous.stress",
      "com.huawei.instantaneous.blood_glucose",
      "com.huawei.instantaneous.blood_pressure",
      "com.huawei.instantaneous.body.temperature",
      "com.huawei.instantaneous.oxygen_saturation",
    ];

    for (const name of dataTypeNames) {
      const result = await this.debugPolymerize(name, date);
      const status = result.success ? "✓" : "✗";
      const info = result.success
        ? JSON.stringify(result.data).slice(0, 100)
        : result.error?.slice(0, 60);
      log.debug(`${status} ${name}`, { info });
    }

    // Try healthRecordController for sleep
    log.debug("Trying healthRecordController for sleep");
    const sleepTypes = ["com.huawei.health.record.sleep", "com.huawei.sleep.record", "sleep"];
    for (const type of sleepTypes) {
      const result = await this.debugHealthRecordController(type, date);
      const status = result.success ? "✓" : "✗";
      const info = result.success
        ? JSON.stringify(result.data).slice(0, 100)
        : result.error?.slice(0, 60);
      log.debug(`${status} ${type} (healthRecordController)`, { info });
    }

    // Try various API paths for sleep
    log.debug("Trying various API paths");
    await this.debugTryVariousEndpoints(date);

    log.info("Results saved to .pha/api-cache/");
  }

  /**
   * Debug: Try various API endpoint paths for sleep data
   */
  private async debugTryVariousEndpoints(date: string): Promise<void> {
    const accessToken = await this.getAccessToken();
    const config = loadConfig();
    const clientId = config.dataSources.huawei?.clientId || "";

    const prevDay = new Date(date);
    prevDay.setDate(prevDay.getDate() - 1);
    const startTime = new Date(`${prevDay.toISOString().split("T")[0]}T18:00:00Z`).getTime();
    const endTime = new Date(`${date}T12:00:00Z`).getTime();

    const endpoints = [
      // Try dataCollector endpoints
      { path: "/healthkit/v2/dataCollectors", method: "GET" },
    ];

    // Try polymerize with derived dataCollectorId for sleep
    log.debug("Trying polymerize with dataCollectorId");

    // Construct derived dataCollectorId patterns for sleep
    // Format: derived:<type>:com.huawei.hwid:<hash> but we can try without the hash
    const sleepCollectorPatterns = [
      "derived:sleep:com.huawei.hwid",
      "derived:sleep_segment:com.huawei.hwid",
      "derived:sleep:com.huawei.health",
      "raw:sleep:com.huawei.health",
    ];

    for (const collectorId of sleepCollectorPatterns) {
      const url = `${getApiBaseUrl()}/healthkit/v2/sampleSet:polymerize`;
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "x-client-id": clientId,
          },
          body: JSON.stringify({
            polymerizeWith: [
              {
                dataTypeName: "com.huawei.continuous.sleep.statistics",
                dataCollectorId: Buffer.from(collectorId).toString("base64"),
              },
            ],
            startTime,
            endTime,
          }),
        });

        const text = await response.text();
        let data: unknown;
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }

        const status = response.ok ? "✓" : "✗";
        const info = response.ok
          ? JSON.stringify(data).slice(0, 80)
          : `${response.status}: ${text.slice(0, 50)}`;
        log.debug(`${status} polymerize with collector`, { collectorId, info });

        saveToFileCache(`polymerize-collector/${collectorId}`, { collectorId }, data);
      } catch (err) {
        log.debug("polymerize with collector failed", { collectorId, error: err });
      }
    }

    log.debug("Trying other endpoints");

    for (const ep of endpoints) {
      const separator = ep.path.includes("?") ? "&" : "?";
      const url =
        ep.method === "GET"
          ? `${getApiBaseUrl()}${ep.path}${separator}startTime=${startTime}&endTime=${endTime}`
          : `${getApiBaseUrl()}${ep.path}`;

      try {
        const response = await fetch(url, {
          method: ep.method,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "x-client-id": clientId,
          },
          ...(ep.method === "POST" && {
            body: JSON.stringify({ startTime, endTime }),
          }),
        });

        const text = await response.text();
        let data: unknown;
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }

        const status = response.ok ? "✓" : "✗";
        const info = response.ok
          ? JSON.stringify(data).slice(0, 80)
          : `${response.status}: ${text.slice(0, 50)}`;
        log.debug(`${status} ${ep.method} ${ep.path}`, { info });

        saveToFileCache(`endpoint${ep.path.replace(/\//g, "_")}`, { method: ep.method }, data);
      } catch (err) {
        log.debug(`Endpoint failed: ${ep.method} ${ep.path}`, { error: err });
      }
    }
  }

  /**
   * Fetch polymerized data for a specific data type
   */
  private async fetchPolymerizeData(
    accessToken: string,
    dataType: number,
    startTime: number,
    endTime: number,
    _timeZoneId: string
  ): Promise<HuaweiPolymerizeResponse> {
    const dataTypeName = DATA_TYPE_NAMES[dataType];
    if (!dataTypeName) {
      return { data: [] };
    }

    // Get client ID from config for x-client-id header
    const config = loadConfig();
    const clientId = config.dataSources.huawei?.clientId || "";

    // v2 endpoint
    const url = `${getApiBaseUrl()}/healthkit/v2/sampleSet:polymerize`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "x-client-id": clientId,
      },
      body: JSON.stringify({
        // polymerizeWith is an array
        polymerizeWith: [
          {
            dataTypeName,
          },
        ],
        startTime,
        endTime,
      }),
    });

    if (!response.ok) {
      // Try to continue with other data types
      const errorText = await response.text();
      log.warn("Failed to fetch polymerize data", {
        dataTypeName,
        status: response.status,
        statusText: response.statusText,
        errorText,
      });
      return { data: [] };
    }

    const json = (await response.json()) as Record<string, unknown>;

    // Handle different response formats
    // Could be { data: [...] } or { group: [...] } or direct array
    if (Array.isArray(json)) {
      return { data: json as HuaweiPolymerizeResponse["data"] };
    }
    if (json.group && Array.isArray(json.group)) {
      // Flatten group -> sampleSet -> samplePoints structure
      // Value is in: samplePoint.value[0].integerValue or samplePoint.value[0].floatValue
      type FieldValue = { integerValue?: number; floatValue?: number };
      type SamplePoint = { value?: FieldValue[] };
      type SampleSet = { samplePoints?: SamplePoint[] };
      type Group = { sampleSet?: SampleSet[] };

      const groups = json.group as Group[];
      const data = groups.flatMap((g) =>
        (g.sampleSet || []).flatMap((ss) =>
          (ss.samplePoints || []).map((p) => {
            // Extract value from value[0].integerValue or value[0].floatValue
            const fieldValue = p.value?.[0];
            const value = fieldValue?.integerValue ?? fieldValue?.floatValue ?? 0;
            return { value, dataType: 0, startTime: 0, endTime: 0 };
          })
        )
      );
      return { data };
    }
    if (json.data && Array.isArray(json.data)) {
      return json as unknown as HuaweiPolymerizeResponse;
    }
    // Unknown format, return empty
    log.warn("Unknown response format", { dataTypeName, response: json });
    return { data: [] };
  }

  /**
   * Handle API error responses
   */
  private async handleError(response: Response): Promise<never> {
    let errorMessage: string;

    try {
      const errorData = (await response.json()) as HuaweiApiError;
      errorMessage =
        errorData.error_description ||
        errorData.ret?.msg ||
        errorData.error ||
        `HTTP ${response.status}`;
    } catch {
      errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    }

    throw new Error(`Huawei API error: ${errorMessage}`);
  }
}

// Default instance (single-user mode)
export const huaweiHealthApi = new HuaweiHealthApi();

/**
 * Create a HuaweiHealthApi instance for a specific user (multi-user mode)
 */
export function createHuaweiHealthApiForUser(userUuid: string): HuaweiHealthApi {
  return new HuaweiHealthApi(defaultAuth, userUuid);
}
