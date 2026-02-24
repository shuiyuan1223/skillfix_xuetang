/**
 * Memory Manager - Main entry point for memory operations
 *
 * Thin wrapper combining:
 * - OpenClaw's MemoryIndexManager (search, sync, indexing)
 * - PHA's user management, health profiles, info extraction
 *
 * Files are the source of truth; OpenClaw's per-user index handles all search.
 */

import { join } from "path";
import { getStateDir } from "../utils/config.js";
// Side-effect import: macOS SQLite compat patch
import "./schema.js";
import { loadSoul } from "./soul.js";
import {
  loadProfileFromFile,
  saveProfileToFile,
  loadMemorySummary,
  appendToMemory,
  appendToDailyLog,
  formatProfileForPrompt,
  ensureUserDir,
  loadBootstrap,
  deleteBootstrap,
} from "./profile.js";
import { buildSkillRegistry } from "../agent/system-prompt.js";
import {
  getNextMissingField,
  getAllMissingFields,
  getAllMissingProfileKeys,
  getProfileCompleteness,
} from "./info-collector.js";
import { MemoryIndexManager } from "./memory-index.js";
import { emitSessionTranscriptUpdate } from "./compat.js";
import type { UserProfile, MemorySearchResult } from "./types.js";
import { loadConfig } from "../utils/config.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("Memory");

export interface MemoryManagerConfig {
  /** Reserved for future configuration */
}

export class MemoryManager {
  private indexManagers = new Map<string, MemoryIndexManager | null>();
  private indexInitPromises = new Map<string, Promise<MemoryIndexManager | null>>();

  constructor(private config: MemoryManagerConfig = {}) {}

  // ============ Index Manager (OpenClaw Engine) ============

  /**
   * Get or create a MemoryIndexManager for a user.
   * This is the OpenClaw-powered search/indexing engine.
   */
  async getIndex(uuid: string): Promise<MemoryIndexManager | null> {
    // Return cached instance
    if (this.indexManagers.has(uuid)) {
      return this.indexManagers.get(uuid) ?? null;
    }

    // Check for in-flight init
    const existing = this.indexInitPromises.get(uuid);
    if (existing) {
      return existing;
    }

    // Create new instance
    const promise = MemoryIndexManager.get({ agentId: uuid })
      .then((manager) => {
        this.indexManagers.set(uuid, manager);
        this.indexInitPromises.delete(uuid);
        return manager;
      })
      .catch((err) => {
        log.warn(`Failed to create index for ${uuid}`, err);
        this.indexManagers.set(uuid, null);
        this.indexInitPromises.delete(uuid);
        return null;
      });

    this.indexInitPromises.set(uuid, promise);
    return promise;
  }

  // ============ User Management ============

  ensureUser(uuid: string): void {
    ensureUserDir(uuid);
  }

  getProfile(uuid: string): UserProfile {
    return loadProfileFromFile(uuid);
  }

  updateProfile(uuid: string, updates: Partial<UserProfile>): void {
    this.ensureUser(uuid);

    const current = this.getProfile(uuid);
    const merged: UserProfile = { ...current };

    if (updates.nickname !== undefined) merged.nickname = updates.nickname;
    if (updates.gender !== undefined) merged.gender = updates.gender;
    if (updates.birthYear !== undefined) merged.birthYear = updates.birthYear;
    if (updates.height !== undefined) merged.height = updates.height;
    if (updates.weight !== undefined) merged.weight = updates.weight;
    if (updates.location !== undefined) merged.location = updates.location;
    if (updates.conditions !== undefined) merged.conditions = updates.conditions;
    if (updates.allergies !== undefined) merged.allergies = updates.allergies;
    if (updates.medications !== undefined) merged.medications = updates.medications;

    if (updates.goals) {
      merged.goals = { ...(current.goals || {}), ...updates.goals };
    }
    if (updates.lifestyle) {
      merged.lifestyle = { ...(current.lifestyle || {}), ...updates.lifestyle };
    }
    if (updates.dataSources) {
      merged.dataSources = { ...(current.dataSources || {}), ...updates.dataSources };
    }

    saveProfileToFile(uuid, merged);
  }

