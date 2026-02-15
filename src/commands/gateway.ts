/**
 * Gateway command - Manage the gateway server
 *
 * Most commands are aliases for `pha start/stop/restart`.
 * Provides additional utility commands like logs, status, health.
 */

import type { Command } from "commander";
import { loadConfig } from "../utils/config.js";
import { getStateDir } from "../utils/config.js";
import * as fs from "fs";
import * as path from "path";
import { c, info, printKV } from "../utils/cli-ui.js";

function getPidFile(): string {
  return path.join(getStateDir(), "gateway.pid");
}

function getLogFile(): string {
  return path.join(getStateDir(), "gateway.log");
}

function getPid(): number | null {
  const pidFile = getPidFile();
  if (!fs.existsSync(pidFile)) return null;
  try {
    return parseInt(fs.readFileSync(pidFile, "utf-8").trim(), 10);
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

export function registerGatewayCommand(program: Command): void {
  const gatewayCmd = program
    .command("gateway")
    .description("Manage the PHA gateway server (alias for start/stop)");

  // gateway start - alias for `pha start`
  gatewayCmd
    .command("start")
    .description("Start the gateway server (alias for: pha start)")
    .option("-p, --port <number>", "Port to listen on")
    .option("-f, --foreground", "Run in foreground")
    .option("-d, --daemon", "Run as daemon (default)")
    .action(async (options) => {
      info("Tip: You can use `pha start` directly");
      console.log("");

      const { execSync } = await import("child_process");
      const args: string[] = [];
      if (options.port) args.push("-p", options.port);
      if (options.foreground) args.push("-f");

      try {
        execSync(`${process.argv[0]} ${process.argv[1]} start ${args.join(" ")}`, {
          stdio: "inherit",
        });
      } catch {
        // execSync throws on non-zero exit, ignore
      }
    });

  // gateway stop - alias for `pha stop`
  gatewayCmd
    .command("stop")
    .description("Stop the gateway server (alias for: pha stop)")
    .action(async () => {
      const { execSync } = await import("child_process");
      try {
        execSync(`${process.argv[0]} ${process.argv[1]} stop`, { stdio: "inherit" });
      } catch {
        // ignore
      }
    });

  // gateway restart - alias for `pha restart`
  gatewayCmd
    .command("restart")
    .description("Restart the gateway server (alias for: pha restart)")
    .action(async () => {
      const { execSync } = await import("child_process");
      try {
        execSync(`${process.argv[0]} ${process.argv[1]} restart`, { stdio: "inherit" });
      } catch {
        // ignore
      }
    });

  // gateway status
  gatewayCmd
    .command("status")
    .description("Check gateway status")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      const config = loadConfig();
      const pid = getPid();
      const running = pid ? isRunning(pid) : false;

      const phaRef = config.orchestrator?.pha;
      const provider = phaRef ? phaRef.split("/")[0] : config.llm.provider;
      const model = phaRef || config.llm.modelId;
      const status = {
        running,
        pid: running ? pid : null,
        port: config.gateway.port,
        provider,
        model,
        url: running ? `http://localhost:${config.gateway.port}` : null,
      };

      if (options.json) {
        console.log(JSON.stringify(status, null, 2));
      } else {
        console.log("");
        console.log(`  Status: ${running ? c.green("Running") : c.red("Stopped")}`);
        if (running) {
          printKV("PID", String(pid));
          printKV("URL", c.cyan(`http://localhost:${config.gateway.port}`));
        }
        printKV("Provider", config.llm.provider);
        if (config.llm.modelId) {
          printKV("Model", config.llm.modelId);
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
      const logFile = getLogFile();
      if (!fs.existsSync(logFile)) {
        console.log("No log file found at:", logFile);
        return;
      }

      if (options.follow) {
        const { spawn } = await import("child_process");
        spawn("tail", ["-f", logFile], { stdio: "inherit" });
      } else {
        const { execSync } = await import("child_process");
        try {
          const output = execSync(`tail -n ${options.lines} "${logFile}"`, {
            encoding: "utf-8",
          });
          console.log(output);
        } catch {
          console.log("Failed to read log file");
        }
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
      } catch {
        console.log("Gateway is not reachable at", url);
      }
    });
}
