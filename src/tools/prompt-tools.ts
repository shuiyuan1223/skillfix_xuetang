/**
 * Prompts Management Tools
 *
 * MCP tools for managing SOUL.md and other prompt files with Git version control.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs";
import { join, basename } from "path";
import { execSync } from "child_process";

// Default prompts directory (relative to project root)
let promptsDir = "src/prompts";

export function setPromptsDir(dir: string): void {
  promptsDir = dir;
}

export function getPromptsDir(): string {
  return promptsDir;
}

/**
 * Execute git command in prompts directory
 */
function git(args: string, cwd?: string): string {
  try {
    return execSync(`git ${args}`, {
      cwd: cwd || process.cwd(),
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    const err = error as { stderr?: string; message: string };
    throw new Error(err.stderr || err.message);
  }
}

/**
 * List all prompt files
 */
export const listPromptsTool = {
  name: "list_prompts",
  description: "List all prompt files (SOUL.md and other .md files in prompts directory)",
  parameters: {
    type: "object" as const,
    properties: {},
  },
  execute: async (_args?: Record<string, never>) => {
    const dir = getPromptsDir();
    if (!existsSync(dir)) {
      return { success: true, prompts: [] };
    }

    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => {
        const filePath = join(dir, f);
        const content = readFileSync(filePath, "utf-8");
        const lines = content.split("\n");
        const title = lines.find((l) => l.startsWith("# "))?.slice(2) || f;

        return {
          name: f.replace(".md", ""),
          filename: f,
          path: filePath,
          title,
          lines: lines.length,
          size: content.length,
        };
      });

    return {
      success: true,
      prompts: files,
      count: files.length,
    };
  },
};

/**
 * Get prompt content
 */
export const getPromptTool = {
  name: "get_prompt",
  description: "Get the content of a specific prompt file",
  parameters: {
    type: "object" as const,
    properties: {
      name: {
        type: "string",
        description: "Prompt name (e.g., 'SOUL' for SOUL.md)",
      },
    },
    required: ["name"],
  },
  execute: async (args: { name: string }) => {
    const filename = args.name.endsWith(".md") ? args.name : `${args.name}.md`;
    const filePath = join(getPromptsDir(), filename);

    if (!existsSync(filePath)) {
      return {
        success: false,
        error: `Prompt file not found: ${filename}`,
      };
    }

    const content = readFileSync(filePath, "utf-8");

    return {
      success: true,
      name: args.name,
      filename,
      path: filePath,
      content,
      lines: content.split("\n").length,
    };
  },
};

/**
 * Update prompt content with Git commit
 */
export const updatePromptTool = {
  name: "update_prompt",
  description: "Update a prompt file and create a Git commit for version history",
  parameters: {
    type: "object" as const,
    properties: {
      name: {
        type: "string",
        description: "Prompt name (e.g., 'SOUL' for SOUL.md)",
      },
      content: {
        type: "string",
        description: "New content for the prompt file",
      },
      commitMessage: {
        type: "string",
        description: "Git commit message describing the change",
      },
    },
    required: ["name", "content"],
  },
  execute: async (args: { name: string; content: string; commitMessage?: string }) => {
    const filename = args.name.endsWith(".md") ? args.name : `${args.name}.md`;
    const filePath = join(getPromptsDir(), filename);

    // Read old content for comparison
    const oldContent = existsSync(filePath) ? readFileSync(filePath, "utf-8") : "";

    if (oldContent === args.content) {
      return {
        success: true,
        message: "No changes detected",
        changed: false,
      };
    }

    // Write new content
    writeFileSync(filePath, args.content, "utf-8");

    // Git commit
    const message = args.commitMessage || `Update ${filename}`;
    try {
      git(`add "${filePath}"`);
      git(`commit -m "${message.replace(/"/g, '\\"')}"`);

      const commitHash = git("rev-parse --short HEAD");

      return {
        success: true,
        message: `Updated ${filename}`,
        changed: true,
        commitHash,
        commitMessage: message,
        oldLines: oldContent.split("\n").length,
        newLines: args.content.split("\n").length,
      };
    } catch (error) {
      // If git commit fails, still return success for the file update
      return {
        success: true,
        message: `Updated ${filename} (git commit failed)`,
        changed: true,
        gitError: (error as Error).message,
      };
    }
  },
};

/**
 * Get prompt Git history
 */
export const getPromptHistoryTool = {
  name: "get_prompt_history",
  description: "Get the Git version history of a prompt file",
  parameters: {
    type: "object" as const,
    properties: {
      name: {
        type: "string",
        description: "Prompt name (e.g., 'SOUL' for SOUL.md)",
      },
      limit: {
        type: "number",
        description: "Maximum number of commits to return (default: 20)",
      },
    },
    required: ["name"],
  },
  execute: async (args: { name: string; limit?: number }) => {
    const filename = args.name.endsWith(".md") ? args.name : `${args.name}.md`;
    const filePath = join(getPromptsDir(), filename);
    const limit = args.limit || 20;

    if (!existsSync(filePath)) {
      return {
        success: false,
        error: `Prompt file not found: ${filename}`,
      };
    }

    try {
      // Get git log for this file
      const logOutput = git(`log --pretty=format:"%H|%h|%s|%ai|%an" -n ${limit} -- "${filePath}"`);

      if (!logOutput) {
        return {
          success: true,
          commits: [],
          message: "No git history found for this file",
        };
      }

      const commits = logOutput.split("\n").map((line) => {
        const [hash, shortHash, message, date, author] = line.split("|");
        return {
          hash,
          shortHash,
          message,
          date: new Date(date).toISOString(),
          author,
        };
      });

      return {
        success: true,
        filename,
        commits,
        count: commits.length,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to get git history: ${(error as Error).message}`,
      };
    }
  },
};

/**
 * Revert prompt to a specific version
 */
export const revertPromptTool = {
  name: "revert_prompt",
  description: "Revert a prompt file to a specific Git commit version",
  parameters: {
    type: "object" as const,
    properties: {
      name: {
        type: "string",
        description: "Prompt name (e.g., 'SOUL' for SOUL.md)",
      },
      commitHash: {
        type: "string",
        description: "Git commit hash to revert to",
      },
    },
    required: ["name", "commitHash"],
  },
  execute: async (args: { name: string; commitHash: string }) => {
    const filename = args.name.endsWith(".md") ? args.name : `${args.name}.md`;
    const filePath = join(getPromptsDir(), filename);

    if (!existsSync(filePath)) {
      return {
        success: false,
        error: `Prompt file not found: ${filename}`,
      };
    }

    try {
      // Get content at specific commit
      const oldContent = git(`show ${args.commitHash}:"${filePath}"`);

      // Get current content for comparison
      const currentContent = readFileSync(filePath, "utf-8");

      if (oldContent === currentContent) {
        return {
          success: true,
          message: "Content is already at this version",
          changed: false,
        };
      }

      // Write reverted content
      writeFileSync(filePath, oldContent, "utf-8");

      // Commit the revert
      const shortHash = args.commitHash.slice(0, 7);
      const message = `Revert ${filename} to ${shortHash}`;
      git(`add "${filePath}"`);
      git(`commit -m "${message}"`);

      const newCommitHash = git("rev-parse --short HEAD");

      return {
        success: true,
        message: `Reverted ${filename} to ${shortHash}`,
        changed: true,
        revertedTo: args.commitHash,
        newCommitHash,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to revert: ${(error as Error).message}`,
      };
    }
  },
};

/**
 * Get content at specific commit (for diff preview)
 */
export const getPromptAtCommitTool = {
  name: "get_prompt_at_commit",
  description: "Get the content of a prompt file at a specific Git commit",
  parameters: {
    type: "object" as const,
    properties: {
      name: {
        type: "string",
        description: "Prompt name (e.g., 'SOUL' for SOUL.md)",
      },
      commitHash: {
        type: "string",
        description: "Git commit hash",
      },
    },
    required: ["name", "commitHash"],
  },
  execute: async (args: { name: string; commitHash: string }) => {
    const filename = args.name.endsWith(".md") ? args.name : `${args.name}.md`;
    const filePath = join(getPromptsDir(), filename);

    try {
      const content = git(`show ${args.commitHash}:"${filePath}"`);

      return {
        success: true,
        name: args.name,
        commitHash: args.commitHash,
        content,
        lines: content.split("\n").length,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to get content at commit: ${(error as Error).message}`,
      };
    }
  },
};

// Export all tools as array
export const promptTools = [
  listPromptsTool,
  getPromptTool,
  updatePromptTool,
  getPromptHistoryTool,
  revertPromptTool,
  getPromptAtCommitTool,
];
