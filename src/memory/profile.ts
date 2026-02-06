/**
 * Profile File Management
 * Stores user health profile as Markdown files
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "fs";
import { join } from "path";
import { getStateDir } from "../utils/config.js";
import type { UserProfile } from "./types.js";

/**
 * Get the users directory
 */
export function getUsersDir(): string {
  return join(getStateDir(), "users");
}

/**
 * Get user's directory path
 */
export function getUserDir(uuid: string): string {
  return join(getUsersDir(), uuid);
}

/**
 * Ensure user directory exists
 */
export function ensureUserDir(uuid: string): string {
  const userDir = getUserDir(uuid);

  if (!existsSync(userDir)) {
    mkdirSync(userDir, { recursive: true });
    mkdirSync(join(userDir, "memory"), { recursive: true });
    mkdirSync(join(userDir, "sessions"), { recursive: true });
  }

  return userDir;
}

/**
 * Get path to user's PROFILE.md
 */
export function getProfilePath(uuid: string): string {
  return join(getUserDir(uuid), "PROFILE.md");
}

/**
 * Get path to user's MEMORY.md
 */
export function getMemoryPath(uuid: string): string {
  return join(getUserDir(uuid), "MEMORY.md");
}

/**
 * Get path to user's daily memory log
 */
export function getDailyLogPath(uuid: string, date?: Date): string {
  const d = date || new Date();
  const dateStr = d.toISOString().split("T")[0];
  return join(getUserDir(uuid), "memory", `${dateStr}.md`);
}

/**
 * Load user profile from PROFILE.md
 */
export function loadProfileFromFile(uuid: string): UserProfile {
  const profilePath = getProfilePath(uuid);

  if (!existsSync(profilePath)) {
    return {};
  }

  const content = readFileSync(profilePath, "utf-8");
  return parseProfileMd(content);
}

/**
 * Save user profile to PROFILE.md
 */
export function saveProfileToFile(uuid: string, profile: UserProfile): void {
  ensureUserDir(uuid);
  const profilePath = getProfilePath(uuid);
  const content = generateProfileMd(profile);
  writeFileSync(profilePath, content);
}

/**
 * Load user's MEMORY.md summary
 */
export function loadMemorySummary(uuid: string): string | null {
  const memoryPath = getMemoryPath(uuid);

  if (!existsSync(memoryPath)) {
    return null;
  }

  return readFileSync(memoryPath, "utf-8");
}

/**
 * Append to user's MEMORY.md
 */
export function appendToMemory(uuid: string, content: string): void {
  ensureUserDir(uuid);
  const memoryPath = getMemoryPath(uuid);

  let existing = "";
  if (existsSync(memoryPath)) {
    existing = readFileSync(memoryPath, "utf-8");
  } else {
    existing = "# 健康记忆\n\n";
  }

  const updated = existing + "\n" + content;
  writeFileSync(memoryPath, updated);
}

/**
 * Append to user's daily log
 */
export function appendToDailyLog(uuid: string, content: string): void {
  ensureUserDir(uuid);
  const logPath = getDailyLogPath(uuid);

  let existing = "";
  if (existsSync(logPath)) {
    existing = readFileSync(logPath, "utf-8");
  } else {
    const date = new Date().toISOString().split("T")[0];
    existing = `# ${date} 对话记录\n\n`;
  }

  const time = new Date().toTimeString().slice(0, 5);
  const updated = existing + `\n## ${time}\n\n${content}\n`;
  writeFileSync(logPath, updated);
}

/**
 * Get recent daily logs for a user
 */
