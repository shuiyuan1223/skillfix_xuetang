/**
 * Memory Index Manager (from OpenClaw, adapted for PHA)
 *
 * Core indexing engine for memory search. Handles:
 * - Embedding generation and caching
 * - Vector search (sqlite-vec) + FTS5 keyword search
 * - File watching and session transcript indexing
 * - Atomic reindex with rollback
 *
 * This is OpenClaw's MemoryIndexManager with:
 * - Batch embedding removed (PHA uses regular OpenRouter embeddings)
 * - Config simplified for PHA
 * - bun:sqlite instead of node:sqlite
 */

import { Database } from "bun:sqlite";
import chokidar, { type FSWatcher } from "chokidar";
import { randomUUID } from "node:crypto";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import {
  createSubsystemLogger,
  resolveAgentWorkspaceDir,
  resolveSessionTranscriptsDirForAgent,
  onSessionTranscriptUpdate,
} from "./compat.js";
import {
  resolveEmbeddingApiKey,
  resolveEmbeddingModel,
  resolveEmbeddingBaseUrl,
  isEmbeddingEnabled,
  createEmbeddingProvider,
  createNoopEmbeddingProvider,
  type EmbeddingProvider,
  type EmbeddingProviderResult,
  type OpenAiEmbeddingClient,
} from "./embeddings.js";
import { enforceEmbeddingMaxInputTokens } from "./embedding-chunk-limits.js";
import { estimateUtf8Bytes } from "./embedding-input-limits.js";
import { bm25RankToScore, buildFtsQuery, mergeHybridResults } from "./hybrid.js";
import {
  buildFileEntry,
  chunkMarkdown,
  ensureDir,
  hashText,
  isMemoryPath,
  listMemoryFiles,
  normalizeExtraMemoryPaths,
  type MemoryChunk,
  type MemoryFileEntry,
  parseEmbedding,
  remapChunkLines,
  runWithConcurrency,
} from "./internal.js";
import { searchKeyword, searchVector } from "./manager-search.js";
import { ensureMemoryIndexSchema } from "./memory-schema.js";
import {
  buildSessionEntry,
  listSessionFilesForAgent,
  sessionPathForFile,
  type SessionFileEntry,
} from "./session-files.js";
import { loadSqliteVecExtension } from "./sqlite-vec.js";

// ============ Types ============

export type MemorySource = "memory" | "sessions";

export type MemorySearchResult = {
  path: string;
  startLine: number;
  endLine: number;
  score: number;
  snippet: string;
  source: MemorySource;
};

export type MemorySyncProgressUpdate = {
  completed: number;
  total: number;
  label?: string;
};

export type MemoryProviderStatus = {
  backend: "builtin";
  provider: string;
  model?: string;
  files?: number;
  chunks?: number;
  dirty?: boolean;
  workspaceDir?: string;
  dbPath?: string;
  sources?: MemorySource[];
  cache?: { enabled: boolean; entries?: number; maxEntries?: number };
  fts?: { enabled: boolean; available: boolean; error?: string };
  vector?: {
    enabled: boolean;
    available?: boolean;
    loadError?: string;
    dims?: number;
  };
};

type MemoryIndexMeta = {
  model: string;
  provider: string;
  providerKey?: string;
  chunkTokens: number;
  chunkOverlap: number;
  vectorDims?: number;
};

type MemorySyncProgressState = {
  completed: number;
  total: number;
  label?: string;
  report: (update: MemorySyncProgressUpdate) => void;
};

/**
 * PHA simplified config (replaces OpenClaw's ResolvedMemorySearchConfig).
 */
export interface PHAMemorySearchConfig {
  // Embedding
  provider: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;

  // Sources
  sources: MemorySource[];
  extraPaths: string[];

  // Chunking
  chunking: { tokens: number; overlap: number };

  // Query
  query: {
    maxResults: number;
    minScore: number;
    hybrid: {
      enabled: boolean;
      vectorWeight: number;
      textWeight: number;
      candidateMultiplier: number;
    };
  };

  // Store
  store: {
    path: string;
    vector: { enabled: boolean };
  };

  // Sync
  sync: {
    watch: boolean;
    watchDebounceMs: number;
    onSearch: boolean;
    onSessionStart: boolean;
    intervalMinutes: number;
    sessions?: {
      deltaBytes: number;
      deltaMessages: number;
    };
  };

  // Cache
  cache: { enabled: boolean; maxEntries?: number };
}

// ============ Constants ============

const META_KEY = "memory_index_meta_v1";
const SNIPPET_MAX_CHARS = 700;
const VECTOR_TABLE = "chunks_vec";
const FTS_TABLE = "chunks_fts";
const EMBEDDING_CACHE_TABLE = "embedding_cache";
const SESSION_DIRTY_DEBOUNCE_MS = 5000;
const EMBEDDING_BATCH_MAX_TOKENS = 8000;
const EMBEDDING_INDEX_CONCURRENCY = 4;
const EMBEDDING_RETRY_MAX_ATTEMPTS = 3;
const EMBEDDING_RETRY_BASE_DELAY_MS = 500;
const EMBEDDING_RETRY_MAX_DELAY_MS = 8000;
const SESSION_DELTA_READ_CHUNK_BYTES = 64 * 1024;
const VECTOR_LOAD_TIMEOUT_MS = 30_000;
const EMBEDDING_QUERY_TIMEOUT_MS = 60_000;
const EMBEDDING_BATCH_TIMEOUT_MS = 2 * 60_000;

const log = createSubsystemLogger("memory");

const INDEX_CACHE = new Map<string, MemoryIndexManager>();

const vectorToBlob = (embedding: number[]): Buffer =>
  Buffer.from(new Float32Array(embedding).buffer);

// ============ Default Config ============

/**
 * Build default PHA memory search config for a given user directory.
 */
export function defaultPHAMemorySearchConfig(userDir: string): PHAMemorySearchConfig {
  return {
    provider: "openai",
    model: resolveEmbeddingModel(),
    apiKey: resolveEmbeddingApiKey(),
    baseUrl: resolveEmbeddingBaseUrl(),
    sources: ["memory", "sessions"],
    extraPaths: [],
    chunking: { tokens: 400, overlap: 80 },
    query: {
      maxResults: 10,
      minScore: 0.2,
      hybrid: {
        enabled: true,
        vectorWeight: 0.7,
        textWeight: 0.3,
        candidateMultiplier: 3,
      },
    },
    store: {
      path: path.join(userDir, "memory-index.db"),
      vector: { enabled: true },
    },
    sync: {
      watch: true,
      watchDebounceMs: 2000,
      onSearch: true,
      onSessionStart: true,
      intervalMinutes: 5,
      sessions: { deltaBytes: 4096, deltaMessages: 10 },
    },
    cache: { enabled: true, maxEntries: 10000 },
  };
}

// ============ MemoryIndexManager ============

