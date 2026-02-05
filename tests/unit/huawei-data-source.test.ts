/**
 * Tests for Huawei Data Source
 *
 * Tests the data transformation layer that converts
 * Huawei API responses to PHA interface types.
 */

import { describe, test, expect } from "bun:test";

/**
 * Sleep stage calculation from HuaweiHealthDataSource.getSleep()
 * Huawei sleep_state: 1=awake, 2=light, 3=deep, 4=REM, 5=nap
 */
function calculateSleepStages(
  segments: Array<{ startTime: number; endTime: number; sleepType: number }>
): { deep: number; light: number; rem: number; awake: number } {
  const stages = { deep: 0, light: 0, rem: 0, awake: 0 };

  for (const seg of segments) {
    const duration = Math.round((seg.endTime - seg.startTime) / (60 * 1000));
    switch (seg.sleepType) {
      case 1:
        stages.awake += duration;
        break;
      case 2:
        stages.light += duration;
        break;
      case 3:
        stages.deep += duration;
        break;
      case 4:
        stages.rem += duration;
        break;
      case 5:
        stages.light += duration;
        break;
    }
  }

  return stages;
}

/**
 * Sleep quality score calculation
 * Returns percentage of deep + REM sleep
 */
function calculateSleepQualityScore(stages: {
  deep: number;
  light: number;
  rem: number;
  awake: number;
}): number {
  const sleepMinutes = stages.deep + stages.light + stages.rem;
  if (sleepMinutes === 0) return 0;
  return Math.round(((stages.deep + stages.rem) / sleepMinutes) * 100);
}

/**
 * Sleep duration in hours (1 decimal place)
 */
function calculateSleepDuration(totalMinutes: number): number {
  return Math.round((totalMinutes / 60) * 10) / 10;
}

/**
 * Map Huawei activity type to PHA workout type
 */
function mapActivityType(huaweiType: number): string {
  const map: Record<number, string> = {
    1: "running",
    2: "walking",
    3: "cycling",
    4: "swimming",
    5: "hiking",
    6: "workout",
    100: "strength",
    101: "yoga",
  };
  return map[huaweiType] || "other";
}

describe("Sleep Stage Calculation", () => {
  test("calculates stages from segments correctly", () => {
    const segments = [
      { startTime: 0, endTime: 60 * 60 * 1000, sleepType: 2 }, // 60 min light
      { startTime: 60 * 60 * 1000, endTime: 150 * 60 * 1000, sleepType: 3 }, // 90 min deep
      { startTime: 150 * 60 * 1000, endTime: 180 * 60 * 1000, sleepType: 4 }, // 30 min REM
      { startTime: 180 * 60 * 1000, endTime: 195 * 60 * 1000, sleepType: 1 }, // 15 min awake
    ];

    const stages = calculateSleepStages(segments);

    expect(stages.light).toBe(60);
    expect(stages.deep).toBe(90);
    expect(stages.rem).toBe(30);
    expect(stages.awake).toBe(15);
  });

  test("treats nap (type 5) as light sleep", () => {
    const segments = [{ startTime: 0, endTime: 20 * 60 * 1000, sleepType: 5 }];
    const stages = calculateSleepStages(segments);

    expect(stages.light).toBe(20);
    expect(stages.deep).toBe(0);
  });

  test("handles empty segments", () => {
    const stages = calculateSleepStages([]);

    expect(stages.light).toBe(0);
    expect(stages.deep).toBe(0);
    expect(stages.rem).toBe(0);
    expect(stages.awake).toBe(0);
  });

  test("handles unknown sleep types", () => {
    const segments = [{ startTime: 0, endTime: 30 * 60 * 1000, sleepType: 99 }];
    const stages = calculateSleepStages(segments);

    // Unknown types don't add to any category
    expect(stages.light).toBe(0);
    expect(stages.deep).toBe(0);
    expect(stages.rem).toBe(0);
    expect(stages.awake).toBe(0);
  });
});

describe("Sleep Quality Score", () => {
  test("calculates score based on deep + REM percentage", () => {
    const stages = { deep: 60, light: 120, rem: 30, awake: 10 };
    // Sleep minutes = 60 + 120 + 30 = 210
    // Quality = (60 + 30) / 210 = 90 / 210 = 0.428 -> 43%
    const score = calculateSleepQualityScore(stages);
    expect(score).toBe(43);
  });

  test("returns 0 for no sleep", () => {
    const stages = { deep: 0, light: 0, rem: 0, awake: 30 };
    const score = calculateSleepQualityScore(stages);
    expect(score).toBe(0);
  });

  test("returns 100 for all deep/REM sleep", () => {
    const stages = { deep: 60, light: 0, rem: 30, awake: 0 };
    const score = calculateSleepQualityScore(stages);
    expect(score).toBe(100);
  });

  test("handles typical sleep distribution", () => {
    // Typical night: 20% deep, 50% light, 25% REM, 5% awake
    const stages = { deep: 96, light: 240, rem: 120, awake: 24 };
    // Sleep minutes = 96 + 240 + 120 = 456
    // Quality = (96 + 120) / 456 = 216 / 456 = 0.473 -> 47%
    const score = calculateSleepQualityScore(stages);
    expect(score).toBe(47);
  });
});

