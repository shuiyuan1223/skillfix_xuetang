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

// Huawei Health Kit API base URL
const HEALTH_API_BASE = "https://health-api.cloud.huawei.com";

// Data type names for the API (continuous = 实时采集的连续数据)
// 只保留确认可用的数据类型
const DATA_TYPE_NAMES: Record<number, string> = {
  [HuaweiDataType.STEPS]: "com.huawei.continuous.steps.delta",
  [HuaweiDataType.DISTANCE]: "com.huawei.continuous.distance.delta",
  // 卡路里和活动时长暂不支持，API 返回 Invalid dataTypeName
  // [HuaweiDataType.CALORIES]: "com.huawei.continuous.calories.delta",
  // [HuaweiDataType.ACTIVE_MINUTES]: "com.huawei.continuous.activity.duration",
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

    // Aggregate results
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

    return aggregated;
  }

  /**
   * Get activity records (workouts) for a date range
   */
  async getActivityRecords(startDate: string, endDate: string): Promise<ActivityRecord[]> {
    const accessToken = await this.auth.ensureValidToken();

    const startTime = new Date(`${startDate}T00:00:00Z`).getTime();
    const endTime = new Date(`${endDate}T23:59:59.999Z`).getTime();

    const url = `${HEALTH_API_BASE}/healthkit/v1/activityRecords`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        startTime,
        endTime,
      }),
    });

    if (!response.ok) {
      await this.handleError(response);
    }

    const data = (await response.json()) as HuaweiActivityResponse;

    return data.data.map((record) => ({
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

    // Correct endpoint: /healthkit/v1/sampleSet:polymerize
    const url = `${HEALTH_API_BASE}/healthkit/v1/sampleSet:polymerize`;

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
