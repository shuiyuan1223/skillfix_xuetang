/**
 * Chat command - Single message chat with agent
 */

import type { Command } from "commander";
import { createPHAAgent } from "@pha/core";
import { loadConfig } from "../utils/config.js";

export function registerChatCommand(program: Command): void {
  program
    .command("chat")
    .description("Chat with PHA agent")
    .option("-m, --message <string>", "Send a single message")
    .option("--provider <string>", "LLM provider (anthropic, openai, google)")
    .option("--model <string>", "Model ID")
    .option("--json", "Output as JSON")
    .option("--no-stream", "Disable streaming output")
    .action(async (options) => {
      const config = loadConfig();
      const provider = options.provider || config.llm.provider;
      const apiKey = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || process.env.GOOGLE_API_KEY;

      if (!apiKey) {
        console.error("Error: No API key found.");
        console.error("Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_API_KEY");
        process.exit(1);
      }

      const agent = createPHAAgent({
        apiKey,
        provider: provider as "anthropic" | "openai" | "google",
        modelId: options.model || config.llm.modelId,
      });

      // Single message mode
      if (options.message) {
        let response = "";
        const toolCalls: Array<{ tool: string; args: unknown; result: unknown }> = [];

        agent.subscribe((event) => {
          if (event.type === "message_update" && event.message.role === "assistant") {
            const content = event.message.content;
            for (const block of content) {
              if ((block as any).type === "text") {
                response = (block as any).text;
                if (options.stream !== false && !options.json) {
                  process.stdout.write(`\r\x1b[K${response}`);
                }
              }
            }
          } else if (event.type === "message_end") {
            if (options.stream !== false && !options.json) {
              process.stdout.write("\n");
            }
          } else if (event.type === "tool_execution_start") {
            toolCalls.push({ tool: event.toolName, args: event.args, result: null });
            if (!options.json) {
              console.log(`\n[Tool: ${event.toolName}]`);
            }
          } else if (event.type === "tool_execution_end") {
            const lastTool = toolCalls[toolCalls.length - 1];
            if (lastTool) {
              lastTool.result = event.result;
            }
          }
        });

        try {
          await agent.chat(options.message);
          await agent.getAgent().waitForIdle();

          if (options.json) {
            console.log(JSON.stringify({
              message: options.message,
              response,
              toolCalls,
            }, null, 2));
          }
        } catch (error) {
          console.error("Error:", error instanceof Error ? error.message : String(error));
          process.exit(1);
        }

        return;
      }

      // Interactive mode - redirect to TUI
      console.log("For interactive chat, use: pha tui --local");
      console.log("Or send a single message with: pha chat -m 'your message'");
    });
}
