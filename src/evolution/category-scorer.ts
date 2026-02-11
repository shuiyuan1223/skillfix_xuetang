/**
 * Category Scorer — SHARP 2.0
 *
 * Aggregates benchmark results (with SharpRating[] scores) into per-category scores.
 * SHARP categories: Safety, Usefulness, Accuracy, Relevance, Personalization.
 * Test-case categories: health-data-analysis, health-coaching, etc. (scene grouping).
 *
 * Both coexist: test cases are grouped by scene category, each result carries
 * 16 SHARP ratings that are aggregated for the SHARP breakdown.
 */

import type {
  BenchmarkCategory,
  CategoryScore,
  CategoryWeightConfig,
  BenchmarkResult,
  RadarDataPoint,
  SharpRating,
} from "./types.js";
import { loadCategoryWeights, loadCategoryLabels } from "./benchmark-seed.js";

/**
 * Normalize score for display: always return 0.00-1.00 (SHARP 2.0 standard).
 * Handles legacy 0-100 data by dividing back to 0.0-1.0.
 */
export function normalizeScoreForDisplay(score: number): number {
  const s = score > 1.0 ? score / 100 : score;
  return Math.round(s * 100) / 100; // 2 decimal places
}

// ============================================================================
// SHARP 2.0 Aggregation
// ============================================================================

/** SHARP category names */
const SHARP_CATEGORIES = ["safety", "usefulness", "accuracy", "relevance", "personalization"];

/** SHARP category display labels */
const SHARP_LABELS: Record<string, string> = {
  safety: "Safety",
  usefulness: "Usefulness",
  accuracy: "Accuracy",
  relevance: "Relevance",
  personalization: "Personalization",
};

/**
 * Compute SHARP category scores from a flat list of ratings.
 * Returns { category → averageScore } for the 5 SHARP categories.
 */
export function computeSharpCategoryScores(
  ratings: SharpRating[]
): Map<string, { score: number; subScores: SharpRating[] }> {
  const grouped = new Map<string, SharpRating[]>();

  for (const r of ratings) {
    const cat = r.category.toLowerCase();
    const list = grouped.get(cat) || [];
    list.push(r);
    grouped.set(cat, list);
  }

  const result = new Map<string, { score: number; subScores: SharpRating[] }>();

  for (const cat of SHARP_CATEGORIES) {
    const catRatings = grouped.get(cat) || [];
    if (catRatings.length === 0) {
      result.set(cat, { score: 0, subScores: [] });
    } else {
      const avg = catRatings.reduce((sum, r) => sum + r.score, 0) / catRatings.length;
      result.set(cat, {
        score: Math.round(avg * 1000) / 1000,
        subScores: catRatings,
      });
    }
  }

  return result;
}

/**
 * Compute SHARP overall score (0.0-1.0): equal-weight average of 5 SHARP categories.
 */
export function computeSharpOverall(
  catScores: Map<string, { score: number; subScores: SharpRating[] }>
): number {
  let sum = 0;
  let count = 0;
  for (const cat of SHARP_CATEGORIES) {
    const entry = catScores.get(cat);
    if (entry) {
      sum += entry.score;
      count++;
    }
  }
  return count > 0 ? Math.round((sum / count) * 1000) / 1000 : 0;
}

/**
 * Aggregate SHARP ratings across multiple benchmark results.
 * Groups by category + sub-component, takes average score per sub-component.
 */
export function aggregateSharpResults(
  results: BenchmarkResult[]
): Map<string, { score: number; subScores: SharpRating[] }> {
  // Collect all ratings from all results
  const allRatings: SharpRating[] = [];
  for (const r of results) {
    if (Array.isArray(r.scores)) {
      allRatings.push(...r.scores);
    }
  }

  // Group by category + sub-component, compute average
  const subMap = new Map<string, { scores: number[]; rating: SharpRating }>();
  for (const r of allRatings) {
    const key = `${r.category.toLowerCase()}::${r.subComponent}`;
    const entry = subMap.get(key);
    if (entry) {
      entry.scores.push(r.score);
    } else {
      subMap.set(key, { scores: [r.score], rating: r });
    }
  }

  // Build averaged ratings
  const averagedRatings: SharpRating[] = [];
  for (const entry of subMap.values()) {
    const avg = entry.scores.reduce((a, b) => a + b, 0) / entry.scores.length;
    averagedRatings.push({
      ...entry.rating,
      score: Math.round(avg * 1000) / 1000,
      reason: `Average of ${entry.scores.length} evaluations`,
    });
  }

  return computeSharpCategoryScores(averagedRatings);
}

