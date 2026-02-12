/**
 * System Agent
 *
 * A standalone Agent instance dedicated to evolution tasks.
 * Uses Agent from pi-agent-core directly — NOT PHAAgent.
 *
 * Key differences from PHAAgent:
 * - Own system prompt focused on evolution/coding tasks
 * - No health context, no memory system, no SOUL.md
 * - No compaction flush (evolution sessions are short-lived)
 * - Tools: git, benchmark/diagnose, claude_code, get_skill
 */

import { Agent, type AgentEvent, type AgentMessage } from "@mariozechner/pi-agent-core";
import { getModel, type Model } from "@mariozechner/pi-ai";
import { gitAgentTools } from "./git-agent-tools.js";
import { claudeCodeAgentTool } from "./claude-code-tool.js";
import { getSkillAgentTool } from "./tools.js";
import { enrichWithForcedSkill, enrichWithSkills } from "./skill-trigger.js";
import type { LLMProvider } from "./pha-agent.js";

export interface SystemAgentConfig {
  apiKey?: string;
  provider?: LLMProvider;
  modelId?: string;
  baseUrl?: string;
}

const DEFAULT_MODELS: Record<LLMProvider, string> = {
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

const BUILTIN_PROVIDERS: LLMProvider[] = [
  "anthropic",
  "openai",
  "google",
  "openrouter",
  "groq",
  "mistral",
  "xai",
];

const SYSTEM_PROMPT = `You are the **Evolution Agent** — a specialized AI that improves the PHA (Personal Health Agent) system through a structured evolution pipeline.

## Your Role

You drive the self-evolution cycle: benchmark the current agent, diagnose weaknesses, propose improvements, apply changes in git worktrees, and validate results. You are NOT a health assistant — you are a software engineering agent focused on measuring and improving agent quality.

## Capabilities

You have access to:
- **Git tools**: Create branches, commit, merge, diff, review changes
- **Benchmark tools**: Run benchmarks to measure agent quality across 5 dimensions (Health Data Analysis, Health Coaching, Safety & Boundaries, Personalization & Memory, Communication Quality)
- **Diagnose tools**: Analyze benchmark results to find weaknesses and suggest improvements
- **Claude Code**: Execute coding tasks (edit prompts, skills, code) in git worktrees
- **Skill tools**: Read skill definitions for reference

## Interaction Style

- Be concise and action-oriented
- Show data (scores, diffs, file changes) when available
- Always explain what you're about to do before doing it
- For destructive operations (merge, delete branch), ask for explicit user confirmation
- When proposing changes, explain the rationale and expected impact

## Important

- All code changes happen in git worktrees — never modify the main branch directly
- The evolution-driver skill guide will be injected with each message — follow its pipeline methodology
- Present benchmark scores clearly so users can track progress`;

/**
 * SystemAgent — wraps pi-agent-core Agent with evolution-specific configuration.
 * Provides the same interface methods that server.ts expects.
 */
export class SystemAgent {
  private agent: Agent;

  constructor(config: SystemAgentConfig) {
    const provider = config.provider || "anthropic";
    const modelId = config.modelId || DEFAULT_MODELS[provider];
    const apiKey = config.apiKey || this.getEnvApiKey(provider);

    if (!apiKey) {
      throw new Error(
        `API key required for provider: ${provider}. Set ${ENV_KEYS[provider]} or provide apiKey in config.`
      );
    }

    const model = this.resolveModel(provider, modelId, config.baseUrl);

    const tools = [...gitAgentTools, claudeCodeAgentTool, getSkillAgentTool];

    this.agent = new Agent({
      initialState: {
        systemPrompt: SYSTEM_PROMPT,
        model,
        tools,
      },
      getApiKey: () => apiKey,
    });
  }

  private getEnvApiKey(provider: LLMProvider): string | undefined {
    const envKey = ENV_KEYS[provider];
    if (envKey && typeof process !== "undefined" && process.env[envKey]) {
      return process.env[envKey];
    }
    return undefined;
  }

  private resolveModel(provider: LLMProvider, modelId: string, baseUrl?: string): Model<any> {
    let model: Model<any> | undefined;

    if (BUILTIN_PROVIDERS.includes(provider)) {
      // @ts-expect-error - dynamic model selection
      model = getModel(provider, modelId);

      if (!model && baseUrl) {
        model = {
          id: modelId,
          name: modelId,
          api: "openai-completions" as const,
          provider: provider,
          baseUrl,
          reasoning: false,
          input: ["text", "image"],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 128000,
          maxTokens: 16384,
        };
      }
    } else if (baseUrl) {
      model = {
        id: modelId,
        name: modelId,
        api: "openai-completions" as const,
        provider: provider,
        baseUrl,
        reasoning: false,
        input: ["text", "image"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 16384,
      };
    } else {
      throw new Error(
        `Provider ${provider} requires baseUrl for OpenAI-compatible API, or use one of: ${BUILTIN_PROVIDERS.join(", ")}`
      );
    }

    if (!model) {
      throw new Error(
        `Model not found: ${provider}/${modelId}. Try a different model or configure baseUrl.`
      );
    }

    return model;
  }

  /**
   * Subscribe to agent events for UI updates.
   */
  subscribe(fn: (event: AgentEvent) => void): () => void {
    return this.agent.subscribe(fn);
  }

  /**
   * Send a message with a specific skill force-injected.
   */
  async chatWithSkill(message: string, skillName: string): Promise<void> {
    const enriched = enrichWithForcedSkill(message, skillName);
    await this.agent.prompt(enriched);
  }

  /**
   * Send a message with auto skill matching.
   */
  async chat(message: string): Promise<void> {
    const enriched = enrichWithSkills(message);
    await this.agent.prompt(enriched);
  }

  /**
   * Send a message and wait for the complete response.
   */
  async chatAndWait(message: string): Promise<string> {
    let finalContent = "";

    const unsubscribe = this.subscribe((event) => {
      if (event.type === "message_end" && event.message.role === "assistant") {
        for (const block of event.message.content) {
          if (block.type === "text") {
            finalContent += block.text;
          }
        }
      }
    });

    try {
      const enriched = enrichWithSkills(message);
      await this.agent.prompt(enriched);
      await this.agent.waitForIdle();
    } finally {
      unsubscribe();
    }

    return finalContent;
  }

  /**
   * Get the underlying pi-agent-core Agent instance.
   */
  getAgent(): Agent {
    return this.agent;
  }

  /**
   * Get conversation messages.
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
   * Reset the conversation.
   */
  reset(): void {
    this.agent.reset();
  }

  /**
   * Abort the current operation.
   */
  abort(): void {
    this.agent.abort();
  }
}

/**
 * Create a SystemAgent instance.
 */
export function createSystemAgent(config: SystemAgentConfig): SystemAgent {
  return new SystemAgent(config);
}
