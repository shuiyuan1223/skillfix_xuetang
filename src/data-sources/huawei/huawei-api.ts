/**
 * Huawei Health Kit REST API Client
 *
 * Client for calling Huawei Health Kit REST API endpoints.
 */

import { HuaweiAuth, huaweiAuth as defaultAuth } from "./huawei-auth.js";
import {
  HuaweiDataType,
  type HuaweiPolymerizeResponse,
  type HuaweiActivityResponse,
  type HuaweiApiError,
} from "./huawei-types.js";
import { loadConfig } from "../../utils/config.js";
import { saveToFileCache, getFromMemoryCache, saveToMemoryCache } from "./api-cache.js";
import { getUserStore } from "./user-store.js";
import { createLogger } from "../../utils/logger.js";

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

export interface HuaweiHealthApiOptions {
  innerMode?: boolean;
  appLevelAt?: string;
  userHuid?: string;
}

export class HuaweiHealthApi {
  private auth: HuaweiAuth;
  private userUuid: string | null = null;
  private innerMode: boolean;
  private appLevelAt: string | undefined;
  private userHuid: string | undefined;

  private static getInnerBaseUrl(): string {
    const config = loadConfig();
    return config.dataSources.huawei?.innerApiBaseUrl ?? "";
  }

  constructor(auth: HuaweiAuth = defaultAuth, userUuid?: string, options?: HuaweiHealthApiOptions) {
    this.auth = auth;
    this.userUuid = userUuid || null;
    this.innerMode = options?.innerMode ?? false;
    this.appLevelAt = options?.appLevelAt;
    this.userHuid = options?.userHuid;
  }

  /**
   * Get access token - handles both single-user and multi-user modes
   */
  private async getAccessToken(): Promise<string> {
    if (this.innerMode && this.appLevelAt) {
      return this.appLevelAt;
    }
    if (this.userUuid) {
      // Multi-user mode: get token from SQLite
      return this.auth.ensureValidTokenForUser(this.userUuid, getUserStore());
    }
    // Single-user mode: get token from file
    return this.auth.ensureValidToken();
  }

  /**
   * Fetch wrapper: rewrites URL for inner API mode and injects x-huid header.
   */
  private async apiFetch(url: string, options: RequestInit): Promise<Response> {
    if (this.innerMode) {
      const outerPrefix = getApiBaseUrl() + "/healthkit";
      const innerPrefix = HuaweiHealthApi.getInnerBaseUrl() + "/healthkit-inner";
      if (url.startsWith(outerPrefix)) {
        url = innerPrefix + url.slice(outerPrefix.length);
      }
      const headers: Record<string, string> = { ...(options.headers as Record<string, string>) };
      if (this.userHuid) {
        headers["x-huid"] = this.userHuid;
      }
      options = { ...options, headers };
    }
    return fetch(url, options);
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

    const results = await Promise.all(
      dataTypes.map((dataType) =>
        this.fetchPolymerizeData(accessToken, dataType, startTime, endTime, timeZoneId)
      )
    );

    // Aggregate results from polymerize
    const aggregated: PolymerizeResult = {
      steps: 0,
      distance: 0,
      calories: 0,
      activeMinutes: 0,
    };

    results.forEach((result, index) => {
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
      }
    });

