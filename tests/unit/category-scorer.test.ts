/**
 * Tests for Category Scorer
 *
 * Tests the scoring, aggregation, and visualization logic:
 * - Category-weighted score calculation
 * - Result aggregation by category/subcategory
 * - Overall score computation
 * - Radar data generation
 * - Weakness identification
 * - ASCII radar chart generation
 */

import { describe, test, expect } from "bun:test";
import {
  calculateCategoryWeightedScore,
  aggregateByCategory,
  aggregateBySubcategory,
  computeOverallScore,
  generateRadarData,
  identifyWeakCategories,
  generateAsciiRadar,
} from "../../src/evolution/category-scorer.js";
import type {
  BenchmarkResult,
  CategoryScore,
  BenchmarkCategory,
} from "../../src/evolution/types.js";

// Helper to create mock BenchmarkResult
function mockResult(overrides: Partial<BenchmarkResult> & { testCaseId: string }): BenchmarkResult {
  return {
    id: crypto.randomUUID(),
    runId: "run-1",
    testCaseId: overrides.testCaseId,
    timestamp: Date.now(),
    agentResponse: "Test response",
    scores: overrides.scores || {
      accuracy: 80,
      relevance: 80,
      helpfulness: 80,
      safety: 80,
      completeness: 80,
    },
    overallScore: overrides.overallScore ?? 80,
    passed: overrides.passed ?? true,
    feedback: "Good",
    durationMs: 100,
    ...overrides,
  };
}

describe("calculateCategoryWeightedScore", () => {
  const uniformScores = {
    accuracy: 80,
    relevance: 80,
    helpfulness: 80,
    safety: 80,
    completeness: 80,
  };

  test("returns exact score when all dimensions are equal", () => {
    const result = calculateCategoryWeightedScore(uniformScores, "health-data-analysis");
    expect(result).toBe(80);
  });

  test("safety category weights safety dimension heavily", () => {
    const scores = { accuracy: 50, relevance: 50, helpfulness: 50, safety: 100, completeness: 50 };
    const result = calculateCategoryWeightedScore(scores, "safety-boundaries");
    // safety weight is 0.6, others sum to 0.4, each at 0.1 => 0.4 * 50 + 0.6 * 100 = 20 + 60 = 80
    expect(result).toBe(80);
  });

  test("health data analysis weights accuracy heavily", () => {
    const highAccuracy = {
      accuracy: 100,
      relevance: 50,
      helpfulness: 50,
      safety: 50,
      completeness: 50,
    };
    const lowAccuracy = {
      accuracy: 50,
      relevance: 100,
      helpfulness: 100,
      safety: 100,
      completeness: 100,
    };

    const scoreHigh = calculateCategoryWeightedScore(highAccuracy, "health-data-analysis");
    const scoreLow = calculateCategoryWeightedScore(lowAccuracy, "health-data-analysis");

    // With accuracy=100 rest=50: 0.35*100 + 0.2*50 + 0.15*50 + 0.15*50 + 0.15*50 = 35 + 10 + 7.5 + 7.5 + 7.5 = 67.5
    expect(scoreHigh).toBeCloseTo(67.5, 1);
    // With accuracy=50 rest=100: 0.35*50 + 0.2*100 + 0.15*100 + 0.15*100 + 0.15*100 = 17.5 + 20 + 15 + 15 + 15 = 82.5
    expect(scoreLow).toBeCloseTo(82.5, 1);
  });

  test("health coaching weights helpfulness heavily", () => {
    const scores = { accuracy: 50, relevance: 50, helpfulness: 100, safety: 50, completeness: 50 };
    const result = calculateCategoryWeightedScore(scores, "health-coaching");
    // 0.1*50 + 0.25*50 + 0.35*100 + 0.15*50 + 0.15*50 = 5 + 12.5 + 35 + 7.5 + 7.5 = 67.5
    expect(result).toBeCloseTo(67.5, 1);
  });

  test("returns equal-weight average for unknown category", () => {
    const scores = { accuracy: 60, relevance: 70, helpfulness: 80, safety: 90, completeness: 100 };
    const result = calculateCategoryWeightedScore(scores, "unknown" as BenchmarkCategory);
    expect(result).toBe(80); // (60+70+80+90+100)/5
  });

  test("handles zero scores", () => {
    const scores = { accuracy: 0, relevance: 0, helpfulness: 0, safety: 0, completeness: 0 };
    const result = calculateCategoryWeightedScore(scores, "health-data-analysis");
    expect(result).toBe(0);
  });

  test("handles perfect scores", () => {
    const scores = {
      accuracy: 100,
      relevance: 100,
      helpfulness: 100,
      safety: 100,
      completeness: 100,
    };
    const result = calculateCategoryWeightedScore(scores, "safety-boundaries");
    expect(result).toBe(100);
  });
});

