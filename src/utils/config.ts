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
import { AsyncLocalStorage } from "node:async_hooks";

/** Fallback user UUID (used only if config has no userUuid) */
const FALLBACK_USER_UUID = "a755451c-938e-4cea-b7a6-b66b205949cf";

// Session-scoped user UUID (set during tool execution via runWithUserUuid)
const userUuidStore = new AsyncLocalStorage<string>();

/**
 * Run a function with a specific user UUID in scope.
 * Tools calling getUserUuid() inside will get this UUID.
 */
export function runWithUserUuid<T>(uuid: string, fn: () => T): T {
  return userUuidStore.run(uuid, fn);
}

// ============================================================================
// Unified LLM Provider types & constants
// (Merged from pha-agent.ts and system-agent.ts)
// ============================================================================

export type LLMProvider =
  | "anthropic"
  | "openai"
  | "google"
  | "openrouter"
  | "moonshot"
  | "deepseek"
  | "groq"
  | "mistral"
  | "xai";

/** All known provider identifiers */
export const KNOWN_PROVIDERS: LLMProvider[] = [
  "anthropic",
  "openai",
  "google",
  "openrouter",
  "moonshot",
  "deepseek",
  "groq",
  "mistral",
  "xai",
];

/** Provider → environment variable name */
export const ENV_KEY_MAP: Record<LLMProvider, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  moonshot: "MOONSHOT_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  groq: "GROQ_API_KEY",
  mistral: "MISTRAL_API_KEY",
  xai: "XAI_API_KEY",
};

/** Provider → default model ID */
export const DEFAULT_MODELS: Record<LLMProvider, string> = {
  anthropic: "claude-sonnet-4-20250514",
  openai: "gpt-4o",
  google: "gemini-2.0-flash",
  openrouter: "openrouter/auto",
  moonshot: "moonshot-v1-128k",
  deepseek: "deepseek-chat",
  groq: "llama-3.3-70b-versatile",
  mistral: "mistral-large-latest",
  xai: "grok-2-1212",
};

/** Providers that are built into pi-ai (have proper compat settings) */
export const BUILTIN_PROVIDERS: LLMProvider[] = [
  "anthropic",
  "openai",
  "google",
  "openrouter",
  "groq",
  "mistral",
  "xai",
];

// ============================================================================
// Model Repository types (new unified format)
// ============================================================================

/** A model definition inside a provider */
export interface ModelDefinition {
  /** Short name, used in "provider/name" references */
  name: string;
  /** Actual API model ID */
  model: string;
  /** Optional display label */
  label?: string;
}

/** Provider configuration in the model repository */
export interface ModelProviderConfig {
  baseUrl?: string;
  apiKey?: string;
  models: ModelDefinition[];
}

/** The top-level models repository */
export interface ModelsConfig {
  providers: Record<string, ModelProviderConfig>;
}

/** Fully resolved model with all info needed to make API calls */
export interface ResolvedModel {
  provider: string;
  modelId: string;
  apiKey: string;
  baseUrl?: string;
  label: string;
  name: string;
}

// ============================================================================
// Orchestrator config (unified model assignments)
// ============================================================================

export interface OrchestratorConfig {
  /** PHA Agent model ref: "provider/name" */
  pha?: string;
  /** System Agent model ref: "provider/name" */
  sa?: string;
  /** Judge model ref: "provider/name" */
  judge?: string;
  /** Embedding model ref: "provider/name" */
  embedding?: string;
}

// ============================================================================
// Existing types (kept for backward compatibility)
// ============================================================================

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
  authUrl?: string;
  tokenUrl?: string;
  apiBaseUrl?: string;
}

export interface RemoteMCPServerConfig {
  url: string;
  apiKey?: string;
  enabled?: boolean;
  name?: string;
}

export interface MCPConfig {
  chromeMcp?: {
    command?: string;
    args?: string[];
    browserUrl?: string;
    wsEndpoint?: string;
  };
  remoteServers?: Record<string, RemoteMCPServerConfig>;
}

export interface EmbeddingConfig {
  model?: string;
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

