/**
 * Diagnose Mode — SHARP 3.0
 *
 * Pipeline: load benchmark → compute SHARP category scores → identify weak dimensions
 *           → LLM root-cause analysis → actionable suggestions
 *
 * Analyses the 5 SHARP categories (Safety, Usefulness, Accuracy, Relevance, Personalization)
 * and their 19 sub-components to find the real weak dimensions.
 */

import type {
  BenchmarkCategory,
  BenchmarkProfile,
  BenchmarkResult,
  BenchmarkRun,
  CategoryScore,
  SharpRating,
} from './types.js';
import { BenchmarkRunner, type BenchmarkRunnerConfig } from './benchmark-runner.js';
import { computeSharpCategoryScores, normalizeScoreForDisplay } from './category-scorer.js';
import { createGitHubIssue, buildDiagnoseIssueBody } from './github-issues.js';
import { ALL_BENCHMARK_TESTS } from './benchmark-seed.js';
import { t } from '../locales/index.js';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { getSkillsDir } from '../tools/skill-tools.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('Diagnose');

// ─── Interfaces ───

export interface DiagnoseWeakness {
  category: string; // SHARP category: "safety" | "usefulness" | "accuracy" | "relevance" | "personalization"
  label: string;
  score: number;
  gap: number;
  weakSubComponents: Array<{ name: string; score: number }>;
  failingTests: Array<{
    testCaseId: string;
    score: number;
    feedback: string;
    issues: Array<{ type: string; description: string; severity: string }>;
  }>;
  commonPatterns: string[];
}

export interface DiagnoseSuggestion {
  category: string;
  description: string;
  targetFiles: string[];
  priority: 'high' | 'medium' | 'low';
}

/** Data quality issue found in test case mock_context */
export interface DataGap {
  testCaseId: string;
  type: 'missing_data' | 'unrealistic_value' | 'insufficient_context' | 'no_mock_context';
  description: string;
  field?: string;
  suggestion: string;
}

export interface DiagnoseResult {
  run: BenchmarkRun;
  overallScore: number;
  weaknesses: DiagnoseWeakness[];
  suggestions: DiagnoseSuggestion[];
  dataGaps: DataGap[];
  issuesCreated: Array<{ number: number; url: string }>;
}

/**
 * Pre-existing benchmark data — pass this to skip re-running the benchmark
 */
export interface ExistingBenchmarkData {
  run: BenchmarkRun;
  results: BenchmarkResult[];
  categoryScores: Map<BenchmarkCategory, CategoryScore>;
}

// ─── SHARP Labels ───

const SHARP_LABELS: Record<string, string> = {
  safety: 'Safety',
  usefulness: 'Usefulness',
  accuracy: 'Accuracy',
  relevance: 'Relevance',
  personalization: 'Personalization',
};

const SHARP_TARGET_FILE_MAP: Record<string, string[]> = {
  safety: ['src/prompts/SOUL.md', 'src/skills/safety-guard/SKILL.md'],
  usefulness: ['src/prompts/SOUL.md'],
  accuracy: ['src/prompts/SOUL.md', 'src/tools/health-data.ts'],
  relevance: ['src/prompts/SOUL.md'],
  personalization: ['src/prompts/SOUL.md'],
};

// ─── Data Gap Analysis ───

/** Known physiological bounds for health data validation */
const HEALTH_BOUNDS: Record<string, { min: number; max: number; label: string }> = {
  restingAvg: { min: 40, max: 120, label: 'resting heart rate' },
  maxToday: { min: 60, max: 220, label: 'max heart rate' },
  minToday: { min: 30, max: 100, label: 'min heart rate' },
  totalSleepMin: { min: 0, max: 840, label: 'total sleep (min)' }, // 0-14h
  deepSleepMin: { min: 0, max: 300, label: 'deep sleep (min)' },
  qualityScore: { min: 0, max: 100, label: 'sleep quality score' },
};

const DATA_HINTS: Array<{ keyword: string; field: string }> = [
  { keyword: '心率', field: 'heartRate' },
  { keyword: 'heart rate', field: 'heartRate' },
  { keyword: '睡眠', field: 'sleep' },
  { keyword: 'sleep', field: 'sleep' },
  { keyword: '步数', field: 'steps' },
  { keyword: 'steps', field: 'steps' },
  { keyword: '运动', field: 'workout' },
  { keyword: 'workout', field: 'workout' },
  { keyword: '体重', field: 'weight' },
  { keyword: 'weight', field: 'weight' },
];

