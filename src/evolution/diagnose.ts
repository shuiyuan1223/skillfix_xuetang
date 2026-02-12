/**
 * Diagnose Mode
 *
 * Pipeline: load benchmark → identify weak categories → LLM analysis → suggestions
 * Uses an LLM to analyze benchmark results, identify root causes,
 * and produce actionable optimization suggestions.
 */

import type {
  BenchmarkCategory,
  BenchmarkProfile,
  BenchmarkResult,
  BenchmarkRun,
  CategoryScore,
} from "./types.js";
import { BenchmarkRunner, type BenchmarkRunnerConfig } from "./benchmark-runner.js";
import {
  identifyWeakCategories,
  computeOverallScore,
  normalizeScoreForDisplay,
} from "./category-scorer.js";
import { CATEGORY_LABELS } from "./benchmark-seed.js";
import { createGitHubIssue, buildDiagnoseIssueBody } from "./github-issues.js";
import { t } from "../locales/index.js";

export interface DiagnoseWeakness {
  category: BenchmarkCategory;
  label: string;
  score: number;
  gap: number;
  failingTests: Array<{
    testCaseId: string;
    score: number;
    feedback: string;
    issues: Array<{ type: string; description: string; severity: string }>;
  }>;
  commonPatterns: string[];
}

export interface DiagnoseSuggestion {
  category: BenchmarkCategory;
  description: string;
  targetFiles: string[];
  priority: "high" | "medium" | "low";
}

