/**
 * Version Manager
 *
 * Manages agent versions via git worktrees and branches.
 * Agent version = src/prompts/*.md + src/skills/SKILL.md files.
 * Version switching = changing file read paths, no containers needed.
 *
 * Uses `git worktree` for isolated modifications and `git show` for reads.
 */

import { execSync } from "child_process";
import { existsSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { createLogger } from "../utils/logger.js";
import {
  insertEvolutionVersion,
  updateEvolutionVersion,
  getEvolutionVersionByBranch,
  listEvolutionVersions,
} from "../memory/db.js";

const log = createLogger("Evolution/Version");
const WORKTREE_DIR = ".worktrees";
const BRANCH_PREFIX = "evo/v";

export interface VersionInfo {
  id: string;
  branchName: string;
  worktreePath: string;
  parentBranch: string;
}

/**
 * Get the project root (where .git lives)
 */
export function getProjectRoot(): string {
  try {
    return execSync("git rev-parse --show-toplevel", {
      encoding: "utf-8",
      timeout: 5000,
    }).trim();
  } catch {
    return process.cwd();
  }
}

/**
 * Get the current branch name
 */
export function getCurrentBranch(): string {
  try {
    return execSync("git branch --show-current", {
      encoding: "utf-8",
      cwd: getProjectRoot(),
      timeout: 5000,
    }).trim();
  } catch {
    return "main";
  }
}

/**
 * Get the next available version number for evo/vN branches
 */
export function getNextVersionNumber(): number {
  try {
    const output = execSync("git branch -a --list 'evo/v*'", {
      encoding: "utf-8",
      cwd: getProjectRoot(),
      timeout: 5000,
    }).trim();

    if (!output) return 1;

    const numbers = output
      .split("\n")
      .map((b) =>
        b
          .trim()
          .replace(/^\*?\s*/, "")
          .replace(/^remotes\/origin\//, "")
      )
      .filter((b) => b.startsWith(BRANCH_PREFIX))
      .map((b) => parseInt(b.slice(BRANCH_PREFIX.length), 10))
      .filter((n) => !isNaN(n));

    return numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
  } catch {
    return 1;
  }
}

/**
 * Get worktree path for a branch
 */
export function getWorktreePath(branchName: string): string {
  const root = getProjectRoot();
  const safeName = branchName.replace(/\//g, "-");
  return join(root, WORKTREE_DIR, safeName);
}

/**
 * Create a git worktree for a new evolution branch
 */
export function createWorktree(
  branchName: string,
  options?: { triggerMode?: string; triggerRef?: string }
): VersionInfo {
  const root = getProjectRoot();
  const worktreePath = getWorktreePath(branchName);
  const parentBranch = getCurrentBranch();

  // Ensure worktree directory parent exists
  const worktreeParent = join(root, WORKTREE_DIR);
  if (!existsSync(worktreeParent)) {
    mkdirSync(worktreeParent, { recursive: true });
  }

  // Clean up stale worktree if directory already exists (e.g. from a previous failed run)
  if (existsSync(worktreePath)) {
    log.warn("Stale worktree directory found, cleaning up", { worktreePath, branchName });
    try {
      execSync(`git worktree remove "${worktreePath}" --force`, {
        cwd: root,
        timeout: 15000,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch {
      /* directory may not be a registered worktree — remove manually */
      try {
        rmSync(worktreePath, { recursive: true, force: true });
      } catch {
        /* best effort */
      }
    }
    // Prune any stale worktree references
    try {
      execSync("git worktree prune", { cwd: root, timeout: 10000, stdio: "pipe" });
    } catch {
      /* best effort */
    }
  }

  // Delete stale branch if it exists (so -b can recreate it from current HEAD)
  try {
    execSync(`git branch -D "${branchName}"`, {
      cwd: root,
      timeout: 10000,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch {
    /* branch doesn't exist — fine */
  }

  // Create worktree with new branch
  try {
    execSync(`git worktree add "${worktreePath}" -b "${branchName}"`, {
      cwd: root,
      encoding: "utf-8",
      timeout: 30000,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (error) {
    throw new Error(
      `Failed to create worktree for ${branchName}: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  // Create DB record
  const id = crypto.randomUUID();
  insertEvolutionVersion({
    id,
    branchName,
    parentBranch,
    createdAt: Date.now(),
    triggerMode: options?.triggerMode,
    triggerRef: options?.triggerRef,
    worktreePath,
  });

  return { id, branchName, worktreePath, parentBranch };
}

/**
 * Remove a git worktree
 */
export function removeWorktree(branchName: string): void {
  const root = getProjectRoot();
  const worktreePath = getWorktreePath(branchName);

  try {
    execSync(`git worktree remove "${worktreePath}" --force`, {
      cwd: root,
      encoding: "utf-8",
      timeout: 15000,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch {
    // Worktree might already be removed
  }
}

/**
 * Read a file from a specific branch without checkout
 */
export function readFileFromBranch(branch: string, filePath: string): string | null {
  try {
    return execSync(`git show "${branch}:${filePath}"`, {
      cwd: getProjectRoot(),
      encoding: "utf-8",
      timeout: 10000,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch {
    return null;
  }
}

/**
 * List all evolution branches (evo/* pattern)
 */
export function listEvolutionBranches(): string[] {
  try {
    const output = execSync("git branch --list 'evo/*'", {
      encoding: "utf-8",
      cwd: getProjectRoot(),
      timeout: 5000,
    }).trim();

    if (!output) return [];

    return output
      .split("\n")
      .map((b) => b.trim().replace(/^\*?\s*/, ""))
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * List active worktrees
 */
export function listWorktrees(): Array<{ path: string; branch: string }> {
  try {
    const output = execSync("git worktree list --porcelain", {
      encoding: "utf-8",
      cwd: getProjectRoot(),
      timeout: 5000,
    }).trim();

    if (!output) return [];

    const worktrees: Array<{ path: string; branch: string }> = [];
    let currentPath = "";

    for (const line of output.split("\n")) {
      if (line.startsWith("worktree ")) {
        currentPath = line.slice("worktree ".length);
      } else if (line.startsWith("branch ")) {
        const branch = line.slice("branch refs/heads/".length);
        if (currentPath && branch.startsWith("evo/")) {
          worktrees.push({ path: currentPath, branch });
        }
      }
    }

    return worktrees;
  } catch {
    return [];
  }
}

/**
 * Get files changed on a branch compared to its parent
 */
export function getChangedFilesOnBranch(branchName: string): string[] {
  try {
    const parentBranch = getEvolutionVersionByBranch(branchName)?.parent_branch || "main";
    const output = execSync(`git diff --name-only "${parentBranch}...${branchName}"`, {
      cwd: getProjectRoot(),
      encoding: "utf-8",
      timeout: 10000,
    }).trim();

    return output ? output.split("\n").filter(Boolean) : [];
  } catch {
    return [];
  }
}

/**
 * Merge an evolution branch into its parent (typically main)
 */
export function mergeVersion(branchName: string): { success: boolean; error?: string } {
  const root = getProjectRoot();
  const version = getEvolutionVersionByBranch(branchName);
  const parentBranch = version?.parent_branch || "main";

  try {
    // Record merge-base before merging (so we can diff after merge)
    let mergeBase: string | undefined;
    try {
      mergeBase = execSync(`git merge-base "${parentBranch}" "${branchName}"`, {
        cwd: root,
        encoding: "utf-8",
        timeout: 10000,
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();
    } catch {
      // If merge-base fails, proceed without it
    }

    // First remove the worktree so the branch isn't "checked out"
    removeWorktree(branchName);

    // Merge into parent
    execSync(`git merge "${branchName}" --no-ff -m "Merge ${branchName}: evolution version"`, {
      cwd: root,
      encoding: "utf-8",
      timeout: 30000,
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Update status with mergeBase in metadata
    if (version) {
      const existingMeta = version.metadata ? JSON.parse(version.metadata) : {};
      updateEvolutionVersion(version.id, {
        status: "merged",
        metadata: { ...existingMeta, mergeBase },
      });
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Read a file from an arbitrary git ref (commit hash or branch name)
 */
export function readFileFromRef(ref: string, filePath: string): string | null {
  try {
    return execSync(`git show "${ref}:${filePath}"`, {
      cwd: getProjectRoot(),
      encoding: "utf-8",
      timeout: 10000,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch {
    return null;
  }
}

/**
 * Get changed files for a version, handling merged versions via saved mergeBase
 */
export function getChangedFilesForVersion(branchName: string): string[] {
  const version = getEvolutionVersionByBranch(branchName);
  if (!version) return [];

  // Merged version: use saved mergeBase for diff
  if (version.status === "merged") {
    const meta = version.metadata ? JSON.parse(version.metadata) : {};
    if (meta.mergeBase) {
      try {
        const output = execSync(`git diff --name-only "${meta.mergeBase}" "${branchName}"`, {
          cwd: getProjectRoot(),
          encoding: "utf-8",
          timeout: 10000,
        }).trim();
        return output ? output.split("\n").filter(Boolean) : [];
      } catch {
        return [];
      }
    }
    return []; // No mergeBase saved (old data)
  }

  // Active/other versions: use existing three-dot diff
  return getChangedFilesOnBranch(branchName);
}

/**
 * Abandon a version — remove worktree and mark as abandoned
 */
export function abandonVersion(branchName: string): void {
  removeWorktree(branchName);

  const version = getEvolutionVersionByBranch(branchName);
  if (version) {
    updateEvolutionVersion(version.id, { status: "abandoned" });
  }
}

/**
 * Create a new evolution version with auto-incremented name
 */
export function createNextVersion(options?: {
  triggerMode?: string;
  triggerRef?: string;
}): VersionInfo {
  const nextNum = getNextVersionNumber();
  const branchName = `${BRANCH_PREFIX}${nextNum}`;
  return createWorktree(branchName, options);
}

/**
 * Get git status (porcelain format)
 */
export function getGitStatusPorcelain(path?: string): string {
  try {
    const cwd = path || getProjectRoot();
    return execSync("git status --porcelain", {
      cwd,
      encoding: "utf-8",
      timeout: 10000,
    }).trimEnd();
  } catch {
    return "";
  }
}

/**
 * Get structured git log
 */
export function getGitLog(opts?: { limit?: number; branch?: string; all?: boolean }): Array<{
  hash: string;
  shortHash: string;
  message: string;
  date: string;
  author: string;
  branch?: string;
}> {
  try {
    const limit = opts?.limit || 20;
    const allFlag = opts?.all ? "--all" : "";
    const branchArg = opts?.branch || "";
    const output = execSync(
      `git log ${allFlag} ${branchArg} --pretty=format:"%H|%h|%s|%ai|%an|%D" -n ${limit}`,
      {
        cwd: getProjectRoot(),
        encoding: "utf-8",
        timeout: 10000,
      }
    ).trim();

    if (!output) return [];

    return output.split("\n").map((line) => {
      const [hash, shortHash, message, date, author, refs] = line.split("|");
      return {
        hash,
        shortHash,
        message,
        date: new Date(date).toISOString(),
        author,
        branch: refs || undefined,
      };
    });
  } catch {
    return [];
  }
}

/**
 * Get diff content between branches (actual diff text)
 */
export function getGitDiffContent(branch: string, baseBranch?: string): string {
  try {
    const base = baseBranch || "main";
    return execSync(`git diff "${base}...${branch}"`, {
      cwd: getProjectRoot(),
      encoding: "utf-8",
      timeout: 30000,
      maxBuffer: 5 * 1024 * 1024,
    }).trim();
  } catch {
    return "";
  }
}

/**
 * Stage files and commit in the project root or a worktree
 */
export function gitCommitFiles(
  files: string | string[],
  message: string,
  cwd?: string
): { success: boolean; commitHash?: string; error?: string } {
  const workdir = cwd || getProjectRoot();
  const fileList = Array.isArray(files) ? files : [files];
  try {
    for (const f of fileList) {
      execSync(`git add "${f}"`, {
        cwd: workdir,
        encoding: "utf-8",
        timeout: 10000,
        stdio: ["pipe", "pipe", "pipe"],
      });
    }
    execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, {
      cwd: workdir,
      encoding: "utf-8",
      timeout: 15000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const hash = execSync("git rev-parse --short HEAD", {
      cwd: workdir,
      encoding: "utf-8",
      timeout: 5000,
    }).trim();
    return { success: true, commitHash: hash };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Revert the last commit on the current branch
 */
export function revertLastCommit(cwd?: string): {
  success: boolean;
  error?: string;
} {
  const workdir = cwd || getProjectRoot();
  try {
    execSync("git revert HEAD --no-edit", {
      cwd: workdir,
      encoding: "utf-8",
      timeout: 15000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
