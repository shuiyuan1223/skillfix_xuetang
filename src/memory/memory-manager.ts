/**
 * Memory Manager - Main entry point for memory operations
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
import { VectorStore, type VectorDocument } from "./vector-store.js";
import {
  mergeHybridResults,
  buildFtsQuery,
  bm25RankToScore,
  DEFAULT_HYBRID_CONFIG,
  type HybridConfig,
  type HybridVectorResult,
  type HybridKeywordResult,
} from "./hybrid.js";
import type { EmbeddingConfig } from "./embeddings.js";
import type { UserProfile, MemorySearchResult, MemoryChunk } from "./types.js";

const CHUNK_MAX_TOKENS = 400;
const CHUNK_OVERLAP_TOKENS = 80;
const APPROX_CHARS_PER_TOKEN = 4;

export interface MemoryManagerConfig {
  /** Embedding configuration */
  embeddingConfig?: EmbeddingConfig;
  /** Hybrid search configuration */
  hybridConfig?: Partial<HybridConfig>;
}

export class MemoryManager {
  private db: Database;
  private userStore: UserStore;
  private ftsAvailable: boolean;
  private vecAvailable: boolean;
  private vectorStore: VectorStore;

  constructor(private config: MemoryManagerConfig = {}) {
    const dbPath = join(getStateDir(), "memory.db");
    this.db = openMemoryDatabase(dbPath);
    const schemaResult = ensureMemorySchema(this.db);
    this.ftsAvailable = schemaResult.ftsAvailable;
    this.vecAvailable = schemaResult.vecAvailable;
    this.userStore = new UserStore(this.db);

    // VectorStore uses the same DB — no async init needed
    this.vectorStore = new VectorStore(this.db, this.vecAvailable, config.embeddingConfig);

    if (this.vectorStore.isAvailable()) {
      console.log("[MemoryManager] Vector search enabled (sqlite-vec)");
    }
  }

  // ============ User Management ============

  /**
   * Ensure user exists in database
   */
  ensureUser(uuid: string): void {
    this.userStore.ensureUser(uuid);
    ensureUserDir(uuid);
  }

  /**
   * Get user profile (file is source of truth)
   */
  getProfile(uuid: string): UserProfile {
    return loadProfileFromFile(uuid);
  }

