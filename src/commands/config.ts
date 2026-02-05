/**
 * Config command - Manage configuration
 */

import type { Command } from "commander";
import {
  loadConfig,
  getConfigValue,
  setConfigValue,
  unsetConfigValue,
  getConfigPath,
  isConfigured,
} from "../utils/config.js";

export function registerConfigCommand(program: Command): void {
  const configCmd = program.command("config").description("Manage PHA configuration");

  // config (no subcommand) - show all config
  configCmd.action(() => {
    if (!isConfigured()) {
      console.log("\nNo configuration found. Run 'pha setup' first.\n");
      return;
    }

    const config = loadConfig();
    console.log("\nPHA Configuration\n");
    console.log("Path:", getConfigPath());
    console.log("");
    console.log(JSON.stringify(config, null, 2));
    console.log("");
  });

  // config get <path>
  configCmd
    .command("get <path>")
    .description("Get a configuration value")
    .action((path) => {
      const value = getConfigValue(path);
      if (value === undefined) {
        console.log(`No value found for: ${path}`);
      } else {
        console.log(typeof value === "object" ? JSON.stringify(value, null, 2) : value);
      }
    });

  // config set <path> <value>
  configCmd
    .command("set <path> <value>")
    .description("Set a configuration value")
    .action((path, value) => {
      setConfigValue(path, value);
      console.log(`Set ${path} = ${value}`);
    });

  // config unset <path>
  configCmd
    .command("unset <path>")
    .description("Remove a configuration value")
    .action((path) => {
      unsetConfigValue(path);
      console.log(`Removed ${path}`);
    });

  // config path - show config file path
  configCmd
    .command("path")
    .description("Show configuration file path")
    .action(() => {
      console.log(getConfigPath());
    });

  // config reset - reset to defaults
  configCmd
    .command("reset")
    .description("Reset configuration to defaults")
    .option("--force", "Skip confirmation")
    .action((options) => {
      if (!options.force) {
        console.log("This will reset all configuration to defaults.");
        console.log("Use --force to confirm.");
        return;
      }

      const { ensureConfigDir, saveConfig } = require("../utils/config.js");
      ensureConfigDir();
      saveConfig({
        gateway: { port: 8000, autoStart: false },
        llm: { provider: "anthropic" },
        dataSources: { type: "mock" },
        tui: { theme: "dark", showToolCalls: true },
      });
      console.log("Configuration reset to defaults.");
    });
}
