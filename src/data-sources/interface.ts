/**
 * Health Data Source Interface
 *
 * All data sources (Mock, Huawei, Apple) implement this interface.
 */

export interface HealthMetrics {
  date: string;
  steps: number;
  calories: number;
  activeMinutes: number;
  distance: number; // meters
}

export interface HeartRateData {
  date: string;
  restingAvg: number;
  maxToday: number;
  minToday: number;
  readings: Array<{
    time: string;
    value: number;
  }>;
}

export interface StressData {
  date: string;
  current: number; // 1-99
  avg: number;
  max: number;
  min: number;
  readings: Array<{
    time: string;
    value: number;
  }>;
}

export interface SpO2Data {
  date: string;
  current: number; // percentage 0-100
  avg: number;
  max: number;
  min: number;
  readings: Array<{
    time: string;
    value: number;
  }>;
}

export interface ECGData {
  date: string;
  records: Array<{
    time: string;
    avgHeartRate: number;
    arrhythmiaType: number; // 1=normal, 2=sinus arrhythmia, 3=AF, etc.
    arrhythmiaLabel: string;
  }>;
  latestHeartRate: number | null;
  hasArrhythmia: boolean;
}

export interface SleepData {
  date: string;
  durationHours: number;
  qualityScore: number; // 0-100
  bedTime: string;
  wakeTime: string;
  stages: {
    deep: number; // minutes
    light: number;
    rem: number;
    awake: number;
  };
}

export interface WorkoutData {
  id: string;
  date: string;
  type: string;
  durationMinutes: number;
  caloriesBurned: number;
  distanceKm?: number;
  avgHeartRate?: number;
}

export interface HealthDataSource {
  readonly name: string;

  getMetrics(date: string): Promise<HealthMetrics>;
  getHeartRate(date: string): Promise<HeartRateData>;
  getSleep(date: string): Promise<SleepData | null>;
  getWorkouts(date: string): Promise<WorkoutData[]>;

  // Extended health data (optional - may return null if not supported)
  getStress?(date: string): Promise<StressData | null>;
  getSpO2?(date: string): Promise<SpO2Data | null>;
  getRestingHeartRate?(date: string): Promise<number | null>;
  getECG?(date: string): Promise<ECGData | null>;

  // Weekly aggregations
  getWeeklySteps(endDate: string): Promise<Array<{ date: string; steps: number }>>;
  getWeeklySleep(endDate: string): Promise<Array<{ date: string; hours: number }>>;
}
