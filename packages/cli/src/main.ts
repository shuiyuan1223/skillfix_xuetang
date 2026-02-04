#!/usr/bin/env bun
/**
 * PHA CLI
 *
 * Command line interface for Personal Health Agent.
 */

import { Command } from "commander";
import {
  startGateway,
  createPHAAgent,
  getDataSource,
  mcpHandler,
  traceCollector,
  Evaluator,
  analyzer,
  Optimizer,
  getSystemPrompt,
} from "@pha/core";

const program = new Command();

program
  .name("pha")
  .description("Personal Health Agent - AI-powered health management")
  .version("0.1.0");

// Start command - starts the gateway server
program
  .command("start")
  .description("Start the PHA gateway server")
  .option("-p, --port <number>", "Port to listen on", "8000")
  .option("--provider <string>", "LLM provider (anthropic, openai, google)", "anthropic")
  .option("--model <string>", "Model ID")
  .action(async (options) => {
    const port = parseInt(options.port, 10);
    const config = {
      port,
      provider: options.provider as "anthropic" | "openai" | "google",
      modelId: options.model,
      apiKey: process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || process.env.GOOGLE_API_KEY,
    };

    console.log(`Starting PHA Gateway on port ${port}...`);
    console.log(`Provider: ${config.provider}`);
    if (config.modelId) {
      console.log(`Model: ${config.modelId}`);
    }

    startGateway(config);

    console.log("\nEndpoints:");
    console.log("  GET  /health          - Health check");
    console.log("  POST /mcp/tools/list  - List MCP tools");
    console.log("  POST /mcp/tools/call  - Call MCP tool");
    console.log("  GET  /api/health/*    - Health data REST API");
    console.log("  WS   /ws              - WebSocket (A2UI)");
    console.log("\nPress Ctrl+C to stop.");
  });

// Chat command - interactive chat with the agent
program
  .command("chat")
  .description("Start interactive chat with PHA")
  .option("--provider <string>", "LLM provider (anthropic, openai, google)", "anthropic")
  .option("--model <string>", "Model ID")
  .action(async (options) => {
    const config = {
      provider: options.provider as "anthropic" | "openai" | "google",
      modelId: options.model,
      apiKey: process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || process.env.GOOGLE_API_KEY,
    };

    if (!config.apiKey) {
      console.error("Error: No API key found. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_API_KEY.");
      process.exit(1);
    }

    console.log("Starting PHA Chat...");
    console.log(`Provider: ${config.provider}`);
    console.log('Type "exit" or "quit" to end the conversation.\n');

    const agent = createPHAAgent(config);

    // Subscribe to agent events for streaming output
    agent.subscribe((event) => {
      if (event.type === "message_update" && event.message.role === "assistant") {
        const content = event.message.content;
        for (const block of content) {
          if ((block as any).type === "text") {
            process.stdout.write(`\r\x1b[K${(block as any).text}`);
          }
        }
      } else if (event.type === "message_end" && event.message.role === "assistant") {
        process.stdout.write("\n\n");
      } else if (event.type === "tool_execution_start") {
        console.log(`\n[Tool: ${event.toolName}]`);
      }
    });

    // Use Bun's built-in prompt
    const prompt = "You: ";
    process.stdout.write(prompt);

    for await (const line of console) {
      const trimmed = line.trim();

      if (trimmed === "exit" || trimmed === "quit") {
        console.log("Goodbye!");
        process.exit(0);
      }

      if (!trimmed) {
        process.stdout.write(prompt);
        continue;
      }

      try {
        process.stdout.write("PHA: ");
        await agent.chat(trimmed);
        await agent.getAgent().waitForIdle();
      } catch (error) {
        console.error("\nError:", error instanceof Error ? error.message : String(error));
      }

      process.stdout.write(prompt);
    }
  });

// Health command - quick health summary
program
  .command("health")
  .description("Get today's health summary")
  .option("-d, --date <string>", "Date in YYYY-MM-DD format", "today")
  .action(async (options) => {
    const dataSource = getDataSource();

    const date = options.date === "today"
      ? new Date().toISOString().split("T")[0]
      : options.date;

    console.log(`\nHealth Summary for ${date}\n`);

    const [metrics, heartRate, sleep, workouts] = await Promise.all([
      dataSource.getMetrics(date),
      dataSource.getHeartRate(date),
      dataSource.getSleep(date),
      dataSource.getWorkouts(date),
    ]);

    console.log("Activity:");
    console.log(`  Steps: ${metrics.steps.toLocaleString()}`);
    console.log(`  Calories: ${metrics.calories.toLocaleString()} kcal`);
    console.log(`  Active: ${metrics.activeMinutes} min`);
    console.log(`  Distance: ${(metrics.distance / 1000).toFixed(2)} km`);

    console.log("\nHeart Rate:");
    console.log(`  Resting: ${heartRate.restingAvg} bpm`);
    console.log(`  Range: ${heartRate.minToday} - ${heartRate.maxToday} bpm`);

    if (sleep) {
      console.log("\nSleep:");
      console.log(`  Duration: ${sleep.durationHours} hours`);
      console.log(`  Quality: ${sleep.qualityScore}%`);
      console.log(`  Time: ${sleep.bedTime} - ${sleep.wakeTime}`);
    } else {
      console.log("\nSleep: No data available");
    }

    if (workouts.length > 0) {
      console.log("\nWorkouts:");
      for (const w of workouts) {
        console.log(`  - ${w.type}: ${w.durationMinutes} min, ${w.caloriesBurned} kcal`);
      }
    } else {
      console.log("\nWorkouts: None recorded");
    }

    console.log("");
  });

