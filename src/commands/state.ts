/**
 * State command - Manage .pha/ as a nested git repository
 *
 * Allows users to version-control their personal .pha/ data
 * (config, databases, tokens, etc.) in a private git repo,
 * independent of the main PHA repository.
 */

import type { Command } from "commander";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { getStateDir } from "../utils/config.js";
import { c, icons } from "../utils/cli-ui.js";

/** .gitignore template for .pha/ — exclude runtime-only files */
const GITIGNORE_TEMPLATE = `# Runtime files — not synced
gateway.pid
gateway.log
api-cache/
llm-logs/
`;

/**
 * Run a git command inside the .pha/ directory
 * @param timeout — milliseconds (default 10s, use longer for network ops)
 */
function git(stateDir: string, args: string, timeout = 10_000): string {
  return execSync(`git -C "${stateDir}" ${args}`, {
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
    timeout,
  }).trim();
}

/**
 * Check if .pha/ is already a git repository
 */
function isGitRepo(stateDir: string): boolean {
  return fs.existsSync(path.join(stateDir, ".git"));
}

/**
 * Check if the repo has a remote configured
 */
function hasRemote(stateDir: string): boolean {
  try {
    const remotes = git(stateDir, "remote");
    return remotes.length > 0;
  } catch {
    return false;
  }
}

/**
 * Stage all and create initial commit (if there are uncommitted files)
 */
function initCommit(stateDir: string): void {
  try {
    git(stateDir, "add -A");
    const status = git(stateDir, "status --porcelain");
    if (status.length > 0) {
      git(stateDir, 'commit -m "Initial state snapshot"');
      console.log(`${c.green(icons.success)} Created initial commit`);
    } else {
      console.log(`${c.dim(`${icons.info} Nothing to commit`)}`);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("nothing to commit")) {
      console.log(`${c.yellow(icons.warning)} Commit: ${msg}`);
    }
  }
}

