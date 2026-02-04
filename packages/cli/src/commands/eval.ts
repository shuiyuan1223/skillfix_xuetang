/**
 * Eval command - Self-evolution evaluation system
 */

import type { Command } from "commander";
import {
  traceCollector,
  Evaluator,
  analyzer,
  Optimizer,
  getSystemPrompt,
  createPHAAgent,
} from "@pha/core";
import { loadConfig } from "../utils/config.js";

export function registerEvalCommand(program: Command): void {
  const evalCmd = program
    .command("eval")
    .description("Self-evolution evaluation system");

  // eval traces
  evalCmd
    .command("traces")
    .description("Show recorded interaction traces")
    .option("-n, --limit <number>", "Limit number of traces", "10")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      const traces = traceCollector.getAllTraces();
      const limit = parseInt(options.limit, 10);
      const recent = traces.slice(-limit);

      if (options.json) {
        console.log(JSON.stringify(recent, null, 2));
        return;
      }

      console.log(`\n📊 Recorded Traces (${traces.length} total, showing ${recent.length})\n`);
      console.log("━".repeat(60));

      if (recent.length === 0) {
        console.log("\nNo traces recorded yet.");
        console.log("Use 'pha tui' or 'pha chat' to generate traces.\n");
        return;
      }

      for (const trace of recent) {
        const time = new Date(trace.timestamp).toLocaleString();
        console.log(`\n[${time}]`);
        console.log(`  User: ${trace.userMessage.substring(0, 60)}${trace.userMessage.length > 60 ? "..." : ""}`);
        console.log(`  Response: ${trace.agentResponse.substring(0, 60)}${trace.agentResponse.length > 60 ? "..." : ""}`);
        console.log(`  Tools: ${trace.toolCalls?.map(t => t.tool).join(", ") || "none"}`);
        console.log(`  Duration: ${trace.duration}ms`);
      }

      console.log("\n" + "━".repeat(60) + "\n");
    });

  // eval run
  evalCmd
    .command("run")
    .description("Run evaluation on recorded traces")
    .option("--provider <string>", "LLM provider for evaluation")
    .option("--model <string>", "Model ID")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      const config = loadConfig();
      const apiKey = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || process.env.GOOGLE_API_KEY;

      if (!apiKey) {
        console.error("Error: No API key found for evaluation.");
        process.exit(1);
      }

      const traces = traceCollector.getAllTraces();
      if (traces.length === 0) {
        console.log("\nNo traces to evaluate. Generate some first with 'pha tui' or 'pha chat'.\n");
        return;
      }

      console.log(`\n🔬 Evaluating ${traces.length} traces...\n`);

      const agent = createPHAAgent({
        apiKey,
        provider: (options.provider || config.llm.provider) as "anthropic" | "openai" | "google",
        modelId: options.model || config.llm.modelId,
      });

      const evaluator = new Evaluator({
        llmCall: async (prompt: string) => {
          return await agent.chatAndWait(prompt);
        },
      });

      const results = await evaluator.evaluateTraces(traces);

      if (options.json) {
        console.log(JSON.stringify(results, null, 2));
        return;
      }

      console.log("━".repeat(60));
      console.log("\n📊 Evaluation Results\n");

      for (const result of results) {
        console.log(`  Trace: ${result.traceId.substring(0, 8)}...`);
        console.log(`    Overall: ${result.overallScore}/100`);
        console.log(`    Accuracy: ${result.scores.accuracy} | Relevance: ${result.scores.relevance}`);
        console.log(`    Helpfulness: ${result.scores.helpfulness} | Safety: ${result.scores.safety}`);
        if (result.issues.length > 0) {
          console.log(`    Issues: ${result.issues.map(i => `${i.type}(${i.severity})`).join(", ")}`);
        }
        console.log("");
      }

      // Run analysis
      const analysis = analyzer.analyze(results);

      console.log("━".repeat(60));
      console.log("\n📈 Analysis Summary\n");
      console.log(`  Average Score: ${analysis.metrics.averageScore}/100`);
      console.log(`  Trend: ${analysis.metrics.improvementTrend > 0 ? "📈 Improving" : analysis.metrics.improvementTrend < 0 ? "📉 Declining" : "➡️  Stable"}`);

      if (analysis.weaknesses.length > 0) {
        console.log("\n  ⚠️  Weaknesses:");
        for (const weakness of analysis.weaknesses) {
          const icon = weakness.impact === "high" ? "🔴" : weakness.impact === "medium" ? "🟡" : "🟢";
          console.log(`    ${icon} ${weakness.category}: ${weakness.description}`);
        }
      }

      if (analysis.patterns.length > 0) {
        console.log("\n  📋 Patterns:");
        for (const pattern of analysis.patterns.slice(0, 3)) {
          console.log(`    • ${pattern.type}: ${Math.round(pattern.frequency * 100)}% of traces`);
        }
      }

      console.log("\n" + "━".repeat(60) + "\n");
    });

  // eval optimize
  evalCmd
    .command("optimize")
    .description("Generate optimization suggestions")
    .option("--apply", "Apply the suggestions")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      console.log("\n🔧 Optimization Suggestions\n");
      console.log("━".repeat(60));
      console.log("\nThis feature analyzes recent evaluations and suggests improvements");
      console.log("to the system prompt and tool configurations.\n");

      console.log("Steps:");
      console.log("  1. Generate traces: pha tui or pha chat");
      console.log("  2. Run evaluation: pha eval run");
      console.log("  3. Generate suggestions: pha eval optimize");
      console.log("  4. Apply suggestions: pha eval optimize --apply");

      if (options.apply) {
        console.log("\n⚠️  --apply will modify the system prompt based on suggestions.");
        console.log("   Make sure to review suggestions before applying.\n");
      }

      console.log("━".repeat(60) + "\n");
    });

  // eval clear
  evalCmd
    .command("clear")
    .description("Clear all recorded traces")
    .option("--force", "Skip confirmation")
    .action((options) => {
      if (!options.force) {
        console.log("This will clear all recorded traces.");
        console.log("Use --force to confirm.");
        return;
      }

      traceCollector.clear();
      console.log("All traces cleared.");
    });

  // eval export
  evalCmd
    .command("export")
    .description("Export traces to file")
    .option("-o, --output <file>", "Output file path", "traces.json")
    .action(async (options) => {
      const traces = traceCollector.exportTraces();
      const fs = await import("fs");
      fs.writeFileSync(options.output, traces);
      console.log(`Traces exported to: ${options.output}`);
    });

  // eval import
  evalCmd
    .command("import <file>")
    .description("Import traces from file")
    .action(async (file) => {
      const fs = await import("fs");
      if (!fs.existsSync(file)) {
        console.error(`File not found: ${file}`);
        process.exit(1);
      }

      const content = fs.readFileSync(file, "utf-8");
      traceCollector.importTraces(content);
      console.log(`Traces imported from: ${file}`);
    });
}
