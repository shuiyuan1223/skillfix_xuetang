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

export interface SleepData {
  date: string;
  durationHours: number;
  qualityScore: number; // 0-100
  bedTime: string;
  wakeTime: string;
  stages: {
    deep: number;    // minutes
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

  // Weekly aggregations
  getWeeklySteps(endDate: string): Promise<Array<{ date: string; steps: number }>>;
  getWeeklySleep(endDate: string): Promise<Array<{ date: string; hours: number }>>;
}
