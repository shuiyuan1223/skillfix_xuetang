/**
 * Chat command - Single message chat with agent
 */

import type { Command } from "commander";
import { createPHAAgent } from "../agent/index.js";
import { loadConfig, PROVIDER_CONFIGS, type LLMProvider } from "../utils/config.js";
import { c, icons, Spinner, fatal, info } from "../utils/cli-ui.js";

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
      const provider = options.provider || config.llm.provider;
      const apiKey =
        process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || process.env.GOOGLE_API_KEY;

      if (!apiKey) {
        fatal("No API key found", "Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_API_KEY");
      }

      const providerCfg = PROVIDER_CONFIGS[provider as LLMProvider];
      const agent = await createPHAAgent({
        apiKey,
        provider: provider as "anthropic" | "openai" | "google",
        modelId: options.model || config.llm.modelId,
      });

      // Single message mode
      if (options.message) {
        let response = "";
        const toolCalls: Array<{ tool: string; args: unknown; result: unknown }> = [];
        let currentToolSpinner: Spinner | null = null;

        if (!options.json && !options.stream) {
          console.log(`\n${c.dim("Using")} ${providerCfg?.name || provider}\n`);
        }

        agent.subscribe((event) => {
          if (event.type === "message_update" && event.message.role === "assistant") {
            const content = event.message.content;
            for (const block of content) {
              if ((block as any).type === "text") {
                response = (block as any).text;
                if (options.stream !== false && !options.json) {
                  // Clear spinner if active
                  if (currentToolSpinner) {
                    currentToolSpinner.stop("success");
                    currentToolSpinner = null;
                  }
                  process.stdout.write(`\r\x1b[K${c.cyan("PHA:")} ${response}`);
                }
              }
            }
          } else if (event.type === "message_end") {
            if (currentToolSpinner) {
              currentToolSpinner.stop("success");
              currentToolSpinner = null;
            }
            if (options.stream !== false && !options.json) {
              process.stdout.write("\n");
            }
          } else if (event.type === "tool_execution_start") {
            toolCalls.push({ tool: event.toolName, args: event.args, result: null });
            if (!options.json && options.showTools) {
              currentToolSpinner = new Spinner(`Calling ${event.toolName}...`);
              currentToolSpinner.start();
            } else if (!options.json && options.stream !== false) {
              process.stdout.write(
                `\r\x1b[K${c.yellow(icons.running)} ${c.dim(`Using ${event.toolName}...`)}`
              );
            }
          } else if (event.type === "tool_execution_end") {
            const lastTool = toolCalls[toolCalls.length - 1];
            if (lastTool) {
              lastTool.result = event.result;
            }
            if (currentToolSpinner) {
              currentToolSpinner.stop("success");
              currentToolSpinner = null;
            }
          }
        });

        try {
          await agent.chat(options.message);
          await agent.getAgent().waitForIdle();

          if (options.json) {
            console.log(
              JSON.stringify(
                {
                  message: options.message,
                  response,
                  toolCalls,
                },
                null,
                2
              )
            );
          } else {
            // Show tool summary if any
            if (toolCalls.length > 0 && !options.showTools) {
              console.log(
                `\n${c.dim(`Used ${toolCalls.length} tool(s): ${toolCalls.map((t) => t.tool).join(", ")}`)}`
              );
            }
            console.log("");
          }
        } catch (error) {
          // Stop spinner if active (it's a Spinner | null in closure scope)
          (currentToolSpinner as Spinner | null)?.stop("error");
          fatal("Chat failed", error instanceof Error ? error.message : String(error));
        }

        return;
      }

      // Interactive mode - redirect to TUI
      console.log("");
      info("For interactive chat:");
      console.log(`  ${c.cyan("pha tui --local")} ${c.dim("Start local terminal UI")}`);
      console.log(`  ${c.cyan("pha tui")}         ${c.dim("Connect to gateway")}`);
      console.log("");
      info("For single message:");
      console.log(`  ${c.cyan("pha chat -m")} ${c.dim("'your message here'")}`);
      console.log("");
    });
}
