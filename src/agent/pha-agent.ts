/**
 * PHA Agent
 *
 * Main agent class that wraps pi-agent with health-specific configuration.
 */

import {
  Agent,
  type AgentOptions,
  type AgentEvent,
  type AgentMessage,
} from "@mariozechner/pi-agent-core";
import { getModel, type Model } from "@mariozechner/pi-ai";
import { globalRegistry } from "../tools/index.js";
import { getMemoryManager } from "../memory/index.js";
import { createCompactionFlush, type LLMSummarizationConfig } from "../memory/compaction.js";
import {
  getUserId,
  type LLMProvider,
  DEFAULT_MODELS,
  ENV_KEY_MAP,
  BUILTIN_PROVIDERS,
  type ResolvedModel,
} from "../utils/config.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("Agent/PHA");
import { preComputeHealthContext, fetchWeatherContext } from "./health-context.js";
// Skill loading is now LLM-driven via system prompt skill registry + get_skill tool.
// No regex trigger injection.
import { sessionToAgentMessages } from "../memory/session-store.js";

export type { LLMProvider } from "../utils/config.js";
import {
  loadConfig,
  resolveModel,
  resolveAgentModel,
  type AgentProfileConfig,
} from "../utils/config.js";
import type { ToolCategory } from "../tools/types.js";

/** Declarative agent configuration profile (runtime, fully typed) */
export interface AgentProfile {
  id: string;
  /** Per-agent model ref: "provider/name" (overrides orchestrator.pha fallback) */
  model?: string;
  tools: { categories: ToolCategory[] };
  skills?: { excludeTypes?: string[] };
  context: {
    health?: boolean;
    weather?: boolean;
    bootstrap?: boolean;
    memory?: boolean;
    profile?: boolean;
  };
  skillHint?: string;
}

/** Default tool categories shared across PHA agents */
const PHA_TOOL_CATEGORIES: ToolCategory[] = [
  "health",
  "memory",
  "profile",
  "config",
  "skill",
  "presentation",
  "planning",
  "proactive",
];

/** Built-in agent profile defaults (used when config.json has no overrides) */
const BUILTIN_PROFILES: Record<string, AgentProfile> = {
  pha: {
    id: "pha",
    tools: { categories: PHA_TOOL_CATEGORIES },
    context: { health: true, weather: true, bootstrap: true },
  },
  pha4old: {
    id: "pha4old",
    tools: { categories: PHA_TOOL_CATEGORIES },
    skills: { excludeTypes: ["system"] },
    context: { health: true, weather: true, bootstrap: true },
    skillHint: "legacy-streaming",
  },
};

/**
 * Resolve an agent profile by ID.
 * Priority: config.json agents.{id} (merged over built-in) > built-in default.
 */
export function getAgentProfile(id: string): AgentProfile {
  const builtin = BUILTIN_PROFILES[id];
  const config = loadConfig();
  const override = config.agents?.[id];

  if (!override) {
    // No config override — use built-in (or synthesize a minimal one)
    return builtin || { id, tools: { categories: PHA_TOOL_CATEGORIES }, context: {} };
  }

  // Merge: config override wins per-field, built-in is fallback
  const base = builtin || { id, tools: { categories: PHA_TOOL_CATEGORIES }, context: {} };
  return {
    id,
    model: override.model ?? base.model,
    tools: {
      categories: (override.tools?.categories as ToolCategory[]) || base.tools.categories,
    },
    skills: override.skills || base.skills,
    context: { ...base.context, ...override.context },
    skillHint: override.skillHint ?? base.skillHint,
  };
}

/** Convenience: get all known profile IDs (built-in + config) */
export function getAgentProfileIds(): string[] {
  const config = loadConfig();
  const ids = new Set(Object.keys(BUILTIN_PROFILES));
  if (config.agents) {
    for (const k of Object.keys(config.agents)) ids.add(k);
  }
  return [...ids];
}

/**
 * Resolve model for an agent profile.
 * Priority: agents.{id}.model > orchestrator.pha > llm (legacy)
 */
