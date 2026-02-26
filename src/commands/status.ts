/**
 * Status command - Show system status
 */

import type { Command } from "commander";
import {
  loadConfig,
  isConfigured,
  getConfigPath,
  PROVIDER_CONFIGS,
  type LLMProvider,
} from "../utils/config.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  printHeader,
  printSection,
  printKV,
  printStatus,
  printDivider,
  c,
  icons,
  formatRelativeTime,
} from "../utils/cli-ui.js";

const PID_FILE = path.join(os.homedir(), ".pha", "gateway.pid");
const LOG_FILE = path.join(os.homedir(), ".pha", "gateway.log");

function getPid(): number | null {
  if (!fs.existsSync(PID_FILE)) return null;
  try {
    return parseInt(fs.readFileSync(PID_FILE, "utf-8").trim(), 10);
  } catch {
    return null;
  }
}

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function getLogLastModified(): Date | null {
  try {
    const stat = fs.statSync(LOG_FILE);
    return stat.mtime;
  } catch {
    return null;
  }
}

export function registerStatusCommand(program: Command): void {
  program
    .command("status")
    .description("Show PHA system status")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      const configured = isConfigured();
      const config = configured ? loadConfig() : null;
      const pid = getPid();
      const gatewayRunning = pid ? isRunning(pid) : false;

      // Check API keys
      const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
      const hasOpenAI = !!process.env.OPENAI_API_KEY;
      const hasGoogle = !!process.env.GOOGLE_API_KEY;
      const hasOpenRouter = !!process.env.OPENROUTER_API_KEY;
      const hasAnyKey = hasAnthropic || hasOpenAI || hasGoogle || hasOpenRouter;

      // Check gateway health if running
      let gatewayHealth: { uptime?: number } | null = null;
      let gatewayUptime = "";
      if (gatewayRunning && config) {
        try {
          const statusBasePath = (config.gateway.basePath || "").replace(/\/+$/, "");
          const response = await fetch(`http://localhost:${config.gateway.port}${statusBasePath}/health`);
          gatewayHealth = (await response.json()) as { uptime?: number };
          if (gatewayHealth?.uptime) {
            const hours = Math.floor(gatewayHealth.uptime / 3600);
            const mins = Math.floor((gatewayHealth.uptime % 3600) / 60);
            gatewayUptime = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
          }
        } catch {
          // Gateway not responding
        }
      }

      const status = {
        configured,
        configPath: getConfigPath(),
        gateway: {
          running: gatewayRunning,
          pid: gatewayRunning ? pid : null,
          port: config?.gateway.port || 8000,
          health: gatewayHealth,
        },
        llm: {
          provider: config?.llm.provider || "not configured",
          model: config?.llm.modelId || "default",
          hasApiKey: hasAnyKey,
          apiKeys: {
            anthropic: hasAnthropic,
            openai: hasOpenAI,
            google: hasGoogle,
            openrouter: hasOpenRouter,
          },
        },
        dataSource: {
          type: config?.dataSources.type || "mock",
        },
      };

      if (options.json) {
        console.log(JSON.stringify(status, null, 2));
        process.exit(0);
      }

      console.log("");
      printHeader(`${icons.health} PHA Status`, "Personal Health Agent");

      // Gateway Status (most important)
      printSection("Gateway", icons.server);
      if (gatewayRunning) {
        printStatus("success", "Running", `PID ${pid}`);
        const dispBasePath = (config?.gateway.basePath || "").replace(/\/+$/, "");
        printKV("URL", c.cyan(`http://localhost:${config?.gateway.port}${dispBasePath}`));
        printKV("Health", gatewayHealth ? c.green("Healthy") : c.yellow("Not responding"));
        if (gatewayUptime) {
          printKV("Uptime", gatewayUptime);
        }
      } else {
        printStatus("pending", "Stopped");
        console.log(`  ${c.dim("Run")} ${c.cyan("pha start")} ${c.dim("to launch the gateway")}`);
      }

      // LLM Provider
      printSection("LLM Provider", icons.robot);
      if (config?.llm.provider) {
        const providerCfg = PROVIDER_CONFIGS[config.llm.provider as LLMProvider];
        printKV("Provider", c.bold(providerCfg?.name || config.llm.provider));
        if (config.llm.modelId) {
          printKV("Model", config.llm.modelId);
        }
        if (config.llm.baseUrl) {
          printKV("Base URL", c.dim(config.llm.baseUrl));
        }

        // API Key status
        const providerKey = process.env[providerCfg?.envVar || ""];
        if (providerKey || config.llm.apiKey) {
          printStatus("success", "API key configured");
        } else {
          printStatus("error", "API key missing", `Set ${providerCfg?.envVar}`);
        }
      } else {
        printStatus("warning", "Not configured");
        console.log(`  ${c.dim("Run")} ${c.cyan("pha onboard")} ${c.dim("to set up")}`);
      }

      // Configuration
      printSection("Configuration", icons.config);
      if (configured) {
        printStatus("success", "Configured");
        printKV("Path", c.dim(getConfigPath()));
        printKV("Data Source", config?.dataSources.type || "mock");
      } else {
        printStatus("warning", "Not configured");
      }

      // API Keys Overview (collapsed)
      const keyCount = [hasAnthropic, hasOpenAI, hasGoogle, hasOpenRouter].filter(Boolean).length;
      if (keyCount > 0) {
        printSection("Environment", icons.key);
        const keyList = [
          hasAnthropic && "Anthropic",
          hasOpenAI && "OpenAI",
          hasGoogle && "Google",
          hasOpenRouter && "OpenRouter",
        ]
          .filter(Boolean)
          .join(", ");
        printKV("API Keys", `${c.green(String(keyCount))} ${c.dim("found:")} ${keyList}`);
      }

      // Quick Actions
      console.log("");
      printDivider();
      console.log(`\n  ${c.bold("Quick Actions")}`);
      console.log("");

      if (!configured) {
        console.log(`  ${c.cyan("pha onboard")}     ${c.dim("Interactive setup wizard")}`);
        console.log(`  ${c.cyan("pha setup")}       ${c.dim("Quick default config")}`);
      } else if (!gatewayRunning) {
        console.log(`  ${c.cyan("pha start")}       ${c.dim("Start gateway and open browser")}`);
        console.log(`  ${c.cyan("pha tui --local")} ${c.dim("Chat without gateway")}`);
      } else {
        console.log(`  ${c.cyan("pha tui")}         ${c.dim("Open terminal chat")}`);
        console.log(`  ${c.cyan("pha health")}      ${c.dim("View health summary")}`);
        console.log(`  ${c.cyan("pha stop")}        ${c.dim("Stop the gateway")}`);
        console.log(`  ${c.cyan("pha logs")}        ${c.dim("View gateway logs")}`);
      }

      console.log("");
      process.exit(0);
    });

  // Add logs command
  program
    .command("logs")
    .description("View gateway logs")
    .option("-n, --lines <number>", "Number of lines to show", "50")
    .option("-f, --follow", "Follow log output")
    .action(async (options) => {
      if (!fs.existsSync(LOG_FILE)) {
        console.log(`${c.dim("No logs found. Start the gateway first:")}`);
        console.log(`  ${c.cyan("pha start")}`);
        return;
      }

      const lines = parseInt(options.lines, 10);

      if (options.follow) {
        // Use tail -f equivalent
        console.log(`${c.dim("Following logs...")} ${c.dim("(Ctrl+C to stop)")}\n`);
        const { spawn } = await import("child_process");
        const tail = spawn("tail", ["-f", "-n", String(lines), LOG_FILE]);
        tail.stdout.pipe(process.stdout);
        tail.stderr.pipe(process.stderr);

        process.on("SIGINT", () => {
          tail.kill();
          process.exit(0);
        });
      } else {
        // Read last N lines
        const content = fs.readFileSync(LOG_FILE, "utf-8");
        const allLines = content.split("\n");
        const lastLines = allLines.slice(-lines).join("\n");

        const lastMod = getLogLastModified();
        if (lastMod) {
          console.log(`${c.dim("Last updated:")} ${formatRelativeTime(lastMod)}\n`);
        }

        console.log(lastLines);

        console.log(`\n${c.dim("Tip: Use")} ${c.cyan("pha logs -f")} ${c.dim("to follow logs")}`);
        process.exit(0);
      }
    });
}
