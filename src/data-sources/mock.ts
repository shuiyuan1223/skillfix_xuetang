/**
 * Mock Health Data Source
 *
 * Generates realistic mock data for development and testing.
 */

import type {
  HealthDataSource,
  HealthMetrics,
  HeartRateData,
  SleepData,
  WorkoutData,
  StressData,
  SpO2Data,
  BloodPressureData,
  BloodGlucoseData,
  BodyCompositionData,
  BodyTemperatureData,
  NutritionData,
  MenstrualCycleData,
  VO2MaxData,
  EmotionData,
  HRVData,
} from "./interface.js";

// Seeded random for consistent data per date
function seededRandom(seed: string): () => number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return () => {
    hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
    hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
    hash ^= hash >>> 16;
    return (hash >>> 0) / 4294967296;
  };
}

function randomInRange(rand: () => number, min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min;
}

export class MockDataSource implements HealthDataSource {
  readonly name = "mock";

  async getMetrics(date: string): Promise<HealthMetrics> {
    const rand = seededRandom(`${date}metrics`);

    // Weekend vs weekday patterns
    const dayOfWeek = new Date(date).getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    const baseSteps = isWeekend ? 6000 : 8000;
    const steps = randomInRange(rand, baseSteps, baseSteps + 6000);

    return {
      date,
      steps,
      calories: Math.floor(steps * 0.04) + randomInRange(rand, 1500, 1800),
      activeMinutes: randomInRange(rand, 20, 90),
      distance: Math.floor(steps * 0.75), // ~0.75m per step
    };
  }

  async getHeartRate(date: string): Promise<HeartRateData> {
    const rand = seededRandom(`${date}heart`);

    const restingAvg = randomInRange(rand, 58, 75);
    const readings: Array<{ time: string; value: number }> = [];

    // Generate hourly readings
    for (let hour = 6; hour < 23; hour++) {
      const timeStr = `${hour.toString().padStart(2, "0")}:00`;
      // Heart rate varies throughout the day
      let baseHr = restingAvg;
      if (hour >= 7 && hour <= 9) baseHr += 20; // Morning activity
      if (hour >= 12 && hour <= 13) baseHr += 10; // Lunch
      if (hour >= 17 && hour <= 19) baseHr += 25; // Evening workout

      readings.push({
        time: timeStr,
        value: randomInRange(rand, baseHr - 5, baseHr + 15),
      });
    }

    const values = readings.map((r) => r.value);

    return {
      date,
      restingAvg,
      maxToday: Math.max(...values),
      minToday: Math.min(...values),
      readings,
    };
  }

  async getSleep(date: string): Promise<SleepData | null> {
    const rand = seededRandom(`${date}sleep`);

    // 10% chance of no sleep data
    if (rand() < 0.1) return null;

    const durationHours = randomInRange(rand, 55, 90) / 10; // 5.5-9.0 hours
    const totalMinutes = Math.floor(durationHours * 60);

    // Sleep stages distribution
    const deep = randomInRange(rand, 60, 120);
    const rem = randomInRange(rand, 60, 120);
    const awake = randomInRange(rand, 10, 40);
    const light = totalMinutes - deep - rem - awake;

    // Calculate quality score based on duration and deep sleep
    let qualityScore = 50;
    if (durationHours >= 7) qualityScore += 20;
    if (durationHours >= 8) qualityScore += 10;
    if (deep >= 90) qualityScore += 15;
    if (awake <= 20) qualityScore += 5;
    qualityScore = Math.min(100, qualityScore);

    const bedHour = randomInRange(rand, 22, 24);
    const wakeHour = bedHour + Math.floor(durationHours);

    return {
      date,
      durationHours,
      qualityScore,
      bedTime: `${(bedHour % 24).toString().padStart(2, "0")}:${randomInRange(rand, 0, 59).toString().padStart(2, "0")}`,
      wakeTime: `${(wakeHour % 24).toString().padStart(2, "0")}:${randomInRange(rand, 0, 59).toString().padStart(2, "0")}`,
      stages: { deep, light, rem, awake },
    };
  }

