/**
 * Eval command - Self-evolution evaluation system
 */

import type { Command } from "commander";
import { traceCollector, Evaluator, analyzer, Optimizer } from "../evolution/index.js";
import { getSystemPrompt } from "../agent/system-prompt.js";
import { createPHAAgent } from "../agent/index.js";
import { loadConfig } from "../utils/config.js";
import {
  printHeader,
  printSection,
  printKV,
  printStatus,
  printDivider,
  printTable,
  progressBar,
  c,
  icons,
  truncate,
  formatRelativeTime,
  formatDuration,
  Spinner,
  fatal,
  success,
  warn,
  info,
} from "../utils/cli-ui.js";

export function registerEvalCommand(program: Command): void {
  const evalCmd = program.command("eval").description("Self-evolution evaluation system");

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

      console.log("");
      printHeader("📊 Interaction Traces", `${traces.length} total`);

      if (recent.length === 0) {
        console.log(`\n  ${c.dim("No traces recorded yet.")}`);
        console.log(
          `  ${c.dim("Use")} ${c.cyan("pha tui")} ${c.dim("or")} ${c.cyan("pha chat")} ${c.dim("to generate traces.")}\n`
        );
        return;
      }

      printTable(
        ["ID", "Time", "User Message", "Tools", "Duration"],
        recent.map((trace) => [
          c.dim(trace.id.substring(0, 8)),
          formatRelativeTime(new Date(trace.timestamp)),
          truncate(trace.userMessage, 25),
          trace.toolCalls?.length ? String(trace.toolCalls.length) : c.dim("-"),
          formatDuration(trace.duration),
        ])
      );

      console.log("");
      printDivider();
      console.log(
        `\n  ${c.dim("Showing")} ${recent.length} ${c.dim("of")} ${traces.length} ${c.dim("traces")}`
      );
      console.log(`  ${c.dim("Use")} ${c.cyan("pha eval run")} ${c.dim("to evaluate traces")}`);
      console.log("");
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
      const apiKey =
        process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || process.env.GOOGLE_API_KEY;

      if (!apiKey) {
        fatal("No API key found for evaluation", "Set ANTHROPIC_API_KEY or another provider key");
      }

      const traces = traceCollector.getAllTraces();
      if (traces.length === 0) {
        info("No traces to evaluate");
        console.log(
          `  ${c.dim("Generate some first with")} ${c.cyan("pha tui")} ${c.dim("or")} ${c.cyan("pha chat")}\n`
        );
        return;
      }

      console.log("");
      printHeader("🔬 Evaluation", `${traces.length} traces`);

      const spinner = new Spinner(`Evaluating traces...`);
      spinner.start();

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
      spinner.stop("success");

      if (options.json) {
        console.log(JSON.stringify(results, null, 2));
        return;
      }

      // Results table
      printSection("Results");

      printTable(
        ["Trace", "Score", "Accuracy", "Relevance", "Helpful", "Safety", "Issues"],
        results.map((result) => {
          const scoreColor =
            result.overallScore >= 80 ? c.green : result.overallScore >= 60 ? c.yellow : c.red;
          return [
            c.dim(result.traceId.substring(0, 8)),
            scoreColor(`${result.overallScore}/100`),
            String(result.scores.accuracy),
            String(result.scores.relevance),
            String(result.scores.helpfulness),
            String(result.scores.safety),
            result.issues.length > 0 ? c.yellow(String(result.issues.length)) : c.dim("-"),
          ];
        })
      );

      // Run analysis
      const analysis = analyzer.analyze(results);

      // Analysis Summary
      printSection("Analysis Summary", "📈");

      const avgScore = analysis.metrics.averageScore;
      const scoreBar = progressBar(avgScore, 100, 20);
      const scoreLabel =
        avgScore >= 80
          ? c.green("Excellent")
          : avgScore >= 60
            ? c.yellow("Good")
            : c.red("Needs Improvement");

      printKV("Average Score", `${c.bold(String(avgScore))} ${scoreBar} ${scoreLabel}`);

      const trendIcon =
        analysis.metrics.improvementTrend > 0
          ? c.green("↑ Improving")
          : analysis.metrics.improvementTrend < 0
            ? c.red("↓ Declining")
            : c.dim("→ Stable");
      printKV("Trend", trendIcon);

      // Weaknesses
      if (analysis.weaknesses.length > 0) {
        console.log("");
        console.log(`  ${c.yellow(icons.warning)} ${c.bold("Weaknesses:")}`);
        for (const weakness of analysis.weaknesses) {
          const impactColor =
            weakness.impact === "high" ? c.red : weakness.impact === "medium" ? c.yellow : c.gray;
          console.log(
            `    ${impactColor("●")} ${weakness.category}: ${c.dim(weakness.description)}`
          );
        }
      }

      // Patterns
      if (analysis.patterns.length > 0) {
        console.log("");
        console.log(`  ${c.cyan(icons.info)} ${c.bold("Patterns:")}`);
        for (const pattern of analysis.patterns.slice(0, 3)) {
          const pct = Math.round(pattern.frequency * 100);
          console.log(`    ${c.dim("•")} ${pattern.type}: ${c.cyan(pct + "%")} of traces`);
        }
      }

      console.log("");
      printDivider();
      console.log(
        `\n  ${c.dim("Run")} ${c.cyan("pha eval optimize")} ${c.dim("to generate improvement suggestions")}\n`
      );
    });

  // eval optimize
  evalCmd
    .command("optimize")
    .description("Generate optimization suggestions")
    .option("--apply", "Apply the suggestions")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      console.log("");
      printHeader("🔧 Optimization", "Generate improvement suggestions");

      printSection("How it works");
      console.log(`
  This feature analyzes recent evaluations and suggests improvements
  to the system prompt and tool configurations.
`);

      printSection("Workflow");
      const steps = [
        { num: "1", action: "Generate traces", cmd: "pha tui or pha chat" },
        { num: "2", action: "Run evaluation", cmd: "pha eval run" },
        { num: "3", action: "Get suggestions", cmd: "pha eval optimize" },
        { num: "4", action: "Apply changes", cmd: "pha eval optimize --apply" },
      ];

      for (const step of steps) {
        console.log(`  ${c.cyan(step.num)}. ${step.action}`);
        console.log(`     ${c.dim(step.cmd)}`);
      }

      if (options.apply) {
        console.log("");
        warn("--apply will modify the system prompt based on suggestions");
        console.log(`  ${c.dim("Make sure to review suggestions before applying.")}`);
      }

      console.log("");
    });

  // eval clear
  evalCmd
    .command("clear")
    .description("Clear all recorded traces")
    .option("--force", "Skip confirmation")
    .action((options) => {
      const traces = traceCollector.getAllTraces();

      if (traces.length === 0) {
        info("No traces to clear");
        return;
      }

      if (!options.force) {
        warn(`This will delete ${traces.length} traces`);
        console.log(`  ${c.dim("Use")} ${c.cyan("--force")} ${c.dim("to confirm")}\n`);
        return;
      }

      traceCollector.clear();
      success(`Cleared ${traces.length} traces`);
    });

  // eval export
  evalCmd
    .command("export")
    .description("Export traces to file")
    .option("-o, --output <file>", "Output file path", "traces.json")
    .action(async (options) => {
      const traces = traceCollector.getAllTraces();

      if (traces.length === 0) {
        info("No traces to export");
        return;
      }

      const spinner = new Spinner("Exporting traces...");
      spinner.start();

      const data = traceCollector.exportTraces();
      const fs = await import("fs");
      fs.writeFileSync(options.output, data);

      spinner.stop("success");
      success(`Exported ${traces.length} traces to ${c.cyan(options.output)}`);
    });

  // eval import
  evalCmd
    .command("import <file>")
    .description("Import traces from file")
    .action(async (file) => {
      const fs = await import("fs");
      if (!fs.existsSync(file)) {
        fatal(`File not found: ${file}`);
      }

      const spinner = new Spinner("Importing traces...");
      spinner.start();

      const content = fs.readFileSync(file, "utf-8");
      traceCollector.importTraces(content);

      spinner.stop("success");
      success(`Imported traces from ${c.cyan(file)}`);
    });

  // eval stats - new command
  evalCmd
    .command("stats")
    .description("Show evaluation statistics")
    .action(async () => {
      const traces = traceCollector.getAllTraces();

      console.log("");
      printHeader("📈 Evaluation Statistics");

      if (traces.length === 0) {
        console.log(`\n  ${c.dim("No data yet. Start by generating traces:")}`);
        console.log(`  ${c.cyan("pha tui")} ${c.dim("or")} ${c.cyan("pha chat")}\n`);
        return;
      }

      printSection("Overview");
      printKV("Total Traces", c.bold(String(traces.length)));

      // Time stats
      const timestamps = traces.map((t) => new Date(t.timestamp).getTime());
      const oldest = new Date(Math.min(...timestamps));
      const newest = new Date(Math.max(...timestamps));
      printKV("First Trace", formatRelativeTime(oldest));
      printKV("Last Trace", formatRelativeTime(newest));

      // Duration stats
      const durations = traces.map((t) => t.duration);
      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      const maxDuration = Math.max(...durations);
      printKV("Avg Duration", formatDuration(avgDuration));
      printKV("Max Duration", formatDuration(maxDuration));

      // Tool usage
      const toolCounts: Record<string, number> = {};
      for (const trace of traces) {
        for (const call of trace.toolCalls || []) {
          toolCounts[call.tool] = (toolCounts[call.tool] || 0) + 1;
        }
      }

      if (Object.keys(toolCounts).length > 0) {
        printSection("Tool Usage");
        const sorted = Object.entries(toolCounts).sort((a, b) => b[1] - a[1]);
        for (const [tool, count] of sorted.slice(0, 5)) {
          const pct = Math.round((count / traces.length) * 100);
          console.log(
            `  ${c.cyan(tool.padEnd(25))} ${progressBar(count, sorted[0][1], 15)} ${count} ${c.dim(`(${pct}%)`)}`
          );
        }
      }

      console.log("");
    });
}