export function getRecentDailyLogs(
  uuid: string,
  days: number
): Array<{ date: string; preview: string }> {
  const memoryDir = join(getUserDir(uuid), "memory");
  if (!existsSync(memoryDir)) return [];

  const files = readdirSync(memoryDir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .reverse()
    .slice(0, days);

  return files.map((f) => {
    const date = f.replace(".md", "");
    const content = readFileSync(join(memoryDir, f), "utf-8");
    const preview = content.split("\n").slice(0, 3).join(" ").slice(0, 100);
    return { date, preview };
  });
}

/**
 * Parse PROFILE.md to UserProfile
 */
function parseProfileMd(content: string): UserProfile {
  const profile: UserProfile = {};

  // Nickname
  const nicknameMatch = content.match(/昵称:\s*(.+)/);
  if (nicknameMatch && !nicknameMatch[1].includes("{待收集}")) {
    profile.nickname = nicknameMatch[1].trim();
  }

  // Gender
  const genderMatch = content.match(/性别:\s*(男|女)/);
  if (genderMatch) {
    profile.gender = genderMatch[1] === "男" ? "male" : "female";
  }

  // Birth year
  const birthMatch = content.match(/出生年份:\s*(\d{4})/);
  if (birthMatch) {
    profile.birthYear = parseInt(birthMatch[1]);
  }

  // Height
  const heightMatch = content.match(/身高:\s*(\d+(?:\.\d+)?)/);
  if (heightMatch) {
    profile.height = parseFloat(heightMatch[1]);
  }

  // Weight
  const weightMatch = content.match(/体重:\s*(\d+(?:\.\d+)?)/);
  if (weightMatch) {
    profile.weight = parseFloat(weightMatch[1]);
  }

  // Conditions
  const conditionsMatch = content.match(/慢性病:\s*(.+)/);
  if (conditionsMatch && conditionsMatch[1] !== "无" && !conditionsMatch[1].includes("{")) {
    profile.conditions = conditionsMatch[1].split(/[,，]/).map((s) => s.trim());
  }

  // Allergies
  const allergiesMatch = content.match(/过敏史:\s*(.+)/);
  if (allergiesMatch && allergiesMatch[1] !== "无" && !allergiesMatch[1].includes("{")) {
    profile.allergies = allergiesMatch[1].split(/[,，]/).map((s) => s.trim());
  }

  // Daily steps goal
  const stepsMatch = content.match(/每日步数目标:\s*(\d+)/);
  if (stepsMatch) {
    profile.goals = profile.goals || {};
    profile.goals.dailySteps = parseInt(stepsMatch[1]);
  }

  // Sleep hours goal
  const sleepMatch = content.match(/睡眠时长目标:\s*(\d+)/);
  if (sleepMatch) {
    profile.goals = profile.goals || {};
    profile.goals.sleepHours = parseInt(sleepMatch[1]);
  }

  // Exercise per week goal
  const exerciseMatch = content.match(/运动频率目标:\s*每周(\d+)/);
  if (exerciseMatch) {
    profile.goals = profile.goals || {};
    profile.goals.exercisePerWeek = parseInt(exerciseMatch[1]);
  }

  // Primary goal
  const primaryGoalMatch = content.match(/主要目标:\s*(.+)/);
  if (primaryGoalMatch && !primaryGoalMatch[1].includes("{待收集}")) {
    profile.goals = profile.goals || {};
    profile.goals.primary = primaryGoalMatch[1].trim();
  }

  // Huawei connection
  const huaweiMatch = content.match(/华为健康:\s*(已连接|未连接)/);
  if (huaweiMatch) {
    profile.dataSources = profile.dataSources || {};
    profile.dataSources.huawei = {
      connected: huaweiMatch[1] === "已连接",
    };
  }

  return profile;
}

/**
 * Generate PROFILE.md from UserProfile
 */
function generateProfileMd(profile: UserProfile): string {
  const lines = [
    "# 健康档案",
    "",
    "## 基本信息",
    `- 昵称: ${profile.nickname || "{待收集}"}`,
    `- 性别: ${profile.gender === "male" ? "男" : profile.gender === "female" ? "女" : "{待收集}"}`,
    `- 出生年份: ${profile.birthYear || "{待收集}"}`,
    `- 身高: ${profile.height ? `${profile.height}cm` : "{待收集}"}`,
    `- 体重: ${profile.weight ? `${profile.weight}kg` : "{待收集}"}`,
    "",
    "## 健康状况",
    `- 慢性病: ${profile.conditions?.length ? profile.conditions.join(", ") : "无"}`,
    `- 过敏史: ${profile.allergies?.length ? profile.allergies.join(", ") : "无"}`,
    `- 用药情况: ${profile.medications?.length ? profile.medications.join(", ") : "无"}`,
    "",
    "## 健康目标",
    `- 主要目标: ${profile.goals?.primary || "{待收集}"}`,
    `- 每日步数目标: ${profile.goals?.dailySteps || 8000}`,
    `- 睡眠时长目标: ${profile.goals?.sleepHours || 7}小时`,
    `- 运动频率目标: 每周${profile.goals?.exercisePerWeek || 3}次`,
    "",
    "## 生活习惯",
    `- 作息: ${profile.lifestyle?.sleepSchedule || "{待收集}"}`,
    `- 运动偏好: ${profile.lifestyle?.exercisePreference || "{待收集}"}`,
    `- 饮食偏好: ${profile.lifestyle?.dietPreference || "{待收集}"}`,
    "",
    "## 数据来源",
    `- 华为健康: ${profile.dataSources?.huawei?.connected ? "已连接" : "未连接"}`,
    "",
    "---",
    `最后更新: ${new Date().toISOString()}`,
  ];

  return lines.join("\n");
}

/**
 * Format profile for display in system prompt
 */
export function formatProfileForPrompt(profile: UserProfile): string {
  if (!profile.gender && !profile.birthYear && !profile.height && !profile.weight) {
    return "User basic info not yet collected. Ask at an appropriate moment.";
  }

  const lines: string[] = [];

  if (profile.nickname) {
    lines.push(`- Nickname: ${profile.nickname}`);
  }

  if (profile.gender) {
    lines.push(`- Gender: ${profile.gender}`);
  }

  if (profile.birthYear) {
    const age = new Date().getFullYear() - profile.birthYear;
    lines.push(`- Age: ${age} (born ${profile.birthYear})`);
  }

  if (profile.height) {
    lines.push(`- Height: ${profile.height}cm`);
  }

  if (profile.weight) {
    lines.push(`- Weight: ${profile.weight}kg`);
  }

  if (profile.height && profile.weight) {
    const bmi = profile.weight / Math.pow(profile.height / 100, 2);
    lines.push(`- BMI: ${bmi.toFixed(1)}`);
  }

  if (profile.conditions?.length) {
    lines.push(`- Conditions: ${profile.conditions.join(", ")}`);
  }

  if (profile.goals?.primary) {
    lines.push(`- Health goal: ${profile.goals.primary}`);
  }

  return lines.join("\n");
}
