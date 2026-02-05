/**
 * Setup command - Initialize PHA configuration
 */

import type { Command } from "commander";
import { ensureConfigDir, saveConfig, getConfigPath, isConfigured, loadConfig } from "../utils/config.js";
import type { PHAConfig } from "../utils/config.js";

export function registerSetupCommand(program: Command): void {
  program
    .command("setup")
    .description("Initialize PHA configuration")
    .option("--force", "Overwrite existing configuration")
    .option("--non-interactive", "Use default values without prompting")
    .action(async (options) => {
      console.log("\n🏥 PHA Setup\n");

      if (isConfigured() && !options.force) {
        console.log("Configuration already exists at:", getConfigPath());
        console.log("Use --force to overwrite.\n");
        return;
      }

      ensureConfigDir();

      const config: PHAConfig = {
        gateway: {
          port: 8000,
          autoStart: false,
        },
        llm: {
          provider: "anthropic",
        },
        dataSources: {
          type: "mock",
        },
        tui: {
          theme: "dark",
          showToolCalls: true,
        },
      };

      // Check for API keys in environment
      if (process.env.ANTHROPIC_API_KEY) {
        console.log("✓ Found ANTHROPIC_API_KEY in environment");
        config.llm.provider = "anthropic";
      } else if (process.env.OPENAI_API_KEY) {
        console.log("✓ Found OPENAI_API_KEY in environment");
        config.llm.provider = "openai";
      } else if (process.env.GOOGLE_API_KEY) {
        console.log("✓ Found GOOGLE_API_KEY in environment");
        config.llm.provider = "google";
      } else {
        console.log("⚠ No API key found in environment");
        console.log("  Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_API_KEY");
      }

      saveConfig(config);

      console.log("\n✓ Configuration saved to:", getConfigPath());
      console.log("\nNext steps:");
      console.log("  1. Run 'pha onboard' for interactive setup");
      console.log("  2. Or run 'pha gateway start' to start the server");
      console.log("");
    });
}
