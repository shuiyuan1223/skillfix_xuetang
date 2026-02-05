#!/usr/bin/env bun
/**
 * Huawei Health Kit API Explorer
 *
 * Systematically tests all known and potential health data endpoints
 * and saves results to .pha/api-cache/ for analysis.
 *
 * Usage: bun scripts/explore-huawei-api.ts
 */

import { huaweiHealthApi } from "../src/data-sources/huawei/huawei-api.js";
import { huaweiAuth } from "../src/data-sources/huawei/huawei-auth.js";
import { saveToFileCache } from "../src/data-sources/huawei/api-cache.js";
import { loadConfig } from "../src/utils/config.js";

// All known Huawei Health Kit data types based on documentation
// Reference: https://developer.huawei.com/consumer/cn/doc/hmscore-guides/scene-example-0000001050819089
// Reference: https://pub.dev/packages/huawei_health (Flutter SDK)
const POLYMERIZE_DATA_TYPES = [
  // ========== Steps & Activity ==========
  "com.huawei.continuous.steps.delta",
  "com.huawei.continuous.steps.total",
  "com.huawei.instantaneous.steps",
  "com.huawei.continuous.steps.rate",
  "com.huawei.continuous.steps.rate.statistics",

  // ========== Distance ==========
  "com.huawei.continuous.distance.delta",
  "com.huawei.continuous.distance.total",

  // ========== Calories ==========
  "com.huawei.continuous.calories.burnt",
  "com.huawei.continuous.calories.burnt.total",
  "com.huawei.continuous.calories.delta",
  "com.huawei.continuous.calories.total",
  "com.huawei.continuous.calories.bmr",
  "com.huawei.continuous.calories.consumed",
  "com.huawei.instantaneous.calories.bmr",

  // ========== Heart Rate ==========
  "com.huawei.instantaneous.heart_rate",
  "com.huawei.continuous.heart_rate.statistics",
  "com.huawei.instantaneous.heart_rate.resting",
  "com.huawei.instantaneous.heart_rate.max",
  "com.huawei.continuous.exercise.heart_rate",

  // ========== Blood Pressure ==========
  "com.huawei.instantaneous.blood_pressure",

  // ========== Blood Glucose ==========
  "com.huawei.instantaneous.blood_glucose",

  // ========== Blood Oxygen (SpO2) ==========
  "com.huawei.instantaneous.oxygen_saturation",
  "com.huawei.instantaneous.spo2",

  // ========== Body Temperature ==========
  "com.huawei.instantaneous.body_temperature",
  "com.huawei.instantaneous.skin_temperature",

  // ========== Weight & Body Composition ==========
  "com.huawei.instantaneous.body.weight",
  "com.huawei.instantaneous.body.height",
  "com.huawei.instantaneous.body.fat.rate",
  "com.huawei.instantaneous.body.bmi",
  "com.huawei.instantaneous.height",
  "com.huawei.instantaneous.weight",
  "com.huawei.continuous.body.fat.rate.statistics",
  "com.huawei.continuous.body.weight.statistics",
  "com.huawei.continuous.height.statistics",

  // ========== Sleep ==========
  "com.huawei.continuous.sleep",
  "com.huawei.continuous.sleep.segment",
  "com.huawei.continuous.sleep.statistics",
  "com.huawei.continuous.sleep.fragment",
  "com.huawei.instantaneous.sleep",
  "com.huawei.statistics.sleep",

  // ========== Stress ==========
  "com.huawei.instantaneous.stress",
  "com.huawei.continuous.stress.statistics",
  "com.huawei.instantaneous.stress.statistics",

  // ========== Activity ==========
  "com.huawei.continuous.activity.segment",
  "com.huawei.continuous.activity.duration",
  "com.huawei.continuous.activity.statistics",
  "com.huawei.instantaneous.activity",
  "com.huawei.instantaneous.activity.sample",

  // ========== Exercise ==========
  "com.huawei.continuous.exercise.heart_rate",
  "com.huawei.continuous.exercise.speed",
  "com.huawei.continuous.exercise.pace",
  "com.huawei.continuous.exercise.intensity",
  "com.huawei.continuous.exercise.intensity.statistics",
  "com.huawei.continuous.workout.duration",

  // ========== Speed & Power ==========
  "com.huawei.instantaneous.speed",
  "com.huawei.continuous.speed.statistics",
  "com.huawei.instantaneous.power.sample",
  "com.huawei.continuous.power.statistics",

  // ========== Location ==========
  "com.huawei.continuous.location.sample",
  "com.huawei.instantaneous.location.sample",
  "com.huawei.instantaneous.location.trace",
  "com.huawei.continuous.location.boundary.range",

  // ========== Cycling ==========
  "com.huawei.continuous.biking.wheel.rotation.total",
  "com.huawei.instantaneous.biking.wheel.rotation",
  "com.huawei.continuous.biking.pedaling.total",
  "com.huawei.instantaneous.biking.pedaling.rate",

  // ========== Hydration ==========
  "com.huawei.instantaneous.hydration",
  "com.huawei.instantaneous.hydrate",

  // ========== Nutrition ==========
  "com.huawei.instantaneous.nutrition",
  "com.huawei.instantaneous.nutrition.facts",
  "com.huawei.continuous.nutrition.facts.statistics",

  // ========== Menstruation ==========
  "com.huawei.instantaneous.menstrual_cycle",
  "com.huawei.instantaneous.menstruation",

  // ========== VO2 Max & Fitness ==========
  "com.huawei.instantaneous.vo2max",
];