export class MemoryIndexManager {
  private readonly cacheKey: string;
  private readonly agentId: string;
  private readonly workspaceDir: string;
  private readonly settings: PHAMemorySearchConfig;
  private provider: EmbeddingProvider;
  private readonly requestedProvider: "openai" | "auto";
  private openAi?: OpenAiEmbeddingClient;
  private db: Database;
  private readonly sources: Set<MemorySource>;
  private providerKey: string;
  private readonly cache: { enabled: boolean; maxEntries?: number };
  private readonly vector: {
    enabled: boolean;
    available: boolean | null;
    loadError?: string;
    dims?: number;
  };
  private readonly fts: {
    enabled: boolean;
    available: boolean;
    loadError?: string;
  };
  private vectorReady: Promise<boolean> | null = null;
  private watcher: FSWatcher | null = null;
  private watchTimer: NodeJS.Timeout | null = null;
  private sessionWatchTimer: NodeJS.Timeout | null = null;
  private sessionUnsubscribe: (() => void) | null = null;
  private intervalTimer: NodeJS.Timeout | null = null;
  private closed = false;
  private dirty = false;
  private sessionsDirty = false;
  private sessionsDirtyFiles = new Set<string>();
  private sessionPendingFiles = new Set<string>();
  private sessionDeltas = new Map<
    string,
    { lastSize: number; pendingBytes: number; pendingMessages: number }
  >();
  private sessionWarm = new Set<string>();
  private syncing: Promise<void> | null = null;

  // ============ Static Factory ============

  /**
   * Get or create a MemoryIndexManager for the given agent.
   * Returns null if embeddings are not enabled or no API key is available.
   */
  static async get(params: {
    agentId: string;
    workspaceDir?: string;
  }): Promise<MemoryIndexManager | null> {
    if (!isEmbeddingEnabled()) {
      return null;
    }

    const workspaceDir = params.workspaceDir || resolveAgentWorkspaceDir(null, params.agentId);
    const key = `${params.agentId}:${workspaceDir}`;
    const existing = INDEX_CACHE.get(key);
    if (existing) {
      return existing;
    }

    const apiKey = resolveEmbeddingApiKey();
    const settings = defaultPHAMemorySearchConfig(workspaceDir);
    settings.apiKey = apiKey;

    let providerResult: EmbeddingProviderResult;

    if (apiKey) {
      providerResult = await createEmbeddingProvider({
        provider: settings.provider,
        model: settings.model,
        apiKey: settings.apiKey,
        remote: { baseUrl: settings.baseUrl, apiKey: settings.apiKey },
        fallback: "none",
      });
    } else {
      // No API key — fallback to BM25-only (keyword search still works)
      log.info("No embedding API key — using BM25-only memory search");
      providerResult = createNoopEmbeddingProvider();
      settings.store.vector.enabled = false;
    }

    const manager = new MemoryIndexManager({
      cacheKey: key,
      agentId: params.agentId,
      workspaceDir,
      settings,
      providerResult,
    });
    INDEX_CACHE.set(key, manager);
    return manager;
  }

  // ============ Constructor ============

  private constructor(params: {
    cacheKey: string;
    agentId: string;
    workspaceDir: string;
    settings: PHAMemorySearchConfig;
    providerResult: EmbeddingProviderResult;
  }) {
    this.cacheKey = params.cacheKey;
    this.agentId = params.agentId;
    this.workspaceDir = params.workspaceDir;
    this.settings = params.settings;
    this.provider = params.providerResult.provider;
    this.requestedProvider = params.providerResult.requestedProvider;
    this.openAi = params.providerResult.openAi;
    this.sources = new Set(params.settings.sources);
    this.db = this.openDatabase();
    this.providerKey = this.computeProviderKey();
    this.cache = {
      enabled: params.settings.cache.enabled,
      maxEntries: params.settings.cache.maxEntries,
    };
    this.fts = { enabled: params.settings.query.hybrid.enabled, available: false };
    this.ensureSchema();
    this.vector = {
      enabled: params.settings.store.vector.enabled,
      available: null,
    };
    const meta = this.readMeta();
    if (meta?.vectorDims) {
      this.vector.dims = meta.vectorDims;
    }
    this.ensureWatcher();
    this.ensureSessionListener();
    this.ensureIntervalSync();
    this.dirty = this.sources.has("memory");
  }

  // ============ Public API ============

  /**
   * Warm session: trigger sync on session start if configured.
   */
  async warmSession(sessionKey?: string): Promise<void> {
    if (!this.settings.sync.onSessionStart) {
      return;
    }
    const key = sessionKey?.trim() || "";
    if (key && this.sessionWarm.has(key)) {
      return;
    }
    void this.sync({ reason: "session-start" }).catch((err) => {
      log.warn(`memory sync failed (session-start): ${String(err)}`);
    });
    if (key) {
      this.sessionWarm.add(key);
    }
  }

  /**
   * Search memory using hybrid vector + keyword search.
   */
  async search(
    query: string,
    opts?: {
      maxResults?: number;
      minScore?: number;
      sessionKey?: string;
    }
  ): Promise<MemorySearchResult[]> {
    void this.warmSession(opts?.sessionKey);

    if (this.settings.sync.onSearch && (this.dirty || this.sessionsDirty)) {
      await this.sync({ reason: "search" }).catch((err) => {
        log.warn(`memory sync failed (search): ${String(err)}`);
      });
    }

    const cleaned = query.trim();
    if (!cleaned) {
      return [];
    }

    const minScore = opts?.minScore ?? this.settings.query.minScore;
    const maxResults = opts?.maxResults ?? this.settings.query.maxResults;
    const hybrid = this.settings.query.hybrid;
    const candidates = Math.min(
      200,
      Math.max(1, Math.floor(maxResults * hybrid.candidateMultiplier))
    );

    const keywordResults = hybrid.enabled
      ? await this.searchKeywordInternal(cleaned, candidates).catch(() => [])
      : [];

    const queryVec = await this.embedQueryWithTimeout(cleaned);
    const hasVector = queryVec.some((v) => v !== 0);
    const vectorResults = hasVector
      ? await this.searchVectorInternal(queryVec, candidates).catch(() => [])
      : [];

    if (!hybrid.enabled) {
      return vectorResults.filter((entry) => entry.score >= minScore).slice(0, maxResults);
    }

    const merged = this.mergeHybridResultsInternal({
      vector: vectorResults,
      keyword: keywordResults,
      vectorWeight: hybrid.vectorWeight,
      textWeight: hybrid.textWeight,
    });

    return merged.filter((entry) => entry.score >= minScore).slice(0, maxResults);
  }

  /**
   * Trigger sync of memory files and session transcripts.
   */
  async sync(params?: {
    reason?: string;
    force?: boolean;
    progress?: (update: MemorySyncProgressUpdate) => void;
  }): Promise<void> {
    if (this.syncing) {
      return this.syncing;
    }
    this.syncing = this.runSync(params).finally(() => {
      this.syncing = null;
    });
    return this.syncing;
  }

  /**
   * Read a memory file by relative path.
   */
  private async isAllowedAdditionalPath(absPath: string): Promise<boolean> {
    if (this.settings.extraPaths.length === 0) return false;
    const additionalPaths = normalizeExtraMemoryPaths(this.workspaceDir, this.settings.extraPaths);
    for (const additionalPath of additionalPaths) {
      try {
        const stat = await fs.lstat(additionalPath);
        if (stat.isSymbolicLink()) continue;
        if (stat.isDirectory()) {
          if (absPath === additionalPath || absPath.startsWith(`${additionalPath}${path.sep}`)) {
            return true;
          }
          continue;
        }
        if (stat.isFile() && absPath === additionalPath && absPath.endsWith(".md")) {
          return true;
        }
      } catch {
        // ignore
      }
    }
    return false;
  }

