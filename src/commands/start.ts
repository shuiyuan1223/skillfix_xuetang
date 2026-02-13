/**
 * Start command - Start PHA gateway and open browser
 */

import type { Command } from "commander";
import { startGateway } from "../gateway/index.js";
import { loadConfig, PROVIDER_CONFIGS, type LLMProvider } from "../utils/config.js";
import * as fs from "fs";
import * as path from "path";
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
import { getStateDir, ensureConfigDir } from "../utils/config.js";

// PID and log files in project .pha/ directory
function getPidFile(): string {
  return path.join(getStateDir(), "gateway.pid");
}

function getLogFile(): string {
  return path.join(getStateDir(), "gateway.log");
}

function getPid(): number | null {
  if (!fs.existsSync(getPidFile())) return null;
  try {
    return parseInt(fs.readFileSync(getPidFile(), "utf-8").trim(), 10);
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
            // Open browser using spawn to avoid blocking exit
            const { spawn } = await import("child_process");
            const platform = process.platform;
            if (platform === "darwin") {
              spawn("open", [`http://localhost:${port}`], {
                detached: true,
                stdio: "ignore",
              }).unref();
            } else if (platform === "win32") {
              spawn("cmd", ["/c", "start", "", `http://localhost:${port}`], {
                detached: true,
                stdio: "ignore",
              }).unref();
            } else {
              spawn("xdg-open", [`http://localhost:${port}`], {
                detached: true,
                stdio: "ignore",
              }).unref();
            }
          }
          process.exit(0);
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

        await startGateway({
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

        ensureConfigDir();

        const child = spawn(process.argv[0], args, {
          detached: true,
          stdio: ["ignore", fs.openSync(getLogFile(), "a"), fs.openSync(getLogFile(), "a")],
          env: {
            ...process.env,
            PHA_API_KEY: apiKey,
          },
        });

        fs.writeFileSync(getPidFile(), String(child.pid));
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
          printKV("Logs", c.dim(getLogFile()));
          console.log("");
          printDivider();
          console.log(`\n  ${c.cyan("pha stop")}    ${c.dim("Stop the server")}`);
          console.log(`  ${c.cyan("pha logs -f")} ${c.dim("Follow the logs")}`);
          console.log(`  ${c.cyan("pha status")}  ${c.dim("Check status")}`);
          console.log("");

          if (options.open !== false) {
            // Open browser using spawn to avoid blocking
            const { spawn: spawnBrowser } = await import("child_process");
            const platform = process.platform;
            if (platform === "darwin") {
              spawnBrowser("open", [`http://localhost:${port}`], {
                detached: true,
                stdio: "ignore",
              }).unref();
            } else if (platform === "win32") {
              spawnBrowser("cmd", ["/c", "start", "", `http://localhost:${port}`], {
                detached: true,
                stdio: "ignore",
              }).unref();
            } else {
              spawnBrowser("xdg-open", [`http://localhost:${port}`], {
                detached: true,
                stdio: "ignore",
              }).unref();
            }
          }
          process.exit(0);
        } else {
          spinner.stop("error");
          fatal("Failed to start PHA", `Check logs: ${getLogFile()}`);
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
        fs.unlinkSync(getPidFile());
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

            if (fs.existsSync(getPidFile())) {
              fs.unlinkSync(getPidFile());
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
                if (fs.existsSync(getPidFile())) {
                  fs.unlinkSync(getPidFile());
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

      // Now start (with --no-open since browser is already open)
      const { spawnSync } = await import("child_process");
      spawnSync(process.argv[0], [process.argv[1], "start", "--no-open"], {
        stdio: "inherit",
      });
      process.exit(0);
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
