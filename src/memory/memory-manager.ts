/**
 * Memory Manager - Main entry point for memory operations
 *
 * Thin wrapper combining:
 * - OpenClaw's MemoryIndexManager (search, sync, indexing)
 * - PHA's user management, health profiles, info extraction
 *
 * Files are the source of truth; OpenClaw's per-user index handles all search.
 */

import { Database } from "bun:sqlite";
import { join } from "path";
import { getStateDir } from "../utils/config.js";
import { ensureMemorySchema, openMemoryDatabase } from "./schema.js";
import { UserStore } from "./user-store.js";
import { loadSoul } from "./soul.js";
import {
  loadProfileFromFile,
  saveProfileToFile,
  loadMemorySummary,
  appendToMemory,
  appendToDailyLog,
  formatProfileForPrompt,
  ensureUserDir,
} from "./profile.js";
import { buildSkillRegistry } from "../agent/system-prompt.js";
import {
  getNextMissingField,
  getAllMissingFields,
  getProfileCompleteness,
  shouldAskForInfo,
  extractProfileFromMessage,
  formatQuestion,
  type AskContext,
} from "./info-collector.js";
import { MemoryIndexManager } from "./memory-index.js";
import { emitSessionTranscriptUpdate } from "./compat.js";
import type { UserProfile, MemorySearchResult } from "./types.js";

export interface MemoryManagerConfig {
  /** Reserved for future configuration */
}

export class MemoryManager {
  private db: Database;
  private userStore: UserStore;
  private indexManagers = new Map<string, MemoryIndexManager | null>();
  private indexInitPromises = new Map<string, Promise<MemoryIndexManager | null>>();

  constructor(private config: MemoryManagerConfig = {}) {
    const dbPath = join(getStateDir(), "memory.db");
    this.db = openMemoryDatabase(dbPath);
    ensureMemorySchema(this.db);
    this.userStore = new UserStore(this.db);
  }

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
        console.warn(`[MemoryManager] Failed to create index for ${uuid}:`, err);
        this.indexManagers.set(uuid, null);
        this.indexInitPromises.delete(uuid);
        return null;
      });

    this.indexInitPromises.set(uuid, promise);
    return promise;
  }

  // ============ User Management ============

  ensureUser(uuid: string): void {
    this.userStore.ensureUser(uuid);
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
    this.userStore.deleteUser(uuid);
    // Also close and remove the user's index manager
    const manager = this.indexManagers.get(uuid);
    if (manager) {
      void manager.close();
      this.indexManagers.delete(uuid);
    }
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

  getProfileCompleteness(uuid: string): number {
    const profile = this.getProfile(uuid);
    return getProfileCompleteness(profile);
  }

  shouldAskForInfo(uuid: string, context: AskContext): boolean {
    const profile = this.getProfile(uuid);
    return shouldAskForInfo(profile, context);
  }

  extractAndUpdateProfile(uuid: string, message: string): Partial<UserProfile> {
    const extracted = extractProfileFromMessage(message);

    if (Object.keys(extracted).length > 0) {
      this.updateProfile(uuid, extracted);
    }

    return extracted;
  }

  formatMissingInfoQuestion(uuid: string): string | null {
    const field = this.getNextMissingField(uuid);
    if (!field) return null;
    return formatQuestion(field);
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
        console.warn("[MemoryManager] Index search failed:", err);
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
          console.warn("[MemoryManager] Sync after memory write failed:", err);
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
          console.warn("[MemoryManager] Sync after daily log failed:", err);
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

  getSoulPrompt(): string {
    return loadSoul();
  }

  // ============ System Prompt Building ============

  buildSystemPrompt(uuid: string, healthContext?: string): string {
    const soul = this.getSoulPrompt();
    const profile = this.getProfile(uuid);
    const memorySummary = loadMemorySummary(uuid);

    const profileSection = formatProfileForPrompt(profile);
    const memorySection = memorySummary || "No historical memory yet";
    const skillRegistry = buildSkillRegistry();

    const today = new Date().toISOString().split("T")[0];

    const prompt = `${soul}

---

## Session Context

- **Current Date**: ${today}

## Current User Information

${profileSection}

## User Memory

${memorySection}
${healthContext || ""}
${skillRegistry}
---

Based on the information above, provide personalized health services.`;

    const est = (s: string) => Math.ceil(s.length / 4);
    console.log(
      `[SystemPrompt] Token distribution: soul=${est(soul)} profile=${est(profileSection)} memory=${est(memorySection)} health=${est(healthContext || "")} skills=${est(skillRegistry)} total≈${est(prompt)}`
    );

    return prompt;
  }

  // ============ Lifecycle ============

  close(): void {
    this.db.close();
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
