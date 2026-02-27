/**
 * Claude Code Optimizer
 *
 * Spawns Claude Code CLI as a subprocess to make intelligent
 * prompt/skill modifications based on benchmark feedback.
 */

import type { BenchmarkCategory } from './types.js';
import { CATEGORY_LABELS } from './benchmark-seed.js';

export interface OptimizationContext {
  category: BenchmarkCategory;
  failingTests: Array<{
    testCaseId: string;
    query: string;
    agentResponse: string;
    feedback: string;
    score: number;
    issues: Array<{ type: string; description: string; severity: string }>;
  }>;
  currentPromptContent: Record<string, string>; // filename -> content
  currentSkillContent: Record<string, string>; // filename -> content
}

export interface OptimizationResult {
  success: boolean;
  output: string;
  filesChanged: string[];
  error?: string;
}

/**
 * Build the optimization prompt for Claude Code
 */
export function buildOptimizationPrompt(context: OptimizationContext): string {
  const categoryLabel = CATEGORY_LABELS[context.category];
  const failingDetails = context.failingTests
    .map(
      (t, i) => `
### Failing Test ${i + 1}: ${t.testCaseId}
**Query:** ${t.query}
**Score:** ${t.score}/100
**Agent Response (truncated):**
${t.agentResponse.substring(0, 500)}${t.agentResponse.length > 500 ? '...' : ''}

**Evaluator Feedback:** ${t.feedback}
**Issues:**
${t.issues.map((issue) => `- [${issue.severity}] ${issue.type}: ${issue.description}`).join('\n')}
`
    )
    .join('\n---\n');

  const promptFiles = Object.entries(context.currentPromptContent)
    .map(([file, content]) => `**${file}:**\n\`\`\`\n${content.substring(0, 2000)}\n\`\`\``)
    .join('\n\n');

  const skillFiles = Object.entries(context.currentSkillContent)
    .map(([file, content]) => `**${file}:**\n\`\`\`\n${content.substring(0, 1000)}\n\`\`\``)
    .join('\n\n');

  return `You are optimizing a Personal Health Agent (PHA) that is underperforming in the "${categoryLabel}" benchmark category.

## Task
Analyze the failing test cases below and make targeted modifications to the system prompts and/or skill guides to improve the agent's performance in this category. Focus on the most impactful changes.

## Constraints
- Only modify files in src/prompts/ and src/skills/
- Make minimal, targeted changes — do not rewrite entire files
- Each change should address specific failing test patterns
- Git commit each change with a descriptive message
- Do NOT modify any TypeScript code, tests, or configuration files

## Failing Test Cases in "${categoryLabel}"
${failingDetails}

## Current System Prompts
${promptFiles}

## Current Skill Guides (relevant)
${skillFiles}

## Instructions
1. Identify the root cause of failures from the evaluator feedback
2. Propose specific, minimal modifications to prompts/skills
3. Apply the changes by editing the files directly
4. Git commit each logical change separately

Focus on the patterns across failures, not individual test cases.`;
}

/**
 * Spawn Claude Code CLI to optimize prompts/skills
 */
export async function optimizeWithClaudeCode(
  context: OptimizationContext,
  projectRoot: string
): Promise<OptimizationResult> {
  const { spawn } = await import('child_process');

  // Check if claude CLI is available
  const claudePath = await findClaudeCli();
  if (!claudePath) {
    return {
      success: false,
      output: '',
      filesChanged: [],
      error: 'Claude Code CLI not found. Install it with: npm install -g @anthropic-ai/claude-code',
    };
  }

  const prompt = buildOptimizationPrompt(context);

  return new Promise((resolve) => {
    const proc = spawn(claudePath, ['--print', '--dangerously-skip-permissions', '-p', prompt], {
      cwd: projectRoot,
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        resolve({
          success: false,
          output: stdout,
          filesChanged: [],
          error: `Claude Code exited with code ${code}: ${stderr}`,
        });
        return;
      }

      // Parse changed files from git
      getChangedFiles(projectRoot).then((files) => {
        resolve({
          success: true,
          output: stdout,
          filesChanged: files,
        });
      });
    });

    proc.on('error', (error) => {
      resolve({
        success: false,
        output: '',
        filesChanged: [],
        error: `Failed to spawn Claude Code: ${error.message}`,
      });
    });

    // Timeout after 5 minutes
    setTimeout(
      () => {
        proc.kill('SIGTERM');
        resolve({
          success: false,
          output: stdout,
          filesChanged: [],
          error: 'Claude Code optimization timed out (5 minutes)',
        });
      },
      5 * 60 * 1000
    );
  });
}

/**
 * Find the Claude CLI executable
 */
async function findClaudeCli(): Promise<string | null> {
  const { execSync } = await import('child_process');

  try {
    const path = execSync('which claude', { encoding: 'utf-8', timeout: 5000 }).trim();
    return path || null;
  } catch {
    // Try common paths
    const commonPaths = [
      '/usr/local/bin/claude',
      `${process.env.HOME}/.npm-global/bin/claude`,
      `${process.env.HOME}/.local/bin/claude`,
    ];

    const { existsSync } = await import('fs');
    for (const p of commonPaths) {
      if (existsSync(p)) {
        return p;
      }
    }

    return null;
  }
}

/**
 * Get list of changed files from git
 */
async function getChangedFiles(cwd: string): Promise<string[]> {
  const { execSync } = await import('child_process');

  try {
    const output = execSync('git diff --name-only HEAD~1', {
      cwd,
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();

    return output ? output.split('\n').filter(Boolean) : [];
  } catch {
    return [];
  }
}

/**
 * Read current prompt files
 */
export async function readPromptFiles(projectRoot: string): Promise<Record<string, string>> {
  const { readdirSync, readFileSync, existsSync } = await import('fs');
  const { join } = await import('path');

  const promptDir = join(projectRoot, 'src/prompts');
  const result: Record<string, string> = {};

  if (!existsSync(promptDir)) {
    return result;
  }

  try {
    const files = readdirSync(promptDir);
    for (const file of files) {
      if (file.endsWith('.md')) {
        result[file] = readFileSync(join(promptDir, file), 'utf-8');
      }
    }
  } catch {
    // ignore
  }

  return result;
}

/**
 * Read current skill files relevant to a category
 */
export async function readSkillFiles(
  projectRoot: string,
  category: BenchmarkCategory
): Promise<Record<string, string>> {
  const { readdirSync, readFileSync, existsSync } = await import('fs');
  const { join } = await import('path');

  const skillsDir = join(projectRoot, 'src/skills');
  const result: Record<string, string> = {};

  if (!existsSync(skillsDir)) {
    return result;
  }

  // Map categories to relevant skill directories
  const categorySkillMap: Record<BenchmarkCategory, string[]> = {
    'health-data-analysis': ['health-overview', 'weekly-review'],
    'health-coaching': ['goal-coach', 'workout-tracker'],
    'safety-boundaries': [],
    'personalization-memory': [],
    'communication-quality': [],
  };

  const relevantSkills = categorySkillMap[category] || [];

  try {
    const dirs = readdirSync(skillsDir);
    for (const dir of dirs) {
      // Include if relevant to category, or always include for safety/communication
      if (relevantSkills.length === 0 || relevantSkills.includes(dir)) {
        const skillFile = join(skillsDir, dir, 'SKILL.md');
        if (existsSync(skillFile)) {
          result[`${dir}/SKILL.md`] = readFileSync(skillFile, 'utf-8');
        }
      }
    }
  } catch {
    // ignore
  }

  return result;
}
