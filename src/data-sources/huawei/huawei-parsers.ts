/**
 * Huawei Health API Response Parsers
 *
 * Pure functions that parse raw Huawei API JSON responses into typed results.
 * Extracted from HuaweiHealthApi methods to reduce cyclomatic complexity.
 */

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Convert a nanosecond timestamp (19 digits) to milliseconds. */
function toMs(timestamp: number): number {
  if (timestamp > 1e15) {
    return Math.floor(timestamp / 1e6);
  }
  return timestamp;
}

/** Format a timestamp (ms) to "HH:MM" in Asia/Shanghai timezone. */
function fmtTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyJson = any;

/** Helper to get a named field value from a Huawei value array. */
function getFieldValue(
  values: Array<{
    fieldName?: string;
    integerValue?: number;
    longValue?: number;
    floatValue?: number;
  }>,
  fieldName: string
): number | null {
  const field = values.find((v) => v.fieldName === fieldName);
  if (!field) {
    return null;
  }
  return field.integerValue ?? field.longValue ?? field.floatValue ?? null;
}

// ---------------------------------------------------------------------------
// Shared types for time-series readings
// ---------------------------------------------------------------------------

export interface TimeValueReading {
  time: string;
  value: number;
}

export interface ReadingsWithStats {
  readings: TimeValueReading[];
  avg: number;
  max: number;
  min: number;
}

export interface ReadingsWithStatsCurrent extends ReadingsWithStats {
  current: number;
}

// ---------------------------------------------------------------------------
// Generic polymerize point iteration helper
// ---------------------------------------------------------------------------

interface PolymerizeGroup {
  sampleSet?: Array<{
    samplePoints?: AnyJson[];
    samplePoint?: AnyJson[];
  }>;
}

function iteratePoints(json: AnyJson): AnyJson[] {
  const points: AnyJson[] = [];
  const groups: PolymerizeGroup[] = json?.group || [];
  for (const group of groups) {
    for (const sampleSet of group.sampleSet || []) {
      for (const point of sampleSet.samplePoints || sampleSet.samplePoint || []) {
        points.push(point);
      }
    }
  }
  return points;
}

// ---------------------------------------------------------------------------
// Generic time-value readings parser (heart rate, stress, SpO2, temperature, blood glucose)
// ---------------------------------------------------------------------------

interface SimpleReadingsOptions {
  /** Round value to 1 decimal place instead of integer */
  decimalPlace?: boolean;
}

function parseSimpleReadings(json: AnyJson, opts?: SimpleReadingsOptions): TimeValueReading[] {
  const readings: TimeValueReading[] = [];
  for (const point of iteratePoints(json)) {
    let timestamp = point.startTime;
    if (timestamp > 1e15) {
      timestamp = Math.floor(timestamp / 1e6);
    }
    const time = timestamp ? fmtTime(timestamp) : '00:00';
    const fieldValue = point.value?.[0];
    const raw: number = fieldValue?.floatValue ?? fieldValue?.integerValue ?? 0;
    if (raw > 0) {
      const value = opts?.decimalPlace ? Math.round(raw * 10) / 10 : Math.round(raw);
      readings.push({ time, value });
    }
  }
  return readings;
}

function computeStats(values: number[]): { avg: number; max: number; min: number } {
  if (values.length === 0) {
    return { avg: 0, max: 0, min: 0 };
  }
  return {
    avg: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
    max: Math.max(...values),
    min: Math.min(...values),
  };
}

function computeStatsDecimal(values: number[]): { avg: number; max: number; min: number } {
  if (values.length === 0) {
    return { avg: 0, max: 0, min: 0 };
  }
  return {
    avg: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10,
    max: Math.max(...values),
    min: Math.min(...values),
  };
}

// ---------------------------------------------------------------------------
// parseHeartRateResponse
// ---------------------------------------------------------------------------

export function parseHeartRateResponse(json: AnyJson): ReadingsWithStats {
  const readings = parseSimpleReadings(json);
  const values = readings.map((r) => r.value);
  const stats = computeStats(values);
  return { readings, ...stats };
}

// ---------------------------------------------------------------------------
// parseStressResponse
// ---------------------------------------------------------------------------

