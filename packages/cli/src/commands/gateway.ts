/**
 * Gateway command - Manage the gateway server
 */

import type { Command } from "commander";
import { startGateway } from "@pha/core";
import { loadConfig, PROVIDER_CONFIGS, type LLMProvider } from "../utils/config.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

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

/**
 * Get the API key from config or environment
 */
function getApiKey(config: ReturnType<typeof loadConfig>): string | undefined {
  // First check config
  if (config.llm.apiKey) {
    return config.llm.apiKey;
  }

  // Then check environment based on provider
  const provider = config.llm.provider as LLMProvider;
  const providerConfig = PROVIDER_CONFIGS[provider];
  if (providerConfig) {
    return process.env[providerConfig.envVar];
  }

  return undefined;
}

export function registerGatewayCommand(program: Command): void {
  const gatewayCmd = program
    .command("gateway")
    .description("Manage the PHA gateway server");

  // gateway start
  gatewayCmd
    .command("start")
    .description("Start the gateway server")
    .option("-p, --port <number>", "Port to listen on")
    .option("--provider <string>", "LLM provider")
    .option("--model <string>", "Model ID")
    .option("--base-url <string>", "Base URL for API")
    .option("-d, --daemon", "Run as background daemon")
    .action(async (options) => {
      const config = loadConfig();
      const port = options.port ? parseInt(options.port, 10) : config.gateway.port;
      const provider = options.provider || config.llm.provider;
      const modelId = options.model || config.llm.modelId;
      const baseUrl = options.baseUrl || config.llm.baseUrl;
      const apiKey = getApiKey(config);

      // Check if already running
      const existingPid = getPid();
      if (existingPid && isRunning(existingPid)) {
        console.log(`Gateway already running (PID: ${existingPid})`);
        console.log(`Stop it first with: pha gateway stop`);
        return;
      }

      if (!apiKey) {
        const providerConfig = PROVIDER_CONFIGS[provider as LLMProvider];
        console.error(`\x1b[31mError: No API key found\x1b[0m`);
        console.error(`\nSet the API key via:`);
        console.error(`  1. Environment: export ${providerConfig?.envVar || 'API_KEY'}=...`);
        console.error(`  2. Config: pha onboard --reset`);
        return;
      }

      if (options.daemon) {
        // Spawn as background process
        const { spawn } = await import("child_process");
        const args = [
          process.argv[1],
          "gateway", "run",
          "-p", String(port),
          "--provider", provider,
        ];
        if (modelId) args.push("--model", modelId);
        if (baseUrl) args.push("--base-url", baseUrl);

        const child = spawn(process.argv[0], args, {
          detached: true,
          stdio: ["ignore", fs.openSync(LOG_FILE, "a"), fs.openSync(LOG_FILE, "a")],
          env: {
            ...process.env,
            PHA_API_KEY: apiKey, // Pass API key via env for security
          },
        });

        fs.writeFileSync(PID_FILE, String(child.pid));
        child.unref();

        console.log(`Gateway started in background (PID: ${child.pid})`);
        console.log(`Provider: ${provider}`);
        if (modelId) console.log(`Model: ${modelId}`);
        console.log(`Logs: ${LOG_FILE}`);
        console.log(`\nEndpoints:`);
        console.log(`  http://localhost:${port}/health`);
        console.log(`  ws://localhost:${port}/ws`);
      } else {
        // Run in foreground
        console.log(`Starting PHA Gateway on port ${port}...`);
        console.log(`Provider: ${provider}`);
        if (modelId) console.log(`Model: ${modelId}`);
        if (baseUrl) console.log(`Base URL: ${baseUrl}`);

        startGateway({
          port,
          provider: provider as any,
          modelId,
          baseUrl,
          apiKey,
        });

        console.log("\nEndpoints:");
        console.log("  GET  /health          - Health check");
        console.log("  POST /mcp/tools/list  - List MCP tools");
        console.log("  POST /mcp/tools/call  - Call MCP tool");
        console.log("  GET  /api/health/*    - Health data REST API");
        console.log("  WS   /ws              - WebSocket (A2UI)");
        console.log("\nPress Ctrl+C to stop.");
      }
    });

  // gateway run (internal, used for daemon mode)
  gatewayCmd
    .command("run")
    .description("Run the gateway (used internally)")
    .option("-p, --port <number>", "Port")
    .option("--provider <string>", "Provider")
    .option("--model <string>", "Model")
    .option("--base-url <string>", "Base URL")
    .action(async (options) => {
      const config = loadConfig();
      const port = options.port ? parseInt(options.port, 10) : config.gateway.port;
      const apiKey = process.env.PHA_API_KEY || getApiKey(config);

      fs.writeFileSync(PID_FILE, String(process.pid));

      startGateway({
        port,
        provider: (options.provider || config.llm.provider) as any,
        modelId: options.model || config.llm.modelId,
        baseUrl: options.baseUrl || config.llm.baseUrl,
        apiKey,
      });
    });

  // gateway stop
  gatewayCmd
    .command("stop")
    .description("Stop the gateway server")
    .action(() => {
      const pid = getPid();
      if (!pid) {
        console.log("Gateway is not running (no PID file)");
        return;
      }

      if (!isRunning(pid)) {
        console.log(`Gateway process ${pid} is not running`);
        fs.unlinkSync(PID_FILE);
        return;
      }

      try {
        process.kill(pid, "SIGTERM");
        console.log(`Stopped gateway (PID: ${pid})`);
        fs.unlinkSync(PID_FILE);
      } catch (e) {
        console.error("Failed to stop gateway:", e);
      }
    });

  // gateway restart
  gatewayCmd
    .command("restart")
    .description("Restart the gateway server")
    .option("-d, --daemon", "Run as background daemon")
    .action(async (options) => {
      const pid = getPid();
      if (pid && isRunning(pid)) {
        process.kill(pid, "SIGTERM");
        fs.unlinkSync(PID_FILE);
        console.log(`Stopped gateway (PID: ${pid})`);
        // Wait a bit for port to be released
        await new Promise(r => setTimeout(r, 500));
      }

      // Re-run start command
      const { execSync } = await import("child_process");
      const args = options.daemon ? "-d" : "";
      execSync(`${process.argv[0]} ${process.argv[1]} gateway start ${args}`, {
        stdio: "inherit",
      });
    });

  // gateway status
  gatewayCmd
    .command("status")
    .description("Check gateway status")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      const config = loadConfig();
      const pid = getPid();
      const running = pid && isRunning(pid);

      const status = {
        running,
        pid: running ? pid : null,
        port: config.gateway.port,
        provider: config.llm.provider,
        model: config.llm.modelId,
        url: running ? `http://localhost:${config.gateway.port}` : null,
      };

      if (options.json) {
        console.log(JSON.stringify(status, null, 2));
      } else {
        console.log("\nGateway Status\n");
        console.log(`  Status: ${running ? "\x1b[32m✓ Running\x1b[0m" : "\x1b[31m✗ Stopped\x1b[0m"}`);
        if (running) {
          console.log(`  PID: ${pid}`);
          console.log(`  URL: http://localhost:${config.gateway.port}`);
          console.log(`  WebSocket: ws://localhost:${config.gateway.port}/ws`);
        }
        console.log(`  Provider: ${config.llm.provider}`);
        if (config.llm.modelId) {
          console.log(`  Model: ${config.llm.modelId}`);
        }
        console.log("");
      }
    });

  // gateway logs
  gatewayCmd
    .command("logs")
    .description("View gateway logs")
    .option("-f, --follow", "Follow log output")
    .option("-n, --lines <number>", "Number of lines to show", "50")
    .action(async (options) => {
      if (!fs.existsSync(LOG_FILE)) {
        console.log("No log file found.");
        return;
      }

      if (options.follow) {
        const { spawn } = await import("child_process");
        spawn("tail", ["-f", LOG_FILE], { stdio: "inherit" });
      } else {
        const { execSync } = await import("child_process");
        const output = execSync(`tail -n ${options.lines} "${LOG_FILE}"`, { encoding: "utf-8" });
        console.log(output);
      }
    });

  // gateway health
  gatewayCmd
    .command("health")
    .description("Check gateway health endpoint")
    .action(async () => {
      const config = loadConfig();
      const url = `http://localhost:${config.gateway.port}/health`;

      try {
        const response = await fetch(url);
        const data = await response.json();
        console.log("Gateway Health:", JSON.stringify(data, null, 2));
      } catch (e) {
        console.log("Gateway is not reachable at", url);
      }
    });
}
