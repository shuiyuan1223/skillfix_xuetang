/**
 * Regression Checker
 *
 * Detects score regressions between benchmark runs.
 * Used in CI to block merges that reduce agent quality.
 */

import type { BenchmarkCategory, BenchmarkRun, CategoryScore } from "./types.js";
import { CATEGORY_LABELS } from "./benchmark-seed.js";
import { normalizeScoreForDisplay } from "./category-scorer.js";
import {
  listBenchmarkRuns,
  listCategoryScores,
  listBenchmarkResults,
  type BenchmarkRunRow,
  type CategoryScoreRow,
} from "../memory/db.js";

export interface RegressionReport {
  hasRegression: boolean;
  baseRun: { id: string; score: number; timestamp: number } | null;
  currentRun: { id: string; score: number; timestamp: number } | null;
  overallDelta: number;
  categoryRegressions: Array<{
    category: BenchmarkCategory;
    label: string;
    baseScore: number;
    currentScore: number;
    delta: number;
  }>;
  newFailures: Array<{
    testCaseId: string;
    baseScore: number;
    currentScore: number;
  }>;
  summary: string;
}

/**
 * Check for regressions between the latest two benchmark runs
 */
export function checkRegression(
  options: {
    threshold?: number; // minimum delta to count as regression (default: 5)
    baseRunId?: string; // specific base run to compare against
  } = {}
): RegressionReport {
  const rawThreshold = options.threshold ?? 5;
  // Normalize threshold: user provides 0-100 scale, scores may be 0.0-1.0
  const threshold = rawThreshold <= 1.0 ? rawThreshold : rawThreshold / 100;

  // Get runs
  const runs = listBenchmarkRuns({ limit: 10 });

  if (runs.length < 2 && !options.baseRunId) {
    return {
      hasRegression: false,
      baseRun: null,
      currentRun:
        runs.length > 0
          ? { id: runs[0].id, score: runs[0].overall_score, timestamp: runs[0].timestamp }
          : null,
      overallDelta: 0,
      categoryRegressions: [],
      newFailures: [],
      summary: "Not enough benchmark runs to check regression (need at least 2)",
    };
  }

  const currentRunRow = runs[0];
  let baseRunRow: BenchmarkRunRow;

  if (options.baseRunId) {
    const found = runs.find(
      (r) => r.id === options.baseRunId || r.id.startsWith(options.baseRunId!)
    );
    if (!found) {
      return {
        hasRegression: false,
        baseRun: null,
        currentRun: {
          id: currentRunRow.id,
          score: currentRunRow.overall_score,
          timestamp: currentRunRow.timestamp,
        },
        overallDelta: 0,
        categoryRegressions: [],
        newFailures: [],
        summary: `Base run not found: ${options.baseRunId}`,
      };
    }
    baseRunRow = found;
  } else {
    baseRunRow = runs[1];
  }

  // Get category scores
  const baseScores = listCategoryScores(baseRunRow.id);
  const currentScores = listCategoryScores(currentRunRow.id);

  const baseScoreMap = new Map<string, CategoryScoreRow>();
  const currentScoreMap = new Map<string, CategoryScoreRow>();
  for (const s of baseScores) baseScoreMap.set(s.category, s);
  for (const s of currentScores) currentScoreMap.set(s.category, s);

  // Check category regressions
  const categoryRegressions: RegressionReport["categoryRegressions"] = [];
  const allCategories = new Set([...baseScoreMap.keys(), ...currentScoreMap.keys()]);

  for (const cat of allCategories) {
    const base = baseScoreMap.get(cat)?.score ?? 0;
    const current = currentScoreMap.get(cat)?.score ?? 0;
    const delta = current - base;

    if (delta < -threshold) {
      categoryRegressions.push({
        category: cat as BenchmarkCategory,
        label: CATEGORY_LABELS[cat as BenchmarkCategory] || cat,
        baseScore: base,
        currentScore: current,
        delta,
      });
    }
  }

  // Check for newly failing tests
  const baseResults = listBenchmarkResults({ runId: baseRunRow.id });
  const currentResults = listBenchmarkResults({ runId: currentRunRow.id });

  const baseResultMap = new Map<string, { passed: boolean; score: number }>();
  const currentResultMap = new Map<string, { passed: boolean; score: number }>();

  for (const r of baseResults) {
    baseResultMap.set(r.test_case_id, { passed: r.passed === 1, score: r.overall_score });
  }
  for (const r of currentResults) {
    currentResultMap.set(r.test_case_id, { passed: r.passed === 1, score: r.overall_score });
  }

  const newFailures: RegressionReport["newFailures"] = [];
  for (const [testId, current] of currentResultMap) {
    const base = baseResultMap.get(testId);
    if (base && base.passed && !current.passed) {
      newFailures.push({
        testCaseId: testId,
        baseScore: base.score,
        currentScore: current.score,
      });
    }
  }

  // Overall
  const overallDelta = currentRunRow.overall_score - baseRunRow.overall_score;
  const hasRegression = categoryRegressions.length > 0 || overallDelta < -threshold;

  // Build summary
  const dsBase = normalizeScoreForDisplay(baseRunRow.overall_score);
  const dsCurrent = normalizeScoreForDisplay(currentRunRow.overall_score);
  const displayDelta = dsCurrent - dsBase;

  let summary: string;
  if (!hasRegression) {
    summary = `No regression detected. Overall: ${dsBase} -> ${dsCurrent} (${displayDelta >= 0 ? "+" : ""}${displayDelta.toFixed(1)})`;
  } else {
    const parts: string[] = [];
    if (overallDelta < -threshold) {
      parts.push(`Overall score dropped by ${Math.abs(displayDelta).toFixed(1)} pts`);
    }
    if (categoryRegressions.length > 0) {
      parts.push(
        `${categoryRegressions.length} category regression(s): ${categoryRegressions.map((r) => `${r.label} (${normalizeScoreForDisplay(r.delta)})`).join(", ")}`
      );
    }
    if (newFailures.length > 0) {
      parts.push(`${newFailures.length} test(s) newly failing`);
    }
    summary = `REGRESSION DETECTED: ${parts.join("; ")}`;
  }

  return {
    hasRegression,
    baseRun: {
      id: baseRunRow.id,
      score: baseRunRow.overall_score,
      timestamp: baseRunRow.timestamp,
    },
    currentRun: {
      id: currentRunRow.id,
      score: currentRunRow.overall_score,
      timestamp: currentRunRow.timestamp,
    },
    overallDelta,
    categoryRegressions,
    newFailures,
    summary,
  };
}

