/**
 * Workbench Initialization — seeds .pha/workbench/ with skills and prompts
 */

import { join } from 'path';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, copyFileSync } from 'fs';
import { getStateDir } from '../utils/config.js';
import { getSkillsDir } from '../tools/skill-tools.js';

// ── Types ──────────────────────────────────────────────────────

export interface WorkbenchSkillItem {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  editedContent?: string;
  dirty?: boolean;
}

export interface WorkbenchPromptItem {
  id: string;
  name: string;
  active: boolean;
  editedContent?: string;
  dirty?: boolean;
}

export interface WorkbenchResult {
  text: string;
  timestamp: number;
  tokens?: number;
  durationMs?: number;
}

export interface WorkbenchState {
  activeTab: 'skills' | 'prompts';
  skills: WorkbenchSkillItem[];
  prompts: WorkbenchPromptItem[];
  selectedSkillId: string | null;
  selectedPromptId: string | null;
  activePromptId: string | null;
  testData: string;
  currentResult: WorkbenchResult | null;
  previousResult: WorkbenchResult | null;
  runStatus: 'ready' | 'running' | 'done' | 'error';
  errorMessage?: string;
}

// ── Helpers ────────────────────────────────────────────────────

export function getWorkbenchDir(): string {
  return join(getStateDir(), 'workbench');
}

function getWorkbenchSkillsDir(): string {
  return join(getWorkbenchDir(), 'skills');
}

function getWorkbenchPromptsDir(): string {
  return join(getWorkbenchDir(), 'prompts');
}

function ensureDirs(): void {
  const dirs = [getWorkbenchDir(), getWorkbenchSkillsDir(), getWorkbenchPromptsDir()];
  for (const d of dirs) {
    if (!existsSync(d)) mkdirSync(d, { recursive: true });
  }
}

/** Health-coaching category skills to seed into workbench */
const SEED_SKILL_NAMES = [
  'sleep-coach',
  'heart-monitor',
  'health-overview',
  'stress-management',
  'workout-tracker',
  'nutrition',
  'weight-management',
  'blood-pressure',
  'blood-sugar',
  'blood-oxygen',
  'body-temp',
  'reproductive-health',
];

const DEFAULT_PROMPT_CONTENT = `# Health Interpretation Prompt

You are a health data interpreter. Analyze the provided health data and generate a comprehensive, personalized interpretation.

## Guidelines

1. **Summarize key metrics** — highlight notable values
2. **Identify trends** — compare to normal ranges
3. **Flag anomalies** — anything outside expected bounds
4. **Provide actionable advice** — practical recommendations
5. **Use empathetic tone** — supportive and non-alarmist

## Output Format

Respond in structured markdown with sections:
- Overview
- Key Findings
- Recommendations
`;

// ── Main ───────────────────────────────────────────────────────

export async function initializeWorkbench(): Promise<WorkbenchState> {
  ensureDirs();

  const skillsDir = getWorkbenchSkillsDir();
  const promptsDir = getWorkbenchPromptsDir();
  const srcSkillsDir = getSkillsDir();

  // Seed skills if workbench skills dir is empty
  const existingSkills = readdirSync(skillsDir).filter((f) =>
    existsSync(join(skillsDir, f, 'SKILL.md'))
  );
  if (existingSkills.length === 0) {
    for (const name of SEED_SKILL_NAMES) {
      const srcPath = join(srcSkillsDir, name, 'SKILL.md');
      if (existsSync(srcPath)) {
        const destDir = join(skillsDir, name);
        if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
        copyFileSync(srcPath, join(destDir, 'SKILL.md'));
      }
    }
  }

  // Seed default prompt if prompts dir is empty
  const existingPrompts = readdirSync(promptsDir).filter((f) => f.endsWith('.md'));
  if (existingPrompts.length === 0) {
    writeFileSync(join(promptsDir, 'health_interpretation.md'), DEFAULT_PROMPT_CONTENT, 'utf-8');
  }

  // Build state from disk
  const skills = loadWorkbenchSkills();
  const prompts = loadWorkbenchPrompts();

  return {
    activeTab: 'skills',
    skills,
    prompts,
    selectedSkillId: null,
    selectedPromptId: null,
    activePromptId: prompts.length > 0 ? prompts[0].id : null,
    testData: '',
    currentResult: null,
    previousResult: null,
    runStatus: 'ready',
  };
}

/** Extract description from SKILL.md YAML frontmatter */
function extractDescription(content: string): string {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return '';
  const yaml = match[1];
  const descMatch = yaml.match(/^description:\s*"?([^"\n]*)"?/m);
  return descMatch ? descMatch[1].trim() : '';
}

export function loadWorkbenchSkills(): WorkbenchSkillItem[] {
  const dir = getWorkbenchSkillsDir();
  if (!existsSync(dir)) return [];
  const entries = readdirSync(dir).filter((f) => existsSync(join(dir, f, 'SKILL.md')));
  return entries.sort().map((name) => {
    const content = readFileSync(join(dir, name, 'SKILL.md'), 'utf-8');
    return {
      id: name,
      name,
      description: extractDescription(content),
      enabled: true,
    };
  });
}

export function loadWorkbenchPrompts(): WorkbenchPromptItem[] {
  const dir = getWorkbenchPromptsDir();
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter((f) => f.endsWith('.md'));
  return files.sort().map((f) => ({
    id: f.replace(/\.md$/, ''),
    name: f.replace(/\.md$/, ''),
    active: false,
  }));
}

export function readWorkbenchSkillContent(skillId: string): string {
  const path = join(getWorkbenchSkillsDir(), skillId, 'SKILL.md');
  return existsSync(path) ? readFileSync(path, 'utf-8') : '';
}

export function readWorkbenchPromptContent(promptId: string): string {
  const path = join(getWorkbenchPromptsDir(), `${promptId}.md`);
  return existsSync(path) ? readFileSync(path, 'utf-8') : '';
}

export function writeWorkbenchSkillContent(skillId: string, content: string): void {
  const dir = join(getWorkbenchSkillsDir(), skillId);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), content, 'utf-8');
}

export function writeWorkbenchPromptContent(promptId: string, content: string): void {
  const dir = getWorkbenchPromptsDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${promptId}.md`), content, 'utf-8');
}
