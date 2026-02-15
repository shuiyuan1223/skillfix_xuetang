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
 * Get all missing required fields
 */
export function getAllMissingFields(profile: UserProfile): RequiredField[] {
  return REQUIRED_FIELDS.filter((field) => {
    const value = profile[field.key as keyof UserProfile];
    return value === undefined || value === null;
  });
}

/**
 * Calculate profile completeness percentage
 */
export function getProfileCompleteness(profile: UserProfile): number {
  const total = REQUIRED_FIELDS.length;
  const filled = REQUIRED_FIELDS.filter((field) => {
    const value = profile[field.key as keyof UserProfile];
    return value !== undefined && value !== null;
  }).length;

  return Math.round((filled / total) * 100);
}
