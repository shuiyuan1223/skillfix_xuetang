/**
 * Doctor command - Health checks and quick fixes
 */

import type { Command } from "commander";
import {
  isConfigured,
  loadConfig,
  getConfigPath,
  ensureConfigDir,
  saveConfig,
  getConfigDir,
  PROVIDER_CONFIGS,
  type LLMProvider,
} from "../utils/config.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  printHeader,
  printSection,
  printStatus,
  printDivider,
  c,
  icons,
  Spinner,
} from "../utils/cli-ui.js";

interface Check {
  name: string;
  status: "pass" | "warn" | "fail";
  message: string;
  detail?: string;
  fix?: () => void;
  fixHint?: string;
}

const PID_FILE = path.join(os.homedir(), ".pha", "gateway.pid");

export function registerDoctorCommand(program: Command): void {
  program
    .command("doctor")
    .description("Run health checks and diagnose issues")
    .option("--fix", "Automatically fix issues where possible")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      const spinner = new Spinner("Running diagnostics...");
      if (!options.json) spinner.start();

      const checks: Check[] = [];

      // Check 1: Configuration exists
      const configExists = isConfigured();
      checks.push({
        name: "Configuration",
        status: configExists ? "pass" : "warn",
        message: configExists ? "Configuration file exists" : "No configuration file found",
        detail: configExists ? getConfigPath() : undefined,
        fix: configExists
          ? undefined
          : () => {
              ensureConfigDir();
              saveConfig({
                gateway: { host: "0.0.0.0", port: 8000, autoStart: false },
                llm: { provider: "anthropic" },
                dataSources: { type: "mock" },
                tui: { theme: "dark", showToolCalls: true },
              });
            },
        fixHint: "pha setup",
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
        message: configDirWritable ? "Directory is writable" : "Directory is not writable",
        detail: configDir,
      });

      // Check 3: API Key
      const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
      const hasOpenAI = !!process.env.OPENAI_API_KEY;
      const hasGoogle = !!process.env.GOOGLE_API_KEY;
      const hasOpenRouter = !!process.env.OPENROUTER_API_KEY;
      const foundProviders = [
        hasAnthropic && "Anthropic",
        hasOpenAI && "OpenAI",
        hasGoogle && "Google",
        hasOpenRouter && "OpenRouter",
      ].filter(Boolean);
      const hasAnyKey = foundProviders.length > 0;

      // Check configured provider has key
      const config = configExists ? loadConfig() : null;
      let configuredProviderHasKey = false;
      if (config?.llm.provider) {
        const providerCfg = PROVIDER_CONFIGS[config.llm.provider as LLMProvider];
        configuredProviderHasKey = !!process.env[providerCfg?.envVar || ""] || !!config.llm.apiKey;
      }

      checks.push({
        name: "API Key",
        status: configuredProviderHasKey ? "pass" : hasAnyKey ? "warn" : "fail",
        message: configuredProviderHasKey
          ? "API key configured for provider"
          : hasAnyKey
            ? `Found keys: ${foundProviders.join(", ")}`
            : "No API key found in environment",
        detail: config?.llm.provider ? `Provider: ${config.llm.provider}` : undefined,
        fixHint: config?.llm.provider
          ? `export ${PROVIDER_CONFIGS[config.llm.provider as LLMProvider]?.envVar}=...`
          : "export ANTHROPIC_API_KEY=sk-ant-...",
      });

      // Check 4: Bun runtime
      const hasBun = typeof Bun !== "undefined";
      checks.push({
        name: "Bun Runtime",
        status: hasBun ? "pass" : "warn",
        message: hasBun ? "Bun is available" : "Not running on Bun",
        detail: hasBun ? `v${Bun.version}` : undefined,
      });

      // Check 5: Gateway PID file
      const pidFileExists = fs.existsSync(PID_FILE);
      let pidFileValid = false;
      let gatewayPid: number | null = null;
      if (pidFileExists) {
        try {
          gatewayPid = parseInt(fs.readFileSync(PID_FILE, "utf-8").trim(), 10);
          try {
            process.kill(gatewayPid, 0);
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
          detail: "Gateway not running but PID file exists",
          fix: () => {
            fs.unlinkSync(PID_FILE);
          },
        });
      } else {
        checks.push({
          name: "Gateway PID",
          status: "pass",
          message: pidFileExists ? "Gateway is running" : "Clean state",
          detail: pidFileValid ? `PID ${gatewayPid}` : undefined,
        });
      }

      // Check 6: Port availability (if gateway not running)
      if (!pidFileValid && configExists && config) {
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
          message: portAvailable ? "Port is available" : "Port is in use",
          detail: `Port ${port}`,
        });
      }

      // Check 7: Gateway health (if running)
      if (pidFileValid && config) {
        const drBasePath = (config.gateway.basePath || "").replace(/\/+$/, "");
        let gatewayHealthy = false;
        try {
          const response = await fetch(
            `http://localhost:${config.gateway.port}${drBasePath}/health`,
            {
              signal: AbortSignal.timeout(2000),
            }
          );
          gatewayHealthy = response.ok;
        } catch {
          gatewayHealthy = false;
        }

        checks.push({
          name: "Gateway Health",
          status: gatewayHealthy ? "pass" : "warn",
          message: gatewayHealthy ? "Gateway is responding" : "Gateway not responding",
          detail: `http://localhost:${config.gateway.port}${drBasePath}`,
        });
      }

      // Check 8: Database
      const dbPath = path.join(os.homedir(), ".pha", "pha.db");
      const dbExists = fs.existsSync(dbPath);
      checks.push({
        name: "Database",
        status: dbExists ? "pass" : "pass", // Not existing is fine
        message: dbExists ? "Database exists" : "Database will be created on first use",
        detail: dbExists ? dbPath : undefined,
      });

      if (!options.json) spinner.stop("success");

      // Output results
      if (options.json) {
        console.log(JSON.stringify(checks, null, 2));
        return;
      }

      console.log("");
      printHeader(`${icons.doctor} PHA Doctor`, "System Diagnostics");

      printSection("System Checks");

      for (const check of checks) {
        const statusType =
          check.status === "pass" ? "success" : check.status === "warn" ? "warning" : "error";
        printStatus(statusType, check.name, check.detail);
        if (check.message && check.status !== "pass") {
          console.log(`    ${c.dim(check.message)}`);
        }

        if (check.fix && options.fix && check.status !== "pass") {
          try {
            check.fix();
            console.log(`    ${c.green("→ Fixed!")}`);
          } catch (e) {
            console.log(`    ${c.red(`→ Fix failed: ${e}`)}`);
          }
        } else if (check.fixHint && check.status !== "pass") {
          console.log(`    ${c.cyan("→")} ${c.dim(check.fixHint)}`);
        }
      }

      // Summary
      const passCount = checks.filter((c) => c.status === "pass").length;
      const warnCount = checks.filter((c) => c.status === "warn").length;
      const failCount = checks.filter((c) => c.status === "fail").length;

      console.log("");
      printDivider();
      console.log("");

      const total = checks.length;
      const passBar = c.green("█".repeat(Math.round((passCount / total) * 20)));
      const warnBar = c.yellow("█".repeat(Math.round((warnCount / total) * 20)));
      const failBar = c.red("█".repeat(Math.round((failCount / total) * 20)));

      console.log(`  ${passBar}${warnBar}${failBar}`);
      console.log(
        `  ${c.green(`${passCount} passed`)}  ${c.yellow(`${warnCount} warnings`)}  ${c.red(`${failCount} failed`)}`
      );

      if (failCount > 0) {
        console.log(`\n  ${c.bold("Recommended actions:")}`);
        if (!hasAnyKey) {
          console.log(`  ${c.cyan("1.")} Set up your LLM provider API key`);
          console.log(`     ${c.dim("export ANTHROPIC_API_KEY=sk-ant-...")}`);
        }
        if (!configExists) {
          console.log(`  ${c.cyan("2.")} Run the setup wizard`);
          console.log(`     ${c.dim("pha onboard")}`);
        }

        const fixableCount = checks.filter((c) => c.fix && c.status !== "pass").length;
        if (fixableCount > 0 && !options.fix) {
          console.log(
            `\n  ${c.dim("Run")} ${c.cyan("pha doctor --fix")} ${c.dim(`to auto-fix ${fixableCount} issue(s)`)}`
          );
        }
      } else if (warnCount === 0) {
        console.log(`\n  ${c.green("✓")} ${c.bold("All checks passed!")} You're good to go.`);
      } else {
        console.log(`\n  ${c.yellow("!")} System is functional with some warnings.`);
      }

      console.log("");
      process.exit(0);
    });
}
