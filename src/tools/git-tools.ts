/**
 * Git MCP Tools
 *
 * Exposes git operations as MCP tools so the Agent can manage
 * evolution branches, commits, diffs, and merges.
 */

import {
  getProjectRoot,
  getGitStatusPorcelain,
  getGitLog,
  getGitDiffContent,
  gitCommitFiles,
  revertLastCommit,
  readFileFromBranch,
  listEvolutionBranches,
  listWorktrees,
  getChangedFilesOnBranch,
  createNextVersion,
  mergeVersion,
  abandonVersion,
  removeWorktree,
} from "../evolution/version-manager.js";
import type { PHATool } from "./types.js";

// ============================================================================
// git_status
// ============================================================================

export const gitStatusTool: PHATool<{ path?: string }> = {
  name: "git_status",
  description: "显示 Git 工作区状态（porcelain 格式）",
  displayName: "工作区状态",
  category: "git" as const,
  icon: "git-branch",
  label: "Git Status",
  inputSchema: {
    type: "object" as const,
    properties: {
      path: {
        type: "string",
        description: "Working directory path (defaults to project root)",
      },
    },
  },
  execute: async (args?: { path?: string }) => {
    const output = getGitStatusPorcelain(args?.path);
    return {
      success: true,
      status: output || "(clean)",
      clean: !output,
    };
  },
};

// ============================================================================
// git_log
// ============================================================================

export const gitLogTool: PHATool<{ limit?: number; branch?: string; all?: boolean }> = {
  name: "git_log",
  description: "显示提交历史，支持按分支筛选",
  displayName: "提交历史",
  category: "git" as const,
  icon: "git-commit",
  label: "Git Log",
  inputSchema: {
    type: "object" as const,
    properties: {
      limit: {
        type: "number",
        description: "Max commits to return (default: 20)",
      },
      branch: {
        type: "string",
        description: "Branch name to show log for",
      },
      all: {
        type: "boolean",
        description: "Show commits from all branches",
      },
    },
  },
  execute: async (args?: { limit?: number; branch?: string; all?: boolean }) => {
    const commits = getGitLog(args);
    return {
      success: true,
      commits,
      count: commits.length,
    };
  },
};

// ============================================================================
// git_show_file
// ============================================================================

export const gitShowFileTool: PHATool<{ branch: string; path: string }> = {
  name: "git_show_file",
  description: "从指定分支读取文件内容（无需切换分支）",
  displayName: "查看文件",
  category: "git" as const,
  icon: "file-text",
  label: "Git Show File",
  inputSchema: {
    type: "object" as const,
    properties: {
      branch: {
        type: "string",
        description: "Branch name (e.g., 'evo/v3', 'main')",
      },
      path: {
        type: "string",
        description: "File path relative to repo root",
      },
    },
    required: ["branch", "path"],
  },
  execute: async (args: { branch: string; path: string }) => {
    const content = readFileFromBranch(args.branch, args.path);
    if (content === null) {
      return {
        success: false,
        error: `File not found: ${args.path} on branch ${args.branch}`,
      };
    }
    return {
      success: true,
      branch: args.branch,
      path: args.path,
      content,
      lines: content.split("\n").length,
    };
  },
};

// ============================================================================
// git_diff
// ============================================================================

export const gitDiffTool: PHATool<{ branch: string; baseBranch?: string }> = {
  name: "git_diff",
  description: "获取两个分支之间的差异（实际 diff 内容）",
  displayName: "查看差异",
  category: "git" as const,
  icon: "git-branch",
  label: "Git Diff",
  inputSchema: {
    type: "object" as const,
    properties: {
      branch: {
        type: "string",
        description: "Branch to diff (e.g., 'evo/v3')",
      },
      baseBranch: {
        type: "string",
        description: "Base branch to diff against (default: 'main')",
      },
    },
    required: ["branch"],
  },
  execute: async (args: { branch: string; baseBranch?: string }) => {
    const diff = getGitDiffContent(args.branch, args.baseBranch);
    return {
      success: true,
      branch: args.branch,
      baseBranch: args.baseBranch || "main",
      diff: diff || "(no differences)",
      hasDiff: !!diff,
    };
  },
};

// ============================================================================
// git_branch_list
// ============================================================================

export const gitBranchListTool: PHATool<Record<string, never>> = {
  name: "git_branch_list",
  description: "列出所有进化分支（evo/*）",
  displayName: "列出分支",
  category: "git" as const,
  icon: "git-branch",
  label: "Git Branch List",
  inputSchema: {
    type: "object" as const,
    properties: {},
  },
  execute: async () => {
    const branches = listEvolutionBranches();
    return {
      success: true,
      branches,
      count: branches.length,
    };
  },
};

// ============================================================================
// git_branch_create
// ============================================================================

