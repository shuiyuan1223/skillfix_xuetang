/**
 * Eval command - Self-evolution evaluation system
 */

import type { Command } from "commander";
import {
  traceCollector,
  Evaluator,
  analyzer,
  Optimizer,
  BenchmarkRunner,
  AutoLoop,
  checkRegression,
  formatRegressionMarkdown,
  diagnose,
} from "../evolution/index.js";
import {
  ALL_BENCHMARK_TESTS,
  CATEGORY_LABELS,
  getBenchmarkTests,
} from "../evolution/benchmark-seed.js";
import {
  generateAsciiRadar,
  generateRadarData,
  identifyWeakCategories,
  normalizeScoreForDisplay,
} from "../evolution/category-scorer.js";
import {
  compareRuns,
  compareLatest,
  formatComparison,
  getRecentRuns,
} from "../evolution/version-tracker.js";
import type { BenchmarkCategory, AutoLoopConfig, BenchmarkProfile } from "../evolution/types.js";
import { createPHAAgent } from "../agent/index.js";
import {
  loadConfig,
  getBenchmarkModels,
  getJudgeModel,
  resolveBenchmarkModels,
  resolveJudgeModel,
  resolveAgentModel,
  resolveBenchmarkModelApiKey,
  resolveBenchmarkModelBaseUrl,
  BUILTIN_PROVIDERS,
  ENV_KEY_MAP,
  type LLMProvider,
  type BenchmarkModelConfig,
} from "../utils/config.js";
import { MockDataSource } from "../data-sources/mock.js";
import { sessionToAgentMessages } from "../memory/session-store.js";
import { getModel, complete } from "@mariozechner/pi-ai";
import { countTestCases, listBenchmarkRuns, listCategoryScores } from "../memory/db.js";
import {
  writeBenchmarkProgress,
  readBenchmarkProgress,
  clearBenchmarkProgress,
} from "../evolution/benchmark-progress.js";
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

// PROVIDER_ENV_KEYS and resolveApiKey() removed — use ENV_KEY_MAP and resolveAgentModel() from config.ts

/**
 * Resolve API key for eval commands.
 * Delegates to resolveAgentModel() when no explicit provider is given.
 */
function resolveApiKey(
  config: ReturnType<typeof loadConfig>,
  provider?: string
): string | undefined {
  const effectiveProvider = provider || config.llm.provider;

  // 1. Try resolveAgentModel (handles new format + legacy)
  try {
    const resolved = resolveAgentModel(config);
    if (!provider || provider === resolved.provider) {
      return resolved.apiKey;
    }
  } catch {
    // Fall through
  }

  // 2. If provider matches config → config key is valid
  if (effectiveProvider === config.llm.provider && config.llm.apiKey) {
    return config.llm.apiKey;
  }

  // 3. Provider-specific env var
  const envKey = ENV_KEY_MAP[effectiveProvider as LLMProvider];
  if (envKey && process.env[envKey]) {
    return process.env[envKey];
  }

  // 4. Fallback: config key
  if (config.llm.apiKey) return config.llm.apiKey;

  return undefined;
}

/**
 * Create a raw LLM call function for evaluation (no agent, no tools, no system prompt).
 * This ensures the evaluator gets clean JSON responses.
 */
