/**
 * TUI command - Terminal User Interface using pi-tui
 */

import type { Command } from "commander";
import { loadConfig, PROVIDER_CONFIGS, type LLMProvider } from "../utils/config.js";
import {
  TUI,
  ProcessTerminal,
  Editor,
  Markdown,
  Text,
  Loader,
  Container,
  Spacer,
  CombinedAutocompleteProvider,
  matchesKey,
  Key,
  type EditorTheme,
  type MarkdownTheme,
  type SelectListTheme,
} from "@mariozechner/pi-tui";

// Theme colors
const colors = {
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  magenta: (s: string) => `\x1b[35m${s}\x1b[0m`,
  blue: (s: string) => `\x1b[34m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  gray: (s: string) => `\x1b[90m${s}\x1b[0m`,
  white: (s: string) => `\x1b[37m${s}\x1b[0m`,
  bgGray: (s: string) => `\x1b[48;5;236m${s}\x1b[0m`,
};

// Markdown theme
const markdownTheme: MarkdownTheme = {
  heading: (s) => colors.bold(colors.cyan(s)),
  link: (s) => colors.blue(s),
  linkUrl: (s) => colors.dim(s),
  code: (s) => colors.yellow(s),
  codeBlock: (s) => s,
  codeBlockBorder: (s) => colors.dim(s),
  quote: (s) => colors.dim(s),
  quoteBorder: (s) => colors.dim(s),
  hr: (s) => colors.dim(s),
  listBullet: (s) => colors.cyan(s),
  bold: (s) => colors.bold(s),
  italic: (s) => `\x1b[3m${s}\x1b[0m`,
  strikethrough: (s) => `\x1b[9m${s}\x1b[0m`,
  underline: (s) => `\x1b[4m${s}\x1b[0m`,
};

// SelectList theme
const selectListTheme: SelectListTheme = {
  selectedPrefix: (s: string) => colors.cyan(s),
  selectedText: (s: string) => colors.bgGray(colors.white(s)),
  description: (s: string) => colors.dim(s),
  scrollInfo: (s: string) => colors.dim(s),
  noMatch: (s: string) => colors.dim(s),
};

// Editor theme
const editorTheme: EditorTheme = {
  borderColor: (s) => colors.dim(s),
  selectList: selectListTheme,
};

interface ChatMessage {
  role: "user" | "assistant" | "tool";
  content: string;
}


export function registerTuiCommand(program: Command): void {
  program
    .command("tui")
    .description("Open terminal UI for interactive chat")
    .option("--url <string>", "Gateway WebSocket URL")
    .action(async (options) => {
      const config = loadConfig();
      await runTUI(options, config);
    });
}

async function runTUI(options: any, config: any): Promise<void> {
  const port = config.gateway.port;
  const wsUrl = options.url || `ws://localhost:${port}/ws`;
  const provider = config.llm.provider as LLMProvider;
  const providerCfg = PROVIDER_CONFIGS[provider];

  // Check gateway first (before starting TUI)
  try {
    const healthCheck = await fetch(`http://localhost:${port}/health`, {
      signal: AbortSignal.timeout(1000),
    });
    if (!healthCheck.ok) throw new Error("not healthy");
  } catch {
    console.log("Gateway not running, starting...");
    const { execSync } = await import("child_process");
    try {
      execSync("pha start --no-open", { stdio: "ignore", timeout: 10000 });
    } catch {}

    let ready = false;
    for (let i = 0; i < 50; i++) {
      await new Promise((r) => setTimeout(r, 200));
      try {
        const check = await fetch(`http://localhost:${port}/health`, {
          signal: AbortSignal.timeout(500),
        });
        if (check.ok) { ready = true; break; }
      } catch {}
    }
    if (!ready) {
      console.error("Failed to start gateway");
      process.exit(1);
    }
    console.log("Gateway started");
  }

  // Create terminal and TUI
  const terminal = new ProcessTerminal();
  const tui = new TUI(terminal);

  // State
  const messages: ChatMessage[] = [];
  let ws: WebSocket | null = null;
  let connected = false;
  let isProcessing = false;
  let currentAssistantMessage = "";
  let loader: Loader | null = null;

  // Chat container
  const chatContainer = new Container();

  // Header
  const header = new Text(
    `${colors.bold(colors.cyan("PHA Chat"))} ${colors.dim("- Personal Health Agent")}\n` +
    `${colors.dim(`Provider: ${providerCfg?.name || provider}`)}\n` +
    `${colors.dim("Type /help for commands, /quit to exit")}`,
    1, 0
  );
  chatContainer.addChild(header);
  chatContainer.addChild(new Spacer(1));

  // Messages container
  const messagesContainer = new Container();
  chatContainer.addChild(messagesContainer);

  // Editor with autocomplete
  const editor = new Editor(tui, editorTheme, { paddingX: 1 });

  // Set up slash command autocomplete
  const autocompleteProvider = new CombinedAutocompleteProvider(
    [
      { name: "quit", description: "Exit the TUI" },
      { name: "exit", description: "Exit the TUI" },
      { name: "clear", description: "Clear chat history" },
      { name: "help", description: "Show available commands" },
    ],
    process.cwd()
  );
  editor.setAutocompleteProvider(autocompleteProvider);

  editor.onSubmit = (text) => {
    if (!text.trim()) return;
    if (isProcessing) return;

    const cmd = text.trim();

    if (cmd === "/quit" || cmd === "/exit") {
      cleanup();
      return;
    }

    if (cmd === "/clear") {
      messages.length = 0;
      updateMessages();
      editor.setText("");
      tui.requestRender();
      return;
    }

    if (cmd === "/help") {
      addMessage("assistant", `**Commands:**
- \`/quit\` - Exit
- \`/clear\` - Clear chat
- \`/help\` - Show help

**Tips:** Press Enter to send, Alt+Enter for new line`);
      editor.setText("");
      tui.requestRender();
      return;
    }

    // Send message
    addMessage("user", cmd);
    editor.setText("");
    editor.disableSubmit = true;
    isProcessing = true;
    currentAssistantMessage = "";

    // Show loader
    loader = new Loader(tui, colors.cyan, colors.dim, "Thinking...");
    chatContainer.addChild(loader);
    loader.start();
    tui.requestRender();

    if (ws && connected) {
      ws.send(JSON.stringify({ type: "user_message", content: cmd }));
    }
  };

  // Add to TUI
  tui.addChild(chatContainer);
  tui.addChild(new Spacer(1));
  tui.addChild(editor);
  tui.setFocus(editor);

  function addMessage(role: "user" | "assistant" | "tool", content: string) {
    messages.push({ role, content });
    updateMessages();
  }

  function updateMessages() {
    messagesContainer.clear();
    for (const msg of messages) {
      if (msg.role === "user") {
        messagesContainer.addChild(new Text(`${colors.green("You")} ${colors.dim("›")} ${msg.content}`, 1, 0));
        messagesContainer.addChild(new Spacer(1));
      } else if (msg.role === "assistant") {
        messagesContainer.addChild(new Text(colors.cyan("Assistant"), 1, 0));
        messagesContainer.addChild(new Markdown(msg.content, 1, 0, markdownTheme));
        messagesContainer.addChild(new Spacer(1));
      } else if (msg.role === "tool") {
        messagesContainer.addChild(new Text(`${colors.yellow("Tool")} ${colors.dim("›")} ${msg.content}`, 1, 0));
      }
    }
  }

  function finishResponse() {
    if (loader) {
      loader.stop();
      chatContainer.removeChild(loader);
      loader = null;
    }
    if (currentAssistantMessage) {
      addMessage("assistant", currentAssistantMessage);
    }
    currentAssistantMessage = "";
    isProcessing = false;
    editor.disableSubmit = false;
    tui.requestRender();
  }

  let tuiStarted = false;

  function cleanup() {
    if (loader) loader.stop();
    if (ws && ws.readyState === WebSocket.OPEN) ws.close();
    if (tuiStarted) tui.stop();
    process.exit(0);
  }

  // Handle Ctrl+C
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  // Connect WebSocket
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    connected = true;
    ws!.send(JSON.stringify({ type: "init" }));
    addMessage("assistant", `Welcome to **PHA Chat**!\n\nAsk me about your health data, sleep, or activity.`);
    tui.requestRender();
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data as string);
      switch (msg.type) {
        case "agent_text":
          if (msg.is_final) {
            finishResponse();
          } else {
            currentAssistantMessage = msg.content;
            if (loader) {
              const preview = msg.content.length > 60 ? msg.content.substring(0, 60) + "..." : msg.content;
              loader.setMessage(preview);
            }
          }
          break;
        case "tool_call":
          if (loader) loader.setMessage(`Using ${msg.tool}...`);
          break;
        case "error":
          finishResponse();
          addMessage("assistant", `**Error:** ${msg.message}`);
          break;
      }
    } catch {}
  };

  ws.onerror = (err) => {
    if (!connected) {
      console.error("WebSocket connection failed");
      process.exit(1);
    }
  };

  ws.onclose = () => {
    if (connected) {
      cleanup();
    }
  };

  // Wait for connection with timeout
  const connectionTimeout = 5000;
  const startTime = Date.now();
  await new Promise<void>((resolve, reject) => {
    const check = setInterval(() => {
      if (connected) {
        clearInterval(check);
        resolve();
      } else if (Date.now() - startTime > connectionTimeout) {
        clearInterval(check);
        console.error("WebSocket connection timeout");
        process.exit(1);
      }
    }, 50);
  });

  // Handle Ctrl+C at raw input level (before pi-tui processes it)
  const originalStdinOn = process.stdin.on.bind(process.stdin);
  process.stdin.on = function(event: string, listener: (...args: any[]) => void) {
    if (event === "data") {
      const wrappedListener = (data: Buffer | string) => {
        const str = data.toString();
        // Check for Ctrl+C (\x03)
        if (str.includes("\x03")) {
          cleanup();
          return;
        }
        listener(data);
      };
      return originalStdinOn(event, wrappedListener);
    }
    return originalStdinOn(event, listener);
  } as typeof process.stdin.on;

  // Start TUI (this blocks and handles input)
  tuiStarted = true;
  tui.start();
}
