/**
 * Version Tracker
 *
 * Tracks git versions of prompts and skills for benchmark comparisons.
 */

import type {
  BenchmarkRun,
  BenchmarkCategory,
  CategoryScore,
  VersionComparison,
  BenchmarkResult,
} from "./types.js";
import {
  listBenchmarkRuns,
  getBenchmarkRun,
  listCategoryScores,
  listBenchmarkResults,
  type BenchmarkRunRow,
  type CategoryScoreRow,
} from "../memory/db.js";

/**
 * Get the N most recent benchmark runs
 */
export function getRecentRuns(count: number = 5): BenchmarkRun[] {
  const rows = listBenchmarkRuns({ limit: count });
  return rows.map(rowToRun);
}

/**
 * Get a specific benchmark run by ID
 */
export function getRunById(id: string): BenchmarkRun | null {
  const row = getBenchmarkRun(id);
  return row ? rowToRun(row) : null;
}

/**
 * Compare two benchmark runs
 */
export function compareRuns(runId1: string, runId2: string): VersionComparison | null {
  const run1 = getRunById(runId1);
  const run2 = getRunById(runId2);

  if (!run1 || !run2) return null;

  const scores1 = listCategoryScores(runId1);
  const scores2 = listCategoryScores(runId2);

  const results1 = listBenchmarkResults({ runId: runId1 });
  const results2 = listBenchmarkResults({ runId: runId2 });

  // Build category score maps
  const scoreMap1 = new Map<string, CategoryScoreRow>();
  const scoreMap2 = new Map<string, CategoryScoreRow>();
  for (const s of scores1) scoreMap1.set(s.category, s);
  for (const s of scores2) scoreMap2.set(s.category, s);

  // Compute deltas
  const allCategories = new Set([...scoreMap1.keys(), ...scoreMap2.keys()]);

  const categoryDeltas: VersionComparison["categoryDeltas"] = [];
  for (const cat of allCategories) {
    const s1 = scoreMap1.get(cat)?.score ?? 0;
    const s2 = scoreMap2.get(cat)?.score ?? 0;
    categoryDeltas.push({
      category: cat as BenchmarkCategory,
      score1: s1,
      score2: s2,
      delta: s2 - s1,
      improved: s2 > s1,
    });
  }

  // Find flipped tests
  const resultMap1 = new Map<string, boolean>();
  const resultMap2 = new Map<string, boolean>();
  for (const r of results1) resultMap1.set(r.test_case_id, r.passed === 1);
  for (const r of results2) resultMap2.set(r.test_case_id, r.passed === 1);

  const flippedTests: VersionComparison["flippedTests"] = [];
  const allTestIds = new Set([...resultMap1.keys(), ...resultMap2.keys()]);
  for (const testId of allTestIds) {
    const was = resultMap1.get(testId);
    const now = resultMap2.get(testId);
    if (was !== undefined && now !== undefined && was !== now) {
      flippedTests.push({
        testCaseId: testId,
        wasPass: was,
        nowPass: now,
      });
    }
  }

  return {
    run1,
    run2,
    categoryDeltas,
    overallDelta: run2.overallScore - run1.overallScore,
    flippedTests,
  };
}

/**
 * Compare the latest N runs
 */
export function compareLatest(count: number = 2): VersionComparison | null {
  const runs = getRecentRuns(count);
  if (runs.length < 2) return null;

  // Compare oldest to newest in the set
  return compareRuns(runs[runs.length - 1].id, runs[0].id);
}

/**
 * Format comparison as CLI output
 */
export function formatComparison(comparison: VersionComparison): string {
  const lines: string[] = [];
  const { run1, run2, categoryDeltas, overallDelta, flippedTests } = comparison;

  lines.push("");
  lines.push("  Version Comparison");
  lines.push("  " + "=".repeat(60));
  lines.push("");
  lines.push(
    `  Run 1: ${run1.id.substring(0, 8)} (${new Date(run1.timestamp).toLocaleDateString()})${run1.versionTag ? ` [${run1.versionTag}]` : ""}`
  );
  lines.push(
    `  Run 2: ${run2.id.substring(0, 8)} (${new Date(run2.timestamp).toLocaleDateString()})${run2.versionTag ? ` [${run2.versionTag}]` : ""}`
  );
  lines.push("");

  // Overall
  const overallArrow = overallDelta > 0 ? "+" : overallDelta < 0 ? "" : " ";
  const overallColor = overallDelta > 0 ? "improved" : overallDelta < 0 ? "regressed" : "unchanged";
  lines.push(
    `  Overall: ${run1.overallScore} -> ${run2.overallScore} (${overallArrow}${overallDelta.toFixed(1)}) [${overallColor}]`
  );
  lines.push("");

  // Category deltas
  lines.push("  Category Deltas:");
  lines.push("  " + "-".repeat(60));

  for (const delta of categoryDeltas) {
    const arrow = delta.delta > 0 ? "+" : delta.delta < 0 ? "" : " ";
    const indicator = delta.delta > 0 ? " ^" : delta.delta < 0 ? " v" : "  ";
    lines.push(
      `  ${delta.category.padEnd(30)} ${delta.score1.toFixed(1)} -> ${delta.score2.toFixed(1)} (${arrow}${delta.delta.toFixed(1)})${indicator}`
    );
  }

  // Flipped tests
  if (flippedTests.length > 0) {
    lines.push("");
    lines.push("  Flipped Tests:");
    lines.push("  " + "-".repeat(60));

    for (const flip of flippedTests) {
      const status = flip.nowPass ? "FAIL -> PASS" : "PASS -> FAIL";
      const indicator = flip.nowPass ? " +" : " -";
      lines.push(`  ${flip.testCaseId.padEnd(30)} ${status}${indicator}`);
    }
  }

  lines.push("");
  lines.push("  " + "=".repeat(60));

  return lines.join("\n");
}

// ============================================================================
// Internal helpers
// ============================================================================

function rowToRun(row: BenchmarkRunRow): BenchmarkRun {
  return {
    id: row.id,
    timestamp: row.timestamp,
    versionTag: row.version_tag ?? undefined,
    promptVersions: row.prompt_versions ? JSON.parse(row.prompt_versions) : {},
    skillVersions: row.skill_versions ? JSON.parse(row.skill_versions) : {},
    totalTestCases: row.total_test_cases,
    passedCount: row.passed_count,
    failedCount: row.failed_count,
    overallScore: row.overall_score,
    durationMs: row.duration_ms ?? 0,
    profile: (row.profile as "quick" | "full") || "quick",
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
  };
}