function createRawLLMCall(
  provider: LLMProvider,
  modelId: string,
  apiKey: string,
  baseUrl?: string
): (prompt: string) => Promise<string> {
  let model: any;
  if (BUILTIN_PROVIDERS.includes(provider)) {
    model = getModel(provider as any, modelId);
    if (!model && baseUrl) {
      model = {
        id: modelId,
        name: modelId,
        api: "openai-completions" as const,
        provider,
        baseUrl,
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 16384,
      };
    }
  } else if (baseUrl) {
    model = {
      id: modelId,
      name: modelId,
      api: "openai-completions" as const,
      provider,
      baseUrl,
      reasoning: false,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128000,
      maxTokens: 16384,
    };
  }

  if (!model) {
    // Fallback to using agent if model can't be created
    throw new Error(`Cannot create direct model for ${provider}/${modelId}`);
  }

  return async (prompt: string): Promise<string> => {
    const response = await complete(
      model,
      {
        systemPrompt: "You are an evaluation assistant. Always respond with valid JSON.",
        messages: [{ role: "user" as const, content: prompt, timestamp: Date.now() }],
      },
      { apiKey, maxTokens: 2000 }
    );

    return response.content
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join("");
  };
}

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
      const evalProvider = (options.provider || config.llm.provider) as LLMProvider;
      const apiKey = resolveApiKey(config, evalProvider);

      if (!apiKey) {
        fatal("No API key found for evaluation", "Set an API key in config or environment");
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

      const evalMockSource = new MockDataSource();
      const agent = await createPHAAgent({
        apiKey,
        provider: (options.provider || config.llm.provider) as "anthropic" | "openai" | "google",
        modelId: options.model || config.llm.modelId,
        dataSource: evalMockSource,
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

  // eval seed - populate benchmark test cases
  evalCmd
    .command("seed")
    .description("Seed benchmark test cases into the database")
    .option("--force", "Overwrite existing test cases")
    .action(async (options) => {
      console.log("");
      printHeader("Benchmark Seed", "Populating test cases");

      const existing = countTestCases();
      if (existing > 0 && !options.force) {
        info(`${existing} test cases already exist in the database`);
        console.log(`  ${c.dim("Use")} ${c.cyan("--force")} ${c.dim("to overwrite")}\n`);
        return;
      }

      const spinner = new Spinner("Seeding test cases...");
      spinner.start();

      const runner = new BenchmarkRunner({
        agentCall: async () => ({ response: "" }),
        llmCall: async () => "",
      });

      const count = await runner.seedTestCases();
      spinner.stop("success");

      success(`Seeded ${count} benchmark test cases`);

      // Show breakdown by category
      printSection("Categories");
      const categories = new Map<string, number>();
      for (const tc of ALL_BENCHMARK_TESTS) {
        categories.set(tc.category, (categories.get(tc.category) || 0) + 1);
      }
      for (const [cat, count] of categories) {
        const label = CATEGORY_LABELS[cat as BenchmarkCategory] || cat;
        printKV(label, String(count));
      }

      const coreCount = ALL_BENCHMARK_TESTS.filter((t) => t.difficulty === "core").length;
      console.log("");
      printKV("Quick profile (core)", String(coreCount));
      printKV("Full profile (all)", String(ALL_BENCHMARK_TESTS.length));

      console.log("");
      console.log(
        `  ${c.dim("Run")} ${c.cyan("pha eval benchmark")} ${c.dim("to execute benchmarks")}\n`
      );
    });

  // eval diagnose - run diagnose pipeline
  evalCmd
    .command("diagnose")
    .description("Run diagnose pipeline: benchmark → analyze weaknesses → suggest fixes")
    .option("--profile <profile>", "Benchmark profile: quick or full", "quick")
    .option("--create-issues", "Create GitHub issues for each weakness")
    .option("--provider <string>", "LLM provider")
    .option("--model <string>", "Model ID")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      const config = loadConfig();
      const diagProvider = (options.provider || config.llm.provider) as LLMProvider;
      const diagModelId = options.model || config.llm.modelId;
      const apiKey = resolveApiKey(config, diagProvider);

      if (!apiKey) {
        fatal("No API key found", "Set an API key in config or environment");
      }

      const tcCount = countTestCases();
      if (tcCount === 0) {
        info("No test cases found. Run seed first.");
        console.log(`  ${c.cyan("pha eval seed")}\n`);
        return;
      }

      console.log("");
      printHeader("Diagnose", "Benchmark → Analyze → Suggest");

      const profile = options.profile as "quick" | "full";
      const diagBaseUrl = diagProvider === config.llm.provider ? config.llm.baseUrl : undefined;

      let rawLLMCall: (prompt: string) => Promise<string>;
      try {
        rawLLMCall = createRawLLMCall(diagProvider, diagModelId, apiKey!, diagBaseUrl);
      } catch {
        rawLLMCall = async (prompt: string) => {
          // Create fresh agent per judge call for concurrency safety
          const { MockDataSource } = await import("../data-sources/mock.js");
          const judgeAgent = await createPHAAgent({
            apiKey,
            provider: diagProvider,
            modelId: diagModelId,
            baseUrl: diagBaseUrl,
            dataSource: new MockDataSource(),
          });
          return judgeAgent.chatAndWait(prompt);
        };
      }

      const AGENT_TIMEOUT_MS = 120_000;

      const spinner = new Spinner("Running diagnose pipeline...");
      spinner.start();

      try {
        const result = await diagnose({
          profile,
          runnerConfig: {
            agentCall: async (query: string) => {
              // Create fresh agent per test case for concurrency safety
              const { MockDataSource } = await import("../data-sources/mock.js");
              const testAgent = await createPHAAgent({
                apiKey,
                provider: diagProvider,
                modelId: diagModelId,
                baseUrl: diagBaseUrl,
                dataSource: new MockDataSource(),
              });
              const response = await Promise.race([
                testAgent.chatAndWait(query).then((r: string) => ({ response: r })),
                new Promise<{ response: string }>((_, reject) =>
                  setTimeout(() => reject(new Error("Agent call timed out")), AGENT_TIMEOUT_MS)
                ),
              ]);
              return response;
            },
            llmCall: rawLLMCall,
            onProgress: (current, total, testCase) => {
              spinner.update(`Running ${current}/${total}: ${testCase.id}`);
            },
          },
          createIssues: options.createIssues,
          onProgress: (msg) => spinner.update(msg),
        });

        spinner.stop("success");

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        // Summary
        printSection("Benchmark Results");
        printKV("Overall Score", `${normalizeScoreForDisplay(result.overallScore).toFixed(2)}`);
        printKV("Tests", `${result.run.passedCount}/${result.run.totalTestCases} passed`);

        if (result.weaknesses.length > 0) {
          printSection("Weak Categories");
          for (const w of result.weaknesses) {
            console.log(
              `  ${c.red("!")} ${w.label}: ${c.yellow(normalizeScoreForDisplay(w.score).toFixed(2))} (${normalizeScoreForDisplay(w.gap).toFixed(2)} below threshold)`
            );
            console.log(`    ${c.dim(`${w.failingTests.length} failing tests`)}`);
            if (w.commonPatterns.length > 0) {
              console.log(`    ${c.dim("Patterns:")} ${w.commonPatterns.slice(0, 2).join("; ")}`);
            }
          }
        } else {
          success("No weak categories found!");
        }

        if (result.suggestions.length > 0) {
          printSection("Suggestions");
          for (const s of result.suggestions) {
            const priorityColor =
              s.priority === "high" ? c.red : s.priority === "medium" ? c.yellow : c.dim;
            console.log(`  ${priorityColor(`[${s.priority}]`)} ${s.description}`);
            console.log(`    ${c.dim("Files:")} ${s.targetFiles.join(", ")}`);
          }
        }

        if (result.issuesCreated.length > 0) {
          printSection("GitHub Issues Created");
          for (const issue of result.issuesCreated) {
            console.log(`  ${c.green("+")} #${issue.number}: ${issue.url}`);
          }
        }

        console.log("");
      } catch (error) {
        spinner.stop("error");
        fatal("Diagnose failed", error instanceof Error ? error.message : String(error));
      }
    });

  // eval benchmark - run benchmark suite
  evalCmd
    .command("benchmark")
    .description("Run benchmark evaluation suite")
    .option("--profile <profile>", "Benchmark profile: quick (20 core) or full (80+ all)", "quick")
    .option("--category <category>", "Run only a specific category")
    .option("--version-tag <tag>", "Tag this benchmark run")
    .option("--provider <string>", "LLM provider")
    .option("--model <string>", "Model ID")
    .option("--preset <name>", "Use a named model preset from benchmarkModels config")
    .option("--all-models", "Run benchmark with all configured benchmarkModels")
    .option("--models <names>", "Comma-separated preset names to run")
    .option("--parallel", "Run all models in parallel (default: sequential)")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      const config = loadConfig();

      // Check test cases exist
      const tcCount = countTestCases();
      if (tcCount === 0) {
        info("No test cases found. Run seed first.");
        console.log(`  ${c.cyan("pha eval seed")}\n`);
        return;
      }

      const profile = options.profile as "quick" | "full";

      // Resolve model list
      interface ModelEntry {
        presetName: string;
        provider: LLMProvider;
        modelId: string;
        apiKey: string;
        baseUrl?: string;
        label: string;
      }

      const modelEntries: ModelEntry[] = [];

      if (options.allModels || options.models) {
        // Multi-model mode
        const benchmarkModels = getBenchmarkModels();
        const presetNames = options.allModels
          ? Object.keys(benchmarkModels)
          : (options.models as string)
              .split(",")
              .map((s: string) => s.trim())
              .filter(Boolean);

        for (const name of presetNames) {
          const modelConfig = benchmarkModels[name];
          if (!modelConfig) {
            warn(`Unknown model preset: ${name} (skipping)`);
            continue;
          }
          const key = resolveBenchmarkModelApiKey(modelConfig);
          if (!key) {
            warn(`No API key for ${name} (skipping)`);
            continue;
          }
          modelEntries.push({
            presetName: name,
            provider: modelConfig.provider,
            modelId: modelConfig.modelId,
            apiKey: key,
            baseUrl: resolveBenchmarkModelBaseUrl(modelConfig),
            label: modelConfig.label || `${modelConfig.provider}/${modelConfig.modelId}`,
          });
        }

        if (modelEntries.length === 0) {
          fatal("No valid model presets found", "Check benchmarkModels in config");
        }
      } else if (options.preset) {
        // Single preset mode
        const benchmarkModels = getBenchmarkModels();
        const modelConfig = benchmarkModels[options.preset];
        if (!modelConfig) {
          fatal(
            `Unknown model preset: ${options.preset}`,
            `Available: ${Object.keys(benchmarkModels).join(", ")}`
          );
        }
        const key = resolveBenchmarkModelApiKey(modelConfig);
        if (!key) {
          fatal("No API key found for preset", options.preset);
        }
        modelEntries.push({
          presetName: options.preset,
          provider: modelConfig.provider,
          modelId: modelConfig.modelId,
          apiKey: key,
          baseUrl: modelConfig.baseUrl,
          label: modelConfig.label || `${modelConfig.provider}/${modelConfig.modelId}`,
        });
      } else {
        // Default: single model from CLI flags or config
        const benchProvider = (options.provider || config.llm.provider) as LLMProvider;
        const benchModelId = options.model || config.llm.modelId;
        const apiKey = resolveApiKey(config, benchProvider);

        if (!apiKey) {
          fatal(
            "No API key found",
            `Set ${ENV_KEY_MAP[benchProvider] || "an API key"} in environment or config`
          );
        }

        modelEntries.push({
          presetName: "default",
          provider: benchProvider,
          modelId: benchModelId,
          apiKey: apiKey!,
          baseUrl: benchProvider === config.llm.provider ? config.llm.baseUrl : undefined,
          label: `${benchProvider}/${benchModelId}`,
        });
      }

      // Run benchmark for each model
      type RunResult = {
        presetName: string;
        label: string;
        run: Awaited<ReturnType<BenchmarkRunner["run"]>>["run"];
        results: Awaited<ReturnType<BenchmarkRunner["run"]>>["results"];
        categoryScores: Awaited<ReturnType<BenchmarkRunner["run"]>>["categoryScores"];
      };
      const allRunResults: RunResult[] = [];

      // Check if another benchmark is already running
      const existingProgress = readBenchmarkProgress();
      if (existingProgress) {
        warn(
          `A benchmark is already running (source: ${existingProgress.source}, ${existingProgress.current}/${existingProgress.total})`
        );
        console.log(
          `  ${c.dim("Wait for it to finish or remove")} ${c.cyan(".pha/benchmark-progress.json")}\n`
        );
        return;
      }

      const isMulti = modelEntries.length > 1;
      const isParallel = options.parallel && isMulti;
      const AGENT_TIMEOUT_MS = 120_000;

      // Shared judge config (one judge for all models)
      const judgeConfig = getJudgeModel();
      const judgeApiKey = resolveBenchmarkModelApiKey(judgeConfig);
      const judgeBaseUrl = resolveBenchmarkModelBaseUrl(judgeConfig);

      /** Run benchmark for a single model entry. Returns result or null on failure. */
      async function runSingleModel(
        entry: ModelEntry,
        mi: number,
        opts: {
          noSpinner?: boolean;
          onProgressOverride?: (
            current: number,
            total: number,
            testCase: { id: string; category: string }
          ) => void;
        } = {}
      ): Promise<RunResult | null> {
        const prefix = isMulti ? `[${mi + 1}/${modelEntries.length}] ${entry.label}` : "";

        if (!opts.noSpinner) {
          console.log("");
          printHeader(isMulti ? `Benchmark — ${entry.label}` : "Benchmark", `${profile} profile`);
        }

        let rawLLMCall: (prompt: string) => Promise<string>;
        try {
          rawLLMCall = createRawLLMCall(
            judgeConfig.provider as LLMProvider,
            judgeConfig.modelId,
            judgeApiKey!,
            judgeBaseUrl
          );
        } catch {
          rawLLMCall = async (prompt: string) => {
            // Create fresh agent per judge call for concurrency safety
            const judgeDs = new MockDataSource();
            const judgeAgent = await createPHAAgent({
              apiKey: entry.apiKey,
              provider: entry.provider,
              modelId: entry.modelId,
              baseUrl: entry.baseUrl,
              dataSource: judgeDs,
            });
            return judgeAgent.chatAndWait(prompt);
          };
        }

        const spinner = opts.noSpinner
          ? null
          : new Spinner(`${prefix ? prefix + " — " : ""}Running benchmarks...`);
        spinner?.start();

        const runner = new BenchmarkRunner({
          agentCall: async (query: string, mockContext?: Record<string, unknown>) => {
            // Create fresh agent per test case for concurrency safety
            const testDs = new MockDataSource();
            const testAgent = await createPHAAgent({
              apiKey: entry.apiKey,
              provider: entry.provider,
              modelId: entry.modelId,
              baseUrl: entry.baseUrl,
              dataSource: testDs,
            });

            // Inject conversation_history into agent state so it has prior context
            if (mockContext?.conversation_history) {
              const history = mockContext.conversation_history as Array<{
                role: string;
                content: string;
                timestamp?: number;
              }>;
              const msgs = sessionToAgentMessages(history);
              for (const msg of msgs) {
                testAgent.getAgent().state.messages.push(msg);
              }
            }

            const result = await Promise.race([
              testAgent.chatAndWaitWithTools(query),
              new Promise<{
                response: string;
                toolCalls: Array<{ tool: string; arguments: unknown; result: unknown }>;
              }>((_, reject) =>
                setTimeout(
                  () => reject(new Error("Agent call timed out after 2 minutes")),
                  AGENT_TIMEOUT_MS
                )
              ),
            ]);
            return result;
          },
          llmCall: rawLLMCall,
          onProgress: (current, total, testCase) => {
            if (opts.onProgressOverride) {
              opts.onProgressOverride(current, total, testCase);
            } else {
              spinner?.update(
                `${prefix ? prefix + " — " : ""}Running ${current}/${total}: ${testCase.id}`
              );
              writeBenchmarkProgress({
                running: true,
                source: "cli",
                profile,
                current,
                total,
                category: testCase.category,
                startedAt: Date.now(),
                modelId: entry.modelId,
                pid: process.pid,
              });
            }
          },
        });

        try {
          const { run, results, categoryScores } = await runner.run({
            profile,
            category: options.category as BenchmarkCategory | undefined,
            versionTag: options.versionTag,
            modelOverride: {
              provider: entry.provider,
              modelId: entry.modelId,
              presetName: entry.presetName,
            },
          });

          spinner?.stop("success");
          return { presetName: entry.presetName, label: entry.label, run, results, categoryScores };
        } catch (error) {
          spinner?.stop("error");
          if (!opts.onProgressOverride) clearBenchmarkProgress();
          warn(
            `Benchmark failed for ${entry.label}: ${error instanceof Error ? error.message : String(error)}`
          );
          return null;
        }
      }

      // --- Parallel mode ---
      if (isParallel) {
        console.log("");
        printHeader(`Benchmark — ${modelEntries.length} models (parallel)`, `${profile} profile`);

        const perModelProgress = new Array(modelEntries.length).fill(0);
        const testsPerModel = getBenchmarkTests({
          profile,
          category: options.category as BenchmarkCategory | undefined,
        }).length;
        const totalTests = testsPerModel * modelEntries.length;
        const startedAt = Date.now();

        const updateAggregateProgress = () => {
          const current = perModelProgress.reduce((a: number, b: number) => a + b, 0);
          writeBenchmarkProgress({
            running: true,
            source: "cli",
            profile,
            current,
            total: totalTests,
            category: "",
            startedAt,
            modelId: `${modelEntries.length} models`,
            pid: process.pid,
          });
          parallelSpinner.update(
            `Running ${modelEntries.length} models... (${current}/${totalTests})`
          );
        };

        const parallelSpinner = new Spinner(`Running ${modelEntries.length} models in parallel...`);
        parallelSpinner.start();

        // Write initial progress
        updateAggregateProgress();

        const settled = await Promise.allSettled(
          modelEntries.map((entry, mi) =>
            runSingleModel(entry, mi, {
              noSpinner: true,
              onProgressOverride: (current) => {
                perModelProgress[mi] = current;
                updateAggregateProgress();
              },
            })
          )
        );

        parallelSpinner.stop("success");
        clearBenchmarkProgress();

        let doneCount = 0;
        for (let i = 0; i < settled.length; i++) {
          const s = settled[i];
          const entry = modelEntries[i];
          if (s.status === "fulfilled" && s.value) {
            allRunResults.push(s.value);
            doneCount++;
          } else {
            const reason =
              s.status === "rejected"
                ? s.reason instanceof Error
                  ? s.reason.message
                  : String(s.reason)
                : "returned null";
            warn(`${entry.label}: ${reason}`);
          }
        }

        console.log(
          `\n  ${c.green(String(doneCount))} completed, ${c.red(String(modelEntries.length - doneCount))} failed\n`
        );
      } else {
        // --- Sequential mode ---
        for (let mi = 0; mi < modelEntries.length; mi++) {
          const result = await runSingleModel(modelEntries[mi], mi);
          if (result) {
            allRunResults.push(result);

            if (options.json && !isMulti) {
              console.log(
                JSON.stringify(
                  { run: result.run, results: result.results.map((r) => ({ ...r })) },
                  null,
                  2
                )
              );
              return;
            }

            // Summary
            printSection("Results Summary");
            printKV("Run ID", c.dim(result.run.id.substring(0, 8)));
            printKV("Model", c.cyan(result.label));
            printKV("Profile", profile);
            printKV("Test Cases", String(result.run.totalTestCases));
            printKV("Passed", c.green(String(result.run.passedCount)));
            printKV(
              "Failed",
              result.run.failedCount > 0 ? c.red(String(result.run.failedCount)) : c.dim("0")
            );

            const runDisplayScore = normalizeScoreForDisplay(result.run.overallScore);
            const scoreColor =
              runDisplayScore >= 0.8 ? c.green : runDisplayScore >= 0.6 ? c.yellow : c.red;
            printKV("Overall Score", scoreColor(runDisplayScore.toFixed(2)));
            printKV("Duration", formatDuration(result.run.durationMs));

            if (!isMulti) {
              // Detailed output for single model
              printSection("Test Results");
              printTable(
                ["Test", "Category", "Score", "Pass", "Feedback"],
                result.results.map((r) => {
                  const ds = normalizeScoreForDisplay(r.overallScore);
                  const sc = ds >= 0.8 ? c.green : ds >= 0.6 ? c.yellow : c.red;
                  return [
                    c.dim(r.testCaseId),
                    truncate(r.testCaseId.split("-").slice(0, 2).join("-"), 15),
                    sc(ds.toFixed(2)),
                    r.passed ? c.green("PASS") : c.red("FAIL"),
                    truncate(r.feedback, 30),
                  ];
                })
              );

              const radarData = generateRadarData(result.categoryScores);
              console.log(generateAsciiRadar(radarData));

              const weakCategories = identifyWeakCategories(result.categoryScores);
              if (weakCategories.length > 0) {
                printSection("Weakest Categories");
                for (const weak of weakCategories) {
                  const label = CATEGORY_LABELS[weak.category];
                  console.log(
                    `  ${c.red("!")} ${label}: ${c.yellow(normalizeScoreForDisplay(weak.score).toFixed(2))} (${normalizeScoreForDisplay(weak.gap).toFixed(2)} below threshold)`
                  );
                }
              }
            }
          }
        }
      }

      // Clear progress after all models complete
      clearBenchmarkProgress();

      // Multi-model comparison summary
      if (allRunResults.length > 1) {
        console.log("");
        printHeader("Model Comparison", `${allRunResults.length} models`);

        printTable(
          ["Model", "Score", "Pass", "Fail", "Duration"],
          allRunResults.map((r) => {
            const ds = normalizeScoreForDisplay(r.run.overallScore);
            const sc = ds >= 0.8 ? c.green : ds >= 0.6 ? c.yellow : c.red;
            return [
              r.label,
              sc(ds.toFixed(2)),
              c.green(String(r.run.passedCount)),
              r.run.failedCount > 0 ? c.red(String(r.run.failedCount)) : c.dim("0"),
              formatDuration(r.run.durationMs),
            ];
          })
        );

        // Best model
        const best = allRunResults.reduce((a, b) =>
          a.run.overallScore >= b.run.overallScore ? a : b
        );
        console.log("");
        printKV(
          "Best Model",
          c.green(`${best.label} (${normalizeScoreForDisplay(best.run.overallScore).toFixed(2)})`)
        );

        if (options.json) {
          console.log(
            JSON.stringify(
              {
                comparison: allRunResults.map((r) => ({
                  preset: r.presetName,
                  label: r.label,
                  score: r.run.overallScore,
                  passed: r.run.passedCount,
                  failed: r.run.failedCount,
                  duration: r.run.durationMs,
                  runId: r.run.id,
                })),
              },
              null,
              2
            )
          );
        }
      }

      console.log("");
      printDivider();
      console.log(
        `\n  ${c.dim("Run")} ${c.cyan("pha eval compare --latest 2")} ${c.dim("to compare with previous runs")}\n`
      );
    });

  // eval compare - compare benchmark runs
  evalCmd
    .command("compare")
    .description("Compare benchmark runs side by side")
    .option("--latest <count>", "Compare the latest N runs (default: 2)", "2")
    .option("--run1 <id>", "First run ID to compare")
    .option("--run2 <id>", "Second run ID to compare")
    .option("--by-model", "Compare latest run from each configured model")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      console.log("");

      // --by-model: compare latest run per model
      if (options.byModel) {
        printHeader("Model Comparison", "Latest run per model");

        const benchmarkModels = getBenchmarkModels();
        const modelRuns: Array<{
          preset: string;
          label: string;
          run: ReturnType<typeof listBenchmarkRuns>[0];
        }> = [];

        for (const [name, modelConfig] of Object.entries(benchmarkModels)) {
          const runs = listBenchmarkRuns({ limit: 1, modelId: modelConfig.modelId });
          if (runs.length > 0) {
            modelRuns.push({
              preset: name,
              label: modelConfig.label || `${modelConfig.provider}/${modelConfig.modelId}`,
              run: runs[0],
            });
          }
        }

        if (modelRuns.length === 0) {
          info("No benchmark runs found for any configured model");
          console.log(
            `  ${c.dim("Run")} ${c.cyan("pha eval benchmark --all-models")} ${c.dim("first")}\n`
          );
          return;
        }

        if (options.json) {
          console.log(
            JSON.stringify(
              modelRuns.map((m) => ({
                preset: m.preset,
                label: m.label,
                score: m.run.overall_score,
                passed: m.run.passed_count,
                failed: m.run.failed_count,
                total: m.run.total_test_cases,
                duration: m.run.duration_ms,
                date: new Date(m.run.timestamp).toISOString(),
              })),
              null,
              2
            )
          );
          return;
        }

        printTable(
          ["Model", "Score", "Pass", "Fail", "Tests", "Date"],
          modelRuns.map((m) => {
            const ds = normalizeScoreForDisplay(m.run.overall_score);
            const sc = ds >= 0.8 ? c.green : ds >= 0.6 ? c.yellow : c.red;
            return [
              m.label,
              sc(ds.toFixed(2)),
              c.green(String(m.run.passed_count)),
              m.run.failed_count > 0 ? c.red(String(m.run.failed_count)) : c.dim("0"),
              String(m.run.total_test_cases),
              new Date(m.run.timestamp).toLocaleDateString(),
            ];
          })
        );

        if (modelRuns.length > 1) {
          const best = modelRuns.reduce((a, b) =>
            a.run.overall_score >= b.run.overall_score ? a : b
          );
          console.log("");
          printKV(
            "Best Model",
            c.green(
              `${best.label} (${normalizeScoreForDisplay(best.run.overall_score).toFixed(2)})`
            )
          );
        }

        console.log("");
        return;
      }

      printHeader("Benchmark Comparison");

      let comparison;

      if (options.run1 && options.run2) {
        comparison = compareRuns(options.run1, options.run2);
      } else {
        const count = parseInt(options.latest, 10) || 2;
        comparison = compareLatest(count);
      }

      if (!comparison) {
        info("Not enough benchmark runs to compare");
        console.log(
          `  ${c.dim("Run")} ${c.cyan("pha eval benchmark")} ${c.dim("at least twice to compare")}\n`
        );
        return;
      }

      if (options.json) {
        console.log(JSON.stringify(comparison, null, 2));
        return;
      }

      // Text comparison
      console.log(formatComparison(comparison));

      // Radar charts for both runs
      const scores1 = listCategoryScores(comparison.run1.id);
      const scores2 = listCategoryScores(comparison.run2.id);

      if (scores1.length > 0) {
        const radarMap1 = new Map<
          BenchmarkCategory,
          {
            id: string;
            runId: string;
            category: BenchmarkCategory;
            score: number;
            testCount: number;
            passedCount: number;
          }
        >();
        for (const s of scores1) {
          radarMap1.set(s.category as BenchmarkCategory, {
            id: s.id,
            runId: s.run_id,
            category: s.category as BenchmarkCategory,
            score: s.score,
            testCount: s.test_count,
            passedCount: s.passed_count,
          });
        }
        console.log(`  Run 1 (${comparison.run1.id.substring(0, 8)}):`);
        console.log(generateAsciiRadar(generateRadarData(radarMap1), 40));
      }

      if (scores2.length > 0) {
        const radarMap2 = new Map<
          BenchmarkCategory,
          {
            id: string;
            runId: string;
            category: BenchmarkCategory;
            score: number;
            testCount: number;
            passedCount: number;
          }
        >();
        for (const s of scores2) {
          radarMap2.set(s.category as BenchmarkCategory, {
            id: s.id,
            runId: s.run_id,
            category: s.category as BenchmarkCategory,
            score: s.score,
            testCount: s.test_count,
            passedCount: s.passed_count,
          });
        }
        console.log(`  Run 2 (${comparison.run2.id.substring(0, 8)}):`);
        console.log(generateAsciiRadar(generateRadarData(radarMap2), 40));
      }

      // Flipped tests summary
      if (comparison.flippedTests.length > 0) {
        const improved = comparison.flippedTests.filter((f) => f.nowPass).length;
        const regressed = comparison.flippedTests.filter((f) => !f.nowPass).length;

        console.log("");
        if (improved > 0) {
          console.log(`  ${c.green("+")} ${improved} test(s) now passing`);
        }
        if (regressed > 0) {
          console.log(`  ${c.red("-")} ${regressed} test(s) now failing`);
        }
      }

      console.log("");
    });

  // eval runs - list benchmark run history
  evalCmd
    .command("runs")
    .description("List benchmark run history")
    .option("-n, --limit <number>", "Number of runs to show", "10")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      const limit = parseInt(options.limit, 10) || 10;
      const runs = getRecentRuns(limit);

      if (options.json) {
        console.log(JSON.stringify(runs, null, 2));
        return;
      }

      console.log("");
      printHeader("Benchmark Run History", `${runs.length} runs`);

      if (runs.length === 0) {
        info("No benchmark runs yet");
        console.log(
          `  ${c.dim("Run")} ${c.cyan("pha eval benchmark")} ${c.dim("to execute a benchmark")}\n`
        );
        return;
      }

      printTable(
        ["Run ID", "Date", "Profile", "Tests", "Pass", "Fail", "Score", "Duration"],
        runs.map((run) => {
          const ds = normalizeScoreForDisplay(run.overallScore);
          const scoreColor = ds >= 0.8 ? c.green : ds >= 0.6 ? c.yellow : c.red;
          return [
            c.dim(run.id.substring(0, 8)),
            new Date(run.timestamp).toLocaleDateString(),
            run.profile,
            String(run.totalTestCases),
            c.green(String(run.passedCount)),
            run.failedCount > 0 ? c.red(String(run.failedCount)) : c.dim("0"),
            scoreColor(ds.toFixed(2)),
            formatDuration(run.durationMs),
          ];
        })
      );

      console.log("");
    });

  // eval auto-loop - automated optimization loop
  evalCmd
    .command("auto-loop")
    .description("Run automated optimization loop with Claude Code CLI")
    .option("--max-iterations <n>", "Maximum optimization iterations", "5")
    .option("--target-score <n>", "Target overall score to reach", "85")
    .option("--branch <name>", "Git branch for optimization", "auto-optimize")
    .option("--profile <profile>", "Benchmark profile: quick or full", "quick")
    .option("--regression-threshold <n>", "Max allowed regression in points", "5")
    .option("--provider <string>", "LLM provider")
    .option("--model <string>", "Model ID")
    .action(async (options) => {
      const config = loadConfig();
      const loopProvider = (options.provider || config.llm.provider) as LLMProvider;
      const apiKey = resolveApiKey(config, loopProvider);

      if (!apiKey) {
        fatal("No API key found", "Set an API key in config or environment");
      }

      const tcCount = countTestCases();
      if (tcCount === 0) {
        info("No test cases found. Run seed first.");
        console.log(`  ${c.cyan("pha eval seed")}\n`);
        return;
      }

      console.log("");
      printHeader("Auto-Optimization Loop");

      const loopConfig: AutoLoopConfig = {
        maxIterations: parseInt(options.maxIterations, 10) || 5,
        targetScore: parseInt(options.targetScore, 10) || 85,
        branch: options.branch || "auto-optimize",
        profile: (options.profile || "quick") as BenchmarkProfile,
        regressionThreshold: parseInt(options.regressionThreshold, 10) || 5,
      };

      printKV("Max Iterations", String(loopConfig.maxIterations));
      printKV("Target Score", String(loopConfig.targetScore));
      printKV("Branch", loopConfig.branch);
      printKV("Profile", loopConfig.profile);
      printKV("Regression Threshold", `${loopConfig.regressionThreshold} pts`);
      console.log("");

      warn("This will modify prompt/skill files on a separate git branch");
      console.log(`  ${c.dim("Changes are made on branch:")} ${c.cyan(loopConfig.branch)}`);
      console.log("");

      const loopModelId = options.model || config.llm.modelId;
      const loopBaseUrl = loopProvider === config.llm.provider ? config.llm.baseUrl : undefined;
      const autoLoopMockSource = new MockDataSource();

      const createLoopAgent = async () =>
        createPHAAgent({
          apiKey,
          provider: loopProvider,
          modelId: loopModelId,
          baseUrl: loopBaseUrl,
          dataSource: autoLoopMockSource,
        });

      // Create raw LLM call for evaluation
      let loopRawLLMCall: (prompt: string) => Promise<string>;
      try {
        loopRawLLMCall = createRawLLMCall(loopProvider, loopModelId, apiKey!, loopBaseUrl);
      } catch {
        loopRawLLMCall = async (prompt: string) => {
          const a = await createLoopAgent();
          return a.chatAndWait(prompt);
        };
      }

      const projectRoot = process.cwd();
      const spinner = new Spinner("Starting auto-loop...");

      const autoLoop = new AutoLoop(
        loopConfig,
        {
          agentCall: async (query: string) => {
            const a = await createLoopAgent();
            const response = await a.chatAndWait(query);
            return { response };
          },
          llmCall: loopRawLLMCall,
        },
        projectRoot,
        {
          onIterationStart: (iter, max) => {
            spinner.update(`Iteration ${iter}/${max}...`);
          },
          onBenchmarkComplete: (run) => {
            spinner.update(
              `Benchmark complete: ${normalizeScoreForDisplay(run.overallScore).toFixed(2)}`
            );
          },
          onWeakCategoriesFound: (cats) => {
            const names = cats.map((c) => CATEGORY_LABELS[c.category]).join(", ");
            spinner.update(`Targeting: ${names}`);
          },
          onOptimizationStart: (cat) => {
            spinner.update(`Optimizing: ${CATEGORY_LABELS[cat]}`);
          },
          onLog: (msg) => {
            spinner.update(msg);
          },
        }
      );

      spinner.start();

      try {
        const result = await autoLoop.run();
        spinner.stop("success");

        // Report results
        printSection("Results");
        printKV("Iterations", String(result.iterations));
        printKV("Initial Score", String(result.initialScore));
        printKV("Final Score", String(result.finalScore));

        const delta = result.finalScore - result.initialScore;
        const deltaColor = delta > 0 ? c.green : delta < 0 ? c.red : c.dim;
        printKV("Change", deltaColor(`${delta > 0 ? "+" : ""}${delta.toFixed(1)} pts`));

        if (result.changes.length > 0) {
          printSection("Changes");
          printTable(
            ["Iter", "Category", "Before", "After", "Files", "Kept"],
            result.changes.map((ch) => [
              String(ch.iteration),
              CATEGORY_LABELS[ch.category],
              ch.beforeScore.toFixed(1),
              ch.afterScore.toFixed(1),
              String(ch.filesChanged.length),
              ch.kept ? c.green("YES") : c.red("NO"),
            ])
          );
        }

        console.log("");
        if (result.improved) {
          success(`Score improved from ${result.initialScore} to ${result.finalScore}`);
          console.log(`  ${c.dim("Review changes on branch:")} ${c.cyan(loopConfig.branch)}`);
          console.log(`  ${c.dim("Merge with:")} ${c.cyan(`git merge ${loopConfig.branch}`)}\n`);
        } else {
          info("No net improvement achieved");
          console.log(
            `  ${c.dim("Try running with")} ${c.cyan("--max-iterations 10")} ${c.dim("or")} ${c.cyan("--profile full")}\n`
          );
        }
      } catch (error) {
        spinner.stop("error");
        fatal("Auto-loop failed", error instanceof Error ? error.message : String(error));
      }
    });

  // eval check-regression - check for benchmark regressions
  evalCmd
    .command("check-regression")
    .description("Check for benchmark score regressions (for CI)")
    .option("--threshold <n>", "Minimum score drop to count as regression", "5")
    .option("--base-run <id>", "Specific base run ID to compare against")
    .option("--json", "Output as JSON")
    .option("--markdown", "Output as markdown (for PR comments)")
    .action(async (options) => {
      const report = checkRegression({
        threshold: parseInt(options.threshold, 10) || 5,
        baseRunId: options.baseRun,
      });

      if (options.json) {
        console.log(JSON.stringify(report, null, 2));
        if (report.hasRegression) process.exit(1);
        return;
      }

      if (options.markdown) {
        console.log(formatRegressionMarkdown(report));
        if (report.hasRegression) process.exit(1);
        return;
      }

      console.log("");
      printHeader("Regression Check");

      if (!report.baseRun || !report.currentRun) {
        info(report.summary);
        console.log("");
        return;
      }

      printKV(
        "Base Run",
        `${c.dim(report.baseRun.id.substring(0, 8))} (${normalizeScoreForDisplay(report.baseRun.score).toFixed(2)})`
      );
      printKV(
        "Current Run",
        `${c.dim(report.currentRun.id.substring(0, 8))} (${normalizeScoreForDisplay(report.currentRun.score).toFixed(2)})`
      );

      const deltaColor = report.overallDelta >= 0 ? c.green : c.red;
      printKV(
        "Overall Delta",
        deltaColor(`${report.overallDelta >= 0 ? "+" : ""}${report.overallDelta.toFixed(1)} pts`)
      );

      if (report.categoryRegressions.length > 0) {
        printSection("Category Regressions");
        printTable(
          ["Category", "Base", "Current", "Delta"],
          report.categoryRegressions.map((r) => [
            r.label,
            r.baseScore.toFixed(1),
            r.currentScore.toFixed(1),
            c.red(r.delta.toFixed(1)),
          ])
        );
      }

      if (report.newFailures.length > 0) {
        printSection("Newly Failing Tests");
        for (const fail of report.newFailures) {
          console.log(
            `  ${c.red("FAIL")} ${fail.testCaseId}: ${fail.baseScore} -> ${fail.currentScore}`
          );
        }
      }

      console.log("");
      if (report.hasRegression) {
        fatal("Regression detected", report.summary);
      } else {
        success(report.summary);
        console.log("");
      }
    });

  // eval fix-issue - auto-fix a GitHub issue using worktree
  evalCmd
    .command("fix-issue <issue-number>")
    .description(
      "Auto-fix a GitHub issue by creating a test case and running auto-loop in a worktree"
    )
    .option("--max-iterations <n>", "Max optimization iterations", "3")
    .option("--provider <string>", "LLM provider")
    .option("--model <string>", "Model ID")
    .option("--create-pr", "Create a PR after successful fix")
    .action(async (issueNumberStr, options) => {
      const issueNumber = parseInt(issueNumberStr, 10);
      if (isNaN(issueNumber)) {
        fatal("Invalid issue number", `Expected a number, got: ${issueNumberStr}`);
      }

      console.log("");
      printHeader("Auto-Fix Issue", `#${issueNumber}`);

      // Get issue details
      const spinner = new Spinner("Fetching issue...");
      spinner.start();

      let issueTitle = "";
      let issueBody = "";

      try {
        const { execSync } = await import("child_process");
        const result = execSync(`gh issue view ${issueNumber} --json title,body`, {
          encoding: "utf-8",
          timeout: 15000,
        });
        const parsed = JSON.parse(result);
        issueTitle = parsed.title;
        issueBody = parsed.body;
        spinner.stop("success");
      } catch (error) {
        spinner.stop("error");
        fatal(
          "Failed to fetch issue",
          `Make sure gh CLI is installed and authenticated. Error: ${error instanceof Error ? error.message : String(error)}`
        );
        return;
      }

      printKV("Issue", `#${issueNumber}: ${issueTitle}`);
      console.log("");

      info("This will:");
      console.log(`  1. Create worktree with evolution branch`);
      console.log(`  2. Convert issue to test case`);
      console.log(`  3. Run auto-loop with max ${options.maxIterations} iterations`);
      if (options.createPr) console.log(`  4. Create a PR if improvements are found`);
      console.log("");

      // Run auto-loop using worktree (branch creation happens inside AutoLoop)
      const config = loadConfig();
      const fixProvider = (options.provider || config.llm.provider) as LLMProvider;
      const fixModelId = options.model || config.llm.modelId;
      const apiKey = resolveApiKey(config, fixProvider);

      if (!apiKey) {
        fatal("No API key found", "Set an API key in config or environment");
        return;
      }

      const fixBaseUrl = fixProvider === config.llm.provider ? config.llm.baseUrl : undefined;
      const fixMockSource = new MockDataSource();

      const createFixAgent = async () =>
        createPHAAgent({
          apiKey,
          provider: fixProvider,
          modelId: fixModelId,
          baseUrl: fixBaseUrl,
          dataSource: fixMockSource,
        });

      let fixRawLLMCall: (prompt: string) => Promise<string>;
      try {
        fixRawLLMCall = createRawLLMCall(fixProvider, fixModelId, apiKey!, fixBaseUrl);
      } catch {
        fixRawLLMCall = async (prompt: string) => {
          const a = await createFixAgent();
          return a.chatAndWait(prompt);
        };
      }

      // Convert issue to test case
      const tcSpinner = new Spinner("Converting issue to test case...");
      tcSpinner.start();
      try {
        const { issueToTestCase } = await import("../evolution/issue-to-testcase.js");
        const testCase = await issueToTestCase({
          issueNumber,
          issueTitle,
          issueBody,
          llmCall: fixRawLLMCall,
        });
        const { insertTestCase } = await import("../memory/db.js");
        insertTestCase({
          id: testCase.id,
          category: testCase.category,
          query: testCase.query,
          expected: testCase.expected,
          difficulty: testCase.difficulty,
        });
        tcSpinner.stop("success");
        printKV("Test Case", `${testCase.id} (${testCase.category})`);
        printKV("Query", testCase.query);
      } catch (error) {
        tcSpinner.stop("error");
        warn(
          `Could not convert issue to test case: ${error instanceof Error ? error.message : String(error)}`
        );
        console.log(`  ${c.dim("Continuing with existing test cases...")}\n`);
      }

      const loopSpinner = new Spinner("Running auto-loop in worktree...");
      loopSpinner.start();

      const autoLoop = new AutoLoop(
        {
          maxIterations: parseInt(options.maxIterations, 10) || 3,
          targetScore: 80,
          branch: `auto-fix/issue-${issueNumber}`,
          profile: "quick",
          regressionThreshold: 5,
        },
        {
          agentCall: async (query: string) => {
            const a = await createFixAgent();
            const response = await a.chatAndWait(query);
            return { response };
          },
          llmCall: fixRawLLMCall,
        },
        process.cwd(),
        {
          onLog: (msg) => loopSpinner.update(msg),
        }
      );

      try {
        const result = await autoLoop.run();
        loopSpinner.stop("success");

        // Report results
        printSection("Results");
        printKV("Iterations", String(result.iterations));
        printKV("Initial Score", String(result.initialScore));
        printKV("Final Score", String(result.finalScore));

        const delta = result.finalScore - result.initialScore;
        const deltaColor = delta > 0 ? c.green : delta < 0 ? c.red : c.dim;
        printKV("Change", deltaColor(`${delta > 0 ? "+" : ""}${delta.toFixed(1)} pts`));

        if (result.improved) {
          success(`Score improved: ${result.initialScore} -> ${result.finalScore}`);

          if (options.createPr) {
            const prSpinner = new Spinner("Creating PR...");
            prSpinner.start();
            try {
              const { execSync } = await import("child_process");
              const prResult = execSync(
                `gh pr create --title "fix: Auto-fix issue #${issueNumber}" --body "Automated fix for #${issueNumber}.\n\nScore: ${result.initialScore} → ${result.finalScore}" --head auto-fix/issue-${issueNumber}`,
                { encoding: "utf-8", timeout: 30000 }
              ).trim();
              prSpinner.stop("success");
              console.log(`  ${c.green("PR created:")} ${prResult}`);
            } catch (prError) {
              prSpinner.stop("error");
              warn(
                `Could not create PR: ${prError instanceof Error ? prError.message : String(prError)}`
              );
            }
          } else {
            console.log(
              `\n  ${c.dim("Create a PR with:")} ${c.cyan(`pha eval fix-issue ${issueNumber} --create-pr`)}\n`
            );
          }
        } else {
          info("No improvement achieved. Consider manual review.");
        }
      } catch (error) {
        loopSpinner.stop("error");
        fatal("Auto-fix failed", error instanceof Error ? error.message : String(error));
      }
    });
}
