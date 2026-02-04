/**
 * Onboard command - Interactive setup wizard
 */

import type { Command } from "commander";
import {
  ensureConfigDir,
  saveConfig,
  loadConfig,
  getConfigPath,
  isConfigured,
} from "../utils/config.js";
import type { PHAConfig } from "../utils/config.js";

export function registerOnboardCommand(program: Command): void {
  program
    .command("onboard")
    .description("Interactive setup wizard")
    .option("--reset", "Reset existing configuration")
    .option("--non-interactive", "Use defaults without prompting")
    .option("--provider <string>", "LLM provider (anthropic, openai, google)")
    .option("--port <number>", "Gateway port")
    .option("--data-source <string>", "Data source (mock, huawei, apple)")
    .action(async (options) => {
      console.log("\n🏥 PHA Onboarding Wizard\n");

      if (isConfigured() && !options.reset) {
        console.log("You're already set up! Config at:", getConfigPath());
        console.log("Use --reset to reconfigure.\n");

        const config = loadConfig();
        console.log("Current configuration:");
        console.log(`  Provider: ${config.llm.provider}`);
        console.log(`  Gateway Port: ${config.gateway.port}`);
        console.log(`  Data Source: ${config.dataSources.type}`);
        console.log("");
        return;
      }

      ensureConfigDir();

      const config: PHAConfig = loadConfig();

      // Step 1: LLM Provider
      console.log("Step 1/3: LLM Provider Configuration\n");

      if (options.provider) {
        config.llm.provider = options.provider as "anthropic" | "openai" | "google";
      } else if (!options.nonInteractive) {
        // Check environment for API keys
        const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
        const hasOpenAI = !!process.env.OPENAI_API_KEY;
        const hasGoogle = !!process.env.GOOGLE_API_KEY;

        if (hasAnthropic) {
          console.log("  ✓ ANTHROPIC_API_KEY found");
          config.llm.provider = "anthropic";
        } else if (hasOpenAI) {
          console.log("  ✓ OPENAI_API_KEY found");
          config.llm.provider = "openai";
        } else if (hasGoogle) {
          console.log("  ✓ GOOGLE_API_KEY found");
          config.llm.provider = "google";
        } else {
          console.log("  ⚠ No API key found in environment");
          console.log("  Please set one of:");
          console.log("    export ANTHROPIC_API_KEY=sk-ant-...");
          console.log("    export OPENAI_API_KEY=sk-...");
          console.log("    export GOOGLE_API_KEY=...");
        }
      }
      console.log(`  Using provider: ${config.llm.provider}\n`);

      // Step 2: Gateway Configuration
      console.log("Step 2/3: Gateway Configuration\n");

      if (options.port) {
        config.gateway.port = parseInt(options.port, 10);
      }
      console.log(`  Gateway port: ${config.gateway.port}`);
      console.log(`  Auto-start: ${config.gateway.autoStart ? "enabled" : "disabled"}\n`);

      // Step 3: Data Source
      console.log("Step 3/3: Health Data Source\n");

      if (options.dataSource) {
        config.dataSources.type = options.dataSource as "mock" | "huawei" | "apple";
      }

      if (config.dataSources.type === "mock") {
        console.log("  Using mock data (for development/testing)");
      } else if (config.dataSources.type === "huawei") {
        console.log("  Huawei Health Kit integration (requires HMS setup)");
      } else if (config.dataSources.type === "apple") {
        console.log("  Apple HealthKit integration (requires macOS/iOS)");
      }
      console.log("");

      // Save configuration
      saveConfig(config);

      console.log("━".repeat(50));
      console.log("\n✓ Onboarding complete!\n");
      console.log("Configuration saved to:", getConfigPath());
      console.log("\nQuick start:");
      console.log("  pha gateway start   # Start the gateway server");
      console.log("  pha tui             # Open terminal UI");
      console.log("  pha health          # View health summary");
      console.log("  pha status          # Check system status");
      console.log("");
    });
}