  // ---- New unified model repository fields ----
  /** Unified model repository */
  models?: ModelsConfig;
  /** Orchestrator: unified model assignments */
  orchestrator?: OrchestratorConfig;
  // ---- Legacy model assignment fields (kept for migration) ----
  /** @deprecated Use orchestrator.pha */
  agentModel?: string;
  /** @deprecated Use orchestrator.judge; old format = BenchmarkModelConfig object */
  judgeModel?: string | BenchmarkModelConfig;
  /** @deprecated Use orchestrator.sa */
  systemAgentModel?: string;
  /** @deprecated Use orchestrator.embedding */
  embeddingModel?: string;
  /** Benchmark config (new format with model refs) */
  benchmark?: {
    /** Number of concurrent test executions, default 1 (sequential) */
    concurrency?: number;
    /** Model refs: ["provider/name", ...] */
    models?: string[];
  };

  // ---- Kept for backward compatibility ----
  benchmarkModels?: Record<string, BenchmarkModelConfig>;

  /** Evolution apply engine */
  applyEngine?: "claude-code" | "pi-coding-agent";
  /** Proactive trigger engine configuration */
  proactive?: {
    enabled?: boolean;
    checkIntervalMinutes?: number;
  };
  /** Plugin system configuration */
  plugins?: {
    enabled?: boolean;
    paths?: string[];
    entries?: Record<
      string,
      {
        enabled?: boolean;
        config?: unknown;
      }
    >;
  };
}

// Provider display configurations
export const PROVIDER_CONFIGS: Record<
  string,
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
  moonshot: {
    name: "Moonshot",
    envVar: "MOONSHOT_API_KEY",
    defaultModel: "moonshot-v1-128k",
    hint: "Kimi models",
  },
  deepseek: {
    name: "DeepSeek",
    envVar: "DEEPSEEK_API_KEY",
    defaultModel: "deepseek-chat",
    hint: "DeepSeek models",
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

// ============================================================================
// File system helpers
// ============================================================================

export function findProjectRoot(): string {
  let dir = process.cwd();
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, "package.json"))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return process.cwd();
}

export function getStateDir(): string {
  const override = process.env.PHA_STATE_DIR?.trim();
  if (override) {
    return path.resolve(override);
  }
  return path.join(findProjectRoot(), ".pha");
}

export function getConfigDir(): string {
  return getStateDir();
}

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

// ============================================================================
// Migration: old flat config → new unified model repository
// ============================================================================

/**
 * Migrate old config format to new unified model repository (in-memory only).
 * Idempotent: skips if `config.models.providers` already exists.
 */
