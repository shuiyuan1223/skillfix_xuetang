/**
 * Huawei command - Manage Huawei Health Kit integration
 */

import type { Command } from "commander";
import * as readline from "readline";
import { loadConfig, setConfigValue } from "../utils/config.js";
import { printHeader, printSection, printKV, printDivider, c, Spinner } from "../utils/cli-ui.js";
import {
  HuaweiAuth,
  huaweiAuth,
  tokenStore,
  huaweiHealthApi,
} from "../data-sources/huawei/index.js";

// Default redirect URI for Huawei OAuth (HMS scheme)
const DEFAULT_REDIRECT_URI = "hms://redirect_url";

/**
 * Get redirect URI from config or use default
 */
function getRedirectUri(): string {
  const config = loadConfig();
  return config.dataSources.huawei?.redirectUri || DEFAULT_REDIRECT_URI;
}

export function registerHuaweiCommand(program: Command): void {
  const huawei = program.command("huawei").description("Manage Huawei Health Kit integration");

  // Setup subcommand
  huawei
    .command("setup")
    .description("Configure Huawei developer credentials")
    .action(async () => {
      await setupCredentials();
    });

  // Auth subcommand
  huawei
    .command("auth")
    .description("Authorize access to Huawei Health data")
    .option("-r, --redirect-uri <uri>", "Override redirect URI from config")
    .action(async (options) => {
      // Use command line option if provided, otherwise read from config
      const redirectUri = options.redirectUri || getRedirectUri();
      await authorizeAccess(redirectUri);
    });

  // Status subcommand
  huawei
    .command("status")
    .description("Check Huawei connection status")
    .action(async () => {
      await showStatus();
    });

  // Test subcommand
  huawei
    .command("test")
    .description("Test Huawei API connection")
    .action(async () => {
      await testConnection();
    });

  // Logout subcommand
  huawei
    .command("logout")
    .description("Clear Huawei authorization")
    .action(async () => {
      await logout();
    });
}

/**
 * Setup Huawei developer credentials
 */
async function setupCredentials(): Promise<void> {
  console.log("");
  printHeader("Huawei Health Kit Setup", "Configure developer credentials");

  console.log(`
  ${c.dim("To use Huawei Health Kit, you need:")}
  ${c.dim("1. A Huawei Developer Account (developer.huawei.com)")}
  ${c.dim("2. An app with Health Kit API enabled")}
  ${c.dim("3. OAuth 2.0 credentials (Client ID and Secret)")}
`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt: string): Promise<string> =>
    new Promise((resolve) => rl.question(prompt, resolve));

  try {
    const clientId = await question(`  ${c.cyan("Client ID")}: `);
    const clientSecret = await question(`  ${c.cyan("Client Secret")}: `);

    if (!clientId.trim() || !clientSecret.trim()) {
      console.log(`\n  ${c.red("Error:")} Client ID and Secret are required`);
      rl.close();
      return;
    }

    // Optional: redirect URI
    console.log(
      `\n  ${c.dim("Redirect URI (press Enter for default: " + DEFAULT_REDIRECT_URI + ")")}`
    );
    const redirectUri = await question(`  ${c.cyan("Redirect URI")}: `);

    // Save to config
    setConfigValue("dataSources.huawei.clientId", clientId.trim());
    setConfigValue("dataSources.huawei.clientSecret", clientSecret.trim());
    if (redirectUri.trim()) {
      setConfigValue("dataSources.huawei.redirectUri", redirectUri.trim());
    }

    console.log(`\n  ${c.green("✓")} Credentials saved`);
    console.log(`\n  ${c.dim("Next: Run")} ${c.cyan("pha huawei auth")} ${c.dim("to authorize")}`);
    console.log("");
  } finally {
    rl.close();
  }
}

/**
 * Authorize access to Huawei Health data
 */
