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
  SLEEP: "com.huawei.continuous.sleep.segment",
  SLEEP_STATISTICS: "com.huawei.continuous.sleep.statistics",
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

  constructor(auth: HuaweiAuth = defaultAuth) {
    this.auth = auth;
  }

  /**
   * Get polymerized (aggregated) health data for a specific date
   */
  async getPolymerizeData(date: string): Promise<PolymerizeResult> {
    const accessToken = await this.auth.ensureValidToken();

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
    const accessToken = await this.auth.ensureValidToken();

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
    const accessToken = await this.auth.ensureValidToken();

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
    const accessToken = await this.auth.ensureValidToken();

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

    return { readings, avg, max, min };
  }

  /**
   * Get sleep data using polymerize API
   * Note: Requires sleep.read permission
   */
  async getSleepData(date: string): Promise<{
    segments: Array<{
      startTime: number;
      endTime: number;
      sleepType: number; // 1=awake, 2=light, 3=deep, 4=REM
    }>;
    totalMinutes: number;
    bedTime: string;
    wakeTime: string;
  } | null> {
    const accessToken = await this.auth.ensureValidToken();

    // Sleep data is for the night ending on this date
    // Query from previous day 18:00 to current day 12:00
    const queryDate = new Date(date);
    const prevDay = new Date(queryDate);
    prevDay.setDate(prevDay.getDate() - 1);

    const startTime = new Date(`${prevDay.toISOString().split("T")[0]}T18:00:00Z`).getTime();
    const endTime = new Date(`${date}T12:00:00Z`).getTime();

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
        polymerizeWith: [{ dataTypeName: HEALTH_DATA_TYPES.SLEEP }],
        startTime,
        endTime,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`Sleep polymerize failed: ${response.status}`, errorText);
      return null;
    }

    const json = (await response.json()) as any;

    // Parse sleep segments
    const segments: Array<{ startTime: number; endTime: number; sleepType: number }> = [];

    const groups = json.group || [];
    for (const group of groups) {
      const sampleSets = group.sampleSet || [];
      for (const sampleSet of sampleSets) {
        const points = sampleSet.samplePoints || sampleSet.samplePoint || [];
        for (const point of points) {
          let start = point.startTime;
          let end = point.endTime;

          // Convert nanoseconds to milliseconds if needed
          if (start > 1e15) start = Math.floor(start / 1e6);
          if (end > 1e15) end = Math.floor(end / 1e6);

          // Sleep type is in value[0].integerValue
          const sleepType = point.value?.[0]?.integerValue || 0;

          if (start && end && sleepType) {
            segments.push({ startTime: start, endTime: end, sleepType });
          }
        }
      }
    }

    if (segments.length === 0) {
      return null;
    }

    // Sort by start time
    segments.sort((a, b) => a.startTime - b.startTime);

    // Calculate total duration and bed/wake times
    const firstSegment = segments[0];
    const lastSegment = segments[segments.length - 1];

    const bedTime = new Date(firstSegment.startTime).toTimeString().slice(0, 5);
    const wakeTime = new Date(lastSegment.endTime).toTimeString().slice(0, 5);

    const totalMinutes = segments.reduce((sum, seg) => {
      return sum + Math.round((seg.endTime - seg.startTime) / (60 * 1000));
    }, 0);

    return { segments, totalMinutes, bedTime, wakeTime };
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

// Default instance
export const huaweiHealthApi = new HuaweiHealthApi();
