/**
 * Regression Checker
 *
 * Detects score regressions between benchmark runs.
 * Used in CI to block merges that reduce agent quality.
 */

import type { BenchmarkCategory } from "./types.js";
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

function resolveRunPair(
  runs: BenchmarkRunRow[],
  baseRunId?: string
): { currentRunRow: BenchmarkRunRow; baseRunRow: BenchmarkRunRow } | RegressionReport {
  if (runs.length < 2 && !baseRunId) {
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

  if (baseRunId) {
    const found = runs.find((r) => r.id === baseRunId || r.id.startsWith(baseRunId));
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
        summary: `Base run not found: ${baseRunId}`,
      };
    }
    return { currentRunRow, baseRunRow: found };
  }

  return { currentRunRow, baseRunRow: runs[1] };
}

function findCategoryRegressions(
  baseId: string,
  currentId: string,
  threshold: number
): RegressionReport["categoryRegressions"] {
  const baseScores = listCategoryScores(baseId);
  const currentScores = listCategoryScores(currentId);

  const baseScoreMap = new Map<string, CategoryScoreRow>();
  const currentScoreMap = new Map<string, CategoryScoreRow>();
  for (const s of baseScores) baseScoreMap.set(s.category, s);
  for (const s of currentScores) currentScoreMap.set(s.category, s);

  const regressions: RegressionReport["categoryRegressions"] = [];
  const allCategories = new Set([...baseScoreMap.keys(), ...currentScoreMap.keys()]);

  for (const cat of allCategories) {
    const base = baseScoreMap.get(cat)?.score ?? 0;
    const current = currentScoreMap.get(cat)?.score ?? 0;
    const delta = current - base;
    if (delta < -threshold) {
      regressions.push({
        category: cat as BenchmarkCategory,
        label: CATEGORY_LABELS[cat as BenchmarkCategory] || cat,
        baseScore: base,
        currentScore: current,
        delta,
      });
    }
  }
  return regressions;
}

function findNewFailures(baseId: string, currentId: string): RegressionReport["newFailures"] {
  const baseResults = listBenchmarkResults({ runId: baseId });
  const currentResults = listBenchmarkResults({ runId: currentId });

  const baseResultMap = new Map<string, { passed: boolean; score: number }>();
  for (const r of baseResults) {
    baseResultMap.set(r.test_case_id, { passed: r.passed === 1, score: r.overall_score });
  }

  const failures: RegressionReport["newFailures"] = [];
  for (const r of currentResults) {
    const base = baseResultMap.get(r.test_case_id);
    const currentPassed = r.passed === 1;
    if (base && base.passed && !currentPassed) {
      failures.push({
        testCaseId: r.test_case_id,
        baseScore: base.score,
        currentScore: r.overall_score,
      });
    }
  }
  return failures;
}

function buildRegressionSummary(
  hasRegression: boolean,
  baseScore: number,
  currentScore: number,
  overallDelta: number,
  threshold: number,
  categoryRegressions: RegressionReport["categoryRegressions"],
  newFailures: RegressionReport["newFailures"]
): string {
  const dsBase = normalizeScoreForDisplay(baseScore);
  const dsCurrent = normalizeScoreForDisplay(currentScore);
  const displayDelta = dsCurrent - dsBase;

  if (!hasRegression) {
    return `No regression detected. Overall: ${dsBase.toFixed(2)} -> ${dsCurrent.toFixed(2)} (${displayDelta >= 0 ? "+" : ""}${displayDelta.toFixed(2)})`;
  }

  const parts: string[] = [];
  if (overallDelta < -threshold) {
    parts.push(`Overall score dropped by ${Math.abs(displayDelta).toFixed(2)}`);
  }
  if (categoryRegressions.length > 0) {
    parts.push(
      `${categoryRegressions.length} category regression(s): ${categoryRegressions.map((r) => `${r.label} (${normalizeScoreForDisplay(r.delta).toFixed(2)})`).join(", ")}`
    );
  }
  if (newFailures.length > 0) {
    parts.push(`${newFailures.length} test(s) newly failing`);
  }
  return `REGRESSION DETECTED: ${parts.join("; ")}`;
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
  const threshold = rawThreshold <= 1.0 ? rawThreshold : rawThreshold / 100;

  const runs = listBenchmarkRuns({ limit: 10 });
  const pair = resolveRunPair(runs, options.baseRunId);
  if ("hasRegression" in pair) return pair;

  const { currentRunRow, baseRunRow } = pair;
  const categoryRegressions = findCategoryRegressions(baseRunRow.id, currentRunRow.id, threshold);
  const newFailures = findNewFailures(baseRunRow.id, currentRunRow.id);
  const overallDelta = currentRunRow.overall_score - baseRunRow.overall_score;
  const hasRegression = categoryRegressions.length > 0 || overallDelta < -threshold;

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
    summary: buildRegressionSummary(
      hasRegression,
      baseRunRow.overall_score,
      currentRunRow.overall_score,
      overallDelta,
      threshold,
      categoryRegressions,
      newFailures
    ),
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
    lines.push(
      `| Overall | ${dsBase.toFixed(2)} | ${dsCurrent.toFixed(2)} | ${dd >= 0 ? "+" : ""}${dd.toFixed(2)} |`
    );
  }

  if (report.categoryRegressions.length > 0) {
    lines.push("");
    lines.push("### Category Regressions");
    lines.push("");
    lines.push(`| Category | Base | Current | Delta |`);
    lines.push(`|----------|------|---------|-------|`);
    for (const reg of report.categoryRegressions) {
      const b = normalizeScoreForDisplay(reg.baseScore);
      const cv = normalizeScoreForDisplay(reg.currentScore);
      lines.push(`| ${reg.label} | ${b.toFixed(2)} | ${cv.toFixed(2)} | ${(cv - b).toFixed(2)} |`);
    }
  }

  if (report.newFailures.length > 0) {
    lines.push("");
    lines.push("### Newly Failing Tests");
    lines.push("");
    for (const fail of report.newFailures) {
      lines.push(
        `- \`${fail.testCaseId}\`: ${normalizeScoreForDisplay(fail.baseScore).toFixed(2)} -> ${normalizeScoreForDisplay(fail.currentScore).toFixed(2)}`
      );
    }
  }

  return lines.join("\n");
}
