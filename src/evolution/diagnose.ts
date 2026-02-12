/**
 * Diagnose Mode — SHARP 2.0
 *
 * Pipeline: load benchmark → compute SHARP category scores → identify weak dimensions
 *           → LLM root-cause analysis → actionable suggestions
 *
 * Analyses the 5 SHARP categories (Safety, Usefulness, Accuracy, Relevance, Personalization)
 * and their 16 sub-components to find the real weak dimensions.
 */

import type {
  BenchmarkCategory,
  BenchmarkProfile,
  BenchmarkResult,
  BenchmarkRun,
  CategoryScore,
  SharpRating,
} from "./types.js";
import { BenchmarkRunner, type BenchmarkRunnerConfig } from "./benchmark-runner.js";
import { computeSharpCategoryScores, normalizeScoreForDisplay } from "./category-scorer.js";
import { createGitHubIssue, buildDiagnoseIssueBody } from "./github-issues.js";
import { t } from "../locales/index.js";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { getSkillsDir } from "../tools/skill-tools.js";

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

// ─── SHARP Labels ───

const SHARP_LABELS: Record<string, string> = {
  safety: "Safety",
  usefulness: "Usefulness",
  accuracy: "Accuracy",
  relevance: "Relevance",
  personalization: "Personalization",
};

const SHARP_TARGET_FILE_MAP: Record<string, string[]> = {
  safety: ["src/prompts/SOUL.md", "src/skills/safety-guard/SKILL.md"],
  usefulness: ["src/prompts/SOUL.md"],
  accuracy: ["src/prompts/SOUL.md", "src/tools/health-data.ts"],
  relevance: ["src/prompts/SOUL.md"],
  personalization: ["src/prompts/SOUL.md"],
};

// ─── Main Pipeline ───

/**
 * Run diagnose pipeline: SHARP analysis → weakness identification → LLM analysis → suggestions
 *
 * Computes SHARP 5-category scores directly from per-test SharpRating[] arrays,
 * instead of relying on scene-based category groupings.
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

  if (existingBenchmark) {
    run = existingBenchmark.run;
    results = existingBenchmark.results;
    const score = normalizeScoreForDisplay(run.overallScore).toFixed(2);
    log(
      t("evolution.diagnoseUsingExisting", {
        score,
        passed: run.passedCount,
        total: run.totalTestCases,
      })
    );
  } else if (runnerConfig) {
    log(t("evolution.diagnosing"));
    const runner = new BenchmarkRunner(runnerConfig);
    await runner.seedTestCases();
    const benchResult = await runner.run({ profile });
    run = benchResult.run;
    results = benchResult.results;
    log(
      `${t("evolution.diagnoseComplete")}: ${normalizeScoreForDisplay(run.overallScore).toFixed(2)} (${run.passedCount}/${run.totalTestCases})`
    );
  } else {
    throw new Error("diagnose() requires either existingBenchmark or runnerConfig");
  }

  // ── Step 2: Compute SHARP category scores & identify weaknesses ──

  const THRESHOLD = 0.7;

  // Collect all SHARP ratings from all test results
  const allRatings: SharpRating[] = [];
  for (const r of results) {
    if (Array.isArray(r.scores)) {
      allRatings.push(...r.scores);
    }
  }

  // Compute per-SHARP-category scores (aggregated across all tests)
  const sharpScores = computeSharpCategoryScores(allRatings);

  // Identify weak SHARP categories
  const weaknesses: DiagnoseWeakness[] = [];

  for (const [cat, data] of sharpScores) {
    if (data.score < THRESHOLD) {
      // Find weak sub-components within this category
      const subGroups = new Map<string, number[]>();
      for (const r of data.subScores) {
        const list = subGroups.get(r.subComponent) || [];
        list.push(r.score);
        subGroups.set(r.subComponent, list);
      }

      const weakSubComponents: Array<{ name: string; score: number }> = [];
      for (const [name, scores] of subGroups) {
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
        if (avg < THRESHOLD) {
          weakSubComponents.push({ name, score: Math.round(avg * 1000) / 1000 });
        }
      }
      weakSubComponents.sort((a, b) => a.score - b.score);

      // Find test cases where this SHARP category scored poorly
      const failingTests = findFailingTestsForSharpCategory(results, cat);

      weaknesses.push({
        category: cat,
        label: SHARP_LABELS[cat] || cat,
        score: data.score,
        gap: THRESHOLD - data.score,
        weakSubComponents,
        failingTests,
        commonPatterns: [], // Filled by LLM
      });
    }
  }

  weaknesses.sort((a, b) => b.gap - a.gap);
  log(t("evolution.diagnoseFoundWeak", { count: weaknesses.length }));

  // ── Step 3: LLM-powered analysis ──

  let suggestions: DiagnoseSuggestion[] = [];

  if (llmCall && weaknesses.length > 0) {
    log(t("evolution.diagnoseAnalyzing"));
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

  log(t("evolution.diagnoseGenerated", { count: suggestions.length }));

  // ── Step 4: Optionally create GitHub issues ──

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

// ─── SHARP Test Failure Detection ───

/**
 * Find test cases that scored poorly on a specific SHARP category.
 * For each test, computes the average of its sub-component scores in that category.
 * Tests with avg < 0.7 are considered "failing" for that SHARP dimension.
 */
