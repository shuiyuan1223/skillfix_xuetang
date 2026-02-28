/**
 * Embedding Provider (from OpenClaw, simplified for PHA)
 *
 * PHA only uses OpenAI-compatible embeddings (via OpenRouter).
 * No local/Gemini/Voyage support needed.
 */

import { loadConfig, resolveEmbeddingModel as resolveEmbeddingModelFromConfig } from '../utils/config.js';
import { formatErrorMessage } from './compat.js';
import { createOpenAiEmbeddingProvider, type OpenAiEmbeddingClient } from './embeddings-openai.js';

export type { OpenAiEmbeddingClient } from './embeddings-openai.js';

export type EmbeddingProvider = {
  id: string;
  model: string;
  maxInputTokens?: number;
  embedQuery: (text: string) => Promise<number[]>;
  embedBatch: (texts: string[]) => Promise<number[][]>;
};

export type EmbeddingProviderResult = {
  provider: EmbeddingProvider;
  requestedProvider: 'openai' | 'auto';
  fallbackFrom?: string;
  fallbackReason?: string;
  openAi?: OpenAiEmbeddingClient;
};

export type EmbeddingProviderOptions = {
  config?: unknown;
  agentDir?: string;
  provider: string;
  remote?: {
    baseUrl?: string;
    apiKey?: string;
    headers?: Record<string, string>;
  };
  model: string;
  fallback: string;
  local?: unknown;
  /** PHA-specific: direct API key */
  apiKey?: string;
};

/** PHA-specific: legacy config interface for backward compatibility */
export interface EmbeddingConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

/**
 * Create a noop embedding provider for BM25-only fallback.
 * Returns zero vectors so the indexing pipeline still works,
 * but vector search will be effectively skipped.
 */
export function createNoopEmbeddingProvider(): EmbeddingProviderResult {
  const provider: EmbeddingProvider = {
    id: 'noop',
    model: 'none',
    embedQuery: async () => [],
    embedBatch: async (texts) => texts.map(() => []),
  };
  return {
    provider,
    requestedProvider: 'auto',
    fallbackFrom: 'openai',
    fallbackReason: 'No API key available — using BM25-only search',
  };
}

/**
 * Create embedding provider (PHA simplified version).
 * Always uses OpenAI-compatible API (works with OpenRouter).
 */
export async function createEmbeddingProvider(options: EmbeddingProviderOptions): Promise<EmbeddingProviderResult> {
  try {
    const { provider, client } = await createOpenAiEmbeddingProvider(options);
    return {
      provider,
      requestedProvider: (options.provider as 'openai' | 'auto') || 'openai',
      openAi: client,
    };
  } catch (err) {
    throw new Error(formatErrorMessage(err), { cause: err });
  }
}

// ============ PHA Backward Compatibility ============

/**
 * Check if embedding is enabled in config
 */
export function isEmbeddingEnabled(): boolean {
  try {
    const phaConfig = loadConfig();
    return phaConfig.embedding?.enabled !== false;
  } catch {
    return true;
  }
}

/**
 * Get API key from PHA config or environment.
 * Now delegates to the unified resolveEmbeddingModel from config.ts.
 */
export function resolveEmbeddingApiKey(): string | undefined {
  try {
    const resolved = resolveEmbeddingModelFromConfig();
    if (resolved) {
      return resolved.apiKey;
    }
  } catch {
    // ignore
  }

  // Legacy fallback
  if (process.env.OPENROUTER_API_KEY) {
    return process.env.OPENROUTER_API_KEY;
  }
  if (process.env.OPENAI_API_KEY) {
    return process.env.OPENAI_API_KEY;
  }
  try {
    const phaConfig = loadConfig();
    if (phaConfig.llm.apiKey) {
      return phaConfig.llm.apiKey;
    }
  } catch {
    // ignore
  }
  return undefined;
}

/**
 * Get embedding model from PHA config
 */
export function resolveEmbeddingModel(): string {
  try {
    const resolved = resolveEmbeddingModelFromConfig();
    if (resolved) {
      return resolved.modelId;
    }
  } catch {
    // ignore
  }

  try {
    const phaConfig = loadConfig();
    return phaConfig.embedding?.model || 'text-embedding-3-small';
  } catch {
    return 'text-embedding-3-small';
  }
}

/**
 * Get embedding base URL from PHA config
 */
export function resolveEmbeddingBaseUrl(): string {
  try {
    const resolved = resolveEmbeddingModelFromConfig();
    if (resolved?.baseUrl) {
      return resolved.baseUrl;
    }
  } catch {
    // ignore
  }

  try {
    const phaConfig = loadConfig();
    if (phaConfig.llm.provider === 'openrouter' && phaConfig.llm.baseUrl) {
      return phaConfig.llm.baseUrl;
    }
  } catch {
    // ignore
  }
  return 'https://openrouter.ai/api/v1';
}
