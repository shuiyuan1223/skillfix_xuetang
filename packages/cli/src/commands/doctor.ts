/**
 * Doctor command - Health checks and quick fixes
 */

import type { Command } from "commander";
import { isConfigured, loadConfig, getConfigPath, ensureConfigDir, saveConfig, getConfigDir } from "../utils/config.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

interface Check {
  name: string;
  status: "pass" | "warn" | "fail";
  message: string;
  fix?: () => void;
}

const PID_FILE = path.join(os.homedir(), ".pha", "gateway.pid");

export function registerDoctorCommand(program: Command): void {
  program
    .command("doctor")
    .description("Run health checks and diagnose issues")
    .option("--fix", "Automatically fix issues where possible")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      const checks: Check[] = [];

      // Check 1: Configuration exists
      const configExists = isConfigured();
      checks.push({
        name: "Configuration",
        status: configExists ? "pass" : "warn",
        message: configExists ? "Configuration file exists" : "No configuration file found",
        fix: configExists ? undefined : () => {
          ensureConfigDir();
          saveConfig({
            gateway: { port: 8000, autoStart: false },
            llm: { provider: "anthropic" },
            dataSources: { type: "mock" },
            tui: { theme: "dark", showToolCalls: true },
          });
        },
      });

      // Check 2: Config directory permissions
      const configDir = getConfigDir();
      let configDirWritable = false;
      try {
        ensureConfigDir();
        const testFile = path.join(configDir, ".test");
        fs.writeFileSync(testFile, "test");
        fs.unlinkSync(testFile);
        configDirWritable = true;
      } catch {
        configDirWritable = false;
      }
      checks.push({
        name: "Config Directory",
        status: configDirWritable ? "pass" : "fail",
        message: configDirWritable ? `${configDir} is writable` : `${configDir} is not writable`,
      });

      // Check 3: API Key
      const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
      const hasOpenAI = !!process.env.OPENAI_API_KEY;
      const hasGoogle = !!process.env.GOOGLE_API_KEY;
      const hasAnyKey = hasAnthropic || hasOpenAI || hasGoogle;
      checks.push({
        name: "API Key",
        status: hasAnyKey ? "pass" : "fail",
        message: hasAnyKey
          ? `Found API key for: ${[hasAnthropic && "Anthropic", hasOpenAI && "OpenAI", hasGoogle && "Google"].filter(Boolean).join(", ")}`
          : "No API key found in environment",
      });

      // Check 4: Bun runtime
      const hasBun = typeof Bun !== "undefined";
      checks.push({
        name: "Bun Runtime",
        status: hasBun ? "pass" : "warn",
        message: hasBun ? `Bun ${Bun.version}` : "Not running on Bun",
      });

      // Check 5: Gateway PID file
      const pidFileExists = fs.existsSync(PID_FILE);
      let pidFileValid = false;
      if (pidFileExists) {
        try {
          const pid = parseInt(fs.readFileSync(PID_FILE, "utf-8").trim(), 10);
          try {
            process.kill(pid, 0);
            pidFileValid = true;
          } catch {
            pidFileValid = false;
          }
        } catch {
          pidFileValid = false;
        }
      }

      if (pidFileExists && !pidFileValid) {
        checks.push({
          name: "Gateway PID",
          status: "warn",
          message: "Stale PID file found",
          fix: () => {
            fs.unlinkSync(PID_FILE);
          },
        });
      } else {
        checks.push({
          name: "Gateway PID",
          status: "pass",
          message: pidFileExists ? "Gateway is running" : "No stale PID file",
        });
      }

      // Check 6: Port availability (if gateway not running)
      if (!pidFileValid && configExists) {
        const config = loadConfig();
        const port = config.gateway.port;
        let portAvailable = true;
        try {
          const server = Bun.serve({
            port,
            fetch: () => new Response("test"),
          });
          server.stop();
        } catch {
          portAvailable = false;
        }

        checks.push({
          name: "Gateway Port",
          status: portAvailable ? "pass" : "warn",
          message: portAvailable ? `Port ${port} is available` : `Port ${port} is in use`,
        });
      }

      // Output results
      if (options.json) {
        console.log(JSON.stringify(checks, null, 2));
        return;
      }

      console.log("\n🩺 PHA Doctor\n");
      console.log("━".repeat(50));

      const statusIcons = {
        pass: "✓",
        warn: "⚠",
        fail: "✗",
      };

      const statusColors = {
        pass: "\x1b[32m",
        warn: "\x1b[33m",
        fail: "\x1b[31m",
      };

      const reset = "\x1b[0m";

      for (const check of checks) {
        const icon = statusIcons[check.status];
        const color = statusColors[check.status];
        console.log(`\n${color}${icon}${reset} ${check.name}`);
        console.log(`   ${check.message}`);

        if (check.fix && options.fix && check.status !== "pass") {
          try {
            check.fix();
            console.log(`   \x1b[32m→ Fixed!\x1b[0m`);
          } catch (e) {
            console.log(`   \x1b[31m→ Fix failed: ${e}\x1b[0m`);
          }
        } else if (check.fix && check.status !== "pass") {
          console.log(`   \x1b[36m→ Run with --fix to auto-fix\x1b[0m`);
        }
      }

      // Summary
      const passCount = checks.filter(c => c.status === "pass").length;
      const warnCount = checks.filter(c => c.status === "warn").length;
      const failCount = checks.filter(c => c.status === "fail").length;

      console.log("\n" + "━".repeat(50));
      console.log(`\n📊 Summary: ${passCount} passed, ${warnCount} warnings, ${failCount} failed\n`);

      if (failCount > 0) {
        console.log("🔧 Quick fixes:");
        if (!hasAnyKey) {
          console.log("   export ANTHROPIC_API_KEY=sk-ant-...");
        }
        if (!configExists) {
          console.log("   pha setup");
        }
        console.log("");
      } else if (warnCount === 0) {
        console.log("🎉 All checks passed! You're good to go.\n");
      }
    });
}