/** @returns true if config was modified (migration or cleanup) */
function migrateConfig(config: PHAConfig): boolean {
  // Clean up redundant old fields even if already migrated
  let modified = false;
  if (config.benchmarkModels && config.models?.providers) {
    delete config.benchmarkModels;
    modified = true;
  }

  // 5. Migrate top-level model assignment fields → orchestrator
  if (
    !config.orchestrator &&
    (config.agentModel ||
      config.systemAgentModel ||
      config.embeddingModel ||
      typeof config.judgeModel === "string")
  ) {
    config.orchestrator = {
      pha: config.agentModel,
      sa: config.systemAgentModel,
      judge: typeof config.judgeModel === "string" ? config.judgeModel : undefined,
      embedding: config.embeddingModel,
    };
    delete config.agentModel;
    delete config.systemAgentModel;
    delete config.embeddingModel;
    if (typeof config.judgeModel === "string") delete config.judgeModel;
    modified = true;
  }

  // Already migrated (model repository)
  if (config.models?.providers && Object.keys(config.models.providers).length > 0) {
    return modified;
  }

  const providers: Record<string, ModelProviderConfig> = {};

  // Helper: ensure provider exists in the map
  const ensureProvider = (providerKey: string, apiKey?: string, baseUrl?: string) => {
    if (!providers[providerKey]) {
      providers[providerKey] = {
        models: [],
        ...(apiKey ? { apiKey } : {}),
        ...(baseUrl ? { baseUrl } : {}),
      };
    } else {
      // Merge apiKey/baseUrl if not already set
      if (apiKey && !providers[providerKey].apiKey) {
        providers[providerKey].apiKey = apiKey;
      }
      if (baseUrl && !providers[providerKey].baseUrl) {
        providers[providerKey].baseUrl = baseUrl;
      }
    }
  };

  // Helper: add model if not already present
  const addModel = (providerKey: string, name: string, modelId: string, label?: string) => {
    const models = providers[providerKey].models;
    if (!models.find((m) => m.name === name)) {
      models.push({ name, model: modelId, ...(label ? { label } : {}) });
    }
  };

  // 1. Migrate config.llm → orchestrator.pha
  const llmProvider = config.llm.provider || "anthropic";
  const llmModelId = config.llm.modelId || PROVIDER_CONFIGS[llmProvider]?.defaultModel || "default";
  const defaultBaseUrl = config.llm.baseUrl || PROVIDER_CONFIGS[llmProvider]?.baseUrl;

  ensureProvider(llmProvider, config.llm.apiKey, defaultBaseUrl);
  // Derive a short name from the model ID
  const agentModelName = deriveModelName(llmModelId);
  addModel(llmProvider, agentModelName, llmModelId);
  if (!config.orchestrator) config.orchestrator = {};
  config.orchestrator.pha = `${llmProvider}/${agentModelName}`;

  // 2. Migrate config.benchmarkModels
  if (config.benchmarkModels && Object.keys(config.benchmarkModels).length > 0) {
    const benchmarkRefs: string[] = [];
    for (const [presetName, modelCfg] of Object.entries(config.benchmarkModels)) {
      const bProvider = modelCfg.provider || llmProvider;
      const bBaseUrl = modelCfg.baseUrl || PROVIDER_CONFIGS[bProvider]?.baseUrl;
      ensureProvider(bProvider, modelCfg.apiKey, bBaseUrl);
      addModel(bProvider, presetName, modelCfg.modelId, modelCfg.label);
      benchmarkRefs.push(`${bProvider}/${presetName}`);
    }
    if (!config.benchmark) config.benchmark = {};
    config.benchmark.models = benchmarkRefs;
  }

  // 3. Migrate config.judgeModel (object → orchestrator.judge string ref)
  if (config.judgeModel && typeof config.judgeModel === "object") {
    const jm = config.judgeModel as BenchmarkModelConfig;
    if (jm.provider && jm.modelId) {
      const jProvider = jm.provider;
      const jBaseUrl = jm.baseUrl || PROVIDER_CONFIGS[jProvider]?.baseUrl;
      ensureProvider(jProvider, jm.apiKey, jBaseUrl);
      const judgeName = deriveModelName(jm.modelId);
      addModel(jProvider, judgeName, jm.modelId, jm.label);
      config.orchestrator.judge = `${jProvider}/${judgeName}`;
      delete config.judgeModel;
    }
  }

  // 4. Migrate config.embedding → orchestrator.embedding
  if (config.embedding?.model && config.embedding.enabled !== false) {
    // Embedding models typically use the same provider (openrouter) or separate
    const embModel = config.embedding.model;
    // If using openrouter and main provider is openrouter, add there
    const embProvider = llmProvider === "openrouter" ? "openrouter" : llmProvider;
    ensureProvider(embProvider);
    const embName = deriveModelName(embModel);
    addModel(embProvider, embName, embModel);
    config.orchestrator.embedding = `${embProvider}/${embName}`;
  }

  // Only set if we actually found something to migrate
  if (Object.keys(providers).length > 0) {
    config.models = { providers };
    // Remove fully redundant old fields (data now lives in models.providers + benchmark.models)
    delete config.benchmarkModels;
    // Clean up legacy fields that are now in orchestrator
    delete config.agentModel;
    delete config.systemAgentModel;
    delete config.embeddingModel;
    return true;
  }
  return false;
}

/** Derive a short model name from a full model ID (e.g. "anthropic/claude-sonnet-4" → "claude-sonnet-4") */
function deriveModelName(modelId: string): string {
  // If it contains a slash (provider/model format), take the part after the last slash
  const parts = modelId.split("/");
  return parts[parts.length - 1];
}

