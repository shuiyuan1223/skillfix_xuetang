/**
 * Git Agent Tools
 *
 * Adapts git MCP tools to pi-agent AgentTool format (TypeBox schemas).
 */

import { Type } from "@sinclair/typebox";
import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import {
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
} from "../tools/git-tools.js";

const toResult = async (fn: () => Promise<unknown>): Promise<AgentToolResult<unknown>> => {
  const result = await fn();
  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    details: result,
  };
};

// Schemas
const OptionalPathSchema = Type.Object({
  path: Type.Optional(Type.String({ description: "Working directory path" })),
});

const GitLogSchema = Type.Object({
  limit: Type.Optional(Type.Number({ description: "Max commits to return (default: 20)" })),
  branch: Type.Optional(Type.String({ description: "Branch name" })),
  all: Type.Optional(Type.Boolean({ description: "Show all branches" })),
});

const BranchPathSchema = Type.Object({
  branch: Type.String({ description: "Branch name (e.g., 'evo/v3')" }),
  path: Type.String({ description: "File path relative to repo root" }),
});

const GitDiffSchema = Type.Object({
  branch: Type.String({ description: "Branch to diff" }),
  baseBranch: Type.Optional(Type.String({ description: "Base branch (default: main)" })),
});

const EmptySchema = Type.Object({});

const BranchCreateSchema = Type.Object({
  triggerMode: Type.Optional(
    Type.String({ description: "Trigger mode (manual, auto-loop, agent)" })
  ),
  triggerRef: Type.Optional(Type.String({ description: "Reference ID" })),
});

const BranchSchema = Type.Object({
  branch: Type.String({ description: "Branch name" }),
});

const GitCommitSchema = Type.Object({
  files: Type.Array(Type.String(), { description: "File paths to stage" }),
  message: Type.String({ description: "Commit message" }),
  cwd: Type.Optional(Type.String({ description: "Working directory" })),
});

const OptionalCwdSchema = Type.Object({
  cwd: Type.Optional(Type.String({ description: "Working directory" })),
});

// Agent tools
export const gitStatusAgentTool: AgentTool<typeof OptionalPathSchema> = {
  name: gitStatusTool.name,
  description: gitStatusTool.description,
  label: "Git Status",
  parameters: OptionalPathSchema,
  execute: async (_id: string, params: { path?: string }) =>
    toResult(() => gitStatusTool.execute(params)),
};

export const gitLogAgentTool: AgentTool<typeof GitLogSchema> = {
  name: gitLogTool.name,
  description: gitLogTool.description,
  label: "Git Log",
  parameters: GitLogSchema,
  execute: async (_id: string, params: { limit?: number; branch?: string; all?: boolean }) =>
    toResult(() => gitLogTool.execute(params)),
};

export const gitShowFileAgentTool: AgentTool<typeof BranchPathSchema> = {
  name: gitShowFileTool.name,
  description: gitShowFileTool.description,
  label: "Git Show File",
  parameters: BranchPathSchema,
  execute: async (_id: string, params: { branch: string; path: string }) =>
    toResult(() => gitShowFileTool.execute(params)),
};

export const gitDiffAgentTool: AgentTool<typeof GitDiffSchema> = {
  name: gitDiffTool.name,
  description: gitDiffTool.description,
  label: "Git Diff",
  parameters: GitDiffSchema,
  execute: async (_id: string, params: { branch: string; baseBranch?: string }) =>
    toResult(() => gitDiffTool.execute(params)),
};

export const gitBranchListAgentTool: AgentTool<typeof EmptySchema> = {
  name: gitBranchListTool.name,
  description: gitBranchListTool.description,
  label: "Git Branch List",
  parameters: EmptySchema,
  execute: async () => toResult(() => gitBranchListTool.execute()),
};

export const gitBranchCreateAgentTool: AgentTool<typeof BranchCreateSchema> = {
  name: gitBranchCreateTool.name,
  description: gitBranchCreateTool.description,
  label: "Git Branch Create",
  parameters: BranchCreateSchema,
  execute: async (_id: string, params: { triggerMode?: string; triggerRef?: string }) =>
    toResult(() => gitBranchCreateTool.execute(params)),
};

export const gitBranchDeleteAgentTool: AgentTool<typeof BranchSchema> = {
  name: gitBranchDeleteTool.name,
  description: gitBranchDeleteTool.description,
  label: "Git Branch Delete",
  parameters: BranchSchema,
  execute: async (_id: string, params: { branch: string }) =>
    toResult(() => gitBranchDeleteTool.execute(params)),
};

export const gitWorktreeListAgentTool: AgentTool<typeof EmptySchema> = {
  name: gitWorktreeListTool.name,
  description: gitWorktreeListTool.description,
  label: "Git Worktree List",
  parameters: EmptySchema,
  execute: async () => toResult(() => gitWorktreeListTool.execute()),
};

export const gitCommitAgentTool: AgentTool<typeof GitCommitSchema> = {
  name: gitCommitTool.name,
  description: gitCommitTool.description,
  label: "Git Commit",
  parameters: GitCommitSchema,
  execute: async (_id: string, params: { files: string[]; message: string; cwd?: string }) =>
    toResult(() => gitCommitTool.execute(params)),
};

export const gitMergeAgentTool: AgentTool<typeof BranchSchema> = {
  name: gitMergeTool.name,
  description: gitMergeTool.description,
  label: "Git Merge",
  parameters: BranchSchema,
  execute: async (_id: string, params: { branch: string }) =>
    toResult(() => gitMergeTool.execute(params)),
};

export const gitRevertAgentTool: AgentTool<typeof OptionalCwdSchema> = {
  name: gitRevertTool.name,
  description: gitRevertTool.description,
  label: "Git Revert",
  parameters: OptionalCwdSchema,
  execute: async (_id: string, params: { cwd?: string }) =>
    toResult(() => gitRevertTool.execute(params)),
};

export const gitChangedFilesAgentTool: AgentTool<typeof BranchSchema> = {
  name: gitChangedFilesTool.name,
  description: gitChangedFilesTool.description,
  label: "Git Changed Files",
  parameters: BranchSchema,
  execute: async (_id: string, params: { branch: string }) =>
    toResult(() => gitChangedFilesTool.execute(params)),
};

// All git agent tools
export const gitAgentTools: AgentTool<any>[] = [
  gitStatusAgentTool,
  gitLogAgentTool,
  gitShowFileAgentTool,
  gitDiffAgentTool,
  gitBranchListAgentTool,
  gitBranchCreateAgentTool,
  gitBranchDeleteAgentTool,
  gitWorktreeListAgentTool,
  gitCommitAgentTool,
  gitMergeAgentTool,
  gitRevertAgentTool,
  gitChangedFilesAgentTool,
];
