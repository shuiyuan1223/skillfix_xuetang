/**
 * Embedding Provider
 * Uses OpenRouter API for embeddings (OpenAI-compatible)
 *
 * Reads config from:
 * 1. Explicit EmbeddingConfig parameter
 * 2. PHAConfig (.pha/config.json) - uses llm.apiKey if provider is openrouter
 * 3. OPENROUTER_API_KEY environment variable
 */

import { loadConfig } from "../utils/config.js";

export interface EmbeddingConfig {
  /** OpenRouter API key */
  apiKey: string;
  /** Embedding model (default: openai/text-embedding-3-small) */
  model?: string;
  /** Base URL (default: https://openrouter.ai/api/v1) */
  baseUrl?: string;
}

const DEFAULT_MODEL = "openai/text-embedding-3-small";
const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

export class EmbeddingProvider {
  private apiKey: string;
  private model: string;
  private baseUrl: string;

  constructor(config: EmbeddingConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model || DEFAULT_MODEL;
    this.baseUrl = config.baseUrl || DEFAULT_BASE_URL;
  }

  /**
   * Get embedding for a single text
   */
  async embed(text: string): Promise<number[]> {
    const embeddings = await this.embedBatch([text]);
    return embeddings[0];
  }

  /**
   * Get embeddings for multiple texts
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        "HTTP-Referer": "https://github.com/anthropics/pha",
        "X-Title": "PHA Health Agent",
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Embedding API error: ${response.status} - ${error}`);
    }

    const data = (await response.json()) as {
      data: Array<{ embedding: number[]; index: number }>;
    };

    // Sort by index to ensure correct order
    const sorted = data.data.sort((a, b) => a.index - b.index);
    return sorted.map((item) => item.embedding);
  }

  /**
   * Get the embedding dimension for the current model
   */
  getDimension(): number {
    // text-embedding-3-small: 1536
    // text-embedding-ada-002: 1536
    // text-embedding-3-large: 3072
    if (this.model.includes("3-large")) return 3072;
    return 1536;
  }
}

// Singleton instance
let embeddingProvider: EmbeddingProvider | null = null;

/**
 * Get API key from config or environment
 */
function getApiKeyFromConfig(): string | undefined {
  // First check environment
  if (process.env.OPENROUTER_API_KEY) {
    return process.env.OPENROUTER_API_KEY;
  }

  // Then check PHAConfig
  try {
    const phaConfig = loadConfig();
    if (phaConfig.llm.provider === "openrouter" && phaConfig.llm.apiKey) {
      return phaConfig.llm.apiKey;
    }
  } catch {
    // Config not available, continue
  }

  return undefined;
}

/**
 * Get embedding model from config
 */
function getModelFromConfig(): string | undefined {
  try {
    const phaConfig = loadConfig();
    return phaConfig.embedding?.model;
  } catch {
    return undefined;
  }
}

/**
 * Check if embedding is enabled in config
 */
export function isEmbeddingEnabled(): boolean {
  try {
    const phaConfig = loadConfig();
    // Enabled by default if not explicitly disabled
    return phaConfig.embedding?.enabled !== false;
  } catch {
    return true;
  }
}

/**
 * Get or create embedding provider
 */
export function getEmbeddingProvider(config?: EmbeddingConfig): EmbeddingProvider {
  if (!embeddingProvider) {
    const apiKey = config?.apiKey || getApiKeyFromConfig();
    if (!apiKey) {
      throw new Error(
        "OpenRouter API key is required for embeddings. Configure via 'pha onboard' or set OPENROUTER_API_KEY"
      );
    }
    const model = config?.model || getModelFromConfig();
    embeddingProvider = new EmbeddingProvider({
      apiKey,
      model,
      baseUrl: config?.baseUrl,
    });
  }
  return embeddingProvider;
}
