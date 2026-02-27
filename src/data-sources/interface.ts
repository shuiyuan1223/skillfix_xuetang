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

export interface BloodPressureData {
  date: string;
  latestSystolic: number; // mmHg
  latestDiastolic: number;
  avgSystolic: number;
  avgDiastolic: number;
  readings: Array<{ time: string; systolic: number; diastolic: number; pulse?: number }>;
}

export interface BloodGlucoseData {
  date: string;
  latest: number; // mmol/L
  avg: number;
  max: number;
  min: number;
  readings: Array<{ time: string; value: number }>;
}

export interface BodyCompositionData {
  date: string;
  weight?: number; // kg
  height?: number; // cm
  bmi?: number;
  bodyFatRate?: number; // %
  latestWeightDate?: string;
}

export interface BodyTemperatureData {
  date: string;
  latest: number; // Celsius
  avg: number;
  max: number;
  min: number;
  readings: Array<{ time: string; value: number }>;
}

export interface NutritionData {
  date: string;
  totalCalories: number;
  protein?: number; // g
  fat?: number; // g
  carbs?: number; // g
  water?: number; // mL
  meals: Array<{ time: string; calories: number }>;
}

export interface MenstrualCycleData {
  date: string;
  cycleDay?: number;
  phase?: 'menstrual' | 'follicular' | 'ovulatory' | 'luteal';
  periodStartDate?: string;
  cycleLength?: number;
  records: Array<{ date: string; status: string }>;
}

export interface VO2MaxData {
  date: string;
  value: number; // mL/kg/min
  level: 'low' | 'fair' | 'good' | 'excellent' | 'superior';
}

export interface EmotionData {
  date: string;
  current: string; // e.g. "calm", "happy", "stressed", "anxious", "excited"
  score: number; // 0-100 (higher = more positive)
  readings: Array<{ time: string; emotion: string; score: number }>;
}

export interface HRVData {
  date: string;
  rmssd: number; // ms - root mean square of successive differences
  avg: number;
  max: number;
  min: number;
  readings: Array<{ time: string; value: number }>;
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

  // New health data types
  getBloodPressure?(date: string): Promise<BloodPressureData | null>;
  getBloodGlucose?(date: string): Promise<BloodGlucoseData | null>;
  getBodyComposition?(date: string): Promise<BodyCompositionData | null>;
  getBodyTemperature?(date: string): Promise<BodyTemperatureData | null>;
  getNutrition?(date: string): Promise<NutritionData | null>;
  getMenstrualCycle?(date: string): Promise<MenstrualCycleData | null>;

  // Tier 1 new data types
  getVO2Max?(date: string): Promise<VO2MaxData | null>;
  getEmotion?(date: string): Promise<EmotionData | null>;
  getHRV?(date: string): Promise<HRVData | null>;

  // Weekly aggregations
  getWeeklySteps(endDate: string): Promise<Array<{ date: string; steps: number }>>;
  getWeeklySleep(endDate: string): Promise<Array<{ date: string; hours: number }>>;

  // Date range queries (for long-term trends)
  getMetricsRange?(
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
  >;
  getSleepRange?(
    startDate: string,
    endDate: string
  ): Promise<Array<{ date: string; hours: number; qualityScore?: number }>>;
  getHeartRateRange?(
    startDate: string,
    endDate: string
  ): Promise<Array<{ date: string; avg: number; max: number; min: number }>>;
  getWorkoutsRange?(startDate: string, endDate: string): Promise<WorkoutData[]>;

  // Additional range queries for Trends tab
  getStressRange?(
    startDate: string,
    endDate: string
  ): Promise<Array<{ date: string; avg: number; max: number; min: number }>>;
  getSpO2Range?(
    startDate: string,
    endDate: string
  ): Promise<Array<{ date: string; avg: number; max: number; min: number }>>;
  getBloodPressureRange?(
    startDate: string,
    endDate: string
  ): Promise<Array<{ date: string; avgSystolic: number; avgDiastolic: number }>>;
  getBodyCompositionRange?(
    startDate: string,
    endDate: string
  ): Promise<Array<{ date: string; weight?: number; bmi?: number; bodyFatRate?: number }>>;
}
