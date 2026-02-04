/**
 * Start command - Start PHA gateway and open browser
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

function getApiKey(config: ReturnType<typeof loadConfig>): string | undefined {
  if (config.llm.apiKey) {
    return config.llm.apiKey;
  }
  const provider = config.llm.provider as LLMProvider;
  const providerConfig = PROVIDER_CONFIGS[provider];
  if (providerConfig) {
    return process.env[providerConfig.envVar];
  }
  return undefined;
}

function getWebDir(): string {
  // Find the web dist directory
  // import.meta.url gives us the file:// URL of this module
  const cliDir = new URL(".", import.meta.url).pathname;

  const possiblePaths = [
    // From packages/cli/dist/commands/ -> packages/web/dist
    path.join(cliDir, "../../../web/dist"),
    // From project root
    path.join(process.cwd(), "packages/web/dist"),
  ];

  for (const p of possiblePaths) {
    const resolved = path.resolve(p);
    if (fs.existsSync(resolved)) {
      return resolved;
    }
  }

  return "";
}

export function registerStartCommand(program: Command): void {
  program
    .command("start")
    .description("Start PHA gateway server (background) and open browser")
    .option("-p, --port <number>", "Port to listen on")
    .option("--no-open", "Don't open browser")
    .option("-f, --foreground", "Run in foreground (don't daemonize)")
    .action(async (options) => {
      const config = loadConfig();
      const port = options.port ? parseInt(options.port, 10) : config.gateway.port;
      const apiKey = getApiKey(config);
      const webDir = getWebDir();

      // Check if already running
      const existingPid = getPid();
      if (existingPid && isRunning(existingPid)) {
        console.log(`PHA already running (PID: ${existingPid})`);
        console.log(`Open: http://localhost:${port}`);
        if (options.open !== false) {
          openBrowser(`http://localhost:${port}`);
        }
        return;
      }

      if (!apiKey) {
        const providerConfig = PROVIDER_CONFIGS[config.llm.provider as LLMProvider];
        console.error("\x1b[31mError: No API key found\x1b[0m");
        console.error("\nRun 'pha onboard' to configure your LLM provider.");
        console.error(`Or set: export ${providerConfig?.envVar || "API_KEY"}=...`);
        return;
      }

      if (!webDir) {
        console.error("\x1b[33mWarning: Web UI not found. Run from project root or rebuild.\x1b[0m");
      }

      if (options.foreground) {
        // Run in foreground
        console.log(`Starting PHA on http://localhost:${port}`);
        console.log(`Provider: ${config.llm.provider}`);
        if (config.llm.modelId) console.log(`Model: ${config.llm.modelId}`);
        console.log("");

        if (options.open !== false) {
          setTimeout(() => openBrowser(`http://localhost:${port}`), 500);
        }

        startGateway({
          port,
          provider: config.llm.provider as any,
          modelId: config.llm.modelId,
          baseUrl: config.llm.baseUrl,
          apiKey,
          webDir,
        });
      } else {
        // Spawn as background process
        const { spawn } = await import("child_process");
        const args = [
          process.argv[1],
          "start",
          "-f",
          "-p", String(port),
          "--no-open",
        ];

        fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });

        const child = spawn(process.argv[0], args, {
          detached: true,
          stdio: ["ignore", fs.openSync(LOG_FILE, "a"), fs.openSync(LOG_FILE, "a")],
          env: {
            ...process.env,
            PHA_API_KEY: apiKey,
          },
        });

        fs.writeFileSync(PID_FILE, String(child.pid));
        child.unref();

        console.log(`\x1b[32mPHA started!\x1b[0m (PID: ${child.pid})`);
        console.log(`\nOpen: \x1b[36mhttp://localhost:${port}\x1b[0m`);
        console.log(`Logs: ${LOG_FILE}`);
        console.log(`\nStop: \x1b[33mpha stop\x1b[0m`);

        if (options.open !== false) {
          setTimeout(() => openBrowser(`http://localhost:${port}`), 300);
        }
      }
    });

  // Stop command
  program
    .command("stop")
    .description("Stop PHA gateway server")
    .action(() => {
      const pid = getPid();
      if (!pid) {
        console.log("PHA is not running");
        return;
      }

      if (!isRunning(pid)) {
        console.log("PHA process not found, cleaning up...");
        fs.unlinkSync(PID_FILE);
        return;
      }

      try {
        process.kill(pid, "SIGTERM");
        fs.unlinkSync(PID_FILE);
        console.log("\x1b[32mPHA stopped\x1b[0m");
      } catch (e) {
        console.error("Failed to stop PHA:", e);
      }
    });
}

async function openBrowser(url: string) {
  const { exec } = await import("child_process");
  const platform = process.platform;

  let cmd: string;
  if (platform === "darwin") {
    cmd = `open "${url}"`;
  } else if (platform === "win32") {
    cmd = `start "" "${url}"`;
  } else {
    cmd = `xdg-open "${url}"`;
  }

  exec(cmd, (err) => {
    if (err) {
      console.log(`Open in browser: ${url}`);
    }
  });
}
