/**
 * File Operation Agent Tools
 *
 * Lightweight file system tools for SystemAgent, inspired by pi-coding-agent.
 * These complement (NOT replace) claude_code — use these for reading/searching/exploring,
 * and claude_code for actual code editing in git worktrees.
 */

import { Type } from '@sinclair/typebox';
import type { AgentTool, AgentToolResult } from '@mariozechner/pi-agent-core';
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { execSync } from 'child_process';

const toResult = (data: unknown): AgentToolResult<unknown> => ({
  content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  details: data,
});

// ========================================================================
// Read File Tool
// ========================================================================

const ReadFileSchema = Type.Object({
  path: Type.String({ description: 'File path (absolute or relative to project root)' }),
  startLine: Type.Optional(Type.Number({ description: 'Start line number (1-based)' })),
  endLine: Type.Optional(Type.Number({ description: 'End line number (inclusive)' })),
});

export const readFileAgentTool: AgentTool<typeof ReadFileSchema> = {
  name: 'read_file',
  description:
    'Read the contents of a file. Optionally specify line range. Use this for quick file inspection before deciding whether to use claude_code for edits.',
  label: 'Read File',
  parameters: ReadFileSchema,
  execute: async (
    _id: string,
    params: { path: string; startLine?: number; endLine?: number }
  ): Promise<AgentToolResult<unknown>> => {
    try {
      if (!existsSync(params.path)) {
        return toResult({ success: false, error: `File not found: ${params.path}` });
      }

      const content = readFileSync(params.path, 'utf-8');
      const lines = content.split('\n');

      if (params.startLine || params.endLine) {
        const start = (params.startLine || 1) - 1;
        const end = params.endLine || lines.length;
        const slice = lines.slice(start, end);
        return toResult({
          success: true,
          path: params.path,
          content: slice.join('\n'),
          totalLines: lines.length,
          range: `${start + 1}-${end}`,
        });
      }

      // Truncate very large files
      if (lines.length > 500) {
        return toResult({
          success: true,
          path: params.path,
          content: lines.slice(0, 500).join('\n'),
          totalLines: lines.length,
          truncated: true,
          message: `Showing first 500 of ${lines.length} lines. Use startLine/endLine to read specific range.`,
        });
      }

      return toResult({
        success: true,
        path: params.path,
        content,
        totalLines: lines.length,
      });
    } catch (error) {
      return toResult({ success: false, error: (error as Error).message });
    }
  },
};

// ========================================================================
// Grep Tool
// ========================================================================

const GrepSchema = Type.Object({
  pattern: Type.String({ description: 'Search pattern (regex supported)' }),
  path: Type.Optional(Type.String({ description: 'Directory or file to search in (default: project root)' })),
  include: Type.Optional(Type.String({ description: "File glob pattern to include (e.g., '*.ts', '*.md')" })),
  maxResults: Type.Optional(Type.Number({ description: 'Max results to return (default: 50)' })),
});

export const grepAgentTool: AgentTool<typeof GrepSchema> = {
  name: 'grep_search',
  description:
    'Search for a pattern across files using ripgrep. Returns matching lines with file paths and line numbers.',
  label: 'Grep Search',
  parameters: GrepSchema,
  execute: async (
    _id: string,
    params: { pattern: string; path?: string; include?: string; maxResults?: number }
  ): Promise<AgentToolResult<unknown>> => {
    try {
      const maxResults = params.maxResults || 50;
      const args = ['rg', '--no-heading', '--line-number', '--color=never', `-m ${maxResults}`];

      if (params.include) {
        args.push(`--glob '${params.include}'`);
      }

      args.push(`'${params.pattern.replace(/'/g, "'\\''")}'`);

      if (params.path) {
        args.push(params.path);
      }

      const output = execSync(args.join(' '), {
        cwd: process.cwd(),
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 10000,
      }).trim();

      const matches = output
        .split('\n')
        .filter((l) => l.trim())
        .slice(0, maxResults);

      return toResult({
        success: true,
        pattern: params.pattern,
        matches,
        count: matches.length,
      });
    } catch (error) {
      const err = error as { status?: number; stdout?: string; message: string };
      // rg returns exit code 1 when no matches found
      if (err.status === 1) {
        return toResult({
          success: true,
          pattern: params.pattern,
          matches: [],
          count: 0,
          message: 'No matches found',
        });
      }
      return toResult({ success: false, error: err.message });
    }
  },
};

// ========================================================================
// Find Files Tool
// ========================================================================

const FindFilesSchema = Type.Object({
  pattern: Type.String({ description: "Glob pattern (e.g., '**/*.ts', 'src/**/*.md')" }),
  path: Type.Optional(Type.String({ description: 'Directory to search in (default: project root)' })),
  maxResults: Type.Optional(Type.Number({ description: 'Max results (default: 100)' })),
});

