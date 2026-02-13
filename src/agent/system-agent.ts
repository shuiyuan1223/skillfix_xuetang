/**
 * System Agent
 *
 * A standalone Agent instance for system management and evolution tasks.
 * Uses Agent from pi-agent-core directly — NOT PHAAgent.
 *
 * Key differences from PHAAgent:
 * - Own system prompt loaded from src/prompts/system-agent/SOUL.md
 * - Own memory system (.pha/system-agent/)
 * - File operation tools (read, grep, find, bash) for lightweight inspection
 * - Tool feedback mechanism for identifying capability gaps
 * - No health context, no user memory, no compaction flush
 * - Tools: git, benchmark/diagnose, claude_code, file ops, memory, skills, tool feedback
 */

import { Agent, type AgentEvent, type AgentMessage } from "@mariozechner/pi-agent-core";
import { getModel, type Model } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";
import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { gitAgentTools } from "./git-agent-tools.js";
import { claudeCodeAgentTool } from "./claude-code-tool.js";
import { getSkillAgentTool } from "./tools.js";
import { fileAgentTools } from "./file-tools.js";
import { enrichWithForcedSkill, enrichWithSkills } from "./skill-trigger.js";
import {
  systemMemoryReadTool,
  systemMemoryWriteTool,
  systemMemoryAppendTool,
  systemMemorySearchTool,
} from "../tools/system-memory-tools.js";
import { suggestToolImprovementTool, listToolWishlistTool } from "../tools/tool-feedback.js";
import { sessionToAgentMessages } from "../memory/session-store.js";
import type { LLMProvider } from "./pha-agent.js";