export function parseStressResponse(json: AnyJson): ReadingsWithStatsCurrent | null {
  const readings = parseSimpleReadings(json);
  if (readings.length === 0) {
    return null;
  }
  const values = readings.map((r) => r.value);
  const stats = computeStats(values);
  return { readings, current: values[values.length - 1], ...stats };
}

// ---------------------------------------------------------------------------
// parseSpO2Response
// ---------------------------------------------------------------------------

export function parseSpO2Response(json: AnyJson): ReadingsWithStatsCurrent | null {
  const readings = parseSimpleReadings(json);
  if (readings.length === 0) {
    return null;
  }
  const values = readings.map((r) => r.value);
  const stats = computeStats(values);
  return { readings, current: values[values.length - 1], ...stats };
}

// ---------------------------------------------------------------------------
// parseECGResponse
// ---------------------------------------------------------------------------

export interface ECGRecord {
  time: string;
  avgHeartRate: number;
  arrhythmiaType: number;
  arrhythmiaLabel: string;
  ecgType: number;
}

export interface ECGResult {
  records: ECGRecord[];
  latestHeartRate: number | null;
  hasArrhythmia: boolean;
}

const ARRHYTHMIA_LABELS: Record<number, string> = {
  1: 'Normal',
  2: 'Sinus Arrhythmia',
  3: 'Atrial Fibrillation',
  4: 'Premature Ventricular Contraction',
  5: 'Wide QRS Complex',
  6: 'Unknown',
};

export function parseECGResponse(json: AnyJson): ECGResult | null {
  const healthRecords: AnyJson[] = json?.healthRecords || [];
  if (healthRecords.length === 0) {
    return null;
  }

  const records: ECGRecord[] = [];

  for (const record of healthRecords) {
    const recGetValue = (fieldName: string): number | null => {
      const field = record.value?.find((v: AnyJson) => v.fieldName === fieldName);
      return field?.integerValue ?? field?.longValue ?? field?.floatValue ?? null;
    };

    let timestamp = record.startTime;
    if (timestamp > 1e15) {
      timestamp = Math.floor(timestamp / 1e6);
    }
    const time = new Date(timestamp).toISOString();

    const avgHeartRate = recGetValue('avg_heart_rate') || 0;
    const arrhythmiaType = recGetValue('ecg_arrhythmia_type') || 1;
    const ecgType = recGetValue('ecg_type') || 1;

    records.push({
      time,
      avgHeartRate: Math.round(avgHeartRate),
      arrhythmiaType,
      arrhythmiaLabel: ARRHYTHMIA_LABELS[arrhythmiaType] || 'Unknown',
      ecgType,
    });
  }

  records.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

  return {
    records,
    latestHeartRate: records.length > 0 ? records[0].avgHeartRate : null,
    hasArrhythmia: records.some((r) => r.arrhythmiaType > 1),
  };
}

// ---------------------------------------------------------------------------
// parseSleepResponse
// ---------------------------------------------------------------------------

export interface SleepResult {
  segments: Array<{ startTime: number; endTime: number; sleepType: number }>;
  totalMinutes: number;
  bedTime: string;
  wakeTime: string;
  sleepScore?: number;
  deepSleepMinutes?: number;
  lightSleepMinutes?: number;
  remMinutes?: number;
  awakeMinutes?: number;
}

/** Filter out naps and sort by wakeup time, returning only normal sleep records. */
function filterNormalSleepRecords(healthRecords: AnyJson[]): AnyJson[] {
  return healthRecords
    .filter((r: AnyJson) => {
      const sleepType = r.value?.find((v: AnyJson) => v.fieldName === 'sleep_type')?.integerValue;
      return sleepType !== 3;
    })
    .sort((a: AnyJson, b: AnyJson) => {
      const timeA = a.value?.find((v: AnyJson) => v.fieldName === 'wakeup_time')?.longValue || 0;
      const timeB = b.value?.find((v: AnyJson) => v.fieldName === 'wakeup_time')?.longValue || 0;
      return timeB - timeA;
    });
}