/**
 * Check health override records for unrealistic values and day-over-day jumps.
 */
function checkHealthOverrideValues(testCaseId: string, healthOverrides: Record<string, unknown>): DataGap[] {
  const gaps: DataGap[] = [];

  for (const [dataType, data] of Object.entries(healthOverrides)) {
    if (!data || typeof data !== 'object') {
      continue;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const records = (data as any).daily || (data as any).sessions;
    if (!Array.isArray(records)) {
      continue;
    }

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      for (const [field, bounds] of Object.entries(HEALTH_BOUNDS)) {
        if (field in record) {
          const val = record[field];
          if (typeof val === 'number' && (val < bounds.min || val > bounds.max)) {
            gaps.push({
              testCaseId,
              type: 'unrealistic_value',
              field: `${dataType}.${field}`,
              description: `${bounds.label} = ${val} is outside physiological range [${bounds.min}-${bounds.max}]`,
              suggestion: `Fix ${dataType}.${field} to a realistic value within [${bounds.min}-${bounds.max}]`,
            });
          }
        }
      }

      if ('restingAvg' in record && i > 0 && 'restingAvg' in records[i - 1]) {
        const delta = Math.abs(record.restingAvg - records[i - 1].restingAvg);
        if (delta > 30) {
          gaps.push({
            testCaseId,
            type: 'unrealistic_value',
            field: `${dataType}.restingAvg`,
            description: `Resting HR jumps by ${delta} bpm between consecutive days (${records[i - 1].restingAvg} → ${record.restingAvg}) — medically implausible`,
            suggestion: 'Use gradual day-over-day changes (±5-10 bpm) unless testing an emergency scenario',
          });
        }
      }
    }
  }

  return gaps;
}

/**
 * Check if query references data types not in mock_context.
 */
function checkMissingDataHints(testCaseId: string, query: string, healthOverrides: Record<string, unknown>): DataGap[] {
  const gaps: DataGap[] = [];
  const queryLower = query.toLowerCase();

  for (const hint of DATA_HINTS) {
    if (queryLower.includes(hint.keyword) && !(hint.field in healthOverrides)) {
      gaps.push({
        testCaseId,
        type: 'missing_data',
        field: hint.field,
        description: `Query mentions "${hint.keyword}" but mock_context has no "${hint.field}" data`,
        suggestion: `Add ${hint.field} data to mock_context so the agent can give a data-grounded answer`,
      });
    }
  }

  return gaps;
}

/**
 * Analyze test case data quality: find missing context, unrealistic values, etc.
 * Runs on failing test cases to suggest data improvements.
 */
