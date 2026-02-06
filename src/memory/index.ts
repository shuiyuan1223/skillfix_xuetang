/**
 * Memory Module
 *
 * Two subsystems:
 * 1. Agent Memory (db.ts) - Traces, evaluations, test cases, suggestions
 * 2. User Memory (memory-manager.ts) - User profiles, health memory, conversation history
 */

// Agent memory (traces, evaluations, etc.)
export * from "./db.js";

// User memory (profiles, health records, conversation history)
export * from "./types.js";
export * from "./memory-manager.js";
export * from "./user-store.js";
export * from "./soul.js";
export * from "./profile.js";
export * from "./info-collector.js";

// Vector search (sqlite-vec + OpenRouter embeddings)
export * from "./embeddings.js";
export * from "./vector-store.js";
export * from "./hybrid.js";

// Compaction flush (context window management)
export * from "./compaction.js";
