/**
 * TUI command - Terminal User Interface
 */

import type { Command } from "commander";
import { loadConfig } from "../utils/config.js";
import { createPHAAgent } from "@pha/core";

// ANSI escape codes
const ESC = "\x1b";
const CLEAR = `${ESC}[2J${ESC}[H`;
const BOLD = `${ESC}[1m`;
const DIM = `${ESC}[2m`;
const RESET = `${ESC}[0m`;
const BLUE = `${ESC}[34m`;
const GREEN = `${ESC}[32m`;
const YELLOW = `${ESC}[33m`;
const CYAN = `${ESC}[36m`;
const RED = `${ESC}[31m`;

interface Message {
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  timestamp: Date;
}

export function registerTuiCommand(program: Command): void {
  program
    .command("tui")
    .description("Open terminal UI for interactive chat")
    .option("--url <string>", "Gateway WebSocket URL")
    .option("--local", "Run agent locally (no gateway)")
    .option("--provider <string>", "LLM provider")
    .option("--model <string>", "Model ID")
    .option("--thinking", "Show thinking process")
    .action(async (options) => {
      const config = loadConfig();

      // Header
      console.log(CLEAR);
      console.log(`${BOLD}${BLUE}╔════════════════════════════════════════════════════════════╗${RESET}`);
      console.log(`${BOLD}${BLUE}║${RESET}            ${BOLD}🏥 PHA - Personal Health Agent${RESET}               ${BOLD}${BLUE}║${RESET}`);
      console.log(`${BOLD}${BLUE}╚════════════════════════════════════════════════════════════╝${RESET}`);
      console.log("");

      if (options.local) {
        await runLocalTUI(options, config);
      } else {
        await runGatewayTUI(options, config);
      }
    });
}

async function runLocalTUI(options: any, config: any): Promise<void> {
  const provider = options.provider || config.llm.provider;
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    console.log(`${RED}Error: No API key found.${RESET}`);
    console.log("Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_API_KEY");
    process.exit(1);
  }

  console.log(`${DIM}Mode: Local | Provider: ${provider}${RESET}`);
  console.log(`${DIM}Type 'exit' or 'quit' to leave, 'clear' to clear screen${RESET}`);
  console.log(`${DIM}${"─".repeat(60)}${RESET}\n`);

  const agent = createPHAAgent({
    apiKey,
    provider,
    modelId: options.model || config.llm.modelId,
  });

  const messages: Message[] = [];
  let currentResponse = "";

  // Subscribe to agent events
  agent.subscribe((event) => {
    if (event.type === "message_update" && event.message.role === "assistant") {
      const content = event.message.content;
      for (const block of content) {
        if ((block as any).type === "text") {
          const text = (block as any).text;
          // Clear line and print current response
          process.stdout.write(`\r${ESC}[K${CYAN}PHA: ${RESET}${text}`);
          currentResponse = text;
        }
      }
    } else if (event.type === "message_end" && event.message.role === "assistant") {
      process.stdout.write("\n\n");
      messages.push({ role: "assistant", content: currentResponse, timestamp: new Date() });
      currentResponse = "";
    } else if (event.type === "tool_execution_start") {
      console.log(`\n${YELLOW}[Tool: ${event.toolName}]${RESET}`);
      if (options.thinking && event.args) {
        console.log(`${DIM}${JSON.stringify(event.args, null, 2)}${RESET}`);
      }
    } else if (event.type === "tool_execution_end") {
      if (options.thinking) {
        console.log(`${DIM}Result: ${JSON.stringify(event.result).substring(0, 100)}...${RESET}`);
      }
    }
  });

  // Input loop
  const prompt = `${GREEN}You: ${RESET}`;
  process.stdout.write(prompt);

  for await (const line of console) {
    const input = line.trim();

    if (input === "exit" || input === "quit") {
      console.log(`\n${DIM}Goodbye!${RESET}\n`);
      process.exit(0);
    }

    if (input === "clear") {
      console.log(CLEAR);
      console.log(`${BOLD}${BLUE}PHA Terminal UI${RESET}\n`);
      process.stdout.write(prompt);
      continue;
    }

    if (input === "history") {
      console.log(`\n${BOLD}Chat History:${RESET}`);
      for (const msg of messages) {
        const role = msg.role === "user" ? GREEN : CYAN;
        console.log(`${role}${msg.role}: ${RESET}${msg.content.substring(0, 50)}...`);
      }
      console.log("");
      process.stdout.write(prompt);
      continue;
    }

    if (!input) {
      process.stdout.write(prompt);
      continue;
    }

    messages.push({ role: "user", content: input, timestamp: new Date() });

    try {
      process.stdout.write(`${CYAN}PHA: ${RESET}`);
      await agent.chat(input);
      await agent.getAgent().waitForIdle();
    } catch (error) {
      console.log(`\n${RED}Error: ${error instanceof Error ? error.message : String(error)}${RESET}\n`);
    }

    process.stdout.write(prompt);
  }
}