// ============================================================================
// Legacy field sync (in-memory only, not persisted to file)
// ============================================================================

/**
 * Derive config.llm and config.embedding in-memory from the unified model
 * repository so that legacy code reading config.llm.* still works.
 * These fields are NOT written to the config file.
 */
function syncLegacyFields(config: PHAConfig): void {
  const phaRef = config.orchestrator?.pha;
  const embRef = config.orchestrator?.embedding;

  // Sync config.llm from orchestrator.pha + models.providers
  if (phaRef && config.models?.providers) {
    try {
      const { provider, name } = parseModelRef(phaRef);
      const providerCfg = config.models.providers[provider];
      if (providerCfg) {
        const modelDef = providerCfg.models.find((m) => m.name === name);
        config.llm = {
          provider: provider as LLMProvider,
          modelId: modelDef?.model,
          apiKey: providerCfg.apiKey,
          baseUrl: providerCfg.baseUrl,
        };
      }
    } catch {
      // Keep DEFAULT_CONFIG.llm
    }
  }

  // Sync config.embedding from orchestrator.embedding + models.providers
  if (embRef && config.models?.providers) {
    try {
      const { provider, name } = parseModelRef(embRef);
      const providerCfg = config.models.providers[provider];
      if (providerCfg) {
        const modelDef = providerCfg.models.find((m) => m.name === name);
        config.embedding = {
          enabled: true,
          model: modelDef?.model,
        };
      }
    } catch {
      // Keep whatever embedding was
    }
  } else if (!embRef && config.models?.providers) {
    // No embedding model ref = disabled
    config.embedding = { enabled: false };
  }
}

/**
 * Strip legacy fields (llm, embedding, benchmarkModels) that are now derived
 * from the unified model repository. Returns a clean copy for file persistence.
 */
export function stripLegacyFieldsForSave(config: PHAConfig): Record<string, unknown> {
  const copy = { ...config } as Record<string, any>;
  // Only strip if we have the new format to derive from
  if (copy.models?.providers && Object.keys(copy.models.providers).length > 0) {
    delete copy.llm;
    delete copy.embedding;
    delete copy.benchmarkModels;
  }
  // Clean up legacy top-level model assignment fields when orchestrator exists
  if (copy.orchestrator) {
    delete copy.agentModel;
    delete copy.systemAgentModel;
    delete copy.embeddingModel;
    if (typeof copy.judgeModel === "string") delete copy.judgeModel;
  }
  return copy;
}

// ============================================================================
// Config load / save
// ============================================================================

export function loadConfig(): PHAConfig {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const content = fs.readFileSync(configPath, "utf-8");
    const loaded = JSON.parse(content);
    const config = { ...DEFAULT_CONFIG, ...loaded };
    // Auto-migrate old format to new
    let needsSave = migrateConfig(config);
    // Check if file still has legacy fields that should be stripped
    if (config.models?.providers && Object.keys(config.models.providers).length > 0) {
      if ("llm" in loaded || "embedding" in loaded || "benchmarkModels" in loaded) {
        needsSave = true;
      }
    }
    // Check if file still has legacy model assignment fields
    if (config.orchestrator) {
      if ("agentModel" in loaded || "systemAgentModel" in loaded || "embeddingModel" in loaded) {
        needsSave = true;
      }
    }
    if (needsSave) {
      try {
        const clean = stripLegacyFieldsForSave(config);
        fs.writeFileSync(configPath, JSON.stringify(clean, null, 2));
      } catch {
        // Best-effort — don't fail loadConfig if write fails
      }
    }
    // Derive legacy fields in-memory for backward compat
    syncLegacyFields(config);
    return config;
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config: PHAConfig): void {
  ensureConfigDir();
  const configPath = getConfigPath();
  const clean = stripLegacyFieldsForSave(config);
  fs.writeFileSync(configPath, JSON.stringify(clean, null, 2));
  // Re-sync in-memory legacy fields after save
  syncLegacyFields(config);
}