export const gitBranchCreateTool: PHATool<{ triggerMode?: string; triggerRef?: string }> = {
  name: "git_branch_create",
  description: "创建新的进化分支（evo/vN），使用 git worktree 进行隔离修改",
  displayName: "创建分支",
  category: "git" as const,
  icon: "git-branch",
  label: "Git Branch Create",
  inputSchema: {
    type: "object" as const,
    properties: {
      triggerMode: {
        type: "string",
        description: "What triggered this version (e.g., 'manual', 'auto-loop', 'agent')",
      },
      triggerRef: {
        type: "string",
        description: "Reference ID (e.g., benchmark run ID)",
      },
    },
  },
  execute: async (args?: { triggerMode?: string; triggerRef?: string }) => {
    try {
      const version = createNextVersion(args);
      return {
        success: true,
        branch: version.branchName,
        worktreePath: version.worktreePath,
        parentBranch: version.parentBranch,
        id: version.id,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};

// ============================================================================
// git_branch_delete
// ============================================================================

export const gitBranchDeleteTool: PHATool<{ branch: string }> = {
  name: "git_branch_delete",
  description: "删除进化分支及其 worktree，标记为已放弃",
  displayName: "删除分支",
  category: "git" as const,
  icon: "git-branch",
  label: "Git Branch Delete",
  inputSchema: {
    type: "object" as const,
    properties: {
      branch: {
        type: "string",
        description: "Branch name to delete (e.g., 'evo/v3')",
      },
    },
    required: ["branch"],
  },
  execute: async (args: { branch: string }) => {
    try {
      abandonVersion(args.branch);
      return {
        success: true,
        message: `Abandoned and removed branch: ${args.branch}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};

// ============================================================================
// git_worktree_list
// ============================================================================

export const gitWorktreeListTool: PHATool<Record<string, never>> = {
  name: "git_worktree_list",
  description: "列出活跃的 git worktree（拥有工作目录的进化分支）",
  displayName: "工作树列表",
  category: "git" as const,
  icon: "git-branch",
  label: "Git Worktree List",
  inputSchema: {
    type: "object" as const,
    properties: {},
  },
  execute: async () => {
    const worktrees = listWorktrees();
    return {
      success: true,
      worktrees,
      count: worktrees.length,
    };
  },
};

// ============================================================================
// git_commit
// ============================================================================

export const gitCommitTool: PHATool<{ files: string[]; message: string; cwd?: string }> = {
  name: "git_commit",
  description: "暂存指定文件并创建 git 提交",
  displayName: "提交变更",
  category: "git" as const,
  icon: "git-commit",
  label: "Git Commit",
  inputSchema: {
    type: "object" as const,
    properties: {
      files: {
        type: "array",
        items: { type: "string" },
        description: "File paths to stage and commit",
      },
      message: {
        type: "string",
        description: "Commit message",
      },
      cwd: {
        type: "string",
        description: "Working directory (defaults to project root)",
      },
    },
    required: ["files", "message"],
  },
  execute: async (args: { files: string[]; message: string; cwd?: string }) => {
    const result = gitCommitFiles(args.files, args.message, args.cwd);
    return result;
  },
};

// ============================================================================
// git_merge
// ============================================================================

export const gitMergeTool: PHATool<{ branch: string }> = {
  name: "git_merge",
  description:
    "将进化分支合并到父分支（通常是 main）。重要：调用前必须先向用户展示变更内容（git_diff）并获得明确确认。",
  displayName: "合并分支",
  category: "git" as const,
  icon: "git-merge",
  label: "Git Merge",
  inputSchema: {
    type: "object" as const,
    properties: {
      branch: {
        type: "string",
        description: "Branch to merge (e.g., 'evo/v3')",
      },
    },
    required: ["branch"],
  },
  execute: async (args: { branch: string }) => {
    const result = mergeVersion(args.branch);
    return result;
  },
};

// ============================================================================
// git_revert
// ============================================================================

export const gitRevertTool: PHATool<{ cwd?: string }> = {
  name: "git_revert",
  description: "撤销当前分支的最后一次提交",
  displayName: "撤销提交",
  category: "git" as const,
  icon: "git-commit",
  label: "Git Revert",
  inputSchema: {
    type: "object" as const,
    properties: {
      cwd: {
        type: "string",
        description: "Working directory (defaults to project root)",
      },
    },
  },
  execute: async (args?: { cwd?: string }) => {
    const result = revertLastCommit(args?.cwd);
    return result;
  },
};

// ============================================================================
// git_changed_files
// ============================================================================

export const gitChangedFilesTool: PHATool<{ branch: string }> = {
  name: "git_changed_files",
  description: "列出某分支相对于父分支的变更文件",
  displayName: "变更文件",
  category: "git" as const,
  icon: "file-text",
  label: "Git Changed Files",
  inputSchema: {
    type: "object" as const,
    properties: {
      branch: {
        type: "string",
        description: "Branch name (e.g., 'evo/v3')",
      },
    },
    required: ["branch"],
  },
  execute: async (args: { branch: string }) => {
    const files = getChangedFilesOnBranch(args.branch);
    return {
      success: true,
      branch: args.branch,
      files,
      count: files.length,
    };
  },
};

// ============================================================================
// Export all tools
// ============================================================================

export const gitTools = [
  gitStatusTool,
  gitLogTool,
  gitShowFileTool,
  gitDiffTool,
  gitBranchListTool,
  gitBranchCreateTool,
  gitBranchDeleteTool,
  gitWorktreeListTool,
  gitCommitTool,
  gitMergeTool,
  gitRevertTool,
  gitChangedFilesTool,
];
