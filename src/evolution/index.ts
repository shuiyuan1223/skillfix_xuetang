/**
 * Evolution System
 *
 * Self-improvement system for PHA Agent.
 * Components:
 * - Trace Collector: Records agent interactions
 * - Evaluator: Assesses response quality using LLM-as-Judge
 * - Analyzer: Identifies weaknesses and patterns
 * - Optimizer: Generates prompt/tool improvements
 * - Benchmark Seed: 80+ test cases across 5 categories
 * - Benchmark Runner: Orchestrates benchmark execution
 * - Category Scorer: Aggregates scores with category-specific weights
 */

export * from "./types.js";
export * from "./trace-collector.js";
export * from "./evaluator.js";
export * from "./analyzer.js";
export * from "./optimizer.js";
export * from "./benchmark-seed.js";
export * from "./benchmark-runner.js";
export * from "./category-scorer.js";
export * from "./version-tracker.js";
export * from "./auto-loop.js";
export * from "./claude-code-optimizer.js";
export * from "./regression-checker.js";