/**
 * Format regression report as markdown (for GitHub PR comments)
 */
export function formatRegressionMarkdown(report: RegressionReport): string {
  const lines: string[] = [];

  if (!report.hasRegression) {
    lines.push("## Benchmark Result: PASS");
    lines.push("");
    lines.push(report.summary);
  } else {
    lines.push("## Benchmark Result: REGRESSION DETECTED");
    lines.push("");
    lines.push(report.summary);
  }

  if (report.baseRun && report.currentRun) {
    const dsBase = normalizeScoreForDisplay(report.baseRun.score);
    const dsCurrent = normalizeScoreForDisplay(report.currentRun.score);
    const dd = dsCurrent - dsBase;
    lines.push("");
    lines.push("### Score Comparison");
    lines.push("");
    lines.push(`| Metric | Base | Current | Delta |`);
    lines.push(`|--------|------|---------|-------|`);
    lines.push(`| Overall | ${dsBase} | ${dsCurrent} | ${dd >= 0 ? "+" : ""}${dd.toFixed(1)} |`);
  }

  if (report.categoryRegressions.length > 0) {
    lines.push("");
    lines.push("### Category Regressions");
    lines.push("");
    lines.push(`| Category | Base | Current | Delta |`);
    lines.push(`|----------|------|---------|-------|`);
    for (const reg of report.categoryRegressions) {
      const b = normalizeScoreForDisplay(reg.baseScore);
      const c = normalizeScoreForDisplay(reg.currentScore);
      lines.push(`| ${reg.label} | ${b} | ${c} | ${(c - b).toFixed(1)} |`);
    }
  }

  if (report.newFailures.length > 0) {
    lines.push("");
    lines.push("### Newly Failing Tests");
    lines.push("");
    for (const fail of report.newFailures) {
      lines.push(
        `- \`${fail.testCaseId}\`: ${normalizeScoreForDisplay(fail.baseScore)} -> ${normalizeScoreForDisplay(fail.currentScore)}`
      );
    }
  }

  return lines.join("\n");
}
