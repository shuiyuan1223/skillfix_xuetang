/**
 * Tests for BenchmarkDataSource
 *
 * Validates:
 * - Relative date offset resolution (day_0 = today, day_-1 = yesterday)
 * - Missing data returns defaults (0 steps, null sleep, empty workouts)
 * - Weekly aggregation functions
 * - Range query methods
 * - Health data override merging
 */

import { describe, test, expect } from "bun:test";
import {
  BenchmarkDataSource,
  mergeFixtureOverrides,
  type FixtureHealthData,
} from "../../src/evolution/benchmark-data-source.js";

const baseDate = new Date("2026-02-17T12:00:00Z");

function dateStr(offset: number): string {
  const d = new Date(baseDate);
  d.setDate(d.getDate() + offset);
  return d.toISOString().split("T")[0];
}

const sampleFixture: FixtureHealthData = {
  metrics: {
    day_0: { steps: 8200, calories: 2100, activeMinutes: 60 },
    "day_-1": { steps: 6500, calories: 1950, activeMinutes: 45 },
    "day_-2": { steps: 11000, calories: 2400, activeMinutes: 85 },
  },
  heartRate: {
    day_0: {
      restingAvg: 65,
      maxToday: 175,
      minToday: 58,
      readings: [{ time: "08:00", value: 72 }],
    },
    "day_-1": { restingAvg: 68, maxToday: 160, minToday: 55, readings: [] },
  },
  sleep: {
    day_0: {
      durationHours: 7.2,
      qualityScore: 72,
      bedTime: "23:15",
      wakeTime: "06:27",
      stages: { deep: 80, light: 195, rem: 70, awake: 15 },
    },
    "day_-1": null,
    "day_-2": {
      durationHours: 6.0,
      qualityScore: 52,
      bedTime: "00:45",
      wakeTime: "06:45",
      stages: { deep: 55, light: 170, rem: 50, awake: 30 },
    },
  },
  workouts: {
    day_0: [
      {
        type: "running",
        durationMinutes: 35,
        caloriesBurned: 320,
        distanceKm: 5.2,
        avgHeartRate: 152,
      },
    ],
    "day_-1": [],
  },
};

describe("BenchmarkDataSource", () => {
  test("resolves day_0 to today's date", async () => {
    const ds = new BenchmarkDataSource(sampleFixture, baseDate);
    const today = dateStr(0);
    const metrics = await ds.getMetrics(today);
    expect(metrics.steps).toBe(8200);
    expect(metrics.calories).toBe(2100);
    expect(metrics.activeMinutes).toBe(60);
  });

  test("resolves day_-1 to yesterday's date", async () => {
    const ds = new BenchmarkDataSource(sampleFixture, baseDate);
    const yesterday = dateStr(-1);
    const metrics = await ds.getMetrics(yesterday);
    expect(metrics.steps).toBe(6500);
  });

  test("returns default metrics for missing date", async () => {
    const ds = new BenchmarkDataSource(sampleFixture, baseDate);
    const missing = dateStr(-5);
    const metrics = await ds.getMetrics(missing);
    expect(metrics.steps).toBe(0);
    expect(metrics.calories).toBe(0);
    expect(metrics.activeMinutes).toBe(0);
  });

  test("returns heart rate data with readings", async () => {
    const ds = new BenchmarkDataSource(sampleFixture, baseDate);
    const today = dateStr(0);
    const hr = await ds.getHeartRate(today);
    expect(hr.restingAvg).toBe(65);
    expect(hr.maxToday).toBe(175);
    expect(hr.readings).toHaveLength(1);
    expect(hr.readings[0].value).toBe(72);
  });

  test("returns null for explicitly null sleep data", async () => {
    const ds = new BenchmarkDataSource(sampleFixture, baseDate);
    const yesterday = dateStr(-1);
    const sleep = await ds.getSleep(yesterday);
    expect(sleep).toBeNull();
  });

  test("returns null for missing sleep data", async () => {
    const ds = new BenchmarkDataSource(sampleFixture, baseDate);
    const missing = dateStr(-5);
    const sleep = await ds.getSleep(missing);
    expect(sleep).toBeNull();
  });

  test("returns sleep data with stages", async () => {
    const ds = new BenchmarkDataSource(sampleFixture, baseDate);
    const today = dateStr(0);
    const sleep = await ds.getSleep(today);
    expect(sleep).not.toBeNull();
    expect(sleep!.durationHours).toBe(7.2);
    expect(sleep!.qualityScore).toBe(72);
  });

  test("returns workouts for day with data", async () => {
    const ds = new BenchmarkDataSource(sampleFixture, baseDate);
    const today = dateStr(0);
    const workouts = await ds.getWorkouts(today);
    expect(workouts).toHaveLength(1);
    expect(workouts[0].type).toBe("running");
    expect(workouts[0].durationMinutes).toBe(35);
  });

  test("returns empty array for day with no workouts", async () => {
    const ds = new BenchmarkDataSource(sampleFixture, baseDate);
    const yesterday = dateStr(-1);
    const workouts = await ds.getWorkouts(yesterday);
    expect(workouts).toHaveLength(0);
  });

  test("getWeeklySteps returns 7 days", async () => {
    const ds = new BenchmarkDataSource(sampleFixture, baseDate);
    const today = dateStr(0);
    const weekly = await ds.getWeeklySteps(today);
    expect(weekly).toHaveLength(7);
    // Last entry should be today
    expect(weekly[6].date).toBe(today);
    expect(weekly[6].steps).toBe(8200);
  });

  test("getWeeklySleep returns 7 days", async () => {
    const ds = new BenchmarkDataSource(sampleFixture, baseDate);
    const today = dateStr(0);
    const weekly = await ds.getWeeklySleep(today);
    expect(weekly).toHaveLength(7);
    expect(weekly[6].hours).toBe(7.2);
    // day_-1 was null sleep → 0 hours
    expect(weekly[5].hours).toBe(0);
  });

  test("getMetricsRange returns correct date range", async () => {
    const ds = new BenchmarkDataSource(sampleFixture, baseDate);
    const start = dateStr(-2);
    const end = dateStr(0);
    const range = await ds.getMetricsRange(start, end);
    expect(range).toHaveLength(3);
    expect(range[0].steps).toBe(11000);
    expect(range[2].steps).toBe(8200);
  });

  test("distance defaults to steps * 0.75 when not provided", async () => {
    const ds = new BenchmarkDataSource(sampleFixture, baseDate);
    const today = dateStr(0);
    const metrics = await ds.getMetrics(today);
    expect(metrics.distance).toBe(Math.floor(8200 * 0.75));
  });
});

describe("mergeFixtureOverrides", () => {
  test("returns base when no overrides", () => {
    const result = mergeFixtureOverrides(sampleFixture);
    expect(result).toBe(sampleFixture);
  });

  test("merges top-level object keys", () => {
    const overrides = {
      metrics: {
        day_0: { steps: 999, calories: 500, activeMinutes: 10 },
      },
    };
    const result = mergeFixtureOverrides(sampleFixture, overrides);
    // day_0 should be overridden, "day_-1" and "day_-2" should be preserved
    expect((result.metrics as any)["day_0"].steps).toBe(999);
    expect((result.metrics as any)["day_-1"].steps).toBe(6500);
  });

  test("replaces non-object values entirely", () => {
    const overrides = {
      workouts: [{ type: "yoga", durationMinutes: 30, caloriesBurned: 95 }],
    };
    const result = mergeFixtureOverrides(sampleFixture, overrides);
    expect(Array.isArray(result.workouts)).toBe(true);
  });
});
