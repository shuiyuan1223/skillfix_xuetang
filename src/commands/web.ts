/**
 * Web command - Open PHA web UI in browser
 */

import type { Command } from "commander";
import { loadConfig } from "../utils/config.js";
import { c, info, fatal } from "../utils/cli-ui.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const PID_FILE = path.join(os.homedir(), ".pha", "gateway.pid");

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

export function registerWebCommand(program: Command): void {
  // pha web — open web UI
  program
    .command("web")
    .description("Open PHA web UI in browser")
    .option("-p, --port <number>", "Port (default: from config)")
    .action(async (options) => {
      const config = loadConfig();
      const port = options.port ? parseInt(options.port, 10) : config.gateway.port;
      const webBasePath = (config.gateway.basePath || "").replace(/\/+$/, "");
      const url = `http://localhost:${port}${webBasePath}`;

      const pid = getPid();
      if (!pid || !isRunning(pid)) {
        fatal("PHA is not running", `Start it first with: ${c.cyan("pha start")}`);
        return;
      }

      info(`Opening ${c.cyan(url)}`);
      await openBrowser(url);
      process.exit(0);
    });

  // pha dashboard — alias for pha web, opens browser
  program
    .command("dashboard")
    .alias("dash")
    .description("Open PHA dashboard in browser (alias for 'pha web')")
    .option("-p, --port <number>", "Port (default: from config)")
    .action(async (options) => {
      const config = loadConfig();
      const port = options.port ? parseInt(options.port, 10) : config.gateway.port;
      const dashBasePath = (config.gateway.basePath || "").replace(/\/+$/, "");
      const url = `http://localhost:${port}${dashBasePath}`;

      const pid = getPid();
      if (!pid || !isRunning(pid)) {
        fatal("PHA is not running", `Start it first with: ${c.cyan("pha start")}`);
        return;
      }

      info(`Opening dashboard ${c.cyan(url)}`);
      await openBrowser(url);
      process.exit(0);
    });
}
