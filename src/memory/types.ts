/**
 * Memory System Types
 */

export interface UserProfile {
  nickname?: string;
  gender?: "male" | "female";
  birthYear?: number;
  height?: number; // cm
  weight?: number; // kg
  location?: string; // city name for weather/seasonal advice
  conditions?: string[]; // chronic conditions
  allergies?: string[];
  medications?: string[];
  goals?: {
    primary?: string;
    dailySteps?: number;
    sleepHours?: number;
    exercisePerWeek?: number;
  };
  lifestyle?: {
    sleepSchedule?: string;
    exercisePreference?: string;
    dietPreference?: string;
  };
  dataSources?: {
    huawei?: { connected: boolean; connectedAt?: number };
  };
}

export interface UserPreferences {
  language?: "zh" | "en";
  notificationEnabled?: boolean;
  reminderFrequency?: "low" | "medium" | "high";
}

export interface MemoryChunk {
  text: string;
  startLine: number;
  endLine: number;
  hash: string;
}

export interface MemorySearchResult {
  path: string;
  startLine: number;
  endLine: number;
  score: number;
  snippet: string;
}

export interface RequiredField {
  key: keyof UserProfile;
  question: string;
  options?: string[];
  validate?: (answer: string) => boolean;
  parse: (answer: string) => unknown;
}
