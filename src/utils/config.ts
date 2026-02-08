/**
 * Config utilities
 *
 * All configuration and state stored in .pha/ directory:
 * - ./.pha/config.json - main config file
 * - ./.pha/huawei-tokens.json - OAuth tokens
 * - ./.pha/gateway.log - server logs
 *
 * Can be overridden via PHA_CONFIG_PATH environment variable.
 */

import * as fs from "fs";
import * as path from "path";

/** Fallback user UUID (used only if config has no userUuid) */
const FALLBACK_USER_UUID = "a755451c-938e-4cea-b7a6-b66b205949cf";

export type LLMProvider =
  | "anthropic"
  | "openai"
  | "google"
  | "openrouter"
  | "groq"
  | "mistral"
  | "xai";

export interface LLMConfig {
  provider: LLMProvider;
  modelId?: string;
  apiKey?: string;
  baseUrl?: string;
}

export interface BenchmarkModelConfig {
  provider: LLMProvider;
  modelId: string;
  apiKey?: string;
  baseUrl?: string;
  label?: string;
}

export interface HuaweiHealthKitConfig {
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  scopes?: string[];
  // 3 个核心 URL，都配置完整路径
  authUrl?: string; // 授权页面基础 URL（不含 query params）
  tokenUrl?: string; // Token 接口完整 URL
  apiBaseUrl?: string; // API 基础地址（后面会拼接具体接口路径）
}

export interface MCPConfig {
  // Chrome DevTools MCP configuration
  chromeMcp?: {
    command?: string; // MCP server command, default: "npx"
    args?: string[]; // Command arguments, default: ["-y", "chrome-devtools-mcp@latest", "--isolated"]
    browserUrl?: string; // Connect to existing browser: http://127.0.0.1:9222
    wsEndpoint?: string; // WebSocket endpoint for existing browser
  };
}

export interface EmbeddingConfig {
  /** Embedding model (default: openai/text-embedding-3-small) */
  model?: string;
  /** Whether embedding/vector search is enabled */
  enabled?: boolean;
}

export interface PHAConfig {
  /** User UUID for memory/profile isolation */
  userUuid?: string;
  gateway: {
    port: number;
    autoStart: boolean;
  };
  llm: LLMConfig;
  dataSources: {
    type: "mock" | "huawei" | "apple";
    huawei?: HuaweiHealthKitConfig;
  };
  tui: {
    theme: "dark" | "light";
    showToolCalls: boolean;
  };
  mcp?: MCPConfig;
  embedding?: EmbeddingConfig;
  benchmarkModels?: Record<string, BenchmarkModelConfig>;
}

// Provider configurations
export const PROVIDER_CONFIGS: Record<
  LLMProvider,
  {
    name: string;
    envVar: string;
    baseUrl?: string;
    defaultModel: string;
    hint?: string;
  }
> = {
  anthropic: {
    name: "Anthropic",
    envVar: "ANTHROPIC_API_KEY",
    defaultModel: "claude-sonnet-4-20250514",
    hint: "Claude models",
  },
  openai: {
    name: "OpenAI",
    envVar: "OPENAI_API_KEY",
    defaultModel: "gpt-4o",
    hint: "GPT models",
  },
  google: {
    name: "Google",
    envVar: "GOOGLE_API_KEY",
    defaultModel: "gemini-2.0-flash",
    hint: "Gemini models",
  },
  openrouter: {
    name: "OpenRouter",
    envVar: "OPENROUTER_API_KEY",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "openrouter/auto",
    hint: "Multi-model gateway (Claude, GPT, Llama, etc.)",
  },
  groq: {
    name: "Groq",
    envVar: "GROQ_API_KEY",
    defaultModel: "llama-3.3-70b-versatile",
    hint: "Fast inference (Llama, Mixtral)",
  },
  mistral: {
    name: "Mistral AI",
    envVar: "MISTRAL_API_KEY",
    defaultModel: "mistral-large-latest",
    hint: "Mistral models",
  },
  xai: {
    name: "xAI",
    envVar: "XAI_API_KEY",
    defaultModel: "grok-2-1212",
    hint: "Grok models",
  },
};

const DEFAULT_CONFIG: PHAConfig = {
  gateway: {
    port: 8000,
    autoStart: false,
  },
  llm: {
    provider: "anthropic",
  },
  dataSources: {
    type: "mock",
  },
  tui: {
    theme: "dark",
    showToolCalls: true,
  },
};

/**
 * Find project root by looking for package.json
 */
function findProjectRoot(): string {
  let dir = process.cwd();
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, "package.json"))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return process.cwd();
}

/**
 * Get state directory for tokens, logs, etc.
 * Located at ./.pha/ in project root
 */
export function getStateDir(): string {
  const override = process.env.PHA_STATE_DIR?.trim();
  if (override) {
    return path.resolve(override);
  }
  return path.join(findProjectRoot(), ".pha");
}

/**
 * Get config directory (same as state dir for compatibility)
 */
export function getConfigDir(): string {
  return getStateDir();
}

/**
 * Get config file path
 * Located at ./.pha/config.json in project root
 */
export function getConfigPath(): string {
  const override = process.env.PHA_CONFIG_PATH?.trim();
  if (override) {
    return path.resolve(override);
  }
  return path.join(getStateDir(), "config.json");
}