  deleteUser(uuid: string): void {
    // Close and remove the user's index manager
    const manager = this.indexManagers.get(uuid);
    if (manager) {
      void manager.close();
      this.indexManagers.delete(uuid);
    }
  }

  // ============ Onboarding ============

  completeOnboarding(uuid: string): boolean {
    return deleteBootstrap(uuid);
  }

  // ============ Profile Info Collection ============

  getNextMissingField(uuid: string) {
    const profile = this.getProfile(uuid);
    return getNextMissingField(profile);
  }

  getAllMissingFields(uuid: string) {
    const profile = this.getProfile(uuid);
    return getAllMissingFields(profile);
  }

  getAllMissingProfileKeys(uuid: string): string[] {
    const profile = this.getProfile(uuid);
    return getAllMissingProfileKeys(profile);
  }

  getProfileCompleteness(uuid: string): number {
    const profile = this.getProfile(uuid);
    return getProfileCompleteness(profile);
  }

  // ============ Memory Search (OpenClaw Engine) ============

  /**
   * Search memory using OpenClaw's hybrid vector + keyword search.
   */
  async searchAsync(
    uuid: string,
    query: string,
    options?: { maxResults?: number; minScore?: number }
  ): Promise<MemorySearchResult[]> {
    const maxResults = options?.maxResults ?? 5;
    const minScore = options?.minScore ?? 0.2;

    const index = await this.getIndex(uuid);
    if (index) {
      try {
        const results = await index.search(query, { maxResults, minScore });
        return results.map((r) => ({
          path: r.path,
          startLine: r.startLine,
          endLine: r.endLine,
          score: r.score,
          snippet: r.snippet,
        }));
      } catch (err) {
        log.warn("Index search failed", err);
      }
    }

    return [];
  }

  // ============ Memory Writing ============

  appendMemory(uuid: string, content: string): void {
    this.ensureUser(uuid);
    appendToMemory(uuid, content);

    // Trigger OpenClaw index sync (fire-and-forget)
    this.getIndex(uuid).then((index) => {
      if (index) {
        void index.sync({ reason: "memory-write" }).catch((err) => {
          log.warn("Sync after memory write failed", err);
        });
      }
    });
  }

  appendDailyLog(uuid: string, content: string): void {
    this.ensureUser(uuid);
    appendToDailyLog(uuid, content);

    // Trigger OpenClaw index sync
    this.getIndex(uuid).then((index) => {
      if (index) {
        void index.sync({ reason: "daily-log" }).catch((err) => {
          log.warn("Sync after daily log failed", err);
        });
      }
    });
  }

  appendSessionTranscript(uuid: string, sessionId: string, _content: string): void {
    this.ensureUser(uuid);

    // Notify OpenClaw session listener (triggers async index sync)
    const sessionFile = join(getStateDir(), "users", uuid, "sessions", `${sessionId}.jsonl`);
    emitSessionTranscriptUpdate(sessionFile);
  }

  // ============ SOUL ============

  getSoulPrompt(uuid?: string): string {
    return loadSoul(uuid);
  }

  // ============ System Prompt Building ============

  buildSystemPrompt(
    uuid: string,
    skillOptions?: { include?: string[]; exclude?: string[] },
    contextOptions?: { memory?: boolean; profile?: boolean; bootstrap?: boolean }
  ): string {
    const soul = this.getSoulPrompt(uuid);
    const profile = contextOptions?.profile !== false ? this.getProfile(uuid) : null;
    const memorySummary = contextOptions?.memory !== false ? loadMemorySummary(uuid) : null;
    const bootstrap = contextOptions?.bootstrap !== false ? loadBootstrap(uuid) : null;

    const profileSection = profile ? formatProfileForPrompt(profile) : null;
    const memorySection =
      memorySummary || (contextOptions?.memory !== false ? "No historical memory yet" : null);
    const skillRegistry = buildSkillRegistry(skillOptions);

    const sessionContext = buildSessionContext();

    const bootstrapSection = bootstrap
      ? `\n## ⚠️ 新用户首次对话 — 必须执行引导\n\n**请严格遵循以下引导流程。这是最高优先级任务。**\n\n${bootstrap}\n`
      : "";

    const profileBlock = profileSection
      ? `\n## Current User Information\n\n${profileSection}\n`
      : "";
    const memoryBlock = memorySection ? `\n## User Memory\n\n${memorySection}\n` : "";

    const prompt = `${soul}

---

## Session Context

${sessionContext}
${bootstrapSection}${profileBlock}${memoryBlock}
${skillRegistry}
---

Based on the information above, provide personalized health services.`;

    const est = (s: string) => Math.ceil(s.length / 4);
    log.debug(
      `Token distribution: soul=${est(soul)} profile=${est(profileBlock)} memory=${est(memoryBlock)} skills=${est(skillRegistry)} bootstrap=${est(bootstrapSection)} total≈${est(prompt)}`
    );

    return prompt;
  }

