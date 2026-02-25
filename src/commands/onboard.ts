/**
 * Onboard command - Interactive setup wizard
 *
 * Uses @clack/prompts for beautiful interactive CLI prompts.
 */

import type { Command } from "commander";
import * as p from "@clack/prompts";
import {
  ensureConfigDir,
  saveConfig,
  loadConfig,
  getConfigPath,
  isConfigured,
  PROVIDER_CONFIGS,
  type LLMProvider,
  type PHAConfig,
} from "../utils/config.js";
import { c, icons } from "../utils/cli-ui.js";
import { HuaweiAuth, tokenStore } from "../data-sources/huawei/index.js";

// Default redirect URI for Huawei OAuth (HMS scheme)
const HUAWEI_REDIRECT_URI = "hms://redirect_url";

// API key URLs
const KEY_URLS: Record<string, string> = {
  anthropic: "https://console.anthropic.com/settings/keys",
  openai: "https://platform.openai.com/api-keys",
  google: "https://aistudio.google.com/apikey",
  openrouter: "https://openrouter.ai/keys",
  groq: "https://console.groq.com/keys",
  mistral: "https://console.mistral.ai/api-keys",
  xai: "https://console.x.ai/",
};

/**
 * Handle user cancellation
 */
function handleCancel(value: unknown): never | void {
  if (p.isCancel(value)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }
}

/**
 * Format API key for preview
 */