/** Find the main sleep record for targetDate, or fall back to the most recent. */
function findMainSleepRecord(records: AnyJson[], targetDate: string): AnyJson {
  const targetDayStart = new Date(targetDate);
  targetDayStart.setHours(0, 0, 0, 0);
  const targetDayEnd = new Date(targetDate);
  targetDayEnd.setHours(23, 59, 59, 999);

  const match = records.find((r: AnyJson) => {
    const wakeupTime = r.value?.find((v: AnyJson) => v.fieldName === 'wakeup_time')?.longValue;
    if (wakeupTime) {
      const wakeupDate = new Date(wakeupTime);
      return wakeupDate >= targetDayStart && wakeupDate <= targetDayEnd;
    }
    return false;
  });
  return match || records[0];
}

/** Parse sleep fragment segments from a record's subData. */
function parseSleepFragments(record: AnyJson): Array<{ startTime: number; endTime: number; sleepType: number }> {
  const segments: Array<{ startTime: number; endTime: number; sleepType: number }> = [];
  const fragmentData = record.subData?.['com.huawei.continuous.sleep.fragment'];
  if (!fragmentData?.samplePoints) {
    return segments;
  }

  for (const point of fragmentData.samplePoints) {
    const start = toMs(point.startTime || 0);
    const end = toMs(point.endTime || 0);
    const sleepState = point.value?.find((v: AnyJson) => v.fieldName === 'sleep_state')?.integerValue || 0;
    if (start && end && sleepState) {
      segments.push({ startTime: start, endTime: end, sleepType: sleepState });
    }
  }
  segments.sort((a, b) => a.startTime - b.startTime);
  return segments;
}

export function parseSleepResponse(json: AnyJson, targetDate: string): SleepResult | null {
  const healthRecords: AnyJson[] = json?.healthRecords || [];
  if (healthRecords.length === 0) {
    return null;
  }

  const normalSleepRecords = filterNormalSleepRecords(healthRecords);
  if (normalSleepRecords.length === 0) {
    return null;
  }

  const mainRecord = findMainSleepRecord(normalSleepRecords, targetDate);

  // Extract sleep record values
  const getValue = (fieldName: string): number | null => {
    const field = mainRecord.value?.find((v: AnyJson) => v.fieldName === fieldName);
    return field?.integerValue ?? field?.longValue ?? null;
  };

  const fallAsleepTime = getValue('fall_asleep_time');
  const wakeupTime = getValue('wakeup_time');
  const allSleepTime = getValue('all_sleep_time');
  const sleepScore = getValue('sleep_score');

  const segments = parseSleepFragments(mainRecord);

  let bedTime = '00:00';
  if (fallAsleepTime) {
    bedTime = fmtTime(fallAsleepTime);
  } else if (segments.length > 0) {
    bedTime = fmtTime(segments[0].startTime);
  }

  let wakeTime = '00:00';
  if (wakeupTime) {
    wakeTime = fmtTime(wakeupTime);
  } else if (segments.length > 0) {
    wakeTime = fmtTime(segments[segments.length - 1].endTime);
  }

  return {
    segments,
    totalMinutes: allSleepTime || 0,
    bedTime,
    wakeTime,
    sleepScore: sleepScore || undefined,
    deepSleepMinutes: getValue('deep_sleep_time') || undefined,
    lightSleepMinutes: getValue('light_sleep_time') || undefined,
    remMinutes: getValue('dream_time') || undefined,
    awakeMinutes: getValue('awake_time') || undefined,
  };
}

// ---------------------------------------------------------------------------
// parseWeeklySleepResponse
// ---------------------------------------------------------------------------

/** Format a Date to "YYYY-MM-DD" string. */
function formatDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Get a named field value from a Huawei healthRecord value array. */
function getRecordFieldValue(record: AnyJson, fieldName: string): number | undefined {
  const field = record.value?.find((v: AnyJson) => v.fieldName === fieldName);
  return field?.integerValue ?? field?.longValue ?? undefined;
}

/** Build a Map of date -> best sleep data from healthRecords (skips naps). */
function buildSleepByDateMap(healthRecords: AnyJson[]): Map<string, { hours: number; sleepScore?: number }> {
  const sleepByDate = new Map<string, { hours: number; sleepScore?: number }>();

  for (const record of healthRecords) {
    if (getRecordFieldValue(record, 'sleep_type') === 3) {
      continue;
    }

    const wakeupTime = getRecordFieldValue(record, 'wakeup_time');
    const allSleepTime = getRecordFieldValue(record, 'all_sleep_time');
    if (!wakeupTime || !allSleepTime) {
      continue;
    }

    const wakeupDate = formatDateStr(new Date(wakeupTime));
    const hours = Math.round((allSleepTime / 60) * 10) / 10;
    const sleepScore = getRecordFieldValue(record, 'sleep_score');

    if (!sleepByDate.has(wakeupDate) || sleepByDate.get(wakeupDate)!.hours < hours) {
      sleepByDate.set(wakeupDate, { hours, sleepScore });
    }
  }
  return sleepByDate;
}