// Tools command - list available MCP tools
program
  .command("tools")
  .description("List available MCP tools")
  .action(async () => {
    const tools = mcpHandler.listTools();

    console.log("\nAvailable MCP Tools:\n");
    for (const tool of tools) {
      console.log(`  ${tool.name}`);
      console.log(`    ${tool.description}`);
      const props = tool.inputSchema.properties;
      if (Object.keys(props).length > 0) {
        console.log(`    Parameters: ${Object.keys(props).join(", ")}`);
      }
      console.log("");
    }
  });

// Eval command group - self-evolution system
const evalCmd = program
  .command("eval")
  .description("Self-evolution evaluation system");

// Show traces
evalCmd
  .command("traces")
  .description("Show recorded traces")
  .option("-n, --limit <number>", "Limit number of traces", "10")
  .action(async (options) => {
    const traces = traceCollector.getAllTraces();
    const limit = parseInt(options.limit, 10);

    console.log(`\nRecorded Traces (${traces.length} total, showing ${Math.min(limit, traces.length)}):\n`);

    const recent = traces.slice(-limit);
    for (const trace of recent) {
      console.log(`  [${new Date(trace.timestamp).toISOString()}]`);
      console.log(`    User: ${trace.userMessage.substring(0, 50)}...`);
      console.log(`    Response: ${trace.agentResponse.substring(0, 50)}...`);
      console.log(`    Tools: ${trace.toolCalls?.map(t => t.tool).join(", ") || "none"}`);
      console.log("");
    }
  });

// Run evaluation
evalCmd
  .command("run")
  .description("Run evaluation on traces")
  .option("--provider <string>", "LLM provider", "anthropic")
  .option("--model <string>", "Model ID")
  .action(async (options) => {
    const apiKey = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error("Error: No API key found for evaluation.");
      process.exit(1);
    }

    const traces = traceCollector.getAllTraces();
    if (traces.length === 0) {
      console.log("\nNo traces to evaluate. Use 'pha chat' first to generate traces.\n");
      return;
    }

    console.log(`\nEvaluating ${traces.length} traces...\n`);

    // Create a simple LLM call function for the evaluator
    const agent = createPHAAgent({
      apiKey,
      provider: options.provider as "anthropic" | "openai" | "google",
      modelId: options.model,
    });

    const evaluator = new Evaluator({
      llmCall: async (prompt: string) => {
        return await agent.chatAndWait(prompt);
      },
    });

    const results = await evaluator.evaluateTraces(traces);

    // Show results
    console.log("Evaluation Results:\n");
    for (const result of results) {
      console.log(`  Trace: ${result.traceId}`);
      console.log(`    Overall: ${result.overallScore}/100`);
      console.log(`    Accuracy: ${result.scores.accuracy}, Relevance: ${result.scores.relevance}`);
      console.log(`    Helpfulness: ${result.scores.helpfulness}, Safety: ${result.scores.safety}`);
      if (result.issues.length > 0) {
        console.log(`    Issues: ${result.issues.map(i => i.type).join(", ")}`);
      }
      console.log("");
    }

    // Run analysis
    const analysis = analyzer.analyze(results);
    console.log("Analysis Summary:");
    console.log(`  Average Score: ${analysis.metrics.averageScore}/100`);
    console.log(`  Trend: ${analysis.metrics.improvementTrend > 0 ? "Improving" : analysis.metrics.improvementTrend < 0 ? "Declining" : "Stable"}`);

    if (analysis.weaknesses.length > 0) {
      console.log("\n  Weaknesses:");
      for (const weakness of analysis.weaknesses) {
        console.log(`    - ${weakness.category}: ${weakness.description} (${weakness.impact} impact)`);
      }
    }

    console.log("");
  });

// Generate optimization suggestions
evalCmd
  .command("optimize")
  .description("Generate optimization suggestions")
  .option("--apply", "Apply the suggestions")
  .action(async (options) => {
    console.log("\nOptimization suggestions generation requires running 'pha eval run' first.");
    console.log("This feature will analyze recent evaluations and suggest prompt improvements.\n");

    if (options.apply) {
      console.log("Note: --apply will automatically apply validated suggestions to the system prompt.\n");
    }
  });

program.parse();
