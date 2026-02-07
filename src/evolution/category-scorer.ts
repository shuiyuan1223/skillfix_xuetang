/**
 * Category Scorer
 *
 * Aggregates benchmark results into per-category scores
 * using category-specific dimension weights.
 */

import type {
  BenchmarkCategory,
  CategoryScore,
  CategoryWeightConfig,
  BenchmarkResult,
  RadarDataPoint,
} from "./types.js";
import { loadCategoryWeights, loadCategoryLabels } from "./benchmark-seed.js";

/**
 * Calculate weighted score for a single result using category-specific weights
 */
export function calculateCategoryWeightedScore(
  scores: {
    accuracy: number;
    relevance: number;
    helpfulness: number;
    safety: number;
    completeness: number;
  },
  category: BenchmarkCategory
): number {
  const config = loadCategoryWeights().find((w) => w.category === category);
  if (!config) {
    // Fallback to equal weights
    return (
      (scores.accuracy +
        scores.relevance +
        scores.helpfulness +
        scores.safety +
        scores.completeness) /
      5
    );
  }

  const weights = config.dimensionWeights;
  return (
    scores.accuracy * weights.accuracy +
    scores.relevance * weights.relevance +
    scores.helpfulness * weights.helpfulness +
    scores.safety * weights.safety +
    scores.completeness * weights.completeness
  );
}

/**
 * Group results by category and compute aggregate scores
 */
export function aggregateByCategory(
  results: BenchmarkResult[]
): Map<BenchmarkCategory, CategoryScore> {
  const grouped = new Map<BenchmarkCategory, BenchmarkResult[]>();

  for (const result of results) {
    // Extract category from testCaseId pattern (e.g., "hda-sleep-001" → need lookup)
    // We use the category from a lookup, but results should carry it from the runner
    const category = getCategoryFromTestId(result.testCaseId);
    if (!category) continue;

    const list = grouped.get(category) || [];
    list.push(result);
    grouped.set(category, list);
  }

  const scores = new Map<BenchmarkCategory, CategoryScore>();

  for (const [category, categoryResults] of grouped) {
    const totalScore = categoryResults.reduce((sum, r) => sum + r.overallScore, 0);
    const avgScore = categoryResults.length > 0 ? totalScore / categoryResults.length : 0;
    const passedCount = categoryResults.filter((r) => r.passed).length;

    scores.set(category, {
      id: crypto.randomUUID(),
      runId: categoryResults[0]?.runId || "",
      category,
      score: Math.round(avgScore * 10) / 10,
      testCount: categoryResults.length,
      passedCount,
      details: {
        avgAccuracy: avg(categoryResults.map((r) => r.scores.accuracy)),
        avgRelevance: avg(categoryResults.map((r) => r.scores.relevance)),
        avgHelpfulness: avg(categoryResults.map((r) => r.scores.helpfulness)),
        avgSafety: avg(categoryResults.map((r) => r.scores.safety)),
        avgCompleteness: avg(categoryResults.map((r) => r.scores.completeness)),
      },
    });
  }

  return scores;
}

/**
 * Aggregate results by subcategory within a category
 */
export function aggregateBySubcategory(
  results: BenchmarkResult[]
): Map<string, { score: number; testCount: number; passedCount: number }> {
  const grouped = new Map<string, BenchmarkResult[]>();

  for (const result of results) {
    const subcategory = getSubcategoryFromTestId(result.testCaseId);
    if (!subcategory) continue;

    const list = grouped.get(subcategory) || [];
    list.push(result);
    grouped.set(subcategory, list);
  }

  const scores = new Map<string, { score: number; testCount: number; passedCount: number }>();

  for (const [subcategory, subResults] of grouped) {
    const totalScore = subResults.reduce((sum, r) => sum + r.overallScore, 0);
    const avgScore = subResults.length > 0 ? totalScore / subResults.length : 0;
    const passedCount = subResults.filter((r) => r.passed).length;

    scores.set(subcategory, {
      score: Math.round(avgScore * 10) / 10,
      testCount: subResults.length,
      passedCount,
    });
  }

  return scores;
}

/**
 * Compute overall benchmark score from category scores
 */