async function authorizeAccess(redirectUri: string): Promise<void> {
  console.log("");
  printHeader("Huawei Health Kit Authorization", "OAuth 2.0 flow");

  const config = loadConfig();
  const huaweiConfig = config.dataSources.huawei;

  if (!huaweiConfig?.clientId || !huaweiConfig?.clientSecret) {
    console.log(`  ${c.red("Error:")} Huawei credentials not configured`);
    console.log(`  ${c.dim("Run")} ${c.cyan("pha huawei setup")} ${c.dim("first")}`);
    console.log("");
    return;
  }

  const auth = new HuaweiAuth();
  const authUrl = auth.getAuthUrl(huaweiConfig.clientId, redirectUri);

  console.log(`
  ${c.dim("Step 1:")} Open this URL in your browser:

  ${c.cyan(authUrl)}

  ${c.dim("Step 2:")} Log in with your Huawei account and authorize the app

  ${c.dim("Step 3:")} After authorization, you'll be redirected to:")}
  ${c.dim(redirectUri + "?code=AUTHORIZATION_CODE")}

  ${c.dim("Step 4:")} Copy the code from the URL and paste it below
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
      rl.close();
      return;
    }

    const spinner = new Spinner("Exchanging code for token...");
    spinner.start();

    try {
      await auth.exchangeCode(
        code.trim(),
        huaweiConfig.clientId,
        huaweiConfig.clientSecret,
        redirectUri
      );

      spinner.stop("success");
      console.log(`\n  ${c.green("✓")} Authorization successful!`);

      // Update data source type to huawei
      setConfigValue("dataSources.type", "huawei");
      console.log(`  ${c.green("✓")} Data source set to Huawei`);

      console.log(`\n  ${c.dim("Test with:")} ${c.cyan("pha huawei test")}`);
      console.log(`  ${c.dim("View health data:")} ${c.cyan("pha health")}`);
      console.log("");
    } catch (error) {
      spinner.stop("error");
      console.log(
        `\n  ${c.red("Error:")} ${error instanceof Error ? error.message : String(error)}`
      );
      console.log("");
    }
  } finally {
    rl.close();
  }
}

/**
 * Show Huawei connection status
 */
async function showStatus(): Promise<void> {
  console.log("");
  printHeader("Huawei Health Kit Status", "Connection details");

  const config = loadConfig();
  const huaweiConfig = config.dataSources.huawei;

  // Credentials status
  printSection("Credentials", "🔑");
  if (huaweiConfig?.clientId) {
    printKV("Client ID", `${c.green("✓")} Configured (${maskString(huaweiConfig.clientId)})`);
  } else {
    printKV("Client ID", `${c.red("✗")} Not configured`);
  }

  if (huaweiConfig?.clientSecret) {
    printKV("Client Secret", `${c.green("✓")} Configured`);
  } else {
    printKV("Client Secret", `${c.red("✗")} Not configured`);
  }

  // Token status
  printSection("Authorization", "🔐");
  const tokenInfo = tokenStore.getTokenInfo();

  if (tokenInfo.exists) {
    if (tokenInfo.isValid) {
      printKV("Status", `${c.green("✓")} Authorized`);
      printKV("Expires", `${c.dim("in")} ${tokenInfo.expiresIn}`);
    } else {
      printKV("Status", `${c.yellow("!")} Token expired`);
      printKV("Expires", c.red("Token needs refresh"));
    }
  } else {
    printKV("Status", `${c.red("✗")} Not authorized`);
    console.log(`\n  ${c.dim("Run")} ${c.cyan("pha huawei auth")} ${c.dim("to authorize")}`);
  }

  // Data source status
  printSection("Configuration", "⚙️");
  printKV(
    "Data Source",
    config.dataSources.type === "huawei"
      ? `${c.green("✓")} Huawei (active)`
      : `${c.dim(config.dataSources.type)} ${c.yellow("(not active)")}`
  );
  printKV("Redirect URI", huaweiConfig?.redirectUri || `${c.dim(DEFAULT_REDIRECT_URI)} (default)`);

  console.log("");
  printDivider();
  console.log(`  ${c.dim("Test connection:")} ${c.cyan("pha huawei test")}`);
  console.log("");
}

/**
 * Test Huawei API connection
 */
async function testConnection(): Promise<void> {
  console.log("");
  printHeader("Huawei API Test", "Fetching today's data");

  const spinner = new Spinner("Testing connection...");
  spinner.start();

  try {
    const result = await huaweiHealthApi.testConnection();

    if (result.success) {
      spinner.stop("success");
      console.log(`\n  ${c.green("✓")} Connection successful!`);
      console.log(`\n  ${c.dim("Today's steps:")} ${c.bold(String(result.steps ?? 0))}`);
    } else {
      spinner.stop("error");
      console.log(`\n  ${c.red("✗")} Connection failed`);
      console.log(`  ${c.dim("Error:")} ${result.error}`);
    }
  } catch (error) {
    spinner.stop("error");
    console.log(`\n  ${c.red("✗")} Connection failed`);
    console.log(`  ${c.dim("Error:")} ${error instanceof Error ? error.message : String(error)}`);
  }

  console.log("");
}

/**
 * Clear Huawei authorization
 */
async function logout(): Promise<void> {
  console.log("");
  printHeader("Huawei Logout", "Clear authorization");

  const tokenInfo = tokenStore.getTokenInfo();

  if (!tokenInfo.exists) {
    console.log(`  ${c.dim("No authorization found")}`);
    console.log("");
    return;
  }

  huaweiAuth.logout();

  // Reset data source to mock
  const config = loadConfig();
  if (config.dataSources.type === "huawei") {
    setConfigValue("dataSources.type", "mock");
    console.log(`  ${c.green("✓")} Data source reset to mock`);
  }

  console.log(`  ${c.green("✓")} Authorization cleared`);
  console.log(`\n  ${c.dim("Re-authorize with:")} ${c.cyan("pha huawei auth")}`);
  console.log("");
}

/**
 * Mask a string for display (show first 4 and last 4 characters)
 */
function maskString(str: string): string {
  if (str.length <= 8) return "****";
  return `${str.slice(0, 4)}****${str.slice(-4)}`;
}
