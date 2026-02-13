/**
 * Memory Manager - Main entry point for memory operations
 *
 * Thin wrapper combining:
 * - OpenClaw's MemoryIndexManager (search, sync, indexing)
 * - PHA's user management, health profiles, info extraction
 *
 * SQLite is a search index; files are the source of truth.
 */

import { Database } from "bun:sqlite";
import { createHash } from "crypto";
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
  private ftsAvailable: boolean;
  private vecAvailable: boolean;
  private indexManagers = new Map<string, MemoryIndexManager | null>();
  private indexInitPromises = new Map<string, Promise<MemoryIndexManager | null>>();

  constructor(private config: MemoryManagerConfig = {}) {
    const dbPath = join(getStateDir(), "memory.db");
    this.db = openMemoryDatabase(dbPath);
    const schemaResult = ensureMemorySchema(this.db);
    this.ftsAvailable = schemaResult.ftsAvailable;
    this.vecAvailable = schemaResult.vecAvailable;
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

  // ============ Memory Stats ============

  getMemoryStats(uuid: string): { totalChunks: number; lastUpdated: number } {
    const row = this.db
      .query<
        { count: number; last: number | null },
        [string]
      >(`SELECT COUNT(*) as count, MAX(updated_at) as last FROM chunks WHERE uuid = ?`)
      .get(uuid);

    return {
      totalChunks: row?.count ?? 0,
      lastUpdated: row?.last ?? 0,
    };
  }

  // ============ Memory Search (OpenClaw Engine) ============

  /**
   * Hybrid search using OpenClaw's MemoryIndexManager.
   * Falls back to simple FTS if index not available.
   */
  async searchAsync(
    uuid: string,
    query: string,
    options?: { maxResults?: number; minScore?: number }
  ): Promise<MemorySearchResult[]> {
    const maxResults = options?.maxResults ?? 5;
    const minScore = options?.minScore ?? 0.2;

    // Try OpenClaw engine first
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
        console.warn("[MemoryManager] Index search failed, falling back:", err);
      }
    }

    // Fallback to simple search on PHA's legacy DB
    return this.simpleSearch(uuid, query, maxResults);
  }

  /**
   * Sync version - simple keyword search on PHA's legacy DB
   */
  search(
    uuid: string,
    query: string,
    options?: { maxResults?: number; minScore?: number }
  ): MemorySearchResult[] {
    const maxResults = options?.maxResults ?? 5;
    return this.simpleSearch(uuid, query, maxResults);
  }

  private simpleSearch(uuid: string, query: string, maxResults: number): MemorySearchResult[] {
    const keywords = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (keywords.length === 0) return [];

    const rows = this.db
      .query<
        { path: string; start_line: number; end_line: number; text: string },
        [string, number]
      >("SELECT path, start_line, end_line, text FROM chunks WHERE uuid = ? LIMIT ?")
      .all(uuid, maxResults * 10);

    const results: MemorySearchResult[] = [];

    for (const row of rows) {
      const textLower = row.text.toLowerCase();
      let matchCount = 0;

      for (const keyword of keywords) {
        if (textLower.includes(keyword)) {
          matchCount++;
        }
      }

      if (matchCount > 0) {
        results.push({
          path: row.path,
          startLine: row.start_line,
          endLine: row.end_line,
          score: matchCount / keywords.length,
          snippet: row.text.slice(0, 200),
        });
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, maxResults);
  }

  // ============ Memory Writing ============

  appendMemory(uuid: string, content: string): void {
    this.ensureUser(uuid);
    appendToMemory(uuid, content);

    // Index in legacy PHA DB (for simpleSearch fallback)
    this.indexContent(uuid, "MEMORY.md", content);

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

    const date = new Date().toISOString().split("T")[0];
    this.indexContent(uuid, `memory/${date}.md`, content);

    // Trigger OpenClaw index sync
    this.getIndex(uuid).then((index) => {
      if (index) {
        void index.sync({ reason: "daily-log" }).catch((err) => {
          console.warn("[MemoryManager] Sync after daily log failed:", err);
        });
      }
    });
  }

  appendSessionTranscript(uuid: string, sessionId: string, content: string): void {
    this.ensureUser(uuid);
    this.indexContent(uuid, `sessions/${sessionId}.jsonl`, content);

    // Notify OpenClaw session listener
    const sessionFile = join(getStateDir(), "users", uuid, "sessions", `${sessionId}.jsonl`);
    emitSessionTranscriptUpdate(sessionFile);
  }

  private indexContent(uuid: string, path: string, content: string): void {
    const chunks = this.chunkText(content);
    const now = Date.now();

    for (const chunk of chunks) {
      const id = this.hashText(`${uuid}:${path}:${chunk.startLine}:${chunk.endLine}:${chunk.hash}`);

      this.db.run(
        `INSERT OR REPLACE INTO chunks (id, uuid, path, start_line, end_line, hash, model, text, embedding, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, uuid, path, chunk.startLine, chunk.endLine, chunk.hash, "none", chunk.text, "[]", now]
      );

      if (this.ftsAvailable) {
        try {
          this.db.run(
            `INSERT INTO chunks_fts (text, id, uuid, path, model, start_line, end_line)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [chunk.text, id, uuid, path, "none", chunk.startLine, chunk.endLine]
          );
        } catch {
          // FTS insert might fail on conflict, ignore
        }
      }
    }
  }

  private chunkText(
    text: string
  ): Array<{ text: string; startLine: number; endLine: number; hash: string }> {
    const CHUNK_MAX_TOKENS = 400;
    const CHUNK_OVERLAP_TOKENS = 80;
    const APPROX_CHARS_PER_TOKEN = 4;

    const lines = text.split("\n");
    const chunks: Array<{ text: string; startLine: number; endLine: number; hash: string }> = [];

    const maxChars = CHUNK_MAX_TOKENS * APPROX_CHARS_PER_TOKEN;
    const overlapChars = CHUNK_OVERLAP_TOKENS * APPROX_CHARS_PER_TOKEN;

    let currentChunk: string[] = [];
    let currentLength = 0;
    let startLine = 1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineLength = line.length + 1;

      if (currentLength + lineLength > maxChars && currentChunk.length > 0) {
        const text = currentChunk.join("\n");
        chunks.push({
          text,
          startLine,
          endLine: startLine + currentChunk.length - 1,
          hash: this.hashText(text),
        });

        let overlapLength = 0;
        let overlapStart = currentChunk.length - 1;
        while (overlapStart > 0 && overlapLength < overlapChars) {
          overlapLength += currentChunk[overlapStart].length + 1;
          overlapStart--;
        }

        currentChunk = currentChunk.slice(overlapStart + 1);
        startLine = startLine + overlapStart + 1;
        currentLength = currentChunk.reduce((sum, l) => sum + l.length + 1, 0);
      }

      currentChunk.push(line);
      currentLength += lineLength;
    }

    if (currentChunk.length > 0) {
      const text = currentChunk.join("\n");
      chunks.push({
        text,
        startLine,
        endLine: startLine + currentChunk.length - 1,
        hash: this.hashText(text),
      });
    }

    return chunks;
  }

  private hashText(text: string): string {
    return createHash("sha256").update(text).digest("hex").slice(0, 16);
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