// ============================================================================
// Model repository resolver functions
// ============================================================================

/**
 * Parse a "provider/name" model reference.
 */
export function parseModelRef(ref: string): { provider: string; name: string } {
  const slashIdx = ref.indexOf("/");
  if (slashIdx === -1) {
    throw new Error(`Invalid model reference "${ref}": expected "provider/name" format`);
  }
  return {
    provider: ref.substring(0, slashIdx),
    name: ref.substring(slashIdx + 1),
  };
}

/**
 * Resolve a "provider/name" reference to a fully resolved model.
 * Looks up the model in the repository, resolves apiKey and baseUrl.
 */
export function resolveModel(ref: string, config?: PHAConfig): ResolvedModel {
  const cfg = config || loadConfig();
  const { provider, name } = parseModelRef(ref);

  const providerCfg = cfg.models?.providers?.[provider];
  if (!providerCfg) {
    throw new Error(
      `Provider "${provider}" not found in model repository. Available: ${Object.keys(cfg.models?.providers || {}).join(", ") || "(none)"}`
    );
  }

  const modelDef = providerCfg.models.find((m) => m.name === name);
  if (!modelDef) {
    throw new Error(
      `Model "${name}" not found in provider "${provider}". Available: ${providerCfg.models.map((m) => m.name).join(", ") || "(none)"}`
    );
  }

  // Resolve API key: providerConfig.apiKey → ENV_KEY_MAP → error
  const apiKey = resolveProviderApiKey(provider, providerCfg, cfg);
  if (!apiKey) {
    const envVar = ENV_KEY_MAP[provider as LLMProvider] || PROVIDER_CONFIGS[provider]?.envVar;
    throw new Error(
      `No API key found for provider "${provider}". Set it in config or via ${envVar || "environment variable"}.`
    );
  }

  // Resolve base URL
  const baseUrl = providerCfg.baseUrl || PROVIDER_CONFIGS[provider]?.baseUrl;

  return {
    provider,
    modelId: modelDef.model,
    apiKey,
    baseUrl,
    label: modelDef.label || `${provider}/${modelDef.name}`,
    name: modelDef.name,
  };
}

/**
 * Resolve the agent model. Falls back to legacy llm config if agentModel is not set.
 */
export function resolveAgentModel(config?: PHAConfig): ResolvedModel {
  const cfg = config || loadConfig();

  // Orchestrator format: orchestrator.pha
  const phaRef = cfg.orchestrator?.pha;
  if (phaRef && cfg.models?.providers) {
    try {
      return resolveModel(phaRef, cfg);
    } catch {
      // Fall through
    }
  }

  // Legacy: agentModel ref
  if (cfg.agentModel && cfg.models?.providers) {
    try {
      return resolveModel(cfg.agentModel, cfg);
    } catch {
      // Fall through to legacy
    }
  }

  // Legacy fallback: build from config.llm
  const provider = cfg.llm.provider || "anthropic";
  const modelId = cfg.llm.modelId || DEFAULT_MODELS[provider] || "default";
  const apiKey = cfg.llm.apiKey || process.env[ENV_KEY_MAP[provider]] || undefined;

  if (!apiKey) {
    throw new Error(
      `No API key found for provider "${provider}". Set ${ENV_KEY_MAP[provider]} or configure in .pha/config.json.`
    );
  }

  const baseUrl = cfg.llm.baseUrl || PROVIDER_CONFIGS[provider]?.baseUrl;
  const providerName = PROVIDER_CONFIGS[provider]?.name || provider;

  return {
    provider,
    modelId,
    apiKey,
    baseUrl,
    label: `${providerName} (${modelId})`,
    name: deriveModelName(modelId),
  };
}

/**
 * Resolve the system agent model (used for evolution/code operations).
 * Falls back to agent model if systemAgentModel is not configured.
 */
