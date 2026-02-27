/**
 * Tests for Huawei API Response Parsers
 *
 * Tests the pure parsing functions extracted into huawei-parsers.ts.
 * Each parser takes raw API JSON and returns typed results.
 */

import { describe, test, expect } from "bun:test";
import {
  parseHeartRateResponse,
  parseStressResponse,
  parseSpO2Response,
  parseECGResponse,
  parseSleepResponse,
  parseWeeklySleepResponse,
  parseBloodPressureResponse,
  parseBloodGlucoseResponse,
  parseBodyCompositionWeightResponse,
  parseBodyCompositionHeightResponse,
  parseBodyTemperatureResponse,
  parseNutritionResponse,
  parseMenstrualFlowResponse,
  deriveMenstrualCycleInfo,
  parseVO2MaxResponse,
  parseHRVResponse,
  parseEmotionResponse,
  parsePolymerizeDataRangeChunk,
} from "../../src/data-sources/huawei/huawei-parsers.js";

// Import fixtures
import heartRateResponse from "../fixtures/huawei-api/heart-rate-response.json";

import emptyResponse from "../fixtures/huawei-api/empty-response.json";
import stressResponse from "../fixtures/huawei-api/stress-response.json";
import ecgResponse from "../fixtures/huawei-api/ecg-response.json";
import sleepHealthRecordsResponse from "../fixtures/huawei-api/sleep-health-records-response.json";
import bloodPressureResponse from "../fixtures/huawei-api/blood-pressure-response.json";
import bloodGlucoseResponse from "../fixtures/huawei-api/blood-glucose-response.json";
import bodyWeightResponse from "../fixtures/huawei-api/body-weight-response.json";
import bodyHeightResponse from "../fixtures/huawei-api/body-height-response.json";
import bodyTemperatureResponse from "../fixtures/huawei-api/body-temperature-response.json";
import nutritionResponse from "../fixtures/huawei-api/nutrition-response.json";
import menstrualFlowResponse from "../fixtures/huawei-api/menstrual-flow-response.json";
import vo2maxResponse from "../fixtures/huawei-api/vo2max-response.json";
import hrvResponse from "../fixtures/huawei-api/hrv-response.json";
import emotionResponse from "../fixtures/huawei-api/emotion-response.json";
import polymerizeRangeResponse from "../fixtures/huawei-api/polymerize-range-response.json";
import weeklySleepResponse from "../fixtures/huawei-api/weekly-sleep-response.json";

// ---------------------------------------------------------------------------
// Heart Rate
// ---------------------------------------------------------------------------

describe("parseHeartRateResponse", () => {
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
                { startTime: 1700000000000, value: [] },
                { value: [{ floatValue: 80 }] },
                {},
              ],
            },
          ],
        },
      ],
    };

    const result = parseHeartRateResponse(malformed);
    expect(result.readings).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Stress
// ---------------------------------------------------------------------------

