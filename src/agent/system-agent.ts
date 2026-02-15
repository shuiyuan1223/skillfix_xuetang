/**
 * System Agent
 *
 * A standalone Agent instance for system management and evolution tasks.
 * Uses Agent from pi-agent-core directly — NOT PHAAgent.
 *
 * Key differences from PHAAgent:
 * - Own system prompt loaded from src/prompts/system-agent/ (SOUL.md + AGENTS.md)
 * - Own memory system (.pha/system-agent/)
 * - File operation tools (read, grep, find, bash) for lightweight inspection
 * - Tool feedback mechanism for identifying capability gaps
 * - No health context, no user memory, no compaction flush
 * - Tools: git, benchmark/diagnose, claude_code, file ops, memory, skills, tool feedback
 */

import { Agent, type AgentEvent, type AgentMessage } from "@mariozechner/pi-agent-core";
import { getModel, type Model } from "@mariozechner/pi-ai";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { globalRegistry } from "../tools/index.js";
import { claudeCodeAgentTool } from "./claude-code-tool.js";
import { fileAgentTools } from "./file-tools.js";
import { enrichWithForcedSkill, enrichWithSkills } from "./skill-trigger.js";
import { sessionToAgentMessages } from "../memory/session-store.js";
import { createSACompactionFlush } from "../memory/compaction.js";
import { readMemoryFile, appendMemoryFile } from "../tools/system-memory-tools.js";
import {
  type LLMProvider,
  DEFAULT_MODELS,
  ENV_KEY_MAP,
  BUILTIN_PROVIDERS,
} from "../utils/config.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("Agent/System");

export interface SystemAgentConfig {
  apiKey?: string;
  provider?: LLMProvider;
  modelId?: string;
  baseUrl?: string;
  /** Prior chat messages to restore context after restart */
  sessionMessages?: Array<{ role: string; content: string; timestamp?: number }>;
}

// LLMProvider, DEFAULT_MODELS, ENV_KEY_MAP, BUILTIN_PROVIDERS imported from config.ts

// Fallback prompt if SOUL.md file cannot be loaded
const FALLBACK_PROMPT = `你是 PHA 系统 Agent，负责管理和进化 PHA 系统。始终使用中文回复。`;

/**
 * Load all SystemAgent prompt files from src/prompts/system-agent/
 * Priority order: SOUL.md, AGENTS.md, then alphabetical.
 */
function loadSystemAgentPrompt(): string {
  const dir = join("src", "prompts", "system-agent");
  try {
    if (!existsSync(dir)) {
      log.warn("system-agent prompts dir not found, using fallback");
      return FALLBACK_PROMPT;
    }

    const ordered = ["SOUL.md", "IDENTITY.md", "AGENTS.md", "TOOLS.md", "HEARTBEAT.md"];
    const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
    const sections: string[] = [];

    // Load priority files first
    for (const name of ordered) {
      if (name === "TOOLS.md" && !files.includes(name)) {
        // Auto-generate TOOLS.md from registry if file doesn't exist
        const toolsPrompt = globalRegistry.generateToolsPrompt([
          "git",
          "evolution",
          "system",
          "feedback",
          "skill",
        ]);
        if (toolsPrompt) sections.push(toolsPrompt);
        continue;
      }
      if (files.includes(name)) {
        const content = readFileSync(join(dir, name), "utf-8").trim();
        if (content) sections.push(content);
      }
    }

    // Load remaining files alphabetically
    for (const file of files.sort()) {
      if (!ordered.includes(file)) {
        const content = readFileSync(join(dir, file), "utf-8").trim();
        if (content) sections.push(content);
      }
    }

    if (sections.length === 0) {
      log.warn("No prompt files found, using fallback");
      return FALLBACK_PROMPT;
    }

    return sections.join("\n\n---\n\n");
  } catch {
    log.warn("Failed to load system-agent prompts, using fallback");
    return FALLBACK_PROMPT;
  }
}

