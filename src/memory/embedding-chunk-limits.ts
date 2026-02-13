/**
 * Embedding Chunk Limits (from OpenClaw)
 *
 * Enforce embedding model input token limits by splitting oversized chunks.
 */

import type { EmbeddingProvider } from "./embeddings.js";
import { estimateUtf8Bytes, splitTextToUtf8ByteLimit } from "./embedding-input-limits.js";
import { hashText, type MemoryChunk } from "./internal.js";

const DEFAULT_EMBEDDING_MAX_INPUT_TOKENS = 8192;

const KNOWN_EMBEDDING_MAX_INPUT_TOKENS: Record<string, number> = {
  "openai:text-embedding-3-small": 8192,
  "openai:text-embedding-3-large": 8192,
  "openai:text-embedding-ada-002": 8191,
};

function resolveEmbeddingMaxInputTokens(provider: EmbeddingProvider): number {
  if (typeof provider.maxInputTokens === "number") {
    return provider.maxInputTokens;
  }
  const key = `${provider.id}:${provider.model}`.toLowerCase();
  const known = KNOWN_EMBEDDING_MAX_INPUT_TOKENS[key];
  if (typeof known === "number") {
    return known;
  }
  return DEFAULT_EMBEDDING_MAX_INPUT_TOKENS;
}

export function enforceEmbeddingMaxInputTokens(
  provider: EmbeddingProvider,
  chunks: MemoryChunk[]
): MemoryChunk[] {
  const maxInputTokens = resolveEmbeddingMaxInputTokens(provider);
  const out: MemoryChunk[] = [];

  for (const chunk of chunks) {
    if (estimateUtf8Bytes(chunk.text) <= maxInputTokens) {
      out.push(chunk);
      continue;
    }

    for (const text of splitTextToUtf8ByteLimit(chunk.text, maxInputTokens)) {
      out.push({
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        text,
        hash: hashText(text),
      });
    }
  }

  return out;
}
