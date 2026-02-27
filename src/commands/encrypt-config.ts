/**
 * encrypt-config / decrypt-config CLI commands
 *
 * pha encrypt-config  — manually encrypt all sensitive fields in config.json
 * pha decrypt-config  — print decrypted config to stdout (debugging only)
 */

import type { Command } from "commander";
import * as fs from "fs";
import {
  loadConfig,
  saveConfig,
  getConfigPath,
  countPlaintextSensitiveFields,
  isCryptoReady,
  getStateDir,
  ensureKeyFiles,
} from "../utils/config.js";
import { c, icons, printHeader } from "../utils/cli-ui.js";

export function registerEncryptConfigCommand(program: Command): void {
  program
    .command("encrypt-config")
    .description("Encrypt all sensitive fields in .pha/config.json")
    .action(() => {
      printHeader(`${icons.key} Encrypt Config`, "Sensitive field encryption");

      const configPath = getConfigPath();
      if (!fs.existsSync(configPath)) {
        console.log(`  ${c.red("Error:")} Config file not found at ${configPath}`);
        console.log(`  ${c.dim("Run")} ${c.cyan("pha onboard")} ${c.dim("first.")}`);
        process.exit(1);
      }

      const stateDir = getStateDir();
      ensureKeyFiles(stateDir);

      const plaintextCount = countPlaintextSensitiveFields();
      if (plaintextCount === 0) {
        console.log(`\n  ${c.green("✓")} All sensitive fields are already encrypted.`);
        process.exit(0);
      }

      console.log(`\n  Found ${c.yellow(String(plaintextCount))} plaintext sensitive field(s).`);
      console.log(`  Encrypting...`);

      // loadConfig() decrypts → saveConfig() re-encrypts all fields
      const config = loadConfig();
      saveConfig(config);

      const remaining = countPlaintextSensitiveFields();
      if (remaining === 0) {
        console.log(`  ${c.green("✓")} All sensitive fields encrypted successfully.`);
      } else {
        console.log(
          `  ${c.yellow("!")} ${remaining} field(s) could not be encrypted (may be empty).`
        );
      }
      console.log("");
      process.exit(0);
    });
}

export function registerDecryptConfigCommand(program: Command): void {
  program
    .command("decrypt-config")
    .description("Print decrypted config to stdout (debugging only, does NOT modify files)")
    .option("--yes", "Skip confirmation prompt")
    .action(async (options) => {
      const configPath = getConfigPath();
      if (!fs.existsSync(configPath)) {
        console.error(`Error: Config file not found at ${configPath}`);
        process.exit(1);
      }

      if (!isCryptoReady(getStateDir())) {
        console.error("Error: Encryption key files not found. Nothing to decrypt.");
        process.exit(1);
      }

      if (!options.yes) {
        // Interactive confirmation
        process.stdout.write(
          `${c.yellow("Warning:")} This will print decrypted secrets to stdout.\nContinue? [y/N] `
        );
        const response = await new Promise<string>((resolve) => {
          process.stdin.setEncoding("utf-8");
          process.stdin.once("data", (data) => resolve(String(data).trim().toLowerCase()));
          // Auto-reject after 10s
          setTimeout(() => resolve("n"), 10000);
        });
        if (response !== "y" && response !== "yes") {
          console.log("Aborted.");
          process.exit(0);
        }
      }

      const config = loadConfig();
      // Output the fully decrypted in-memory config
      console.log(JSON.stringify(config, null, 2));
      process.exit(0);
    });
}
