/**
 * Tests for Benchmark Seed Data
 *
 * Validates the benchmark test case definitions:
 * - All test cases have required fields
 * - Category/subcategory consistency
 * - Core profile has correct distribution
 * - Filtering functions work correctly
 */

import { describe, test, expect } from "bun:test";
import {
  ALL_BENCHMARK_TESTS,
  getCoreBenchmarkTests,
  getBenchmarkTests,
  CATEGORY_WEIGHTS,
  CATEGORY_LABELS,
} from "../../src/evolution/benchmark-seed.js";
import type { BenchmarkCategory } from "../../src/evolution/types.js";

describe("ALL_BENCHMARK_TESTS", () => {
  test("has at least 60 test cases", () => {
    expect(ALL_BENCHMARK_TESTS.length).toBeGreaterThanOrEqual(60);
  });

  test("all test cases have required fields", () => {
    for (const tc of ALL_BENCHMARK_TESTS) {
      expect(tc.id).toBeTruthy();
      expect(tc.category).toBeTruthy();
      expect(tc.query).toBeTruthy();
      expect(tc.expected).toBeDefined();
    }
  });

  test("all test case IDs are unique", () => {
    const ids = ALL_BENCHMARK_TESTS.map((t) => t.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  test("all test cases have valid categories", () => {
    const validCategories: BenchmarkCategory[] = [
      "health-data-analysis",
      "health-coaching",
      "safety-boundaries",
      "personalization-memory",
      "communication-quality",
    ];

    for (const tc of ALL_BENCHMARK_TESTS) {
      expect(validCategories).toContain(tc.category);
    }
  });

  test("all test cases have valid difficulty levels", () => {
    const validDifficulties = ["core", "easy", "medium", "hard"];

    for (const tc of ALL_BENCHMARK_TESTS) {
      if (tc.difficulty) {
        expect(validDifficulties).toContain(tc.difficulty);
      }
    }
  });

  test("all test cases have subcategory", () => {
    for (const tc of ALL_BENCHMARK_TESTS) {
      expect(tc.subcategory).toBeTruthy();
    }
  });

  test("test ID prefix matches category", () => {
    const prefixMap: Record<string, BenchmarkCategory> = {
      hda: "health-data-analysis",
      hc: "health-coaching",
      sb: "safety-boundaries",
      pm: "personalization-memory",
      cq: "communication-quality",
    };

    for (const tc of ALL_BENCHMARK_TESTS) {
      const prefix = tc.id.split("-")[0];
      expect(prefixMap[prefix]).toBe(tc.category);
    }
  });

  test("covers all 5 categories", () => {
    const categories = new Set(ALL_BENCHMARK_TESTS.map((t) => t.category));
    expect(categories.size).toBe(5);
  });
});

describe("getCoreBenchmarkTests", () => {
  test("returns only core difficulty tests", () => {
    const core = getCoreBenchmarkTests();
    for (const tc of core) {
      expect(tc.difficulty).toBe("core");
    }
  });

  test("returns at least 15 core tests", () => {
    const core = getCoreBenchmarkTests();
    expect(core.length).toBeGreaterThanOrEqual(15);
  });

  test("core tests cover all 5 categories", () => {
    const core = getCoreBenchmarkTests();
    const categories = new Set(core.map((t) => t.category));
    expect(categories.size).toBe(5);
  });
});

describe("getBenchmarkTests", () => {
  test("full profile returns all tests", () => {
    const full = getBenchmarkTests({ profile: "full" });
    expect(full.length).toBe(ALL_BENCHMARK_TESTS.length);
  });

  test("quick profile returns only core tests", () => {
    const quick = getBenchmarkTests({ profile: "quick" });
    const core = getCoreBenchmarkTests();
    expect(quick.length).toBe(core.length);
  });

  test("filters by category", () => {
    const safety = getBenchmarkTests({ category: "safety-boundaries" });
    for (const tc of safety) {
      expect(tc.category).toBe("safety-boundaries");
    }
    expect(safety.length).toBeGreaterThan(0);
  });

  test("filters by both profile and category", () => {
    const quickSafety = getBenchmarkTests({ profile: "quick", category: "safety-boundaries" });
    for (const tc of quickSafety) {
      expect(tc.category).toBe("safety-boundaries");
      expect(tc.difficulty).toBe("core");
    }
  });

  test("returns empty for non-existent category filter", () => {
    const result = getBenchmarkTests({ category: "non-existent" as BenchmarkCategory });
    expect(result.length).toBe(0);
  });

  test("no options returns all tests", () => {
    const all = getBenchmarkTests({});
    expect(all.length).toBe(ALL_BENCHMARK_TESTS.length);
  });
});

describe("CATEGORY_WEIGHTS", () => {
  test("has 5 categories", () => {
    expect(CATEGORY_WEIGHTS.length).toBe(5);
  });

  test("weights sum to 1.0", () => {
    const totalWeight = CATEGORY_WEIGHTS.reduce((sum, c) => sum + c.weight, 0);
    expect(Math.abs(totalWeight - 1.0)).toBeLessThan(0.001);
  });

  test("each category dimension weights sum to 1.0", () => {
    for (const config of CATEGORY_WEIGHTS) {
      const w = config.dimensionWeights;
      const sum = w.accuracy + w.relevance + w.helpfulness + w.safety + w.completeness;
      expect(Math.abs(sum - 1.0)).toBeLessThan(0.001);
    }
  });

  test("safety category heavily weights safety dimension", () => {
    const safety = CATEGORY_WEIGHTS.find((w) => w.category === "safety-boundaries");
    expect(safety).toBeDefined();
    expect(safety!.dimensionWeights.safety).toBeGreaterThanOrEqual(0.5);
  });

  test("health data analysis heavily weights accuracy dimension", () => {
    const hda = CATEGORY_WEIGHTS.find((w) => w.category === "health-data-analysis");
    expect(hda).toBeDefined();
    expect(hda!.dimensionWeights.accuracy).toBeGreaterThanOrEqual(0.3);
  });
});

describe("CATEGORY_LABELS", () => {
  test("has labels for all 5 categories", () => {
    const categories: BenchmarkCategory[] = [
      "health-data-analysis",
      "health-coaching",
      "safety-boundaries",
      "personalization-memory",
      "communication-quality",
    ];

    for (const cat of categories) {
      expect(CATEGORY_LABELS[cat]).toBeTruthy();
      expect(typeof CATEGORY_LABELS[cat]).toBe("string");
    }
  });
});

describe("Test Case Expected Fields", () => {
  test("safety tests have high minScore requirements", () => {
    const safetyTests = ALL_BENCHMARK_TESTS.filter(
      (t) => t.category === "safety-boundaries" && t.subcategory === "emergency-protocol"
    );
    for (const tc of safetyTests) {
      if (tc.expected.minScore) {
        expect(tc.expected.minScore).toBeGreaterThanOrEqual(85);
      }
    }
  });

  test("emergency tests expect mentions of emergency services", () => {
    const emergencyTests = ALL_BENCHMARK_TESTS.filter(
      (t) => t.subcategory === "emergency-protocol" && t.difficulty === "core"
    );
    for (const tc of emergencyTests) {
      if (tc.expected.shouldMention) {
        const mentions = tc.expected.shouldMention.map((m) => m.toLowerCase());
        const hasEmergency = mentions.some(
          (m) =>
            m.includes("911") ||
            m.includes("emergency") ||
            m.includes("crisis") ||
            m.includes("988")
        );
        expect(hasEmergency).toBe(true);
      }
    }
  });

  test("data integrity tests expect no fabricated data", () => {
    const dataTests = ALL_BENCHMARK_TESTS.filter((t) => t.subcategory === "data-integrity");
    for (const tc of dataTests) {
      if (tc.expected.shouldNotMention) {
        expect(tc.expected.shouldNotMention.length).toBeGreaterThan(0);
      }
    }
  });
});
