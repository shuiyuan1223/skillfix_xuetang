/**
 * PHA Agent
 *
 * Main agent class that wraps pi-agent with health-specific configuration.
 */

import { Agent, type AgentOptions, type AgentEvent, type AgentMessage } from "@mariozechner/pi-agent-core";
import { getModel, type Model, type KnownProvider } from "@mariozechner/pi-ai";
import { healthAgentTools } from "./tools.js";
import { getSystemPrompt } from "./system-prompt.js";

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

export interface PHAAgentConfig {
  /** LLM provider (default: "anthropic") */
  provider?: LLMProvider;
  /** Model ID (default: provider's default) */
  modelId?: string;
  /** API Key (required for most providers) */
  apiKey?: string;
  /** Base URL for OpenAI-compatible APIs (not used for built-in providers) */
  baseUrl?: string;
  /** Additional agent options */
  agentOptions?: Partial<AgentOptions>;
}

const DEFAULT_MODELS: Record<LLMProvider, string> = {
  anthropic: "claude-sonnet-4-20250514",
  openai: "gpt-4o",
  google: "gemini-2.0-flash",
  openrouter: "openrouter/auto",
  moonshot: "moonshot-v1-128k", // Not built-in, needs custom handling
  deepseek: "deepseek-chat",    // Not built-in, needs custom handling
  groq: "llama-3.3-70b-versatile",
  mistral: "mistral-large-latest",
  xai: "grok-2-1212",
};

const ENV_KEYS: Record<LLMProvider, string> = {
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

// Providers that are built into pi-ai
const BUILTIN_PROVIDERS: LLMProvider[] = [
  "anthropic",
  "openai",
  "google",
  "openrouter",
  "groq",
  "mistral",
  "xai",
];

export class PHAAgent {
  private agent: Agent;
  private config: PHAAgentConfig;

  constructor(config: PHAAgentConfig = {}) {
    this.config = config;

    const provider = config.provider || "anthropic";
    const modelId = config.modelId || DEFAULT_MODELS[provider];
    const apiKey = config.apiKey || this.getEnvApiKey(provider);

    if (!apiKey) {
      throw new Error(`API key required for provider: ${provider}. Set ${ENV_KEYS[provider]} or provide apiKey in config.`);
    }

    let model: Model<any>;

    if (BUILTIN_PROVIDERS.includes(provider)) {
      // Use built-in pi-ai provider
      try {
        // @ts-expect-error - dynamic model selection
        model = getModel(provider, modelId);
      } catch (e) {
        throw new Error(`Model not found: ${provider}/${modelId}. Error: ${e}`);
      }
    } else {
      // For non-built-in providers, we'd need to use OpenAI-compatible API
      // For now, throw an error - these need custom implementation
      throw new Error(`Provider ${provider} is not yet supported. Use one of: ${BUILTIN_PROVIDERS.join(", ")}`);
    }

    if (!model) {
      throw new Error(`Model not found: ${provider}/${modelId}`);
    }

    this.agent = new Agent({
      initialState: {
        systemPrompt: getSystemPrompt(),
        model,
        tools: healthAgentTools,
      },
      getApiKey: () => apiKey,
      ...config.agentOptions,
    });
  }

  private getEnvApiKey(provider: LLMProvider): string | undefined {
    const envKey = ENV_KEYS[provider];
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
   */
  async chat(message: string): Promise<void> {
    await this.agent.prompt(message);
  }

  /**
   * Send a message and wait for the complete response.
   * Returns the final assistant message content.
   */
  async chatAndWait(message: string): Promise<string> {
    let finalContent = "";

    const unsubscribe = this.subscribe((event) => {
      if (event.type === "message_end" && event.message.role === "assistant") {
        const content = event.message.content;
        for (const block of content) {
          if (block.type === "text") {
            finalContent += block.text;
          }
        }
      }
    });

    try {
      await this.agent.prompt(message);
      await this.agent.waitForIdle();
    } finally {
      unsubscribe();
    }

    return finalContent;
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
 */
export function createPHAAgent(config: PHAAgentConfig = {}): PHAAgent {
  // Try to get API key from environment if not provided
  if (!config.apiKey) {
    const provider = config.provider || "anthropic";
    const envKey = ENV_KEYS[provider];
    if (envKey && typeof process !== "undefined" && process.env[envKey]) {
      config.apiKey = process.env[envKey];
    }
  }

  return new PHAAgent(config);
}