  // ============ Lifecycle ============

  close(): void {
    // Close all index managers
    for (const [, manager] of this.indexManagers) {
      if (manager) {
        void manager.close();
      }
    }
    this.indexManagers.clear();
    this.indexInitPromises.clear();
  }
}

// ============ Session Context Builder ============

const WEEKDAYS_ZH = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function getTimeOfDay(hour: number): string {
  if (hour < 6) return "深夜";
  if (hour < 9) return "早晨";
  if (hour < 12) return "上午";
  if (hour < 13) return "中午";
  if (hour < 17) return "下午";
  if (hour < 19) return "傍晚";
  if (hour < 23) return "晚上";
  return "深夜";
}

function getSeason(month: number, hemisphere: "north" | "south" = "north"): string {
  // month: 1-12
  const northSeasons: Record<number, string> = {
    1: "冬季",
    2: "冬季",
    3: "春季",
    4: "春季",
    5: "春季",
    6: "夏季",
    7: "夏季",
    8: "夏季",
    9: "秋季",
    10: "秋季",
    11: "秋季",
    12: "冬季",
  };
  const southSeasons: Record<number, string> = {
    1: "夏季",
    2: "夏季",
    3: "秋季",
    4: "秋季",
    5: "秋季",
    6: "冬季",
    7: "冬季",
    8: "冬季",
    9: "春季",
    10: "春季",
    11: "春季",
    12: "夏季",
  };
  return hemisphere === "south" ? southSeasons[month] : northSeasons[month];
}

/**
 * Build rich session context with date, time, timezone, and season.
 * Weather is now a tool (get_weather), not injected here.
 */
function buildSessionContext(): string {
  const now = new Date();
  const dateStr = now.toISOString().split("T")[0];
  const weekday = WEEKDAYS_ZH[now.getDay()];
  const hour = now.getHours();
  const minute = String(now.getMinutes()).padStart(2, "0");
  const timeOfDay = getTimeOfDay(hour);
  const month = now.getMonth() + 1;

  // Detect timezone
  const offsetMin = -now.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const absH = Math.floor(Math.abs(offsetMin) / 60);
  const absM = Math.abs(offsetMin) % 60;
  const tzOffset = `UTC${sign}${absH}${absM > 0 ? ":" + String(absM).padStart(2, "0") : ""}`;

  // Try to get timezone name
  let tzName = "";
  try {
    tzName = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    /* ignore */
  }
  const tzDisplay = tzName ? `${tzOffset} (${tzName})` : tzOffset;

  // Season from config hemisphere or default north
  const config = loadConfig();
  const hemisphere = (config as any).context?.hemisphere || "north";
  const season = getSeason(month, hemisphere);

  const lines = [
    `- **日期**: ${dateStr} ${weekday}`,
    `- **时间**: ${hour}:${minute}（${timeOfDay}）`,
    `- **时区**: ${tzDisplay}`,
    `- **季节**: ${season}`,
  ];

  return lines.join("\n");
}

// Singleton instance
let instance: MemoryManager | null = null;

export function getMemoryManager(): MemoryManager {
  if (!instance) {
    instance = new MemoryManager();
  }
  return instance;
}

export function closeMemoryManager(): void {
  if (instance) {
    instance.close();
    instance = null;
  }
}
