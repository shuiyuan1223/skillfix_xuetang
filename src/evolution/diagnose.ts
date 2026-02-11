/**
 * Diagnose Mode
 *
 * Pipeline: benchmark → analyze weaknesses → generate suggestions → (optional) create GitHub issues
 * Runs a benchmark, identifies weak categories and failing test patterns,
 * and produces actionable optimization suggestions.
 */

import type {
  BenchmarkCategory,
  BenchmarkProfile,
  BenchmarkResult,
  BenchmarkRun,
  CategoryScore,
} from "./types.js";
import { BenchmarkRunner, type BenchmarkRunnerConfig } from "./benchmark-runner.js";
import {
  identifyWeakCategories,
  computeOverallScore,
  normalizeScoreForDisplay,
} from "./category-scorer.js";
import { CATEGORY_LABELS } from "./benchmark-seed.js";
import { createGitHubIssue, buildDiagnoseIssueBody } from "./github-issues.js";

export interface DiagnoseWeakness {
  category: BenchmarkCategory;
  label: string;
  score: number;
  gap: number;
  failingTests: Array<{
    testCaseId: string;
    score: number;
    feedback: string;
    issues: Array<{ type: string; description: string; severity: string }>;
  }>;
  commonPatterns: string[];
}

export interface DiagnoseSuggestion {
  category: BenchmarkCategory;
  description: string;
  targetFiles: string[];
  priority: "high" | "medium" | "low";
}

export interface DiagnoseResult {
  run: BenchmarkRun;
  overallScore: number;
  weaknesses: DiagnoseWeakness[];
  suggestions: DiagnoseSuggestion[];
  issuesCreated: Array<{ number: number; url: string }>;
}

/**
 * Run diagnose pipeline: benchmark → analyze → suggest → (optional) create issues
 */
export async function diagnose(opts: {
  profile: BenchmarkProfile;
  runnerConfig: BenchmarkRunnerConfig;
  createIssues?: boolean;
  onProgress?: (msg: string) => void;
}): Promise<DiagnoseResult> {
  const { profile, runnerConfig, createIssues = false, onProgress } = opts;
  const log = onProgress || (() => {});

  // Step 1: Run benchmark
  log("Running benchmark...");
  const runner = new BenchmarkRunner(runnerConfig);
  await runner.seedTestCases();
  const { run, results, categoryScores } = await runner.run({ profile });

  log(
    `Benchmark complete: ${normalizeScoreForDisplay(run.overallScore).toFixed(2)} (${run.passedCount}/${run.totalTestCases} passed)`
  );

  // Step 2: Identify weaknesses
  const weakCategories = identifyWeakCategories(categoryScores);
  const weaknesses: DiagnoseWeakness[] = [];

  for (const weak of weakCategories) {
    const categoryPrefix = getCategoryPrefix(weak.category);
    const failingTests = results
      .filter((r) => !r.passed && r.testCaseId.startsWith(categoryPrefix))
      .map((r) => ({
        testCaseId: r.testCaseId,
        score: r.overallScore,
        feedback: r.feedback,
        issues: r.issues || [],
      }));

    // Find common patterns in feedback
    const commonPatterns = extractCommonPatterns(
      failingTests.map((t) => t.feedback).filter(Boolean)
    );

    weaknesses.push({
      category: weak.category,
      label: CATEGORY_LABELS[weak.category],
      score: weak.score,
      gap: weak.gap,
      failingTests,
      commonPatterns,
    });
  }

  log(`Found ${weaknesses.length} weak categories`);

  // Step 3: Generate suggestions
  const suggestions = generateSuggestions(weaknesses);
  log(`Generated ${suggestions.length} optimization suggestions`);

  // Step 4: Optionally create GitHub issues
  const issuesCreated: Array<{ number: number; url: string }> = [];

  if (createIssues && weaknesses.length > 0) {
    log("Creating GitHub issues...");
    for (const weakness of weaknesses) {
      try {
        const body = buildDiagnoseIssueBody(weakness);
        const result = await createGitHubIssue({
          title: `[Evolution] Improve ${weakness.label}: score ${normalizeScoreForDisplay(weakness.score).toFixed(2)}`,
          body,
          labels: ["evolution", "auto-diagnose"],
        });
        if (result.number && result.url) {
          issuesCreated.push({ number: result.number, url: result.url });
          log(`Created issue #${result.number}: ${weakness.label}`);
        }
      } catch (error) {
        log(
          `Failed to create issue for ${weakness.label}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  return {
    run,
    overallScore: run.overallScore,
    weaknesses,
    suggestions,
    issuesCreated,
  };
}

/**
 * Extract common patterns from a list of feedback strings
 */
function extractCommonPatterns(feedbacks: string[]): string[] {
  if (feedbacks.length === 0) return [];

  // Simple pattern extraction: find repeated phrases
  const phrases = new Map<string, number>();

  for (const fb of feedbacks) {
    // Split into sentences
    const sentences = fb
      .split(/[.!?]+/)
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 20);
    for (const sentence of sentences) {
      phrases.set(sentence, (phrases.get(sentence) || 0) + 1);
    }
  }

  // Return phrases that appear in more than half the feedbacks
  const threshold = Math.max(2, Math.ceil(feedbacks.length / 2));
  return Array.from(phrases.entries())
    .filter(([, count]) => count >= threshold)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([phrase]) => phrase);
}

/**
 * Generate optimization suggestions from weaknesses
 */
function generateSuggestions(weaknesses: DiagnoseWeakness[]): DiagnoseSuggestion[] {
  const suggestions: DiagnoseSuggestion[] = [];

  for (const weakness of weaknesses) {
    const priority = weakness.gap > 30 ? "high" : weakness.gap > 15 ? "medium" : "low";

    // Suggest prompt modifications
    suggestions.push({
      category: weakness.category,
      description: `Improve ${weakness.label} — ${weakness.failingTests.length} tests failing, ${weakness.gap.toFixed(0)} points below threshold`,
      targetFiles: ["src/prompts/SOUL.md"],
      priority,
    });

    // Suggest skill creation/modification for specific categories
    const skillMap: Partial<Record<BenchmarkCategory, string>> = {
      "health-data-analysis": "src/skills/health-overview/SKILL.md",
      "health-coaching": "src/skills/goal-coach/SKILL.md",
      "safety-boundaries": "src/skills/safety-guard/SKILL.md",
      "communication-quality": "src/prompts/SOUL.md",
      "personalization-memory": "src/prompts/SOUL.md",
    };

    const targetSkill = skillMap[weakness.category];
    if (targetSkill && targetSkill !== "src/prompts/SOUL.md") {
      suggestions.push({
        category: weakness.category,
        description: `Create or update skill for ${weakness.label}`,
        targetFiles: [targetSkill],
        priority,
      });
    }
  }

  return suggestions;
}

// Category prefix map (matches benchmark seed ID patterns)
const CATEGORY_PREFIX_MAP: Record<BenchmarkCategory, string> = {
  "health-data-analysis": "hda",
  "health-coaching": "hc",
  "safety-boundaries": "sb",
  "personalization-memory": "pm",
  "communication-quality": "cq",
};

function getCategoryPrefix(category: BenchmarkCategory): string {
  return CATEGORY_PREFIX_MAP[category] || "";
}