export function computeOverallScore(categoryScores: Map<BenchmarkCategory, CategoryScore>): number {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const config of loadCategoryWeights()) {
    const catScore = categoryScores.get(config.category);
    if (catScore) {
      weightedSum += catScore.score * config.weight;
      totalWeight += config.weight;
    }
  }

  if (totalWeight === 0) return 0;
  return Math.round((weightedSum / totalWeight) * 10) / 10;
}

/**
 * Generate radar chart data from category scores
 */
export function generateRadarData(
  categoryScores: Map<BenchmarkCategory, CategoryScore>
): RadarDataPoint[] {
  const labels = loadCategoryLabels();
  return loadCategoryWeights().map((config) => {
    const catScore = categoryScores.get(config.category);
    return {
      category: config.category,
      label: labels[config.category] || config.category,
      score: catScore?.score ?? 0,
      maxScore: 100,
    };
  });
}

/**
 * Identify weakest categories (score below threshold)
 */
export function identifyWeakCategories(
  categoryScores: Map<BenchmarkCategory, CategoryScore>,
  threshold: number = 70
): Array<{ category: BenchmarkCategory; score: number; gap: number }> {
  const weak: Array<{ category: BenchmarkCategory; score: number; gap: number }> = [];

  for (const [category, catScore] of categoryScores) {
    if (catScore.score < threshold) {
      weak.push({
        category,
        score: catScore.score,
        gap: threshold - catScore.score,
      });
    }
  }

  return weak.sort((a, b) => b.gap - a.gap);
}

/**
 * Generate ASCII radar chart for CLI display
 */
export function generateAsciiRadar(data: RadarDataPoint[], width: number = 50): string {
  const lines: string[] = [];
  const maxLabelLen = Math.max(...data.map((d) => d.label.length));

  lines.push("");
  lines.push("  Benchmark Radar Chart");
  lines.push("  " + "=".repeat(width + maxLabelLen + 10));
  lines.push("");

  for (const point of data) {
    const barLen = Math.round((point.score / point.maxScore) * width);
    const bar = "\u2588".repeat(barLen) + "\u2591".repeat(width - barLen);
    const label = point.label.padEnd(maxLabelLen);
    const scoreStr = `${point.score.toFixed(1)}`.padStart(5);
    const indicator = point.score >= 80 ? " +" : point.score >= 60 ? " ~" : " !";

    lines.push(`  ${label}  ${bar} ${scoreStr}/100${indicator}`);
  }

  lines.push("");
  lines.push("  Legend: + Good (>=80)  ~ Fair (>=60)  ! Needs Work (<60)");
  lines.push("  " + "=".repeat(width + maxLabelLen + 10));

  return lines.join("\n");
}

// ============================================================================
// Internal Helpers
// ============================================================================

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

// Test ID prefix to category mapping
const TEST_ID_CATEGORY_MAP: Record<string, BenchmarkCategory> = {
  hda: "health-data-analysis",
  hc: "health-coaching",
  sb: "safety-boundaries",
  pm: "personalization-memory",
  cq: "communication-quality",
};

// Test ID prefix to subcategory mapping
const TEST_ID_SUBCATEGORY_MAP: Record<string, string> = {
  "hda-sleep": "sleep-analysis",
  "hda-hr": "heart-rate",
  "hda-activity": "activity-tracking",
  "hda-workout": "workout-analysis",
  "hc-goal": "goal-setting",
  "hc-motiv": "motivation",
  "hc-habit": "habit-formation",
  "hc-progress": "progress-tracking",
  "sb-medical": "medical-escalation",
  "sb-scope": "out-of-scope",
  "sb-emergency": "emergency-protocol",
  "sb-data": "data-integrity",
  "pm-profile": "user-profile",
  "pm-memory": "memory-recall",
  "pm-context": "context-awareness",
  "cq-tone": "tone-sensitivity",
  "cq-action": "actionability",
  "cq-data": "data-grounding",
  "cq-clarity": "clarity",
};

function getCategoryFromTestId(testId: string): BenchmarkCategory | null {
  const prefix = testId.split("-")[0];
  return TEST_ID_CATEGORY_MAP[prefix] || null;
}

function getSubcategoryFromTestId(testId: string): string | null {
  const parts = testId.split("-");
  const prefix = parts.slice(0, 2).join("-");
  return TEST_ID_SUBCATEGORY_MAP[prefix] || null;
}
