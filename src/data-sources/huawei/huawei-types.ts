/**
 * Huawei Health Kit API Types
 *
 * Type definitions for Huawei Health Kit REST API responses.
 */

// OAuth Token Response
export interface HuaweiTokenResponse {
  access_token: string;
  refresh_token?: string; // May not be returned on token refresh
  expires_in: number;
  token_type: string;
  scope?: string;
  id_token?: string; // JWT containing sub = Huawei user ID
}

// Stored token data with expiry timestamp
export interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix timestamp in ms
  tokenType: string;
  scope?: string;
}

// Huawei Data Types (for polymerize API)
export enum HuaweiDataType {
  STEPS = 1,
  DISTANCE = 2,
  CALORIES = 3,
  HEART_RATE = 4,
  SLEEP = 5,
  WEIGHT = 6,
  ACTIVE_MINUTES = 7,
}

// Huawei Activity Types
export enum HuaweiActivityType {
  RUNNING = 1,
  WALKING = 2,
  CYCLING = 3,
  SWIMMING = 4,
  HIKING = 5,
  WORKOUT = 6,
  STRENGTH = 100,
  YOGA = 101,
}

// Polymerize Data Response
export interface HuaweiPolymerizeDataItem {
  dataType: number;
  startTime: number; // Unix timestamp in ms
  endTime: number;
  value: number;
  fieldValues?: Record<string, number>;
}

export interface HuaweiPolymerizeResponse {
  data: HuaweiPolymerizeDataItem[];
}

// Activity Record Response
export interface HuaweiActivityRecord {
  activityType: number;
  startTime: number; // Unix timestamp in ms
  endTime: number;
  activityId?: string;
  distance?: number; // meters
  calories?: number;
  avgHeartRate?: number;
  avgSpeed?: number;
}

export interface HuaweiActivityResponse {
  data: HuaweiActivityRecord[];
}

// API Error Response
export interface HuaweiApiError {
  error: string;
  error_description?: string;
  ret?: {
    code: number;
    msg: string;
  };
}

// Polymerize Request Body
export interface HuaweiPolymerizeRequest {
  polymerizeWith: {
    dataTypeName: string;
    dataGenerateType: number;
  };
  startTime: number;
  endTime: number;
  groupByTime: {
    duration: number;
    timeZoneId: string;
  };
}

// Activity mapping from Huawei to PHA types
export const ACTIVITY_TYPE_MAP: Record<number, string> = {
  [HuaweiActivityType.RUNNING]: "running",
  [HuaweiActivityType.WALKING]: "walking",
  [HuaweiActivityType.CYCLING]: "cycling",
  [HuaweiActivityType.SWIMMING]: "swimming",
  [HuaweiActivityType.HIKING]: "hiking",
  [HuaweiActivityType.WORKOUT]: "workout",
  [HuaweiActivityType.STRENGTH]: "strength",
  [HuaweiActivityType.YOGA]: "yoga",
};

// Map Huawei activity type to PHA workout type
export function mapActivityType(huaweiType: number): string {
  return ACTIVITY_TYPE_MAP[huaweiType] || "other";
}