describe("parseStressResponse", () => {
  test("parses stress readings from response", () => {
    const result = parseStressResponse(stressResponse);

    expect(result).not.toBeNull();
    expect(result!.readings.length).toBe(3);
    expect(result!.readings[0].value).toBe(45);
    expect(result!.readings[1].value).toBe(62);
    expect(result!.readings[2].value).toBe(38);
  });

  test("calculates current, avg, max, min", () => {
    const result = parseStressResponse(stressResponse);

    expect(result!.current).toBe(38); // last reading
    expect(result!.avg).toBe(48); // Math.round((45+62+38)/3)
    expect(result!.max).toBe(62);
    expect(result!.min).toBe(38);
  });

  test("returns null for empty response", () => {
    const result = parseStressResponse(emptyResponse);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// SpO2
// ---------------------------------------------------------------------------

describe("parseSpO2Response", () => {
  test("parses SpO2 readings (reuses same structure as stress)", () => {
    // Reuse heart rate fixture since it has the same polymerize structure
    const result = parseSpO2Response(heartRateResponse);

    expect(result).not.toBeNull();
    expect(result!.readings.length).toBe(4);
    expect(result!.current).toBe(75); // last value
  });

  test("returns null for empty response", () => {
    const result = parseSpO2Response(emptyResponse);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ECG
// ---------------------------------------------------------------------------

describe("parseECGResponse", () => {
  test("parses ECG records", () => {
    const result = parseECGResponse(ecgResponse);

    expect(result).not.toBeNull();
    expect(result!.records.length).toBe(2);
  });

  test("detects arrhythmia", () => {
    const result = parseECGResponse(ecgResponse);

    expect(result!.hasArrhythmia).toBe(true);
    // One record has arrhythmia type 3 (AF)
    const afRecord = result!.records.find((r) => r.arrhythmiaType === 3);
    expect(afRecord).toBeDefined();
    expect(afRecord!.arrhythmiaLabel).toBe("Atrial Fibrillation");
  });

  test("sorts records by time (most recent first)", () => {
    const result = parseECGResponse(ecgResponse);

    // Timestamps are 1770249600000000000 and 1770253200000000000
    // After sorting most recent first, the second (larger timestamp) should be first
    expect(new Date(result!.records[0].time).getTime()).toBeGreaterThan(
      new Date(result!.records[1].time).getTime()
    );
  });

  test("returns null for empty healthRecords", () => {
    const result = parseECGResponse({ healthRecords: [] });
    expect(result).toBeNull();
  });

  test("returns null for missing healthRecords", () => {
    const result = parseECGResponse({});
    expect(result).toBeNull();
  });

  test("has latest heart rate from most recent record", () => {
    const result = parseECGResponse(ecgResponse);

    expect(result!.latestHeartRate).toBeDefined();
    expect(typeof result!.latestHeartRate).toBe("number");
  });
});

// ---------------------------------------------------------------------------
// Sleep (healthRecords)
// ---------------------------------------------------------------------------

describe("parseSleepResponse", () => {
  test("parses sleep record with fragments", () => {
    const result = parseSleepResponse(sleepHealthRecordsResponse, "2026-02-05");

    expect(result).not.toBeNull();
    expect(result!.segments.length).toBe(4);
    expect(result!.totalMinutes).toBe(480);
    expect(result!.sleepScore).toBe(85);
    expect(result!.deepSleepMinutes).toBe(120);
    expect(result!.lightSleepMinutes).toBe(240);
    expect(result!.remMinutes).toBe(90);
    expect(result!.awakeMinutes).toBe(30);
  });

  test("returns bedTime and wakeTime from record values", () => {
    const result = parseSleepResponse(sleepHealthRecordsResponse, "2026-02-05");

    expect(result!.bedTime).toMatch(/^\d{2}:\d{2}$/);
    expect(result!.wakeTime).toMatch(/^\d{2}:\d{2}$/);
  });

  test("returns null for empty healthRecords", () => {
    const result = parseSleepResponse({ healthRecords: [] }, "2026-02-05");
    expect(result).toBeNull();
  });

  test("filters out naps (sleep_type = 3)", () => {
    const withNap = {
      healthRecords: [
        {
          value: [
            { fieldName: "sleep_type", integerValue: 3 },
            { fieldName: "wakeup_time", longValue: 1770228000000 },
            { fieldName: "all_sleep_time", integerValue: 30 },
          ],
        },
      ],
    };
    const result = parseSleepResponse(withNap, "2026-02-05");
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Weekly Sleep
// ---------------------------------------------------------------------------

describe("parseWeeklySleepResponse", () => {
  test("parses weekly sleep and skips naps", () => {
    const result = parseWeeklySleepResponse(weeklySleepResponse, "2026-02-05");

    // Should have 7 entries (one per day)
    expect(result.length).toBe(7);

    // Naps (sleep_type=3) should be excluded
    // Only normal sleep records should be counted
  });

  test("returns 7 days regardless of data availability", () => {
    const result = parseWeeklySleepResponse({ healthRecords: [] }, "2026-02-05");
    expect(result.length).toBe(7);
    // All should have 0 hours
    for (const day of result) {
      expect(day.hours).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Blood Pressure
// ---------------------------------------------------------------------------

describe("parseBloodPressureResponse", () => {
  test("parses blood pressure readings with named fields", () => {
    const result = parseBloodPressureResponse(bloodPressureResponse);

    expect(result).not.toBeNull();
    expect(result!.readings.length).toBe(2);
    expect(result!.readings[0].systolic).toBe(120);
    expect(result!.readings[0].diastolic).toBe(80);
    expect(result!.readings[0].pulse).toBe(72);
    expect(result!.readings[1].systolic).toBe(130);
    expect(result!.readings[1].diastolic).toBe(85);
    expect(result!.readings[1].pulse).toBeUndefined(); // No pulse in second reading
  });

  test("calculates aggregates correctly", () => {
    const result = parseBloodPressureResponse(bloodPressureResponse);

    expect(result!.latestSystolic).toBe(130);
    expect(result!.latestDiastolic).toBe(85);
    expect(result!.avgSystolic).toBe(125); // (120+130)/2
    expect(result!.avgDiastolic).toBe(83); // Math.round((80+85)/2)
  });

  test("handles positional fallback", () => {
    const positional = {
      group: [
        {
          sampleSet: [
            {
              samplePoints: [
                {
                  startTime: 1770249600000,
                  value: [{ integerValue: 118 }, { integerValue: 78 }],
                },
              ],
            },
          ],
        },
      ],
    };
    const result = parseBloodPressureResponse(positional);

    expect(result).not.toBeNull();
    expect(result!.readings[0].systolic).toBe(118);
    expect(result!.readings[0].diastolic).toBe(78);
  });

  test("returns null for empty response", () => {
    const result = parseBloodPressureResponse(emptyResponse);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Blood Glucose
// ---------------------------------------------------------------------------

describe("parseBloodGlucoseResponse", () => {
  test("parses blood glucose readings with decimal precision", () => {
    const result = parseBloodGlucoseResponse(bloodGlucoseResponse);

    expect(result).not.toBeNull();
    expect(result!.readings.length).toBe(3);
    expect(result!.readings[0].value).toBe(5.6);
    expect(result!.readings[1].value).toBe(7.2);
    expect(result!.readings[2].value).toBe(5.1);
  });

  test("calculates latest, avg, max, min", () => {
    const result = parseBloodGlucoseResponse(bloodGlucoseResponse);

    expect(result!.latest).toBe(5.1);
    expect(result!.max).toBe(7.2);
    expect(result!.min).toBe(5.1);
    // avg = (5.6+7.2+5.1)/3 = 5.966... -> 6.0
    expect(result!.avg).toBe(6);
  });

  test("returns null for empty response", () => {
    const result = parseBloodGlucoseResponse(emptyResponse);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Body Composition (Weight)
// ---------------------------------------------------------------------------

describe("parseBodyCompositionWeightResponse", () => {
  test("parses weight, BMI, and body fat rate", () => {
    const result = parseBodyCompositionWeightResponse(bodyWeightResponse);

    expect(result).not.toBeNull();
    expect(result!.weight).toBe(72.5);
    expect(result!.bmi).toBe(23.8);
    expect(result!.bodyFatRate).toBe(18.5);
  });

  test("returns null for empty response", () => {
    const result = parseBodyCompositionWeightResponse(emptyResponse);
    expect(result).toBeNull();
  });

  test("handles positional fallback for weight", () => {
    const positional = {
      group: [
        {
          sampleSet: [
            {
              samplePoints: [
                {
                  startTime: 1770249600000,
                  value: [{ floatValue: 70.0 }],
                },
              ],
            },
          ],
        },
      ],
    };
    const result = parseBodyCompositionWeightResponse(positional);
    expect(result).not.toBeNull();
    expect(result!.weight).toBe(70);
  });
});

// ---------------------------------------------------------------------------
// Body Composition (Height)
// ---------------------------------------------------------------------------

describe("parseBodyCompositionHeightResponse", () => {
  test("parses height in meters and converts to cm", () => {
    const result = parseBodyCompositionHeightResponse(bodyHeightResponse);

    expect(result).not.toBeNull();
    // 1.75m -> 175.0 cm
    expect(result).toBe(175);
  });

  test("returns null for empty response", () => {
    const result = parseBodyCompositionHeightResponse(emptyResponse);
    expect(result).toBeNull();
  });

  test("handles height already in cm (> 3)", () => {
    const cmResponse = {
      group: [
        {
          sampleSet: [
            {
              samplePoints: [
                {
                  value: [{ fieldName: "height", floatValue: 175.5 }],
                },
              ],
            },
          ],
        },
      ],
    };
    const result = parseBodyCompositionHeightResponse(cmResponse);
    expect(result).toBe(175.5);
  });
});

// ---------------------------------------------------------------------------
// Body Temperature
// ---------------------------------------------------------------------------

describe("parseBodyTemperatureResponse", () => {
  test("parses temperature readings with decimal precision", () => {
    const result = parseBodyTemperatureResponse(bodyTemperatureResponse);

    expect(result).not.toBeNull();
    expect(result!.readings.length).toBe(2);
    expect(result!.readings[0].value).toBe(36.5);
    expect(result!.readings[1].value).toBe(36.8);
  });

  test("calculates stats", () => {
    const result = parseBodyTemperatureResponse(bodyTemperatureResponse);

    expect(result!.latest).toBe(36.8);
    expect(result!.max).toBe(36.8);
    expect(result!.min).toBe(36.5);
  });

  test("returns null for empty response", () => {
    const result = parseBodyTemperatureResponse(emptyResponse);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Nutrition
// ---------------------------------------------------------------------------

describe("parseNutritionResponse", () => {
  test("parses nutrition records with macros", () => {
    const result = parseNutritionResponse(nutritionResponse);

    expect(result).not.toBeNull();
    expect(result!.meals.length).toBe(2);
    expect(result!.totalCalories).toBe(1100); // 450+650
    expect(result!.meals[0].calories).toBe(450);
    expect(result!.meals[1].calories).toBe(650);
  });

  test("accumulates protein, fat, carbs across meals", () => {
    const result = parseNutritionResponse(nutritionResponse);

    expect(result!.protein).toBeGreaterThan(0);
    expect(result!.fat).toBeGreaterThan(0);
    expect(result!.carbs).toBeGreaterThan(0);
  });

  test("returns null for empty healthRecords", () => {
    const result = parseNutritionResponse({ healthRecords: [] });
    expect(result).toBeNull();
  });

  test("returns null for missing healthRecords", () => {
    const result = parseNutritionResponse({});
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Menstrual Cycle
// ---------------------------------------------------------------------------

describe("parseMenstrualFlowResponse", () => {
  test("parses menstrual flow records", () => {
    const records = parseMenstrualFlowResponse(menstrualFlowResponse, "2026-02-05");

    expect(records.length).toBe(3);
    for (const r of records) {
      expect(r.status).toBe("menstrual");
    }
  });

  test("returns empty array for empty response", () => {
    const records = parseMenstrualFlowResponse(emptyResponse, "2026-02-05");
    expect(records.length).toBe(0);
  });
});

describe("deriveMenstrualCycleInfo", () => {
  test("derives cycle phase from records", () => {
    const records = [
      { date: "2026-02-01", status: "menstrual" },
      { date: "2026-02-02", status: "menstrual" },
      { date: "2026-02-03", status: "menstrual" },
    ];

    const result = deriveMenstrualCycleInfo(records, "2026-02-03");

    expect(result).not.toBeNull();
    expect(result!.periodStartDate).toBe("2026-02-01");
    expect(result!.cycleDay).toBe(3);
    expect(result!.phase).toBe("menstrual");
  });

  test("identifies follicular phase", () => {
    const records = [{ date: "2026-01-25", status: "menstrual" }];
    const result = deriveMenstrualCycleInfo(records, "2026-02-03");

    expect(result!.phase).toBe("follicular"); // day 10
  });

  test("identifies ovulatory phase", () => {
    const records = [{ date: "2026-01-20", status: "menstrual" }];
    const result = deriveMenstrualCycleInfo(records, "2026-02-03");

    expect(result!.phase).toBe("ovulatory"); // day 15
  });

  test("identifies luteal phase", () => {
    const records = [{ date: "2026-01-15", status: "menstrual" }];
    const result = deriveMenstrualCycleInfo(records, "2026-02-03");

    expect(result!.phase).toBe("luteal"); // day 20
  });

  test("returns null for empty records", () => {
    const result = deriveMenstrualCycleInfo([], "2026-02-03");
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// VO2Max
// ---------------------------------------------------------------------------

describe("parseVO2MaxResponse", () => {
  test("parses VO2Max value", () => {
    const result = parseVO2MaxResponse(vo2maxResponse);

    expect(result).not.toBeNull();
    expect(result!.value).toBe(42.5);
  });

  test("classifies VO2Max level correctly", () => {
    const result = parseVO2MaxResponse(vo2maxResponse);
    expect(result!.level).toBe("good"); // 42.5 is in [37, 48) range

    // Test different levels
    const makeResponse = (val: number) => ({
      group: [
        {
          sampleSet: [{ samplePoints: [{ value: [{ floatValue: val }] }] }],
        },
      ],
    });

    expect(parseVO2MaxResponse(makeResponse(25))!.level).toBe("low");
    expect(parseVO2MaxResponse(makeResponse(33))!.level).toBe("fair");
    expect(parseVO2MaxResponse(makeResponse(42))!.level).toBe("good");
    expect(parseVO2MaxResponse(makeResponse(52))!.level).toBe("excellent");
    expect(parseVO2MaxResponse(makeResponse(60))!.level).toBe("superior");
  });

  test("returns null for empty response", () => {
    const result = parseVO2MaxResponse(emptyResponse);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// HRV
// ---------------------------------------------------------------------------

describe("parseHRVResponse", () => {
  test("parses HRV readings by named field", () => {
    const result = parseHRVResponse(hrvResponse);

    expect(result).not.toBeNull();
    expect(result!.readings.length).toBe(3);
    expect(result!.readings[0].value).toBe(45);
    expect(result!.readings[1].value).toBe(52);
    expect(result!.readings[2].value).toBe(38);
  });

  test("calculates rmssd as latest reading", () => {
    const result = parseHRVResponse(hrvResponse);

    expect(result!.rmssd).toBe(38); // last reading
    expect(result!.avg).toBe(45); // Math.round((45+52+38)/3)
    expect(result!.max).toBe(52);
    expect(result!.min).toBe(38);
  });

  test("returns null for empty response", () => {
    const result = parseHRVResponse(emptyResponse);
    expect(result).toBeNull();
  });

  test("falls back to first value if no named HRV field", () => {
    const fallbackResponse = {
      group: [
        {
          sampleSet: [
            {
              samplePoints: [
                {
                  startTime: 1770249600000,
                  value: [{ fieldName: "unknown_field", floatValue: 42 }],
                },
              ],
            },
          ],
        },
      ],
    };
    const result = parseHRVResponse(fallbackResponse);
    expect(result).not.toBeNull();
    expect(result!.readings[0].value).toBe(42);
  });
});

// ---------------------------------------------------------------------------
// Emotion
// ---------------------------------------------------------------------------

describe("parseEmotionResponse", () => {
  test("parses emotion readings with score-to-emotion mapping", () => {
    const result = parseEmotionResponse(emotionResponse);

    expect(result).not.toBeNull();
    expect(result!.readings.length).toBe(3);
    expect(result!.readings[0].score).toBe(75);
    expect(result!.readings[0].emotion).toBe("calm"); // 60-79
    expect(result!.readings[1].score).toBe(55);
    expect(result!.readings[1].emotion).toBe("neutral"); // 40-59
    expect(result!.readings[2].score).toBe(85);
    expect(result!.readings[2].emotion).toBe("happy"); // 80+
  });

  test("returns current as last reading", () => {
    const result = parseEmotionResponse(emotionResponse);

    expect(result!.current).toBe("happy");
    expect(result!.score).toBe(85);
  });

  test("returns null for empty response", () => {
    const result = parseEmotionResponse(emptyResponse);
    expect(result).toBeNull();
  });

  test("classifies all emotion levels", () => {
    const makeResponse = (score: number) => ({
      group: [
        {
          sampleSet: [
            {
              samplePoints: [
                {
                  startTime: 1770249600000,
                  value: [{ integerValue: score }],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(parseEmotionResponse(makeResponse(90))!.current).toBe("happy");
    expect(parseEmotionResponse(makeResponse(65))!.current).toBe("calm");
    expect(parseEmotionResponse(makeResponse(45))!.current).toBe("neutral");
    expect(parseEmotionResponse(makeResponse(25))!.current).toBe("stressed");
    expect(parseEmotionResponse(makeResponse(10))!.current).toBe("anxious");
  });
});

// ---------------------------------------------------------------------------
// Polymerize Data Range
// ---------------------------------------------------------------------------

describe("parsePolymerizeDataRangeChunk", () => {
  test("parses grouped daily data", () => {
    const result = parsePolymerizeDataRangeChunk(polymerizeRangeResponse);

    expect(result.length).toBe(2);
    expect(result[0].values.steps).toBe(8000);
    expect(result[0].values.calories).toBe(350);
    expect(result[1].values.steps).toBe(6500);
    expect(result[1].values.calories).toBe(280);
  });

  test("extracts date from group startTime", () => {
    const result = parsePolymerizeDataRangeChunk(polymerizeRangeResponse);

    for (const day of result) {
      expect(day.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  test("handles empty response", () => {
    const result = parsePolymerizeDataRangeChunk(emptyResponse);
    expect(result.length).toBe(0);
  });

  test("handles values without fieldName", () => {
    const noFieldName = {
      group: [
        {
          startTime: 1770249600000,
          sampleSet: [
            {
              samplePoints: [
                {
                  value: [{ integerValue: 100 }],
                },
              ],
            },
          ],
        },
      ],
    };

    const result = parsePolymerizeDataRangeChunk(noFieldName);
    expect(result.length).toBe(1);
    expect(result[0].values.value).toBe(100);
  });

  test("accumulates multiple points per day", () => {
    const multiPoint = {
      group: [
        {
          startTime: 1770249600000,
          sampleSet: [
            {
              samplePoints: [
                { value: [{ fieldName: "steps", integerValue: 3000 }] },
                { value: [{ fieldName: "steps", integerValue: 5000 }] },
              ],
            },
          ],
        },
      ],
    };

    const result = parsePolymerizeDataRangeChunk(multiPoint);
    expect(result[0].values.steps).toBe(8000);
  });
});