export interface SystemAgentConfig {
  apiKey?: string;
  provider?: LLMProvider;
  modelId?: string;
  baseUrl?: string;
  /** Prior chat messages to restore context after restart */
  sessionMessages?: Array<{ role: string; content: string; timestamp?: number }>;
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

// Fallback prompt if SOUL.md file cannot be loaded
const FALLBACK_PROMPT = `你是 PHA 系统 Agent，负责管理和进化 PHA 系统。始终使用中文回复。`;

/**
 * Load SystemAgent system prompt from src/prompts/system-agent/SOUL.md
 */
function loadSystemAgentPrompt(): string {
  const soulPath = join("src", "prompts", "system-agent", "SOUL.md");
  try {
    if (existsSync(soulPath)) {
      return readFileSync(soulPath, "utf-8").trim();
    }
  } catch {
    // Fall through to fallback
  }
  console.warn("[SystemAgent] SOUL.md not found, using fallback prompt");
  return FALLBACK_PROMPT;
}

// ========================================================================
// AgentTool adapters for system memory tools
// ========================================================================

const toResult = (data: unknown): AgentToolResult<unknown> => ({
  content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  details: data,
});

const MemoryReadSchema = Type.Object({
  file: Type.String({
    description: "Memory file name: 'memory', 'evolution-log', 'tool-wishlist', or 'experience'",
  }),
});

const MemoryWriteSchema = Type.Object({
  file: Type.String({
    description: "Memory file name: 'memory', 'evolution-log', 'tool-wishlist', or 'experience'",
  }),
  content: Type.String({ description: "Full content to write" }),
});

const MemoryAppendSchema = Type.Object({
  file: Type.String({
    description: "Memory file name: 'memory', 'evolution-log', 'tool-wishlist', or 'experience'",
  }),
  entry: Type.String({ description: "Content to append (will be prefixed with timestamp)" }),
});

const MemorySearchSchema = Type.Object({
  query: Type.String({ description: "Search keyword or phrase" }),
});

const systemMemoryReadAgentTool: AgentTool<typeof MemoryReadSchema> = {
  name: systemMemoryReadTool.name,
  description: systemMemoryReadTool.description,
  label: "Read System Memory",
  parameters: MemoryReadSchema,
  execute: async (_id: string, params: { file: string }) =>
    toResult(await systemMemoryReadTool.execute(params)),
};

const systemMemoryWriteAgentTool: AgentTool<typeof MemoryWriteSchema> = {
  name: systemMemoryWriteTool.name,
  description: systemMemoryWriteTool.description,
  label: "Write System Memory",
  parameters: MemoryWriteSchema,
  execute: async (_id: string, params: { file: string; content: string }) =>
    toResult(await systemMemoryWriteTool.execute(params)),
};

const systemMemoryAppendAgentTool: AgentTool<typeof MemoryAppendSchema> = {
  name: systemMemoryAppendTool.name,
  description: systemMemoryAppendTool.description,
  label: "Append System Memory",
  parameters: MemoryAppendSchema,
  execute: async (_id: string, params: { file: string; entry: string }) =>
    toResult(await systemMemoryAppendTool.execute(params)),
};

const systemMemorySearchAgentTool: AgentTool<typeof MemorySearchSchema> = {
  name: systemMemorySearchTool.name,
  description: systemMemorySearchTool.description,
  label: "Search System Memory",
  parameters: MemorySearchSchema,
  execute: async (_id: string, params: { query: string }) =>
    toResult(await systemMemorySearchTool.execute(params)),
};

// ========================================================================
// AgentTool adapters for tool feedback tools
// ========================================================================

const SuggestToolSchema = Type.Object({
  toolName: Type.String({
    description: "Tool name to improve or suggested new tool name",
  }),
  category: Type.String({
    description: "Category: 'new_tool', 'enhancement', 'bug', 'missing_param'",
  }),
  description: Type.String({ description: "Detailed description" }),
  useCase: Type.String({ description: "Specific use case scenario" }),
  priority: Type.Optional(Type.String({ description: "Priority: 'high', 'medium', 'low'" })),
});

const EmptySchema = Type.Object({});

const suggestToolAgentTool: AgentTool<typeof SuggestToolSchema> = {
  name: suggestToolImprovementTool.name,
  description: suggestToolImprovementTool.description,
  label: "Suggest Tool Improvement",
  parameters: SuggestToolSchema,
  execute: async (
    _id: string,
    params: {
      toolName: string;
      category: string;
      description: string;
      useCase: string;
      priority?: string;
    }
  ) => toResult(await suggestToolImprovementTool.execute(params)),
};

const listWishlistAgentTool: AgentTool<typeof EmptySchema> = {
  name: listToolWishlistTool.name,
  description: listToolWishlistTool.description,
  label: "List Tool Wishlist",
  parameters: EmptySchema,
  execute: async () => toResult(await listToolWishlistTool.execute()),
};

// ========================================================================
// All SystemAgent tools
// ========================================================================

const systemAgentMemoryTools: AgentTool<any>[] = [
  systemMemoryReadAgentTool,
  systemMemoryWriteAgentTool,
  systemMemoryAppendAgentTool,
  systemMemorySearchAgentTool,
];

const toolFeedbackAgentTools: AgentTool<any>[] = [suggestToolAgentTool, listWishlistAgentTool];

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

    // Load system prompt from file
    const systemPrompt = loadSystemAgentPrompt();

    // Assemble all tools
    const tools: AgentTool<any>[] = [
      ...gitAgentTools,
      claudeCodeAgentTool,
      getSkillAgentTool,
      ...fileAgentTools,
      ...systemAgentMemoryTools,
      ...toolFeedbackAgentTools,
    ];

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
    // Keep only the LAST assistant message to avoid leaking intermediate tool-call text
    let lastAssistantMessage: AgentMessage | null = null;

    const unsubscribe = this.subscribe((event) => {
      if (event.type === "message_end" && event.message.role === "assistant") {
        lastAssistantMessage = event.message;
      }
    });

    try {
      const enriched = enrichWithSkills(message);
      await this.agent.prompt(enriched);
      await this.agent.waitForIdle();
    } finally {
      unsubscribe();
    }

    let finalContent = "";
    if (lastAssistantMessage) {
      for (const block of (lastAssistantMessage as any).content) {
        if (block.type === "text") {
          finalContent += block.text;
        }
      }
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
