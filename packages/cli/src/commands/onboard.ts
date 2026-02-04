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

// ANSI colors
const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
};

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
      console.log(`\n${colors.cyan}?${colors.reset} ${message}\n`);
      options.forEach((opt, i) => {
        const hint = opt.hint ? ` ${colors.dim}(${opt.hint})${colors.reset}` : "";
        console.log(`  ${colors.cyan}${i + 1}.${colors.reset} ${opt.label}${hint}`);
      });
      console.log("");

      while (true) {
        const answer = await new Promise<string>((resolve) => {
          rl.question(`${colors.dim}Enter number [1-${options.length}]:${colors.reset} `, resolve);
        });

        const num = parseInt(answer, 10);
        if (num >= 1 && num <= options.length) {
          const selected = options[num - 1];
          console.log(`${colors.green}  ✓${colors.reset} ${selected.label}\n`);
          return selected.value;
        }

        // Also accept value directly
        const found = options.find((o) => o.value === answer || o.label.toLowerCase() === answer.toLowerCase());
        if (found) {
          console.log(`${colors.green}  ✓${colors.reset} ${found.label}\n`);
          return found.value;
        }

        console.log(`${colors.red}  Invalid selection. Try again.${colors.reset}`);
      }
    },

    password: (query: string) =>
      new Promise((resolve) => {
        // Note: This is a simplified version. For real password input,
        // you'd want to use a library that hides input.
        process.stdout.write(query);

        const stdin = process.stdin;
        const wasRaw = stdin.isRaw;

        if (stdin.isTTY) {
          stdin.setRawMode(true);
        }

        let password = "";

        const onData = (char: Buffer) => {
          const c = char.toString();

          if (c === "\n" || c === "\r") {
            stdin.removeListener("data", onData);
            if (stdin.isTTY && wasRaw !== undefined) {
              stdin.setRawMode(wasRaw);
            }
            console.log("");
            resolve(password);
          } else if (c === "\u0003") {
            // Ctrl+C
            process.exit(0);
          } else if (c === "\u007F" || c === "\b") {
            // Backspace
            if (password.length > 0) {
              password = password.slice(0, -1);
              process.stdout.write("\b \b");
            }
          } else {
            password += c;
            process.stdout.write("*");
          }
        };

        stdin.on("data", onData);
        stdin.resume();
      }),

    confirm: async (query: string, defaultValue = true): Promise<boolean> => {
      const hint = defaultValue ? "[Y/n]" : "[y/N]";
      const answer = await new Promise<string>((resolve) => {
        rl.question(`${query} ${colors.dim}${hint}${colors.reset} `, resolve);
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

export function registerOnboardCommand(program: Command): void {
  program
    .command("onboard")
    .description("Interactive setup wizard")
    .option("--reset", "Reset existing configuration")
    .option("--non-interactive", "Use defaults without prompting")
    .option("--provider <string>", "LLM provider")
    .option("--api-key <string>", "API key")
    .option("--model <string>", "Model ID")
    .option("--base-url <string>", "Custom base URL")
    .option("--port <number>", "Gateway port")
    .option("--data-source <string>", "Data source (mock, huawei, apple)")
    .action(async (options) => {
      console.log(`\n${colors.bold}${colors.cyan}🏥 PHA Onboarding Wizard${colors.reset}\n`);
      console.log("━".repeat(50));

      if (isConfigured() && !options.reset) {
        console.log(`\n${colors.yellow}You're already set up!${colors.reset}`);
        console.log(`Config at: ${getConfigPath()}`);
        console.log(`Use ${colors.cyan}--reset${colors.reset} to reconfigure.\n`);

        const config = loadConfig();
        console.log("Current configuration:");
        console.log(`  Provider: ${colors.green}${config.llm.provider}${colors.reset}`);
        if (config.llm.modelId) {
          console.log(`  Model: ${colors.green}${config.llm.modelId}${colors.reset}`);
        }
        if (config.llm.baseUrl) {
          console.log(`  Base URL: ${colors.green}${config.llm.baseUrl}${colors.reset}`);
        }
        console.log(`  Gateway Port: ${colors.green}${config.gateway.port}${colors.reset}`);
        console.log(`  Data Source: ${colors.green}${config.dataSources.type}${colors.reset}`);
        console.log("");
        return;
      }

      ensureConfigDir();

      const config: PHAConfig = options.reset
        ? {
            gateway: { port: 8000, autoStart: false },
            llm: { provider: "anthropic" },
            dataSources: { type: "mock" },
            tui: { theme: "dark", showToolCalls: true },
          }
        : loadConfig();

      // Non-interactive mode
      if (options.nonInteractive) {
        if (options.provider) {
          config.llm.provider = options.provider as LLMProvider;
        }
        if (options.apiKey) {
          config.llm.apiKey = options.apiKey;
        }
        if (options.model) {
          config.llm.modelId = options.model;
        }
        if (options.baseUrl) {
          config.llm.baseUrl = options.baseUrl;
        }
        if (options.port) {
          config.gateway.port = parseInt(options.port, 10);
        }
        if (options.dataSource) {
          config.dataSources.type = options.dataSource;
        }

        saveConfig(config);
        console.log(`\n${colors.green}✓${colors.reset} Configuration saved to: ${getConfigPath()}\n`);
        return;
      }

      const prompt = createPrompt();

      try {
        // ===== Step 1: LLM Provider =====
        console.log(`\n${colors.bold}Step 1/3: LLM Provider Configuration${colors.reset}\n`);

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
            console.log(`${colors.green}✓${colors.reset} Found ${cfg.envVar} in environment`);
          }
        }

        if (detectedProviders.length === 0) {
          console.log(`${colors.yellow}⚠${colors.reset} No API keys found in environment`);
        }

        // If provider specified via CLI, use it
        let selectedProvider: LLMProvider;
        if (options.provider) {
          selectedProvider = options.provider as LLMProvider;
          console.log(`Using provider: ${colors.green}${selectedProvider}${colors.reset}`);
        } else {
          selectedProvider = await prompt.select("Select LLM provider:", providerOptions);
        }

        config.llm.provider = selectedProvider;
        const providerCfg = PROVIDER_CONFIGS[selectedProvider];

        // Check for API key
        let apiKey = options.apiKey || process.env[providerCfg.envVar] || config.llm.apiKey;

        if (apiKey) {
          const useExisting = await prompt.confirm(
            `Use existing ${providerCfg.envVar}? (${formatApiKeyPreview(apiKey)})`
          );
          if (!useExisting) {
            apiKey = undefined;
          }
        }

        if (!apiKey) {
          console.log(`\n${colors.dim}Get your API key from:${colors.reset}`);
          const keyUrls: Record<string, string> = {
            anthropic: "https://console.anthropic.com/settings/keys",
            openai: "https://platform.openai.com/api-keys",
            google: "https://aistudio.google.com/apikey",
            openrouter: "https://openrouter.ai/keys",
            groq: "https://console.groq.com/keys",
            mistral: "https://console.mistral.ai/api-keys",
            xai: "https://console.x.ai/",
          };
          if (keyUrls[selectedProvider]) {
            console.log(`  ${colors.cyan}${keyUrls[selectedProvider]}${colors.reset}`);
          }
          console.log("");

          apiKey = await prompt.password(`Enter ${providerCfg.name} API key: `);
          if (apiKey.trim()) {
            config.llm.apiKey = apiKey.trim();
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
        console.log(`\n${colors.dim}Default model: ${defaultModel}${colors.reset}`);
        const customModel = await prompt.question(
          `Model ID ${colors.dim}[${defaultModel}]:${colors.reset} `
        );
        config.llm.modelId = customModel.trim() || defaultModel;

        // ===== Step 2: Gateway Configuration =====
        console.log(`\n${colors.bold}Step 2/3: Gateway Configuration${colors.reset}\n`);

        const portStr = await prompt.question(
          `Gateway port ${colors.dim}[${config.gateway.port}]:${colors.reset} `
        );
        if (portStr.trim()) {
          config.gateway.port = parseInt(portStr.trim(), 10);
        }

        config.gateway.autoStart = await prompt.confirm("Auto-start gateway on boot?", false);

        // ===== Step 3: Data Source =====
        console.log(`\n${colors.bold}Step 3/3: Health Data Source${colors.reset}\n`);

        const dataSourceOptions = [
          { value: "mock" as const, label: "Mock Data", hint: "For development/testing" },
          { value: "huawei" as const, label: "Huawei Health Kit", hint: "HarmonyOS/Android" },
          { value: "apple" as const, label: "Apple HealthKit", hint: "iOS/macOS" },
        ];

        config.dataSources.type = await prompt.select("Select health data source:", dataSourceOptions);

        // Save configuration
        saveConfig(config);

        // Summary
        console.log("━".repeat(50));
        console.log(`\n${colors.green}${colors.bold}✓ Onboarding complete!${colors.reset}\n`);
        console.log("Configuration:");
        console.log(`  Provider:    ${colors.cyan}${config.llm.provider}${colors.reset}`);
        console.log(`  Model:       ${colors.cyan}${config.llm.modelId}${colors.reset}`);
        if (config.llm.baseUrl) {
          console.log(`  Base URL:    ${colors.cyan}${config.llm.baseUrl}${colors.reset}`);
        }
        console.log(`  Gateway:     ${colors.cyan}http://localhost:${config.gateway.port}${colors.reset}`);
        console.log(`  Data Source: ${colors.cyan}${config.dataSources.type}${colors.reset}`);
        console.log(`\nSaved to: ${colors.dim}${getConfigPath()}${colors.reset}`);

        console.log(`\n${colors.bold}Quick start:${colors.reset}`);
        console.log(`  ${colors.cyan}pha gateway start${colors.reset}   # Start the gateway server`);
        console.log(`  ${colors.cyan}pha tui --local${colors.reset}     # Open terminal UI`);
        console.log(`  ${colors.cyan}pha health${colors.reset}          # View health summary`);
        console.log(`  ${colors.cyan}pha doctor${colors.reset}          # Check system status`);
        console.log("");
      } finally {
        prompt.close();
      }
    });
}