export function resolveAgentProfileModel(agentId: string): ResolvedModel {
  const profile = getAgentProfile(agentId);
  const config = loadConfig();

  // 1. Agent-specific model ref
  if (profile.model && config.models?.providers) {
    try {
      return resolveModel(profile.model, config);
    } catch {
      // fall through to global fallback
    }
  }

  // 2. Fall back to resolveAgentModel() (orchestrator.pha > llm)
  return resolveAgentModel(config);
}

/** @deprecated Use getAgentProfile() — kept for backward compat during migration */
export const AGENT_PROFILES = new Proxy({} as Record<string, AgentProfile>, {
  get(_target, prop: string) {
    return getAgentProfile(prop);
  },
  has(_target, prop: string) {
    return prop in BUILTIN_PROFILES || !!loadConfig().agents?.[prop as string];
  },
});

export interface PHAAgentConfig {
  /** LLM provider (default: "anthropic") */
  provider?: LLMProvider;
  /** Model ID (default: provider's default) */
  modelId?: string;
  /** API Key (required for most providers) */
  apiKey?: string;
  /** Base URL for OpenAI-compatible APIs (not used for built-in providers) */
  baseUrl?: string;
  /** User UUID for personalized memory (optional) */
  userUuid?: string;
  /** Session ID for transcript storage */
  sessionId?: string;
  /** User-specific health data source (for per-session isolation) */
  dataSource?: import("../data-sources/interface.js").HealthDataSource;
  /** Custom tools (overrides default health tools when provided) */
  tools?: import("@mariozechner/pi-agent-core").AgentTool<any>[];
  /** Extra tools to append (e.g. from plugins), merged with default tools */
  extraTools?: import("@mariozechner/pi-agent-core").AgentTool<any>[];
  /** Additional agent options */
  agentOptions?: Partial<AgentOptions>;
  /** Prior chat messages to restore context after restart */
  sessionMessages?: Array<{ role: string; content: string; timestamp?: number }>;
  /** Agent profile for configurable composition */
  profile?: AgentProfile;
  /** Pre-computed expensive contexts, skip re-computation if provided */
  cachedContext?: { healthContext?: string; weatherContext?: string };
}

// LLMProvider, DEFAULT_MODELS, ENV_KEY_MAP, BUILTIN_PROVIDERS imported from config.ts

export class PHAAgent {
  private agent: Agent;
  private config: PHAAgentConfig;
  private userUuid?: string;
  private _cachedHealthContext?: string;
  private _cachedWeatherContext?: string;