/** Memory budget: max characters per memory file */
const SA_MEMORY_BUDGET = {
  memory: 3000,
  evolutionLog: 3000,
  experience: 2000,
  total: 8000,
};

/**
 * Build SystemAgent system prompt with memory injection.
 * Loads SOUL.md + recent memory.md / evolution-log.md / experience.md.
 */
function buildSASystemPrompt(): string {
  const soul = loadSystemAgentPrompt();

  // Load memory files (tail to get most recent content)
  const memoryRaw = readMemoryFile("memory.md");
  const evolutionRaw = readMemoryFile("evolution-log.md");
  const experienceRaw = readMemoryFile("experience.md");

  const tailSlice = (text: string, maxChars: number): string => {
    if (!text || text.length <= maxChars) return text;
    return "...\n" + text.slice(-maxChars);
  };

  const memory = tailSlice(memoryRaw, SA_MEMORY_BUDGET.memory);
  const evolution = tailSlice(evolutionRaw, SA_MEMORY_BUDGET.evolutionLog);
  const experience = tailSlice(experienceRaw, SA_MEMORY_BUDGET.experience);

  const hasMemory = memory || evolution || experience;
  if (!hasMemory) return soul;

  const today = new Date().toISOString().split("T")[0];
  const sections: string[] = [soul, "\n---\n", `## Session Context\n\n- **Date**: ${today}\n`];

  if (memory) {
    sections.push(`## System Memory\n\n${memory}\n`);
  }
  if (evolution) {
    sections.push(`## Evolution Log (recent)\n\n${evolution}\n`);
  }
  if (experience) {
    sections.push(`## Recent Experience\n\n${experience}\n`);
  }

  const prompt = sections.join("\n");

  // Token distribution report (debug)
  const est = (s: string) => Math.ceil(s.length / 4);
  log.debug(
    `Token distribution: soul=${est(soul)} memory=${est(memory)} evolution=${est(evolution)} experience=${est(experience)} total≈${est(prompt)}`
  );

  return prompt;
}

// ========================================================================
// No more hand-written AgentTool adapters — globalRegistry auto-derives them
// ========================================================================

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
        `API key required for provider: ${provider}. Set ${ENV_KEY_MAP[provider]} or provide apiKey in config.`
      );
    }

    const model = this.resolveModel(provider, modelId, config.baseUrl);

    // Load system prompt from file + inject memory context
    const systemPrompt = buildSASystemPrompt();

    // Assemble tools: registry-derived + standalone tools
    const tools: AgentTool<any>[] = [
      ...globalRegistry.toAgentToolsByCategories([
        "git",
        "evolution",
        "system",
        "feedback",
        "skill",
      ]),
      claudeCodeAgentTool,
      ...fileAgentTools,
    ];

    // Convert persisted session messages to AgentMessage[] for context recovery
    const messages = config.sessionMessages ? sessionToAgentMessages(config.sessionMessages) : [];

    // SA compaction: save summary + transcript to memory files before truncation
    const compactionFlush = createSACompactionFlush({
      contextWindow: model.contextWindow || 128000,
      reserveTokens: 20000,
      flushThreshold: 4000,
      onFlush: (summary, transcript) => {
        const timestamp = new Date().toISOString().slice(0, 19).replace("T", " ");
        appendMemoryFile(
          "memory.md",
          `\n## ${timestamp} (auto-saved before compaction)\n\n${summary}\n`
        );
        appendMemoryFile(
          "experience.md",
          `\n## ${timestamp} (conversation transcript)\n\n${transcript}\n`
        );
      },
    });

    this.agent = new Agent({
      initialState: {
        systemPrompt,
        model,
        tools,
        ...(messages.length > 0 ? { messages } : {}),
      },
      getApiKey: () => apiKey,
      transformContext: compactionFlush,
    });
  }

  private getEnvApiKey(provider: LLMProvider): string | undefined {
    const envKey = ENV_KEY_MAP[provider];
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