  async getWorkouts(date: string): Promise<WorkoutData[]> {
    const rand = seededRandom(`${date}workout`);

    // 40% chance of no workout
    if (rand() < 0.4) return [];

    const workoutTypes = ["running", "walking", "cycling", "strength", "yoga"];
    const type = workoutTypes[randomInRange(rand, 0, workoutTypes.length - 1)];

    const workout: WorkoutData = {
      id: `workout-${date}-${rand().toString(36).slice(2, 8)}`,
      date,
      type,
      durationMinutes: randomInRange(rand, 20, 90),
      caloriesBurned: randomInRange(rand, 150, 500),
    };

    if (type === "running" || type === "cycling" || type === "walking") {
      workout.distanceKm = randomInRange(rand, 20, 100) / 10;
      workout.avgHeartRate = randomInRange(rand, 110, 160);
    }

    // 20% chance of second workout
    if (rand() > 0.8) {
      const type2 = workoutTypes[randomInRange(rand, 0, workoutTypes.length - 1)];
      return [
        workout,
        {
          id: `workout-${date}-${rand().toString(36).slice(2, 8)}`,
          date,
          type: type2,
          durationMinutes: randomInRange(rand, 15, 45),
          caloriesBurned: randomInRange(rand, 100, 300),
        },
      ];
    }

    return [workout];
  }

  async getStress(date: string): Promise<StressData | null> {
    const rand = seededRandom(`${date}stress`);
    // 15% chance of no stress data
    if (rand() < 0.15) return null;

    const avg = randomInRange(rand, 25, 65);
    const readings: Array<{ time: string; value: number }> = [];
    for (let hour = 8; hour < 22; hour++) {
      const timeStr = `${hour.toString().padStart(2, "0")}:00`;
      let base = avg;
      if (hour >= 9 && hour <= 11) base += 10; // Morning work
      if (hour >= 14 && hour <= 16) base += 15; // Afternoon peak
      if (hour >= 19) base -= 10; // Evening relaxation
      readings.push({
        time: timeStr,
        value: Math.max(1, Math.min(99, randomInRange(rand, base - 8, base + 8))),
      });
    }
    const values = readings.map((r) => r.value);

    return {
      date,
      current: values[values.length - 1],
      avg,
      max: Math.max(...values),
      min: Math.min(...values),
      readings,
    };
  }

  async getSpO2(date: string): Promise<SpO2Data | null> {
    const rand = seededRandom(`${date}spo2`);
    // 20% chance of no SpO2 data
    if (rand() < 0.2) return null;

    const avg = randomInRange(rand, 95, 99);
    const readings: Array<{ time: string; value: number }> = [];
    for (let hour = 0; hour < 24; hour += 2) {
      const timeStr = `${hour.toString().padStart(2, "0")}:00`;
      readings.push({ time: timeStr, value: randomInRange(rand, avg - 2, Math.min(100, avg + 1)) });
    }
    const values = readings.map((r) => r.value);

    return {
      date,
      current: values[values.length - 1],
      avg,
      max: Math.max(...values),
      min: Math.min(...values),
      readings,
    };
  }

  async getBloodPressure(date: string): Promise<BloodPressureData | null> {
    const rand = seededRandom(`${date}bp`);
    // 25% chance of no data
    if (rand() < 0.25) return null;

    const readings: Array<{ time: string; systolic: number; diastolic: number }> = [];
    const numReadings = randomInRange(rand, 2, 3);
    const hours = [8, 14, 20];
    for (let i = 0; i < numReadings; i++) {
      readings.push({
        time: `${hours[i].toString().padStart(2, "0")}:00`,
        systolic: randomInRange(rand, 105, 140),
        diastolic: randomInRange(rand, 60, 90),
      });
    }

    const systolicValues = readings.map((r) => r.systolic);
    const diastolicValues = readings.map((r) => r.diastolic);

    return {
      date,
      latestSystolic: systolicValues[systolicValues.length - 1],
      latestDiastolic: diastolicValues[diastolicValues.length - 1],
      avgSystolic: Math.round(systolicValues.reduce((a, b) => a + b, 0) / systolicValues.length),
      avgDiastolic: Math.round(diastolicValues.reduce((a, b) => a + b, 0) / diastolicValues.length),
      readings,
    };
  }