  async readFile(params: {
    relPath: string;
    from?: number;
    lines?: number;
  }): Promise<{ text: string; path: string }> {
    const rawPath = params.relPath.trim();
    if (!rawPath) throw new Error("path required");

    const absPath = path.isAbsolute(rawPath)
      ? path.resolve(rawPath)
      : path.resolve(this.workspaceDir, rawPath);
    const relPath = path.relative(this.workspaceDir, absPath).replace(/\\/g, "/");
    const inWorkspace =
      relPath.length > 0 && !relPath.startsWith("..") && !path.isAbsolute(relPath);
    const allowedWorkspace = inWorkspace && isMemoryPath(relPath);
    const allowedAdditional = allowedWorkspace
      ? false
      : await this.isAllowedAdditionalPath(absPath);

    if (!allowedWorkspace && !allowedAdditional) throw new Error("path required");
    if (!absPath.endsWith(".md")) throw new Error("path required");

    const stat = await fs.lstat(absPath);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error("path required");

    const content = await fs.readFile(absPath, "utf-8");
    if (!params.from && !params.lines) {
      return { text: content, path: relPath };
    }
    const lines = content.split("\n");
    const start = Math.max(1, params.from ?? 1);
    const count = Math.max(1, params.lines ?? lines.length);
    const slice = lines.slice(start - 1, start - 1 + count);
    return { text: slice.join("\n"), path: relPath };
  }

  /**
   * Return current status of the memory index.
   */
  status(): MemoryProviderStatus {
    const sourceFilter = this.buildSourceFilter();
    const files = this.db
      .prepare(`SELECT COUNT(*) as c FROM files WHERE 1=1${sourceFilter.sql}`)
      .get(...sourceFilter.params) as { c: number } | undefined;
    const chunks = this.db
      .prepare(`SELECT COUNT(*) as c FROM chunks WHERE 1=1${sourceFilter.sql}`)
      .get(...sourceFilter.params) as { c: number } | undefined;

    return {
      backend: "builtin",
      files: files?.c ?? 0,
      chunks: chunks?.c ?? 0,
      dirty: this.dirty || this.sessionsDirty,
      workspaceDir: this.workspaceDir,
      dbPath: this.settings.store.path,
      provider: this.provider.id,
      model: this.provider.model,
      sources: Array.from(this.sources),
      cache: this.cache.enabled
        ? {
            enabled: true,
            entries:
              (
                this.db.prepare(`SELECT COUNT(*) as c FROM ${EMBEDDING_CACHE_TABLE}`).get() as
                  | { c: number }
                  | undefined
              )?.c ?? 0,
            maxEntries: this.cache.maxEntries,
          }
        : { enabled: false, maxEntries: this.cache.maxEntries },
      fts: {
        enabled: this.fts.enabled,
        available: this.fts.available,
        error: this.fts.loadError,
      },
      vector: {
        enabled: this.vector.enabled,
        available: this.vector.available ?? undefined,
        loadError: this.vector.loadError,
        dims: this.vector.dims,
      },
    };
  }

  /**
   * Probe if the vector extension is available.
   */
  async probeVectorAvailability(): Promise<boolean> {
    if (!this.vector.enabled) {
      return false;
    }
    return this.ensureVectorReady();
  }