export function parseWeeklySleepResponse(
  json: AnyJson,
  endDate: string
): Array<{ date: string; hours: number; sleepScore?: number }> {
  const healthRecords: AnyJson[] = json?.healthRecords || [];
  const sleepByDate = buildSleepByDateMap(healthRecords);

  const end = new Date(endDate);
  const result: Array<{ date: string; hours: number; sleepScore?: number }> = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    const dateStr = formatDateStr(d);
    const data = sleepByDate.get(dateStr);
    result.push({ date: dateStr, hours: data?.hours || 0, sleepScore: data?.sleepScore });
  }

  return result;
}

// ---------------------------------------------------------------------------
// parseBloodPressureResponse
// ---------------------------------------------------------------------------

export interface BPReading {
  time: string;
  systolic: number;
  diastolic: number;
  pulse?: number;
}

export interface BloodPressureResult {
  readings: BPReading[];
  latestSystolic: number;
  latestDiastolic: number;
  avgSystolic: number;
  avgDiastolic: number;
}

/** Extract systolic, diastolic, and pulse from a single blood pressure data point. */
function extractBPValues(point: AnyJson): { systolic: number; diastolic: number; pulse: number } {
  let systolic = 0;
  let diastolic = 0;
  let pulse = 0;
  const values = point.value || [];
  for (const v of values) {
    const val = Math.round(v.floatValue ?? v.integerValue ?? 0);
    if (v.fieldName === 'systolic_pressure') {
      systolic = val;
    } else if (v.fieldName === 'diastolic_pressure') {
      diastolic = val;
    } else if (v.fieldName === 'sphygmus') {
      pulse = val;
    }
  }
  // Fallback: positional (value[0] = systolic, value[1] = diastolic)
  if (systolic === 0 && diastolic === 0 && values.length >= 2) {
    systolic = Math.round(values[0].floatValue ?? values[0].integerValue ?? 0);
    diastolic = Math.round(values[1].floatValue ?? values[1].integerValue ?? 0);
  }
  return { systolic, diastolic, pulse };
}

export function parseBloodPressureResponse(json: AnyJson): BloodPressureResult | null {
  const readings: BPReading[] = [];

  for (const point of iteratePoints(json)) {
    let timestamp = point.startTime;
    if (timestamp > 1e15) {
      timestamp = Math.floor(timestamp / 1e6);
    }
    const time = timestamp ? fmtTime(timestamp) : '00:00';

    const { systolic, diastolic, pulse } = extractBPValues(point);
    if (systolic > 0 || diastolic > 0) {
      readings.push({ time, systolic, diastolic, pulse: pulse > 0 ? pulse : undefined });
    }
  }

  if (readings.length === 0) {
    return null;
  }

  const systolicValues = readings.map((r) => r.systolic);
  const diastolicValues = readings.map((r) => r.diastolic);
  return {
    readings,
    latestSystolic: systolicValues[systolicValues.length - 1],
    latestDiastolic: diastolicValues[diastolicValues.length - 1],
    avgSystolic: Math.round(systolicValues.reduce((a, b) => a + b, 0) / systolicValues.length),
    avgDiastolic: Math.round(diastolicValues.reduce((a, b) => a + b, 0) / diastolicValues.length),
  };
}

// ---------------------------------------------------------------------------
// parseBloodGlucoseResponse
// ---------------------------------------------------------------------------

export interface BloodGlucoseResult {
  readings: TimeValueReading[];
  latest: number;
  avg: number;
  max: number;
  min: number;
}

export function parseBloodGlucoseResponse(json: AnyJson): BloodGlucoseResult | null {
  const readings = parseSimpleReadings(json, { decimalPlace: true });
  if (readings.length === 0) {
    return null;
  }
  const values = readings.map((r) => r.value);
  const stats = computeStatsDecimal(values);
  return { readings, latest: values[values.length - 1], ...stats };
}

