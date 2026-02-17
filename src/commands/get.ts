/**
 * Get command - quick data retrieval
 *
 * Usage:
 *   pha get uid          # Print the default user ID
 */

import type { Command } from "commander";
import { readdirSync, existsSync } from "fs";
import { join } from "path";
import { getUserId, getStateDir } from "../utils/config.js";
import { getUserStore } from "../data-sources/huawei/user-store.js";

export function registerGetCommand(program: Command): void {
  const get = program.command("get").description("Quick data retrieval");

  get
    .command("uid")
    .description("Print the default user ID (for use in browser URL ?uid=xxx)")
    .option("--all", "List all known user IDs")
    .action((options) => {
      if (options.all) {
        listAllUids();
      } else {
        printDefaultUid();
      }
    });
}

function printDefaultUid(): void {
  // 1. Try config uid
  const configUid = getUserId();
  if (configUid) {
    console.log(configUid);
    return;
  }

  // 2. Find first authenticated (non-benchmark, non-system) user from .pha/users/
  const uid = findAuthenticatedUser();
  if (uid) {
    console.log(uid);
    return;
  }

  console.error("No authenticated user found. Run `pha auth` first.");
  process.exit(1);
}

function listAllUids(): void {
  const usersDir = join(getStateDir(), "users");
  if (!existsSync(usersDir)) {
    console.error("No users directory found.");
    process.exit(1);
  }

  const userStore = getUserStore();
  const entries = readdirSync(usersDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === "system") continue;
    if (entry.name.startsWith("benchmark-")) continue;

    const authed = userStore.isAuthenticated(entry.name);
    const marker = authed ? " (authenticated)" : "";
    console.log(`${entry.name}${marker}`);
  }
}

function findAuthenticatedUser(): string | null {
  const usersDir = join(getStateDir(), "users");
  if (!existsSync(usersDir)) return null;

  const userStore = getUserStore();
  const entries = readdirSync(usersDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === "system") continue;
    if (entry.name.startsWith("benchmark-")) continue;
    if (userStore.isAuthenticated(entry.name)) {
      return entry.name;
    }
  }
  return null;
}