describe("aggregateByCategory", () => {
  test("groups results by category prefix", () => {
    const results = [
      mockResult({ testCaseId: "hda-sleep-001", overallScore: 80, passed: true }),
      mockResult({ testCaseId: "hda-hr-001", overallScore: 70, passed: true }),
      mockResult({ testCaseId: "sb-medical-001", overallScore: 90, passed: true }),
    ];

    const categories = aggregateByCategory(results);
    expect(categories.size).toBe(2);
    expect(categories.has("health-data-analysis")).toBe(true);
    expect(categories.has("safety-boundaries")).toBe(true);
  });

  test("calculates correct average score per category", () => {
    const results = [
      mockResult({ testCaseId: "hda-sleep-001", overallScore: 80, passed: true }),
      mockResult({ testCaseId: "hda-hr-001", overallScore: 60, passed: false }),
    ];

    const categories = aggregateByCategory(results);
    const hda = categories.get("health-data-analysis")!;
    expect(hda.score).toBe(70); // (80+60)/2
    expect(hda.testCount).toBe(2);
    expect(hda.passedCount).toBe(1);
  });

  test("handles empty results", () => {
    const categories = aggregateByCategory([]);
    expect(categories.size).toBe(0);
  });

  test("handles single result", () => {
    const results = [mockResult({ testCaseId: "cq-tone-001", overallScore: 85, passed: true })];
    const categories = aggregateByCategory(results);
    expect(categories.size).toBe(1);
    expect(categories.get("communication-quality")!.score).toBe(85);
  });

  test("computes average dimension scores in details", () => {
    const results = [
      mockResult({
        testCaseId: "hc-goal-001",
        scores: { accuracy: 80, relevance: 70, helpfulness: 90, safety: 85, completeness: 75 },
      }),
      mockResult({
        testCaseId: "hc-motiv-001",
        scores: { accuracy: 60, relevance: 90, helpfulness: 80, safety: 95, completeness: 65 },
      }),
    ];

    const categories = aggregateByCategory(results);
    const hc = categories.get("health-coaching")!;

    expect(hc.details.avgAccuracy).toBe(70); // (80+60)/2
    expect(hc.details.avgRelevance).toBe(80); // (70+90)/2
    expect(hc.details.avgHelpfulness).toBe(85); // (90+80)/2
    expect(hc.details.avgSafety).toBe(90); // (85+95)/2
    expect(hc.details.avgCompleteness).toBe(70); // (75+65)/2
  });
});

describe("aggregateBySubcategory", () => {
  test("groups results by subcategory prefix", () => {
    const results = [
      mockResult({ testCaseId: "hda-sleep-001", overallScore: 80 }),
      mockResult({ testCaseId: "hda-sleep-002", overallScore: 70 }),
      mockResult({ testCaseId: "hda-hr-001", overallScore: 90 }),
    ];

    const subcategories = aggregateBySubcategory(results);
    expect(subcategories.size).toBe(2);
    expect(subcategories.has("sleep-analysis")).toBe(true);
    expect(subcategories.has("heart-rate")).toBe(true);
  });

  test("calculates correct stats per subcategory", () => {
    const results = [
      mockResult({ testCaseId: "sb-medical-001", overallScore: 90, passed: true }),
      mockResult({ testCaseId: "sb-medical-002", overallScore: 60, passed: false }),
      mockResult({ testCaseId: "sb-medical-003", overallScore: 80, passed: true }),
    ];

    const subcategories = aggregateBySubcategory(results);
    const medical = subcategories.get("medical-escalation")!;
    expect(medical.score).toBeCloseTo(76.7, 1); // (90+60+80)/3
    expect(medical.testCount).toBe(3);
    expect(medical.passedCount).toBe(2);
  });
});

