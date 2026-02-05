/**
 * Tests for Huawei API Response Parsing
 *
 * Tests the parsing logic used in HuaweiHealthApi methods.
 * These are pure function tests extracted from the API logic.
 */

import { describe, test, expect } from "bun:test";

// Import fixtures
import heartRateResponse from "../fixtures/huawei-api/heart-rate-response.json";
import stepsResponse from "../fixtures/huawei-api/steps-response.json";
import sleepResponse from "../fixtures/huawei-api/sleep-response.json";
import emptyResponse from "../fixtures/huawei-api/empty-response.json";

/**
 * Parse heart rate response from Huawei API
 * Extracted from HuaweiHealthApi.getHeartRateData()
 */
function parseHeartRateResponse(json: unknown): {
  readings: Array<{ time: string; value: number }>;
  avg: number;
  max: number;
  min: number;
} {
  const data = json as { group?: Array<{ sampleSet?: Array<{ samplePoints?: Array<unknown> }> }> };
  const readings: Array<{ time: string; value: number }> = [];

  const groups = data.group || [];
  for (const group of groups) {
    const sampleSets = (group as { sampleSet?: unknown[] }).sampleSet || [];
    for (const sampleSet of sampleSets) {
      const points =
        (sampleSet as { samplePoints?: unknown[] }).samplePoints ||
        (sampleSet as { samplePoint?: unknown[] }).samplePoint ||
        [];
      for (const point of points) {
        const p = point as {
          startTime?: number;
          value?: Array<{ floatValue?: number; integerValue?: number }>;
        };
        let timestamp = p.startTime || 0;
        // Convert nanoseconds to milliseconds
        if (timestamp > 1e15) {
          timestamp = Math.floor(timestamp / 1e6);
        }
        const time = timestamp ? new Date(timestamp).toTimeString().slice(0, 5) : "00:00";

        const fieldValue = p.value?.[0];
        const value = Math.round(fieldValue?.floatValue ?? fieldValue?.integerValue ?? 0);
        if (value > 0) {
          readings.push({ time, value });
        }
      }
    }
  }

  const values = readings.map((r) => r.value);
  const avg = values.length > 0 ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0;
  const max = values.length > 0 ? Math.max(...values) : 0;
  const min = values.length > 0 ? Math.min(...values) : 0;

  return { readings, avg, max, min };
}

/**
 * Parse steps response from Huawei API
 * Extracted from polymerize aggregation logic
 */
function parseStepsResponse(json: unknown): number {
  const data = json as { group?: Array<{ sampleSet?: Array<{ samplePoints?: Array<unknown> }> }> };
  let totalSteps = 0;

  const groups = data.group || [];
  for (const group of groups) {
    const sampleSets = (group as { sampleSet?: unknown[] }).sampleSet || [];
    for (const sampleSet of sampleSets) {
      const points = (sampleSet as { samplePoints?: unknown[] }).samplePoints || [];
      for (const point of points) {
        const p = point as { value?: Array<{ integerValue?: number; floatValue?: number }> };
        const fieldValue = p.value?.[0];
        const value = fieldValue?.integerValue ?? fieldValue?.floatValue ?? 0;
        totalSteps += value;
      }
    }
  }

  return Math.round(totalSteps);
}

/**
 * Parse sleep segments from response
 * Extracted from HuaweiHealthApi.getSleepData()
 */
