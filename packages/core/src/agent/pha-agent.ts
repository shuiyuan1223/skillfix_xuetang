/**
 * PHA Agent
 *
 * Main agent class that wraps pi-agent with health-specific configuration.
 */

import { Agent, type AgentOptions, type AgentEvent, type AgentMessage } from "@mariozechner/pi-agent-core";
import { getModel, type Model } from "@mariozechner/pi-ai";
import { healthAgentTools } from "./tools.js";
import { getSystemPrompt } from "./system-prompt.js";

export interface PHAAgentConfig {
  /** LLM provider (default: "anthropic") */
  provider?: "anthropic" | "openai" | "google";
  /** Model ID (default: provider's default) */
  modelId?: string;
  /** API Key (required for most providers) */
  apiKey?: string;
  /** Additional agent options */
  agentOptions?: Partial<AgentOptions>;
}

const DEFAULT_MODELS: Record<string, string> = {
  anthropic: "claude-sonnet-4-20250514",
  openai: "gpt-4o",
  google: "gemini-2.5-flash-lite-preview-06-17",
};

export class PHAAgent {
  private agent: Agent;
  private config: PHAAgentConfig;

  constructor(config: PHAAgentConfig = {}) {
    this.config = config;

    const provider = config.provider || "anthropic";
    const modelId = config.modelId || DEFAULT_MODELS[provider];
    const model = getModel(provider as any, modelId as any) as Model<any>;

    if (!model) {
      throw new Error(`Model not found: ${provider}/${modelId}`);
    }

    this.agent = new Agent({
      initialState: {
        systemPrompt: getSystemPrompt(),
        model,
        tools: healthAgentTools,
      },
      getApiKey: config.apiKey ? () => config.apiKey : undefined,
      ...config.agentOptions,
    });
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
    const envKeys: Record<string, string> = {
      anthropic: "ANTHROPIC_API_KEY",
      openai: "OPENAI_API_KEY",
      google: "GOOGLE_API_KEY",
    };
    const envKey = envKeys[provider];
    if (envKey && typeof process !== "undefined" && process.env[envKey]) {
      config.apiKey = process.env[envKey];
    }
  }

  return new PHAAgent(config);
}