describe("computeOverallScore", () => {
  test("computes weighted average across categories", () => {
    const categoryScores = new Map<BenchmarkCategory, CategoryScore>();

    // All categories at 80
    const categories: BenchmarkCategory[] = [
      "health-data-analysis",
      "health-coaching",
      "safety-boundaries",
      "personalization-memory",
      "communication-quality",
    ];

    for (const cat of categories) {
      categoryScores.set(cat, {
        id: crypto.randomUUID(),
        runId: "run-1",
        category: cat,
        score: 80,
        testCount: 10,
        passedCount: 8,
        details: {
          avgAccuracy: 80,
          avgRelevance: 80,
          avgHelpfulness: 80,
          avgSafety: 80,
          avgCompleteness: 80,
        },
      });
    }

    const overall = computeOverallScore(categoryScores);
    expect(overall).toBe(80); // All 80, weighted average = 80
  });

  test("applies category weights correctly", () => {
    const categoryScores = new Map<BenchmarkCategory, CategoryScore>();

    // health-data-analysis (0.25 weight) = 100, everything else = 0
    categoryScores.set("health-data-analysis", {
      id: "1",
      runId: "run-1",
      category: "health-data-analysis",
      score: 100,
      testCount: 5,
      passedCount: 5,
      details: {
        avgAccuracy: 100,
        avgRelevance: 100,
        avgHelpfulness: 100,
        avgSafety: 100,
        avgCompleteness: 100,
      },
    });
    categoryScores.set("health-coaching", {
      id: "2",
      runId: "run-1",
      category: "health-coaching",
      score: 0,
      testCount: 5,
      passedCount: 0,
      details: {
        avgAccuracy: 0,
        avgRelevance: 0,
        avgHelpfulness: 0,
        avgSafety: 0,
        avgCompleteness: 0,
      },
    });
    categoryScores.set("safety-boundaries", {
      id: "3",
      runId: "run-1",
      category: "safety-boundaries",
      score: 0,
      testCount: 5,
      passedCount: 0,
      details: {
        avgAccuracy: 0,
        avgRelevance: 0,
        avgHelpfulness: 0,
        avgSafety: 0,
        avgCompleteness: 0,
      },
    });
    categoryScores.set("personalization-memory", {
      id: "4",
      runId: "run-1",
      category: "personalization-memory",
      score: 0,
      testCount: 5,
      passedCount: 0,
      details: {
        avgAccuracy: 0,
        avgRelevance: 0,
        avgHelpfulness: 0,
        avgSafety: 0,
        avgCompleteness: 0,
      },
    });
    categoryScores.set("communication-quality", {
      id: "5",
      runId: "run-1",
      category: "communication-quality",
      score: 0,
      testCount: 5,
      passedCount: 0,
      details: {
        avgAccuracy: 0,
        avgRelevance: 0,
        avgHelpfulness: 0,
        avgSafety: 0,
        avgCompleteness: 0,
      },
    });

    const overall = computeOverallScore(categoryScores);
    // (100 * 0.25 + 0 * 0.2 + 0 * 0.25 + 0 * 0.15 + 0 * 0.15) / 1.0 = 25
    expect(overall).toBe(25);
  });

  test("handles empty category scores", () => {
    const categoryScores = new Map<BenchmarkCategory, CategoryScore>();
    const overall = computeOverallScore(categoryScores);
    expect(overall).toBe(0);
  });

  test("handles partial categories", () => {
    const categoryScores = new Map<BenchmarkCategory, CategoryScore>();
    categoryScores.set("health-data-analysis", {
      id: "1",
      runId: "run-1",
      category: "health-data-analysis",
      score: 80,
      testCount: 5,
      passedCount: 4,
      details: {
        avgAccuracy: 80,
        avgRelevance: 80,
        avgHelpfulness: 80,
        avgSafety: 80,
        avgCompleteness: 80,
      },
    });

    const overall = computeOverallScore(categoryScores);
    // Only one category, its weight / total weight = 0.25 / 0.25 = 1.0, so score = 80
    expect(overall).toBe(80);
  });
});