// ---------------------------------------------------------------------------
// parseBodyCompositionWeightResponse / parseBodyCompositionHeightResponse
// ---------------------------------------------------------------------------

export interface WeightData {
  weight?: number;
  bmi?: number;
  bodyFatRate?: number;
  date?: string;
}

/** Extract weight, bmi, bodyFatRate from a single body composition data point. */
function extractWeightFields(point: AnyJson): Omit<WeightData, 'date'> {
  const entry: Omit<WeightData, 'date'> = {};
  for (const v of point.value || []) {
    const val: number = v.floatValue ?? v.integerValue ?? 0;
    if (v.fieldName === 'body_weight' && val > 0) {
      entry.weight = Math.round(val * 10) / 10;
    } else if (v.fieldName === 'bmi' && val > 0) {
      entry.bmi = Math.round(val * 10) / 10;
    } else if (v.fieldName === 'body_fat_rate' && val > 0) {
      entry.bodyFatRate = Math.round(val * 10) / 10;
    }
  }
  // Fallback: positional value[0] as weight
  if (!entry.weight && point.value?.[0]) {
    const val: number = point.value[0].floatValue ?? point.value[0].integerValue ?? 0;
    if (val > 0) {
      entry.weight = Math.round(val * 10) / 10;
    }
  }
  return entry;
}

export function parseBodyCompositionWeightResponse(json: AnyJson): WeightData | null {
  let latest: WeightData | null = null;
  for (const point of iteratePoints(json)) {
    let timestamp = point.startTime;
    if (timestamp > 1e15) {
      timestamp = Math.floor(timestamp / 1e6);
    }
    const pointDate = timestamp ? new Date(timestamp).toISOString().split('T')[0] : undefined;

    const fields = extractWeightFields(point);
    if (fields.weight) {
      latest = { date: pointDate, ...fields };
    }
  }
  return latest;
}

export function parseBodyCompositionHeightResponse(json: AnyJson): number | null {
  let latestHeight: number | null = null;
  for (const point of iteratePoints(json)) {
    let heightVal = 0;
    for (const v of point.value || []) {
      if (v.fieldName === 'height') {
        heightVal = v.floatValue ?? v.integerValue ?? 0;
      }
    }
    if (heightVal === 0 && point.value?.[0]) {
      heightVal = point.value[0].floatValue ?? point.value[0].integerValue ?? 0;
    }
    if (heightVal > 0) {
      // Huawei API returns height in meters; convert to cm
      latestHeight = heightVal <= 3 ? Math.round(heightVal * 100 * 10) / 10 : Math.round(heightVal * 10) / 10;
    }
  }
  return latestHeight;
}

// ---------------------------------------------------------------------------
// parseBodyTemperatureResponse
// ---------------------------------------------------------------------------

export interface BodyTemperatureResult {
  readings: TimeValueReading[];
  latest: number;
  avg: number;
  max: number;
  min: number;
}

export function parseBodyTemperatureResponse(json: AnyJson): BodyTemperatureResult | null {
  const readings = parseSimpleReadings(json, { decimalPlace: true });
  if (readings.length === 0) {
    return null;
  }
  const values = readings.map((r) => r.value);
  const stats = computeStatsDecimal(values);
  return { readings, latest: values[values.length - 1], ...stats };
}

// ---------------------------------------------------------------------------
// parseNutritionResponse
// ---------------------------------------------------------------------------

export interface NutritionResult {
  totalCalories: number;
  protein?: number;
  fat?: number;
  carbs?: number;
  water?: number;
  meals: Array<{ time: string; calories: number }>;
}