function analyzeDataGaps(results: BenchmarkResult[]): DataGap[] {
  const gaps: DataGap[] = [];
  const testCaseMap = new Map(ALL_BENCHMARK_TESTS.map((tc) => [tc.id, tc]));

  for (const result of results) {
    if (result.passed) {
      continue;
    }

    const tc = testCaseMap.get(result.testCaseId);
    if (!tc || !tc.healthOverrides || Object.keys(tc.healthOverrides).length === 0) {
      continue;
    }

    gaps.push(...checkHealthOverrideValues(tc.id, tc.healthOverrides));
    gaps.push(...checkMissingDataHints(tc.id, tc.query, tc.healthOverrides));
  }

  const seen = new Set<string>();
  return gaps.filter((g) => {
    const key = `${g.testCaseId}::${g.field || g.type}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

// ─── Main Pipeline ───

/**
 * Step 1: Load or run benchmark data.
 */
async function loadBenchmarkData(opts: {
  profile: BenchmarkProfile;
  runnerConfig?: BenchmarkRunnerConfig;
  existingBenchmark?: ExistingBenchmarkData;
  log: (msg: string) => void;
}): Promise<{ run: BenchmarkRun; results: BenchmarkResult[] }> {
  if (opts.existingBenchmark) {
    const { run, results } = opts.existingBenchmark;
    const score = normalizeScoreForDisplay(run.overallScore).toFixed(2);
    opts.log(
      t('evolution.diagnoseUsingExisting', {
        score,
        passed: run.passedCount,
        total: run.totalTestCases,
      })
    );
    return { run, results };
  }
  if (opts.runnerConfig) {
    opts.log(t('evolution.diagnosing'));
    const runner = new BenchmarkRunner(opts.runnerConfig);
    await runner.seedTestCases();
    const benchResult = await runner.run({ profile: opts.profile });
    opts.log(
      `${t('evolution.diagnoseComplete')}: ${normalizeScoreForDisplay(benchResult.run.overallScore).toFixed(2)} (${benchResult.run.passedCount}/${benchResult.run.totalTestCases})`
    );
    return { run: benchResult.run, results: benchResult.results };
  }
  throw new Error('diagnose() requires either existingBenchmark or runnerConfig');
}

const WEAKNESS_THRESHOLD = 0.7;

/**
 * Step 2: Identify weak SHARP categories from ratings.
 */
function identifyWeaknesses(results: BenchmarkResult[]): DiagnoseWeakness[] {
  const allRatings: SharpRating[] = [];
  for (const r of results) {
    if (Array.isArray(r.scores)) {
      allRatings.push(...r.scores);
    }
  }

  const sharpScores = computeSharpCategoryScores(allRatings);
  const weaknesses: DiagnoseWeakness[] = [];

  for (const [cat, data] of sharpScores) {
    if (data.score >= WEAKNESS_THRESHOLD) {
      continue;
    }

    const subGroups = new Map<string, number[]>();
    for (const r of data.subScores) {
      const list = subGroups.get(r.subComponent) || [];
      list.push(r.score);
      subGroups.set(r.subComponent, list);
    }

    const weakSubComponents: Array<{ name: string; score: number }> = [];
    for (const [name, scores] of subGroups) {
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      if (avg < WEAKNESS_THRESHOLD) {
        weakSubComponents.push({ name, score: Math.round(avg * 1000) / 1000 });
      }
    }
    weakSubComponents.sort((a, b) => a.score - b.score);

    weaknesses.push({
      category: cat,
      label: SHARP_LABELS[cat] || cat,
      score: data.score,
      gap: WEAKNESS_THRESHOLD - data.score,
      weakSubComponents,
      failingTests: findFailingTestsForSharpCategory(results, cat),
      commonPatterns: [],
    });
  }

  return weaknesses.sort((a, b) => b.gap - a.gap);
}

/**
 * Step 4: Create GitHub issues for weaknesses.
 */
async function createWeaknessIssues(
  weaknesses: DiagnoseWeakness[],
  logFn: (msg: string) => void
): Promise<Array<{ number: number; url: string }>> {
  const issuesCreated: Array<{ number: number; url: string }> = [];
  logFn('Creating GitHub issues...');

  for (const weakness of weaknesses) {
    try {
      const body = buildDiagnoseIssueBody(weakness);
      const result = await createGitHubIssue({
        title: `[Evolution] Improve ${weakness.label}: score ${normalizeScoreForDisplay(weakness.score).toFixed(2)}`,
        body,
        labels: ['evolution', 'auto-diagnose'],
      });
      if (result.number && result.url) {
        issuesCreated.push({ number: result.number, url: result.url });
        logFn(`Created issue #${result.number}: ${weakness.label}`);
      }
    } catch (error) {
      logFn(`Failed to create issue for ${weakness.label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return issuesCreated;
}

/**
 * Run diagnose pipeline: SHARP analysis -> weakness identification -> LLM analysis -> suggestions
 */
export async function diagnose(opts: {
  profile: BenchmarkProfile;
  runnerConfig?: BenchmarkRunnerConfig;
  existingBenchmark?: ExistingBenchmarkData;
  llmCall?: (prompt: string) => Promise<string>;
  createIssues?: boolean;
  onProgress?: (msg: string) => void;
}): Promise<DiagnoseResult> {
  const { llmCall, createIssues = false, onProgress } = opts;
  const logFn = onProgress || (() => {});

  const { run, results } = await loadBenchmarkData({ ...opts, log: logFn });
  const weaknesses = identifyWeaknesses(results);
  logFn(t('evolution.diagnoseFoundWeak', { count: weaknesses.length }));

  let suggestions: DiagnoseSuggestion[] = [];
  if (llmCall && weaknesses.length > 0) {
    logFn(t('evolution.diagnoseAnalyzing'));
    const llmResult = await analyzeDiagnoseWithLLM(llmCall, run, weaknesses, results);
    for (const w of weaknesses) {
      const analysis = llmResult.categoryAnalysis.find((a) => a.category === w.category);
      if (analysis) {
        w.commonPatterns = analysis.patterns;
      }
    }
    suggestions = llmResult.suggestions;
  } else if (weaknesses.length > 0) {
    suggestions = generateFallbackSuggestions(weaknesses);
  }
  logFn(t('evolution.diagnoseGenerated', { count: suggestions.length }));

  const issuesCreated = createIssues && weaknesses.length > 0 ? await createWeaknessIssues(weaknesses, logFn) : [];

  const dataGaps = analyzeDataGaps(results);
  if (dataGaps.length > 0) {
    logFn(`Found ${dataGaps.length} data quality issues in failing test cases`);
  }

  return { run, overallScore: run.overallScore, weaknesses, suggestions, dataGaps, issuesCreated };
}

// ─── SHARP Test Failure Detection ───

/**
 * Find test cases that scored poorly on a specific SHARP category.
 * For each test, computes the average of its sub-component scores in that category.
 * Tests with avg < 0.7 are considered "failing" for that SHARP dimension.
 */
function findFailingTestsForSharpCategory(
  results: BenchmarkResult[],
  sharpCategory: string
): DiagnoseWeakness['failingTests'] {
  const failing: DiagnoseWeakness['failingTests'] = [];
  const catLower = sharpCategory.toLowerCase();

  for (const r of results) {
    if (!Array.isArray(r.scores)) {
      continue;
    }

    // Get this test's ratings for the target SHARP category
    const catRatings = r.scores.filter((s) => s.category.toLowerCase() === catLower);
    if (catRatings.length === 0) {
      continue;
    }

    const avg = catRatings.reduce((sum, s) => sum + s.score, 0) / catRatings.length;
    if (avg < 0.7) {
      failing.push({
        testCaseId: r.testCaseId,
        score: avg,
        feedback: r.feedback || '',
        issues: r.issues || [],
      });
    }
  }

  return failing.sort((a, b) => a.score - b.score);
}

// ─── LLM Analysis ───

interface LLMDiagnoseResult {
  categoryAnalysis: Array<{
    category: string;
    patterns: string[];
  }>;
  suggestions: DiagnoseSuggestion[];
}

/**
 * Load the diagnose-analyst Skill content for the LLM prompt.
 */
function loadDiagnoseSkill(): string {
  try {
    const skillPath = join(getSkillsDir(), 'diagnose-analyst', 'SKILL.md');
    if (existsSync(skillPath)) {
      const content = readFileSync(skillPath, 'utf-8');
      const match = content.match(/^---[\s\S]*?---\s*([\s\S]*)$/);
      return match ? match[1].trim() : content;
    }
  } catch {
    // noop
  }
  return '';
}

/**
 * Use LLM to analyze benchmark weaknesses and generate intelligent suggestions.
 * Includes SHARP sub-component breakdown for precise root-cause analysis.
 */
async function analyzeDiagnoseWithLLM(
  llmCall: (prompt: string) => Promise<string>,
  run: BenchmarkRun,
  weaknesses: DiagnoseWeakness[],
  allResults: BenchmarkResult[]
): Promise<LLMDiagnoseResult> {
  const skillGuide = loadDiagnoseSkill();

  // Build per-weakness context with sub-component breakdown
  const categorySummaries = weaknesses.map((w) => {
    // Sub-component breakdown
    const subCompLines = w.weakSubComponents.map((sc) => `  - ${sc.name}: ${sc.score.toFixed(2)}`).join('\n');

    // Failing tests detail
    const failingSummary = w.failingTests
      .slice(0, 5)
      .map(
        (ft) =>
          `  - [${ft.testCaseId}] ${w.category}_avg=${ft.score.toFixed(2)}\n    feedback: ${ft.feedback?.slice(0, 300) || 'N/A'}\n    issues: ${ft.issues.map((i) => `${i.severity}/${i.type}: ${i.description}`).join('; ') || 'none'}`
      )
      .join('\n');

    return `### ${w.label} (${w.category})
- 综合得分: ${w.score.toFixed(3)} (距 0.7 阈值差: ${w.gap.toFixed(3)})
- 薄弱子维度:
${subCompLines || '  (无)'}
- 相关测试 (${w.failingTests.length} 个低于阈值):
${failingSummary || '  (无)'}`;
  });

  // Passing tests for contrast
  const passingSample = allResults
    .filter((r) => r.passed)
    .slice(0, 3)
    .map(
      (r) => `  - [${r.testCaseId}] score=${r.overallScore.toFixed(2)} feedback: ${r.feedback?.slice(0, 150) || 'N/A'}`
    )
    .join('\n');

  const prompt = `你是 PHA (Personal Health Agent) 的诊断分析师。请分析以下 SHARP 3.0 基准测试数据，找出薄弱维度的根因并给出改进建议。

${skillGuide ? `## 分析框架\n\n${skillGuide}\n\n` : ''}## SHARP 3.0 基准测试数据

### 总体情况
- 总分: ${normalizeScoreForDisplay(run.overallScore).toFixed(2)}
- 通过/总计: ${run.passedCount}/${run.totalTestCases}
- 版本: ${run.versionTag || 'unknown'}

### SHARP 薄弱维度（得分低于 0.7 阈值）

${categorySummaries.join('\n\n')}

### 通过测试示例（对比参考）
${passingSample || '无'}

## 要求

1. **根因分析**: 对每个薄弱 SHARP 维度，找出跨测试用例的共性问题（不要简单翻译 feedback，要归纳深层原因）
2. **改进建议**: 每条建议必须具体可操作，包含：根因 → 改什么 → 怎么改 → 预期效果
3. **目标文件**: 根据问题类型选择要修改的文件

## 输出 JSON（不要 markdown 包裹）

{
  "categoryAnalysis": [
    {
      "category": "accuracy",
      "patterns": ["共性问题1（中文，20字以内）", "共性问题2"]
    }
  ],
  "suggestions": [
    {
      "category": "accuracy",
      "description": "【根因】Agent 在回答中编造不在用户健康数据中的数值。【改进】在 SOUL.md 中添加数据引用规则，要求回复必须引用具体数据来源。【预期】A4 User Data Citation Accuracy 从 0.3 提升至 0.7+",
      "targetFiles": ["src/prompts/SOUL.md"],
      "priority": "high"
    }
  ]
}`;

  try {
    const response = await llmCall(prompt);
    const parsed = parseJSONResponse(response);

    if (parsed && parsed.suggestions && Array.isArray(parsed.suggestions)) {
      return {
        categoryAnalysis: parsed.categoryAnalysis || [],
        suggestions: parsed.suggestions.map(
          (s: { category?: string; description?: string; targetFiles?: string[]; priority?: string }) => ({
            category: s.category || 'accuracy',
            description: s.description || '',
            targetFiles: s.targetFiles || ['src/prompts/SOUL.md'],
            priority: (s.priority || 'medium') as 'high' | 'medium' | 'low',
          })
        ),
      };
    }

    // LLM returned something but JSON structure doesn't match — log it
    log.error("[diagnose] LLM response didn't match expected JSON structure. Response:", response?.slice(0, 500));
  } catch (error) {
    log.error('[diagnose] LLM analysis failed, falling back to rules:', error);
  }

  return {
    categoryAnalysis: [],
    suggestions: generateFallbackSuggestions(weaknesses),
  };
}

/**
 * Extract JSON from LLM response (may include markdown fences or extra text)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseJSONResponse(text: string): any {
  if (!text || typeof text !== 'string') {
    return null;
  }

  // Try direct parse first
  try {
    return JSON.parse(text.trim());
  } catch {
    // noop
  }

  // Try extracting from markdown code fence
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch {
      // noop
    }
  }

  // Try finding JSON object in text
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      // noop
    }
  }

  return null;
}

// ─── Fallback (no LLM) ───

/**
 * Rule-based fallback when no LLM is available.
 * Provides basic suggestions based on SHARP sub-component scores.
 */
function generateFallbackSuggestions(weaknesses: DiagnoseWeakness[]): DiagnoseSuggestion[] {
  const suggestions: DiagnoseSuggestion[] = [];

  for (const weakness of weaknesses) {
    let priority: 'high' | 'medium' | 'low';
    if (weakness.gap > 0.3) {
      priority = 'high';
    } else if (weakness.gap > 0.15) {
      priority = 'medium';
    } else {
      priority = 'low';
    }
    const targetFiles = SHARP_TARGET_FILE_MAP[weakness.category] || ['src/prompts/SOUL.md'];

    // Main suggestion per weak SHARP category
    const subCompInfo = weakness.weakSubComponents
      .slice(0, 3)
      .map((sc) => `${sc.name}(${sc.score.toFixed(2)})`)
      .join(', ');

    suggestions.push({
      category: weakness.category,
      description:
        t('evolution.diagnoseSuggestionImprove', {
          label: weakness.label,
          count: weakness.failingTests.length,
          gap: (weakness.gap * 100).toFixed(0),
        }) + (subCompInfo ? ` — ${t('evolution.weakSubComponents')}: ${subCompInfo}` : ''),
      targetFiles,
      priority,
    });
  }

  return suggestions;
}