  constructor(config: PHAAgentConfig = {}, healthContext?: string, weatherContext?: string) {
    this.config = config;
    this.userUuid = config.userUuid || getUserId() || undefined;
    this._cachedHealthContext = healthContext;
    this._cachedWeatherContext = weatherContext;

    const provider = config.provider || "anthropic";
    const modelId = config.modelId || DEFAULT_MODELS[provider];
    const apiKey = config.apiKey || this.getEnvApiKey(provider);

    if (!apiKey) {
      throw new Error(
        `API key required for provider: ${provider}. Set ${ENV_KEY_MAP[provider]} or provide apiKey in config.`
      );
    }

    let model: Model<any>;

    if (BUILTIN_PROVIDERS.includes(provider)) {
      // Try built-in pi-ai provider first (has proper compat settings)
      // @ts-expect-error - dynamic model selection
      model = getModel(provider, modelId);

      if (!model && config.baseUrl) {
        // Model not in registry but provider is known — use custom baseUrl as fallback
        model = {
          id: modelId,
          name: modelId,
          api: "openai-completions" as const,
          provider: provider,
          baseUrl: config.baseUrl,
          reasoning: false,
          input: ["text", "image"],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 128000,
          maxTokens: 16384,
        };
      }
    } else if (config.baseUrl) {
      // Non-built-in provider with custom baseUrl
      model = {
        id: modelId,
        name: modelId,
        api: "openai-completions" as const,
        provider: provider,
        baseUrl: config.baseUrl,
        reasoning: false,
        input: ["text", "image"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 16384,
      };
    } else {
      // For non-built-in providers without baseUrl
      throw new Error(
        `Provider ${provider} requires baseUrl for OpenAI-compatible API, or use one of: ${BUILTIN_PROVIDERS.join(", ")}`
      );
    }

    if (!model) {
      throw new Error(
        `Model not found: ${provider}/${modelId}. Try a different model or configure baseUrl.`
      );
    }

    // Build system prompt with user profile + memory
    const memoryManager = getMemoryManager();
    if (this.userUuid) {
      memoryManager.ensureUser(this.userUuid);
    }
    const skillOptions = config.profile?.skills?.excludeTypes
      ? { excludeTypes: config.profile.skills.excludeTypes }
      : undefined;
    const contextOptions = config.profile
      ? {
          memory: config.profile.context.memory,
          profile: config.profile.context.profile,
          bootstrap: config.profile.context.bootstrap,
        }
      : undefined;
    const systemPrompt = this.userUuid
      ? memoryManager.buildSystemPrompt(
          this.userUuid,
          healthContext,
          weatherContext,
          skillOptions,
          contextOptions
        )
      : memoryManager.buildSystemPrompt(
          "anonymous",
          healthContext,
          weatherContext,
          skillOptions,
          contextOptions
        );

    // Build LLM config for compaction summarization
    const llmConfig: LLMSummarizationConfig = {
      provider: provider,
      modelId: modelId,
      apiKey: apiKey,
      baseUrl: config.baseUrl,
      api: model.api,
    };

    // Compaction flush: save context to memory before truncation
    const compactionFlush = createCompactionFlush(
      {
        contextWindow: model.contextWindow || 128000,
        reserveTokens: 20000,
        flushThreshold: 4000,
      },
      memoryManager,
      this.userUuid || "anonymous",
      llmConfig,
      config.sessionId
    );

    // Use per-session tools when a user-specific data source is provided
    let registry = config.dataSource
      ? globalRegistry.withDataSource(config.dataSource)
      : globalRegistry;

    // Bind session user UUID to all tools so getUserUuid() returns the correct UUID
    if (this.userUuid) {
      registry = registry.withUserUuid(this.userUuid);
    }

    const defaultCategories: ToolCategory[] = [
      "health",
      "memory",
      "profile",
      "config",
      "skill",
      "presentation",
      "planning",
      "proactive",
    ];
    const baseTools =
      config.tools ||
      registry.toAgentToolsByCategories(config.profile?.tools.categories || defaultCategories);
    const tools =
      config.extraTools && config.extraTools.length > 0
        ? [...baseTools, ...config.extraTools]
        : baseTools;

    // Convert persisted session messages to AgentMessage[] for context recovery
    const messages = config.sessionMessages ? sessionToAgentMessages(config.sessionMessages) : [];

    this.agent = new Agent({
      initialState: {
        systemPrompt,
        model,
        tools,
        ...(messages.length > 0 ? { messages } : {}),
      },
      getApiKey: () => apiKey,
      transformContext: compactionFlush,
      ...config.agentOptions,
    });
  }

  /**
   * Get the user UUID associated with this agent
   */
  getUserUuid(): string | undefined {
    return this.userUuid;
  }

  /**
   * Get the cached health/weather context for reuse by other agent instances.
   */
  getCachedContext(): { healthContext?: string; weatherContext?: string } {
    return {
      healthContext: this._cachedHealthContext,
      weatherContext: this._cachedWeatherContext,
    };
  }

  /**
   * Get the skill hint from the agent's profile, if any.
   */
  getSkillHint(): string | undefined {
    return this.config.profile?.skillHint;
  }

  /**
   * Get the system prompt that was built for this agent.
   * Used by benchmark runner to pass agent context to the Judge.
   */
  getSystemPrompt(): string {
    return this.agent.state.systemPrompt || "";
  }

  private getEnvApiKey(provider: LLMProvider): string | undefined {
    const envKey = ENV_KEY_MAP[provider];
    if (envKey && typeof process !== "undefined" && process.env[envKey]) {
      return process.env[envKey];
    }
    return undefined;
  }

  /**
   * Subscribe to agent events for UI updates.
   */
  subscribe(fn: (event: AgentEvent) => void): () => void {
    return this.agent.subscribe(fn);
  }

  /**
   * Send a message to the agent.
   * Skill loading is LLM-driven: agent scans skill registry in system prompt
   * and calls get_skill() on demand.
   */
  async chat(message: string): Promise<void> {
    await this.agent.prompt(message);
  }

  /**
   * Send a message with a hint to use a specific skill.
   * Used by Evolution Lab to guarantee the evolution-driver skill is loaded.
   */
  async chatWithSkill(message: string, skillName: string): Promise<void> {
    const hint = `[Load skill "${skillName}" via get_skill before responding]\n\n${message}`;
    await this.agent.prompt(hint);
  }

  /**
   * Send a message and wait for the complete response.
   * Returns the final assistant message content.
   */
  async chatAndWait(message: string): Promise<string> {
    let hasError = false;
    let llmErrorMessage = "";
    // Keep only the LAST assistant message to avoid leaking intermediate tool-call text
    let lastAssistantMessage: AgentMessage | null = null;

    const unsubscribe = this.subscribe((event) => {
      if (event.type === "message_end" && event.message.role === "assistant") {
        lastAssistantMessage = event.message;
        // Check for LLM-level errors (e.g. 401, rate limit, model not found)
        const msg = event.message as any;
        if (msg.stopReason === "error" && msg.errorMessage) {
          hasError = true;
          llmErrorMessage = msg.errorMessage;
          log.error("LLM returned error", { errorMessage: msg.errorMessage, model: msg.model });
        }
      }
      // Capture errors for diagnostics
      if ((event as any).type === "error" || (event as any).error) {
        hasError = true;
        log.warn("chatAndWait error event", (event as any).error || event);
      }
    });

    try {
      await this.agent.prompt(message);
      await this.agent.waitForIdle();
    } catch (err) {
      log.warn("chatAndWait prompt/idle error", err);
      throw err;
    } finally {
      unsubscribe();
    }

    // If the LLM returned an error, throw so callers can handle it
    if (llmErrorMessage) {
      throw new Error(`LLM error: ${llmErrorMessage}`);
    }

    // Extract text from the last assistant message only
    let finalContent = "";
    if (lastAssistantMessage) {
      for (const block of (lastAssistantMessage as any).content) {
        if (block.type === "text") {
          finalContent += block.text;
        }
      }
    }

    if (!finalContent && hasError) {
      log.warn("chatAndWait completed with empty response and errors");
    }

    return finalContent;
  }

  /**
   * Send a message and wait for the complete response + tool calls.
   * Returns both the final text and any tool call details.
   */
  async chatAndWaitWithTools(message: string): Promise<{
    response: string;
    toolCalls: Array<{ tool: string; arguments: unknown; result: unknown }>;
  }> {
    // Keep only the LAST assistant message to avoid leaking intermediate tool-call text
    let lastAssistantMessage: AgentMessage | null = null;
    let llmErrorMessage = "";
    const toolCalls: Array<{ tool: string; arguments: unknown; result: unknown }> = [];
    let pendingToolName = "";
    let pendingToolArgs: unknown = undefined;

    const unsubscribe = this.subscribe((event) => {
      if (event.type === "message_end" && event.message.role === "assistant") {
        lastAssistantMessage = event.message;
        // Check for LLM-level errors (e.g. 401, rate limit, model not found)
        const msg = event.message as any;
        if (msg.stopReason === "error" && msg.errorMessage) {
          llmErrorMessage = msg.errorMessage;
          log.error("LLM returned error", { errorMessage: msg.errorMessage, model: msg.model });
        }
      }
      if (event.type === "tool_execution_start") {
        pendingToolName = (event as any).toolName || "";
        pendingToolArgs = (event as any).arguments;
      }
      if (event.type === "tool_execution_end") {
        toolCalls.push({
          tool: pendingToolName || (event as any).toolName || "unknown",
          arguments: pendingToolArgs,
          result: (event as any).result,
        });
      }
    });

    try {
      await this.agent.prompt(message);
      await this.agent.waitForIdle();
    } finally {
      unsubscribe();
    }

    // If the LLM returned an error, throw so callers can handle it
    if (llmErrorMessage) {
      throw new Error(`LLM error: ${llmErrorMessage}`);
    }

    // Extract text from the last assistant message only
    let finalContent = "";
    if (lastAssistantMessage) {
      for (const block of (lastAssistantMessage as any).content) {
        if (block.type === "text") {
          finalContent += block.text;
        }
      }
    }

    if (!finalContent) {
      log.warn("chatAndWaitWithTools completed with empty response", {
        hasLastAssistantMessage: !!lastAssistantMessage,
        toolCallCount: toolCalls.length,
      });
    }

    return { response: finalContent, toolCalls };
  }

  /**
   * Get the current conversation messages.
   */
  getMessages(): AgentMessage[] {
    return this.agent.state.messages;
  }

  /**
   * Check if the agent is currently processing.
   */
  isStreaming(): boolean {
    return this.agent.state.isStreaming;
  }

  /**
   * Abort the current operation.
   */
  abort(): void {
    this.agent.abort();
  }

  /**
   * Reset the conversation.
   */
  reset(): void {
    this.agent.reset();
  }

  /**
   * Get the underlying pi-agent instance for advanced usage.
   */
  getAgent(): Agent {
    return this.agent;
  }
}

/**
 * Activity-based timeout for streaming LLM calls.
 * Resets inactivity timer on every AgentEvent.
 * Only times out when the agent goes silent for `inactivityMs`.
 * Hard max as final safety net.
 */
export async function withActivityTimeout<T>(
  agent: PHAAgent,
  operation: () => Promise<T>,
  opts?: { inactivityMs?: number; hardMaxMs?: number }
): Promise<T> {
  const inactivityMs = opts?.inactivityMs ?? 60_000;
  const hardMaxMs = opts?.hardMaxMs ?? 300_000;

  return new Promise<T>((resolve, reject) => {
    let inactivityTimer: ReturnType<typeof setTimeout>;
    let hardTimer: ReturnType<typeof setTimeout>;
    let settled = false;

    const cleanup = () => {
      clearTimeout(inactivityTimer);
      clearTimeout(hardTimer);
      unsubscribe();
    };

    const fail = (reason: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      agent.abort();
      reject(new Error(reason));
    };

    const resetInactivity = () => {
      clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(
        () => fail(`Agent inactivity timeout (no events for ${inactivityMs / 1000}s)`),
        inactivityMs
      );
    };

    const unsubscribe = agent.subscribe(() => {
      resetInactivity();
    });

    resetInactivity();
    hardTimer = setTimeout(() => fail(`Agent hard timeout (${hardMaxMs / 1000}s max)`), hardMaxMs);

    operation().then(
      (result) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(result);
      },
      (err) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(err);
      }
    );
  });
}