  /**
   * Probe if the embedding provider is reachable.
   */
  async probeEmbeddingAvailability(): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.embedBatchWithRetry(["ping"]);
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  }

  /**
   * Close the manager and clean up all resources.
   */
  async close(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;
    if (this.watchTimer) {
      clearTimeout(this.watchTimer);
      this.watchTimer = null;
    }
    if (this.sessionWatchTimer) {
      clearTimeout(this.sessionWatchTimer);
      this.sessionWatchTimer = null;
    }
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
    if (this.sessionUnsubscribe) {
      this.sessionUnsubscribe();
      this.sessionUnsubscribe = null;
    }
    this.db.close();
    INDEX_CACHE.delete(this.cacheKey);
  }

  // ============ Vector Extension ============

  private async ensureVectorReady(dimensions?: number): Promise<boolean> {
    if (!this.vector.enabled) {
      return false;
    }
    if (!this.vectorReady) {
      this.vectorReady = this.withTimeout(
        this.loadVectorExtension(),
        VECTOR_LOAD_TIMEOUT_MS,
        `sqlite-vec load timed out after ${Math.round(VECTOR_LOAD_TIMEOUT_MS / 1000)}s`
      );
    }
    let ready = false;
    try {
      ready = await this.vectorReady;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.vector.available = false;
      this.vector.loadError = message;
      this.vectorReady = null;
      log.warn(`sqlite-vec unavailable: ${message}`);
      return false;
    }
    if (ready && typeof dimensions === "number" && dimensions > 0) {
      this.ensureVectorTable(dimensions);
    }
    return ready;
  }

  private async loadVectorExtension(): Promise<boolean> {
    if (this.vector.available !== null) {
      return this.vector.available;
    }
    if (!this.vector.enabled) {
      this.vector.available = false;
      return false;
    }
    try {
      const loaded = await loadSqliteVecExtension({ db: this.db });
      if (!loaded.ok) {
        throw new Error(loaded.error ?? "unknown sqlite-vec load error");
      }
      this.vector.available = true;
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.vector.available = false;
      this.vector.loadError = message;
      log.warn(`sqlite-vec unavailable: ${message}`);
      return false;
    }
  }

  private ensureVectorTable(dimensions: number): void {
    if (this.vector.dims === dimensions) {
      return;
    }
    if (this.vector.dims && this.vector.dims !== dimensions) {
      this.dropVectorTable();
    }
    this.db.run(
      `CREATE VIRTUAL TABLE IF NOT EXISTS ${VECTOR_TABLE} USING vec0(` +
        `  id TEXT PRIMARY KEY,` +
        `  embedding FLOAT[${dimensions}]` +
        `)`
    );
    this.vector.dims = dimensions;
  }

  private dropVectorTable(): void {
    try {
      this.db.run(`DROP TABLE IF EXISTS ${VECTOR_TABLE}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.debug(`Failed to drop ${VECTOR_TABLE}: ${message}`);
    }
  }

  // ============ Schema ============

  private ensureSchema(): void {
    const result = ensureMemoryIndexSchema({
      db: this.db,
      embeddingCacheTable: EMBEDDING_CACHE_TABLE,
      ftsTable: FTS_TABLE,
      ftsEnabled: this.fts.enabled,
    });
    this.fts.available = result.ftsAvailable;
    if (result.ftsError) {
      this.fts.loadError = result.ftsError;
      log.warn(`fts unavailable: ${result.ftsError}`);
    }
  }

  // ============ Database ============

  private openDatabase(): Database {
    const dbPath = this.settings.store.path;
    return this.openDatabaseAtPath(dbPath);
  }

  private openDatabaseAtPath(dbPath: string): Database {
    const dir = path.dirname(dbPath);
    ensureDir(dir);
    return new Database(dbPath);
  }

  // ============ Watchers ============

  private ensureWatcher(): void {
    if (!this.sources.has("memory") || !this.settings.sync.watch || this.watcher) {
      return;
    }
    const additionalPaths = normalizeExtraMemoryPaths(this.workspaceDir, this.settings.extraPaths)
      .map((entry) => {
        try {
          const stat = fsSync.lstatSync(entry);
          return stat.isSymbolicLink() ? null : entry;
        } catch {
          return null;
        }
      })
      .filter((entry): entry is string => Boolean(entry));

    const watchPaths = new Set<string>([
      path.join(this.workspaceDir, "MEMORY.md"),
      path.join(this.workspaceDir, "memory.md"),
      path.join(this.workspaceDir, "memory"),
      ...additionalPaths,
    ]);

    this.watcher = chokidar.watch(Array.from(watchPaths), {
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: this.settings.sync.watchDebounceMs,
        pollInterval: 100,
      },
    });
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    const markDirty = () => {
      this.dirty = true;
      this.scheduleWatchSync();
    };
    this.watcher.on("add", markDirty);
    this.watcher.on("change", markDirty);
    this.watcher.on("unlink", markDirty);
  }

  private ensureSessionListener(): void {
    if (!this.sources.has("sessions") || this.sessionUnsubscribe) {
      return;
    }
    this.sessionUnsubscribe = onSessionTranscriptUpdate((update) => {
      if (this.closed) {
        return;
      }
      const sessionFile = update.sessionFile;
      if (!this.isSessionFileForAgent(sessionFile)) {
        return;
      }
      this.scheduleSessionDirty(sessionFile);
    });
  }

  private ensureIntervalSync(): void {
    const minutes = this.settings.sync.intervalMinutes;
    if (!minutes || minutes <= 0 || this.intervalTimer) {
      return;
    }
    const ms = minutes * 60 * 1000;
    this.intervalTimer = setInterval(() => {
      void this.sync({ reason: "interval" }).catch((err) => {
        log.warn(`memory sync failed (interval): ${String(err)}`);
      });
    }, ms);
  }

  private scheduleWatchSync(): void {
    if (!this.sources.has("memory") || !this.settings.sync.watch) {
      return;
    }
    if (this.watchTimer) {
      clearTimeout(this.watchTimer);
    }
    this.watchTimer = setTimeout(() => {
      this.watchTimer = null;
      void this.sync({ reason: "watch" }).catch((err) => {
        log.warn(`memory sync failed (watch): ${String(err)}`);
      });
    }, this.settings.sync.watchDebounceMs);
  }

  // ============ Session Delta Tracking ============

  private scheduleSessionDirty(sessionFile: string): void {
    this.sessionPendingFiles.add(sessionFile);
    if (this.sessionWatchTimer) {
      return;
    }
    this.sessionWatchTimer = setTimeout(() => {
      this.sessionWatchTimer = null;
      void this.processSessionDeltaBatch().catch((err) => {
        log.warn(`memory session delta failed: ${String(err)}`);
      });
    }, SESSION_DIRTY_DEBOUNCE_MS);
  }

  private async processSessionDeltaBatch(): Promise<void> {
    if (this.sessionPendingFiles.size === 0) {
      return;
    }
    const pending = Array.from(this.sessionPendingFiles);
    this.sessionPendingFiles.clear();
    let shouldSync = false;
    for (const sessionFile of pending) {
      const delta = await this.updateSessionDelta(sessionFile);
      if (!delta) {
        continue;
      }
      const bytesThreshold = delta.deltaBytes;
      const messagesThreshold = delta.deltaMessages;
      const bytesHit =
        bytesThreshold <= 0 ? delta.pendingBytes > 0 : delta.pendingBytes >= bytesThreshold;
      const messagesHit =
        messagesThreshold <= 0
          ? delta.pendingMessages > 0
          : delta.pendingMessages >= messagesThreshold;
      if (!bytesHit && !messagesHit) {
        continue;
      }
      this.sessionsDirtyFiles.add(sessionFile);
      this.sessionsDirty = true;
      delta.pendingBytes =
        bytesThreshold > 0 ? Math.max(0, delta.pendingBytes - bytesThreshold) : 0;
      delta.pendingMessages =
        messagesThreshold > 0 ? Math.max(0, delta.pendingMessages - messagesThreshold) : 0;
      shouldSync = true;
    }
    if (shouldSync) {
      void this.sync({ reason: "session-delta" }).catch((err) => {
        log.warn(`memory sync failed (session-delta): ${String(err)}`);
      });
    }
  }

  private async updateSessionDelta(sessionFile: string): Promise<{
    deltaBytes: number;
    deltaMessages: number;
    pendingBytes: number;
    pendingMessages: number;
  } | null> {
    const thresholds = this.settings.sync.sessions;
    if (!thresholds) {
      return null;
    }
    let stat: { size: number };
    try {
      stat = await fs.stat(sessionFile);
    } catch {
      return null;
    }
    const size = stat.size;
    let state = this.sessionDeltas.get(sessionFile);
    if (!state) {
      state = { lastSize: 0, pendingBytes: 0, pendingMessages: 0 };
      this.sessionDeltas.set(sessionFile, state);
    }
    const deltaBytes = Math.max(0, size - state.lastSize);
    if (deltaBytes === 0 && size === state.lastSize) {
      return {
        deltaBytes: thresholds.deltaBytes,
        deltaMessages: thresholds.deltaMessages,
        pendingBytes: state.pendingBytes,
        pendingMessages: state.pendingMessages,
      };
    }
    if (size < state.lastSize) {
      state.lastSize = size;
      state.pendingBytes += size;
      const shouldCountMessages =
        thresholds.deltaMessages > 0 &&
        (thresholds.deltaBytes <= 0 || state.pendingBytes < thresholds.deltaBytes);
      if (shouldCountMessages) {
        state.pendingMessages += await this.countNewlines(sessionFile, 0, size);
      }
    } else {
      state.pendingBytes += deltaBytes;
      const shouldCountMessages =
        thresholds.deltaMessages > 0 &&
        (thresholds.deltaBytes <= 0 || state.pendingBytes < thresholds.deltaBytes);
      if (shouldCountMessages) {
        state.pendingMessages += await this.countNewlines(sessionFile, state.lastSize, size);
      }
      state.lastSize = size;
    }
    this.sessionDeltas.set(sessionFile, state);
    return {
      deltaBytes: thresholds.deltaBytes,
      deltaMessages: thresholds.deltaMessages,
      pendingBytes: state.pendingBytes,
      pendingMessages: state.pendingMessages,
    };
  }

  private async countNewlines(absPath: string, start: number, end: number): Promise<number> {
    if (end <= start) {
      return 0;
    }
    const handle = await fs.open(absPath, "r");
    try {
      let offset = start;
      let count = 0;
      const buffer = Buffer.alloc(SESSION_DELTA_READ_CHUNK_BYTES);
      while (offset < end) {
        const toRead = Math.min(buffer.length, end - offset);
        const { bytesRead } = await handle.read(buffer, 0, toRead, offset);
        if (bytesRead <= 0) {
          break;
        }
        for (let i = 0; i < bytesRead; i += 1) {
          if (buffer[i] === 10) {
            count += 1;
          }
        }
        offset += bytesRead;
      }
      return count;
    } finally {
      await handle.close();
    }
  }

  private resetSessionDelta(absPath: string, size: number): void {
    const state = this.sessionDeltas.get(absPath);
    if (!state) {
      return;
    }
    state.lastSize = size;
    state.pendingBytes = 0;
    state.pendingMessages = 0;
  }

  private isSessionFileForAgent(sessionFile: string): boolean {
    if (!sessionFile) {
      return false;
    }
    const sessionsDir = resolveSessionTranscriptsDirForAgent(this.agentId);
    const resolvedFile = path.resolve(sessionFile);
    const resolvedDir = path.resolve(sessionsDir);
    return resolvedFile.startsWith(`${resolvedDir}${path.sep}`);
  }

  // ============ Source Filter ============

  private buildSourceFilter(alias?: string): {
    sql: string;
    params: MemorySource[];
  } {
    const sources = Array.from(this.sources);
    if (sources.length === 0) {
      return { sql: "", params: [] };
    }
    const column = alias ? `${alias}.source` : "source";
    const placeholders = sources.map(() => "?").join(", ");
    return { sql: ` AND ${column} IN (${placeholders})`, params: sources };
  }

  // ============ Search Internals ============

  private async searchVectorInternal(
    queryVec: number[],
    limit: number
  ): Promise<Array<MemorySearchResult & { id: string }>> {
    const results = await searchVector({
      db: this.db,
      vectorTable: VECTOR_TABLE,
      providerModel: this.provider.model,
      queryVec,
      limit,
      snippetMaxChars: SNIPPET_MAX_CHARS,
      ensureVectorReady: async (dimensions) => this.ensureVectorReady(dimensions),
      sourceFilterVec: this.buildSourceFilter("c"),
      sourceFilterChunks: this.buildSourceFilter(),
    });
    return results.map((entry) => entry as MemorySearchResult & { id: string });
  }

  private buildFtsQueryInternal(raw: string): string | null {
    return buildFtsQuery(raw);
  }

  private async searchKeywordInternal(
    query: string,
    limit: number
  ): Promise<Array<MemorySearchResult & { id: string; textScore: number }>> {
    if (!this.fts.enabled || !this.fts.available) {
      return [];
    }
    const sourceFilter = this.buildSourceFilter();
    const results = await searchKeyword({
      db: this.db,
      ftsTable: FTS_TABLE,
      providerModel: this.provider.model,
      query,
      limit,
      snippetMaxChars: SNIPPET_MAX_CHARS,
      sourceFilter,
      buildFtsQuery: (raw) => this.buildFtsQueryInternal(raw),
      bm25RankToScore,
    });
    return results.map((entry) => entry as MemorySearchResult & { id: string; textScore: number });
  }

  private mergeHybridResultsInternal(params: {
    vector: Array<MemorySearchResult & { id: string }>;
    keyword: Array<MemorySearchResult & { id: string; textScore: number }>;
    vectorWeight: number;
    textWeight: number;
  }): MemorySearchResult[] {
    const merged = mergeHybridResults({
      vector: params.vector.map((r) => ({
        id: r.id,
        path: r.path,
        startLine: r.startLine,
        endLine: r.endLine,
        source: r.source,
        snippet: r.snippet,
        vectorScore: r.score,
      })),
      keyword: params.keyword.map((r) => ({
        id: r.id,
        path: r.path,
        startLine: r.startLine,
        endLine: r.endLine,
        source: r.source,
        snippet: r.snippet,
        textScore: r.textScore,
      })),
      vectorWeight: params.vectorWeight,
      textWeight: params.textWeight,
    });
    return merged.map((entry) => entry as MemorySearchResult);
  }

  // ============ Sync Orchestration ============

  private createSyncProgress(
    onProgress: (update: MemorySyncProgressUpdate) => void
  ): MemorySyncProgressState {
    const state: MemorySyncProgressState = {
      completed: 0,
      total: 0,
      label: undefined,
      report: (update) => {
        if (update.label) {
          state.label = update.label;
        }
        const label =
          update.total > 0 && state.label
            ? `${state.label} ${update.completed}/${update.total}`
            : state.label;
        onProgress({
          completed: update.completed,
          total: update.total,
          label,
        });
      },
    };
    return state;
  }

  private needsFullReindex(
    meta: ReturnType<typeof this.readMeta>,
    vectorReady: boolean,
    force?: boolean
  ): boolean {
    return !!(
      force ||
      !meta ||
      meta.model !== this.provider.model ||
      meta.provider !== this.provider.id ||
      meta.providerKey !== this.providerKey ||
      meta.chunkTokens !== this.settings.chunking.tokens ||
      meta.chunkOverlap !== this.settings.chunking.overlap ||
      (vectorReady && !meta?.vectorDims)
    );
  }

  private async runSync(params?: {
    reason?: string;
    force?: boolean;
    progress?: (update: MemorySyncProgressUpdate) => void;
  }): Promise<void> {
    const progress = params?.progress ? this.createSyncProgress(params.progress) : undefined;

    if (progress) {
      progress.report({
        completed: progress.completed,
        total: progress.total,
        label: "Loading vector extension...",
      });
    }

    const vectorReady = await this.ensureVectorReady();
    const meta = this.readMeta();
    const fullReindex = this.needsFullReindex(meta, vectorReady, params?.force);

    if (fullReindex) {
      await this.runSafeReindex({
        reason: params?.reason,
        force: params?.force,
        progress: progress ?? undefined,
      });
      return;
    }

    if (this.sources.has("memory") && (params?.force || this.dirty)) {
      await this.syncMemoryFiles({ needsFullReindex: false, progress: progress ?? undefined });
      this.dirty = false;
    }

    if (this.shouldSyncSessions(params, false)) {
      await this.syncSessionFiles({ needsFullReindex: false, progress: progress ?? undefined });
      this.sessionsDirty = false;
      this.sessionsDirtyFiles.clear();
    } else {
      this.sessionsDirty = this.sessionsDirtyFiles.size > 0;
    }
  }

  private shouldSyncSessions(
    params?: { reason?: string; force?: boolean },
    needsFullReindex = false
  ): boolean {
    if (!this.sources.has("sessions")) {
      return false;
    }
    if (params?.force) {
      return true;
    }
    const reason = params?.reason;
    if (reason === "session-start" || reason === "watch") {
      return false;
    }
    if (needsFullReindex) {
      return true;
    }
    return this.sessionsDirty && this.sessionsDirtyFiles.size > 0;
  }

  private reportProgress(progress: MemorySyncProgressState | undefined, label?: string): void {
    if (progress) {
      progress.completed += 1;
      progress.report({
        completed: progress.completed,
        total: progress.total,
        ...(label ? { label } : {}),
      });
    }
  }

  private cleanupStaleFiles(activePaths: Set<string>, source: string): void {
    const staleRows = this.db
      .prepare(`SELECT path FROM files WHERE source = ?`)
      .all(source) as Array<{ path: string }>;
    for (const stale of staleRows) {
      if (activePaths.has(stale.path)) continue;
      this.db.prepare(`DELETE FROM files WHERE path = ? AND source = ?`).run(stale.path, source);
      try {
        this.db
          .prepare(
            `DELETE FROM ${VECTOR_TABLE} WHERE id IN (SELECT id FROM chunks WHERE path = ? AND source = ?)`
          )
          .run(stale.path, source);
      } catch {
        /* ignore */
      }
      this.db.prepare(`DELETE FROM chunks WHERE path = ? AND source = ?`).run(stale.path, source);
      if (this.fts.enabled && this.fts.available) {
        try {
          this.db
            .prepare(`DELETE FROM ${FTS_TABLE} WHERE path = ? AND source = ? AND model = ?`)
            .run(stale.path, source, this.provider.model);
        } catch {
          /* ignore */
        }
      }
    }
  }

  // ============ Sync: Memory Files ============

  private async syncMemoryFiles(params: {
    needsFullReindex: boolean;
    progress?: MemorySyncProgressState;
  }): Promise<void> {
    const files = await listMemoryFiles(this.workspaceDir, this.settings.extraPaths);
    const fileEntries = await Promise.all(
      files.map(async (file) => buildFileEntry(file, this.workspaceDir))
    );
    log.debug("memory sync: indexing memory files", {
      files: fileEntries.length,
      needsFullReindex: params.needsFullReindex,
      concurrency: EMBEDDING_INDEX_CONCURRENCY,
    });
    const activePaths = new Set(fileEntries.map((entry) => entry.path));
    if (params.progress) {
      params.progress.total += fileEntries.length;
      params.progress.report({
        completed: params.progress.completed,
        total: params.progress.total,
        label: "Indexing memory files...",
      });
    }

    const tasks = fileEntries.map((entry) => async () => {
      const record = this.db
        .prepare(`SELECT hash FROM files WHERE path = ? AND source = ?`)
        .get(entry.path, "memory") as { hash: string } | undefined;
      if (!params.needsFullReindex && record?.hash === entry.hash) {
        if (params.progress) {
          params.progress.completed += 1;
          params.progress.report({
            completed: params.progress.completed,
            total: params.progress.total,
          });
        }
        return;
      }
      await this.indexFile(entry, { source: "memory" });
      if (params.progress) {
        params.progress.completed += 1;
        params.progress.report({
          completed: params.progress.completed,
          total: params.progress.total,
        });
      }
    });
    await runWithConcurrency(tasks, EMBEDDING_INDEX_CONCURRENCY);

    // Clean up stale memory files
    const staleRows = this.db
      .prepare(`SELECT path FROM files WHERE source = ?`)
      .all("memory") as Array<{ path: string }>;
    for (const stale of staleRows) {
      if (activePaths.has(stale.path)) {
        continue;
      }
      this.db.prepare(`DELETE FROM files WHERE path = ? AND source = ?`).run(stale.path, "memory");
      try {
        this.db
          .prepare(
            `DELETE FROM ${VECTOR_TABLE} WHERE id IN (SELECT id FROM chunks WHERE path = ? AND source = ?)`
          )
          .run(stale.path, "memory");
      } catch {
        // ignore
      }
      this.db.prepare(`DELETE FROM chunks WHERE path = ? AND source = ?`).run(stale.path, "memory");
      if (this.fts.enabled && this.fts.available) {
        try {
          this.db
            .prepare(`DELETE FROM ${FTS_TABLE} WHERE path = ? AND source = ? AND model = ?`)
            .run(stale.path, "memory", this.provider.model);
        } catch {
          // ignore
        }
      }
    }
  }

  // ============ Sync: Session Files ============

  private async syncSessionFiles(params: {
    needsFullReindex: boolean;
    progress?: MemorySyncProgressState;
  }): Promise<void> {
    const files = await listSessionFilesForAgent(this.agentId);
    const activePaths = new Set(files.map((file) => sessionPathForFile(file)));
    const indexAll = params.needsFullReindex || this.sessionsDirtyFiles.size === 0;

    log.debug("memory sync: indexing session files", {
      files: files.length,
      indexAll,
      dirtyFiles: this.sessionsDirtyFiles.size,
      concurrency: EMBEDDING_INDEX_CONCURRENCY,
    });

    if (params.progress) {
      params.progress.total += files.length;
      params.progress.report({
        completed: params.progress.completed,
        total: params.progress.total,
        label: "Indexing session files...",
      });
    }

    const tasks = files.map((absPath) => async () => {
      if (!indexAll && !this.sessionsDirtyFiles.has(absPath)) {
        this.reportProgress(params.progress);
        return;
      }
      const entry = await buildSessionEntry(absPath);
      if (!entry) {
        this.reportProgress(params.progress);
        return;
      }
      const record = this.db
        .prepare(`SELECT hash FROM files WHERE path = ? AND source = ?`)
        .get(entry.path, "sessions") as { hash: string } | undefined;
      if (!params.needsFullReindex && record?.hash === entry.hash) {
        this.reportProgress(params.progress);
        this.resetSessionDelta(absPath, entry.size);
        return;
      }
      await this.indexFile(entry, { source: "sessions", content: entry.content });
      this.resetSessionDelta(absPath, entry.size);
      this.reportProgress(params.progress);
    });
    await runWithConcurrency(tasks, EMBEDDING_INDEX_CONCURRENCY);

    this.cleanupStaleFiles(activePaths, "sessions");
  }

  // ============ File Indexing ============

  private cleanExistingPathEntries(
    entryPath: string,
    source: MemorySource,
    vectorReady: boolean
  ): void {
    if (vectorReady) {
      try {
        this.db
          .prepare(
            `DELETE FROM ${VECTOR_TABLE} WHERE id IN (SELECT id FROM chunks WHERE path = ? AND source = ?)`
          )
          .run(entryPath, source);
      } catch {
        /* ignore */
      }
    }
    if (this.fts.enabled && this.fts.available) {
      try {
        this.db
          .prepare(`DELETE FROM ${FTS_TABLE} WHERE path = ? AND source = ? AND model = ?`)
          .run(entryPath, source, this.provider.model);
      } catch {
        /* ignore */
      }
    }
    this.db.prepare(`DELETE FROM chunks WHERE path = ? AND source = ?`).run(entryPath, source);
  }

  private insertChunkRecord(
    chunk: MemoryChunk,
    embedding: number[],
    entryPath: string,
    source: MemorySource,
    vectorReady: boolean,
    now: number
  ): void {
    const id = hashText(
      `${source}:${entryPath}:${chunk.startLine}:${chunk.endLine}:${chunk.hash}:${this.provider.model}`
    );
    this.db
      .prepare(
        `INSERT INTO chunks (id, path, source, start_line, end_line, hash, model, text, embedding, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           hash=excluded.hash, model=excluded.model, text=excluded.text,
           embedding=excluded.embedding, updated_at=excluded.updated_at`
      )
      .run(
        id,
        entryPath,
        source,
        chunk.startLine,
        chunk.endLine,
        chunk.hash,
        this.provider.model,
        chunk.text,
        JSON.stringify(embedding),
        now
      );

    if (vectorReady && embedding.length > 0) {
      try {
        this.db.prepare(`DELETE FROM ${VECTOR_TABLE} WHERE id = ?`).run(id);
      } catch {
        /* ignore */
      }
      this.db
        .prepare(`INSERT INTO ${VECTOR_TABLE} (id, embedding) VALUES (?, ?)`)
        .run(id, vectorToBlob(embedding));
    }
    if (this.fts.enabled && this.fts.available) {
      this.db
        .prepare(
          `INSERT INTO ${FTS_TABLE} (text, id, path, source, model, start_line, end_line) VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          chunk.text,
          id,
          entryPath,
          source,
          this.provider.model,
          chunk.startLine,
          chunk.endLine
        );
    }
  }

  private async indexFile(
    entry: MemoryFileEntry | SessionFileEntry,
    options: { source: MemorySource; content?: string }
  ): Promise<void> {
    const content = options.content ?? (await fs.readFile(entry.absPath, "utf-8"));
    const chunks = enforceEmbeddingMaxInputTokens(
      this.provider,
      chunkMarkdown(content, this.settings.chunking).filter((chunk) => chunk.text.trim().length > 0)
    );
    if (options.source === "sessions" && "lineMap" in entry) {
      remapChunkLines(chunks, entry.lineMap);
    }
    const embeddings = await this.embedChunksInBatches(chunks);
    const sample = embeddings.find((embedding) => embedding.length > 0);
    const vectorReady = sample ? await this.ensureVectorReady(sample.length) : false;
    const now = Date.now();

    this.cleanExistingPathEntries(entry.path, options.source, vectorReady);

    for (let i = 0; i < chunks.length; i++) {
      this.insertChunkRecord(
        chunks[i]!,
        embeddings[i] ?? [],
        entry.path,
        options.source,
        vectorReady,
        now
      );
    }

    // Update file record
    this.db
      .prepare(
        `INSERT INTO files (path, source, hash, mtime, size) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(path) DO UPDATE SET
           source=excluded.source, hash=excluded.hash, mtime=excluded.mtime, size=excluded.size`
      )
      .run(entry.path, options.source, entry.hash, entry.mtimeMs, entry.size);
  }

  // ============ Embedding: Batches with Cache + Retry ============

  private buildEmbeddingBatches(chunks: MemoryChunk[]): MemoryChunk[][] {
    const batches: MemoryChunk[][] = [];
    let current: MemoryChunk[] = [];
    let currentTokens = 0;

    for (const chunk of chunks) {
      const estimate = estimateUtf8Bytes(chunk.text);
      const wouldExceed =
        current.length > 0 && currentTokens + estimate > EMBEDDING_BATCH_MAX_TOKENS;
      if (wouldExceed) {
        batches.push(current);
        current = [];
        currentTokens = 0;
      }
      if (current.length === 0 && estimate > EMBEDDING_BATCH_MAX_TOKENS) {
        batches.push([chunk]);
        continue;
      }
      current.push(chunk);
      currentTokens += estimate;
    }

    if (current.length > 0) {
      batches.push(current);
    }
    return batches;
  }

  private async embedChunksInBatches(chunks: MemoryChunk[]): Promise<number[][]> {
    if (chunks.length === 0) {
      return [];
    }
    const cached = this.loadEmbeddingCache(chunks.map((chunk) => chunk.hash));
    const embeddings: number[][] = Array.from({ length: chunks.length }, () => []);
    const missing: Array<{ index: number; chunk: MemoryChunk }> = [];

    for (let i = 0; i < chunks.length; i += 1) {
      const chunk = chunks[i];
      const hit = chunk?.hash ? cached.get(chunk.hash) : undefined;
      if (hit && hit.length > 0) {
        embeddings[i] = hit;
      } else if (chunk) {
        missing.push({ index: i, chunk });
      }
    }

    if (missing.length === 0) {
      return embeddings;
    }

    const missingChunks = missing.map((m) => m.chunk);
    const batches = this.buildEmbeddingBatches(missingChunks);
    const toCache: Array<{ hash: string; embedding: number[] }> = [];

    let cursor = 0;
    for (const batch of batches) {
      const batchEmbeddings = await this.embedBatchWithRetry(batch.map((chunk) => chunk.text));
      for (let i = 0; i < batch.length; i += 1) {
        const item = missing[cursor + i];
        const embedding = batchEmbeddings[i] ?? [];
        if (item) {
          embeddings[item.index] = embedding;
          toCache.push({ hash: item.chunk.hash, embedding });
        }
      }
      cursor += batch.length;
    }
    this.upsertEmbeddingCache(toCache);
    return embeddings;
  }

  private async embedBatchWithRetry(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }
    let attempt = 0;
    let delayMs = EMBEDDING_RETRY_BASE_DELAY_MS;
    while (true) {
      try {
        log.debug("memory embeddings: batch start", {
          provider: this.provider.id,
          items: texts.length,
          timeoutMs: EMBEDDING_BATCH_TIMEOUT_MS,
        });
        return await this.withTimeout(
          this.provider.embedBatch(texts),
          EMBEDDING_BATCH_TIMEOUT_MS,
          `memory embeddings batch timed out after ${Math.round(EMBEDDING_BATCH_TIMEOUT_MS / 1000)}s`
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!this.isRetryableEmbeddingError(message) || attempt >= EMBEDDING_RETRY_MAX_ATTEMPTS) {
          throw err;
        }
        const waitMs = Math.min(
          EMBEDDING_RETRY_MAX_DELAY_MS,
          // eslint-disable-next-line no-restricted-syntax
          Math.round(delayMs * (1 + Math.random() * 0.2))
        );
        log.warn(`memory embeddings rate limited; retrying in ${waitMs}ms`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        delayMs *= 2;
        attempt += 1;
      }
    }
  }

  private isRetryableEmbeddingError(message: string): boolean {
    return /(rate[_ ]limit|too many requests|429|resource has been exhausted|5\d\d|cloudflare)/i.test(
      message
    );
  }

  private async embedQueryWithTimeout(text: string): Promise<number[]> {
    log.debug("memory embeddings: query start", {
      provider: this.provider.id,
      timeoutMs: EMBEDDING_QUERY_TIMEOUT_MS,
    });
    return this.withTimeout(
      this.provider.embedQuery(text),
      EMBEDDING_QUERY_TIMEOUT_MS,
      `memory embeddings query timed out after ${Math.round(EMBEDDING_QUERY_TIMEOUT_MS / 1000)}s`
    );
  }

  // ============ Embedding Cache ============

  private loadEmbeddingCache(hashes: string[]): Map<string, number[]> {
    if (!this.cache.enabled) {
      return new Map();
    }
    if (hashes.length === 0) {
      return new Map();
    }
    const unique: string[] = [];
    const seen = new Set<string>();
    for (const hash of hashes) {
      if (!hash) {
        continue;
      }
      if (seen.has(hash)) {
        continue;
      }
      seen.add(hash);
      unique.push(hash);
    }
    if (unique.length === 0) {
      return new Map();
    }

    const out = new Map<string, number[]>();
    const baseParams = [this.provider.id, this.provider.model, this.providerKey];
    const batchSize = 400;
    for (let start = 0; start < unique.length; start += batchSize) {
      const batch = unique.slice(start, start + batchSize);
      const placeholders = batch.map(() => "?").join(", ");
      const rows = this.db
        .prepare(
          `SELECT hash, embedding FROM ${EMBEDDING_CACHE_TABLE}` +
            ` WHERE provider = ? AND model = ? AND provider_key = ? AND hash IN (${placeholders})`
        )
        .all(...baseParams, ...batch) as Array<{
        hash: string;
        embedding: string;
      }>;
      for (const row of rows) {
        out.set(row.hash, parseEmbedding(row.embedding));
      }
    }
    return out;
  }

  private upsertEmbeddingCache(entries: Array<{ hash: string; embedding: number[] }>): void {
    if (!this.cache.enabled) {
      return;
    }
    if (entries.length === 0) {
      return;
    }
    const now = Date.now();
    const stmt = this.db.prepare(
      `INSERT INTO ${EMBEDDING_CACHE_TABLE} (provider, model, provider_key, hash, embedding, dims, updated_at)` +
        ` VALUES (?, ?, ?, ?, ?, ?, ?)` +
        ` ON CONFLICT(provider, model, provider_key, hash) DO UPDATE SET` +
        `   embedding=excluded.embedding,` +
        `   dims=excluded.dims,` +
        `   updated_at=excluded.updated_at`
    );
    for (const entry of entries) {
      const embedding = entry.embedding ?? [];
      stmt.run(
        this.provider.id,
        this.provider.model,
        this.providerKey,
        entry.hash,
        JSON.stringify(embedding),
        embedding.length,
        now
      );
    }
  }

  private pruneEmbeddingCacheIfNeeded(): void {
    if (!this.cache.enabled) {
      return;
    }
    const max = this.cache.maxEntries;
    if (!max || max <= 0) {
      return;
    }
    const row = this.db.prepare(`SELECT COUNT(*) as c FROM ${EMBEDDING_CACHE_TABLE}`).get() as
      | { c: number }
      | undefined;
    const count = row?.c ?? 0;
    if (count <= max) {
      return;
    }
    const excess = count - max;
    this.db
      .prepare(
        `DELETE FROM ${EMBEDDING_CACHE_TABLE}` +
          ` WHERE rowid IN (` +
          `   SELECT rowid FROM ${EMBEDDING_CACHE_TABLE}` +
          `   ORDER BY updated_at ASC` +
          `   LIMIT ?` +
          ` )`
      )
      .run(excess);
  }

  // ============ Provider Key ============

  private computeProviderKey(): string {
    if (this.provider.id === "openai" && this.openAi) {
      const entries = Object.entries(this.openAi.headers)
        .filter(([key]: [string, string]) => key.toLowerCase() !== "authorization")
        .sort(([a]: [string, string], [b]: [string, string]) => a.localeCompare(b))
        .map(([key, value]: [string, string]) => [key, value]);
      return hashText(
        JSON.stringify({
          provider: "openai",
          baseUrl: this.openAi.baseUrl,
          model: this.openAi.model,
          headers: entries,
        })
      );
    }
    return hashText(
      JSON.stringify({
        provider: this.provider.id,
        model: this.provider.model,
      })
    );
  }

  // ============ Atomic Reindex ============

  private seedEmbeddingCache(sourceDb: Database): void {
    if (!this.cache.enabled) {
      return;
    }
    try {
      const rows = sourceDb
        .prepare(
          `SELECT provider, model, provider_key, hash, embedding, dims, updated_at FROM ${EMBEDDING_CACHE_TABLE}`
        )
        .all() as Array<{
        provider: string;
        model: string;
        provider_key: string;
        hash: string;
        embedding: string;
        dims: number | null;
        updated_at: number;
      }>;
      if (!rows.length) {
        return;
      }
      const insert = this.db.prepare(
        `INSERT INTO ${EMBEDDING_CACHE_TABLE} (provider, model, provider_key, hash, embedding, dims, updated_at)` +
          ` VALUES (?, ?, ?, ?, ?, ?, ?)` +
          ` ON CONFLICT(provider, model, provider_key, hash) DO UPDATE SET` +
          `   embedding=excluded.embedding,` +
          `   dims=excluded.dims,` +
          `   updated_at=excluded.updated_at`
      );
      this.db.run("BEGIN");
      for (const row of rows) {
        insert.run(
          row.provider,
          row.model,
          row.provider_key,
          row.hash,
          row.embedding,
          row.dims,
          row.updated_at
        );
      }
      this.db.run("COMMIT");
    } catch (err) {
      try {
        this.db.run("ROLLBACK");
      } catch {
        // ignore
      }
      throw err;
    }
  }

  private async swapIndexFiles(targetPath: string, tempPath: string): Promise<void> {
    const backupPath = `${targetPath}.backup-${randomUUID()}`;
    await this.moveIndexFiles(targetPath, backupPath);
    try {
      await this.moveIndexFiles(tempPath, targetPath);
    } catch (err) {
      await this.moveIndexFiles(backupPath, targetPath);
      throw err;
    }
    await this.removeIndexFiles(backupPath);
  }

  private async moveIndexFiles(sourceBase: string, targetBase: string): Promise<void> {
    const suffixes = ["", "-wal", "-shm"];
    for (const suffix of suffixes) {
      const source = `${sourceBase}${suffix}`;
      const target = `${targetBase}${suffix}`;
      try {
        await fs.rename(source, target);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
          throw err;
        }
      }
    }
  }

  private async removeIndexFiles(basePath: string): Promise<void> {
    const suffixes = ["", "-wal", "-shm"];
    await Promise.all(suffixes.map((suffix) => fs.rm(`${basePath}${suffix}`, { force: true })));
  }

  private async runSafeReindex(params: {
    reason?: string;
    force?: boolean;
    progress?: MemorySyncProgressState;
  }): Promise<void> {
    // 直接在原数据库上进行重索引，避免 Windows 文件锁定问题
    log.debug("memory reindex: performing in-place reindex (Windows compatible)");

    try {
      // 1. 清空现有数据 - 先检查表是否存在再删除
      try {
        this.db.prepare(`DELETE FROM ${VECTOR_TABLE}`).run();
      } catch (err) {
        log.debug(`Table ${VECTOR_TABLE} does not exist, skipping delete`);
      }
      try {
        this.db.prepare(`DELETE FROM ${FTS_TABLE}`).run();
      } catch (err) {
        log.debug(`Table ${FTS_TABLE} does not exist, skipping delete`);
      }
      try {
        this.db.prepare(`DELETE FROM chunks`).run();
      } catch (err) {
        log.debug(`Table chunks does not exist, skipping delete`);
      }
      try {
        this.db.prepare(`DELETE FROM files`).run();
      } catch (err) {
        log.debug(`Table files does not exist, skipping delete`);
      }

      log.debug("memory reindex: cleared existing data");

      // 2. 重新创建 schema（可选，为了确保一致性）
      this.ensureSchema();

      log.debug("memory reindex: ensured schema");

      const shouldSyncMemory = this.sources.has("memory");
      const shouldSyncSessions = this.shouldSyncSessions(
        { reason: params.reason, force: params.force },
        true
      );

      log.debug("memory reindex: sync flags", { shouldSyncMemory, shouldSyncSessions });

      if (shouldSyncMemory) {
        log.debug("memory reindex: calling syncMemoryFiles");

        await this.syncMemoryFiles({
          needsFullReindex: true,
          progress: params.progress,
        });

        log.debug("memory reindex: syncMemoryFiles completed");
        this.dirty = false;
      }

      if (shouldSyncSessions) {
        log.debug("memory reindex: calling syncSessionFiles");
        await this.syncSessionFiles({
          needsFullReindex: true,
          progress: params.progress,
        });
        this.sessionsDirty = false;
        this.sessionsDirtyFiles.clear();
      } else if (this.sessionsDirtyFiles.size > 0) {
        this.sessionsDirty = true;
      } else {
        this.sessionsDirty = false;
      }

      const nextMeta: MemoryIndexMeta = {
        model: this.provider.model,
        provider: this.provider.id,
        providerKey: this.providerKey,
        chunkTokens: this.settings.chunking.tokens,
        chunkOverlap: this.settings.chunking.overlap,
      };
      if (this.vector.available && this.vector.dims) {
        nextMeta.vectorDims = this.vector.dims;
      }

      this.writeMeta(nextMeta);
      this.pruneEmbeddingCacheIfNeeded();

      const afterChunksCount = (
        this.db.prepare(`SELECT COUNT(*) as c FROM chunks`).get() as { c: number }
      ).c;
      log.debug("memory reindex: in-place reindex completed", {
        afterChunksCount,
      });
    } catch (err: unknown) {
      log.warn("memory reindex failed", {
        error: err,
        stack: err instanceof Error ? err.stack : undefined,
      });
    }
  }

  // ============ Meta ============

  private readMeta(): MemoryIndexMeta | null {
    const row = this.db.prepare(`SELECT value FROM meta WHERE key = ?`).get(META_KEY) as
      | { value: string }
      | undefined;
    if (!row?.value) {
      return null;
    }
    try {
      return JSON.parse(row.value) as MemoryIndexMeta;
    } catch {
      return null;
    }
  }

  private writeMeta(meta: MemoryIndexMeta): void {
    const value = JSON.stringify(meta);
    this.db
      .prepare(
        `INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`
      )
      .run(META_KEY, value);
  }

  // ============ Reset ============

  private resetIndex(): void {
    this.db.run(`DELETE FROM files`);
    this.db.run(`DELETE FROM chunks`);
    if (this.fts.enabled && this.fts.available) {
      try {
        this.db.run(`DELETE FROM ${FTS_TABLE}`);
      } catch {
        // ignore
      }
    }
    this.dropVectorTable();
    this.vector.dims = undefined;
    this.sessionsDirtyFiles.clear();
  }

  // ============ Timeout Helper ============

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    message: string
  ): Promise<T> {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      return promise;
    }
    let timer: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    });
    try {
      return (await Promise.race([promise, timeoutPromise])) as T;
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }
}
