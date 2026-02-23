/**
 * Claude Code AgentTool
 *
 * Wraps the Claude CLI as an AgentTool so SystemAgent can execute coding tasks
 * in git worktree directories.
 */

import { Type } from "@sinclair/typebox";
import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";

const ClaudeCodeSchema = Type.Object({
  prompt: Type.String({ description: "The task prompt for Claude Code" }),
  workingDirectory: Type.String({ description: "Directory to operate in (worktree path)" }),
  allowedTools: Type.Optional(
    Type.String({ description: "Comma-separated tool list. Default: Read,Edit,Write,Glob,Grep" })
  ),
  model: Type.Optional(Type.String({ description: "Model to use. Default: sonnet" })),
  maxTurns: Type.Optional(Type.Number({ description: "Max agentic turns. Default: 20" })),
});

interface ClaudeCodeResult {
  success: boolean;
  result?: string;
  filesChanged?: string[];
  error?: string;
}

async function executeClaudeCode(params: {
  prompt: string;
  workingDirectory: string;
  allowedTools?: string;
  model?: string;
  maxTurns?: number;
}): Promise<ClaudeCodeResult> {
  const args = ["claude", "-p", "--output-format", "json", "--dangerously-skip-permissions"];

  if (params.model) {
    args.push("--model", params.model);
  }

  if (params.maxTurns) {
    args.push("--max-turns", String(params.maxTurns));
  }

  if (params.allowedTools) {
    args.push("--allowedTools", params.allowedTools);
  }

  try {
    const proc = Bun.spawn(args, {
      cwd: params.workingDirectory,
      stdin: new Response(params.prompt).body!,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, CLAUDECODE: undefined },
    });

    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);

    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      return {
        success: false,
        error: stderr || `Claude Code exited with code ${exitCode}`,
        result: stdout || undefined,
      };
    }

    // Parse JSON output
    let resultText = stdout;
    try {
      const parsed = JSON.parse(stdout);
      resultText = parsed.result || parsed.text || stdout;
    } catch {
      // Not JSON, use raw output
    }

    // Get changed files via git status
    let filesChanged: string[] = [];
    try {
      const gitProc = Bun.spawn(["git", "status", "--porcelain"], {
        cwd: params.workingDirectory,
        stdout: "pipe",
        stderr: "pipe",
      });
      const gitOut = await new Response(gitProc.stdout).text();
      await gitProc.exited;
      filesChanged = gitOut
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => line.slice(3).trim());
    } catch {
      // Non-critical
    }

    return {
      success: true,
      result: resultText,
      filesChanged,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export const claudeCodeAgentTool: AgentTool<typeof ClaudeCodeSchema> = {
  name: "claude_code",
  description:
    "Execute coding tasks using Claude Code CLI in a specified directory. Use this to edit source files, refactor code, or apply changes in a git worktree.",
  label: "Claude Code",
  parameters: ClaudeCodeSchema,
  execute: async (
    _toolCallId: string,
    params: {
      prompt: string;
      workingDirectory: string;
      allowedTools?: string;
      model?: string;
      maxTurns?: number;
    }
  ): Promise<AgentToolResult<unknown>> => {
    const result = await executeClaudeCode(params);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      details: result,
    };
  },
};