async function runGatewayTUI(options: any, config: any): Promise<void> {
  const wsUrl = options.url || `ws://localhost:${config.gateway.port}/ws`;

  console.log(`${DIM}Connecting to: ${wsUrl}${RESET}`);
  console.log(`${DIM}Type 'exit' or 'quit' to leave, 'clear' to clear screen${RESET}`);
  console.log(`${DIM}${"─".repeat(60)}${RESET}\n`);

  let ws: WebSocket;
  let connected = false;
  let currentResponse = "";

  try {
    ws = new WebSocket(wsUrl);
  } catch (e) {
    console.log(`${RED}Failed to connect to gateway.${RESET}`);
    console.log(`Make sure the gateway is running: pha gateway start`);
    process.exit(1);
  }

  ws.onopen = () => {
    connected = true;
    console.log(`${GREEN}✓ Connected to gateway${RESET}\n`);
    ws.send(JSON.stringify({ type: "init" }));
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data as string);

      switch (msg.type) {
        case "connected":
          console.log(`${DIM}Session: ${msg.session_id}${RESET}\n`);
          break;

        case "agent_text":
          if (msg.is_final) {
            process.stdout.write("\n\n");
            currentResponse = "";
          } else {
            process.stdout.write(`\r${ESC}[K${CYAN}PHA: ${RESET}${msg.content}`);
            currentResponse = msg.content;
          }
          break;

        case "tool_call":
          console.log(`\n${YELLOW}[Tool: ${msg.tool}]${RESET}`);
          break;

        case "error":
          console.log(`\n${RED}Error: ${msg.message}${RESET}\n`);
          break;

        case "a2ui":
          // Silently ignore A2UI messages in TUI mode
          break;
      }
    } catch (e) {
      // Ignore parse errors
    }
  };

  ws.onerror = () => {
    console.log(`\n${RED}WebSocket error. Is the gateway running?${RESET}`);
    console.log(`Start it with: pha gateway start\n`);
    process.exit(1);
  };

  ws.onclose = () => {
    if (connected) {
      console.log(`\n${DIM}Disconnected from gateway${RESET}\n`);
    }
    process.exit(0);
  };

  // Wait for connection
  await new Promise<void>((resolve) => {
    const check = setInterval(() => {
      if (connected) {
        clearInterval(check);
        resolve();
      }
    }, 100);
  });

  // Input loop
  const prompt = `${GREEN}You: ${RESET}`;
  process.stdout.write(prompt);

  for await (const line of console) {
    const input = line.trim();

    if (input === "exit" || input === "quit") {
      ws.close();
      console.log(`\n${DIM}Goodbye!${RESET}\n`);
      process.exit(0);
    }

    if (input === "clear") {
      console.log(CLEAR);
      console.log(`${BOLD}${BLUE}PHA Terminal UI${RESET}\n`);
      process.stdout.write(prompt);
      continue;
    }

    if (!input) {
      process.stdout.write(prompt);
      continue;
    }

    ws.send(JSON.stringify({ type: "user_message", content: input }));
    process.stdout.write(`${CYAN}PHA: ${RESET}`);

    // Wait for response to complete
    await new Promise<void>((resolve) => {
      const checkDone = setInterval(() => {
        if (currentResponse === "") {
          // Response complete
          setTimeout(() => {
            clearInterval(checkDone);
            resolve();
          }, 100);
        }
      }, 100);
    });

    process.stdout.write(prompt);
  }
}
