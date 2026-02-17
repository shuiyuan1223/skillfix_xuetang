/**
 * Auth command - OAuth token acquisition via Chrome MCP
 *
 * Usage:
 *   pha auth          # Run OAuth flow via Chrome MCP (automated)
 *   pha auth --manual # Fall back to manual code paste
 *   pha auth status   # Check current auth status
 */

import type { Command } from "commander";
import { loadConfig, getUserUuid } from "../utils/config.js";
import { c, Spinner, printHeader, printKV, printSection } from "../utils/cli-ui.js";
import { runOAuthFlowWithChrome } from "../services/chrome-mcp-client.js";
import { huaweiAuth } from "../data-sources/huawei/huawei-auth.js";
import { getUserStore } from "../data-sources/huawei/user-store.js";
import { getHuaweiAuthUrl } from "../services/huawei-oauth-service.js";
import * as readline from "readline";

export function registerAuthCommand(program: Command): void {
  const auth = program
    .command("auth")
    .description("Authenticate with health data provider (via Chrome MCP)");

  // Default action: run MCP OAuth flow
  auth
    .option("--manual", "Manual mode: paste authorization code instead of Chrome MCP")
    .option("--timeout <ms>", "Timeout for MCP flow in milliseconds", "180000")
    .action(async (options) => {
      const config = loadConfig();

      if (config.dataSources.type === "mock") {
        console.log(`\n  ${c.dim("Data source is 'mock', no auth needed.")}`);
        console.log(
          `  ${c.dim("Switch to 'huawei' via")} ${c.cyan("pha onboard")} ${c.dim("first.")}`
        );
        console.log("");
        return;
      }

      const uuid = getUserUuid();
      console.log("");
      printHeader("OAuth Authentication", `User: ${uuid.slice(0, 8)}...`);

      // Check if already authenticated
      if (huaweiAuth.isUserAuthenticated(uuid)) {
        console.log(`  ${c.green("✓")} Already authenticated`);
        console.log(`  ${c.dim("Use")} ${c.cyan("pha auth status")} ${c.dim("to check details")}`);
        console.log("");
        return;
      }

      if (options.manual) {
        await manualAuthFlow(uuid);
      } else {
        await mcpAuthFlow(uuid, parseInt(options.timeout, 10));
      }
    });

  // Status subcommand
  auth
    .command("status")
    .description("Check authentication status")
    .action(async () => {
      const uuid = getUserUuid();
      console.log("");
      printHeader("Auth Status", `User: ${uuid.slice(0, 8)}...`);

      const config = loadConfig();
      printSection("Configuration", "⚙️");
      printKV("User UUID", uuid);
      printKV("Data Source", config.dataSources.type);

      if (config.dataSources.type === "huawei") {
        const authenticated = huaweiAuth.isUserAuthenticated(uuid);
        printSection("Huawei Health Kit", "🔐");
        if (authenticated) {
          printKV("Status", `${c.green("✓")} Authenticated`);
          const userStore = getUserStore();
          const token = userStore.getToken(uuid);
          if (token?.expiresAt) {
            const expiresIn = Math.round((token.expiresAt - Date.now()) / 1000 / 60);
            printKV("Token Expires", expiresIn > 0 ? `${expiresIn} min` : c.red("expired"));
          }
        } else {
          printKV("Status", `${c.red("✗")} Not authenticated`);
          console.log(`\n  ${c.dim("Run")} ${c.cyan("pha auth")} ${c.dim("to authenticate")}`);
        }
      }

      console.log("");
    });
}

/**
 * Automated OAuth flow via Chrome MCP
 */
