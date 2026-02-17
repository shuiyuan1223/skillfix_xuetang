/**
 * Info Collector - Profile completeness tracking
 */

import type { UserProfile, RequiredField } from "./types.js";

/**
 * Required fields that should be collected for personalized health advice
 */
export const REQUIRED_FIELDS: RequiredField[] = [
  {
    key: "gender",
    question: "为了更准确地分析您的健康数据，请问您的性别是？",
    options: ["男", "女"],
    parse: (answer: string) => (answer.includes("男") ? "male" : "female"),
  },
  {
    key: "birthYear",
    question: "请问您的出生年份是？这会帮助我计算您的目标心率区间等指标。",
    validate: (answer: string) => {
      const year = parseInt(answer);
      const currentYear = new Date().getFullYear();
      return !isNaN(year) && year > 1900 && year <= currentYear;
    },
    parse: (answer: string) => {
      const match = answer.match(/\d{4}/);
      return match ? parseInt(match[0]) : undefined;
    },
  },
  {
    key: "height",
    question: "请问您的身高是多少厘米？这有助于计算您的BMI等健康指标。",
    validate: (answer: string) => {
      const h = parseFloat(answer);
      return !isNaN(h) && h > 100 && h < 250;
    },
    parse: (answer: string) => {
      const match = answer.match(/\d+(\.\d+)?/);
      return match ? parseFloat(match[0]) : undefined;
    },
  },
  {
    key: "weight",
    question: "请问您目前的体重是多少公斤？",
    validate: (answer: string) => {
      const w = parseFloat(answer);
      return !isNaN(w) && w > 20 && w < 300;
    },
    parse: (answer: string) => {
      const match = answer.match(/\d+(\.\d+)?/);
      return match ? parseFloat(match[0]) : undefined;
    },
  },
];

/**
 * Get the next missing required field
 */
export function getNextMissingField(profile: UserProfile): RequiredField | null {
  for (const field of REQUIRED_FIELDS) {
    const value = profile[field.key as keyof UserProfile];
    if (value === undefined || value === null) {
      return field;
    }
  }
  return null;
}

/**
 * Get all missing required fields (for info collection prompts — core 4 only)
 */
export function getAllMissingFields(profile: UserProfile): RequiredField[] {
  return REQUIRED_FIELDS.filter((field) => {
    const value = profile[field.key as keyof UserProfile];
    return value === undefined || value === null;
  });
}

/**
 * Get all missing profile field keys (for UI display — all 14 fields)
 */
export function getAllMissingProfileKeys(profile: UserProfile): string[] {
  return ALL_PROFILE_FIELDS.filter((f) => {
    const value = f.getter(profile);
    if (value === undefined || value === null) return true;
    if (Array.isArray(value)) return value.length === 0;
    return false;
  }).map((f) => f.key);
}

/**
 * All profile fields displayed on the UI — used for completeness calculation.
 * Includes nested paths like "goals.primary" and "lifestyle.sleepSchedule".
 */
const ALL_PROFILE_FIELDS: Array<{ key: string; getter: (p: UserProfile) => unknown }> = [
  { key: "nickname", getter: (p) => p.nickname },
  { key: "gender", getter: (p) => p.gender },
  { key: "birthYear", getter: (p) => p.birthYear },
  { key: "height", getter: (p) => p.height },
  { key: "weight", getter: (p) => p.weight },
  { key: "conditions", getter: (p) => p.conditions },
  { key: "allergies", getter: (p) => p.allergies },
  { key: "medications", getter: (p) => p.medications },
  { key: "goals.primary", getter: (p) => p.goals?.primary },
  { key: "goals.dailySteps", getter: (p) => p.goals?.dailySteps },
  { key: "goals.sleepHours", getter: (p) => p.goals?.sleepHours },
  { key: "lifestyle.sleepSchedule", getter: (p) => p.lifestyle?.sleepSchedule },
  { key: "lifestyle.exercisePreference", getter: (p) => p.lifestyle?.exercisePreference },
  { key: "lifestyle.dietPreference", getter: (p) => p.lifestyle?.dietPreference },
];

/**
 * Calculate profile completeness percentage based on all displayed fields.
 */
export function getProfileCompleteness(profile: UserProfile): number {
  const total = ALL_PROFILE_FIELDS.length;
  const filled = ALL_PROFILE_FIELDS.filter((f) => {
    const value = f.getter(profile);
    if (value === undefined || value === null) return false;
    if (Array.isArray(value)) return value.length > 0;
    return true;
  }).length;

  return Math.round((filled / total) * 100);
}
