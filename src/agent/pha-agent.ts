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
  getUserUuid,
  type LLMProvider,
  DEFAULT_MODELS,
  ENV_KEY_MAP,
  BUILTIN_PROVIDERS,
} from "../utils/config.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("Agent/PHA");
import { preComputeHealthContext } from "./health-context.js";
// Skill loading is now LLM-driven via system prompt skill registry + get_skill tool.
// No regex trigger injection.
import { sessionToAgentMessages } from "../memory/session-store.js";

export type { LLMProvider } from "../utils/config.js";

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
}

// LLMProvider, DEFAULT_MODELS, ENV_KEY_MAP, BUILTIN_PROVIDERS imported from config.ts

export class PHAAgent {
  private agent: Agent;
  private config: PHAAgentConfig;
  private userUuid?: string;

  constructor(config: PHAAgentConfig = {}, healthContext?: string) {
    this.config = config;
    this.userUuid = config.userUuid || getUserUuid();

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

    // Build system prompt with memory and pre-computed health context
    const memoryManager = getMemoryManager();
    memoryManager.ensureUser(this.userUuid);
    const systemPrompt = memoryManager.buildSystemPrompt(this.userUuid, healthContext);

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
      this.userUuid,
      llmConfig,
      config.sessionId
    );

    // Use per-session tools when a user-specific data source is provided
    const registry = config.dataSource
      ? globalRegistry.withDataSource(config.dataSource)
      : globalRegistry;
    const baseTools = config.tools || registry.toAgentTools();
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

  // Pre-compute recent health data context (best-effort, use user-specific source if available)
  const healthContext = await preComputeHealthContext(config.dataSource);

  return new PHAAgent(config, healthContext);
}
