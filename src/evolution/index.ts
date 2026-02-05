/**
 * Evolution System
 *
 * Self-improvement system for PHA Agent.
 * Components:
 * - Trace Collector: Records agent interactions
 * - Evaluator: Assesses response quality using LLM-as-Judge
 * - Analyzer: Identifies weaknesses and patterns
 * - Optimizer: Generates prompt/tool improvements
 * - Applier: Applies validated improvements
 */

export * from "./types.js";
export * from "./trace-collector.js";
export * from "./evaluator.js";
export * from "./analyzer.js";
export * from "./optimizer.js";
