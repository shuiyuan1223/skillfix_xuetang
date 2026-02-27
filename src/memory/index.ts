/**
 * Memory Module
 *
 * Two subsystems:
 * 1. Agent Memory (db.ts) - Traces, evaluations, test cases, suggestions
 * 2. User Memory (memory-manager.ts) - User profiles, health memory, conversation history
 *    Powered by OpenClaw's MemoryIndexManager for search/indexing.
 */

// Agent memory (traces, evaluations, etc.)
export * from "./db.js";

// User memory (profiles, health records, conversation history)
export type * from "./types.js";
export * from "./memory-manager.js";
export * from "./soul.js";
export * from "./profile.js";
export * from "./info-collector.js";

// OpenClaw memory index engine
export { MemoryIndexManager } from "./memory-index.js";
export type {
  MemorySource,
  MemorySearchResult as IndexSearchResult,
  MemorySyncProgressUpdate,
  MemoryProviderStatus,
  PHAMemorySearchConfig,
} from "./memory-index.js";

// Embedding provider
export * from "./embeddings.js";

// Hybrid search
export { buildFtsQuery, bm25RankToScore, mergeHybridResults } from "./hybrid.js";
export type { HybridConfig, HybridVectorResult, HybridKeywordResult } from "./hybrid.js";
export { DEFAULT_HYBRID_CONFIG } from "./hybrid.js";

// Compat (session events for server.ts)
export { emitSessionTranscriptUpdate } from "./compat.js";

// Compaction flush (context window management)
export * from "./compaction.js";