function findFailingTestsForSharpCategory(
  results: BenchmarkResult[],
  sharpCategory: string
): DiagnoseWeakness["failingTests"] {
  const failing: DiagnoseWeakness["failingTests"] = [];
  const catLower = sharpCategory.toLowerCase();

  for (const r of results) {
    if (!Array.isArray(r.scores)) continue;

    // Get this test's ratings for the target SHARP category
    const catRatings = r.scores.filter((s) => s.category.toLowerCase() === catLower);
    if (catRatings.length === 0) continue;

    const avg = catRatings.reduce((sum, s) => sum + s.score, 0) / catRatings.length;
    if (avg < 0.7) {
      failing.push({
        testCaseId: r.testCaseId,
        score: avg,
        feedback: r.feedback || "",
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
    const skillPath = join(getSkillsDir(), "diagnose-analyst", "SKILL.md");
    if (existsSync(skillPath)) {
      const content = readFileSync(skillPath, "utf-8");
      const match = content.match(/^---[\s\S]*?---\s*([\s\S]*)$/);
      return match ? match[1].trim() : content;
    }
  } catch {
    // noop
  }
  return "";
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
    const subCompLines = w.weakSubComponents
      .map((sc) => `  - ${sc.name}: ${sc.score.toFixed(2)}`)
      .join("\n");

    // Failing tests detail
    const failingSummary = w.failingTests
      .slice(0, 5)
      .map(
        (ft) =>
          `  - [${ft.testCaseId}] ${w.category}_avg=${ft.score.toFixed(2)}\n    feedback: ${ft.feedback?.slice(0, 300) || "N/A"}\n    issues: ${ft.issues.map((i) => `${i.severity}/${i.type}: ${i.description}`).join("; ") || "none"}`
      )
      .join("\n");

    return `### ${w.label} (${w.category})
- 综合得分: ${w.score.toFixed(3)} (距 0.7 阈值差: ${w.gap.toFixed(3)})
- 薄弱子维度:
${subCompLines || "  (无)"}
- 相关测试 (${w.failingTests.length} 个低于阈值):
${failingSummary || "  (无)"}`;
  });

  // Passing tests for contrast
  const passingSample = allResults
    .filter((r) => r.passed)
    .slice(0, 3)
    .map(
      (r) =>
        `  - [${r.testCaseId}] score=${r.overallScore.toFixed(2)} feedback: ${r.feedback?.slice(0, 150) || "N/A"}`
    )
    .join("\n");

  const prompt = `你是 PHA (Personal Health Agent) 的诊断分析师。请分析以下 SHARP 2.0 基准测试数据，找出薄弱维度的根因并给出改进建议。

${skillGuide ? `## 分析框架\n\n${skillGuide}\n\n` : ""}## SHARP 2.0 基准测试数据

### 总体情况
- 总分: ${normalizeScoreForDisplay(run.overallScore).toFixed(2)}
- 通过/总计: ${run.passedCount}/${run.totalTestCases}
- 版本: ${run.versionTag || "unknown"}

### SHARP 薄弱维度（得分低于 0.7 阈值）

${categorySummaries.join("\n\n")}

### 通过测试示例（对比参考）
${passingSample || "无"}

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
      "description": "【根因】Agent 在回答中编造不在用户健康数据中的数值。【改进】在 SOUL.md 中添加数据引用规则，要求回复必须引用具体数据来源。【预期】Data Source Adherence 从 0.3 提升至 0.7+",
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
          (s: {
            category?: string;
            description?: string;
            targetFiles?: string[];
            priority?: string;
          }) => ({
            category: s.category || "accuracy",
            description: s.description || "",
            targetFiles: s.targetFiles || ["src/prompts/SOUL.md"],
            priority: (s.priority || "medium") as "high" | "medium" | "low",
          })
        ),
      };
    }

    // LLM returned something but JSON structure doesn't match — log it
    console.error(
      "[diagnose] LLM response didn't match expected JSON structure. Response:",
      response?.slice(0, 500)
    );
  } catch (error) {
    console.error("[diagnose] LLM analysis failed, falling back to rules:", error);
  }

  return {
    categoryAnalysis: [],
    suggestions: generateFallbackSuggestions(weaknesses),
  };
}

/**
 * Extract JSON from LLM response (may include markdown fences or extra text)
 */
function parseJSONResponse(text: string): any {
  if (!text || typeof text !== "string") return null;

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
    const priority = weakness.gap > 0.3 ? "high" : weakness.gap > 0.15 ? "medium" : "low";
    const targetFiles = SHARP_TARGET_FILE_MAP[weakness.category] || ["src/prompts/SOUL.md"];

    // Main suggestion per weak SHARP category
    const subCompInfo = weakness.weakSubComponents
      .slice(0, 3)
      .map((sc) => `${sc.name}(${sc.score.toFixed(2)})`)
      .join(", ");

    suggestions.push({
      category: weakness.category,
      description:
        t("evolution.diagnoseSuggestionImprove", {
          label: weakness.label,
          count: weakness.failingTests.length,
          gap: (weakness.gap * 100).toFixed(0),
        }) + (subCompInfo ? ` — ${t("evolution.weakSubComponents")}: ${subCompInfo}` : ""),
      targetFiles,
      priority,
    });
  }

  return suggestions;
}
