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

function checkConfiguration(): Check {
  const configExists = isConfigured();
  return {
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
  };
}

function checkConfigDirPermissions(): Check {
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
  return {
    name: "Config Directory",
    status: configDirWritable ? "pass" : "fail",
    message: configDirWritable ? "Directory is writable" : "Directory is not writable",
    detail: configDir,
  };
}

function checkApiKey(configExists: boolean): Check {
  const foundProviders = [
    process.env.ANTHROPIC_API_KEY && "Anthropic",
    process.env.OPENAI_API_KEY && "OpenAI",
    process.env.GOOGLE_API_KEY && "Google",
    process.env.OPENROUTER_API_KEY && "OpenRouter",
  ].filter(Boolean) as string[];
  const hasAnyKey = foundProviders.length > 0;

  const config = configExists ? loadConfig() : null;
  let configuredProviderHasKey = false;
  if (config?.llm.provider) {
    const providerCfg = PROVIDER_CONFIGS[config.llm.provider as LLMProvider];
    configuredProviderHasKey = !!process.env[providerCfg?.envVar || ""] || !!config.llm.apiKey;
  }

  let apiKeyStatus: "pass" | "warn" | "fail";
  let apiKeyMessage: string;
  if (configuredProviderHasKey) {
    apiKeyStatus = "pass";
    apiKeyMessage = "API key configured for provider";
  } else if (hasAnyKey) {
    apiKeyStatus = "warn";
    apiKeyMessage = `Found keys: ${foundProviders.join(", ")}`;
  } else {
    apiKeyStatus = "fail";
    apiKeyMessage = "No API key found in environment";
  }

  return {
    name: "API Key",
    status: apiKeyStatus,
    message: apiKeyMessage,
    detail: config?.llm.provider ? `Provider: ${config.llm.provider}` : undefined,
    fixHint: config?.llm.provider
      ? `export ${PROVIDER_CONFIGS[config.llm.provider as LLMProvider]?.envVar}=...`
      : "export ANTHROPIC_API_KEY=sk-ant-...",
  };
}

function checkBunRuntime(): Check {
  const hasBun = typeof Bun !== "undefined";
  return {
    name: "Bun Runtime",
    status: hasBun ? "pass" : "warn",
    message: hasBun ? "Bun is available" : "Not running on Bun",
    detail: hasBun ? `v${Bun.version}` : undefined,
  };
}

function checkGatewayPid(): Check {
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
    return {
      name: "Gateway PID",
      status: "warn",
      message: "Stale PID file found",
      detail: "Gateway not running but PID file exists",
      fix: () => {
        fs.unlinkSync(PID_FILE);
      },
    };
  }
  return {
    name: "Gateway PID",
    status: "pass",
    message: pidFileExists ? "Gateway is running" : "Clean state",
    detail: pidFileValid ? `PID ${gatewayPid}` : undefined,
  };
}

function checkGatewayPort(config: ReturnType<typeof loadConfig>): Check {
  const port = config.gateway.port;
  let portAvailable = true;
  try {
    const server = Bun.serve({ port, fetch: () => new Response("test") });
    server.stop();
  } catch {
    portAvailable = false;
  }
  return {
    name: "Gateway Port",
    status: portAvailable ? "pass" : "warn",
    message: portAvailable ? "Port is available" : "Port is in use",
    detail: `Port ${port}`,
  };
}

async function checkGatewayHealth(config: ReturnType<typeof loadConfig>): Promise<Check> {
  const drBasePath = (config.gateway.basePath || "").replace(/\/+$/, "");
  let gatewayHealthy = false;
  try {
    const response = await fetch(`http://localhost:${config.gateway.port}${drBasePath}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    gatewayHealthy = response.ok;
  } catch {
    gatewayHealthy = false;
  }
  return {
    name: "Gateway Health",
    status: gatewayHealthy ? "pass" : "warn",
    message: gatewayHealthy ? "Gateway is responding" : "Gateway not responding",
    detail: `http://localhost:${config.gateway.port}${drBasePath}`,
  };
}

function checkDatabase(): Check {
  const dbPath = path.join(os.homedir(), ".pha", "pha.db");
  const dbExists = fs.existsSync(dbPath);
  return {
    name: "Database",
    status: dbExists ? "pass" : "pass",
    message: dbExists ? "Database exists" : "Database will be created on first use",
    detail: dbExists ? dbPath : undefined,
  };
}

async function runAllChecks(): Promise<Check[]> {
  const checks: Check[] = [];
  const configExists = isConfigured();

  checks.push(checkConfiguration());
  checks.push(checkConfigDirPermissions());
  checks.push(checkApiKey(configExists));
  checks.push(checkBunRuntime());

  const pidCheck = checkGatewayPid();
  checks.push(pidCheck);

  const pidIsValid = pidCheck.status === "pass" && pidCheck.detail?.startsWith("PID");
  const config = configExists ? loadConfig() : null;

  if (!pidIsValid && configExists && config) {
    checks.push(checkGatewayPort(config));
  }
  if (pidIsValid && config) {
    checks.push(await checkGatewayHealth(config));
  }

  checks.push(checkDatabase());
  return checks;
}

function printDoctorResults(checks: Check[], options: { fix?: boolean }): void {
  console.log("");
  printHeader(`${icons.doctor} PHA Doctor`, "System Diagnostics");
  printSection("System Checks");

  for (const check of checks) {
    type StatusType = "info" | "error" | "success" | "pending" | "warning";
    const statusMap: Record<string, StatusType> = { pass: "success", warn: "warning" };
    const statusType: StatusType = statusMap[check.status] ?? "error";
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

  const passCount = checks.filter((ch) => ch.status === "pass").length;
  const warnCount = checks.filter((ch) => ch.status === "warn").length;
  const failCount = checks.filter((ch) => ch.status === "fail").length;

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
    const hasAnyKey = !!(
      process.env.ANTHROPIC_API_KEY ||
      process.env.OPENAI_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      process.env.OPENROUTER_API_KEY
    );
    if (!hasAnyKey) {
      console.log(`  ${c.cyan("1.")} Set up your LLM provider API key`);
      console.log(`     ${c.dim("export ANTHROPIC_API_KEY=sk-ant-...")}`);
    }
    if (!isConfigured()) {
      console.log(`  ${c.cyan("2.")} Run the setup wizard`);
      console.log(`     ${c.dim("pha onboard")}`);
    }
    const fixableCount = checks.filter((ch) => ch.fix && ch.status !== "pass").length;
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
}

export function registerDoctorCommand(program: Command): void {
  program
    .command("doctor")
    .description("Run health checks and diagnose issues")
    .option("--fix", "Automatically fix issues where possible")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      const spinner = new Spinner("Running diagnostics...");
      if (!options.json) spinner.start();

      const checks = await runAllChecks();

      if (!options.json) spinner.stop("success");

      if (options.json) {
        console.log(JSON.stringify(checks, null, 2));
        return;
      }

      printDoctorResults(checks, options);
      process.exit(0);
    });
}