async function mcpAuthFlow(uuid: string, timeout: number): Promise<void> {
  const config = loadConfig();
  const huaweiConfig = config.dataSources.huawei;

  if (!huaweiConfig?.clientId || !huaweiConfig?.clientSecret) {
    console.log(`  ${c.red("Error:")} Huawei credentials not configured`);
    console.log(
      `  ${c.dim("Run")} ${c.cyan("pha onboard")} ${c.dim("or")} ${c.cyan("pha huawei setup")} ${c.dim("first")}`
    );
    console.log("");
    return;
  }

  const authUrl = getHuaweiAuthUrl(uuid);

  console.log(`  ${c.dim("Opening browser for OAuth login...")}`);
  console.log(`  ${c.dim("Please complete the login in the browser window.")}`);
  console.log(`  ${c.dim("Timeout:")} ${timeout / 1000}s\n`);

  const spinner = new Spinner("Waiting for OAuth authorization...");
  spinner.start();

  try {
    const result = await runOAuthFlowWithChrome(authUrl, { timeout });

    if ("error" in result) {
      spinner.stop("error");
      console.log(`\n  ${c.red("Error:")} ${result.error}`);
      console.log(`\n  ${c.dim("Try manual mode:")} ${c.cyan("pha auth --manual")}`);
      console.log("");
      return;
    }

    // Exchange code for token
    spinner.stop("success");

    const exchangeSpinner = new Spinner("Exchanging code for token...");
    exchangeSpinner.start();

    const redirectUri = huaweiConfig.redirectUri || "hms://redirect_url";
    const { tokenData, huaweiUserId } = await huaweiAuth.exchangeCodeForUser(
      result.code,
      huaweiConfig.clientId,
      huaweiConfig.clientSecret,
      redirectUri
    );

    // Use Huawei user ID as primary identifier (fallback to config UUID)
    const userId = huaweiUserId || uuid;

    // Store token for this user
    const userStore = getUserStore();
    userStore.saveToken(userId, tokenData);

    exchangeSpinner.stop("success");
    console.log(`\n  ${c.green("✓")} Authentication successful!`);
    console.log(`  ${c.dim("User:")} ${userId.slice(0, 8)}...`);
    console.log(`\n  ${c.dim("Test with:")} ${c.cyan("pha health")}`);
    console.log("");
  } catch (error) {
    spinner.stop("error");
    console.log(`\n  ${c.red("Error:")} ${error instanceof Error ? error.message : String(error)}`);
    console.log(`\n  ${c.dim("Try manual mode:")} ${c.cyan("pha auth --manual")}`);
    console.log("");
  }
}

/**
 * Manual OAuth flow - paste code
 */
async function manualAuthFlow(uuid: string): Promise<void> {
  const config = loadConfig();
  const huaweiConfig = config.dataSources.huawei;

  if (!huaweiConfig?.clientId || !huaweiConfig?.clientSecret) {
    console.log(`  ${c.red("Error:")} Huawei credentials not configured`);
    console.log("");
    return;
  }

  const authUrl = getHuaweiAuthUrl(uuid);
  const redirectUri = huaweiConfig.redirectUri || "hms://redirect_url";

  console.log(`
  ${c.dim("Step 1:")} Open this URL in your browser:

  ${c.cyan(authUrl)}

  ${c.dim("Step 2:")} Log in and authorize the app

  ${c.dim("Step 3:")} Copy the 'code' from the redirect URL
`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt: string): Promise<string> =>
    new Promise((resolve) => rl.question(prompt, resolve));

  try {
    const code = await question(`  ${c.cyan("Authorization Code")}: `);

    if (!code.trim()) {
      console.log(`\n  ${c.red("Error:")} Authorization code is required`);
      return;
    }

    const spinner = new Spinner("Exchanging code for token...");
    spinner.start();

    try {
      const { tokenData, huaweiUserId } = await huaweiAuth.exchangeCodeForUser(
        code.trim(),
        huaweiConfig.clientId,
        huaweiConfig.clientSecret,
        redirectUri
      );

      // Use Huawei user ID as primary identifier (fallback to config UUID)
      const userId = huaweiUserId || uuid;

      const userStore = getUserStore();
      userStore.saveToken(userId, tokenData);

      spinner.stop("success");
      console.log(`\n  ${c.green("✓")} Authentication successful!`);
      console.log(`  ${c.dim("User:")} ${userId.slice(0, 8)}...`);
      console.log(`\n  ${c.dim("Test with:")} ${c.cyan("pha health")}`);
    } catch (error) {
      spinner.stop("error");
      console.log(
        `\n  ${c.red("Error:")} ${error instanceof Error ? error.message : String(error)}`
      );
    }
  } finally {
    rl.close();
    console.log("");
  }
}