  async getBloodGlucose(date: string): Promise<BloodGlucoseData | null> {
    const rand = seededRandom(`${date}glucose`);
    // 30% chance of no data
    if (rand() < 0.3) return null;

    const readings: Array<{ time: string; value: number }> = [];
    const hours = [7, 12, 18, 21];
    const numReadings = randomInRange(rand, 3, 4);
    for (let i = 0; i < numReadings; i++) {
      readings.push({
        time: `${hours[i].toString().padStart(2, "0")}:00`,
        value: Math.round((3.9 + rand() * 3.9) * 10) / 10, // 3.9 - 7.8 mmol/L
      });
    }

    const values = readings.map((r) => r.value);
    return {
      date,
      latest: values[values.length - 1],
      avg: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10,
      max: Math.max(...values),
      min: Math.min(...values),
      readings,
    };
  }

  async getBodyComposition(date: string): Promise<BodyCompositionData | null> {
    const rand = seededRandom(`${date}body`);
    // 30% chance of no data (not measured every day)
    if (rand() < 0.3) return null;

    const weight = Math.round((55 + rand() * 30) * 10) / 10; // 55-85 kg
    const height = Math.round(155 + rand() * 30); // 155-185 cm
    const heightM = height / 100;
    const bmi = Math.round((weight / (heightM * heightM)) * 10) / 10;
    const bodyFatRate = rand() > 0.5 ? Math.round((15 + rand() * 20) * 10) / 10 : undefined; // 15-35%

    return {
      date,
      weight,
      height,
      bmi,
      bodyFatRate,
      latestWeightDate: date,
    };
  }

  async getBodyTemperature(date: string): Promise<BodyTemperatureData | null> {
    const rand = seededRandom(`${date}temp`);
    // 30% chance of no data
    if (rand() < 0.3) return null;

    const readings: Array<{ time: string; value: number }> = [];
    const numReadings = randomInRange(rand, 1, 3);
    const hours = [8, 14, 20];
    for (let i = 0; i < numReadings; i++) {
      readings.push({
        time: `${hours[i].toString().padStart(2, "0")}:00`,
        value: Math.round((36.1 + rand() * 1.1) * 10) / 10, // 36.1 - 37.2
      });
    }

    const values = readings.map((r) => r.value);
    return {
      date,
      latest: values[values.length - 1],
      avg: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10,
      max: Math.max(...values),
      min: Math.min(...values),
      readings,
    };
  }

  async getNutrition(date: string): Promise<NutritionData | null> {
    const rand = seededRandom(`${date}nutrition`);
    // 20% chance of no data
    if (rand() < 0.2) return null;

    const meals: Array<{ time: string; calories: number }> = [
      { time: "08:00", calories: randomInRange(rand, 300, 600) },
      { time: "12:30", calories: randomInRange(rand, 500, 900) },
      { time: "19:00", calories: randomInRange(rand, 400, 800) },
    ];
    const totalCalories = meals.reduce((sum, m) => sum + m.calories, 0);

    return {
      date,
      totalCalories,
      protein: Math.round((totalCalories * 0.15) / 4), // ~15% from protein (4 kcal/g)
      fat: Math.round((totalCalories * 0.3) / 9), // ~30% from fat (9 kcal/g)
      carbs: Math.round((totalCalories * 0.55) / 4), // ~55% from carbs (4 kcal/g)
      water: randomInRange(rand, 1200, 2500),
      meals,
    };
  }

  async getMenstrualCycle(date: string): Promise<MenstrualCycleData | null> {
    const rand = seededRandom(`${date}cycle`);
    // 50% chance of no data (may not be applicable)
    if (rand() < 0.5) return null;

    const cycleLength = randomInRange(rand, 26, 32);
    const cycleDay = randomInRange(rand, 1, cycleLength);
    const _phases: Array<"menstrual" | "follicular" | "ovulatory" | "luteal"> = [
      "menstrual",
      "follicular",
      "ovulatory",
      "luteal",
    ];
    let phase: "menstrual" | "follicular" | "ovulatory" | "luteal";
    if (cycleDay <= 5) phase = "menstrual";
    else if (cycleDay <= 13) phase = "follicular";
    else if (cycleDay <= 16) phase = "ovulatory";
    else phase = "luteal";

    // Calculate period start date
    const d = new Date(date);
    d.setDate(d.getDate() - (cycleDay - 1));
    const periodStartDate = d.toISOString().split("T")[0];

    return {
      date,
      cycleDay,
      phase,
      periodStartDate,
      cycleLength,
      records: [{ date, status: phase }],
    };
  }

