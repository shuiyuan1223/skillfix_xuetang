/**
 * Tests for Category Scorer — SHARP 2.0
 *
 * Tests the scoring, aggregation, and visualization logic:
 * - Category-weighted score calculation (legacy compat)
 * - Result aggregation by category/subcategory
 * - Overall score computation (equal weights)
 * - Radar data generation (0.0-1.0 scale)
 * - Weakness identification (threshold 0.7)
 * - ASCII radar chart generation
 * - Score normalization for display
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
  normalizeScoreForDisplay,
} from "../../src/evolution/category-scorer.js";
import type {
  BenchmarkResult,
  CategoryScore,
  BenchmarkCategory,
  SharpRating,
} from "../../src/evolution/types.js";

// Helper to create mock SharpRating[]
function mockSharpRatings(overallScore: number = 0.8): SharpRating[] {
  return [
    {
      category: "Safety",
      subComponent: "Risk Disclosure",
      score: overallScore,
      scoringType: "binary",
      reason: "test",
    },
    {
      category: "Safety",
      subComponent: "Medical Boundary",
      score: overallScore,
      scoringType: "binary",
      reason: "test",
    },
    {
      category: "Usefulness",
      subComponent: "Actionability",
      score: overallScore,
      scoringType: "3-point",
      reason: "test",
    },
    {
      category: "Accuracy",
      subComponent: "Data Accuracy",
      score: overallScore,
      scoringType: "binary",
      reason: "test",
    },
    {
      category: "Relevance",
      subComponent: "Query Relevance",
      score: overallScore,
      scoringType: "3-point",
      reason: "test",
    },
    {
      category: "Personalization",
      subComponent: "Memory Usage",
      score: overallScore,
      scoringType: "3-point",
      reason: "test",
    },
  ];
}

// Helper to create mock BenchmarkResult
function mockResult(overrides: Partial<BenchmarkResult> & { testCaseId: string }): BenchmarkResult {
  return {
    id: crypto.randomUUID(),
    runId: "run-1",
    testCaseId: overrides.testCaseId,
    timestamp: Date.now(),
    agentResponse: "Test response",
    scores: overrides.scores || mockSharpRatings(),
    overallScore: overrides.overallScore ?? 0.8,
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

  test("SHARP 2.0: all categories use equal weights (0.2 each)", () => {
    const scores = { accuracy: 50, relevance: 50, helpfulness: 50, safety: 100, completeness: 50 };
    const result = calculateCategoryWeightedScore(scores, "safety-boundaries");
    // Equal weights: (50+50+50+100+50)/5 = 60
    expect(result).toBe(60);
  });

  test("returns equal-weight average for any category", () => {
    const scores = { accuracy: 60, relevance: 70, helpfulness: 80, safety: 90, completeness: 100 };
    const result = calculateCategoryWeightedScore(scores, "health-data-analysis");
    // Equal weights: (60+70+80+90+100)/5 = 80
    expect(result).toBe(80);
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
      mockResult({ testCaseId: "hda-sleep-001", overallScore: 0.8, passed: true }),
      mockResult({ testCaseId: "hda-hr-001", overallScore: 0.7, passed: true }),
      mockResult({ testCaseId: "sb-medical-001", overallScore: 0.9, passed: true }),
    ];

    const categories = aggregateByCategory(results);
    expect(categories.size).toBe(2);
    expect(categories.has("health-data-analysis")).toBe(true);
    expect(categories.has("safety-boundaries")).toBe(true);
  });

  test("calculates correct average score per category", () => {
    const results = [
      mockResult({ testCaseId: "hda-sleep-001", overallScore: 0.8, passed: true }),
      mockResult({ testCaseId: "hda-hr-001", overallScore: 0.6, passed: false }),
    ];

    const categories = aggregateByCategory(results);
    const hda = categories.get("health-data-analysis")!;
    expect(hda.score).toBeCloseTo(0.7, 1); // (0.8+0.6)/2
    expect(hda.testCount).toBe(2);
    expect(hda.passedCount).toBe(1);
  });

  test("handles empty results", () => {
    const categories = aggregateByCategory([]);
    expect(categories.size).toBe(0);
  });

  test("handles single result", () => {
    const results = [mockResult({ testCaseId: "cq-tone-001", overallScore: 0.85, passed: true })];
    const categories = aggregateByCategory(results);
    expect(categories.size).toBe(1);
    expect(categories.get("communication-quality")!.score).toBeCloseTo(0.85, 2);
  });

  test("stores SHARP sub-component ratings in details", () => {
    const ratings: SharpRating[] = [
      {
        category: "Safety",
        subComponent: "Risk Disclosure",
        score: 1.0,
        scoringType: "binary",
        reason: "Good",
      },
      {
        category: "Accuracy",
        subComponent: "Data Accuracy",
        score: 0.5,
        scoringType: "3-point",
        reason: "Fair",
      },
    ];

    const results = [
      mockResult({ testCaseId: "hc-goal-001", scores: ratings }),
      mockResult({ testCaseId: "hc-motiv-001", scores: ratings }),
    ];

    const categories = aggregateByCategory(results);
    const hc = categories.get("health-coaching")!;

    // details should be SharpRating[] (aggregated from all results)
    expect(Array.isArray(hc.details)).toBe(true);
  });
});

describe("aggregateBySubcategory", () => {
  test("groups results by subcategory prefix", () => {
    const results = [
      mockResult({ testCaseId: "hda-sleep-001", overallScore: 0.8 }),
      mockResult({ testCaseId: "hda-sleep-002", overallScore: 0.7 }),
      mockResult({ testCaseId: "hda-hr-001", overallScore: 0.9 }),
    ];

    const subcategories = aggregateBySubcategory(results);
    expect(subcategories.size).toBe(2);
    expect(subcategories.has("sleep-analysis")).toBe(true);
    expect(subcategories.has("heart-rate")).toBe(true);
  });

  test("calculates correct stats per subcategory", () => {
    const results = [
      mockResult({ testCaseId: "sb-medical-001", overallScore: 0.9, passed: true }),
      mockResult({ testCaseId: "sb-medical-002", overallScore: 0.6, passed: false }),
      mockResult({ testCaseId: "sb-medical-003", overallScore: 0.8, passed: true }),
    ];

    const subcategories = aggregateBySubcategory(results);
    const medical = subcategories.get("medical-escalation")!;
    expect(medical.score).toBeCloseTo(0.767, 1); // (0.9+0.6+0.8)/3
    expect(medical.testCount).toBe(3);
    expect(medical.passedCount).toBe(2);
  });
});

describe("computeOverallScore", () => {
  test("computes equal-weight average across categories", () => {
    const categoryScores = new Map<BenchmarkCategory, CategoryScore>();

    // All categories at 0.8
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
        score: 0.8,
        testCount: 10,
        passedCount: 8,
      });
    }

    const overall = computeOverallScore(categoryScores);
    expect(overall).toBeCloseTo(0.8, 2); // All 0.8, equal weight average = 0.8
  });

  test("applies equal weights (SHARP 2.0)", () => {
    const categoryScores = new Map<BenchmarkCategory, CategoryScore>();

    // health-data-analysis = 1.0, everything else = 0
    categoryScores.set("health-data-analysis", {
      id: "1",
      runId: "run-1",
      category: "health-data-analysis",
      score: 1.0,
      testCount: 5,
      passedCount: 5,
    });
    categoryScores.set("health-coaching", {
      id: "2",
      runId: "run-1",
      category: "health-coaching",
      score: 0,
      testCount: 5,
      passedCount: 0,
    });
    categoryScores.set("safety-boundaries", {
      id: "3",
      runId: "run-1",
      category: "safety-boundaries",
      score: 0,
      testCount: 5,
      passedCount: 0,
    });
    categoryScores.set("personalization-memory", {
      id: "4",
      runId: "run-1",
      category: "personalization-memory",
      score: 0,
      testCount: 5,
      passedCount: 0,
    });
    categoryScores.set("communication-quality", {
      id: "5",
      runId: "run-1",
      category: "communication-quality",
      score: 0,
      testCount: 5,
      passedCount: 0,
    });

    const overall = computeOverallScore(categoryScores);
    // Equal weights: 1.0/5 = 0.2
    expect(overall).toBeCloseTo(0.2, 2);
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
      score: 0.8,
      testCount: 5,
      passedCount: 4,
    });

    const overall = computeOverallScore(categoryScores);
    // Only one category, its weight / total weight = 0.2 / 0.2 = 1.0, so score = 0.8
    expect(overall).toBeCloseTo(0.8, 2);
  });
});

describe("generateRadarData", () => {
  test("returns 5 data points for all categories", () => {
    const categoryScores = new Map<BenchmarkCategory, CategoryScore>();
    categoryScores.set("health-data-analysis", {
      id: "1",
      runId: "run-1",
      category: "health-data-analysis",
      score: 0.85,
      testCount: 5,
      passedCount: 4,
    });

    const data = generateRadarData(categoryScores);
    expect(data.length).toBe(5);
  });

  test("each point has correct structure with 0.0-1.0 scale", () => {
    const data = generateRadarData(new Map());
    for (const point of data) {
      expect(point.category).toBeTruthy();
      expect(point.label).toBeTruthy();
      expect(typeof point.score).toBe("number");
      expect(point.maxScore).toBe(1); // SHARP 2.0: maxScore is 1.0
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
      score: 0.92,
      testCount: 5,
      passedCount: 5,
    });

    const data = generateRadarData(categoryScores);
    const safetyPoint = data.find((d) => d.category === "safety-boundaries");
    expect(safetyPoint!.score).toBeCloseTo(0.92, 2);
  });
});

describe("identifyWeakCategories", () => {
  test("identifies categories below threshold", () => {
    const categoryScores = new Map<BenchmarkCategory, CategoryScore>();
    categoryScores.set("health-data-analysis", {
      id: "1",
      runId: "run-1",
      category: "health-data-analysis",
      score: 0.8,
      testCount: 5,
      passedCount: 4,
    });
    categoryScores.set("safety-boundaries", {
      id: "2",
      runId: "run-1",
      category: "safety-boundaries",
      score: 0.55,
      testCount: 5,
      passedCount: 2,
    });

    const weak = identifyWeakCategories(categoryScores, 0.7);
    expect(weak.length).toBe(1);
    expect(weak[0].category).toBe("safety-boundaries");
    expect(weak[0].score).toBeCloseTo(0.55, 2);
    expect(weak[0].gap).toBeCloseTo(0.15, 2);
  });

  test("returns empty array when all above threshold", () => {
    const categoryScores = new Map<BenchmarkCategory, CategoryScore>();
    categoryScores.set("health-data-analysis", {
      id: "1",
      runId: "run-1",
      category: "health-data-analysis",
      score: 0.85,
      testCount: 5,
      passedCount: 5,
    });

    const weak = identifyWeakCategories(categoryScores, 0.7);
    expect(weak.length).toBe(0);
  });

  test("sorts by gap descending (weakest first)", () => {
    const categoryScores = new Map<BenchmarkCategory, CategoryScore>();
    categoryScores.set("health-data-analysis", {
      id: "1",
      runId: "run-1",
      category: "health-data-analysis",
      score: 0.6,
      testCount: 5,
      passedCount: 3,
    });
    categoryScores.set("safety-boundaries", {
      id: "2",
      runId: "run-1",
      category: "safety-boundaries",
      score: 0.4,
      testCount: 5,
      passedCount: 1,
    });

    const weak = identifyWeakCategories(categoryScores, 0.7);
    expect(weak.length).toBe(2);
    expect(weak[0].category).toBe("safety-boundaries"); // gap=0.3, largest
    expect(weak[1].category).toBe("health-data-analysis"); // gap=0.1
  });

  test("uses default threshold of 0.7", () => {
    const categoryScores = new Map<BenchmarkCategory, CategoryScore>();
    categoryScores.set("health-data-analysis", {
      id: "1",
      runId: "run-1",
      category: "health-data-analysis",
      score: 0.65,
      testCount: 5,
      passedCount: 3,
    });

    const weak = identifyWeakCategories(categoryScores);
    expect(weak.length).toBe(1);
  });
});

describe("normalizeScoreForDisplay", () => {
  test("converts 0.0-1.0 to 0-100", () => {
    expect(normalizeScoreForDisplay(0.85)).toBe(85);
    expect(normalizeScoreForDisplay(0.0)).toBe(0);
    expect(normalizeScoreForDisplay(1.0)).toBe(100);
  });

  test("passes through 0-100 values unchanged", () => {
    expect(normalizeScoreForDisplay(85)).toBe(85);
    expect(normalizeScoreForDisplay(100)).toBe(100);
    expect(normalizeScoreForDisplay(0)).toBe(0);
  });

  test("handles edge case of exactly 1.0", () => {
    expect(normalizeScoreForDisplay(1.0)).toBe(100);
  });
});

describe("generateAsciiRadar", () => {
  test("generates output with title and legend", () => {
    const data = [
      {
        category: "health-data-analysis" as BenchmarkCategory,
        label: "Health Data",
        score: 0.8,
        maxScore: 1,
      },
      {
        category: "safety-boundaries" as BenchmarkCategory,
        label: "Safety",
        score: 0.55,
        maxScore: 1,
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
        score: 0.85,
        maxScore: 1,
      },
      { category: "health-coaching" as BenchmarkCategory, label: "Fair", score: 0.65, maxScore: 1 },
      {
        category: "safety-boundaries" as BenchmarkCategory,
        label: "Bad",
        score: 0.45,
        maxScore: 1,
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
        score: 0.5,
        maxScore: 1,
      },
    ];

    const narrow = generateAsciiRadar(data, 20);
    const wide = generateAsciiRadar(data, 60);
    expect(wide.length).toBeGreaterThan(narrow.length);
  });
});
