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
    const rand = seededRandom(date + "metrics");

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
    const rand = seededRandom(date + "heart");

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
    const rand = seededRandom(date + "sleep");

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
    const rand = seededRandom(date + "workout");

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
}

// Default instance
export const mockDataSource = new MockDataSource();