  async getVO2Max(date: string): Promise<VO2MaxData | null> {
    const rand = seededRandom(`${date}vo2max`);
    // 70% chance of data
    if (rand() < 0.3) return null;

    const value = randomInRange(rand, 35, 55);
    let level: VO2MaxData["level"];
    if (value < 35) level = "low";
    else if (value < 40) level = "fair";
    else if (value < 50) level = "good";
    else if (value <= 55) level = "excellent";
    else level = "superior";

    return { date, value, level };
  }

  async getEmotion(date: string): Promise<EmotionData | null> {
    const rand = seededRandom(`${date}emotion`);
    // 80% chance of data
    if (rand() < 0.2) return null;

    const emotions = ["calm", "happy", "stressed", "anxious", "excited"];
    const current = emotions[randomInRange(rand, 0, emotions.length - 1)];
    const score = randomInRange(rand, 40, 95);

    const hours = [8, 10, 12, 15, 18, 21];
    const numReadings = randomInRange(rand, 4, 6);
    const readings: Array<{ time: string; emotion: string; score: number }> = [];
    for (let i = 0; i < numReadings; i++) {
      readings.push({
        time: `${hours[i].toString().padStart(2, "0")}:00`,
        emotion: emotions[randomInRange(rand, 0, emotions.length - 1)],
        score: randomInRange(rand, 40, 95),
      });
    }

    return { date, current, score, readings };
  }

  async getHRV(date: string): Promise<HRVData | null> {
    const rand = seededRandom(`${date}hrv`);
    // 80% chance of data
    if (rand() < 0.2) return null;

    const rmssd = randomInRange(rand, 20, 80);
    const readings: Array<{ time: string; value: number }> = [];
    const numReadings = randomInRange(rand, 12, 18);
    for (let i = 0; i < numReadings; i++) {
      const hour = 6 + i;
      if (hour > 23) break;
      readings.push({
        time: `${hour.toString().padStart(2, "0")}:00`,
        value: randomInRange(rand, rmssd - 15, rmssd + 15),
      });
    }

    const values = readings.map((r) => r.value);
    return {
      date,
      rmssd,
      avg: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
      max: Math.max(...values),
      min: Math.min(...values),
      readings,
    };
  }

  async getWeeklySteps(endDate: string): Promise<Array<{ date: string; steps: number }>> {
    const result: Array<{ date: string; steps: number }> = [];
    const end = new Date(endDate);

    for (let i = 6; i >= 0; i--) {
      const d = new Date(end);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      const metrics = await this.getMetrics(dateStr);
      result.push({ date: dateStr, steps: metrics.steps });
    }

    return result;
  }