function parseSleepSegments(json: unknown): Array<{
  startTime: number;
  endTime: number;
  sleepState: number;
  sleepType: number;
}> {
  const data = json as { group?: Array<{ sampleSet?: Array<{ samplePoints?: Array<unknown> }> }> };
  const segments: Array<{
    startTime: number;
    endTime: number;
    sleepState: number;
    sleepType: number;
  }> = [];

  const groups = data.group || [];
  for (const group of groups) {
    const sampleSets = (group as { sampleSet?: unknown[] }).sampleSet || [];
    for (const sampleSet of sampleSets) {
      const points = (sampleSet as { samplePoints?: unknown[] }).samplePoints || [];
      for (const point of points) {
        const p = point as {
          startTime?: number;
          endTime?: number;
          value?: Array<{ fieldName?: string; integerValue?: number }>;
        };

        let startTime = p.startTime || 0;
        let endTime = p.endTime || 0;

        // Convert nanoseconds to milliseconds
        if (startTime > 1e15) startTime = Math.floor(startTime / 1e6);
        if (endTime > 1e15) endTime = Math.floor(endTime / 1e6);

        let sleepState = 0;
        let sleepType = 0;

        for (const field of p.value || []) {
          if (field.fieldName === "sleep_state") sleepState = field.integerValue || 0;
          if (field.fieldName === "sleep_type") sleepType = field.integerValue || 0;
        }

        if (startTime && endTime) {
          segments.push({ startTime, endTime, sleepState, sleepType });
        }
      }
    }
  }

  return segments;
}

/**
 * Calculate sleep stage durations from segments
 * sleep_state: 1=awake, 2=light, 3=deep, 4=REM, 5=nap
 */
function calculateSleepStages(
  segments: Array<{ startTime: number; endTime: number; sleepState: number }>
): {
  deep: number;
  light: number;
  rem: number;
  awake: number;
} {
  const stages = { deep: 0, light: 0, rem: 0, awake: 0 };

  for (const seg of segments) {
    const durationMinutes = Math.round((seg.endTime - seg.startTime) / (60 * 1000));

    switch (seg.sleepState) {
      case 1:
        stages.awake += durationMinutes;
        break;
      case 2:
        stages.light += durationMinutes;
        break;
      case 3:
        stages.deep += durationMinutes;
        break;
      case 4:
        stages.rem += durationMinutes;
        break;
      case 5:
        stages.light += durationMinutes; // Nap counted as light
        break;
    }
  }

  return stages;
}

/**
 * Convert nanosecond timestamp to millisecond timestamp
 */
function convertTimestamp(timestamp: number): number {
  if (timestamp > 1e15) {
    return Math.floor(timestamp / 1e6);
  }
  return timestamp;
}

describe("Heart Rate Parsing", () => {
  test("parses heart rate readings from response", () => {
    const result = parseHeartRateResponse(heartRateResponse);

    expect(result.readings.length).toBe(4);
    expect(result.readings[0].value).toBe(72);
    expect(result.readings[1].value).toBe(68);
    expect(result.readings[2].value).toBe(85);
    expect(result.readings[3].value).toBe(75);
  });

  test("calculates statistics correctly", () => {
    const result = parseHeartRateResponse(heartRateResponse);

    // avg of [72, 68, 85, 75] = 75
    expect(result.avg).toBe(75);
    expect(result.max).toBe(85);
    expect(result.min).toBe(68);
  });

  test("handles empty response", () => {
    const result = parseHeartRateResponse(emptyResponse);

    expect(result.readings.length).toBe(0);
    expect(result.avg).toBe(0);
    expect(result.max).toBe(0);
    expect(result.min).toBe(0);
  });

  test("converts nanosecond timestamps correctly", () => {
    const result = parseHeartRateResponse(heartRateResponse);

    // All readings should have valid time strings (HH:MM format)
    for (const reading of result.readings) {
      expect(reading.time).toMatch(/^\d{2}:\d{2}$/);
    }
  });

  test("handles missing fields gracefully", () => {
    const malformed = {
      group: [
        {
          sampleSet: [
            {
              samplePoints: [
                { startTime: 1700000000000, value: [] }, // No value
                { value: [{ floatValue: 80 }] }, // No timestamp
                {}, // Empty point
              ],
            },
          ],
        },
      ],
    };

    const result = parseHeartRateResponse(malformed);
    // Should handle gracefully without throwing
    expect(result.readings).toBeDefined();
  });
});