export function registerStateCommand(program: Command): void {
  const state = program
    .command("state")
    .description("Manage .pha/ state directory as a git repository");

  // pha state init [--remote <url>]
  state
    .command("init")
    .description(
      "Initialize .pha/ as a git repository (with --remote: reset local to match remote)"
    )
    .option("-r, --remote <url>", "Remote repository URL")
    .action((options) => {
      const stateDir = getStateDir();
      const NET_TIMEOUT = 30_000; // 30s for network operations

      if (!fs.existsSync(stateDir)) {
        console.log(`${c.red(icons.error)} State directory not found: ${stateDir}`);
        console.log(`  Run ${c.cyan("pha onboard")} first.`);
        process.exit(1);
      }

      // 1. Init git repo if needed
      if (isGitRepo(stateDir)) {
        console.log(`${c.dim(`${icons.info} Already a git repo: ${stateDir}`)}`);
      } else {
        git(stateDir, "init");
        console.log(`${c.green(icons.success)} Initialized git repo in ${stateDir}`);
      }

      // 2. Write .gitignore
      const gitignorePath = path.join(stateDir, ".gitignore");
      if (!fs.existsSync(gitignorePath)) {
        fs.writeFileSync(gitignorePath, GITIGNORE_TEMPLATE, "utf-8");
        console.log(`${c.green(icons.success)} Created .pha/.gitignore`);
      } else {
        console.log(`${c.dim(`${icons.info} .pha/.gitignore already exists`)}`);
      }

      // 3. Handle remote
      if (options.remote) {
        try {
          // Set remote URL
          if (hasRemote(stateDir)) {
            git(stateDir, `remote set-url origin "${options.remote}"`);
            console.log(`${c.green(icons.success)} Updated remote origin: ${options.remote}`);
          } else {
            git(stateDir, `remote add origin "${options.remote}"`);
            console.log(`${c.green(icons.success)} Added remote origin: ${options.remote}`);
          }

          // Fetch from remote
          console.log(`${c.dim(`${icons.info} Fetching from remote...`)}`);
          git(stateDir, "fetch origin", NET_TIMEOUT);

          // Check if remote has a main branch
          let remoteHasMain = false;
          try {
            git(stateDir, "rev-parse --verify origin/main");
            remoteHasMain = true;
          } catch {
            // Remote is empty
          }

          if (remoteHasMain) {
            // Reset local to match remote exactly (overwrite semantics)
            // Ensure we have a local branch to reset
            try {
              git(stateDir, "rev-parse --verify HEAD");
            } catch {
              // No commits yet — create an orphan branch so reset works
              git(stateDir, "checkout --orphan main");
            }
            git(stateDir, "reset --hard origin/main");
            // Clean untracked files that are NOT in .gitignore
            git(stateDir, "clean -fd");
            console.log(`${c.green(icons.success)} Local state reset to match remote`);
          } else {
            console.log(
              `${c.dim(`${icons.info} Remote is empty, will push on first 'pha state push'`)}`
            );
            // Initial commit for local content
            initCommit(stateDir);
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (msg.includes("timed out") || msg.includes("ETIMEDOUT")) {
            console.log(
              `${c.red(icons.error)} Fetch timed out (30s). Check your network or remote URL.`
            );
          } else {
            console.log(`${c.red(icons.error)} Failed to sync with remote: ${msg}`);
          }
          process.exit(1);
        }
      } else {
        // No remote — just commit local content
        initCommit(stateDir);
      }

      console.log("");
      console.log(`  Next steps:`);
      if (!options.remote) {
        console.log(
          `  ${icons.arrow} Add a remote: ${c.cyan("pha state init --remote <your-private-repo>")}`
        );
      }
      console.log(`  ${icons.arrow} Push state:   ${c.cyan("pha state push")}`);
      console.log(`  ${icons.arrow} Check status: ${c.cyan("pha state status")}`);
      process.exit(0);
    });

  // pha state push [-m <message>]
  state
    .command("push")
    .description("Commit and push .pha/ state to remote")
    .option("-m, --message <msg>", "Commit message", "Update state")
    .action((options) => {
      const stateDir = getStateDir();

      if (!isGitRepo(stateDir)) {
        console.log(`${c.red(icons.error)} Not a git repo. Run ${c.cyan("pha state init")} first.`);
        process.exit(1);
      }

      // Stage all changes
      git(stateDir, "add -A");

      // Check if there's anything to commit
      const status = git(stateDir, "status --porcelain");
      if (status.length === 0) {
        console.log(`${c.dim(`${icons.info} Nothing to commit — state is clean`)}`);
      } else {
        // Commit
        const timestamp = new Date().toISOString().slice(0, 19).replace("T", " ");
        const msg = `${options.message} (${timestamp})`;
        git(stateDir, `commit -m "${msg}"`);
        console.log(`${c.green(icons.success)} Committed: ${msg}`);
      }

      // Push if remote exists
      if (hasRemote(stateDir)) {
        try {
          // Ensure main branch exists
          try {
            git(stateDir, "rev-parse --verify HEAD");
          } catch {
            console.log(`${c.red(icons.error)} No commits yet. Nothing to push.`);
            process.exit(1);
          }

          git(stateDir, "push -u origin HEAD:main", 30_000);
          console.log(`${c.green(icons.success)} Pushed to remote`);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.log(`${c.red(icons.error)} Push failed: ${msg}`);
          process.exit(1);
        }
      } else {
        console.log(
          `${c.yellow(icons.warning)} No remote configured. Run ${c.cyan("pha state init --remote <url>")} to add one.`
        );
      }
      process.exit(0);
    });

  // pha state pull
  state
    .command("pull")
    .description("Pull latest .pha/ state from remote")
    .option("-f, --force", "Discard local changes and force-sync to remote")
    .action((options) => {
      const stateDir = getStateDir();
      const NET_TIMEOUT = 30_000;

      if (!isGitRepo(stateDir)) {
        console.log(`${c.red(icons.error)} Not a git repo. Run ${c.cyan("pha state init")} first.`);
        process.exit(1);
      }

      if (!hasRemote(stateDir)) {
        console.log(
          `${c.red(icons.error)} No remote configured. Run ${c.cyan("pha state init --remote <url>")} first.`
        );
        process.exit(1);
      }

      // --force: skip rebase, directly reset to remote
      if (options.force) {
        try {
          git(stateDir, "fetch origin", NET_TIMEOUT);
          git(stateDir, "reset --hard origin/main");
          git(stateDir, "clean -fd");
          console.log(`${c.green(icons.success)} Force-synced local state to remote`);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.log(`${c.red(icons.error)} Force pull failed: ${msg}`);
          process.exit(1);
        }
        process.exit(0);
      }

      // Normal pull: try rebase, auto-recover on conflict
      try {
        const output = git(stateDir, "pull --rebase origin main", NET_TIMEOUT);
        console.log(`${c.green(icons.success)} Pulled latest state`);
        if (output && output !== "Already up to date.") {
          console.log(c.dim(output));
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);

        // Abort any stuck rebase first
        const rebaseMergeDir = path.join(stateDir, ".git", "rebase-merge");
        const rebaseApplyDir = path.join(stateDir, ".git", "rebase-apply");
        if (fs.existsSync(rebaseMergeDir) || fs.existsSync(rebaseApplyDir)) {
          try {
            git(stateDir, "rebase --abort");
          } catch {
            // ignore — best-effort cleanup
          }
        }

        // Conflict detected → auto-resolve by resetting to remote
        if (
          msg.includes("CONFLICT") ||
          msg.includes("could not apply") ||
          msg.includes("Failed to merge") ||
          msg.includes("overwritten by merge")
        ) {
          console.log(
            `${c.yellow(icons.warning)} Rebase conflict detected — resetting to remote state`
          );
          try {
            git(stateDir, "fetch origin", NET_TIMEOUT);
            git(stateDir, "reset --hard origin/main");
            git(stateDir, "clean -fd");
            console.log(`${c.green(icons.success)} Synced to remote (local changes discarded)`);
          } catch (resetErr) {
            const resetMsg = resetErr instanceof Error ? resetErr.message : String(resetErr);
            console.log(`${c.red(icons.error)} Recovery failed: ${resetMsg}`);
            console.log(`  Try manually: ${c.cyan("pha state pull --force")}`);
            process.exit(1);
          }
        } else {
          console.log(`${c.red(icons.error)} Pull failed: ${msg}`);
          console.log(`  To discard local and force-sync: ${c.cyan("pha state pull --force")}`);
          process.exit(1);
        }
      }
      process.exit(0);
    });

  // pha state status
  state
    .command("status")
    .description("Show .pha/ git status")
    .action(() => {
      const stateDir = getStateDir();

      if (!isGitRepo(stateDir)) {
        console.log(`${c.dim(`${icons.info} .pha/ is not a git repository`)}`);
        console.log(`  Run ${c.cyan("pha state init")} to initialize.`);
        return;
      }

      console.log(`${c.bold("State Directory")} ${c.dim(stateDir)}`);
      console.log("");

      // Remote
      try {
        const remotes = git(stateDir, "remote -v");
        if (remotes) {
          console.log(`${c.bold("Remote:")}`);
          for (const line of remotes.split("\n")) {
            console.log(`  ${c.dim(line)}`);
          }
        } else {
          console.log(`${c.bold("Remote:")} ${c.yellow("none")}`);
        }
      } catch {
        console.log(`${c.bold("Remote:")} ${c.yellow("none")}`);
      }
      console.log("");

      // Recent commits
      try {
        const log = git(stateDir, 'log --oneline -5 --format="%h %s (%cr)"');
        if (log) {
          console.log(`${c.bold("Recent commits:")}`);
          for (const line of log.split("\n")) {
            console.log(`  ${line}`);
          }
        }
      } catch {
        console.log(`${c.bold("Commits:")} ${c.dim("none yet")}`);
      }
      console.log("");

      // Status
      try {
        const status = git(stateDir, "status --short");
        if (status) {
          console.log(`${c.bold("Changes:")}`);
          for (const line of status.split("\n")) {
            console.log(`  ${line}`);
          }
        } else {
          console.log(`${c.bold("Changes:")} ${c.green("clean")}`);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.log(`${c.red(icons.error)} ${msg}`);
      }
      process.exit(0);
    });
}
