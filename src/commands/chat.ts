/**
 * Chat command - Single message chat with agent
 */

import type { Command } from "commander";
import { createPHAAgent } from "../agent/index.js";
import {
  loadConfig,
  PROVIDER_CONFIGS,
  resolveAgentModel,
  type LLMProvider,
} from "../utils/config.js";
import { c, icons, Spinner, fatal, info } from "../utils/cli-ui.js";

interface ChatOptions {
  message: string;
  json?: boolean;
  stream?: boolean;
  showTools?: boolean;
}

interface ToolCallRecord {
  tool: string;
  args: unknown;
  result: unknown;
}

interface ChatState {
  response: string;
  toolCalls: ToolCallRecord[];
  currentToolSpinner: Spinner | null;
}

function isStreamingOutput(options: ChatOptions): boolean {
  return options.stream !== false && !options.json;
}

function clearSpinner(state: ChatState): void {
  if (state.currentToolSpinner) {
    state.currentToolSpinner.stop("success");
    state.currentToolSpinner = null;
  }
}

function handleMessageUpdate(
  event: { message: { role: string; content: Array<{ type: string; text?: string }> } },
  options: ChatOptions,
  state: ChatState
): void {
  if (event.message.role !== "assistant") return;

  for (const block of event.message.content) {
    if (block.type !== "text") continue;

    state.response = block.text ?? "";
    if (!isStreamingOutput(options)) continue;

    clearSpinner(state);
    process.stdout.write(`\r\x1b[K${c.cyan("PHA:")} ${state.response}`);
  }
}

function handleMessageEnd(options: ChatOptions, state: ChatState): void {
  clearSpinner(state);
  if (isStreamingOutput(options)) {
    process.stdout.write("\n");
  }
}

function handleToolStart(
  event: { toolName: string; args: unknown },
  options: ChatOptions,
  state: ChatState
): void {
  state.toolCalls.push({ tool: event.toolName, args: event.args, result: null });

  if (options.json) return;

  if (options.showTools) {
    state.currentToolSpinner = new Spinner(`Calling ${event.toolName}...`);
    state.currentToolSpinner.start();
    return;
  }

  if (options.stream !== false) {
    process.stdout.write(
      `\r\x1b[K${c.yellow(icons.running)} ${c.dim(`Using ${event.toolName}...`)}`
    );
  }
}

function handleToolEnd(event: { result: unknown }, state: ChatState): void {
  const lastTool = state.toolCalls[state.toolCalls.length - 1];
  if (lastTool) {
    lastTool.result = event.result;
  }
  clearSpinner(state);
}

function printChatResult(options: ChatOptions, state: ChatState): void {
  if (options.json) {
    console.log(
      JSON.stringify(
        { message: options.message, response: state.response, toolCalls: state.toolCalls },
        null,
        2
      )
    );
    return;
  }

  if (state.toolCalls.length > 0 && !options.showTools) {
    console.log(
      `\n${c.dim(`Used ${state.toolCalls.length} tool(s): ${state.toolCalls.map((t) => t.tool).join(", ")}`)}`
    );
  }
  console.log("");
}

async function handleSingleMessage(
  agent: Awaited<ReturnType<typeof createPHAAgent>>,
  options: ChatOptions,
  providerDisplay: string
): Promise<void> {
  const state: ChatState = {
    response: "",
    toolCalls: [],
    currentToolSpinner: null,
  };

  if (!options.json && !options.stream) {
    console.log(`\n${c.dim("Using")} ${providerDisplay}\n`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eventHandlers: Record<string, (event: any) => void> = {
    message_update: (event) => handleMessageUpdate(event, options, state),
    message_end: () => handleMessageEnd(options, state),
    tool_execution_start: (event) => handleToolStart(event, options, state),
    tool_execution_end: (event) => handleToolEnd(event, state),
  };

  agent.subscribe((event) => {
    const handler = eventHandlers[event.type];
    if (handler) handler(event);
  });

  try {
    await agent.chat(options.message);
    await agent.getAgent().waitForIdle();
    printChatResult(options, state);
  } catch (error) {
    (state.currentToolSpinner as Spinner | null)?.stop("error");
    fatal("Chat failed", error instanceof Error ? error.message : String(error));
  }
}

function showInteractiveHint(): void {
  console.log("");
  info("For interactive chat:");
  console.log(`  ${c.cyan("pha tui --local")} ${c.dim("Start local terminal UI")}`);
  console.log(`  ${c.cyan("pha tui")}         ${c.dim("Connect to gateway")}`);
  console.log("");
  info("For single message:");
  console.log(`  ${c.cyan("pha chat -m")} ${c.dim("'your message here'")}`);
  console.log("");
}

export function registerChatCommand(program: Command): void {
  program
    .command("chat")
    .description("Chat with PHA agent")
    .option("-m, --message <string>", "Send a single message")
    .option("--provider <string>", "LLM provider (anthropic, openai, google)")
    .option("--model <string>", "Model ID")
    .option("--json", "Output as JSON")
    .option("--no-stream", "Disable streaming output")
    .option("--show-tools", "Show tool calls")
    .action(async (options) => {
      const config = loadConfig();
      let resolved;
      try {
        resolved = resolveAgentModel(config);
      } catch (err) {
        fatal(
          "No API key found",
          err instanceof Error ? err.message : "Set an API key in config or environment"
        );
      }

      const provider = options.provider || resolved.provider;
      const providerCfg = PROVIDER_CONFIGS[provider as LLMProvider];
      const agent = await createPHAAgent({
        apiKey: resolved.apiKey,
        provider: provider as LLMProvider,
        modelId: options.model || resolved.modelId,
      });

      if (options.message) {
        await handleSingleMessage(agent, options, providerCfg?.name || provider);
        return;
      }

      showInteractiveHint();
    });
}
