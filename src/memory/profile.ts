/**
 * Profile File Management
 * Stores user health profile as Markdown files
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from "fs";
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
 * Ensure user directory exists with all OpenClaw user-level files.
 * Creates USER.md, MEMORY.md, BOOTSTRAP.md if they don't exist.
 */
export function ensureUserDir(uuid: string): string {
  const userDir = getUserDir(uuid);

  if (!existsSync(userDir)) {
    mkdirSync(userDir, { recursive: true });
    mkdirSync(join(userDir, "memory"), { recursive: true });
    mkdirSync(join(userDir, "sessions"), { recursive: true });
  }

  // Ensure all 3 OpenClaw user-level files exist
  const userMdPath = join(userDir, "USER.md");
  if (!existsSync(userMdPath)) {
    // Check legacy PROFILE.md — migrate if exists
    const legacyPath = join(userDir, "PROFILE.md");
    if (existsSync(legacyPath)) {
      // Copy legacy content to USER.md
      writeFileSync(userMdPath, readFileSync(legacyPath, "utf-8"));
    } else {
      writeFileSync(userMdPath, generateProfileMd({}));
    }
  }

  const memoryMdPath = join(userDir, "MEMORY.md");
  if (!existsSync(memoryMdPath)) {
    writeFileSync(
      memoryMdPath,
      "# MEMORY.md - 长期记忆\n\n_(Agent 会在对话中自动积累这部分内容。)_\n"
    );
  }

  const bootstrapPath = join(userDir, "BOOTSTRAP.md");
  if (!existsSync(bootstrapPath)) {
    // Only create BOOTSTRAP for users that haven't been onboarded yet
    // (i.e., USER.md is still the empty template)
    const userContent = readFileSync(userMdPath, "utf-8");
    const hasRealData = userContent.includes("昵称:") && !userContent.includes("{待收集}");
    if (!hasRealData) {
      writeFileSync(bootstrapPath, BOOTSTRAP_TEMPLATE);
    }
  }

  return userDir;
}

/**
 * Ensure System Agent directory has all 3 OpenClaw user-level files.
 */
export function ensureSystemAgentFiles(): void {
  const dir = join(getStateDir(), "system-agent");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const userMdPath = join(dir, "USER.md");
  if (!existsSync(userMdPath)) {
    writeFileSync(
      userMdPath,
      [
        "# USER.md - 关于系统 Agent",
        "",
        "## 身份",
        "- 名称: PHA System Agent",
        "- 类型: 系统运维与进化 Agent",
        "- 职责: 管理 PHA 系统的持续改进",
        "",
        "## 配置",
        "- 进化模式: 手动",
        "- Benchmark 频率: 按需",
        "",
        "## 上下文",
        "_(系统 Agent 的运行上下文，随时间积累。)_",
        "",
      ].join("\n")
    );
  }

  const memoryMdPath = join(dir, "MEMORY.md");
  if (!existsSync(memoryMdPath)) {
    // If legacy memory.md exists, copy its content
    const legacyPath = join(dir, "memory.md");
    if (existsSync(legacyPath)) {
      writeFileSync(memoryMdPath, readFileSync(legacyPath, "utf-8"));
    } else {
      writeFileSync(
        memoryMdPath,
        "# MEMORY.md - 系统 Agent 记忆\n\n_(系统 Agent 会在运行中自动积累这部分内容。)_\n"
      );
    }
  }

  const bootstrapPath = join(dir, "BOOTSTRAP.md");
  if (!existsSync(bootstrapPath)) {
    writeFileSync(
      bootstrapPath,
      [
        "# BOOTSTRAP.md - 系统 Agent 初始化",
        "",
        "## 首次运行",
        "",
        "1. 检查系统状态（git status、构建状态）",
        "2. 读取 evolution-log.md 了解历史进化记录",
        "3. 运行 benchmark 获取当前基线分数",
        "4. 记录初始状态到 MEMORY.md",
        "",
        "## 完成初始化后",
        "",
        "此文件可以被删除或保留作为参考。",
        "",
      ].join("\n")
    );
  }
}

/**
 * Get path to user's USER.md (formerly PROFILE.md)
 * Falls back to PROFILE.md for backward compatibility
 */
export function getProfilePath(uuid: string): string {
  const userMdPath = join(getUserDir(uuid), "USER.md");
  if (existsSync(userMdPath)) return userMdPath;
  // Backward compatibility: fall back to PROFILE.md
  const legacyPath = join(getUserDir(uuid), "PROFILE.md");
  if (existsSync(legacyPath)) return legacyPath;
  // Default to USER.md for new users
  return userMdPath;
}

/**
 * Get path to user's BOOTSTRAP.md
 */
