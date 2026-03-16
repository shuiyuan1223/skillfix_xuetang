/**
 * Workbench Initialization — seeds .pha/workbench/ with skills and prompts
 */

import { join } from 'path';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, copyFileSync } from 'fs';
import { getStateDir } from '../utils/config.js';
import { getSkillsDir } from '../tools/skill-tools.js';

// ── Candidate models ────────────────────────────────────────────

export const WORKBENCH_MODELS = [
  { id: 'glm-5', label: 'GLM-5' },
  { id: 'kimik25', label: 'Kimi K2.5' },
];

// ── Types ──────────────────────────────────────────────────────

export interface WorkbenchSkillItem {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  /** Baseline content captured at workbench initialization (used for diff/impact analysis) */
  baselineContent?: string;
  editedContent?: string;
  dirty?: boolean;
}

export interface WorkbenchPromptItem {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  /** Baseline content captured at workbench initialization (used for diff/impact analysis) */
  baselineContent?: string;
  editedContent?: string;
  dirty?: boolean;
}

export interface WorkbenchResultBase {
  id: string;
  timestamp: number;
  status: 'running' | 'done' | 'error';
  errorMessage?: string;
  modelId?: string;
  modelLabel?: string;
  tokens?: number;
  durationMs?: number;
  /** Snapshot of enabled/total counts at run time */
  enabledPromptCount?: number;
  totalPromptCount?: number;
  enabledSkillCount?: number;
  totalSkillCount?: number;
  enabledSkillNames?: string;
  enabledPromptNames?: string;
}

export interface WorkbenchInterpretResult extends WorkbenchResultBase {
  kind: 'interpret';
  text: string;
  /** Full composite prompt sent to LLM (for copy-to-clipboard) */
  messages?: string;
}

export interface WorkbenchDiffResult extends WorkbenchResultBase {
  kind: 'diff';
  /** Progress text while running (and fallback content on error) */
  text: string;
  /** Baseline run (before changes) */
  beforeOutput?: string;
  beforeMessages?: string;
  /** Current run (after changes) */
  afterOutput?: string;
  afterMessages?: string;
  /** Unified diff of outputs (optional; if missing, UI falls back to before/after view) */
  outputUnifiedDiff?: string;
  /** Diff of any changed skill/prompt content vs baseline */
  skillDiffs?: Array<{ id: string; enabled: boolean; before: string; after: string; unifiedDiff?: string }>;
  promptDiffs?: Array<{ id: string; enabled: boolean; before: string; after: string; unifiedDiff?: string }>;
  /** Model-generated analysis summary (markdown) */
  analysisText?: string;
  /** LLM-annotated before output with semantic highlights */
  annotatedBefore?: string;
  /** LLM-annotated after output with semantic highlights */
  annotatedAfter?: string;
}

export type WorkbenchResult = WorkbenchInterpretResult | WorkbenchDiffResult;

export interface WorkbenchState {
  activeTab: 'skills' | 'prompts';
  skills: WorkbenchSkillItem[];
  prompts: WorkbenchPromptItem[];
  selectedSkillId: string | null;
  selectedPromptId: string | null;
  testData: string;
  currentResult: WorkbenchResult | null;
  results: WorkbenchResult[];
  resultViewModes: Record<string, 'rendered' | 'source'>;
  selectedModelId: string;
  skillsListExpanded?: boolean;
  promptsListExpanded?: boolean;
  skillPreviewMode?: boolean;
  promptPreviewMode?: boolean;
  testDataPreviewMode?: boolean;
  /** When true, clicking "Run" triggers diff comparison instead of single interpretation */
  diffMode?: boolean;
  /** Cache for "before" LLM output — reused if before content unchanged between runs */
  beforeOutputCache?: { beforeMessage: string; output: string };
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

const DEFAULT_PROMPT_CONTENT = `你是一位专业的运动健康分析师，具备运动科学、睡眠医学、心血管健康等专业知识背景。

你的任务是生成一份**综合健康摘要**，帮助用户全面回顾昨日至今晨的健康状况，并结合历史趋势提供深度洞察。

## 报告定位

这是一份晨间健康摘要，它需要：
- 提炼2-3个核心洞察作为重点，其余指标简要呈现
- 发现跨领域的关联（如运动与睡眠质量、压力与静息心率的关系）
- 覆盖主要健康维度（睡眠、运动、活动量、心率等），但详略得当
- 结合近7天数据分析趋势变化，识别积极信号或需关注的模式

## 报告结构参考（根据内容动态调整）

# [数据日期] 健康摘要

[2-3句话概括昨日至今晨的整体健康状态]

## 核心洞察

### [洞察1标题]
[展开分析，包含数据支撑和趋势对比]

### [洞察2标题]
[展开分析，包含数据支撑和趋势对比]

### [洞察3标题]（可选，视数据情况）
[展开分析]

## 趋势观察

[近7天的整体趋势分析，识别正在改善或需要关注的方向]

## 今日建议

[2-3条具体可执行的建议，与洞察内容呼应]

## 分析原则

1. **洞察驱动**：有重点地分析，核心洞察深入展开，常规指标简明扼要；只说有价值的话，正常指标一笔带过，异常或亮点重点展开
2. **纵向对比**：将数据与近7天历史进行对比，量化趋势变化
3. **关联分析**：发现不同维度之间的关联和因果关系
4. **温暖专业**：语气温暖、鼓励，避免冷冰冰的数据罗列；专业但不吓人
`;

// ── Main ───────────────────────────────────────────────────────

export async function initializeWorkbench(): Promise<WorkbenchState> {
  ensureDirs();

  const skillsDir = getWorkbenchSkillsDir();
  const promptsDir = getWorkbenchPromptsDir();
  const srcSkillsDir = getSkillsDir();

  // Seed skills if workbench skills dir is empty
  const existingSkills = readdirSync(skillsDir).filter((f) => existsSync(join(skillsDir, f, 'SKILL.md')));
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
    testData: '',
    currentResult: null,
    results: [],
    resultViewModes: {},
    selectedModelId: WORKBENCH_MODELS[0].id,
    diffMode: false,
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
      enabled: false,
      baselineContent: content,
    };
  });
}

/** Extract a short description from the first non-heading non-empty line */
function extractPromptDescription(content: string): string {
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      return trimmed.length > 60 ? `${trimmed.slice(0, 60)}…` : trimmed;
    }
  }
  return '';
}

export function loadWorkbenchPrompts(): WorkbenchPromptItem[] {
  const dir = getWorkbenchPromptsDir();
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter((f) => f.endsWith('.md'));
  return files.sort().map((f) => {
    const id = f.replace(/\.md$/, '');
    const content = existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf-8') : '';
    return {
      id,
      name: id,
      description: extractPromptDescription(content),
      enabled: false,
      baselineContent: content,
    };
  });
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