export const findFilesAgentTool: AgentTool<typeof FindFilesSchema> = {
  name: 'find_files',
  description: 'Find files matching a glob pattern. Use this to discover project structure and locate files.',
  label: 'Find Files',
  parameters: FindFilesSchema,
  execute: async (
    _id: string,
    params: { pattern: string; path?: string; maxResults?: number }
  ): Promise<AgentToolResult<unknown>> => {
    try {
      const maxResults = params.maxResults || 100;
      const searchDir = params.path || process.cwd();

      // Use fd if available, fallback to find
      let cmd: string;
      try {
        execSync('which fd', { stdio: 'pipe' });
        cmd = `fd --glob '${params.pattern}' '${searchDir}' --max-results ${maxResults}`;
      } catch {
        cmd = `find '${searchDir}' -name '${params.pattern}' -type f 2>/dev/null | head -${maxResults}`;
      }

      const output = execSync(cmd, {
        cwd: process.cwd(),
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 10000,
      }).trim();

      const files = output
        .split('\n')
        .filter((f) => f.trim())
        .slice(0, maxResults);

      return toResult({
        success: true,
        pattern: params.pattern,
        files,
        count: files.length,
      });
    } catch (error) {
      return toResult({ success: false, error: (error as Error).message });
    }
  },
};

// ========================================================================
// List Directory Tool
// ========================================================================

const ListDirSchema = Type.Object({
  path: Type.Optional(Type.String({ description: 'Directory path (default: project root)' })),
  recursive: Type.Optional(Type.Boolean({ description: 'List recursively (default: false, max depth 2)' })),
});

export const listDirAgentTool: AgentTool<typeof ListDirSchema> = {
  name: 'list_directory',
  description: 'List files and directories in a given path. Shows file sizes and types.',
  label: 'List Directory',
  parameters: ListDirSchema,
  execute: async (_id: string, params: { path?: string; recursive?: boolean }): Promise<AgentToolResult<unknown>> => {
    try {
      const dir = params.path || process.cwd();
      if (!existsSync(dir)) {
        return toResult({ success: false, error: `Directory not found: ${dir}` });
      }

      const entries: { name: string; type: string; size?: number }[] = [];

      function listDir(dirPath: string, depth: number): void {
        if (depth > (params.recursive ? 2 : 0)) {
          return;
        }
        const items = readdirSync(dirPath);
        for (const item of items) {
          if (item.startsWith('.') || item === 'node_modules' || item === 'dist') {
            continue;
          }
          const fullPath = join(dirPath, item);
          try {
            const stat = statSync(fullPath);
            const relPath = relative(dir, fullPath);
            if (stat.isDirectory()) {
              entries.push({ name: `${relPath}/`, type: 'dir' });
              if (params.recursive) {
                listDir(fullPath, depth + 1);
              }
            } else {
              entries.push({ name: relPath, type: 'file', size: stat.size });
            }
          } catch {
            // Skip inaccessible entries
          }
        }
      }

      listDir(dir, 0);

      return toResult({
        success: true,
        path: dir,
        entries,
        count: entries.length,
      });
    } catch (error) {
      return toResult({ success: false, error: (error as Error).message });
    }
  },
};

// ========================================================================
// Bash Execute Tool
// ========================================================================

const BashSchema = Type.Object({
  command: Type.String({ description: 'Shell command to execute' }),
  cwd: Type.Optional(Type.String({ description: 'Working directory (default: project root)' })),
  timeout: Type.Optional(Type.Number({ description: 'Timeout in milliseconds (default: 30000, max: 60000)' })),
});

export const bashAgentTool: AgentTool<typeof BashSchema> = {
  name: 'bash_execute',
  description:
    'Execute a shell command. Use for build, test, and inspection commands. For code editing, use claude_code instead.',
  label: 'Bash Execute',
  parameters: BashSchema,
  execute: async (
    _id: string,
    params: { command: string; cwd?: string; timeout?: number }
  ): Promise<AgentToolResult<unknown>> => {
    try {
      const timeout = Math.min(params.timeout || 30000, 60000);
      const output = execSync(params.command, {
        cwd: params.cwd || process.cwd(),
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout,
      });

      // Truncate very long output
      const maxLen = 10000;
      const truncated = output.length > maxLen;
      const result = truncated ? `${output.slice(0, maxLen)}\n...(truncated)` : output;

      return toResult({
        success: true,
        command: params.command,
        output: result.trim(),
        truncated,
      });
    } catch (error) {
      const err = error as { stderr?: string; stdout?: string; status?: number; message: string };
      return toResult({
        success: false,
        command: params.command,
        exitCode: err.status,
        stdout: (err.stdout || '').slice(0, 5000),
        stderr: (err.stderr || '').slice(0, 5000),
        error: err.message,
      });
    }
  },
};

// ========================================================================
// Export all file tools
// ========================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const fileAgentTools: AgentTool<any>[] = [
  readFileAgentTool,
  grepAgentTool,
  findFilesAgentTool,
  listDirAgentTool,
  bashAgentTool,
];