describe("Steps Parsing", () => {
  test("sums up steps from all sample points", () => {
    const result = parseStepsResponse(stepsResponse);

    // 1500 + 2300 + 1800 = 5600
    expect(result).toBe(5600);
  });

  test("handles empty response", () => {
    const result = parseStepsResponse(emptyResponse);
    expect(result).toBe(0);
  });
});

describe("Sleep Parsing", () => {
  test("parses sleep segments", () => {
    const segments = parseSleepSegments(sleepResponse);

    expect(segments.length).toBe(4);
    expect(segments[0].sleepState).toBe(2); // light
    expect(segments[1].sleepState).toBe(3); // deep
    expect(segments[2].sleepState).toBe(4); // REM
    expect(segments[3].sleepState).toBe(2); // light
  });

  test("converts nanosecond timestamps in segments", () => {
    const segments = parseSleepSegments(sleepResponse);

    for (const seg of segments) {
      // Should be in milliseconds (13 digits)
      expect(seg.startTime.toString().length).toBeLessThanOrEqual(13);
      expect(seg.endTime.toString().length).toBeLessThanOrEqual(13);
    }
  });

  test("handles empty sleep response", () => {
    const segments = parseSleepSegments(emptyResponse);
    expect(segments.length).toBe(0);
  });
});

describe("Sleep Stage Calculation", () => {
  test("calculates stage durations correctly", () => {
    const segments = [
      { startTime: 0, endTime: 60 * 60 * 1000, sleepState: 2 }, // 60 min light
      { startTime: 60 * 60 * 1000, endTime: 120 * 60 * 1000, sleepState: 3 }, // 60 min deep
      { startTime: 120 * 60 * 1000, endTime: 150 * 60 * 1000, sleepState: 4 }, // 30 min REM
      { startTime: 150 * 60 * 1000, endTime: 160 * 60 * 1000, sleepState: 1 }, // 10 min awake
    ];

    const stages = calculateSleepStages(segments);

    expect(stages.light).toBe(60);
    expect(stages.deep).toBe(60);
    expect(stages.rem).toBe(30);
    expect(stages.awake).toBe(10);
  });

  test("counts nap (type 5) as light sleep", () => {
    const segments = [
      { startTime: 0, endTime: 30 * 60 * 1000, sleepState: 5 }, // 30 min nap
    ];

    const stages = calculateSleepStages(segments);
    expect(stages.light).toBe(30);
  });

  test("handles empty segments", () => {
    const stages = calculateSleepStages([]);

    expect(stages.deep).toBe(0);
    expect(stages.light).toBe(0);
    expect(stages.rem).toBe(0);
    expect(stages.awake).toBe(0);
  });
});

describe("Timestamp Conversion", () => {
  test("converts nanosecond to millisecond timestamp", () => {
    const nanoseconds = 1770249600000000000;
    const milliseconds = convertTimestamp(nanoseconds);

    expect(milliseconds).toBe(1770249600000);
  });

  test("keeps millisecond timestamp unchanged", () => {
    const milliseconds = 1770249600000;
    const result = convertTimestamp(milliseconds);

    expect(result).toBe(1770249600000);
  });

  test("handles edge cases", () => {
    expect(convertTimestamp(0)).toBe(0);
    expect(convertTimestamp(1000000000000)).toBe(1000000000000); // 13 digits, keep as ms
    expect(convertTimestamp(1000000000000000000)).toBe(1000000000000); // 19 digits, convert
  });
});

describe("Statistics Calculation", () => {
  test("calculates average correctly", () => {
    const values = [72, 68, 85, 75];
    const avg = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
    expect(avg).toBe(75);
  });

  test("handles single value", () => {
    const values = [80];
    const avg = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
    expect(avg).toBe(80);
  });

  test("handles empty array", () => {
    const values: number[] = [];
    const avg =
      values.length > 0 ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0;
    expect(avg).toBe(0);
  });
});
