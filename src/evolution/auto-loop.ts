/**
 * Auto-Optimization Loop
 *
 * Orchestrates the self-evolving pipeline:
 * 1. Run benchmark → get radar chart
 * 2. If overall >= target: DONE
 * 3. Pick weakest categories
 * 4. Collect failing tests + feedback
 * 5. Spawn Claude Code CLI for intelligent edits
 * 6. Re-run benchmark on weak categories
 * 7. Compare: improved + no regression? KEEP : REVERT
 * 8. Repeat
 */

import type {
  AutoLoopConfig,
  BenchmarkCategory,
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
import {
  optimizeWithClaudeCode,
  readPromptFiles,
  readSkillFiles,
  type OptimizationContext,
} from "./claude-code-optimizer.js";
import { createNextVersion, removeWorktree, type VersionInfo } from "./version-manager.js";
import {
  insertEvolutionVersion,
  updateEvolutionVersion,
  getEvolutionVersionByBranch,
} from "../memory/db.js";

export interface AutoLoopCallbacks {
  onIterationStart?: (iteration: number, maxIterations: number) => void;
  onBenchmarkComplete?: (
    run: BenchmarkRun,
    categoryScores: Map<BenchmarkCategory, CategoryScore>
  ) => void;
  onWeakCategoriesFound?: (
    categories: Array<{ category: BenchmarkCategory; score: number; gap: number }>
  ) => void;
  onOptimizationStart?: (category: BenchmarkCategory) => void;
  onOptimizationComplete?: (
    category: BenchmarkCategory,
    success: boolean,
    filesChanged: string[]
  ) => void;
  onComparisonResult?: (improved: boolean, delta: number) => void;
  onRevert?: (reason: string) => void;
  onComplete?: (totalIterations: number, finalScore: number, improved: boolean) => void;
  onLog?: (message: string) => void;
}

export interface AutoLoopResult {
  iterations: number;
  initialScore: number;
  finalScore: number;
  improved: boolean;
  changes: Array<{
    iteration: number;
    category: BenchmarkCategory;
    beforeScore: number;
    afterScore: number;
    filesChanged: string[];
    kept: boolean;
  }>;
  runs: BenchmarkRun[];
}

export class AutoLoop {
  private config: AutoLoopConfig;
  private runnerConfig: BenchmarkRunnerConfig;
  private callbacks: AutoLoopCallbacks;
  private projectRoot: string;
  private versionInfo: VersionInfo | null = null;

  constructor(
    config: AutoLoopConfig,
    runnerConfig: BenchmarkRunnerConfig,
    projectRoot: string,
    callbacks: AutoLoopCallbacks = {}
  ) {
    this.config = config;
    this.runnerConfig = runnerConfig;
    this.callbacks = callbacks;
    this.projectRoot = projectRoot;
  }

  async run(): Promise<AutoLoopResult> {
    const result: AutoLoopResult = {
      iterations: 0,
      initialScore: 0,
      finalScore: 0,
      improved: false,
      changes: [],
      runs: [],
    };

    // Ensure we're on the right branch
    await this.ensureBranch();

    const runner = new BenchmarkRunner(this.runnerConfig);

    // Initial benchmark
    this.log("Running initial benchmark...");
    const initialRun = await runner.run({ profile: this.config.profile });
    result.initialScore = initialRun.run.overallScore;
    result.runs.push(initialRun.run);

    this.callbacks.onBenchmarkComplete?.(initialRun.run, initialRun.categoryScores);

    // Normalize target score: CLI provides 0-100, internal scores are 0.0-1.0
    const targetNormalized =
      this.config.targetScore <= 1.0 ? this.config.targetScore : this.config.targetScore / 100;

    // Check if already at target
    if (initialRun.run.overallScore >= targetNormalized) {
      this.log(
        `Already at target score (${normalizeScoreForDisplay(initialRun.run.overallScore).toFixed(2)} >= ${normalizeScoreForDisplay(this.config.targetScore).toFixed(2)})`
      );
      result.finalScore = initialRun.run.overallScore;
      this.callbacks.onComplete?.(0, result.finalScore, false);
      return result;
    }

    let currentScore = initialRun.run.overallScore;
    let lastResults = initialRun.results;
    let lastCategoryScores = initialRun.categoryScores;

    for (let iteration = 1; iteration <= this.config.maxIterations; iteration++) {
      result.iterations = iteration;
      this.callbacks.onIterationStart?.(iteration, this.config.maxIterations);
      this.log(`\n--- Iteration ${iteration}/${this.config.maxIterations} ---`);

      // Find weakest categories (threshold in 0.0-1.0 scale)
      const weakCategories = identifyWeakCategories(lastCategoryScores, targetNormalized);
      if (weakCategories.length === 0) {
        this.log("No weak categories found. Done!");
        break;
      }

      this.callbacks.onWeakCategoriesFound?.(weakCategories);
      this.log(
        `Weak categories: ${weakCategories.map((w) => `${CATEGORY_LABELS[w.category]} (${w.score.toFixed(1)})`).join(", ")}`
      );

      // Optimize the weakest 1-2 categories
      const categoriesToOptimize = weakCategories.slice(0, 2);

      for (const weak of categoriesToOptimize) {
        this.callbacks.onOptimizationStart?.(weak.category);
        this.log(`Optimizing: ${CATEGORY_LABELS[weak.category]}`);

        // Collect failing tests for this category
        const failingTests = lastResults
          .filter((r) => !r.passed && r.testCaseId.startsWith(getCategoryPrefix(weak.category)))
          .map((r) => ({
            testCaseId: r.testCaseId,
            query: "", // Would need test case lookup
            agentResponse: r.agentResponse,
            feedback: r.feedback,
            score: r.overallScore,
            issues: r.issues || [],
          }));

        if (failingTests.length === 0) {
          this.log(`No failing tests in ${CATEGORY_LABELS[weak.category]}, skipping`);
          continue;
        }

        // Build optimization context — use worktree if available
        const optCwd = this.versionInfo?.worktreePath || this.projectRoot;
        const promptContent = await readPromptFiles(optCwd);
        const skillContent = await readSkillFiles(optCwd, weak.category);

        const context: OptimizationContext = {
          category: weak.category,
          failingTests,
          currentPromptContent: promptContent,
          currentSkillContent: skillContent,
        };

        // Spawn Claude Code in worktree directory
        const optResult = await optimizeWithClaudeCode(context, optCwd);
        this.callbacks.onOptimizationComplete?.(
          weak.category,
          optResult.success,
          optResult.filesChanged
        );

        if (!optResult.success) {
          this.log(`Optimization failed: ${optResult.error}`);
          continue;
        }

        this.log(`Changed files: ${optResult.filesChanged.join(", ")}`);

        // Re-run benchmark
        this.log("Re-running benchmark...");
        const rerunResult = await runner.run({
          profile: this.config.profile,
          category: weak.category,
          versionTag: `auto-loop-iter-${iteration}`,
        });

        result.runs.push(rerunResult.run);
        this.callbacks.onBenchmarkComplete?.(rerunResult.run, rerunResult.categoryScores);

        // Check for improvement
        const newCatScore = rerunResult.categoryScores.get(weak.category);
        const oldCatScore = weak.score;
        const newScore = newCatScore?.score ?? 0;
        const delta = newScore - oldCatScore;

        const improved = delta > 0;
        // Normalize regression threshold: CLI provides 0-100 points, scores are 0.0-1.0
        const regressionNormalized =
          this.config.regressionThreshold <= 1.0
            ? this.config.regressionThreshold
            : this.config.regressionThreshold / 100;
        const noRegression = !this.hasRegression(
          lastCategoryScores,
          rerunResult.categoryScores,
          regressionNormalized
        );

        this.callbacks.onComparisonResult?.(improved && noRegression, delta);

        if (improved && noRegression) {
          this.log(
            `Improved! ${CATEGORY_LABELS[weak.category]}: ${oldCatScore.toFixed(1)} -> ${newScore.toFixed(1)} (+${delta.toFixed(1)})`
          );
          result.changes.push({
            iteration,
            category: weak.category,
            beforeScore: oldCatScore,
            afterScore: newScore,
            filesChanged: optResult.filesChanged,
            kept: true,
          });

          // Update state
          lastResults = rerunResult.results;
          lastCategoryScores = rerunResult.categoryScores;
        } else {
          const reason = !improved
            ? `No improvement (${delta.toFixed(1)})`
            : `Regression detected (>${this.config.regressionThreshold} pts)`;

          this.log(`Reverting: ${reason}`);
          this.callbacks.onRevert?.(reason);

          // Revert git changes
          await this.revertLastCommit();

          result.changes.push({
            iteration,
            category: weak.category,
            beforeScore: oldCatScore,
            afterScore: newScore,
            filesChanged: optResult.filesChanged,
            kept: false,
          });
        }
      }

      // Compute new overall score
      currentScore = computeOverallScore(lastCategoryScores);

      // Check if target reached
      if (currentScore >= targetNormalized) {
        this.log(
          `Target score reached! ${normalizeScoreForDisplay(currentScore).toFixed(2)} >= ${normalizeScoreForDisplay(this.config.targetScore).toFixed(2)}`
        );
        break;
      }
    }

    result.finalScore = currentScore;
    result.improved = currentScore > result.initialScore;

    // Update version record with final results
    if (this.versionInfo) {
      const version = getEvolutionVersionByBranch(this.versionInfo.branchName);
      if (version) {
        const allFilesChanged = result.changes
          .filter((ch) => ch.kept)
          .flatMap((ch) => ch.filesChanged);
        updateEvolutionVersion(version.id, {
          status: result.improved ? "active" : "abandoned",
          scoreDelta: result.finalScore - result.initialScore,
          filesChanged: allFilesChanged,
        });
      }
    }

    this.callbacks.onComplete?.(result.iterations, result.finalScore, result.improved);

    return result;
  }

  /**
   * Check if any category regressed beyond threshold
   */
  private hasRegression(
    oldScores: Map<BenchmarkCategory, CategoryScore>,
    newScores: Map<BenchmarkCategory, CategoryScore>,
    threshold: number
  ): boolean {
    for (const [category, oldScore] of oldScores) {
      const newScore = newScores.get(category);
      if (newScore && oldScore.score - newScore.score > threshold) {
        return true;
      }
    }
    return false;
  }

  /**
   * Create a worktree for the optimization branch.
   * Uses git worktree to avoid modifying the main branch.
   */
  private async ensureBranch(): Promise<void> {
    try {
      this.versionInfo = createNextVersion({
        triggerMode: "auto-evolve",
        triggerRef: `target=${this.config.targetScore}`,
      });
      this.log(
        `Created worktree: ${this.versionInfo.branchName} at ${this.versionInfo.worktreePath}`
      );
    } catch (error) {
      this.log(`Warning: Could not create worktree, falling back to direct branch: ${error}`);
      // Fallback to old behavior
      const { execSync } = await import("child_process");
      try {
        const currentBranch = execSync("git branch --show-current", {
          cwd: this.projectRoot,
          encoding: "utf-8",
          timeout: 5000,
        }).trim();

        if (currentBranch !== this.config.branch) {
          try {
            execSync(`git checkout -b ${this.config.branch}`, {
              cwd: this.projectRoot,
              encoding: "utf-8",
              timeout: 5000,
            });
          } catch {
            execSync(`git checkout ${this.config.branch}`, {
              cwd: this.projectRoot,
              encoding: "utf-8",
              timeout: 5000,
            });
          }
          this.log(`Switched to branch: ${this.config.branch}`);
        }
      } catch (innerError) {
        this.log(`Warning: Could not manage git branch: ${innerError}`);
      }
    }
  }

  /**
   * Revert the last git commit (in worktree or project root)
   */
  private async revertLastCommit(): Promise<void> {
    const { execSync } = await import("child_process");
    const cwd = this.versionInfo?.worktreePath || this.projectRoot;

    try {
      execSync("git revert --no-edit HEAD", {
        cwd,
        encoding: "utf-8",
        timeout: 10000,
      });
    } catch (error) {
      this.log(`Warning: Failed to revert: ${error}`);
      try {
        execSync("git reset --soft HEAD~1", {
          cwd,
          encoding: "utf-8",
          timeout: 5000,
        });
        execSync("git checkout -- .", {
          cwd,
          encoding: "utf-8",
          timeout: 5000,
        });
      } catch {
        this.log("Warning: Could not revert changes");
      }
    }
  }

  private log(message: string): void {
    this.callbacks.onLog?.(message);
  }
}

// ============================================================================
// Helpers
// ============================================================================

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