  async getWeeklySleep(endDate: string): Promise<Array<{ date: string; hours: number }>> {
    const result: Array<{ date: string; hours: number }> = [];
    const end = new Date(endDate);

    for (let i = 6; i >= 0; i--) {
      const d = new Date(end);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      const sleep = await this.getSleep(dateStr);
      result.push({ date: dateStr, hours: sleep?.durationHours ?? 0 });
    }

    return result;
  }
  async getMetricsRange(
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
  > {
    const result: Array<{
      date: string;
      steps: number;
      calories: number;
      distance: number;
      activeMinutes: number;
    }> = [];
    const current = new Date(startDate);
    const end = new Date(endDate);
    while (current <= end) {
      const dateStr = current.toISOString().split("T")[0];
      const m = await this.getMetrics(dateStr);
      result.push({
        date: dateStr,
        steps: m.steps,
        calories: m.calories,
        distance: m.distance,
        activeMinutes: m.activeMinutes,
      });
      current.setDate(current.getDate() + 1);
    }
    return result;
  }

  async getSleepRange(
    startDate: string,
    endDate: string
  ): Promise<Array<{ date: string; hours: number; qualityScore?: number }>> {
    const result: Array<{ date: string; hours: number; qualityScore?: number }> = [];
    const current = new Date(startDate);
    const end = new Date(endDate);
    while (current <= end) {
      const dateStr = current.toISOString().split("T")[0];
      const s = await this.getSleep(dateStr);
      result.push({ date: dateStr, hours: s?.durationHours ?? 0, qualityScore: s?.qualityScore });
      current.setDate(current.getDate() + 1);
    }
    return result;
  }

  async getHeartRateRange(
    startDate: string,
    endDate: string
  ): Promise<Array<{ date: string; avg: number; max: number; min: number }>> {
    const result: Array<{ date: string; avg: number; max: number; min: number }> = [];
    const current = new Date(startDate);
    const end = new Date(endDate);
    while (current <= end) {
      const dateStr = current.toISOString().split("T")[0];
      const hr = await this.getHeartRate(dateStr);
      result.push({ date: dateStr, avg: hr.restingAvg, max: hr.maxToday, min: hr.minToday });
      current.setDate(current.getDate() + 1);
    }
    return result;
  }

  async getWorkoutsRange(startDate: string, endDate: string): Promise<WorkoutData[]> {
    const result: WorkoutData[] = [];
    const current = new Date(startDate);
    const end = new Date(endDate);
    while (current <= end) {
      const dateStr = current.toISOString().split("T")[0];
      const workouts = await this.getWorkouts(dateStr);
      result.push(...workouts);
      current.setDate(current.getDate() + 1);
    }
    return result;
  }

  async getStressRange(
    startDate: string,
    endDate: string
  ): Promise<Array<{ date: string; avg: number; max: number; min: number }>> {
    const result: Array<{ date: string; avg: number; max: number; min: number }> = [];
    const current = new Date(startDate);
    const end = new Date(endDate);
    while (current <= end) {
      const dateStr = current.toISOString().split("T")[0];
      const rand = seededRandom(`${dateStr}stress-range`);
      const avg = randomInRange(rand, 20, 60);
      const max = avg + randomInRange(rand, 10, 30);
      const min = Math.max(1, avg - randomInRange(rand, 10, 20));
      result.push({ date: dateStr, avg, max, min });
      current.setDate(current.getDate() + 1);
    }
    return result;
  }

  async getSpO2Range(
    startDate: string,
    endDate: string
  ): Promise<Array<{ date: string; avg: number; max: number; min: number }>> {
    const result: Array<{ date: string; avg: number; max: number; min: number }> = [];
    const current = new Date(startDate);
    const end = new Date(endDate);
    while (current <= end) {
      const dateStr = current.toISOString().split("T")[0];
      const rand = seededRandom(`${dateStr}spo2-range`);
      const avg = randomInRange(rand, 95, 99);
      const max = Math.min(100, avg + randomInRange(rand, 0, 1));
      const min = avg - randomInRange(rand, 1, 3);
      result.push({ date: dateStr, avg, max, min });
      current.setDate(current.getDate() + 1);
    }
    return result;
  }

  async getBloodPressureRange(
    startDate: string,
    endDate: string
  ): Promise<Array<{ date: string; avgSystolic: number; avgDiastolic: number }>> {
    const result: Array<{ date: string; avgSystolic: number; avgDiastolic: number }> = [];
    const current = new Date(startDate);
    const end = new Date(endDate);
    while (current <= end) {
      const dateStr = current.toISOString().split("T")[0];
      const rand = seededRandom(`${dateStr}bp-range`);
      result.push({
        date: dateStr,
        avgSystolic: randomInRange(rand, 110, 135),
        avgDiastolic: randomInRange(rand, 70, 90),
      });
      current.setDate(current.getDate() + 1);
    }
    return result;
  }

  async getBodyCompositionRange(
    startDate: string,
    endDate: string
  ): Promise<Array<{ date: string; weight?: number; bmi?: number; bodyFatRate?: number }>> {
    const result: Array<{ date: string; weight?: number; bmi?: number; bodyFatRate?: number }> = [];
    const current = new Date(startDate);
    const end = new Date(endDate);
    while (current <= end) {
      const dateStr = current.toISOString().split("T")[0];
      const rand = seededRandom(`${dateStr}body-range`);
      // 30% chance of data per day
      if (rand() < 0.3) {
        current.setDate(current.getDate() + 1);
        continue;
      }
      const weight = Math.round((65 + rand() * 15) * 10) / 10; // 65-80 kg
      const heightM = 1.72; // assume fixed height for range queries
      const bmi = Math.round((weight / (heightM * heightM)) * 10) / 10;
      const bodyFatRate = Math.round((15 + rand() * 15) * 10) / 10; // 15-30%
      result.push({ date: dateStr, weight, bmi, bodyFatRate });
      current.setDate(current.getDate() + 1);
    }
    return result;
  }
}

// Default instance
export const mockDataSource = new MockDataSource();
