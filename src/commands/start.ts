/**
 * Start command - Start PHA gateway and open browser
 */

import type { Command } from "commander";
import { startGateway } from "../gateway/index.js";
import { loadConfig, PROVIDER_CONFIGS, type LLMProvider } from "../utils/config.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  printHeader,
  printKV,
  printDivider,
  c,
  icons,
  Spinner,
  fatal,
  success,
  info,
  warn,
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
    // From dist/commands/ -> ui/dist
    path.join(cliDir, "../../ui/dist"),
    // From project root
    path.join(process.cwd(), "ui/dist"),
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
      const providerCfg = PROVIDER_CONFIGS[config.llm.provider as LLMProvider];

      // Check if already running (skip this check in foreground mode, as we are the server)
      if (!options.foreground) {
        const existingPid = getPid();
        if (existingPid && isRunning(existingPid)) {
          info(`PHA is already running ${c.dim(`(PID: ${existingPid})`)}`);
          console.log(`\n  ${c.cyan(`http://localhost:${port}`)}\n`);
          if (options.open !== false) {
            openBrowser(`http://localhost:${port}`);
          }
          return;
        }
      }

      if (!apiKey) {
        fatal(
          "No API key found",
          `Run ${c.cyan("pha onboard")} or set ${c.cyan(providerCfg?.envVar || "API_KEY")}`
        );
      }

      if (!webDir) {
        warn("Web UI not found", "Run from project root or rebuild with: bun run build:ui");
      }

      if (options.foreground) {
        // Run in foreground
        console.log("");
        printHeader(`${icons.server} PHA Gateway`, "Foreground Mode");

        printKV("URL", c.cyan(`http://localhost:${port}`));
        printKV("Provider", providerCfg?.name || config.llm.provider);
        if (config.llm.modelId) {
          printKV("Model", config.llm.modelId);
        }
        printKV("Web UI", webDir ? c.green("Enabled") : c.yellow("Disabled"));

        console.log("");
        printDivider();
        console.log(`  ${c.dim("Press")} ${c.cyan("Ctrl+C")} ${c.dim("to stop")}`);
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
        const spinner = new Spinner("Starting PHA...");
        spinner.start();

        const { spawn } = await import("child_process");
        const args = [process.argv[1], "start", "-f", "-p", String(port), "--no-open"];

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

        // Wait a moment to verify it started
        await new Promise((resolve) => setTimeout(resolve, 500));

        if (isRunning(child.pid!)) {
          spinner.stop("success");

          console.log("");
          console.log(`  ${c.bold("PHA is running!")}`);
          console.log("");
          printKV("URL", c.cyan(`http://localhost:${port}`));
          printKV("PID", String(child.pid));
          printKV("Logs", c.dim(LOG_FILE));
          console.log("");
          printDivider();
          console.log(`\n  ${c.cyan("pha stop")}    ${c.dim("Stop the server")}`);
          console.log(`  ${c.cyan("pha logs -f")} ${c.dim("Follow the logs")}`);
          console.log(`  ${c.cyan("pha status")}  ${c.dim("Check status")}`);
          console.log("");

          if (options.open !== false) {
            setTimeout(() => openBrowser(`http://localhost:${port}`), 300);
          }
        } else {
          spinner.stop("error");
          fatal("Failed to start PHA", `Check logs: ${LOG_FILE}`);
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
        info("PHA is not running");
        return;
      }

      if (!isRunning(pid)) {
        info("PHA process not found, cleaning up stale PID file...");
        fs.unlinkSync(PID_FILE);
        return;
      }

      const spinner = new Spinner("Stopping PHA...");
      spinner.start();

      try {
        process.kill(pid, "SIGTERM");

        // Wait for process to actually stop
        let attempts = 0;
        const maxAttempts = 20;
        const checkInterval = setInterval(() => {
          attempts++;
          if (!isRunning(pid) || attempts >= maxAttempts) {
            clearInterval(checkInterval);

            if (fs.existsSync(PID_FILE)) {
              fs.unlinkSync(PID_FILE);
            }

            if (attempts >= maxAttempts && isRunning(pid)) {
              spinner.stop("warning");
              warn("Process may still be running, force kill with: kill -9 " + pid);
            } else {
              spinner.stop("success");
              success("PHA stopped");
            }
          }
        }, 100);
      } catch (e) {
        spinner.stop("error");
        fatal("Failed to stop PHA", String(e));
      }
    });

  // Restart command
  program
    .command("restart")
    .description("Restart PHA gateway server")
    .action(async () => {
      const pid = getPid();
      if (pid && isRunning(pid)) {
        const spinner = new Spinner("Restarting PHA...");
        spinner.start();

        try {
          process.kill(pid, "SIGTERM");

          // Wait for process to stop
          await new Promise<void>((resolve) => {
            let attempts = 0;
            const check = setInterval(() => {
              attempts++;
              if (!isRunning(pid) || attempts >= 20) {
                clearInterval(check);
                if (fs.existsSync(PID_FILE)) {
                  fs.unlinkSync(PID_FILE);
                }
                resolve();
              }
            }, 100);
          });

          spinner.stop("success");
        } catch (e) {
          spinner.stop("error");
          fatal("Failed to stop PHA", String(e));
        }
      }

      // Now start
      const { exec } = await import("child_process");
      exec(`${process.argv[0]} ${process.argv[1]} start`, (err) => {
        if (err) {
          fatal("Failed to start PHA", err.message);
        }
      });
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