    // Try to get more data from dailyActivitySummary if polymerize returned zeros
    if (aggregated.calories === 0 || aggregated.activeMinutes === 0) {
      try {
        const summary = await this.getDailyActivitySummary(date);
        if (summary.calories > 0) aggregated.calories = summary.calories;
        if (summary.activeMinutes > 0) aggregated.activeMinutes = summary.activeMinutes;
        if (summary.steps > 0 && aggregated.steps === 0) aggregated.steps = summary.steps;
        if (summary.distance > 0 && aggregated.distance === 0)
          aggregated.distance = summary.distance;
      } catch (e) {
        log.warn("Failed to get dailyActivitySummary", e);
      }
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

    const response = await this.apiFetch(url, {
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

    const response = await this.apiFetch(url, {
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

    const json = (await response.json()) as any;
    const records = json.data || json.activityRecord || json.activityRecords || [];

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

    const response = await this.apiFetch(url, {
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

    const json = (await response.json()) as any;

    // Parse response - extract heart rate readings
    const readings: Array<{ time: string; value: number }> = [];

    // Try different response formats
    const groups = json.group || [];
    for (const group of groups) {
      const sampleSets = group.sampleSet || [];
      for (const sampleSet of sampleSets) {
        const points = sampleSet.samplePoints || sampleSet.samplePoint || [];
        for (const point of points) {
          // Timestamps can be in nanoseconds (19 digits) or milliseconds (13 digits)
          let timestamp = point.startTime;
          if (timestamp > 1e15) {
            timestamp = Math.floor(timestamp / 1e6); // Convert nanoseconds to milliseconds
          }
          const time = timestamp ? new Date(timestamp).toTimeString().slice(0, 5) : "00:00";

          // Value can be in value[0].floatValue or value[0].integerValue
          const fieldValue = point.value?.[0];
          const value = Math.round(fieldValue?.floatValue ?? fieldValue?.integerValue ?? 0);
          if (value > 0) {
            readings.push({ time, value });
          }
        }
      }
    }

    // Calculate statistics
    const values = readings.map((r) => r.value);
    const avg =
      values.length > 0 ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0;
    const max = values.length > 0 ? Math.max(...values) : 0;
    const min = values.length > 0 ? Math.min(...values) : 0;

    const result = { readings, avg, max, min };

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

    const response = await this.apiFetch(url, {
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

    const response = await this.apiFetch(url, {
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

    const json = (await response.json()) as any;
    const readings: Array<{ time: string; value: number }> = [];

    const groups = json.group || [];
    for (const group of groups) {
      for (const sampleSet of group.sampleSet || []) {
        for (const point of sampleSet.samplePoints || sampleSet.samplePoint || []) {
          let timestamp = point.startTime;
          if (timestamp > 1e15) {
            timestamp = Math.floor(timestamp / 1e6);
          }
          const time = timestamp ? new Date(timestamp).toTimeString().slice(0, 5) : "00:00";
          const fieldValue = point.value?.[0];
          const value = Math.round(fieldValue?.floatValue ?? fieldValue?.integerValue ?? 0);
          if (value > 0) {
            readings.push({ time, value });
          }
        }
      }
    }

    if (readings.length === 0) {
      saveToFileCache(cacheKey, { ...cacheParams, rawResponse: json }, null);
      return null;
    }

    const values = readings.map((r) => r.value);
    const result = {
      readings,
      current: values[values.length - 1],
      avg: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
      max: Math.max(...values),
      min: Math.min(...values),
    };

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

    const response = await this.apiFetch(url, {
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

    const json = (await response.json()) as any;
    const readings: Array<{ time: string; value: number }> = [];

    const groups = json.group || [];
    for (const group of groups) {
      for (const sampleSet of group.sampleSet || []) {
        for (const point of sampleSet.samplePoints || sampleSet.samplePoint || []) {
          let timestamp = point.startTime;
          if (timestamp > 1e15) {
            timestamp = Math.floor(timestamp / 1e6);
          }
          const time = timestamp ? new Date(timestamp).toTimeString().slice(0, 5) : "00:00";
          const fieldValue = point.value?.[0];
          const value = Math.round(fieldValue?.floatValue ?? fieldValue?.integerValue ?? 0);
          if (value > 0) {
            readings.push({ time, value });
          }
        }
      }
    }

    if (readings.length === 0) {
      saveToFileCache(cacheKey, { ...cacheParams, rawResponse: json }, null);
      return null;
    }

    const values = readings.map((r) => r.value);
    const result = {
      readings,
      current: values[values.length - 1],
      avg: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
      max: Math.max(...values),
      min: Math.min(...values),
    };

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

    const response = await this.apiFetch(url, {
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

    const json = (await response.json()) as any;
    saveToFileCache(cacheKey, { ...cacheParams, rawResponse: json }, null);

    const healthRecords = json.healthRecords || [];
    if (healthRecords.length === 0) {
      return null;
    }

    // Arrhythmia type labels
    const arrhythmiaLabels: Record<number, string> = {
      1: "Normal",
      2: "Sinus Arrhythmia",
      3: "Atrial Fibrillation",
      4: "Premature Ventricular Contraction",
      5: "Wide QRS Complex",
      6: "Unknown",
    };

    const records: Array<{
      time: string;
      avgHeartRate: number;
      arrhythmiaType: number;
      arrhythmiaLabel: string;
      ecgType: number;
    }> = [];

    for (const record of healthRecords) {
      const getValue = (fieldName: string) => {
        const field = record.value?.find((v: any) => v.fieldName === fieldName);
        return field?.integerValue ?? field?.longValue ?? field?.floatValue ?? null;
      };

      let timestamp = record.startTime;
      if (timestamp > 1e15) {
        timestamp = Math.floor(timestamp / 1e6);
      }
      const time = new Date(timestamp).toISOString();

      const avgHeartRate = getValue("avg_heart_rate") || 0;
      const arrhythmiaType = getValue("ecg_arrhythmia_type") || 1;
      const ecgType = getValue("ecg_type") || 1;

      records.push({
        time,
        avgHeartRate: Math.round(avgHeartRate),
        arrhythmiaType,
        arrhythmiaLabel: arrhythmiaLabels[arrhythmiaType] || "Unknown",
        ecgType,
      });
    }

    // Sort by time (most recent first)
    records.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

    const result = {
      records,
      latestHeartRate: records.length > 0 ? records[0].avgHeartRate : null,
      hasArrhythmia: records.some((r) => r.arrhythmiaType > 1),
    };

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

    const response = await this.apiFetch(url, {
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

    const json = (await response.json()) as any;
    saveToFileCache("sleep-success", { date }, json);

    const healthRecords = json.healthRecords || [];
    if (healthRecords.length === 0) {
      return null;
    }

    // Find sleep record for the requested date
    // Look for the record where wakeup_time is on the requested date
    const targetDate = new Date(date);
    const targetDayStart = new Date(targetDate);
    targetDayStart.setHours(0, 0, 0, 0);
    const targetDayEnd = new Date(targetDate);
    targetDayEnd.setHours(23, 59, 59, 999);

    // Filter out naps (sleep_type = 3) and sort by wakeup time (most recent first)
    const normalSleepRecords = healthRecords
      .filter((r: any) => {
        const sleepType = r.value?.find((v: any) => v.fieldName === "sleep_type")?.integerValue;
        return sleepType !== 3; // Exclude naps
      })
      .sort((a: any, b: any) => {
        const timeA = a.value?.find((v: any) => v.fieldName === "wakeup_time")?.longValue || 0;
        const timeB = b.value?.find((v: any) => v.fieldName === "wakeup_time")?.longValue || 0;
        return timeB - timeA; // Most recent first
      });

    if (normalSleepRecords.length === 0) {
      return null;
    }

    // Find the record for the target date, or use the most recent one
    let mainRecord = normalSleepRecords.find((r: any) => {
      const wakeupTime = r.value?.find((v: any) => v.fieldName === "wakeup_time")?.longValue;
      if (wakeupTime) {
        const wakeupDate = new Date(wakeupTime);
        return wakeupDate >= targetDayStart && wakeupDate <= targetDayEnd;
      }
      return false;
    });

    // If no exact match for target date, use the most recent sleep
    if (!mainRecord) {
      mainRecord = normalSleepRecords[0];
      log.info("No sleep data for requested date, using most recent", {
        requestedDate: date,
        fallbackDate: new Date(
          mainRecord.value?.find((v: any) => v.fieldName === "wakeup_time")?.longValue
        )
          .toISOString()
          .split("T")[0],
      });
    }

    // Extract sleep record values
    const getValue = (fieldName: string) => {
      const field = mainRecord.value?.find((v: any) => v.fieldName === fieldName);
      return field?.integerValue ?? field?.longValue ?? null;
    };

    const fallAsleepTime = getValue("fall_asleep_time");
    const wakeupTime = getValue("wakeup_time");
    const allSleepTime = getValue("all_sleep_time"); // minutes
    const sleepScore = getValue("sleep_score");
    const deepSleepTime = getValue("deep_sleep_time"); // minutes
    const lightSleepTime = getValue("light_sleep_time"); // minutes
    const dreamTime = getValue("dream_time"); // REM minutes
    const awakeTime = getValue("awake_time"); // minutes

    // Parse sleep fragments from subData
    const segments: Array<{ startTime: number; endTime: number; sleepType: number }> = [];
    const fragmentData = mainRecord.subData?.["com.huawei.continuous.sleep.fragment"];

    if (fragmentData?.samplePoints) {
      for (const point of fragmentData.samplePoints) {
        let start = point.startTime;
        let end = point.endTime;

        // Convert nanoseconds to milliseconds
        if (start > 1e15) start = Math.floor(start / 1e6);
        if (end > 1e15) end = Math.floor(end / 1e6);

        const sleepState =
          point.value?.find((v: any) => v.fieldName === "sleep_state")?.integerValue || 0;

        if (start && end && sleepState) {
          segments.push({ startTime: start, endTime: end, sleepType: sleepState });
        }
      }
    }

    // Sort by start time
    segments.sort((a, b) => a.startTime - b.startTime);

    // Calculate bed/wake times
    const bedTime = fallAsleepTime
      ? new Date(fallAsleepTime).toTimeString().slice(0, 5)
      : segments.length > 0
        ? new Date(segments[0].startTime).toTimeString().slice(0, 5)
        : "00:00";

    const wakeTime = wakeupTime
      ? new Date(wakeupTime).toTimeString().slice(0, 5)
      : segments.length > 0
        ? new Date(segments[segments.length - 1].endTime).toTimeString().slice(0, 5)
        : "00:00";

    return {
      segments,
      totalMinutes: allSleepTime || 0,
      bedTime,
      wakeTime,
      sleepScore: sleepScore || undefined,
      deepSleepMinutes: deepSleepTime || undefined,
      lightSleepMinutes: lightSleepTime || undefined,
      remMinutes: dreamTime || undefined,
      awakeMinutes: awakeTime || undefined,
    };
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

    const response = await this.apiFetch(url, {
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

    const json = (await response.json()) as any;
    const healthRecords = json.healthRecords || [];

    // Create a map of date -> sleep data
    const sleepByDate = new Map<string, { hours: number; sleepScore?: number }>();

    for (const record of healthRecords) {
      // Skip naps (sleep_type = 3)
      const sleepType = record.value?.find((v: any) => v.fieldName === "sleep_type")?.integerValue;
      if (sleepType === 3) continue;

      const wakeupTime = record.value?.find((v: any) => v.fieldName === "wakeup_time")?.longValue;
      const allSleepTime = record.value?.find(
        (v: any) => v.fieldName === "all_sleep_time"
      )?.integerValue;
      const sleepScore = record.value?.find(
        (v: any) => v.fieldName === "sleep_score"
      )?.integerValue;

      if (wakeupTime && allSleepTime) {
        const wakeupDate = new Date(wakeupTime).toISOString().split("T")[0];
        const hours = Math.round((allSleepTime / 60) * 10) / 10;

        // Use the most recent sleep record for each date
        if (!sleepByDate.has(wakeupDate) || sleepByDate.get(wakeupDate)!.hours < hours) {
          sleepByDate.set(wakeupDate, { hours, sleepScore });
        }
      }
    }

    // Build result array for the past 7 days
    const result: Array<{ date: string; hours: number; sleepScore?: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(end);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      const data = sleepByDate.get(dateStr);
      result.push({
        date: dateStr,
        hours: data?.hours || 0,
        sleepScore: data?.sleepScore,
      });
    }

    return result;
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

    const response = await this.apiFetch(url, {
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

    const json = (await response.json()) as any;
    const readings: Array<{ time: string; systolic: number; diastolic: number; pulse?: number }> =
      [];

    const groups = json.group || [];
    for (const group of groups) {
      for (const sampleSet of group.sampleSet || []) {
        for (const point of sampleSet.samplePoints || sampleSet.samplePoint || []) {
          let timestamp = point.startTime;
          if (timestamp > 1e15) timestamp = Math.floor(timestamp / 1e6);
          const time = timestamp ? new Date(timestamp).toTimeString().slice(0, 5) : "00:00";

          // Extract by fieldName per Huawei docs: systolic_pressure, diastolic_pressure, sphygmus
          let systolic = 0;
          let diastolic = 0;
          let pulse = 0;
          const values = point.value || [];
          for (const v of values) {
            const val = Math.round(v.floatValue ?? v.integerValue ?? 0);
            if (v.fieldName === "systolic_pressure") {
              systolic = val;
            } else if (v.fieldName === "diastolic_pressure") {
              diastolic = val;
            } else if (v.fieldName === "sphygmus") {
              pulse = val;
            }
          }
          // Fallback: positional (value[0] = systolic, value[1] = diastolic)
          if (systolic === 0 && diastolic === 0 && values.length >= 2) {
            systolic = Math.round(values[0].floatValue ?? values[0].integerValue ?? 0);
            diastolic = Math.round(values[1].floatValue ?? values[1].integerValue ?? 0);
          }
          if (systolic > 0 || diastolic > 0) {
            readings.push({ time, systolic, diastolic, pulse: pulse > 0 ? pulse : undefined });
          }
        }
      }
    }

    if (readings.length === 0) {
      saveToFileCache(cacheKey, { ...cacheParams, rawResponse: json }, null);
      return null;
    }

    const systolicValues = readings.map((r) => r.systolic);
    const diastolicValues = readings.map((r) => r.diastolic);
    const result = {
      readings,
      latestSystolic: systolicValues[systolicValues.length - 1],
      latestDiastolic: diastolicValues[diastolicValues.length - 1],
      avgSystolic: Math.round(systolicValues.reduce((a, b) => a + b, 0) / systolicValues.length),
      avgDiastolic: Math.round(diastolicValues.reduce((a, b) => a + b, 0) / diastolicValues.length),
    };

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

    const response = await this.apiFetch(url, {
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

    const json = (await response.json()) as any;
    const readings: Array<{ time: string; value: number }> = [];

    const groups = json.group || [];
    for (const group of groups) {
      for (const sampleSet of group.sampleSet || []) {
        for (const point of sampleSet.samplePoints || sampleSet.samplePoint || []) {
          let timestamp = point.startTime;
          if (timestamp > 1e15) timestamp = Math.floor(timestamp / 1e6);
          const time = timestamp ? new Date(timestamp).toTimeString().slice(0, 5) : "00:00";
          const fieldValue = point.value?.[0];
          const value = fieldValue?.floatValue ?? fieldValue?.integerValue ?? 0;
          if (value > 0) {
            readings.push({ time, value: Math.round(value * 10) / 10 });
          }
        }
      }
    }

    if (readings.length === 0) {
      saveToFileCache(cacheKey, { ...cacheParams, rawResponse: json }, null);
      return null;
    }

    const values = readings.map((r) => r.value);
    const result = {
      readings,
      latest: values[values.length - 1],
      avg: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10,
      max: Math.max(...values),
      min: Math.min(...values),
    };

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

    // Extract body_weight response — multiple fields per point: body_weight, bmi, body_fat_rate
    const extractWeightData = async (
      res: Response | null
    ): Promise<{ weight?: number; bmi?: number; bodyFatRate?: number; date?: string } | null> => {
      if (!res || !res.ok) return null;
      const json = (await res.json()) as any;
      let latest: { weight?: number; bmi?: number; bodyFatRate?: number; date?: string } | null =
        null;
      const groups = json.group || [];
      for (const group of groups) {
        for (const sampleSet of group.sampleSet || []) {
          for (const point of sampleSet.samplePoints || sampleSet.samplePoint || []) {
            let timestamp = point.startTime;
            if (timestamp > 1e15) timestamp = Math.floor(timestamp / 1e6);
            const pointDate = timestamp
              ? new Date(timestamp).toISOString().split("T")[0]
              : undefined;

            const entry: { weight?: number; bmi?: number; bodyFatRate?: number; date?: string } = {
              date: pointDate,
            };
            for (const v of point.value || []) {
              const val = v.floatValue ?? v.integerValue ?? 0;
              if (v.fieldName === "body_weight" && val > 0)
                entry.weight = Math.round(val * 10) / 10;
              else if (v.fieldName === "bmi" && val > 0) entry.bmi = Math.round(val * 10) / 10;
              else if (v.fieldName === "body_fat_rate" && val > 0)
                entry.bodyFatRate = Math.round(val * 10) / 10;
            }
            // Fallback: if no fieldName matched, use positional value[0] as weight
            if (!entry.weight && point.value?.[0]) {
              const val = point.value[0].floatValue ?? point.value[0].integerValue ?? 0;
              if (val > 0) entry.weight = Math.round(val * 10) / 10;
            }
            if (entry.weight) latest = entry;
          }
        }
      }
      return latest;
    };

    // Extract height — API returns in meters (range 0.4-2.6), convert to cm
    const extractHeight = async (res: Response | null): Promise<number | null> => {
      if (!res || !res.ok) return null;
      const json = (await res.json()) as any;
      let latestHeight: number | null = null;
      const groups = json.group || [];
      for (const group of groups) {
        for (const sampleSet of group.sampleSet || []) {
          for (const point of sampleSet.samplePoints || sampleSet.samplePoint || []) {
            // Try fieldName "height" first, then positional
            let heightVal = 0;
            for (const v of point.value || []) {
              if (v.fieldName === "height") {
                heightVal = v.floatValue ?? v.integerValue ?? 0;
              }
            }
            if (heightVal === 0 && point.value?.[0]) {
              heightVal = point.value[0].floatValue ?? point.value[0].integerValue ?? 0;
            }
            if (heightVal > 0) {
              // Huawei API returns height in meters; convert to cm
              latestHeight =
                heightVal <= 3
                  ? Math.round(heightVal * 100 * 10) / 10
                  : Math.round(heightVal * 10) / 10;
            }
          }
        }
      }
      return latestHeight;
    };

    const [weightData, heightCm] = await Promise.all([
      extractWeightData(weightRes),
      extractHeight(heightRes),
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

    const response = await this.apiFetch(url, {
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

    const json = (await response.json()) as any;
    const readings: Array<{ time: string; value: number }> = [];

    const groups = json.group || [];
    for (const group of groups) {
      for (const sampleSet of group.sampleSet || []) {
        for (const point of sampleSet.samplePoints || sampleSet.samplePoint || []) {
          let timestamp = point.startTime;
          if (timestamp > 1e15) timestamp = Math.floor(timestamp / 1e6);
          const time = timestamp ? new Date(timestamp).toTimeString().slice(0, 5) : "00:00";
          const fieldValue = point.value?.[0];
          const value = fieldValue?.floatValue ?? fieldValue?.integerValue ?? 0;
          if (value > 0) {
            readings.push({ time, value: Math.round(value * 10) / 10 });
          }
        }
      }
    }

    if (readings.length === 0) {
      saveToFileCache(cacheKey, { ...cacheParams, rawResponse: json }, null);
      return null;
    }

    const values = readings.map((r) => r.value);
    const result = {
      readings,
      latest: values[values.length - 1],
      avg: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10,
      max: Math.max(...values),
      min: Math.min(...values),
    };

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

    const response = await this.apiFetch(url, {
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

    const json = (await response.json()) as any;
    const healthRecords = json.healthRecords || [];

    if (healthRecords.length === 0) {
      saveToFileCache(cacheKey, { ...cacheParams, rawResponse: json }, null);
      return null;
    }

    const meals: Array<{ time: string; calories: number }> = [];
    let totalCalories = 0;
    let protein: number | undefined;
    let fat: number | undefined;
    let carbs: number | undefined;
    let water: number | undefined;

    for (const record of healthRecords) {
      const getValue = (fieldName: string) => {
        const field = record.value?.find((v: any) => v.fieldName === fieldName);
        return field?.floatValue ?? field?.integerValue ?? field?.longValue ?? null;
      };

      let timestamp = record.startTime;
      if (timestamp > 1e15) timestamp = Math.floor(timestamp / 1e6);
      const time = timestamp ? new Date(timestamp).toTimeString().slice(0, 5) : "00:00";

      const energy = getValue("dietaryEnergy") || 0;
      const mealProtein = getValue("protein");
      const mealFat = getValue("fat");
      const mealCarbs = getValue("carbohydrates");

      if (energy > 0) {
        totalCalories += Math.round(energy);
        meals.push({ time, calories: Math.round(energy) });
      }
      if (mealProtein !== null) protein = (protein || 0) + Math.round(mealProtein * 10) / 10;
      if (mealFat !== null) fat = (fat || 0) + Math.round(mealFat * 10) / 10;
      if (mealCarbs !== null) carbs = (carbs || 0) + Math.round(mealCarbs * 10) / 10;
    }

    if (totalCalories === 0 && meals.length === 0) {
      saveToFileCache(cacheKey, { ...cacheParams, rawResponse: json }, null);
      return null;
    }

    const result = { totalCalories, protein, fat, carbs, water, meals };

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

    const records: Array<{ date: string; status: string }> = [];

    // Parse menstrual_flow response — records with flow volume indicate period days
    const flowRes = responses[0];
    if (flowRes && flowRes.ok) {
      const json = (await flowRes.json()) as any;
      const groups = json.group || [];
      for (const group of groups) {
        for (const sampleSet of group.sampleSet || []) {
          for (const point of sampleSet.samplePoints || sampleSet.samplePoint || []) {
            let timestamp = point.startTime;
            if (timestamp > 1e15) timestamp = Math.floor(timestamp / 1e6);
            const pointDate = timestamp ? new Date(timestamp).toISOString().split("T")[0] : date;

            // volume field: 1=spotting, 2=light, 3=moderate, 4=heavy
            let volume = 0;
            for (const v of point.value || []) {
              if (v.fieldName === "volume") {
                volume = v.integerValue ?? v.floatValue ?? 0;
              }
            }
            if (volume > 0) {
              records.push({ date: pointDate, status: "menstrual" });
            }
          }
        }
      }
    }

    if (records.length === 0) {
      saveToFileCache(cacheKey, cacheParams, null);
      return null;
    }

    // Sort by date
    records.sort((a, b) => a.date.localeCompare(b.date));

    // Derive cycle info from flow records
    const periodStartDate = records.length > 0 ? records[0].date : undefined;

    // Estimate phase based on cycle day
    let cycleDay: number | undefined;
    let phase: "menstrual" | "follicular" | "ovulatory" | "luteal" | undefined;
    if (periodStartDate) {
      const daysDiff = Math.floor(
        (new Date(date).getTime() - new Date(periodStartDate).getTime()) / (1000 * 60 * 60 * 24)
      );
      cycleDay = daysDiff + 1;
      // Estimate phase from cycle day (typical 28-day cycle)
      if (cycleDay <= 5) phase = "menstrual";
      else if (cycleDay <= 13) phase = "follicular";
      else if (cycleDay <= 16) phase = "ovulatory";
      else phase = "luteal";
    }

    const result = { cycleDay, phase, periodStartDate, cycleLength: undefined, records };

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

    const response = await this.apiFetch(url, {
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

    const json = (await response.json()) as any;
    let latestValue = 0;

    const groups = json.group || [];
    for (const group of groups) {
      for (const sampleSet of group.sampleSet || []) {
        for (const point of sampleSet.samplePoints || sampleSet.samplePoint || []) {
          const fieldValue = point.value?.[0];
          const value = fieldValue?.floatValue ?? fieldValue?.integerValue ?? 0;
          if (value > 0) latestValue = value;
        }
      }
    }

    if (latestValue === 0) {
      saveToFileCache(cacheKey, { ...cacheParams, rawResponse: json }, null);
      return null;
    }

    // Classify VO2Max level
    let level: "low" | "fair" | "good" | "excellent" | "superior";
    if (latestValue < 30) level = "low";
    else if (latestValue < 37) level = "fair";
    else if (latestValue < 48) level = "good";
    else if (latestValue < 55) level = "excellent";
    else level = "superior";

    const result = { value: Math.round(latestValue * 10) / 10, level };
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
      const response = await this.apiFetch(url, {
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

      const json = (await response.json()) as any;
      const readings: Array<{ time: string; value: number }> = [];

      const groups = json.group || [];
      for (const group of groups) {
        for (const sampleSet of group.sampleSet || []) {
          for (const point of sampleSet.samplePoints || sampleSet.samplePoint || []) {
            let timestamp = point.startTime;
            if (timestamp > 1e15) timestamp = Math.floor(timestamp / 1e6);
            const time = timestamp ? new Date(timestamp).toTimeString().slice(0, 5) : "00:00";

            // Try to extract HRV specific fields
            let hrvValue = 0;
            for (const v of point.value || []) {
              const val = v.floatValue ?? v.integerValue ?? 0;
              if (
                v.fieldName === "rmssd" ||
                v.fieldName === "hrv" ||
                v.fieldName === "heart_rate_variability"
              ) {
                hrvValue = val;
                break;
              }
            }
            // Fallback: first value
            if (hrvValue === 0 && point.value?.[0]) {
              hrvValue = point.value[0].floatValue ?? point.value[0].integerValue ?? 0;
            }
            if (hrvValue > 0) {
              readings.push({ time, value: Math.round(hrvValue) });
            }
          }
        }
      }

      if (readings.length === 0) continue;

      const values = readings.map((r) => r.value);
      const result = {
        rmssd: values[values.length - 1], // Latest reading as RMSSD
        avg: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
        max: Math.max(...values),
        min: Math.min(...values),
        readings,
      };

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

    const response = await this.apiFetch(url, {
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

    const json = (await response.json()) as any;
    const readings: Array<{ time: string; emotion: string; score: number }> = [];

    // Emotion score mapping: higher = more positive
    const emotionFromScore = (score: number): string => {
      if (score >= 80) return "happy";
      if (score >= 60) return "calm";
      if (score >= 40) return "neutral";
      if (score >= 20) return "stressed";
      return "anxious";
    };

    const groups = json.group || [];
    for (const group of groups) {
      for (const sampleSet of group.sampleSet || []) {
        for (const point of sampleSet.samplePoints || sampleSet.samplePoint || []) {
          let timestamp = point.startTime;
          if (timestamp > 1e15) timestamp = Math.floor(timestamp / 1e6);
          const time = timestamp ? new Date(timestamp).toTimeString().slice(0, 5) : "00:00";

          const fieldValue = point.value?.[0];
          const score = Math.round(fieldValue?.floatValue ?? fieldValue?.integerValue ?? 0);
          if (score > 0) {
            readings.push({ time, emotion: emotionFromScore(score), score });
          }
        }
      }
    }

    if (readings.length === 0) {
      saveToFileCache(cacheKey, { ...cacheParams, rawResponse: json }, null);
      return null;
    }

    const latestReading = readings[readings.length - 1];
    const result = {
      current: latestReading.emotion,
      score: latestReading.score,
      readings,
    };

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
        const response = await this.apiFetch(url, {
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

        const json = (await response.json()) as any;
        const groups = json.group || [];

        for (const group of groups) {
          // With groupByTime, each group represents one day
          let groupStart = group.startTime;
          if (groupStart > 1e15) groupStart = Math.floor(groupStart / 1e6);
          const groupDate = groupStart
            ? new Date(groupStart).toISOString().split("T")[0]
            : undefined;
          if (!groupDate) continue;

          const dayValues: Record<string, number> = {};
          for (const sampleSet of group.sampleSet || []) {
            for (const point of sampleSet.samplePoints || sampleSet.samplePoint || []) {
              for (const v of point.value || []) {
                const val = v.floatValue ?? v.integerValue ?? 0;
                if (v.fieldName) {
                  dayValues[v.fieldName] = (dayValues[v.fieldName] || 0) + val;
                } else {
                  dayValues["value"] = (dayValues["value"] || 0) + val;
                }
              }
            }
          }

          if (Object.keys(dayValues).length > 0) {
            result.push({ date: groupDate, values: dayValues });
          }
        }
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

    const response = await this.apiFetch(url, {
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

    const response = await this.apiFetch(url, {
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

    const response = await this.apiFetch(url, {
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

    const response = await this.apiFetch(url, {
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
        const response = await this.apiFetch(url, {
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
        const response = await this.apiFetch(url, {
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

    const response = await this.apiFetch(url, {
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

/**
 * Create a HuaweiHealthApi instance for inner API mode (client_credentials grant).
 * Uses an app-level access token directly; routes requests to the inner HealthKit API.
 */
export function createInnerHuaweiHealthApiForUser(
  userUuid: string,
  appLevelAt: string,
  userHuid: string
): HuaweiHealthApi {
  return new HuaweiHealthApi(defaultAuth, userUuid, {
    innerMode: true,
    appLevelAt,
    userHuid,
  });
}
