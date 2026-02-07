/**
 * Tests for Regression Checker
 *
 * Tests the regression detection and markdown formatting:
 * - formatRegressionMarkdown output format
 * - RegressionReport structure handling
 *
 * Note: checkRegression() depends on SQLite DB state, so we test
 * the formatting function and report structure directly.
 */

import { describe, test, expect } from "bun:test";
import {
  formatRegressionMarkdown,
  type RegressionReport,
} from "../../src/evolution/regression-checker.js";
import type { BenchmarkCategory } from "../../src/evolution/types.js";

function makeReport(overrides: Partial<RegressionReport> = {}): RegressionReport {
  return {
    hasRegression: false,
    baseRun: { id: "run-base", score: 75, timestamp: Date.now() - 60000 },
    currentRun: { id: "run-current", score: 78, timestamp: Date.now() },
    overallDelta: 3,
    categoryRegressions: [],
    newFailures: [],
    summary: "No regression detected. Overall: 75 -> 78 (+3.0)",
    ...overrides,
  };
}

describe("formatRegressionMarkdown", () => {
  test("shows PASS for no regression", () => {
    const report = makeReport();
    const md = formatRegressionMarkdown(report);
    expect(md).toContain("## Benchmark Result: PASS");
    expect(md).toContain("No regression detected");
  });

  test("shows REGRESSION DETECTED for regressions", () => {
    const report = makeReport({
      hasRegression: true,
      overallDelta: -8,
      summary: "REGRESSION DETECTED: Overall score dropped by 8.0 pts",
      currentRun: { id: "run-current", score: 67, timestamp: Date.now() },
    });

    const md = formatRegressionMarkdown(report);
    expect(md).toContain("## Benchmark Result: REGRESSION DETECTED");
    expect(md).toContain("REGRESSION DETECTED");
  });

  test("includes score comparison table", () => {
    const report = makeReport();
    const md = formatRegressionMarkdown(report);
    expect(md).toContain("### Score Comparison");
    expect(md).toContain("| Overall |");
    expect(md).toContain("75");
    expect(md).toContain("78");
  });

  test("includes category regression table when present", () => {
    const report = makeReport({
      hasRegression: true,
      categoryRegressions: [
        {
          category: "safety-boundaries" as BenchmarkCategory,
          label: "Safety & Boundaries",
          baseScore: 85,
          currentScore: 72,
          delta: -13,
        },
      ],
      summary: "REGRESSION DETECTED: 1 category regression(s)",
    });

    const md = formatRegressionMarkdown(report);
    expect(md).toContain("### Category Regressions");
    expect(md).toContain("Safety & Boundaries");
    expect(md).toContain("85.0");
    expect(md).toContain("72.0");
    expect(md).toContain("-13.0");
  });

  test("includes newly failing tests when present", () => {
    const report = makeReport({
      hasRegression: true,
      newFailures: [
        { testCaseId: "sb-medical-001", baseScore: 82, currentScore: 55 },
        { testCaseId: "hda-sleep-002", baseScore: 75, currentScore: 60 },
      ],
      summary: "REGRESSION DETECTED: 2 test(s) newly failing",
    });

    const md = formatRegressionMarkdown(report);
    expect(md).toContain("### Newly Failing Tests");
    expect(md).toContain("`sb-medical-001`");
    expect(md).toContain("`hda-sleep-002`");
    expect(md).toContain("82 -> 55");
    expect(md).toContain("75 -> 60");
  });

  test("omits category table when no category regressions", () => {
    const report = makeReport();
    const md = formatRegressionMarkdown(report);
    expect(md).not.toContain("### Category Regressions");
  });

  test("omits failing tests section when no new failures", () => {
    const report = makeReport();
    const md = formatRegressionMarkdown(report);
    expect(md).not.toContain("### Newly Failing Tests");
  });

  test("handles null base run", () => {
    const report = makeReport({ baseRun: null, currentRun: null });
    const md = formatRegressionMarkdown(report);
    expect(md).toContain("PASS");
    expect(md).not.toContain("### Score Comparison");
  });

  test("shows positive delta with + sign", () => {
    const report = makeReport({ overallDelta: 5 });
    const md = formatRegressionMarkdown(report);
    expect(md).toContain("+5.0");
  });

  test("shows negative delta without extra sign", () => {
    const report = makeReport({
      hasRegression: true,
      overallDelta: -7.5,
      summary: "REGRESSION DETECTED: dropped",
    });
    const md = formatRegressionMarkdown(report);
    expect(md).toContain("-7.5");
  });

  test("handles complete regression report with all sections", () => {
    const report = makeReport({
      hasRegression: true,
      overallDelta: -10,
      categoryRegressions: [
        {
          category: "health-coaching" as BenchmarkCategory,
          label: "Health Coaching",
          baseScore: 80,
          currentScore: 65,
          delta: -15,
        },
      ],
      newFailures: [{ testCaseId: "hc-goal-001", baseScore: 78, currentScore: 50 }],
      summary: "REGRESSION DETECTED: Overall dropped, 1 category regression, 1 test newly failing",
    });

    const md = formatRegressionMarkdown(report);

    // All sections present
    expect(md).toContain("## Benchmark Result: REGRESSION DETECTED");
    expect(md).toContain("### Score Comparison");
    expect(md).toContain("### Category Regressions");
    expect(md).toContain("### Newly Failing Tests");
  });
});

describe("RegressionReport structure", () => {
  test("can represent no-data scenario", () => {
    const report: RegressionReport = {
      hasRegression: false,
      baseRun: null,
      currentRun: null,
      overallDelta: 0,
      categoryRegressions: [],
      newFailures: [],
      summary: "Not enough benchmark runs to check regression (need at least 2)",
    };

    expect(report.hasRegression).toBe(false);
    expect(report.summary).toContain("Not enough");
  });

  test("can represent improvement scenario", () => {
    const report = makeReport({
      overallDelta: 12,
      summary: "No regression detected. Overall: 68 -> 80 (+12.0)",
    });

    expect(report.hasRegression).toBe(false);
    expect(report.overallDelta).toBe(12);
  });

  test("can represent multi-category regression", () => {
    const report = makeReport({
      hasRegression: true,
      overallDelta: -15,
      categoryRegressions: [
        {
          category: "health-coaching" as BenchmarkCategory,
          label: "HC",
          baseScore: 80,
          currentScore: 60,
          delta: -20,
        },
        {
          category: "safety-boundaries" as BenchmarkCategory,
          label: "SB",
          baseScore: 90,
          currentScore: 75,
          delta: -15,
        },
        {
          category: "communication-quality" as BenchmarkCategory,
          label: "CQ",
          baseScore: 70,
          currentScore: 55,
          delta: -15,
        },
      ],
      summary: "REGRESSION DETECTED",
    });

    expect(report.categoryRegressions.length).toBe(3);
    expect(report.hasRegression).toBe(true);
  });
});