function formatApiKeyPreview(key: string): string {
  if (key.length <= 12) return "****";
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

/**
 * Setup Huawei Health Kit OAuth
 */
async function setupHuaweiHealth(config: PHAConfig): Promise<boolean> {
  p.note(
    [
      "You'll need:",
      "1. Huawei Developer Account (developer.huawei.com)",
      "2. An app with Health Kit API enabled",
      "3. OAuth 2.0 credentials (Client ID and Secret)",
    ].join("\n"),
    "Huawei Health Kit Setup"
  );

  // Check if already configured
  if (config.dataSources.huawei?.clientId && config.dataSources.huawei?.clientSecret) {
    const useExisting = await p.confirm({
      message: `Use existing credentials? (${formatApiKeyPreview(config.dataSources.huawei.clientId)})`,
      initialValue: true,
    });
    handleCancel(useExisting);

    if (useExisting) {
      if (tokenStore.hasValidToken()) {
        p.log.success("Already authorized");
        return true;
      }
      return authorizeHuawei(config);
    }
  }

  // Get credentials
  const clientId = await p.text({
    message: "Client ID",
    placeholder: "Enter your Huawei Client ID",
  });
  handleCancel(clientId);

  if (!clientId) {
    p.log.warn("Skipping Huawei setup - using mock data");
    config.dataSources.type = "mock";
    return false;
  }

  const clientSecret = await p.password({
    message: "Client Secret",
  });
  handleCancel(clientSecret);

  if (!clientSecret) {
    p.log.warn("Skipping Huawei setup - using mock data");
    config.dataSources.type = "mock";
    return false;
  }

  // Save credentials
  config.dataSources.huawei = {
    clientId: clientId as string,
    clientSecret: clientSecret as string,
  };
  p.log.success("Credentials saved");

  return authorizeHuawei(config);
}

/**
 * Authorize Huawei OAuth flow
 */
async function authorizeHuawei(config: PHAConfig): Promise<boolean> {
  const huaweiConfig = config.dataSources.huawei;
  if (!huaweiConfig?.clientId || !huaweiConfig?.clientSecret) {
    return false;
  }

  const auth = new HuaweiAuth();
  const authUrl = auth.getAuthUrl(huaweiConfig.clientId, HUAWEI_REDIRECT_URI);

  p.note(
    [
      "Step 1: Open this URL in your browser:",
      "",
      authUrl,
      "",
      "Step 2: Log in and authorize the app",
      "Step 3: Copy the 'code' from the redirect URL",
    ].join("\n"),
    "OAuth Authorization"
  );

  const code = await p.text({
    message: "Authorization Code",
    placeholder: "Paste the code from the redirect URL",
  });
  handleCancel(code);

  if (!code) {
    p.log.warn("Authorization skipped - using mock data");
    config.dataSources.type = "mock";
    return false;
  }

  const s = p.spinner();
  s.start("Exchanging code for token...");

  try {
    await auth.exchangeCode(
      code as string,
      huaweiConfig.clientId,
      huaweiConfig.clientSecret,
      HUAWEI_REDIRECT_URI
    );
    s.stop("Authorization successful!");
    return true;
  } catch (error) {
    s.stop("Authorization failed");
    p.log.error(error instanceof Error ? error.message : String(error));
    p.log.warn("Falling back to mock data");
    config.dataSources.type = "mock";
    return false;
  }
}

/**
 * Setup embedding/vector search configuration
 */
async function setupEmbedding(config: PHAConfig): Promise<void> {
  const currentEnabled = config.embedding?.enabled !== false;

  const enabled = await p.confirm({
    message: "Enable vector search for memory?",
    initialValue: currentEnabled,
  });
  handleCancel(enabled);

  if (!enabled) {
    config.embedding = { enabled: false };
    if (config.orchestrator) config.orchestrator.embedding = undefined;
    p.log.success("Vector search disabled");
    return;
  }

  // Use LLM's OpenRouter API key if available
  const hasApiKey = config.llm.provider === "openrouter" && config.llm.apiKey;

  if (!hasApiKey) {
    p.note(
      [
        "Vector search requires OpenRouter API key.",
        "You can use your existing OpenRouter LLM key.",
        "",
        "Get a key from: https://openrouter.ai/keys",
      ].join("\n"),
      "Embedding API"
    );
  }

  // Model selection
  const model = await p.select({
    message: "Embedding model",
    options: [
      {
        value: "openai/text-embedding-3-small",
        label: "text-embedding-3-small (Recommended)",
        hint: "Fast, 1536 dims, $0.02/1M tokens",
      },
      {
        value: "openai/text-embedding-3-large",
        label: "text-embedding-3-large",
        hint: "Higher quality, 3072 dims, $0.13/1M tokens",
      },
      {
        value: "openai/text-embedding-ada-002",
        label: "text-embedding-ada-002",
        hint: "Legacy, 1536 dims",
      },
    ],
    initialValue: config.embedding?.model || "openai/text-embedding-3-small",
  });
  handleCancel(model);

  const modelStr = model as string;
  config.embedding = {
    enabled: true,
    model: modelStr,
  };

  // Sync to unified model repository
  const embParts = modelStr.split("/");
  const embName = embParts[embParts.length - 1];
  // Determine target provider (use orchestrator.pha's provider or first available)
  let embProvider = "openrouter";
  const phaRef = config.orchestrator?.pha;
  if (phaRef) {
    const slashIdx = phaRef.indexOf("/");
    if (slashIdx > 0) embProvider = phaRef.substring(0, slashIdx);
  } else if (config.llm?.provider) {
    embProvider = config.llm.provider;
  }
  // Add model to provider if models.providers exists
  if (config.models?.providers?.[embProvider]) {
    const provModels = config.models.providers[embProvider].models;
    if (!provModels.find((m) => m.model === modelStr)) {
      provModels.push({ name: embName, model: modelStr });
    }
  }
  if (!config.orchestrator) config.orchestrator = {};
  config.orchestrator.embedding = `${embProvider}/${embName}`;

  p.log.success(`Embedding: ${modelStr}`);
}

export function registerOnboardCommand(program: Command): void {
  program
    .command("onboard")
    .description("Interactive configuration wizard")
    .option("--reset", "Start fresh with full setup wizard")
    .action(async (options) => {
      p.intro(`${icons.health} PHA Setup Wizard`);

      // If already configured and no reset flag, show interactive config editor
      if (isConfigured() && !options.reset) {
        const config = loadConfig();

        const action = await p.select({
          message: "Configuration exists. What would you like to do?",
          options: [
            { value: "edit", label: "Edit settings", hint: "Modify existing configuration" },
            { value: "reset", label: "Full reset", hint: "Start fresh" },
            { value: "exit", label: "Exit", hint: "Keep current settings" },
          ],
        });
        handleCancel(action);

        if (action === "exit") {
          p.outro("No changes made.");
          return;
        }

        if (action === "edit") {
          await editConfig(config);
          process.exit(0);
        }

        // Continue to full wizard for reset
      }

      // Full setup wizard
      await runFullWizard();
      process.exit(0);
    });
}

/**
 * Interactive config editor
 */
async function editConfig(config: PHAConfig): Promise<void> {
  let hasChanges = false;

  while (true) {
    const providerCfg = PROVIDER_CONFIGS[config.llm.provider as LLMProvider];

    const choice = await p.select({
      message: "Select setting to edit",
      options: [
        {
          value: "provider",
          label: "LLM Provider",
          hint: providerCfg?.name || config.llm.provider,
        },
        { value: "model", label: "Model", hint: config.llm.modelId || "default" },
        {
          value: "apikey",
          label: "API Key",
          hint: config.llm.apiKey ? "configured" : "from env",
        },
        { value: "port", label: "Gateway Port", hint: String(config.gateway.port) },
        { value: "datasource", label: "Data Source", hint: config.dataSources.type },
        {
          value: "embedding",
          label: "Embedding/Vector Search",
          hint: config.embedding?.enabled !== false ? "enabled" : "disabled",
        },
        { value: "done", label: "Save & Exit", hint: hasChanges ? "Save changes" : "No changes" },
      ],
    });
    handleCancel(choice);

    if (choice === "done") {
      if (hasChanges) {
        saveConfig(config);
        p.log.success("Configuration saved!");
      }
      p.outro("Done.");
      return;
    }

    await handleEdit(choice as string, config);
    hasChanges = true;
  }
}

/**
 * Handle specific config edit
 */
async function handleEdit(choice: string, config: PHAConfig): Promise<void> {
  switch (choice) {
    case "provider": {
      const providerOptions = Object.entries(PROVIDER_CONFIGS).map(([key, cfg]) => ({
        value: key,
        label: cfg.name,
        hint: cfg.hint,
      }));

      const newProvider = await p.select({
        message: "Select LLM provider",
        options: providerOptions,
        initialValue: config.llm.provider,
      });
      handleCancel(newProvider);

      config.llm.provider = newProvider as LLMProvider;
      const providerCfg = PROVIDER_CONFIGS[newProvider as LLMProvider];

      if (providerCfg.baseUrl) {
        config.llm.baseUrl = providerCfg.baseUrl;
      } else {
        delete config.llm.baseUrl;
      }

      // Prompt for API key if not in env
      const envKey = process.env[providerCfg.envVar];
      if (!envKey) {
        if (KEY_URLS[newProvider as string]) {
          p.note(`Get your API key from:\n${KEY_URLS[newProvider as string]}`, "API Key");
        }

        const apiKey = await p.password({
          message: `Enter ${providerCfg.name} API key`,
        });
        handleCancel(apiKey);

        if (apiKey) {
          config.llm.apiKey = apiKey as string;
        }
      }

      config.llm.modelId = providerCfg.defaultModel;
      // Sync to model repository
      if (!config.models) config.models = { providers: {} };
      const pk = newProvider as string;
      if (!config.models.providers[pk]) config.models.providers[pk] = { models: [] };
      if (config.llm.apiKey) config.models.providers[pk].apiKey = config.llm.apiKey;
      if (config.llm.baseUrl) config.models.providers[pk].baseUrl = config.llm.baseUrl;
      const modelName = config.llm.modelId || providerCfg.defaultModel;
      if (!config.models.providers[pk].models.find((m) => m.name === modelName)) {
        config.models.providers[pk].models.push({ name: modelName, model: modelName });
      }
      if (!config.orchestrator) config.orchestrator = {};
      config.orchestrator.pha = `${pk}/${modelName}`;
      p.log.success(`Provider: ${providerCfg.name}, Model: ${config.llm.modelId}`);
      break;
    }

    case "model": {
      const providerCfg = PROVIDER_CONFIGS[config.llm.provider as LLMProvider];
      const defaultModel = providerCfg?.defaultModel || "";

      const newModel = await p.text({
        message: "Model ID",
        placeholder: defaultModel,
        initialValue: config.llm.modelId || defaultModel,
      });
      handleCancel(newModel);

      config.llm.modelId = (newModel as string) || defaultModel;
      // Sync to model repository
      const modelName = config.llm.modelId;
      const pk = config.llm.provider;
      if (config.models?.providers?.[pk]) {
        if (!config.models.providers[pk].models.find((m) => m.name === modelName)) {
          config.models.providers[pk].models.push({ name: modelName, model: modelName });
        }
        if (!config.orchestrator) config.orchestrator = {};
        config.orchestrator.pha = `${pk}/${modelName}`;
      }
      p.log.success(`Model: ${config.llm.modelId}`);
      break;
    }

    case "apikey": {
      const providerCfg = PROVIDER_CONFIGS[config.llm.provider as LLMProvider];

      if (KEY_URLS[config.llm.provider]) {
        p.note(`Get your API key from:\n${KEY_URLS[config.llm.provider]}`, "API Key");
      }

      const apiKey = await p.password({
        message: `Enter ${providerCfg?.name || config.llm.provider} API key`,
      });
      handleCancel(apiKey);

      if (apiKey) {
        config.llm.apiKey = apiKey as string;
        // Sync to model repository
        const pk = config.llm.provider;
        if (config.models?.providers?.[pk]) {
          config.models.providers[pk].apiKey = apiKey as string;
        }
        p.log.success("API key updated");
      }
      break;
    }

    case "port": {
      const portStr = await p.text({
        message: "Gateway port",
        initialValue: String(config.gateway.port),
        validate: (value) => {
          const num = parseInt(value || "", 10);
          if (isNaN(num) || num < 1 || num > 65535) {
            return "Please enter a valid port number (1-65535)";
          }
          return undefined;
        },
      });
      handleCancel(portStr);

      config.gateway.port = parseInt(portStr as string, 10);
      p.log.success(`Port: ${config.gateway.port}`);
      break;
    }

    case "datasource": {
      const newSource = await p.select({
        message: "Select health data source",
        options: [
          { value: "mock", label: "Mock Data", hint: "For development/testing" },
          { value: "huawei", label: "Huawei Health Kit", hint: "HarmonyOS/Android" },
          { value: "apple", label: "Apple HealthKit", hint: "iOS/macOS (not implemented)" },
        ],
        initialValue: config.dataSources.type,
      });
      handleCancel(newSource);

      if (newSource === "huawei") {
        const success = await setupHuaweiHealth(config);
        if (success) {
          config.dataSources.type = "huawei";
        }
      } else {
        config.dataSources.type = newSource as "mock" | "huawei" | "apple";
      }
      p.log.success(`Data source: ${config.dataSources.type}`);
      break;
    }

    case "embedding": {
      await setupEmbedding(config);
      break;
    }
  }
}

/**
 * Run full setup wizard
 */
async function runFullWizard(): Promise<void> {
  ensureConfigDir();

  const config: PHAConfig = {
    gateway: { host: "0.0.0.0", port: 8000, autoStart: false },
    llm: { provider: "anthropic" },
    dataSources: { type: "mock" },
    tui: { theme: "dark", showToolCalls: true },
  };

  p.log.info("User ID will be set after Huawei OAuth authorization");

  // Step 1: LLM Provider
  p.log.step("Step 1/4: LLM Provider");

  // Check for existing API keys in environment
  const detectedProviders: string[] = [];
  for (const cfg of Object.values(PROVIDER_CONFIGS)) {
    if (process.env[cfg.envVar]) {
      detectedProviders.push(`${c.green("✓")} Found ${cfg.envVar}`);
    }
  }

  if (detectedProviders.length > 0) {
    p.log.info(detectedProviders.join("\n"));
  } else {
    p.log.warn("No API keys found in environment");
  }

  const providerOptions = Object.entries(PROVIDER_CONFIGS).map(([key, cfg]) => ({
    value: key,
    label: cfg.name,
    hint: cfg.hint,
  }));

  const selectedProvider = await p.select({
    message: "Select LLM provider",
    options: providerOptions,
  });
  handleCancel(selectedProvider);

  config.llm.provider = selectedProvider as LLMProvider;
  const providerCfg = PROVIDER_CONFIGS[selectedProvider as LLMProvider];

  // API Key
  let apiKey = process.env[providerCfg.envVar];

  if (apiKey) {
    const useExisting = await p.confirm({
      message: `Use existing ${providerCfg.envVar}? (${formatApiKeyPreview(apiKey)})`,
      initialValue: true,
    });
    handleCancel(useExisting);

    if (!useExisting) {
      apiKey = undefined;
    }
  }

  if (!apiKey) {
    if (KEY_URLS[selectedProvider as string]) {
      p.note(`Get your API key from:\n${KEY_URLS[selectedProvider as string]}`, "API Key");
    }

    const newKey = await p.password({
      message: `Enter ${providerCfg.name} API key`,
    });
    handleCancel(newKey);

    if (newKey) {
      config.llm.apiKey = newKey as string;
    }
  } else {
    config.llm.apiKey = apiKey;
  }

  // Base URL
  if (providerCfg.baseUrl) {
    config.llm.baseUrl = providerCfg.baseUrl;
  }

  // Model
  const model = await p.text({
    message: "Model ID",
    placeholder: providerCfg.defaultModel,
    initialValue: providerCfg.defaultModel,
  });
  handleCancel(model);
  config.llm.modelId = (model as string) || providerCfg.defaultModel;

  // Step 2: Gateway
  p.log.step("Step 2/4: Gateway");

  const port = await p.text({
    message: "Gateway port",
    initialValue: "8000",
    validate: (value) => {
      const num = parseInt(value || "", 10);
      if (isNaN(num) || num < 1 || num > 65535) {
        return "Please enter a valid port number (1-65535)";
      }
      return undefined;
    },
  });
  handleCancel(port);
  config.gateway.port = parseInt(port as string, 10);

  const autoStart = await p.confirm({
    message: "Auto-start gateway on boot?",
    initialValue: false,
  });
  handleCancel(autoStart);
  config.gateway.autoStart = autoStart as boolean;

  // Step 3: Health Data
  p.log.step("Step 3/4: Health Data");

  const dataSource = await p.select({
    message: "Select health data source",
    options: [
      { value: "mock", label: "Mock Data", hint: "For development/testing" },
      { value: "huawei", label: "Huawei Health Kit", hint: "HarmonyOS/Android" },
      { value: "apple", label: "Apple HealthKit", hint: "iOS/macOS (not implemented)" },
    ],
  });
  handleCancel(dataSource);

  if (dataSource === "huawei") {
    const success = await setupHuaweiHealth(config);
    if (success) {
      config.dataSources.type = "huawei";
    }
  } else {
    config.dataSources.type = dataSource as "mock" | "huawei" | "apple";
  }

  // Step 4: Embedding/Vector Search
  p.log.step("Step 4/4: Memory & Vector Search");

  // Auto-enable if using OpenRouter (can use same API key)
  if (config.llm.provider === "openrouter") {
    const enableEmbedding = await p.confirm({
      message: "Enable vector search for memory? (uses OpenRouter embeddings)",
      initialValue: true,
    });
    handleCancel(enableEmbedding);

    if (enableEmbedding) {
      config.embedding = {
        enabled: true,
        model: "openai/text-embedding-3-small",
      };
      p.log.success("Vector search enabled (text-embedding-3-small)");
    } else {
      config.embedding = { enabled: false };
    }
  } else {
    p.note(
      [
        "Vector search requires OpenRouter API for embeddings.",
        "You can enable it later via 'pha onboard'.",
      ].join("\n"),
      "Vector Search"
    );
    config.embedding = { enabled: false };
  }

  // Populate unified model repository from wizard selections
  const providerKey = config.llm.provider;
  const modelEntry = {
    name: config.llm.modelId || providerCfg.defaultModel,
    model: config.llm.modelId || providerCfg.defaultModel,
  };
  const providerModels = [modelEntry];
  // Add embedding model to provider if enabled
  if (config.embedding?.enabled && config.embedding.model) {
    const embModelId = config.embedding.model;
    const embParts = embModelId.split("/");
    const embName = embParts[embParts.length - 1];
    if (!providerModels.find((m) => m.name === embName)) {
      providerModels.push({ name: embName, model: embModelId });
    }
    if (!config.orchestrator) config.orchestrator = {};
    config.orchestrator.embedding = `${providerKey}/${embName}`;
  }
  config.models = {
    providers: {
      [providerKey]: {
        ...(config.llm.baseUrl ? { baseUrl: config.llm.baseUrl } : {}),
        ...(config.llm.apiKey ? { apiKey: config.llm.apiKey } : {}),
        models: providerModels,
      },
    },
  };
  if (!config.orchestrator) config.orchestrator = {};
  config.orchestrator.pha = `${providerKey}/${modelEntry.name}`;

  // Save
  saveConfig(config);

  // Summary
  p.note(
    [
      `Provider: ${providerCfg.name}`,
      `Model: ${config.llm.modelId}`,
      `Gateway: http://localhost:${config.gateway.port}`,
      `Data Source: ${config.dataSources.type}`,
      `Vector Search: ${config.embedding?.enabled ? config.embedding.model : "disabled"}`,
      `Config: ${getConfigPath()}`,
    ].join("\n"),
    "Configuration saved"
  );

  p.log.info(`Tip: Run ${c.cyan("pha state init --remote <url>")} to sync .pha/ to a private repo`);

  const nextCmd = config.dataSources.type === "huawei" ? `${c.cyan("pha auth")} then ` : "";
  p.outro(`Next: Run ${nextCmd}${c.cyan("pha start")} or ${c.cyan("pha health")}`);
}