export function parseNutritionResponse(json: AnyJson): NutritionResult | null {
  const healthRecords: AnyJson[] = json?.healthRecords || [];
  if (healthRecords.length === 0) {
    return null;
  }

  const meals: Array<{ time: string; calories: number }> = [];
  let totalCalories = 0;
  let protein: number | undefined;
  let fat: number | undefined;
  let carbs: number | undefined;

  for (const record of healthRecords) {
    const recGetValue = (fieldName: string): number | null => {
      const field = record.value?.find((v: AnyJson) => v.fieldName === fieldName);
      return field?.floatValue ?? field?.integerValue ?? field?.longValue ?? null;
    };

    let timestamp = record.startTime;
    if (timestamp > 1e15) {
      timestamp = Math.floor(timestamp / 1e6);
    }
    const time = timestamp ? fmtTime(timestamp) : '00:00';

    const energy = recGetValue('dietaryEnergy') || 0;
    const mealProtein = recGetValue('protein');
    const mealFat = recGetValue('fat');
    const mealCarbs = recGetValue('carbohydrates');

    if (energy > 0) {
      totalCalories += Math.round(energy);
      meals.push({ time, calories: Math.round(energy) });
    }
    if (mealProtein !== null) {
      protein = (protein || 0) + Math.round(mealProtein * 10) / 10;
    }
    if (mealFat !== null) {
      fat = (fat || 0) + Math.round(mealFat * 10) / 10;
    }
    if (mealCarbs !== null) {
      carbs = (carbs || 0) + Math.round(mealCarbs * 10) / 10;
    }
  }

  if (totalCalories === 0 && meals.length === 0) {
    return null;
  }

  return { totalCalories, protein, fat, carbs, water: undefined, meals };
}

// ---------------------------------------------------------------------------
// parseMenstrualCycleResponse
// ---------------------------------------------------------------------------

export interface MenstrualCycleResult {
  cycleDay?: number;
  phase?: 'menstrual' | 'follicular' | 'ovulatory' | 'luteal';
  periodStartDate?: string;
  cycleLength?: number;
  records: Array<{ date: string; status: string }>;
}

export function parseMenstrualFlowResponse(
  json: AnyJson,
  fallbackDate: string
): Array<{ date: string; status: string }> {
  const records: Array<{ date: string; status: string }> = [];
  for (const point of iteratePoints(json)) {
    let timestamp = point.startTime;
    if (timestamp > 1e15) {
      timestamp = Math.floor(timestamp / 1e6);
    }
    const pointDate = timestamp ? new Date(timestamp).toISOString().split('T')[0] : fallbackDate;

    let volume = 0;
    for (const v of point.value || []) {
      if (v.fieldName === 'volume') {
        volume = v.integerValue ?? v.floatValue ?? 0;
      }
    }
    if (volume > 0) {
      records.push({ date: pointDate, status: 'menstrual' });
    }
  }
  return records;
}

export function deriveMenstrualCycleInfo(
  records: Array<{ date: string; status: string }>,
  queryDate: string
): MenstrualCycleResult | null {
  if (records.length === 0) {
    return null;
  }

  records.sort((a, b) => a.date.localeCompare(b.date));
  const periodStartDate = records[0].date;

  let cycleDay: number | undefined;
  let phase: 'menstrual' | 'follicular' | 'ovulatory' | 'luteal' | undefined;
  const daysDiff = Math.floor(
    (new Date(queryDate).getTime() - new Date(periodStartDate).getTime()) / (1000 * 60 * 60 * 24)
  );
  cycleDay = daysDiff + 1;
  if (cycleDay <= 5) {
    phase = 'menstrual';
  } else if (cycleDay <= 13) {
    phase = 'follicular';
  } else if (cycleDay <= 16) {
    phase = 'ovulatory';
  } else {
    phase = 'luteal';
  }

  return { cycleDay, phase, periodStartDate, cycleLength: undefined, records };
}

// ---------------------------------------------------------------------------
// parseVO2MaxResponse
// ---------------------------------------------------------------------------

export interface VO2MaxResult {
  value: number;
  level: 'low' | 'fair' | 'good' | 'excellent' | 'superior';
}

export function parseVO2MaxResponse(json: AnyJson): VO2MaxResult | null {
  let latestValue = 0;
  for (const point of iteratePoints(json)) {
    const fieldValue = point.value?.[0];
    const value: number = fieldValue?.floatValue ?? fieldValue?.integerValue ?? 0;
    if (value > 0) {
      latestValue = value;
    }
  }

  if (latestValue === 0) {
    return null;
  }

  let level: 'low' | 'fair' | 'good' | 'excellent' | 'superior';
  if (latestValue < 30) {
    level = 'low';
  } else if (latestValue < 37) {
    level = 'fair';
  } else if (latestValue < 48) {
    level = 'good';
  } else if (latestValue < 55) {
    level = 'excellent';
  } else {
    level = 'superior';
  }

  return { value: Math.round(latestValue * 10) / 10, level };
}

