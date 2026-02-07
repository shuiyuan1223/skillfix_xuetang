/**
 * GitHub Integration
 *
 * Utilities for creating issues, branches, and PRs
 * using the gh CLI tool.
 *
 * All subprocess calls are async (non-blocking) to avoid freezing
 * the event loop / WebSocket message delivery.
 */

import { exec as execCb } from "child_process";
import { promisify } from "util";

const execPromise = promisify(execCb);

/**
 * Get a clean env for gh CLI — strips GITHUB_TOKEN if it looks like a placeholder
 * to let gh use its keyring-based auth instead.
 */
function getGhEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  const token = env.GITHUB_TOKEN;
  if (token && (token.includes("your_token") || token.length < 20)) {
    delete env.GITHUB_TOKEN;
  }
  return env;
}

/**
 * Non-blocking shell exec with timeout
 */
async function run(cmd: string, timeout = 15000): Promise<string> {
  const { stdout } = await execPromise(cmd, {
    encoding: "utf-8",
    timeout,
    env: getGhEnv(),
  });
  return stdout;
}

export interface GitHubIssue {
  number: number;
  title: string;
  body: string;
  labels: string[];
  state: string;
}

/**
 * Get a GitHub issue by number
 */
export async function getIssue(issueNumber: number): Promise<GitHubIssue | null> {
  try {
    const result = await run(`gh issue view ${issueNumber} --json number,title,body,labels,state`);
    const parsed = JSON.parse(result);
    return {
      number: parsed.number,
      title: parsed.title,
      body: parsed.body,
      labels: parsed.labels?.map((l: { name: string }) => l.name) || [],
      state: parsed.state,
    };
  } catch {
    return null;
  }
}

/**
 * Create a new branch for an auto-fix
 */
export async function createAutoFixBranch(issueNumber: number): Promise<string> {
  const branchName = `auto-fix/issue-${issueNumber}`;

  try {
    await run(`git checkout -b ${branchName}`, 10000);
    return branchName;
  } catch {
    // Branch might exist
    await run(`git checkout ${branchName}`, 10000);
    return branchName;
  }
}

/**
 * Create a pull request with benchmark comparison
 */
export async function createPR(options: {
  title: string;
  body: string;
  base?: string;
  labels?: string[];
}): Promise<string> {
  const labelArgs = options.labels?.map((l) => `-l "${l}"`).join(" ") || "";
  const base = options.base || "main";

  // Push current branch
  try {
    const branch = (await run("git branch --show-current", 5000)).trim();
    await run(`git push -u origin ${branch}`, 30000);
  } catch {
    // Push might fail if no remote
  }

  const result = await run(
    `gh pr create --title "${options.title.replace(/"/g, '\\"')}" --body "${options.body.replace(/"/g, '\\"')}" --base ${base} ${labelArgs}`
  );

  return result.trim();
}

/**
 * Comment on a GitHub issue
 */
export async function commentOnIssue(issueNumber: number, body: string): Promise<void> {
  await run(`gh issue comment ${issueNumber} --body "${body.replace(/"/g, '\\"')}"`);
}

/**
 * Switch back to main branch
 */
export async function switchToMain(): Promise<void> {
  await run("git checkout main", 10000);
}

// ============================================================================
// Dashboard Data Fetching
// ============================================================================

export interface GitHubIssueListItem {
  number: number;
  title: string;
  state: string;
  labels: string[];
  createdAt: string;
  updatedAt: string;
  author: string;
}

export interface GitHubPR {
  number: number;
  title: string;
  state: string;
  labels: string[];
  createdAt: string;
  author: string;
  headRefName: string;
  baseRefName: string;
  isDraft: boolean;
}

export interface GitBranchInfo {
  current: string;
  branches: string[];
  recentCommits: Array<{
    hash: string;
    shortHash: string;
    message: string;
    date: string;
    author: string;
  }>;
}

export interface GitHubRepoInfo {
  name: string;
  url: string;
  defaultBranch: string;
  openIssueCount: number;
  openPRCount: number;
}

/**
 * List recent GitHub issues
 */
export async function listIssues(limit = 20): Promise<GitHubIssueListItem[]> {
  try {
    const result = await run(
      `gh issue list --limit ${limit} --state all --json number,title,state,labels,createdAt,updatedAt,author`
    );
    const parsed = JSON.parse(result);
    return parsed.map((i: Record<string, unknown>) => ({
      number: i.number,
      title: i.title,
      state: i.state,
      labels: ((i.labels as Array<{ name: string }>) || []).map((l) => l.name),
      createdAt: i.createdAt,
      updatedAt: i.updatedAt,
      author: (i.author as { login: string })?.login || "unknown",
    }));
  } catch {
    return [];
  }
}

/**
 * List recent pull requests
 */
export async function listPRs(limit = 10): Promise<GitHubPR[]> {
  try {
    const result = await run(
      `gh pr list --limit ${limit} --state all --json number,title,state,labels,createdAt,author,headRefName,baseRefName,isDraft`
    );
    const parsed = JSON.parse(result);
    return parsed.map((p: Record<string, unknown>) => ({
      number: p.number,
      title: p.title,
      state: p.state,
      labels: ((p.labels as Array<{ name: string }>) || []).map((l) => l.name),
      createdAt: p.createdAt,
      author: (p.author as { login: string })?.login || "unknown",
      headRefName: p.headRefName,
      baseRefName: p.baseRefName,
      isDraft: p.isDraft || false,
    }));
  } catch {
    return [];
  }
}

/**
 * Get git branch info and recent commits
 */
export async function getBranchInfo(): Promise<GitBranchInfo> {
  let current = "unknown";
  let branches: string[] = [];
  const recentCommits: GitBranchInfo["recentCommits"] = [];

  // Run local git commands in parallel (they're fast but still non-blocking)
  const [currentRes, branchRes, logRes] = await Promise.allSettled([
    run("git branch --show-current", 5000),
    run("git branch --list --no-color", 5000),
    run('git log --oneline --format="%H|%h|%s|%ci|%an" -10', 5000),
  ]);

  if (currentRes.status === "fulfilled") {
    current = currentRes.value.trim();
  }

  if (branchRes.status === "fulfilled") {
    branches = branchRes.value
      .split("\n")
      .map((b) => b.replace(/^\*?\s+/, "").trim())
      .filter(Boolean);
  }

  if (logRes.status === "fulfilled") {
    for (const line of logRes.value.split("\n").filter(Boolean)) {
      const [hash, shortHash, message, date, author] = line.split("|");
      recentCommits.push({ hash, shortHash, message, date, author });
    }
  }

  return { current, branches, recentCommits };
}

/**
 * Get repo overview info
 */
export async function getRepoInfo(): Promise<GitHubRepoInfo | null> {
  try {
    const result = await run("gh repo view --json name,url,defaultBranchRef");
    const parsed = JSON.parse(result);

    // Get counts in parallel
    const [issueCountRes, prCountRes] = await Promise.allSettled([
      run("gh issue list --state open --json number --jq length", 10000),
      run("gh pr list --state open --json number --jq length", 10000),
    ]);

    let openIssueCount = 0;
    let openPRCount = 0;

    if (issueCountRes.status === "fulfilled") {
      openIssueCount = parseInt(issueCountRes.value.trim(), 10) || 0;
    }
    if (prCountRes.status === "fulfilled") {
      openPRCount = parseInt(prCountRes.value.trim(), 10) || 0;
    }

    return {
      name: parsed.name,
      url: parsed.url,
      defaultBranch: parsed.defaultBranchRef?.name || "main",
      openIssueCount,
      openPRCount,
    };
  } catch {
    return null;
  }
}