export interface DiagnoseResult {
  run: BenchmarkRun;
  overallScore: number;
  weaknesses: DiagnoseWeakness[];
  suggestions: DiagnoseSuggestion[];
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

/**
 * Run diagnose pipeline: analyze weaknesses → LLM analysis → suggestions
 *
 * If `existingBenchmark` is provided, uses that data directly instead of re-running the benchmark.
 * If `llmCall` is provided, uses the LLM to analyze weaknesses and generate suggestions.
 */
export async function diagnose(opts: {
  profile: BenchmarkProfile;
  runnerConfig?: BenchmarkRunnerConfig;
  existingBenchmark?: ExistingBenchmarkData;
  llmCall?: (prompt: string) => Promise<string>;
  createIssues?: boolean;
  onProgress?: (msg: string) => void;
}): Promise<DiagnoseResult> {
  const {
    profile,
    runnerConfig,
    existingBenchmark,
    llmCall,
    createIssues = false,
    onProgress,
  } = opts;
  const log = onProgress || (() => {});

  let run: BenchmarkRun;
  let results: BenchmarkResult[];
  let categoryScores: Map<BenchmarkCategory, CategoryScore>;

  if (existingBenchmark) {
    // Use pre-existing benchmark results — no re-run needed
    run = existingBenchmark.run;
    results = existingBenchmark.results;
    categoryScores = existingBenchmark.categoryScores;
    const score = normalizeScoreForDisplay(run.overallScore).toFixed(2);
    log(
      t("evolution.diagnoseUsingExisting", {
        score,
        passed: run.passedCount,
        total: run.totalTestCases,
      })
    );
  } else if (runnerConfig) {
    // Fallback: Run benchmark from scratch
    log(t("evolution.diagnosing"));
    const runner = new BenchmarkRunner(runnerConfig);
    await runner.seedTestCases();
    ({ run, results, categoryScores } = await runner.run({ profile }));
    log(
      `${t("evolution.diagnoseComplete")}: ${normalizeScoreForDisplay(run.overallScore).toFixed(2)} (${run.passedCount}/${run.totalTestCases})`
    );
  } else {
    throw new Error("diagnose() requires either existingBenchmark or runnerConfig");
  }

  // Step 2: Identify weak categories (threshold-based filtering)
  const weakCategories = identifyWeakCategories(categoryScores);
  const weaknesses: DiagnoseWeakness[] = [];

  for (const weak of weakCategories) {
    const categoryPrefix = getCategoryPrefix(weak.category);
    const failingTests = results
      .filter((r) => !r.passed && r.testCaseId.startsWith(categoryPrefix))
      .map((r) => ({
        testCaseId: r.testCaseId,
        score: r.overallScore,
        feedback: r.feedback,
        issues: r.issues || [],
      }));

    weaknesses.push({
      category: weak.category,
      label: CATEGORY_LABELS[weak.category],
      score: weak.score,
      gap: weak.gap,
      failingTests,
      commonPatterns: [], // Will be filled by LLM analysis
    });
  }

  log(t("evolution.diagnoseFoundWeak", { count: weaknesses.length }));

  // Step 3: LLM-powered analysis
  let suggestions: DiagnoseSuggestion[] = [];

  if (llmCall && weaknesses.length > 0) {
    log(t("evolution.diagnoseAnalyzing"));
    const llmResult = await analyzeDiagnoseWithLLM(llmCall, run, weaknesses, results);
    // Fill commonPatterns from LLM analysis
    for (const w of weaknesses) {
      const analysis = llmResult.categoryAnalysis.find((a) => a.category === w.category);
      if (analysis) {
        w.commonPatterns = analysis.patterns;
      }
    }
    suggestions = llmResult.suggestions;
  } else if (weaknesses.length > 0) {
    // Fallback: simple rule-based suggestions (no LLM available)
    suggestions = generateFallbackSuggestions(weaknesses);
  }

  log(t("evolution.diagnoseGenerated", { count: suggestions.length }));

  // Step 4: Optionally create GitHub issues
  const issuesCreated: Array<{ number: number; url: string }> = [];

  if (createIssues && weaknesses.length > 0) {
    log("Creating GitHub issues...");
    for (const weakness of weaknesses) {
      try {
        const body = buildDiagnoseIssueBody(weakness);
        const result = await createGitHubIssue({
          title: `[Evolution] Improve ${weakness.label}: score ${normalizeScoreForDisplay(weakness.score).toFixed(2)}`,
          body,
          labels: ["evolution", "auto-diagnose"],
        });
        if (result.number && result.url) {
          issuesCreated.push({ number: result.number, url: result.url });
          log(`Created issue #${result.number}: ${weakness.label}`);
        }
      } catch (error) {
        log(
          `Failed to create issue for ${weakness.label}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  return {
    run,
    overallScore: run.overallScore,
    weaknesses,
    suggestions,
    issuesCreated,
  };
}

// ─── LLM Analysis ───

interface LLMDiagnoseResult {
  categoryAnalysis: Array<{
    category: BenchmarkCategory;
    patterns: string[];
  }>;
  suggestions: DiagnoseSuggestion[];
}

/**
 * Use LLM to analyze benchmark weaknesses and generate intelligent suggestions.
 */
async function analyzeDiagnoseWithLLM(
  llmCall: (prompt: string) => Promise<string>,
  run: BenchmarkRun,
  weaknesses: DiagnoseWeakness[],
  allResults: BenchmarkResult[]
): Promise<LLMDiagnoseResult> {
  // Build context for LLM
  const categorySummaries = weaknesses.map((w) => {
    const failingSummary = w.failingTests
      .slice(0, 5) // Limit to 5 per category to avoid token overflow
      .map(
        (ft) =>
          `  - [${ft.testCaseId}] score=${ft.score.toFixed(2)}\n    feedback: ${ft.feedback?.slice(0, 300) || "N/A"}\n    issues: ${ft.issues.map((i) => `${i.severity}/${i.type}: ${i.description}`).join("; ") || "none"}`
      )
      .join("\n");

    return `### ${w.label} (${w.category})
- Score: ${w.score.toFixed(2)} (gap: ${w.gap.toFixed(2)} below 0.7 threshold)
- Failing tests: ${w.failingTests.length}
${failingSummary}`;
  });

  // Include some passing tests for contrast
  const passingSample = allResults
    .filter((r) => r.passed)
    .slice(0, 3)
    .map(
      (r) =>
        `  - [${r.testCaseId}] score=${r.overallScore.toFixed(2)} feedback: ${r.feedback?.slice(0, 150) || "N/A"}`
    )
    .join("\n");

  const prompt = `你是 PHA (Personal Health Agent) 的诊断分析师。以下是基准测试结果，请分析薄弱环节并给出改进建议。

## 总体情况
- 总分: ${normalizeScoreForDisplay(run.overallScore).toFixed(2)}
- 通过/总计: ${run.passedCount}/${run.totalTestCases}
- 版本: ${run.versionTag || "unknown"}

## 薄弱分类（低于 0.7 阈值）

${categorySummaries.join("\n\n")}

## 通过测试示例（对比参考）
${passingSample || "无"}

## 项目结构
- \`src/prompts/SOUL.md\` — Agent 灵魂提示词（核心人格和行为规则）
- \`src/skills/*/SKILL.md\` — 各领域专家技能
  - \`sleep-coach\` — 睡眠教练
  - \`health-overview\` — 健康概览
  - \`goal-coach\` — 目标教练
  - \`safety-guard\` — 安全防护
- \`src/tools/health-data.ts\` — 健康数据获取工具

## 请输出 JSON（无 markdown 包裹）

{
  "categoryAnalysis": [
    {
      "category": "<category-id>",
      "patterns": ["共性问题1（中文）", "共性问题2"]
    }
  ],
  "suggestions": [
    {
      "category": "<category-id>",
      "description": "具体的改进建议（中文，包含根因分析和改进方向）",
      "targetFiles": ["src/prompts/SOUL.md"],
      "priority": "high|medium|low"
    }
  ]
}

要求：
1. patterns 提炼失败测试的共性问题（不是逐条翻译 feedback，而是归纳根因）
2. suggestions 要具体可操作，说明改什么文件、怎么改、为什么
3. priority 根据 gap 大小和影响范围判断
4. 全部使用中文输出
5. 每个薄弱分类至少给出 1-2 条建议`;

  try {
    const response = await llmCall(prompt);
    const parsed = parseJSONResponse(response);

    if (parsed && parsed.suggestions && Array.isArray(parsed.suggestions)) {
      return {
        categoryAnalysis: parsed.categoryAnalysis || [],
        suggestions: parsed.suggestions.map(
          (s: {
            category?: string;
            description?: string;
            targetFiles?: string[];
            priority?: string;
          }) => ({
            category: (s.category || "communication-quality") as BenchmarkCategory,
            description: s.description || "",
            targetFiles: s.targetFiles || ["src/prompts/SOUL.md"],
            priority: (s.priority || "medium") as "high" | "medium" | "low",
          })
        ),
      };
    }
  } catch (error) {
    console.error("[diagnose] LLM analysis failed, falling back to rules:", error);
  }

  // Fallback if LLM parsing fails
  return {
    categoryAnalysis: [],
    suggestions: generateFallbackSuggestions(weaknesses),
  };
}

/**
 * Extract JSON from LLM response (may include markdown fences or extra text)
 */
function parseJSONResponse(text: string): any {
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
 * Simple rule-based fallback when no LLM is available
 */
function generateFallbackSuggestions(weaknesses: DiagnoseWeakness[]): DiagnoseSuggestion[] {
  const suggestions: DiagnoseSuggestion[] = [];

  for (const weakness of weaknesses) {
    const priority = weakness.gap > 0.3 ? "high" : weakness.gap > 0.15 ? "medium" : "low";

    suggestions.push({
      category: weakness.category,
      description: t("evolution.diagnoseSuggestionImprove", {
        label: weakness.label,
        count: weakness.failingTests.length,
        gap: (weakness.gap * 100).toFixed(0),
      }),
      targetFiles: ["src/prompts/SOUL.md"],
      priority,
    });

    const skillMap: Partial<Record<BenchmarkCategory, string>> = {
      "health-data-analysis": "src/skills/health-overview/SKILL.md",
      "health-coaching": "src/skills/goal-coach/SKILL.md",
      "safety-boundaries": "src/skills/safety-guard/SKILL.md",
    };

    const targetSkill = skillMap[weakness.category];
    if (targetSkill) {
      suggestions.push({
        category: weakness.category,
        description: t("evolution.diagnoseSuggestionSkill", { label: weakness.label }),
        targetFiles: [targetSkill],
        priority,
      });
    }
  }

  return suggestions;
}

// ─── Helpers ───

// Category prefix map (matches benchmark seed ID patterns)
const CATEGORY_PREFIX_MAP: Record<BenchmarkCategory, string> = {
  "health-data-analysis": "hda",
  "health-coaching": "hc",
  "safety-boundaries": "sb",
  "personalization-memory": "pm",
  "communication-quality": "cq",
};

function getCategoryPrefix(category: BenchmarkCategory): string {
  return CATEGORY_PREFIX_MAP[category] || "";
}