export function resolveSystemAgentModel(config?: PHAConfig): ResolvedModel {
  const cfg = config || loadConfig();

  // Orchestrator format: orchestrator.sa
  const saRef = cfg.orchestrator?.sa;
  if (saRef && cfg.models?.providers) {
    try {
      return resolveModel(saRef, cfg);
    } catch {
      // Fall through
    }
  }

  // Legacy: systemAgentModel ref
  if (cfg.systemAgentModel && cfg.models?.providers) {
    try {
      return resolveModel(cfg.systemAgentModel, cfg);
    } catch {
      // Fall through to agent model
    }
  }

  // Fallback: use agent model
  return resolveAgentModel(cfg);
}

/**
 * Resolve the judge model for benchmark evaluation.
 * Falls back to agent model if judgeModel is not configured.
 */
export function resolveJudgeModel(config?: PHAConfig): ResolvedModel {
  const cfg = config || loadConfig();

  // Orchestrator format: orchestrator.judge
  const judgeRef = cfg.orchestrator?.judge;
  if (judgeRef && cfg.models?.providers) {
    try {
      return resolveModel(judgeRef, cfg);
    } catch {
      // Fall through
    }
  }

  // Legacy: string ref
  if (typeof cfg.judgeModel === "string" && cfg.models?.providers) {
    try {
      return resolveModel(cfg.judgeModel, cfg);
    } catch {
      // Fall through
    }
  }

  // Old format: BenchmarkModelConfig object
  if (cfg.judgeModel && typeof cfg.judgeModel === "object") {
    const jm = cfg.judgeModel as BenchmarkModelConfig;
    if (jm.provider && jm.modelId) {
      const apiKey = jm.apiKey || resolveBenchmarkModelApiKey(jm) || undefined;
      if (apiKey) {
        const baseUrl = jm.baseUrl || resolveBenchmarkModelBaseUrl(jm);
        return {
          provider: jm.provider,
          modelId: jm.modelId,
          apiKey,
          baseUrl,
          label: jm.label || `${jm.provider}/${jm.modelId}`,
          name: deriveModelName(jm.modelId),
        };
      }
    }
  }

  // Fallback: use agent model
  return resolveAgentModel(cfg);
}

/**
 * Resolve benchmark models to test against.
 * New format: benchmark.models[] refs.
 * Old format: benchmarkModels record.
 * Fallback: agent model.
 */
export function resolveBenchmarkModels(config?: PHAConfig): ResolvedModel[] {
  const cfg = config || loadConfig();

  // New format: benchmark.models refs
  if (cfg.benchmark?.models && cfg.benchmark.models.length > 0 && cfg.models?.providers) {
    const models: ResolvedModel[] = [];
    for (const ref of cfg.benchmark.models) {
      try {
        models.push(resolveModel(ref, cfg));
      } catch {
        // Skip models that can't be resolved
      }
    }
    if (models.length > 0) return models;
  }

  // Old format: benchmarkModels
  if (cfg.benchmarkModels && Object.keys(cfg.benchmarkModels).length > 0) {
    const models: ResolvedModel[] = [];
    for (const [presetName, modelCfg] of Object.entries(cfg.benchmarkModels)) {
      const apiKey = resolveBenchmarkModelApiKey(modelCfg);
      if (!apiKey) continue;
      const baseUrl = resolveBenchmarkModelBaseUrl(modelCfg);
      models.push({
        provider: modelCfg.provider,
        modelId: modelCfg.modelId,
        apiKey,
        baseUrl,
        label: modelCfg.label || `${modelCfg.provider}/${modelCfg.modelId}`,
        name: presetName,
      });
    }
    if (models.length > 0) return models;
  }

  // Fallback: agent model
  try {
    return [resolveAgentModel(cfg)];
  } catch {
    return [];
  }
}

/**
 * Resolve the embedding model. Returns null if embedding is disabled.
 */
