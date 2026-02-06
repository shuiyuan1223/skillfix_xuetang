/**
 * Info Collector - Gather missing profile information through conversation
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

/**
 * Context for deciding whether to ask for info
 */
export interface AskContext {
  messageCount: number;
  lastAskedAt?: number;
  sessionStartedAt: number;
}

/**
 * Decide whether to ask for missing info
 */
export function shouldAskForInfo(profile: UserProfile, context: AskContext): boolean {
  // Don't ask on the first message - let user speak first
  if (context.messageCount < 2) {
    return false;
  }

  // Don't ask too frequently (at most once per 5 minutes)
  if (context.lastAskedAt && Date.now() - context.lastAskedAt < 5 * 60 * 1000) {
    return false;
  }

  // Don't ask if session just started (wait at least 30 seconds)
  if (Date.now() - context.sessionStartedAt < 30 * 1000) {
    return false;
  }

  // Check if there's something to ask
  return getNextMissingField(profile) !== null;
}

/**
 * Try to extract profile info from user message
 */
export function extractProfileFromMessage(message: string): Partial<UserProfile> {
  const extracted: Partial<UserProfile> = {};

  // Gender patterns - more flexible
  if (/(?:我是|是)?(?:男|男性|男的|男生)/.test(message) || /性别[是为:]?\s*男/.test(message)) {
    extracted.gender = "male";
  } else if (
    /(?:我是|是)?(?:女|女性|女的|女生)/.test(message) ||
    /性别[是为:]?\s*女/.test(message)
  ) {
    extracted.gender = "female";
  }

  // Birth year patterns - more flexible
  const birthYearMatch = message.match(/(\d{4})\s*年?\s*(?:出生|生)/);
  if (birthYearMatch) {
    const year = parseInt(birthYearMatch[1]);
    if (year > 1900 && year <= new Date().getFullYear()) {
      extracted.birthYear = year;
    }
  }

  // Also try pattern: 出生于1985年
  if (!extracted.birthYear) {
    const birthMatch2 = message.match(/(?:出生于?|生于)\s*(\d{4})/);
    if (birthMatch2) {
      const year = parseInt(birthMatch2[1]);
      if (year > 1900 && year <= new Date().getFullYear()) {
        extracted.birthYear = year;
      }
    }
  }

  // Age pattern (convert to birth year)
  if (!extracted.birthYear) {
    const ageMatch = message.match(/(?:我|今年)?(\d{1,3})\s*岁/);
    if (ageMatch) {
      const age = parseInt(ageMatch[1]);
      if (age > 0 && age < 120) {
        extracted.birthYear = new Date().getFullYear() - age;
      }
    }
  }

  // Height patterns - more flexible
  const heightMatch = message.match(/(?:身高[是为:]?\s*)?(\d{2,3})\s*(?:cm|厘米|公分)/i);
  if (heightMatch) {
    const h = parseFloat(heightMatch[1]);
    if (h > 100 && h < 250) {
      extracted.height = h;
    }
  }

  // Weight patterns - more flexible
  const weightMatch = message.match(/(?:体重[是为:]?\s*)?(\d{2,3}(?:\.\d+)?)\s*(?:kg|公斤)/i);
  if (weightMatch) {
    const w = parseFloat(weightMatch[1]);
    if (w > 20 && w < 300) {
      extracted.weight = w;
    }
  }

  // Also handle 斤
  if (!extracted.weight) {
    const jinMatch = message.match(/(?:体重[是为:]?\s*)?(\d{2,3}(?:\.\d+)?)\s*斤/);
    if (jinMatch) {
      const jin = parseFloat(jinMatch[1]);
      const kg = jin / 2;
      if (kg > 20 && kg < 300) {
        extracted.weight = kg;
      }
    }
  }

  // Nickname patterns
  const nicknameMatch = message.match(/(?:我叫|叫我|我是|称呼我)\s*([^\s,，。！!？?]{1,10})/);
  if (nicknameMatch) {
    const name = nicknameMatch[1].trim();
    if (name && !/^(男|女|男的|女的|男性|女性)$/.test(name)) {
      extracted.nickname = name;
    }
  }

  return extracted;
}

/**
 * Format a question with options for asking the user
 */
export function formatQuestion(field: RequiredField): string {
  let question = field.question;
  if (field.options && field.options.length > 0) {
    question += ` (${field.options.join(" / ")})`;
  }
  return question;
}