export function getBootstrapPath(uuid: string): string {
  return join(getUserDir(uuid), "BOOTSTRAP.md");
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
 * Load user profile from USER.md (or legacy PROFILE.md)
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
 * Save user profile to USER.md (always writes to USER.md, even if loaded from legacy PROFILE.md)
 */
export function saveProfileToFile(uuid: string, profile: UserProfile): void {
  ensureUserDir(uuid);
  // Always write to USER.md
  const userMdPath = join(getUserDir(uuid), "USER.md");
  const content = generateProfileMd(profile);
  writeFileSync(userMdPath, content);
}

/**
 * Load user's MEMORY.md summary with structure-aware truncation.
 *
 * Strategy:
 * - Split by ## headings into sections
 * - Always keep the first section (title/header)
 * - Fill from the tail (most recent) backward until budget exhausted
 * - Show truncation marker with count of omitted sections
 * - Append recent daily log summaries (last 3 days)
 */
export function loadMemorySummary(uuid: string, maxChars = 12000): string | null {
  const memoryPath = getMemoryPath(uuid);

  if (!existsSync(memoryPath)) {
    return null;
  }

  const full = readFileSync(memoryPath, "utf-8");
  if (!full.trim()) return null;

  // Append recent daily log summaries
  const recentLogs = getRecentDailyLogs(uuid, 3);
  let dailyLogSection = "";
  if (recentLogs.length > 0) {
    dailyLogSection =
      "\n\n## Recent Daily Logs\n\n" +
      recentLogs.map((l) => `- **${l.date}**: ${l.preview}`).join("\n");
  }

  // If everything fits, return as-is
  if (full.length + dailyLogSection.length <= maxChars) {
    return full + dailyLogSection;
  }

  // Structure-aware truncation: split by ## headings
  const sections = splitBySections(full);

  if (sections.length <= 1) {
    // No sections to split — fall back to tail truncation
    const budget = maxChars - dailyLogSection.length;
    return "[Earlier memories truncated]\n\n" + full.slice(-budget) + dailyLogSection;
  }

  // Always keep first section (title/header)
  const firstSection = sections[0];
  let budget = maxChars - firstSection.length - dailyLogSection.length - 50; // 50 chars for marker

  // Fill from tail (most recent) backward
  const kept: string[] = [];
  let truncatedCount = 0;

  for (let i = sections.length - 1; i >= 1; i--) {
    if (sections[i].length <= budget) {
      kept.unshift(sections[i]);
      budget -= sections[i].length;
    } else if (budget > 200) {
      // Partial section: keep the beginning with marker
      kept.unshift(sections[i].slice(0, budget) + "\n...");
      budget = 0;
      truncatedCount += i; // all remaining sections are truncated
      break;
    } else {
      truncatedCount++;
    }
  }

  // Count sections we skipped entirely
  if (truncatedCount === 0) {
    truncatedCount = sections.length - 1 - kept.length;
  }

  const parts: string[] = [firstSection];
  if (truncatedCount > 0) {
    parts.push(`\n[${truncatedCount} earlier entries truncated]\n`);
  }
  parts.push(...kept);
  parts.push(dailyLogSection);

  return parts.join("\n");
}

/**
 * Split markdown content by ## headings into sections.
 * Each section includes the heading line and all content until the next heading.
 */
function splitBySections(content: string): string[] {
  const lines = content.split("\n");
  const sections: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (line.startsWith("## ") && current.length > 0) {
      sections.push(current.join("\n"));
      current = [];
    }
    current.push(line);
  }
  if (current.length > 0) {
    sections.push(current.join("\n"));
  }

  return sections;
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
 * Parse USER.md to UserProfile
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

  // Daily steps goal (supports both "每日步数" and legacy "每日步数目标")
  const stepsMatch = content.match(/每日步数(?:目标)?:\s*(\d+)/);
  if (stepsMatch) {
    profile.goals = profile.goals || {};
    profile.goals.dailySteps = parseInt(stepsMatch[1]);
  }

  // Sleep hours goal (supports both "睡眠时长" and legacy "睡眠时长目标")
  const sleepMatch = content.match(/睡眠时长(?:目标)?:\s*(\d+)/);
  if (sleepMatch) {
    profile.goals = profile.goals || {};
    profile.goals.sleepHours = parseInt(sleepMatch[1]);
  }

  // Exercise per week goal (supports both "运动频率" and legacy "运动频率目标")
  const exerciseMatch = content.match(/运动频率(?:目标)?:\s*每周(\d+)/);
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
 * Generate USER.md from UserProfile
 */
function generateProfileMd(profile: UserProfile): string {
  const lines = [
    "# USER.md - 关于你的用户",
    "",
    "## 基本信息",
    `- 昵称: ${profile.nickname || "{待收集}"}`,
    `- 性别: ${profile.gender === "male" ? "男" : profile.gender === "female" ? "女" : "{待收集}"}`,
    `- 出生年份: ${profile.birthYear || "{待收集}"}`,
    `- 身高: ${profile.height ? `${profile.height}cm` : "{待收集}"}`,
    `- 体重: ${profile.weight ? `${profile.weight}kg` : "{待收集}"}`,
    "",
    "## 健康状况",
    `- 慢性病: ${profile.conditions?.length ? profile.conditions.join(", ") : "{待收集}"}`,
    `- 过敏史: ${profile.allergies?.length ? profile.allergies.join(", ") : "{待收集}"}`,
    "",
    "## 健康目标",
    `- 主要目标: ${profile.goals?.primary || "{待收集}"}`,
    `- 每日步数: ${profile.goals?.dailySteps || 8000}`,
    `- 睡眠时长: ${profile.goals?.sleepHours || 7}小时`,
    `- 运动频率: 每周${profile.goals?.exercisePerWeek || 3}次`,
    "",
    "## 上下文",
    `_(用户关心什么？在做什么？什么习惯？随时间积累这部分。)_`,
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
 * Format profile for display in system prompt.
 * Shows both known fields and missing fields to guide the agent.
 */
export function formatProfileForPrompt(profile: UserProfile): string {
  const lines: string[] = [];

  // Known fields
  if (profile.nickname) lines.push(`- Nickname: ${profile.nickname}`);
  if (profile.gender) lines.push(`- Gender: ${profile.gender}`);
  if (profile.birthYear) {
    const age = new Date().getFullYear() - profile.birthYear;
    lines.push(`- Age: ${age} (born ${profile.birthYear})`);
  }
  if (profile.height) lines.push(`- Height: ${profile.height}cm`);
  if (profile.weight) lines.push(`- Weight: ${profile.weight}kg`);
  if (profile.height && profile.weight) {
    const bmi = profile.weight / Math.pow(profile.height / 100, 2);
    lines.push(`- BMI: ${bmi.toFixed(1)}`);
  }
  if (profile.conditions?.length) lines.push(`- Conditions: ${profile.conditions.join(", ")}`);
  if (profile.allergies?.length) lines.push(`- Allergies: ${profile.allergies.join(", ")}`);
  if (profile.goals?.primary) lines.push(`- Health goal: ${profile.goals.primary}`);

  // Missing fields — explain WHY each matters for health interpretation
  const missingWithReason: string[] = [];
  if (!profile.gender)
    missingWithReason.push(
      "- **gender**: 心率/血压/体脂的参考范围因性别不同，缺失时无法给出准确的健康评估"
    );
  if (!profile.birthYear)
    missingWithReason.push(
      "- **birthYear**: 目标心率区间、血压标准、代谢率都依赖年龄，缺失时只能给出笼统建议"
    );
  if (!profile.height)
    missingWithReason.push("- **height**: 计算 BMI、基础代谢率、体重评估都需要身高");
  if (!profile.weight)
    missingWithReason.push("- **weight**: 计算 BMI、运动消耗、营养建议都需要体重");

  const optionalMissing: string[] = [];
  if (!profile.goals?.primary) optionalMissing.push("goals.primary");
  if (!profile.conditions) optionalMissing.push("conditions");

  if (missingWithReason.length > 0 || optionalMissing.length > 0) {
    lines.push("");
    lines.push("### Missing Profile Fields");
    if (missingWithReason.length > 0) {
      lines.push("");
      lines.push(
        "以下字段缺失会影响健康数据解读的准确性。" +
          "当用户询问相关健康话题时，你应该说明「为了更准确地解读你的数据，我需要知道…」，" +
          "然后自然地询问。不要审讯式连续追问。"
      );
      lines.push("");
      lines.push(missingWithReason.join("\n"));
    }
    if (optionalMissing.length > 0) {
      lines.push("");
      lines.push(`**Optional (collect over time):** ${optionalMissing.join(", ")}`);
    }
    lines.push("");
    lines.push("When you learn any of these, call `update_user_profile` immediately to save.");
  }

  if (lines.length === 0) {
    return "User basic info not yet collected. Ask at an appropriate moment.";
  }

  return lines.join("\n");
}

// ============ BOOTSTRAP ============

const BOOTSTRAP_TEMPLATE = `# BOOTSTRAP.md - 你好，新朋友

你刚和一位新用户开始第一次对话。

## 对话引导

不要审讯。不要机械。就像认识一个新朋友一样自然聊天。

先简单介绍自己，然后在对话中自然地了解：

1. **他们叫什么** — 怎么称呼比较好？
2. **基本信息** — 性别、年龄（大概就行）
3. **身体指标** — 身高、体重（方便计算 BMI 等）
4. **健康目标** — 想改善什么？睡眠？运动？减重？
5. **数据连接** — 是否已连接华为健康等数据源

不用一次全问完。自然地聊，分几轮收集。

## 收集到信息后

用 \`update_user_profile\` 工具保存每一条收集到的信息。

## 引导完成后

当你收集到至少 4 个核心字段（性别、年龄、身高、体重）后，
用 \`complete_onboarding\` 工具完成引导。这会删除本文件。

之后就可以正常提供健康服务了。
`;

/**
 * Load BOOTSTRAP.md content for a user (if exists)
 */
export function loadBootstrap(uuid: string): string | null {
  const bsPath = getBootstrapPath(uuid);
  if (!existsSync(bsPath)) return null;
  return readFileSync(bsPath, "utf-8");
}

/**
 * Delete BOOTSTRAP.md — called after onboarding is complete
 */
export function deleteBootstrap(uuid: string): boolean {
  const bsPath = getBootstrapPath(uuid);
  if (!existsSync(bsPath)) return false;
  unlinkSync(bsPath);
  return true;
}