describe("Sleep Duration", () => {
  test("converts minutes to hours with 1 decimal", () => {
    expect(calculateSleepDuration(480)).toBe(8.0); // 8 hours
    expect(calculateSleepDuration(450)).toBe(7.5); // 7.5 hours
    expect(calculateSleepDuration(390)).toBe(6.5); // 6.5 hours
  });

  test("handles non-round numbers", () => {
    expect(calculateSleepDuration(425)).toBe(7.1);
    expect(calculateSleepDuration(437)).toBe(7.3);
  });

  test("handles zero", () => {
    expect(calculateSleepDuration(0)).toBe(0);
  });
});

describe("Activity Type Mapping", () => {
  test("maps all known activity types", () => {
    expect(mapActivityType(1)).toBe("running");
    expect(mapActivityType(2)).toBe("walking");
    expect(mapActivityType(3)).toBe("cycling");
    expect(mapActivityType(4)).toBe("swimming");
    expect(mapActivityType(5)).toBe("hiking");
    expect(mapActivityType(6)).toBe("workout");
    expect(mapActivityType(100)).toBe("strength");
    expect(mapActivityType(101)).toBe("yoga");
  });

  test("returns 'other' for unknown types", () => {
    expect(mapActivityType(0)).toBe("other");
    expect(mapActivityType(999)).toBe("other");
    expect(mapActivityType(-1)).toBe("other");
  });
});

describe("Heart Rate Data Transformation", () => {
  /**
   * Transform heart rate API response to PHA format
   */
  function transformHeartRateData(
    date: string,
    apiResult: {
      avg: number;
      max: number;
      min: number;
      readings: Array<{ time: string; value: number }>;
    }
  ) {
    return {
      date,
      restingAvg: apiResult.avg,
      maxToday: apiResult.max,
      minToday: apiResult.min,
      readings: apiResult.readings,
    };
  }

  test("transforms API result to PHA format", () => {
    const apiResult = {
      avg: 72,
      max: 120,
      min: 55,
      readings: [
        { time: "08:00", value: 65 },
        { time: "12:00", value: 78 },
      ],
    };

    const result = transformHeartRateData("2025-01-15", apiResult);

    expect(result.date).toBe("2025-01-15");
    expect(result.restingAvg).toBe(72);
    expect(result.maxToday).toBe(120);
    expect(result.minToday).toBe(55);
    expect(result.readings).toHaveLength(2);
  });

  test("handles empty readings", () => {
    const apiResult = { avg: 0, max: 0, min: 0, readings: [] };
    const result = transformHeartRateData("2025-01-15", apiResult);

    expect(result.restingAvg).toBe(0);
    expect(result.maxToday).toBe(0);
    expect(result.minToday).toBe(0);
    expect(result.readings).toHaveLength(0);
  });
});

describe("Metrics Aggregation", () => {
  /**
   * Default metrics when API fails
   */
  function getDefaultMetrics(date: string) {
    return { date, steps: 0, distance: 0, calories: 0, activeMinutes: 0 };
  }

  test("returns zero values for default metrics", () => {
    const metrics = getDefaultMetrics("2025-01-15");

    expect(metrics.date).toBe("2025-01-15");
    expect(metrics.steps).toBe(0);
    expect(metrics.distance).toBe(0);
    expect(metrics.calories).toBe(0);
    expect(metrics.activeMinutes).toBe(0);
  });
});

describe("Workout Data Transformation", () => {
  /**
   * Transform activity record to PHA workout format
   */
  function transformWorkout(
    record: {
      id: string;
      activityType: number;
      duration: number;
      calories?: number;
      distance?: number;
      avgHeartRate?: number;
    },
    date: string
  ) {
    return {
      id: record.id,
      date,
      type: mapActivityType(record.activityType),
      durationMinutes: record.duration,
      caloriesBurned: record.calories || 0,
      distanceKm: record.distance ? record.distance / 1000 : undefined,
      avgHeartRate: record.avgHeartRate,
    };
  }

  test("transforms activity record to workout", () => {
    const record = {
      id: "workout-123",
      activityType: 1,
      duration: 30,
      calories: 250,
      distance: 5000,
      avgHeartRate: 145,
    };

    const workout = transformWorkout(record, "2025-01-15");

    expect(workout.id).toBe("workout-123");
    expect(workout.date).toBe("2025-01-15");
    expect(workout.type).toBe("running");
    expect(workout.durationMinutes).toBe(30);
    expect(workout.caloriesBurned).toBe(250);
    expect(workout.distanceKm).toBe(5);
    expect(workout.avgHeartRate).toBe(145);
  });

  test("handles missing optional fields", () => {
    const record = {
      id: "workout-456",
      activityType: 101,
      duration: 60,
    };

    const workout = transformWorkout(record, "2025-01-15");

    expect(workout.type).toBe("yoga");
    expect(workout.caloriesBurned).toBe(0);
    expect(workout.distanceKm).toBeUndefined();
    expect(workout.avgHeartRate).toBeUndefined();
  });

  test("converts distance from meters to kilometers", () => {
    const record = {
      id: "run",
      activityType: 1,
      duration: 45,
      distance: 10500, // 10.5 km in meters
    };

    const workout = transformWorkout(record, "2025-01-15");
    expect(workout.distanceKm).toBe(10.5);
  });
});