export function ensureConfigDir(): void {
  const dir = getConfigDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function loadConfig(): PHAConfig {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const content = fs.readFileSync(configPath, "utf-8");
    const loaded = JSON.parse(content);
    return { ...DEFAULT_CONFIG, ...loaded };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config: PHAConfig): void {
  ensureConfigDir();
  const configPath = getConfigPath();
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

export function getConfigValue(path: string): unknown {
  const config = loadConfig();
  const parts = path.split(".");
  let current: any = config;

  for (const part of parts) {
    if (current === undefined || current === null) {
      return undefined;
    }
    current = current[part];
  }

  return current;
}

export function setConfigValue(path: string, value: unknown): void {
  const config = loadConfig();
  const parts = path.split(".");
  let current: any = config;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (current[part] === undefined) {
      current[part] = {};
    }
    current = current[part];
  }

  const lastPart = parts[parts.length - 1];

  // Parse value
  if (value === "true") value = true;
  else if (value === "false") value = false;
  else if (!isNaN(Number(value))) value = Number(value);

  current[lastPart] = value;
  saveConfig(config);
}

export function unsetConfigValue(path: string): void {
  const config = loadConfig();
  const parts = path.split(".");
  let current: any = config;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (current[part] === undefined) {
      return;
    }
    current = current[part];
  }

  delete current[parts[parts.length - 1]];
  saveConfig(config);
}

export function isConfigured(): boolean {
  return fs.existsSync(getConfigPath());
}

/**
 * Get the effective API key for the current provider
 */
export function getApiKey(provider?: LLMProvider): string | undefined {
  const config = loadConfig();
  const p = provider || config.llm.provider;

  // First check config
  if (config.llm.apiKey) {
    return config.llm.apiKey;
  }

  // Then check environment
  const providerConfig = PROVIDER_CONFIGS[p];
  if (providerConfig) {
    return process.env[providerConfig.envVar];
  }

  return undefined;
}

/**
 * Get the base URL for the current provider
 */
export function getBaseUrl(provider?: LLMProvider): string | undefined {
  const config = loadConfig();
  const p = provider || config.llm.provider;

  // First check config
  if (config.llm.baseUrl) {
    return config.llm.baseUrl;
  }

  // Then use provider default
  const providerConfig = PROVIDER_CONFIGS[p];
  return providerConfig?.baseUrl;
}

/**
 * Get the model ID for the current provider
 */
export function getModelId(provider?: LLMProvider): string {
  const config = loadConfig();
  const p = provider || config.llm.provider;

  // First check config
  if (config.llm.modelId) {
    return config.llm.modelId;
  }

  // Then use provider default
  const providerConfig = PROVIDER_CONFIGS[p];
  return providerConfig?.defaultModel || "default";
}

/**
 * Get the user UUID from config, falling back to the built-in default
 */
export function getUserUuid(): string {
  const config = loadConfig();
  return config.userUuid || FALLBACK_USER_UUID;
}

/**
 * Get benchmark models from config.
 * If benchmarkModels is configured, returns it.
 * Otherwise, derives a single "default" entry from the llm config.
 */
export function getBenchmarkModels(): Record<string, BenchmarkModelConfig> {
  const config = loadConfig();

  if (config.benchmarkModels && Object.keys(config.benchmarkModels).length > 0) {
    return config.benchmarkModels;
  }

  // Derive default from llm config
  const provider = config.llm.provider;
  const modelId = config.llm.modelId || PROVIDER_CONFIGS[provider]?.defaultModel || "default";
  return {
    default: {
      provider,
      modelId,
      label: `${PROVIDER_CONFIGS[provider]?.name || provider} (${modelId})`,
    },
  };
}

/**
 * Resolve API key for a benchmark model config.
 * Priority: model.apiKey → same-provider config key → env var → config fallback
 */
export function resolveBenchmarkModelApiKey(model: BenchmarkModelConfig): string | undefined {
  // 1. Model-specific key
  if (model.apiKey) return model.apiKey;

  const config = loadConfig();

  // 2. If same provider as config, use config key
  if (model.provider === config.llm.provider && config.llm.apiKey) {
    return config.llm.apiKey;
  }

  // 3. Provider-specific env var
  const providerConfig = PROVIDER_CONFIGS[model.provider];
  if (providerConfig) {
    const envVal = process.env[providerConfig.envVar];
    if (envVal) return envVal;
  }

  // 4. Fallback to config key (may work for OpenRouter multi-model)
  if (config.llm.apiKey) return config.llm.apiKey;

  return undefined;
}

/**
 * Resolve base URL for a benchmark model config.
 * Priority: model.baseUrl → same-provider config baseUrl → provider default baseUrl
 */
export function resolveBenchmarkModelBaseUrl(model: BenchmarkModelConfig): string | undefined {
  if (model.baseUrl) return model.baseUrl;

  const config = loadConfig();

  // Same provider as config — use config baseUrl
  if (model.provider === config.llm.provider && config.llm.baseUrl) {
    return config.llm.baseUrl;
  }

  // Provider default
  return PROVIDER_CONFIGS[model.provider]?.baseUrl;
}
