/**
 * Onboard command - Interactive setup wizard
 */

import type { Command } from "commander";
import * as readline from "readline";
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
import {
  printHeader,
  printSection,
  printKV,
  printDivider,
  printStatus,
  c,
  icons,
  box,
  clearScreen,
  success,
  info,
  warn,
} from "../utils/cli-ui.js";

/**
 * Create interactive prompt utilities
 */
function createPrompt(): {
  question: (query: string) => Promise<string>;
  select: <T extends string>(message: string, options: { value: T; label: string; hint?: string }[]) => Promise<T>;
  password: (query: string) => Promise<string>;
  confirm: (query: string, defaultValue?: boolean) => Promise<boolean>;
  close: () => void;
} {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return {
    question: (query: string) =>
      new Promise((resolve) => {
        rl.question(query, resolve);
      }),

    select: async <T extends string>(
      message: string,
      options: { value: T; label: string; hint?: string }[]
    ): Promise<T> => {
      console.log(`\n  ${c.cyan("?")} ${c.bold(message)}\n`);
      options.forEach((opt, i) => {
        const hint = opt.hint ? ` ${c.dim(`(${opt.hint})`)}` : "";
        const num = c.cyan(`${i + 1}.`);
        console.log(`     ${num} ${opt.label}${hint}`);
      });
      console.log("");

      while (true) {
        const answer = await new Promise<string>((resolve) => {
          rl.question(`  ${c.dim(`Enter number [1-${options.length}]:`)} `, resolve);
        });

        const num = parseInt(answer, 10);
        if (num >= 1 && num <= options.length) {
          const selected = options[num - 1];
          console.log(`  ${c.green(icons.success)} ${selected.label}\n`);
          return selected.value;
        }

        // Also accept value directly
        const found = options.find((o) => o.value === answer || o.label.toLowerCase() === answer.toLowerCase());
        if (found) {
          console.log(`  ${c.green(icons.success)} ${found.label}\n`);
          return found.value;
        }

        console.log(`  ${c.red(icons.error)} Invalid selection. Try again.`);
      }
    },

    password: (query: string) =>
      new Promise((resolve) => {
        process.stdout.write(`  ${query}`);

        const stdin = process.stdin;
        const wasRaw = stdin.isRaw;

        if (stdin.isTTY) {
          stdin.setRawMode(true);
        }

        let password = "";

        const onData = (char: Buffer) => {
          const ch = char.toString();

          if (ch === "\n" || ch === "\r") {
            stdin.removeListener("data", onData);
            if (stdin.isTTY && wasRaw !== undefined) {
              stdin.setRawMode(wasRaw);
            }
            console.log("");
            resolve(password);
          } else if (ch === "\u0003") {
            // Ctrl+C
            process.exit(0);
          } else if (ch === "\u007F" || ch === "\b") {
            // Backspace
            if (password.length > 0) {
              password = password.slice(0, -1);
              process.stdout.write("\b \b");
            }
          } else {
            password += ch;
            process.stdout.write(c.dim("*"));
          }
        };

        stdin.on("data", onData);
        stdin.resume();
      }),

    confirm: async (query: string, defaultValue = true): Promise<boolean> => {
      const hint = defaultValue ? c.dim("[Y/n]") : c.dim("[y/N]");
      const answer = await new Promise<string>((resolve) => {
        rl.question(`  ${query} ${hint} `, resolve);
      });

      if (answer === "") return defaultValue;
      return answer.toLowerCase().startsWith("y");
    },

    close: () => rl.close(),
  };
}