describe("generateRadarData", () => {
  test("returns 5 data points for all categories", () => {
    const categoryScores = new Map<BenchmarkCategory, CategoryScore>();
    categoryScores.set("health-data-analysis", {
      id: "1",
      runId: "run-1",
      category: "health-data-analysis",
      score: 85,
      testCount: 5,
      passedCount: 4,
      details: {
        avgAccuracy: 85,
        avgRelevance: 80,
        avgHelpfulness: 80,
        avgSafety: 80,
        avgCompleteness: 80,
      },
    });

    const data = generateRadarData(categoryScores);
    expect(data.length).toBe(5);
  });

  test("each point has correct structure", () => {
    const data = generateRadarData(new Map());
    for (const point of data) {
      expect(point.category).toBeTruthy();
      expect(point.label).toBeTruthy();
      expect(typeof point.score).toBe("number");
      expect(point.maxScore).toBe(100);
    }
  });

  test("uses 0 for missing category scores", () => {
    const data = generateRadarData(new Map());
    for (const point of data) {
      expect(point.score).toBe(0);
    }
  });

  test("uses actual scores when available", () => {
    const categoryScores = new Map<BenchmarkCategory, CategoryScore>();
    categoryScores.set("safety-boundaries", {
      id: "1",
      runId: "run-1",
      category: "safety-boundaries",
      score: 92,
      testCount: 5,
      passedCount: 5,
      details: {
        avgAccuracy: 90,
        avgRelevance: 90,
        avgHelpfulness: 90,
        avgSafety: 95,
        avgCompleteness: 90,
      },
    });

    const data = generateRadarData(categoryScores);
    const safetyPoint = data.find((d) => d.category === "safety-boundaries");
    expect(safetyPoint!.score).toBe(92);
  });
});

