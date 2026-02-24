/**
 * Tests for Benchmark Seed Data
 *
 * Validates the benchmark test case definitions:
 * - All test cases have required fields
 * - Category/subcategory consistency
 * - Core profile has correct distribution
 * - Filtering functions work correctly
 * - SHARP 2.0 score format (0.0-1.0)
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
  test("has exactly 55 test cases", () => {
    expect(ALL_BENCHMARK_TESTS.length).toBe(55);
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

  test("category distribution matches spec", () => {
    const counts: Record<string, number> = {};
    for (const tc of ALL_BENCHMARK_TESTS) {
      counts[tc.category] = (counts[tc.category] || 0) + 1;
    }
    expect(counts["health-data-analysis"]).toBe(15);
    expect(counts["health-coaching"]).toBe(12);
    expect(counts["safety-boundaries"]).toBe(13);
    expect(counts["personalization-memory"]).toBe(8);
    expect(counts["communication-quality"]).toBe(7);
  });
});

describe("SHARP 2.0 Score Format", () => {
  test("all minScore values are in 0.0-1.0 range", () => {
    for (const tc of ALL_BENCHMARK_TESTS) {
      if (tc.expected.minScore !== undefined) {
        expect(tc.expected.minScore).toBeGreaterThanOrEqual(0.0);
        expect(tc.expected.minScore).toBeLessThanOrEqual(1.0);
      }
    }
  });

  test("all test cases have minScore defined", () => {
    for (const tc of ALL_BENCHMARK_TESTS) {
      expect(tc.expected.minScore).toBeDefined();
    }
  });

  test("shouldMention uses semantic descriptions (not bare keywords)", () => {
    for (const tc of ALL_BENCHMARK_TESTS) {
      if (tc.expected.shouldMention) {
        for (const mention of tc.expected.shouldMention) {
          // Semantic descriptions should be at least 5 chars (Chinese chars carry more meaning per char)
          expect(mention.length).toBeGreaterThanOrEqual(5);
        }
      }
    }
  });
});

describe("getCoreBenchmarkTests", () => {
  test("returns only core difficulty tests", () => {
    const core = getCoreBenchmarkTests();
    for (const tc of core) {
      expect(tc.difficulty).toBe("core");
    }
  });

  test("returns at least 10 core tests", () => {
    const core = getCoreBenchmarkTests();
    expect(core.length).toBeGreaterThanOrEqual(10);
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

  test("all categories use equal dimension weights (SHARP 2.0)", () => {
    for (const config of CATEGORY_WEIGHTS) {
      const w = config.dimensionWeights;
      // SHARP 2.0: all dimension weights are equal (0.2 each)
      expect(w.safety).toBe(0.2);
      expect(w.accuracy).toBe(0.2);
      expect(w.relevance).toBe(0.2);
      expect(w.helpfulness).toBe(0.2);
      expect(w.completeness).toBe(0.2);
    }
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
  test("emergency protocol tests have high minScore (≥0.85)", () => {
    const emergencyTests = ALL_BENCHMARK_TESTS.filter(
      (t) => t.category === "safety-boundaries" && t.subcategory === "emergency-protocol"
    );
    for (const tc of emergencyTests) {
      if (tc.expected.minScore) {
        expect(tc.expected.minScore).toBeGreaterThanOrEqual(0.85);
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
            m.includes("120") ||
            m.includes("emergency") ||
            m.includes("crisis") ||
            m.includes("988") ||
            m.includes("急救") ||
            m.includes("热线")
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

  test("personalization-memory tests all include sessionMessages", () => {
    const pmTests = ALL_BENCHMARK_TESTS.filter((t) => t.category === "personalization-memory");
    for (const tc of pmTests) {
      expect(tc.sessionMessages).toBeDefined();
      expect(Array.isArray(tc.sessionMessages)).toBe(true);
      expect(tc.sessionMessages!.length).toBeGreaterThan(0);
    }
  });

  test("all test cases have userUuid", () => {
    for (const tc of ALL_BENCHMARK_TESTS) {
      expect(tc.userUuid).toBeTruthy();
      expect(typeof tc.userUuid).toBe("string");
    }
  });

  test("all userUuid values reference valid fixture IDs", () => {
    const validFixtures = ["active-user", "sedentary-user", "health-concern-user", "new-user"];
    for (const tc of ALL_BENCHMARK_TESTS) {
      expect(validFixtures).toContain(tc.userUuid);
    }
  });
});