// ============================================================================
// Test-Case Category Aggregation (scene grouping)
// ============================================================================

/**
 * Group results by test-case category and compute aggregate scores.
 * Score is now SHARP-based: average of per-result overallScore (0.0-1.0).
 */
export function aggregateByCategory(
  results: BenchmarkResult[]
): Map<BenchmarkCategory, CategoryScore> {
  const grouped = new Map<BenchmarkCategory, BenchmarkResult[]>();

  for (const result of results) {
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

    // Aggregate SHARP sub-component details across all results in this category
    const sharpDetails = aggregateSharpResults(categoryResults);
    const detailRatings: SharpRating[] = [];
    for (const entry of sharpDetails.values()) {
      detailRatings.push(...entry.subScores);
    }

    scores.set(category, {
      id: crypto.randomUUID(),
      runId: categoryResults[0]?.runId || "",
      category,
      score: Math.round(avgScore * 1000) / 1000,
      testCount: categoryResults.length,
      passedCount,
      details: detailRatings.length > 0 ? detailRatings : undefined,
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
      score: Math.round(avgScore * 1000) / 1000,
      testCount: subResults.length,
      passedCount,
    });
  }

  return scores;
}

/**
 * Compute overall benchmark score from category scores.
 * Uses equal weights for test-case categories.
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
  return Math.round((weightedSum / totalWeight) * 1000) / 1000;
}

/**
 * Generate radar chart data from SHARP category scores.
 * 5 SHARP categories, maxValue = 1.0.
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
      maxScore: 1.0,
    };
  });
}

/**
 * Generate SHARP radar data from aggregated SHARP scores.
 * 5 SHARP categories, values in 0.0-1.0 range.
 */
export function generateSharpRadarData(
  sharpScores: Map<string, { score: number; subScores: SharpRating[] }>
): Array<{ label: string; value: number; maxValue: number }> {
  return SHARP_CATEGORIES.map((cat) => {
    const entry = sharpScores.get(cat);
    return {
      label: SHARP_LABELS[cat] || cat,
      value: entry?.score ?? 0,
      maxValue: 1.0,
    };
  });
}

/**
 * Identify weakest categories (score below threshold)
 */
export function identifyWeakCategories(
  categoryScores: Map<BenchmarkCategory, CategoryScore>,
  threshold: number = 0.7
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
    const pct = point.maxScore > 0 ? point.score / point.maxScore : 0;
    const barLen = Math.round(pct * width);
    const bar = "\u2588".repeat(barLen) + "\u2591".repeat(width - barLen);
    const label = point.label.padEnd(maxLabelLen);
    const displayScore = point.score.toFixed(2);
    const scoreStr = displayScore.padStart(6);
    const indicator = pct >= 0.8 ? " +" : pct >= 0.6 ? " ~" : " !";

    lines.push(`  ${label}  ${bar} ${scoreStr}${indicator}`);
  }

  lines.push("");
  lines.push("  Legend: + Good (>=80%)  ~ Fair (>=60%)  ! Needs Work (<60%)");
  lines.push("  " + "=".repeat(width + maxLabelLen + 10));

  return lines.join("\n");
}

// ============================================================================
// Internal Helpers
// ============================================================================

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

// Legacy compat — kept for any code that imports this
/** @deprecated Use SHARP 2.0 scoring */
export function calculateCategoryWeightedScore(
  scores: SharpRating[] | Record<string, number>,
  _category: BenchmarkCategory
): number {
  // If old-style scores object, compute simple average
  if (!Array.isArray(scores)) {
    const vals = Object.values(scores);
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  }
  // SHARP ratings: compute category-averaged overall
  const catGroups = new Map<string, number[]>();
  for (const r of scores) {
    const cat = r.category.toLowerCase();
    const list = catGroups.get(cat) || [];
    list.push(r.score);
    catGroups.set(cat, list);
  }
  const avgs: number[] = [];
  for (const vals of catGroups.values()) {
    avgs.push(vals.reduce((a, b) => a + b, 0) / vals.length);
  }
  return avgs.length > 0 ? avgs.reduce((a, b) => a + b, 0) / avgs.length : 0;
}