function formatApiKeyPreview(key: string): string {
  if (key.length <= 12) return "****";
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

function printStepHeader(step: number, total: number, title: string): void {
  console.log("");
  console.log(`  ${c.cyan(box.rtl + box.h.repeat(3))} ${c.bold(`Step ${step}/${total}:`)} ${title} ${c.cyan(box.h.repeat(30 - title.length) + box.rtr)}`);
  console.log("");
}

function showCurrentConfig(config: PHAConfig): void {
  const providerCfg = PROVIDER_CONFIGS[config.llm.provider as LLMProvider];
  printSection("Current Configuration");
  printKV("Provider", c.cyan(providerCfg?.name || config.llm.provider));
  printKV("Model", config.llm.modelId || c.dim("default"));
  if (config.llm.baseUrl) {
    printKV("Base URL", c.dim(config.llm.baseUrl));
  }
  printKV("API Key", config.llm.apiKey ? c.green("configured") : c.yellow("from environment"));
  printKV("Gateway", `http://localhost:${config.gateway.port}`);
  printKV("Data Source", config.dataSources.type);
  console.log("");
}

async function handleSpecificChange(
  choice: "provider" | "model" | "apikey" | "port" | "datasource",
  config: PHAConfig,
  prompt: ReturnType<typeof createPrompt>
): Promise<void> {
  switch (choice) {
    case "provider": {
      const providerOptions = Object.entries(PROVIDER_CONFIGS).map(([key, cfg]) => ({
        value: key as LLMProvider,
        label: cfg.name,
        hint: cfg.hint,
      }));
      const newProvider = await prompt.select("Select LLM provider:", providerOptions);
      config.llm.provider = newProvider;
      const providerCfg = PROVIDER_CONFIGS[newProvider];
      if (providerCfg.baseUrl) {
        config.llm.baseUrl = providerCfg.baseUrl;
      } else {
        delete config.llm.baseUrl;
      }
      // Also prompt for API key if not in env
      const envKey = process.env[providerCfg.envVar];
      if (!envKey) {
        console.log(`\n  ${c.dim("Get your API key from:")}`);
        const keyUrls: Record<string, string> = {
          anthropic: "https://console.anthropic.com/settings/keys",
          openai: "https://platform.openai.com/api-keys",
          google: "https://aistudio.google.com/apikey",
          openrouter: "https://openrouter.ai/keys",
          groq: "https://console.groq.com/keys",
          mistral: "https://console.mistral.ai/api-keys",
          xai: "https://console.x.ai/",
        };
        if (keyUrls[newProvider]) {
          console.log(`  ${c.cyan(icons.link)} ${c.cyan(keyUrls[newProvider])}`);
        }
        console.log("");
        const apiKey = await prompt.password(`Enter ${providerCfg.name} API key: `);
        if (apiKey.trim()) {
          config.llm.apiKey = apiKey.trim();
        }
      }
      // Update model to default for new provider
      config.llm.modelId = providerCfg.defaultModel;
      console.log(`  ${c.green(icons.success)} Provider changed to ${providerCfg.name}`);
      console.log(`  ${c.dim("Model set to:")} ${config.llm.modelId}`);
      break;
    }

    case "model": {
      const providerCfg = PROVIDER_CONFIGS[config.llm.provider as LLMProvider];
      const defaultModel = providerCfg?.defaultModel || config.llm.modelId || "";
      console.log(`  ${c.dim("Current model:")} ${config.llm.modelId || defaultModel}`);
      console.log(`  ${c.dim("Default for provider:")} ${defaultModel}`);
      const newModel = await prompt.question(`  New model ID ${c.dim(`[${defaultModel}]:`)} `);
      config.llm.modelId = newModel.trim() || defaultModel;
      console.log(`  ${c.green(icons.success)} Model set to ${config.llm.modelId}`);
      break;
    }

    case "apikey": {
      const providerCfg = PROVIDER_CONFIGS[config.llm.provider as LLMProvider];
      const keyUrls: Record<string, string> = {
        anthropic: "https://console.anthropic.com/settings/keys",
        openai: "https://platform.openai.com/api-keys",
        google: "https://aistudio.google.com/apikey",
        openrouter: "https://openrouter.ai/keys",
        groq: "https://console.groq.com/keys",
        mistral: "https://console.mistral.ai/api-keys",
        xai: "https://console.x.ai/",
      };
      console.log(`\n  ${c.dim("Get your API key from:")}`);
      if (keyUrls[config.llm.provider]) {
        console.log(`  ${c.cyan(icons.link)} ${c.cyan(keyUrls[config.llm.provider])}`);
      }
      console.log("");
      const apiKey = await prompt.password(`Enter ${providerCfg?.name || config.llm.provider} API key: `);
      if (apiKey.trim()) {
        config.llm.apiKey = apiKey.trim();
        console.log(`  ${c.green(icons.success)} API key updated`);
      } else {
        console.log(`  ${c.dim("No change made")}`);
      }
      break;
    }

    case "port": {
      console.log(`  ${c.dim("Current port:")} ${config.gateway.port}`);
      const portStr = await prompt.question(`  New port ${c.dim(`[${config.gateway.port}]:`)} `);
      if (portStr.trim()) {
        const port = parseInt(portStr.trim(), 10);
        if (port > 0 && port < 65536) {
          config.gateway.port = port;
          console.log(`  ${c.green(icons.success)} Port set to ${port}`);
        } else {
          console.log(`  ${c.red(icons.error)} Invalid port number`);
        }
      }
      break;
    }

    case "datasource": {
      const dataSourceOptions = [
        { value: "mock" as const, label: "Mock Data", hint: "For development/testing" },
        { value: "huawei" as const, label: "Huawei Health Kit", hint: "HarmonyOS/Android" },
        { value: "apple" as const, label: "Apple HealthKit", hint: "iOS/macOS" },
      ];
      const newSource = await prompt.select("Select health data source:", dataSourceOptions);
      config.dataSources.type = newSource;
      console.log(`  ${c.green(icons.success)} Data source set to ${newSource}`);
      break;
    }
  }
  console.log("");
}

export function registerOnboardCommand(program: Command): void {
  program
    .command("onboard")
    .description("Interactive configuration wizard")
    .option("--reset", "Start fresh with full setup wizard")
    .action(async (options) => {
      console.log("");
      printHeader(`${icons.health} PHA Setup Wizard`, "Let's get you started!");

      // If already configured and no reset flag, show interactive config editor
      if (isConfigured() && !options.reset) {
        const config = loadConfig();
        const prompt = createPrompt();

        try {
          let hasChanges = false;

          // Loop until user chooses to exit
          while (true) {
            // Show current config
            console.log("");
            showCurrentConfig(config);

            const editOptions = [
              { value: "provider" as const, label: "LLM Provider", hint: PROVIDER_CONFIGS[config.llm.provider as LLMProvider]?.name || config.llm.provider },
              { value: "model" as const, label: "Model", hint: config.llm.modelId || "default" },
              { value: "apikey" as const, label: "API Key", hint: config.llm.apiKey ? "configured" : "from env" },
              { value: "port" as const, label: "Gateway Port", hint: String(config.gateway.port) },
              { value: "datasource" as const, label: "Data Source", hint: config.dataSources.type },
              { value: "reset" as const, label: "Full Reset", hint: "Start over" },
              { value: "done" as const, label: "Save & Exit", hint: hasChanges ? "Save changes" : "No changes" },
            ];

            const choice = await prompt.select("Select to edit:", editOptions);

            if (choice === "done") {
              if (hasChanges) {
                saveConfig(config);
                success("Configuration saved!");
              } else {
                console.log(`\n  ${c.dim("No changes made.")}\n`);
              }
              break;
            }

            if (choice === "reset") {
              const confirmReset = await prompt.confirm(`${c.yellow("Reset all settings?")}`, false);
              if (confirmReset) {
                prompt.close();
                options.reset = true;
                // Continue to full wizard below
                break;
              }
              continue;
            }

            // Handle the edit
            await handleSpecificChange(choice, config, prompt);
            hasChanges = true;
          }

          prompt.close();
          if (!options.reset) {
            return;
          }
        } catch (e) {
          prompt.close();
          return;
        }
      }

      ensureConfigDir();

      const config: PHAConfig = {
        gateway: { port: 8000, autoStart: false },
        llm: { provider: "anthropic" },
        dataSources: { type: "mock" },
        tui: { theme: "dark", showToolCalls: true },
      };

      const prompt = createPrompt();

      try {
        // ===== Step 1: LLM Provider =====
        printStepHeader(1, 3, "LLM Provider");

        // Build provider options
        const providerOptions = Object.entries(PROVIDER_CONFIGS).map(([key, cfg]) => ({
          value: key as LLMProvider,
          label: cfg.name,
          hint: cfg.hint,
        }));

        // Check for existing API keys in environment
        const detectedProviders: LLMProvider[] = [];
        for (const [key, cfg] of Object.entries(PROVIDER_CONFIGS)) {
          if (process.env[cfg.envVar]) {
            detectedProviders.push(key as LLMProvider);
            printStatus("success", `Found ${cfg.envVar}`, "in environment");
          }
        }

        if (detectedProviders.length === 0) {
          printStatus("warning", "No API keys found in environment");
        }

        // If provider specified via CLI, use it
        let selectedProvider: LLMProvider;
        if (options.provider) {
          selectedProvider = options.provider as LLMProvider;
          console.log(`  ${c.dim("Using provider:")} ${c.green(selectedProvider)}`);
        } else {
          selectedProvider = await prompt.select("Select LLM provider:", providerOptions);
        }

        config.llm.provider = selectedProvider;
        const providerCfg = PROVIDER_CONFIGS[selectedProvider];

        // Check for API key
        let apiKey = options.apiKey || process.env[providerCfg.envVar] || config.llm.apiKey;

        if (apiKey) {
          const preview = formatApiKeyPreview(apiKey);
          const useExisting = await prompt.confirm(
            `Use existing ${providerCfg.envVar}? ${c.dim(`(${preview})`)}`
          );
          if (!useExisting) {
            apiKey = undefined;
          }
        }

        if (!apiKey) {
          const keyUrls: Record<string, string> = {
            anthropic: "https://console.anthropic.com/settings/keys",
            openai: "https://platform.openai.com/api-keys",
            google: "https://aistudio.google.com/apikey",
            openrouter: "https://openrouter.ai/keys",
            groq: "https://console.groq.com/keys",
            mistral: "https://console.mistral.ai/api-keys",
            xai: "https://console.x.ai/",
          };

          console.log(`\n  ${c.dim("Get your API key from:")}`);
          if (keyUrls[selectedProvider]) {
            console.log(`  ${c.cyan(icons.link)} ${c.cyan(keyUrls[selectedProvider])}`);
          }
          console.log("");

          apiKey = await prompt.password(`Enter ${providerCfg.name} API key: `);
          if (apiKey.trim()) {
            config.llm.apiKey = apiKey.trim();
            console.log(`  ${c.green(icons.success)} API key saved\n`);
          }
        } else {
          // Store in config if from env
          config.llm.apiKey = apiKey;
        }

        // Base URL (pi-ai handles this automatically for built-in providers)
        if (providerCfg.baseUrl) {
          config.llm.baseUrl = providerCfg.baseUrl;
        }

        // Model selection
        const defaultModel = providerCfg.defaultModel;
        console.log(`  ${c.dim("Default model:")} ${defaultModel}`);
        const customModel = await prompt.question(
          `  Model ID ${c.dim(`[${defaultModel}]:`)} `
        );
        config.llm.modelId = customModel.trim() || defaultModel;
        console.log(`  ${c.green(icons.success)} ${config.llm.modelId}\n`);

        // ===== Step 2: Gateway Configuration =====
        printStepHeader(2, 3, "Gateway");

        const portStr = await prompt.question(
          `  Gateway port ${c.dim(`[${config.gateway.port}]:`)} `
        );
        if (portStr.trim()) {
          config.gateway.port = parseInt(portStr.trim(), 10);
        }
        console.log(`  ${c.green(icons.success)} Port ${config.gateway.port}\n`);

        config.gateway.autoStart = await prompt.confirm("  Auto-start gateway on boot?", false);
        console.log("");

        // ===== Step 3: Data Source =====
        printStepHeader(3, 3, "Health Data");

        const dataSourceOptions = [
          { value: "mock" as const, label: "Mock Data", hint: "For development/testing" },
          { value: "huawei" as const, label: "Huawei Health Kit", hint: "HarmonyOS/Android" },
          { value: "apple" as const, label: "Apple HealthKit", hint: "iOS/macOS" },
        ];

        config.dataSources.type = await prompt.select("Select health data source:", dataSourceOptions);

        // Save configuration
        saveConfig(config);

        // Summary
        console.log("");
        printDivider("━");
        console.log("");
        console.log(`  ${c.green(icons.success)} ${c.bold(c.green("Setup complete!"))}`);
        console.log("");

        printSection("Your Configuration");
        printKV("Provider", c.cyan(providerCfg.name));
        printKV("Model", c.cyan(config.llm.modelId || "default"));
        if (config.llm.baseUrl) {
          printKV("Base URL", c.dim(config.llm.baseUrl));
        }
        printKV("Gateway", c.cyan(`http://localhost:${config.gateway.port}`));
        printKV("Data Source", c.cyan(config.dataSources.type));
        printKV("Config File", c.dim(getConfigPath()));

        console.log("");
        printSection("Next Steps");
        console.log(`  ${c.cyan("1.")} Start the gateway:`);
        console.log(`     ${c.cyan("pha start")}`);
        console.log("");
        console.log(`  ${c.cyan("2.")} Or chat directly in terminal:`);
        console.log(`     ${c.cyan("pha tui --local")}`);
        console.log("");
        console.log(`  ${c.cyan("3.")} View your health data:`);
        console.log(`     ${c.cyan("pha health")}`);
        console.log("");
      } finally {
        prompt.close();
      }
    });
}
