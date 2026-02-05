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

// Huawei Health Kit API base URL (default, can be overridden in config)
const DEFAULT_API_BASE = "https://health-api.cloud.huawei.com";

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
  // Note: activity_minutes not supported via REST API
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
    // Check memory cache first
    const cacheKey = "polymerize";
    const cached = getFromMemoryCache<PolymerizeResult>(cacheKey, { date });
    if (cached) {
      return cached;
    }

    const accessToken = await this.getAccessToken();

    // Calculate start and end of day in UTC
    const startDate = new Date(`${date}T00:00:00Z`);
    const endDate = new Date(`${date}T23:59:59.999Z`);
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
        console.warn("Failed to get dailyActivitySummary:", e);
      }
    }

    // Save to cache
    saveToMemoryCache(cacheKey, { date }, aggregated);
    saveToFileCache(cacheKey, { date }, aggregated);

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

    const startTime = new Date(`${date}T00:00:00Z`).getTime();
    const endTime = new Date(`${date}T23:59:59.999Z`).getTime();

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
        startTime,
        endTime,
      }),
    });

    if (!response.ok) {
      console.warn(`dailyActivitySummary failed: ${response.status}`);
      return { calories: 0, activeMinutes: 0, steps: 0, distance: 0 };
    }

    const json = (await response.json()) as any;

    // Parse response - structure may vary
    const summary = json.dailyActivitySummary?.[0] || json.data?.[0] || json;
    return {
      calories: summary.calories || summary.totalCalories || 0,
      activeMinutes: summary.activeMinutes || summary.totalActiveMinutes || 0,
      steps: summary.steps || summary.totalSteps || 0,
      distance: summary.distance || summary.totalDistance || 0,
    };
  }

  /**
   * Get activity records (workouts) for a date range
   */
  async getActivityRecords(startDate: string, endDate: string): Promise<ActivityRecord[]> {
    const accessToken = await this.getAccessToken();

    const startTime = new Date(`${startDate}T00:00:00Z`).getTime();
    const endTime = new Date(`${endDate}T23:59:59.999Z`).getTime();

    const params = new URLSearchParams({
      startTime: startTime.toString(),
      endTime: endTime.toString(),
    });
    const url = `${getApiBaseUrl()}/healthkit/v2/activityRecords?${params}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
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
    // Check memory cache first
    const cacheKey = "heartRate";
    const cached = getFromMemoryCache<{
      readings: Array<{ time: string; value: number }>;
      avg: number;
      max: number;
      min: number;
    }>(cacheKey, { date });
    if (cached) {
      return cached;
    }

    const accessToken = await this.getAccessToken();

    const startTime = new Date(`${date}T00:00:00Z`).getTime();
    const endTime = new Date(`${date}T23:59:59.999Z`).getTime();

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
      console.warn(`Heart rate polymerize failed: ${response.status}`, errorText);
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
    saveToMemoryCache(cacheKey, { date }, result);
    saveToFileCache(cacheKey, { date, rawResponse: json }, result);

    return result;
  }

  /**
   * Get resting heart rate data
   */
  async getRestingHeartRateData(date: string): Promise<number | null> {
    const cacheKey = "restingHeartRate";
    const cached = getFromMemoryCache<number>(cacheKey, { date });
    if (cached !== undefined) {
      return cached;
    }

    const accessToken = await this.getAccessToken();
    const startTime = new Date(`${date}T00:00:00Z`).getTime();
    const endTime = new Date(`${date}T23:59:59.999Z`).getTime();

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
      console.warn(`Resting heart rate failed: ${response.status}`);
      return null;
    }

    const json = (await response.json()) as any;
    saveToFileCache(cacheKey, { date, rawResponse: json }, null);

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
      saveToMemoryCache(cacheKey, { date }, latestValue);
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
    const cached = getFromMemoryCache<{
      readings: Array<{ time: string; value: number }>;
      current: number;
      avg: number;
      max: number;
      min: number;
    }>(cacheKey, { date });
    if (cached) {
      return cached;
    }

    const accessToken = await this.getAccessToken();
    const startTime = new Date(`${date}T00:00:00Z`).getTime();
    const endTime = new Date(`${date}T23:59:59.999Z`).getTime();

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
      console.warn(`Stress data failed: ${response.status}`, errorText);
      saveToFileCache(cacheKey, { date }, null, errorText);
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
      saveToFileCache(cacheKey, { date, rawResponse: json }, null);
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

    saveToMemoryCache(cacheKey, { date }, result);
    saveToFileCache(cacheKey, { date, rawResponse: json }, result);
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
    const cached = getFromMemoryCache<{
      readings: Array<{ time: string; value: number }>;
      current: number;
      avg: number;
      max: number;
      min: number;
    }>(cacheKey, { date });
    if (cached) {
      return cached;
    }

    const accessToken = await this.getAccessToken();
    const startTime = new Date(`${date}T00:00:00Z`).getTime();
    const endTime = new Date(`${date}T23:59:59.999Z`).getTime();

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
      console.warn(`SpO2 data failed: ${response.status}`, errorText);
      saveToFileCache(cacheKey, { date }, null, errorText);
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
      saveToFileCache(cacheKey, { date, rawResponse: json }, null);
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

    saveToMemoryCache(cacheKey, { date }, result);
    saveToFileCache(cacheKey, { date, rawResponse: json }, result);
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
    }>(cacheKey, { date });
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
      console.warn(`ECG healthRecords failed: ${response.status}`, errorText);
      saveToFileCache(cacheKey, { date }, null, errorText);
      return null;
    }

    const json = (await response.json()) as any;
    saveToFileCache(cacheKey, { date, rawResponse: json }, null);

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

    saveToMemoryCache(cacheKey, { date }, result);
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
      console.warn(`Sleep healthRecords failed: ${response.status}`, errorText);
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
      console.log(
        `No sleep data for ${date}, using most recent sleep from ${new Date(mainRecord.value?.find((v: any) => v.fieldName === "wakeup_time")?.longValue).toISOString().split("T")[0]}`
      );
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

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "x-client-id": clientId,
      },
    });

    if (!response.ok) {
      console.warn(`Weekly sleep healthRecords failed: ${response.status}`);
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
   * Test API connection by fetching today's step count
   */
  async testConnection(): Promise<{ success: boolean; steps?: number; error?: string }> {
    try {
      const today = new Date().toISOString().split("T")[0];
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

    const startTime = new Date(`${date}T00:00:00Z`).getTime();
    const endTime = new Date(`${date}T23:59:59.999Z`).getTime();

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

    const startTime = new Date(`${date}T00:00:00Z`).getTime();
    const endTime = new Date(`${date}T23:59:59.999Z`).getTime();

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
    console.log("Exploring available data types...\n");

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
      "com.huawei.instantaneous.body_temperature",
      "com.huawei.instantaneous.oxygen_saturation",
    ];

    for (const name of dataTypeNames) {
      const result = await this.debugPolymerize(name, date);
      const status = result.success ? "✓" : "✗";
      const info = result.success
        ? JSON.stringify(result.data).slice(0, 100)
        : result.error?.slice(0, 60);
      console.log(`${status} ${name}`);
      console.log(`  ${info}\n`);
    }

    // Try healthRecordController for sleep
    console.log("\n--- Trying healthRecordController for sleep ---\n");
    const sleepTypes = ["com.huawei.health.record.sleep", "com.huawei.sleep.record", "sleep"];
    for (const type of sleepTypes) {
      const result = await this.debugHealthRecordController(type, date);
      const status = result.success ? "✓" : "✗";
      const info = result.success
        ? JSON.stringify(result.data).slice(0, 100)
        : result.error?.slice(0, 60);
      console.log(`${status} ${type} (healthRecordController)`);
      console.log(`  ${info}\n`);
    }

    // Try various API paths for sleep
    console.log("\n--- Trying various API paths ---\n");
    await this.debugTryVariousEndpoints(date);

    console.log("\nResults saved to .pha/api-cache/");
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
    console.log("--- Trying polymerize with dataCollectorId ---\n");

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
        console.log(`${status} polymerize with collector (${collectorId})`);
        console.log(`  ${info}\n`);

        saveToFileCache(`polymerize-collector/${collectorId}`, { collectorId }, data);
      } catch (err) {
        console.log(`✗ polymerize with collector (${collectorId})`);
        console.log(`  Error: ${err}\n`);
      }
    }

    console.log("--- Trying other endpoints ---\n");

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
        console.log(`${status} ${ep.method} ${ep.path}`);
        console.log(`  ${info}\n`);

        saveToFileCache(`endpoint${ep.path.replace(/\//g, "_")}`, { method: ep.method }, data);
      } catch (err) {
        console.log(`✗ ${ep.method} ${ep.path}`);
        console.log(`  Error: ${err}\n`);
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
      console.warn(
        `Failed to fetch ${dataTypeName}: ${response.status} ${response.statusText}`,
        errorText
      );
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
    console.warn(`Unknown response format for ${dataTypeName}:`, json);
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
