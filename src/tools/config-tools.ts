/**
 * Config Management MCP Tools
 *
 * Tools for reading and updating .pha/config.json via the Agent.
 * Follows AgentOS pattern: all system operations are MCP-ized.
 */

import { loadConfig, saveConfig, PROVIDER_CONFIGS, listAllModelRefs } from "../utils/config.js";

/**
 * MCP Tool: get_config
 * Returns the current config (with API key masked).
 */
export const getConfigTool = {
  name: "get_config",
  description: "Read the current PHA configuration (.pha/config.json). API keys are masked.",
  parameters: {
    type: "object" as const,
    properties: {
      section: {
        type: "string",
        description:
          "Optional section to read: 'llm', 'gateway', 'dataSources', 'embedding', 'all'",
        enum: ["llm", "gateway", "dataSources", "embedding", "all"],
      },
    },
  },
  execute: async (args: { section?: string }) => {
    const config = loadConfig();
    const section = args.section || "all";

    const maskKey = (key?: string) => (key ? `${key.slice(0, 6)}...${key.slice(-4)}` : undefined);

    if (section === "llm" || section === "all") {
      const llmCopy = { ...config.llm, apiKey: maskKey(config.llm.apiKey) };
      if (section === "llm") return llmCopy;
    }

    // Mask API keys in models.providers
    let maskedModels = config.models;
    if (config.models?.providers) {
      maskedModels = {
        providers: Object.fromEntries(
          Object.entries(config.models.providers).map(([key, pCfg]) => [
            key,
            { ...pCfg, apiKey: maskKey(pCfg.apiKey) },
          ])
        ),
      };
    }

    const safe = {
      ...config,
      llm: { ...config.llm, apiKey: maskKey(config.llm.apiKey) },
      ...(maskedModels ? { models: maskedModels } : {}),
    };

    if (section === "all") return safe;

    return (safe as Record<string, unknown>)[section] ?? {};
  },
};

/**
 * MCP Tool: update_config
 * Updates specific config fields.
 */
export const updateConfigTool = {
  name: "update_config",
  description:
    "Update PHA configuration fields. Changes are written to .pha/config.json immediately. " +
    "Use dot-notation paths like 'llm.provider', 'gateway.port', 'dataSources.type'. " +
    "Available LLM providers: anthropic, openai, google, openrouter, groq, mistral, xai.",
  parameters: {
    type: "object" as const,
    properties: {
      updates: {
        type: "object",
        description:
          "Key-value pairs to update. Keys use dot-notation (e.g. 'llm.provider', 'llm.apiKey', 'gateway.port').",
        additionalProperties: true,
      },
    },
    required: ["updates"],
  },
  execute: async (args: { updates: Record<string, unknown> }) => {
    const config = loadConfig();

    for (const [path, value] of Object.entries(args.updates)) {
      const parts = path.split(".");
      let current: Record<string, unknown> = config as unknown as Record<string, unknown>;

      for (let i = 0; i < parts.length - 1; i++) {
        if (current[parts[i]] === undefined || typeof current[parts[i]] !== "object") {
          current[parts[i]] = {};
        }
        current = current[parts[i]] as Record<string, unknown>;
      }

      const lastKey = parts[parts.length - 1];

      // Type coercion
      let coerced: unknown = value;
      if (coerced === "true") coerced = true;
      else if (coerced === "false") coerced = false;
      else if (typeof coerced === "string" && !isNaN(Number(coerced)) && coerced.trim() !== "") {
        coerced = Number(coerced);
      }

      current[lastKey] = coerced;
    }

    saveConfig(config);

    return { updated: Object.keys(args.updates) };
  },
};

/**
 * MCP Tool: list_providers
 * Lists available LLM providers with their details.
 */
export const listProvidersTool = {
  name: "list_providers",
  description:
    "List all supported LLM providers with their default models and environment variable names.",
  parameters: { type: "object" as const, properties: {} },
  execute: async () => {
    const config = loadConfig();
    const modelRefs = listAllModelRefs(config);
    return {
      knownProviders: Object.entries(PROVIDER_CONFIGS).map(([key, cfg]) => ({
        id: key,
        name: cfg.name,
        defaultModel: cfg.defaultModel,
        envVar: cfg.envVar,
        baseUrl: cfg.baseUrl || "(default)",
        hint: cfg.hint,
      })),
      configuredModels: modelRefs,
      agentModel: config.agentModel,
      judgeModel: typeof config.judgeModel === "string" ? config.judgeModel : undefined,
      embeddingModel: config.embeddingModel,
    };
  },
};

/** All config tools for bulk registration */
export const configTools = [getConfigTool, updateConfigTool, listProvidersTool];