  /**
   * Update user profile (saves to file only)
   */
  updateProfile(uuid: string, updates: Partial<UserProfile>): void {
    this.ensureUser(uuid);

    const current = this.getProfile(uuid);

    // Deep merge
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

  /**
   * Delete user and all their data
   */
  deleteUser(uuid: string): void {
    this.userStore.deleteUser(uuid);
    this.vectorStore.deleteUserDocuments(uuid);
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

  // ============ Memory Search ============

  /**
   * Hybrid search - combines vector search and keyword search
   */
  async searchAsync(
    uuid: string,
    query: string,
    options?: { maxResults?: number; minScore?: number }
  ): Promise<MemorySearchResult[]> {
    const maxResults = options?.maxResults ?? 5;
    const minScore = options?.minScore ?? 0.3;
    const hybridConfig = { ...DEFAULT_HYBRID_CONFIG, ...this.config.hybridConfig };

    const candidates = Math.max(maxResults * hybridConfig.candidateMultiplier, 10);

    const [vectorResults, keywordResults] = await Promise.all([
      this.vectorSearchInternal(uuid, query, candidates),
      Promise.resolve(this.keywordSearchInternal(uuid, query, candidates)),
    ]);

    if (vectorResults.length === 0 && keywordResults.length === 0) {
      return this.simpleSearch(uuid, query, maxResults);
    }

    const merged = mergeHybridResults({
      vector: vectorResults,
      keyword: keywordResults,
      vectorWeight: hybridConfig.vectorWeight,
      textWeight: hybridConfig.textWeight,
    });

    return merged
      .filter((r) => r.score >= minScore)
      .slice(0, maxResults)
      .map((r) => ({
        path: r.path,
        startLine: r.startLine,
        endLine: r.endLine,
        score: r.score,
        snippet: r.snippet,
      }));
  }

  private async vectorSearchInternal(
    uuid: string,
    query: string,
    limit: number
  ): Promise<HybridVectorResult[]> {
    if (!this.vectorStore.isAvailable()) {
      return [];
    }

    try {
      const results = await this.vectorStore.search(uuid, query, {
        maxResults: limit,
        minScore: 0,
      });

      return results.map((r) => ({
        id: this.hashText(`${uuid}:${r.path}:${r.startLine}:${r.endLine}`),
        path: r.path,
        startLine: r.startLine,
        endLine: r.endLine,
        snippet: r.snippet,
        vectorScore: r.score,
      }));
    } catch (error) {
      console.warn("[MemoryManager] Vector search failed:", error);
      return [];
    }
  }

  private keywordSearchInternal(uuid: string, query: string, limit: number): HybridKeywordResult[] {
    if (!this.ftsAvailable) {
      return [];
    }

    const ftsQuery = buildFtsQuery(query);
    if (!ftsQuery) return [];

    try {
      const rows = this.db
        .query<
          {
            id: string;
            path: string;
            start_line: number;
            end_line: number;
            text: string;
            rank: number;
          },
          [string, string, number]
        >(
          `SELECT id, path, start_line, end_line, text, rank
           FROM chunks_fts
           WHERE uuid = ? AND chunks_fts MATCH ?
           ORDER BY rank
           LIMIT ?`
        )
        .all(uuid, ftsQuery, limit);

      return rows.map((row) => ({
        id: row.id,
        path: row.path,
        startLine: row.start_line,
        endLine: row.end_line,
        snippet: row.text.slice(0, 200),
        textScore: bm25RankToScore(row.rank),
      }));
    } catch (error) {
      console.warn("[MemoryManager] FTS search failed:", error);
      return [];
    }
  }

  /**
   * Search user's memory (sync version, FTS or simple)
   */
  search(
    uuid: string,
    query: string,
    options?: { maxResults?: number; minScore?: number }
  ): MemorySearchResult[] {
    const maxResults = options?.maxResults ?? 5;
    const minScore = options?.minScore ?? 0.3;

    if (!this.ftsAvailable) {
      return this.simpleSearch(uuid, query, maxResults);
    }

    return this.ftsSearch(uuid, query, maxResults, minScore);
  }

  private ftsSearch(
    uuid: string,
    query: string,
    maxResults: number,
    _minScore: number
  ): MemorySearchResult[] {
    const ftsQuery = query
      .split(/\s+/)
      .filter((word) => word.length > 0)
      .map((word) => `"${word}"`)
      .join(" OR ");

    if (!ftsQuery) return [];

    try {
      const rows = this.db
        .query<
          { id: string; path: string; start_line: number; end_line: number; text: string },
          [string, string, number]
        >(
          `SELECT id, path, start_line, end_line, text
           FROM chunks_fts
           WHERE uuid = ? AND chunks_fts MATCH ?
           ORDER BY rank
           LIMIT ?`
        )
        .all(uuid, ftsQuery, maxResults);

      return rows.map((row) => ({
        path: row.path,
        startLine: row.start_line,
        endLine: row.end_line,
        score: 1.0,
        snippet: row.text.slice(0, 200),
      }));
    } catch (err) {
      console.warn("FTS search error:", err);
      return this.simpleSearch(uuid, query, maxResults);
    }
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
    this.indexContent(uuid, "MEMORY.md", content);
  }

  appendDailyLog(uuid: string, content: string): void {
    this.ensureUser(uuid);
    appendToDailyLog(uuid, content);

    const date = new Date().toISOString().split("T")[0];
    this.indexContent(uuid, `memory/${date}.md`, content);
  }

  appendSessionTranscript(uuid: string, sessionId: string, content: string): void {
    this.ensureUser(uuid);
    this.indexContent(uuid, `sessions/${sessionId}.jsonl`, content);
  }

  private indexContent(uuid: string, path: string, content: string): void {
    const chunks = this.chunkText(content);
    const now = Date.now();

    const vectorDocs: VectorDocument[] = [];

    for (const chunk of chunks) {
      const id = this.hashText(`${uuid}:${path}:${chunk.startLine}:${chunk.endLine}:${chunk.hash}`);

      // Insert into chunks table
      this.db.run(
        `INSERT OR REPLACE INTO chunks (id, uuid, path, start_line, end_line, hash, model, text, embedding, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, uuid, path, chunk.startLine, chunk.endLine, chunk.hash, "none", chunk.text, "[]", now]
      );

      // Insert into FTS if available
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

      vectorDocs.push({
        id,
        text: chunk.text,
        metadata: {
          uuid,
          path,
          startLine: chunk.startLine,
          endLine: chunk.endLine,
          source: "memory",
        },
      });
    }

    // Index to vector store asynchronously
    if (vectorDocs.length > 0 && this.vectorStore.isAvailable()) {
      this.vectorStore.addDocuments(vectorDocs).catch((err) => {
        console.warn("[MemoryManager] Vector indexing failed:", err);
      });
    }
  }

  private chunkText(text: string): MemoryChunk[] {
    const lines = text.split("\n");
    const chunks: MemoryChunk[] = [];

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

    // Token distribution report (debug)
    const est = (s: string) => Math.ceil(s.length / 4);
    console.log(
      `[SystemPrompt] Token distribution: soul=${est(soul)} profile=${est(profileSection)} memory=${est(memorySection)} health=${est(healthContext || "")} skills=${est(skillRegistry)} total≈${est(prompt)}`
    );

    return prompt;
  }

  // ============ Lifecycle ============

  close(): void {
    this.db.close();
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