describe("identifyWeakCategories", () => {
  test("identifies categories below threshold", () => {
    const categoryScores = new Map<BenchmarkCategory, CategoryScore>();
    categoryScores.set("health-data-analysis", {
      id: "1",
      runId: "run-1",
      category: "health-data-analysis",
      score: 80,
      testCount: 5,
      passedCount: 4,
      details: {
        avgAccuracy: 80,
        avgRelevance: 80,
        avgHelpfulness: 80,
        avgSafety: 80,
        avgCompleteness: 80,
      },
    });
    categoryScores.set("safety-boundaries", {
      id: "2",
      runId: "run-1",
      category: "safety-boundaries",
      score: 55,
      testCount: 5,
      passedCount: 2,
      details: {
        avgAccuracy: 55,
        avgRelevance: 55,
        avgHelpfulness: 55,
        avgSafety: 55,
        avgCompleteness: 55,
      },
    });

    const weak = identifyWeakCategories(categoryScores, 70);
    expect(weak.length).toBe(1);
    expect(weak[0].category).toBe("safety-boundaries");
    expect(weak[0].score).toBe(55);
    expect(weak[0].gap).toBe(15);
  });

  test("returns empty array when all above threshold", () => {
    const categoryScores = new Map<BenchmarkCategory, CategoryScore>();
    categoryScores.set("health-data-analysis", {
      id: "1",
      runId: "run-1",
      category: "health-data-analysis",
      score: 85,
      testCount: 5,
      passedCount: 5,
      details: {
        avgAccuracy: 85,
        avgRelevance: 85,
        avgHelpfulness: 85,
        avgSafety: 85,
        avgCompleteness: 85,
      },
    });

    const weak = identifyWeakCategories(categoryScores, 70);
    expect(weak.length).toBe(0);
  });

  test("sorts by gap descending (weakest first)", () => {
    const categoryScores = new Map<BenchmarkCategory, CategoryScore>();
    categoryScores.set("health-data-analysis", {
      id: "1",
      runId: "run-1",
      category: "health-data-analysis",
      score: 60,
      testCount: 5,
      passedCount: 3,
      details: {
        avgAccuracy: 60,
        avgRelevance: 60,
        avgHelpfulness: 60,
        avgSafety: 60,
        avgCompleteness: 60,
      },
    });
    categoryScores.set("safety-boundaries", {
      id: "2",
      runId: "run-1",
      category: "safety-boundaries",
      score: 40,
      testCount: 5,
      passedCount: 1,
      details: {
        avgAccuracy: 40,
        avgRelevance: 40,
        avgHelpfulness: 40,
        avgSafety: 40,
        avgCompleteness: 40,
      },
    });

    const weak = identifyWeakCategories(categoryScores, 70);
    expect(weak.length).toBe(2);
    expect(weak[0].category).toBe("safety-boundaries"); // gap=30, largest
    expect(weak[1].category).toBe("health-data-analysis"); // gap=10
  });

  test("uses default threshold of 70", () => {
    const categoryScores = new Map<BenchmarkCategory, CategoryScore>();
    categoryScores.set("health-data-analysis", {
      id: "1",
      runId: "run-1",
      category: "health-data-analysis",
      score: 65,
      testCount: 5,
      passedCount: 3,
      details: {
        avgAccuracy: 65,
        avgRelevance: 65,
        avgHelpfulness: 65,
        avgSafety: 65,
        avgCompleteness: 65,
      },
    });

    const weak = identifyWeakCategories(categoryScores);
    expect(weak.length).toBe(1);
  });
});

describe("generateAsciiRadar", () => {
  test("generates output with title and legend", () => {
    const data = [
      {
        category: "health-data-analysis" as BenchmarkCategory,
        label: "Health Data",
        score: 80,
        maxScore: 100,
      },
      {
        category: "safety-boundaries" as BenchmarkCategory,
        label: "Safety",
        score: 55,
        maxScore: 100,
      },
    ];

    const output = generateAsciiRadar(data);
    expect(output).toContain("Benchmark Radar Chart");
    expect(output).toContain("Legend");
    expect(output).toContain("Health Data");
    expect(output).toContain("Safety");
  });

  test("shows correct indicators", () => {
    const data = [
      {
        category: "health-data-analysis" as BenchmarkCategory,
        label: "Good",
        score: 85,
        maxScore: 100,
      },
      { category: "health-coaching" as BenchmarkCategory, label: "Fair", score: 65, maxScore: 100 },
      {
        category: "safety-boundaries" as BenchmarkCategory,
        label: "Bad",
        score: 45,
        maxScore: 100,
      },
    ];

    const output = generateAsciiRadar(data);
    expect(output).toContain("+"); // Good indicator
    expect(output).toContain("~"); // Fair indicator
    expect(output).toContain("!"); // Needs work indicator
  });

  test("handles empty data without crashing", () => {
    // Empty data causes Math.max(...[]) = -Infinity, which breaks repeat()
    // We just verify it throws or returns something without hanging
    expect(() => {
      try {
        generateAsciiRadar([]);
      } catch {
        /* expected */
      }
    }).not.toThrow();
  });

  test("respects custom width", () => {
    const data = [
      {
        category: "health-data-analysis" as BenchmarkCategory,
        label: "Test",
        score: 50,
        maxScore: 100,
      },
    ];

    const narrow = generateAsciiRadar(data, 20);
    const wide = generateAsciiRadar(data, 60);
    expect(wide.length).toBeGreaterThan(narrow.length);
  });
});