// Health Record data types (accessed via /healthRecords endpoint)
const HEALTH_RECORD_DATA_TYPES = [
  "com.huawei.health.record.sleep",
  "com.huawei.health.record.heartRate",
  "com.huawei.health.record.bloodPressure",
  "com.huawei.health.record.bloodGlucose",
  "com.huawei.health.record.stress",
  "com.huawei.health.record.weight",
  "com.huawei.health.record.exercise",
  "com.huawei.health.record.menstruation",
];

// Sub data types for health records
const SUB_DATA_TYPES = [
  "com.huawei.continuous.sleep.fragment",
  "com.huawei.sleep.on_off_bed_record",
];

interface TestResult {
  dataType: string;
  endpoint: string;
  success: boolean;
  status?: number;
  hasData: boolean;
  sampleCount?: number;
  fields?: string[];
  error?: string;
}

async function testPolymerizeDataType(
  dataTypeName: string,
  accessToken: string,
  clientId: string,
  startTime: number,
  endTime: number
): Promise<TestResult> {
  const config = loadConfig();
  const apiBase = config.dataSources.huawei?.apiBaseUrl || "https://health-api.cloud.huawei.com";
  const url = `${apiBase}/healthkit/v2/sampleSet:polymerize`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "x-client-id": clientId,
      },
      body: JSON.stringify({
        polymerizeWith: [{ dataTypeName }],
        startTime,
        endTime,
      }),
    });

    const text = await response.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    // Save to cache
    saveToFileCache(
      `explore/polymerize/${dataTypeName}`,
      { dataTypeName, startTime, endTime },
      data
    );

    if (!response.ok) {
      return {
        dataType: dataTypeName,
        endpoint: "polymerize",
        success: false,
        status: response.status,
        hasData: false,
        error: data.error?.message || text.slice(0, 100),
      };
    }

    // Extract sample count and fields
    const groups = data.group || [];
    let sampleCount = 0;
    const fields = new Set<string>();

    for (const group of groups) {
      for (const sampleSet of group.sampleSet || []) {
        const points = sampleSet.samplePoints || [];
        sampleCount += points.length;
        for (const point of points) {
          for (const v of point.value || []) {
            if (v.fieldName) fields.add(v.fieldName);
          }
        }
      }
    }

    return {
      dataType: dataTypeName,
      endpoint: "polymerize",
      success: true,
      status: response.status,
      hasData: sampleCount > 0,
      sampleCount,
      fields: Array.from(fields),
    };
  } catch (error) {
    return {
      dataType: dataTypeName,
      endpoint: "polymerize",
      success: false,
      hasData: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function testHealthRecordDataType(
  dataType: string,
  accessToken: string,
  clientId: string,
  startTime: number,
  endTime: number
): Promise<TestResult> {
  const config = loadConfig();
  const apiBase = config.dataSources.huawei?.apiBaseUrl || "https://health-api.cloud.huawei.com";

  const params = new URLSearchParams({
    startTime: startTime.toString(),
    endTime: endTime.toString(),
    dataType,
  });

  // Add sub data types
  for (const subType of SUB_DATA_TYPES) {
    params.append("subDataType", subType);
  }

  const url = `${apiBase}/healthkit/v2/healthRecords?${params}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "x-client-id": clientId,
      },
    });

    const text = await response.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    // Save to cache
    saveToFileCache(`explore/healthRecords/${dataType}`, { dataType, startTime, endTime }, data);

    if (!response.ok) {
      return {
        dataType,
        endpoint: "healthRecords",
        success: false,
        status: response.status,
        hasData: false,
        error: data.error?.message || text.slice(0, 100),
      };
    }

    const records = data.healthRecords || [];
    const fields = new Set<string>();

    for (const record of records) {
      for (const v of record.value || []) {
        if (v.fieldName) fields.add(v.fieldName);
      }
    }

    return {
      dataType,
      endpoint: "healthRecords",
      success: true,
      status: response.status,
      hasData: records.length > 0,
      sampleCount: records.length,
      fields: Array.from(fields),
    };
  } catch (error) {
    return {
      dataType,
      endpoint: "healthRecords",
      success: false,
      hasData: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function testActivityRecords(
  accessToken: string,
  clientId: string,
  startTime: number,
  endTime: number
): Promise<TestResult> {
  const config = loadConfig();
  const apiBase = config.dataSources.huawei?.apiBaseUrl || "https://health-api.cloud.huawei.com";

  const params = new URLSearchParams({
    startTime: Math.floor(startTime / 1000000).toString(), // milliseconds
    endTime: Math.floor(endTime / 1000000).toString(),
  });

  const url = `${apiBase}/healthkit/v2/activityRecords?${params}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "x-client-id": clientId,
      },
    });

    const text = await response.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    saveToFileCache("explore/activityRecords", { startTime, endTime }, data);

    if (!response.ok) {
      return {
        dataType: "activityRecords",
        endpoint: "activityRecords",
        success: false,
        status: response.status,
        hasData: false,
        error: data.error?.message || text.slice(0, 100),
      };
    }

    const records = data.activityRecord || data.activityRecords || [];

    return {
      dataType: "activityRecords",
      endpoint: "activityRecords",
      success: true,
      status: response.status,
      hasData: records.length > 0,
      sampleCount: records.length,
    };
  } catch (error) {
    return {
      dataType: "activityRecords",
      endpoint: "activityRecords",
      success: false,
      hasData: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function testDataCollectors(accessToken: string, clientId: string): Promise<TestResult> {
  const config = loadConfig();
  const apiBase = config.dataSources.huawei?.apiBaseUrl || "https://health-api.cloud.huawei.com";
  const url = `${apiBase}/healthkit/v2/dataCollectors`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "x-client-id": clientId,
      },
    });

    const text = await response.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    saveToFileCache("explore/dataCollectors", {}, data);

    const collectors = data.dataCollector || [];

    return {
      dataType: "dataCollectors",
      endpoint: "dataCollectors",
      success: response.ok,
      status: response.status,
      hasData: collectors.length > 0,
      sampleCount: collectors.length,
    };
  } catch (error) {
    return {
      dataType: "dataCollectors",
      endpoint: "dataCollectors",
      success: false,
      hasData: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  console.log("=".repeat(60));
  console.log("Huawei Health Kit API Explorer");
  console.log("=".repeat(60));
  console.log();

  // Get access token
  let accessToken: string;
  try {
    accessToken = await huaweiAuth.ensureValidToken();
    console.log("✓ Access token obtained");
  } catch (error) {
    console.error("✗ Failed to get access token:", error);
    process.exit(1);
  }

  const config = loadConfig();
  const clientId = config.dataSources.huawei?.clientId || "";

  // Time ranges
  const now = Date.now();

  // polymerize API: uses MILLISECONDS, max 1 day
  const oneDayAgo = now - 1 * 24 * 60 * 60 * 1000;
  const polymerizeStart = oneDayAgo; // milliseconds
  const polymerizeEnd = now;

  // healthRecords API: uses NANOSECONDS (19 digits), can use longer range
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
  const healthRecordStart = thirtyDaysAgo * 1000000; // nanoseconds
  const healthRecordEnd = now * 1000000;

  console.log(
    `\nPolymerize range: ${new Date(oneDayAgo).toISOString()} to ${new Date(now).toISOString()} (1 day, ms)`
  );
  console.log(
    `HealthRecords range: ${new Date(thirtyDaysAgo).toISOString()} to ${new Date(now).toISOString()} (30 days, ns)`
  );
  console.log();

  const results: TestResult[] = [];

  // Test polymerize data types
  console.log("-".repeat(60));
  console.log("Testing Polymerize Data Types");
  console.log("-".repeat(60));

  for (const dataType of POLYMERIZE_DATA_TYPES) {
    const result = await testPolymerizeDataType(
      dataType,
      accessToken,
      clientId,
      polymerizeStart,
      polymerizeEnd
    );
    results.push(result);

    const status = result.success ? (result.hasData ? "✓" : "○") : "✗";
    const info = result.success
      ? result.hasData
        ? `${result.sampleCount} samples, fields: ${result.fields?.join(", ") || "none"}`
        : "no data"
      : result.error?.slice(0, 50);
    console.log(`${status} ${dataType}`);
    if (result.hasData || !result.success) {
      console.log(`    ${info}`);
    }
  }

  // Test health records
  console.log();
  console.log("-".repeat(60));
  console.log("Testing Health Records");
  console.log("-".repeat(60));

  for (const dataType of HEALTH_RECORD_DATA_TYPES) {
    const result = await testHealthRecordDataType(
      dataType,
      accessToken,
      clientId,
      healthRecordStart,
      healthRecordEnd
    );
    results.push(result);

    const status = result.success ? (result.hasData ? "✓" : "○") : "✗";
    const info = result.success
      ? result.hasData
        ? `${result.sampleCount} records, fields: ${result.fields?.join(", ") || "none"}`
        : "no data"
      : result.error?.slice(0, 50);
    console.log(`${status} ${dataType}`);
    if (result.hasData || !result.success) {
      console.log(`    ${info}`);
    }
  }

  // Test activity records
  console.log();
  console.log("-".repeat(60));
  console.log("Testing Activity Records");
  console.log("-".repeat(60));

  const activityResult = await testActivityRecords(
    accessToken,
    clientId,
    healthRecordStart,
    healthRecordEnd
  );
  results.push(activityResult);
  console.log(
    `${activityResult.success ? (activityResult.hasData ? "✓" : "○") : "✗"} activityRecords: ${
      activityResult.hasData
        ? `${activityResult.sampleCount} records`
        : activityResult.error || "no data"
    }`
  );

  // Test data collectors
  const collectorsResult = await testDataCollectors(accessToken, clientId);
  results.push(collectorsResult);
  console.log(
    `${collectorsResult.success ? (collectorsResult.hasData ? "✓" : "○") : "✗"} dataCollectors: ${
      collectorsResult.hasData
        ? `${collectorsResult.sampleCount} collectors`
        : collectorsResult.error || "no data"
    }`
  );

  // Summary
  console.log();
  console.log("=".repeat(60));
  console.log("Summary");
  console.log("=".repeat(60));

  const successful = results.filter((r) => r.success);
  const withData = results.filter((r) => r.hasData);
  const failed = results.filter((r) => !r.success);

  console.log(`Total tested: ${results.length}`);
  console.log(`✓ Successful: ${successful.length}`);
  console.log(`  With data: ${withData.length}`);
  console.log(`  No data: ${successful.length - withData.length}`);
  console.log(`✗ Failed: ${failed.length}`);

  console.log();
  console.log("Data types with data:");
  for (const r of withData) {
    console.log(`  - ${r.dataType} (${r.endpoint}): ${r.sampleCount} samples`);
  }

  // Save summary
  saveToFileCache(
    "explore/summary",
    {},
    {
      timestamp: new Date().toISOString(),
      timeRanges: {
        polymerize: { start: new Date(oneDayAgo).toISOString(), end: new Date(now).toISOString() },
        healthRecords: {
          start: new Date(thirtyDaysAgo).toISOString(),
          end: new Date(now).toISOString(),
        },
      },
      results,
      summary: {
        total: results.length,
        successful: successful.length,
        withData: withData.length,
        failed: failed.length,
      },
    }
  );

  console.log();
  console.log("Results saved to .pha/api-cache/explore/");
}

main().catch(console.error);