/**
 * Create a PHA Agent instance with environment-based configuration.
 * Pre-computes health context for immediate availability in first turn.
 */
export async function createPHAAgent(config: PHAAgentConfig = {}): Promise<PHAAgent> {
  // Try to get API key from environment if not provided
  if (!config.apiKey) {
    const provider = config.provider || "anthropic";
    const envKey = ENV_KEY_MAP[provider];
    if (envKey && typeof process !== "undefined" && process.env[envKey]) {
      config.apiKey = process.env[envKey];
    }
  }

  let healthContext: string | undefined;
  let weatherContext: string | undefined;

  if (config.cachedContext) {
    // Fast path: reuse cached context (~0ms)
    healthContext = config.cachedContext.healthContext;
    weatherContext = config.cachedContext.weatherContext;
  } else {
    // Slow path: compute from scratch (2-5s)
    const profile = config.profile;
    const needsHealth = profile ? profile.context.health !== false : true;
    const needsWeather = profile ? profile.context.weather !== false : true;
    [healthContext, weatherContext] = await Promise.all([
      needsHealth ? preComputeHealthContext(config.dataSource, config.userUuid) : undefined,
      needsWeather ? fetchWeatherContext(config.userUuid) : undefined,
    ]);
  }

  return new PHAAgent(config, healthContext, weatherContext);
}
