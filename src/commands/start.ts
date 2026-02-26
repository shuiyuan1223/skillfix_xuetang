/**
 * Start command - Start PHA gateway and open browser
 */

import type { Command } from "commander";
import { startGateway } from "../gateway/index.js";
import {
  loadConfig,
  PROVIDER_CONFIGS,
  resolveAgentModel,
  type LLMProvider,
} from "../utils/config.js";
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

// Local getApiKey() removed — use resolveAgentModel() instead

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

async function spawnBrowserDetached(url: string): Promise<void> {
  const { spawn } = await import("child_process");
  const platform = process.platform;
  if (platform === "darwin") {
    spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
  } else if (platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
  } else {
    spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
  }
}

async function startForeground(
  gwUrl: string,
  options: { open?: boolean },
  params: {
    host: string;
    port: number;
    gwBasePath: string;
    agentModel: ReturnType<typeof resolveAgentModel> | null;
    config: ReturnType<typeof loadConfig>;
    apiKey: string;
    webDir: string;
    providerCfg: (typeof PROVIDER_CONFIGS)[LLMProvider];
  }
): Promise<void> {
  const { host, port, gwBasePath, agentModel, config, apiKey, webDir, providerCfg } = params;
  console.log("");
  printHeader(`${icons.server} PHA Gateway`, "Foreground Mode");
  printKV("URL", c.cyan(gwUrl));
  printKV("Provider", providerCfg?.name || agentModel?.provider || config.llm.provider);
  printKV("Model", agentModel?.modelId || config.llm.modelId || "default");
  printKV("Web UI", webDir ? c.green("Enabled") : c.yellow("Disabled"));
  console.log("");
  printDivider();
  console.log(`  ${c.dim("Press")} ${c.cyan("Ctrl+C")} ${c.dim("to stop")}`);
  console.log("");

  if (options.open !== false) {
    setTimeout(() => openBrowser(gwUrl), 500);
  }

  await startGateway({
    host,
    port,
    basePath: gwBasePath,
    provider: (agentModel?.provider || config.llm.provider) as LLMProvider,
    modelId: agentModel?.modelId || config.llm.modelId,
    baseUrl: agentModel?.baseUrl || config.llm.baseUrl,
    apiKey,
    webDir,
  });
}

async function startBackground(
  gwUrl: string,
  options: { open?: boolean },
  params: { port: number; apiKey: string }
): Promise<void> {
  const spinner = new Spinner("Starting PHA...");
  spinner.start();

  const { spawn } = await import("child_process");
  const args = [process.argv[1], "start", "-f", "-p", String(params.port), "--no-open"];
  ensureConfigDir();

  const child = spawn(process.argv[0], args, {
    detached: true,
    stdio: ["ignore", fs.openSync(getLogFile(), "a"), fs.openSync(getLogFile(), "a")],
    env: { ...process.env, PHA_API_KEY: params.apiKey, CLAUDECODE: undefined },
  });

  fs.writeFileSync(getPidFile(), String(child.pid));
  child.unref();

  await new Promise((resolve) => setTimeout(resolve, 500));

  if (isRunning(child.pid!)) {
    spinner.stop("success");
    console.log("");
    console.log(`  ${c.bold("PHA is running!")}`);
    console.log("");
    printKV("URL", c.cyan(gwUrl));
    printKV("PID", String(child.pid));
    printKV("Logs", c.dim(getLogFile()));
    console.log("");
    printDivider();
    console.log(`\n  ${c.cyan("pha stop")}    ${c.dim("Stop the server")}`);
    console.log(`  ${c.cyan("pha logs -f")} ${c.dim("Follow the logs")}`);
    console.log(`  ${c.cyan("pha status")}  ${c.dim("Check status")}`);
    console.log("");

    if (options.open !== false) {
      await spawnBrowserDetached(gwUrl);
    }
    process.exit(0);
  } else {
    spinner.stop("error");
    fatal("Failed to start PHA", `Check logs: ${getLogFile()}`);
  }
}

async function handleStart(options: {
  port?: string;
  open?: boolean;
  foreground?: boolean;
}): Promise<void> {
  const config = loadConfig();
  const host = config.gateway.host || "0.0.0.0";
  const port = options.port ? parseInt(options.port, 10) : config.gateway.port;
  const gwBasePath = (config.gateway.basePath || "").replace(/\/+$/, "");
  const gwUrl = `http://localhost:${port}${gwBasePath}`;
  let agentModel: ReturnType<typeof resolveAgentModel> | null = null;
  let apiKey: string | undefined;
  try {
    agentModel = resolveAgentModel(config);
    apiKey = agentModel.apiKey;
  } catch {
    // API key not found — will be caught below
  }
  const webDir = getWebDir();
  const providerCfg = PROVIDER_CONFIGS[agentModel?.provider || config.llm.provider];

  if (!options.foreground) {
    const existingPid = getPid();
    if (existingPid && isRunning(existingPid)) {
      info(`PHA is already running ${c.dim(`(PID: ${existingPid})`)}`);
      console.log(`\n  ${c.cyan(gwUrl)}\n`);
      if (options.open !== false) {
        await spawnBrowserDetached(gwUrl);
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
    await startForeground(gwUrl, options, {
      host,
      port,
      gwBasePath,
      agentModel,
      config,
      apiKey,
      webDir,
      providerCfg,
    });
  } else {
    await startBackground(gwUrl, options, { port, apiKey });
  }
}

function handleStop(): void {
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
          warn(`Process may still be running, force kill with: kill -9 ${pid}`);
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
}

async function killExistingProcess(pid: number): Promise<void> {
  try {
    process.kill(pid, "SIGTERM");
    await new Promise<void>((resolve) => {
      let attempts = 0;
      const check = setInterval(() => {
        attempts++;
        if (!isRunning(pid) || attempts >= 30) {
          clearInterval(check);
          resolve();
        }
      }, 100);
    });
    if (isRunning(pid)) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // ignore
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  } catch {
    // ignore
  }
}

async function freePort(port: number): Promise<void> {
  try {
    const { execSync } = await import("child_process");
    const portPids = execSync(`lsof -ti:${port} 2>/dev/null`, { encoding: "utf-8" }).trim();
    if (portPids) {
      for (const p of portPids.split("\n")) {
        const n = parseInt(p, 10);
        if (n > 0) {
          try {
            process.kill(n, "SIGKILL");
          } catch {
            // ignore
          }
        }
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  } catch {
    // lsof returns non-zero if no process found — that's fine
  }
}

async function handleRestart(): Promise<void> {
  const config = loadConfig();
  const port = config.gateway.port;
  const pid = getPid();

  const spinner = new Spinner("Restarting PHA...");
  spinner.start();

  if (pid && isRunning(pid)) {
    await killExistingProcess(pid);
  }

  if (fs.existsSync(getPidFile())) {
    fs.unlinkSync(getPidFile());
  }

  await freePort(port);
  await new Promise((r) => setTimeout(r, 300));
  spinner.stop("success");

  const { spawnSync } = await import("child_process");
  spawnSync(process.argv[0], [process.argv[1], "start", "--no-open"], {
    stdio: "inherit",
  });
  process.exit(0);
}

export function registerStartCommand(program: Command): void {
  program
    .command("start")
    .description("Start PHA gateway server (background) and open browser")
    .option("-p, --port <number>", "Port to listen on")
    .option("--no-open", "Don't open browser")
    .option("-f, --foreground", "Run in foreground (don't daemonize)")
    .action(handleStart);

  program.command("stop").description("Stop PHA gateway server").action(handleStop);

  program.command("restart").description("Restart PHA gateway server").action(handleRestart);
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