export function resolveEmbeddingModel(config?: PHAConfig): ResolvedModel | null {
  const cfg = config || loadConfig();

  // Check if embedding is disabled
  if (cfg.embedding?.enabled === false) return null;

  // Orchestrator format: orchestrator.embedding
  const embRef = cfg.orchestrator?.embedding;
  if (embRef && cfg.models?.providers) {
    try {
      return resolveModel(embRef, cfg);
    } catch {
      // Fall through
    }
  }

  // Legacy: embeddingModel ref
  if (cfg.embeddingModel && cfg.models?.providers) {
    try {
      return resolveModel(cfg.embeddingModel, cfg);
    } catch {
      // Fall through
    }
  }

  // Legacy: derive from config.embedding.model + llm provider
  if (cfg.embedding?.model) {
    const embModel = cfg.embedding.model;
    // Try to find an API key from the LLM config or env
    const apiKey =
      cfg.llm.apiKey || process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || undefined;

    if (apiKey) {
      const baseUrl =
        cfg.llm.baseUrl ||
        PROVIDER_CONFIGS[cfg.llm.provider]?.baseUrl ||
        "https://openrouter.ai/api/v1";
      return {
        provider: cfg.llm.provider,
        modelId: embModel,
        apiKey,
        baseUrl,
        label: embModel,
        name: deriveModelName(embModel),
      };
    }
  }

  return null;
}

/**
 * List all "provider/name" model references in the repository.
 */
export function listAllModelRefs(config?: PHAConfig): string[] {
  const cfg = config || loadConfig();
  const refs: string[] = [];

  if (cfg.models?.providers) {
    for (const [providerKey, providerCfg] of Object.entries(cfg.models.providers)) {
      for (const model of providerCfg.models) {
        refs.push(`${providerKey}/${model.name}`);
      }
    }
  }

  return refs;
}

// ============================================================================
// Helper: resolve API key for a provider in the repository
// ============================================================================

function resolveProviderApiKey(
  providerKey: string,
  providerCfg: ModelProviderConfig,
  config: PHAConfig
): string | undefined {
  // 1. Provider-level apiKey in repository
  if (providerCfg.apiKey) return providerCfg.apiKey;

  // 2. Environment variable
  const envVar = ENV_KEY_MAP[providerKey as LLMProvider] || PROVIDER_CONFIGS[providerKey]?.envVar;
  if (envVar && process.env[envVar]) {
    return process.env[envVar];
  }

  // 3. Legacy: if same provider as llm config, use llm apiKey
  if (providerKey === config.llm.provider && config.llm.apiKey) {
    return config.llm.apiKey;
  }

  // 4. Fallback: llm apiKey (may work for OpenRouter multi-model)
  if (config.llm.apiKey) return config.llm.apiKey;

  return undefined;
}

// ============================================================================
// Legacy config accessor functions (kept for backward compatibility)
// ============================================================================

export function getConfigValue(dotPath: string): unknown {
  const config = loadConfig();
  const parts = dotPath.split(".");
  let current: any = config;

  for (const part of parts) {
    if (current === undefined || current === null) {
      return undefined;
    }
    current = current[part];
  }

  return current;
}