// ---------------------------------------------------------------------------
// parseHRVResponse
// ---------------------------------------------------------------------------

export interface HRVResult {
  rmssd: number;
  avg: number;
  max: number;
  min: number;
  readings: TimeValueReading[];
}

export function parseHRVResponse(json: AnyJson): HRVResult | null {
  const readings: TimeValueReading[] = [];

  for (const point of iteratePoints(json)) {
    let timestamp = point.startTime;
    if (timestamp > 1e15) {
      timestamp = Math.floor(timestamp / 1e6);
    }
    const time = timestamp ? fmtTime(timestamp) : '00:00';

    let hrvValue = 0;
    for (const v of point.value || []) {
      const val: number = v.floatValue ?? v.integerValue ?? 0;
      if (v.fieldName === 'rmssd' || v.fieldName === 'hrv' || v.fieldName === 'heart_rate_variability') {
        hrvValue = val;
        break;
      }
    }
    // Fallback: first value
    if (hrvValue === 0 && point.value?.[0]) {
      hrvValue = point.value[0].floatValue ?? point.value[0].integerValue ?? 0;
    }
    if (hrvValue > 0) {
      readings.push({ time, value: Math.round(hrvValue) });
    }
  }

  if (readings.length === 0) {
    return null;
  }

  const values = readings.map((r) => r.value);
  return {
    rmssd: values[values.length - 1],
    avg: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
    max: Math.max(...values),
    min: Math.min(...values),
    readings,
  };
}

// ---------------------------------------------------------------------------
// parseEmotionResponse
// ---------------------------------------------------------------------------

export interface EmotionReading {
  time: string;
  emotion: string;
  score: number;
}

export interface EmotionResult {
  current: string;
  score: number;
  readings: EmotionReading[];
}

function emotionFromScore(score: number): string {
  if (score >= 80) {
    return 'happy';
  }
  if (score >= 60) {
    return 'calm';
  }
  if (score >= 40) {
    return 'neutral';
  }
  if (score >= 20) {
    return 'stressed';
  }
  return 'anxious';
}

export function parseEmotionResponse(json: AnyJson): EmotionResult | null {
  const readings: EmotionReading[] = [];

  for (const point of iteratePoints(json)) {
    let timestamp = point.startTime;
    if (timestamp > 1e15) {
      timestamp = Math.floor(timestamp / 1e6);
    }
    const time = timestamp ? fmtTime(timestamp) : '00:00';

    const fieldValue = point.value?.[0];
    const score = Math.round(fieldValue?.floatValue ?? fieldValue?.integerValue ?? 0);
    if (score > 0) {
      readings.push({ time, emotion: emotionFromScore(score), score });
    }
  }

  if (readings.length === 0) {
    return null;
  }

  const latestReading = readings[readings.length - 1];
  return { current: latestReading.emotion, score: latestReading.score, readings };
}

// ---------------------------------------------------------------------------
// parsePolymerizeDataRangeChunk
// ---------------------------------------------------------------------------

export function parsePolymerizeDataRangeChunk(json: AnyJson): Array<{ date: string; values: Record<string, number> }> {
  const result: Array<{ date: string; values: Record<string, number> }> = [];
  const groups: AnyJson[] = json?.group || [];

  for (const group of groups) {
    let groupStart = group.startTime;
    if (groupStart > 1e15) {
      groupStart = Math.floor(groupStart / 1e6);
    }
    const groupDate = groupStart ? new Date(groupStart).toISOString().split('T')[0] : undefined;
    if (!groupDate) {
      continue;
    }

    const dayValues: Record<string, number> = {};
    for (const sampleSet of group.sampleSet || []) {
      for (const point of sampleSet.samplePoints || sampleSet.samplePoint || []) {
        for (const v of point.value || []) {
          const val: number = v.floatValue ?? v.integerValue ?? 0;
          if (v.fieldName) {
            dayValues[v.fieldName] = (dayValues[v.fieldName] || 0) + val;
          } else {
            dayValues.value = (dayValues.value || 0) + val;
          }
        }
      }
    }

    if (Object.keys(dayValues).length > 0) {
      result.push({ date: groupDate, values: dayValues });
    }
  }

  return result;
}

// Re-export getFieldValue for external use
export { getFieldValue, toMs, fmtTime };