export function setConfigValue(dotPath: string, value: unknown): void {
  const config = loadConfig();
  const parts = dotPath.split(".");
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

export function unsetConfigValue(dotPath: string): void {
  const config = loadConfig();
  const parts = dotPath.split(".");
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
 * Get the user UUID from config, falling back to the built-in default.
 * Priority: AsyncLocalStorage (session-scoped) > config file > fallback.
 */
export function getUserUuid(): string {
  // 1. AsyncLocalStorage (session-scoped, highest priority)
  const alsUuid = userUuidStore.getStore();
  if (alsUuid) return alsUuid;
  // 2. Config file
  const config = loadConfig();
  return config.userUuid || FALLBACK_USER_UUID;
}

/**
 * @deprecated Use resolveAgentModel() instead
 */
export function getApiKey(provider?: LLMProvider): string | undefined {
  const config = loadConfig();
  const p = provider || config.llm.provider;

  if (config.llm.apiKey) {
    return config.llm.apiKey;
  }

  const providerConfig = PROVIDER_CONFIGS[p];
  if (providerConfig) {
    return process.env[providerConfig.envVar];
  }

  return undefined;
}

/**
 * @deprecated Use resolveAgentModel() instead
 */
export function getBaseUrl(provider?: LLMProvider): string | undefined {
  const config = loadConfig();
  const p = provider || config.llm.provider;

  if (config.llm.baseUrl) {
    return config.llm.baseUrl;
  }

  const providerConfig = PROVIDER_CONFIGS[p];
  return providerConfig?.baseUrl;
}

/**
 * @deprecated Use resolveAgentModel() instead
 */
export function getModelId(provider?: LLMProvider): string {
  const config = loadConfig();
  const p = provider || config.llm.provider;

  if (config.llm.modelId) {
    return config.llm.modelId;
  }

  const providerConfig = PROVIDER_CONFIGS[p];
  return providerConfig?.defaultModel || "default";
}

/**
 * @deprecated Use resolveBenchmarkModels() instead
 */
export function getBenchmarkModels(): Record<string, BenchmarkModelConfig> {
  const config = loadConfig();

  // Legacy field (may have been removed by migration)
  if (config.benchmarkModels && Object.keys(config.benchmarkModels).length > 0) {
    return config.benchmarkModels;
  }

  // Build from new format benchmark.models refs
  if (config.benchmark?.models && config.benchmark.models.length > 0) {
    const result: Record<string, BenchmarkModelConfig> = {};
    for (const ref of config.benchmark.models) {
      try {
        const resolved = resolveModel(ref, config);
        result[resolved.name] = {
          provider: resolved.provider as LLMProvider,
          modelId: resolved.modelId,
          label: resolved.label,
          apiKey: resolved.apiKey,
          baseUrl: resolved.baseUrl,
        };
      } catch {
        // Skip unresolvable refs
      }
    }
    if (Object.keys(result).length > 0) return result;
  }

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
 * @deprecated Use resolveModel() which already includes apiKey
 */
export function resolveBenchmarkModelApiKey(model: BenchmarkModelConfig): string | undefined {
  if (model.apiKey) return model.apiKey;

  const config = loadConfig();

  if (model.provider === config.llm.provider && config.llm.apiKey) {
    return config.llm.apiKey;
  }

  const providerConfig = PROVIDER_CONFIGS[model.provider];
  if (providerConfig) {
    const envVal = process.env[providerConfig.envVar];
    if (envVal) return envVal;
  }

  if (config.llm.apiKey) return config.llm.apiKey;

  return undefined;
}

/**
 * @deprecated Use resolveModel() which already includes baseUrl
 */
export function resolveBenchmarkModelBaseUrl(model: BenchmarkModelConfig): string | undefined {
  if (model.baseUrl) return model.baseUrl;

  const config = loadConfig();

  if (model.provider === config.llm.provider && config.llm.baseUrl) {
    return config.llm.baseUrl;
  }

  return PROVIDER_CONFIGS[model.provider]?.baseUrl;
}

/**
 * @deprecated Use resolveJudgeModel() instead
 */
export function getJudgeModel(): BenchmarkModelConfig {
  const config = loadConfig();

  // Legacy: judgeModel as object
  if (config.judgeModel && typeof config.judgeModel === "object") {
    const jm = config.judgeModel as BenchmarkModelConfig;
    if (jm.provider && jm.modelId) {
      return jm;
    }
  }

  // New: judgeModel as string ref
  if (config.judgeModel && typeof config.judgeModel === "string") {
    try {
      const resolved = resolveModel(config.judgeModel, config);
      return {
        provider: resolved.provider as LLMProvider,
        modelId: resolved.modelId,
        label: resolved.label,
        apiKey: resolved.apiKey,
        baseUrl: resolved.baseUrl,
      };
    } catch {
      // Fall through to default
    }
  }

  const provider = config.llm.provider;
  const modelId = config.llm.modelId || PROVIDER_CONFIGS[provider]?.defaultModel || "default";
  return {
    provider,
    modelId,
    apiKey: config.llm.apiKey,
    baseUrl: config.llm.baseUrl,
    label: `${PROVIDER_CONFIGS[provider]?.name || provider} (${modelId})`,
  };
}

/**
 * Get benchmark concurrency setting.
 */
export function getBenchmarkConcurrency(): number {
  const config = loadConfig();
  return config.benchmark?.concurrency || 1;
}
