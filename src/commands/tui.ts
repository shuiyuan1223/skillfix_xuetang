/**
 * TUI command - Terminal User Interface using pi-tui
 *
 * Full A2UI client: renders all Gateway pages (Chat, Dashboard, Memory,
 * Evolution, Prompts, Skills, Integrations) in the terminal.
 *
 * Navigation via slash commands (/dashboard, /evolution, etc).
 * Actions via numbered selection ([1], [2], ...).
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
  type EditorTheme,
  type MarkdownTheme,
  type SelectListTheme,
} from "@mariozechner/pi-tui";
import {
  renderA2UIToTUI,
  renderNavBar,
  renderActionBar,
  type TUIAction,
} from "../gateway/tui-renderer.js";

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

// Slash command → Gateway view mapping
const SLASH_NAV: Record<string, string> = {
  "/chat": "chat",
  "/dashboard": "dashboard",
  "/health": "dashboard",
  "/memory": "memory",
  "/evolution": "evolution",
  "/prompts": "settings/prompts",
  "/skills": "settings/skills",
  "/integrations": "settings/integrations",
  "/back": "chat",
};

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
  const provider = (
    config.agentModel ? config.agentModel.split("/")[0] : config.llm.provider
  ) as LLMProvider;
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
    } catch {
      // Ignore - gateway startup is async
    }

    let ready = false;
    for (let i = 0; i < 50; i++) {
      await new Promise((r) => setTimeout(r, 200));
      try {
        const check = await fetch(`http://localhost:${port}/health`, {
          signal: AbortSignal.timeout(500),
        });
        if (check.ok) {
          ready = true;
          break;
        }
      } catch {
        // Retry
      }
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
  const chatMessages: ChatMessage[] = [];
  let ws: WebSocket | null = null;
  let connected = false;
  let isProcessing = false;
  let currentAssistantMessage = "";
  let loader: Loader | null = null;

  // View state
  let currentView = "chat";
  let pageActions: TUIAction[] = [];

  // Main content container
  const contentContainer = new Container();

  // Header
  const headerText = new Text(
    `${colors.bold(colors.cyan("PHA"))} ${colors.dim("- Personal Health Agent")}\n` +
      `${colors.dim(`Provider: ${providerCfg?.name || provider}`)}\n` +
      `${colors.dim("Type /help for commands, /quit to exit")}`,
    1,
    0
  );
  contentContainer.addChild(headerText);
  contentContainer.addChild(new Spacer(1));

  // Messages container (for chat mode)
  const messagesContainer = new Container();
  contentContainer.addChild(messagesContainer);

  // Page content container (for non-chat views)
  const pageContainer = new Container();

  // Editor with autocomplete
  const editor = new Editor(tui, editorTheme, { paddingX: 1 });

  // Build autocomplete commands list
  const autocompleteCommands = [
    { name: "quit", description: "Exit the TUI" },
    { name: "exit", description: "Exit the TUI" },
    { name: "clear", description: "Clear chat history" },
    { name: "help", description: "Show available commands" },
    { name: "chat", description: "Switch to Chat" },
    { name: "dashboard", description: "Switch to Dashboard" },
    { name: "health", description: "Switch to Dashboard (vitals)" },
    { name: "memory", description: "Switch to Memory" },
    { name: "evolution", description: "Switch to Evolution Lab" },
    { name: "prompts", description: "Switch to Prompts settings" },
    { name: "skills", description: "Switch to Skills settings" },
    { name: "integrations", description: "Switch to Integrations" },
    { name: "back", description: "Back to Chat" },
  ];

  const autocompleteProvider = new CombinedAutocompleteProvider(
    autocompleteCommands,
    process.cwd()
  );
  editor.setAutocompleteProvider(autocompleteProvider);

  editor.onSubmit = (text) => {
    if (!text.trim()) return;
    if (isProcessing) return;

    const cmd = text.trim();

    // System commands
    if (cmd === "/quit" || cmd === "/exit") {
      cleanup();
      return;
    }

    if (cmd === "/clear") {
      chatMessages.length = 0;
      updateChatMessages();
      editor.setText("");
      tui.requestRender();
      return;
    }

    if (cmd === "/help") {
      showHelp();
      editor.setText("");
      tui.requestRender();
      return;
    }

    // Navigation commands
    const navTarget = SLASH_NAV[cmd];
    if (navTarget) {
      navigateTo(navTarget);
      editor.setText("");
      return;
    }

    // Action number input (works in both chat and page modes)
    if (/^\d+$/.test(cmd) && pageActions.length > 0) {
      const idx = parseInt(cmd) - 1;
      if (idx >= 0 && idx < pageActions.length) {
        const action = pageActions[idx];
        if (ws && connected) {
          ws.send(
            JSON.stringify({
              type: "action",
              action: action.action,
              payload: action.payload,
            })
          );
        }
        editor.setText("");
        return;
      }
    }

    // In chat mode, send as user message
    if (currentView === "chat") {
      addChatMessage("user", cmd);
      editor.setText("");
      editor.disableSubmit = true;
      isProcessing = true;
      currentAssistantMessage = "";

      // Show loader
      loader = new Loader(tui, colors.cyan, colors.dim, "Thinking...");
      contentContainer.addChild(loader);
      loader.start();
      tui.requestRender();

      if (ws && connected) {
        ws.send(JSON.stringify({ type: "user_message", content: cmd }));
      }
      return;
    }

    // In page mode, unrecognized input - show hint
    editor.setText("");
    showToast("Type a number to select an action, or /help for commands");
  };

  // Add to TUI
  tui.addChild(contentContainer);
  tui.addChild(new Spacer(1));
  tui.addChild(editor);
  tui.setFocus(editor);

  // ========================================================================
  // Chat message management
  // ========================================================================

  function addChatMessage(role: "user" | "assistant" | "tool", content: string) {
    chatMessages.push({ role, content });
    updateChatMessages();
  }

  function updateChatMessages() {
    messagesContainer.clear();
    for (const msg of chatMessages) {
      if (msg.role === "user") {
        messagesContainer.addChild(
          new Text(`${colors.green("You")} ${colors.dim("›")} ${msg.content}`, 1, 0)
        );
        messagesContainer.addChild(new Spacer(1));
      } else if (msg.role === "assistant") {
        messagesContainer.addChild(new Text(colors.cyan("Assistant"), 1, 0));
        messagesContainer.addChild(new Markdown(msg.content, 1, 0, markdownTheme));
        messagesContainer.addChild(new Spacer(1));
      } else if (msg.role === "tool") {
        messagesContainer.addChild(
          new Text(`${colors.yellow("Tool")} ${colors.dim("›")} ${msg.content}`, 1, 0)
        );
      }
    }
  }

  function finishResponse() {
    if (loader) {
      loader.stop();
      contentContainer.removeChild(loader);
      loader = null;
    }
    if (currentAssistantMessage) {
      addChatMessage("assistant", currentAssistantMessage);
    }
    currentAssistantMessage = "";
    isProcessing = false;
    editor.disableSubmit = false;
    tui.requestRender();
  }

  // ========================================================================
  // Navigation
  // ========================================================================

  function navigateTo(view: string) {
    currentView = view;
    pageActions = [];

    if (ws && connected) {
      ws.send(JSON.stringify({ type: "navigate", view }));
    }

    // Show loading state
    if (view !== "chat") {
      switchToPageMode();
      pageContainer.clear();
      pageContainer.addChild(new Text(colors.dim("Loading..."), 1, 0));
      tui.requestRender();
    } else {
      switchToChatMode();
      tui.requestRender();
    }
  }

  function switchToChatMode() {
    contentContainer.clear();
    contentContainer.addChild(headerText);
    contentContainer.addChild(new Spacer(1));
    contentContainer.addChild(messagesContainer);
  }

  function switchToPageMode() {
    contentContainer.clear();

    // Nav bar
    const viewLabels = ["chat", "dashboard", "memory", "evolution"];
    const navBar = new Text(renderNavBar(currentView, viewLabels), 1, 0);
    contentContainer.addChild(navBar);
    contentContainer.addChild(new Spacer(1));

    contentContainer.addChild(pageContainer);
  }

  // ========================================================================
  // A2UI Page rendering
  // ========================================================================

  function handlePageMessage(msg: any) {
    const surfaces = msg.surfaces;
    if (!surfaces || !surfaces.main) return;

    const main = surfaces.main;
    const termWidth = tui.terminal.columns || 80;

    // Render A2UI components to terminal text
    const result = renderA2UIToTUI(main.components, main.root_id, termWidth);
    pageActions = result.actions;

    // Detect current view from sidebar if available
    if (surfaces.sidebar) {
      const sidebarResult = renderA2UIToTUI(
        surfaces.sidebar.components,
        surfaces.sidebar.root_id,
        termWidth
      );
      // sidebar rendering is for context only; we don't display it
      void sidebarResult;
    }

    if (currentView === "chat") {
      // In chat mode, page messages update the chat view.
      // Don't switch to page mode - just update messages container
      // since chat page sends page messages too.
      return;
    }

    // Update page content
    switchToPageMode();
    pageContainer.clear();

    // Render page content as Markdown (supports ANSI)
    const pageText = result.lines.join("\n");
    if (pageText.trim()) {
      pageContainer.addChild(new Markdown(pageText, 1, 0, markdownTheme));
    }

    // Action bar
    if (pageActions.length > 0) {
      pageContainer.addChild(new Spacer(1));
      pageContainer.addChild(new Text(renderActionBar(pageActions), 1, 0));
    }

    tui.requestRender();
  }

  // ========================================================================
  // Toast and Modal
  // ========================================================================

  function showToast(message: string) {
    const toastText = new Text(colors.green(`  ${message}`), 0, 0);
    contentContainer.addChild(toastText);
    tui.requestRender();

    setTimeout(() => {
      contentContainer.removeChild(toastText);
      tui.requestRender();
    }, 3000);
  }

  function handleToast(msg: any) {
    const message = msg.message || msg.text || "";
    const variant = msg.variant as string | undefined;

    let formatted: string;
    switch (variant) {
      case "error":
        formatted = colors.red(`  ${message}`);
        break;
      case "warning":
        formatted = colors.yellow(`  ${message}`);
        break;
      default:
        formatted = colors.green(`  ${message}`);
    }

    const toastText = new Text(formatted, 0, 0);
    contentContainer.addChild(toastText);
    tui.requestRender();

    setTimeout(() => {
      contentContainer.removeChild(toastText);
      tui.requestRender();
    }, 3000);
  }

  function handleModal(msg: any) {
    // Render modal content as a bordered overlay-style block
    if (!msg.components || !msg.root_id) return;

    const termWidth = tui.terminal.columns || 80;
    const result = renderA2UIToTUI(msg.components, msg.root_id, termWidth - 4);
    const modalActions = result.actions;

    // Add modal actions to current page actions
    const startNum = pageActions.length;
    for (const action of modalActions) {
      action.number = startNum + action.number;
    }
    pageActions.push(...modalActions);

    const title = msg.title || "Details";
    const border = colors.dim("═".repeat(Math.min(60, termWidth - 4)));

    const modalContainer = new Container();
    modalContainer.addChild(new Spacer(1));
    modalContainer.addChild(new Text(border, 1, 0));
    modalContainer.addChild(new Text(colors.bold(` ${title}`), 1, 0));
    modalContainer.addChild(new Text(border, 1, 0));
    modalContainer.addChild(new Markdown(result.lines.join("\n"), 1, 0, markdownTheme));

    if (modalActions.length > 0) {
      modalContainer.addChild(new Spacer(1));
      modalContainer.addChild(new Text(renderActionBar(modalActions), 1, 0));
    }

    modalContainer.addChild(new Text(border, 1, 0));

    contentContainer.addChild(modalContainer);
    tui.requestRender();
  }

  // ========================================================================
  // Help
  // ========================================================================

  function showHelp() {
    const helpText =
      currentView === "chat"
        ? `**Navigation Commands:**
- \`/dashboard\` - Health Dashboard
- \`/memory\` - Memory & Profile
- \`/evolution\` - Evolution Lab
- \`/prompts\` - Prompt Settings
- \`/skills\` - Skills Settings
- \`/integrations\` - Integrations

**Chat Commands:**
- \`/clear\` - Clear chat history
- \`/quit\` - Exit TUI

**Tips:** Press Enter to send, Alt+Enter for new line
In page views, type a number to trigger an action.`
        : `**Navigation Commands:**
- \`/chat\` - Back to Chat
- \`/dashboard\` - Health Dashboard
- \`/memory\` - Memory & Profile
- \`/evolution\` - Evolution Lab
- \`/prompts\` - Prompt Settings
- \`/skills\` - Skills Settings
- \`/integrations\` - Integrations
- \`/back\` - Back to Chat
- \`/quit\` - Exit TUI

**Actions:** Type a number (e.g. \`1\`) to trigger the corresponding action.`;

    if (currentView === "chat") {
      addChatMessage("assistant", helpText);
    } else {
      pageContainer.clear();
      pageContainer.addChild(new Markdown(helpText, 1, 0, markdownTheme));
      tui.requestRender();
    }
  }

  // ========================================================================
  // Lifecycle
  // ========================================================================

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
    addChatMessage(
      "assistant",
      `Welcome to **PHA**!\n\nAsk me about your health data, sleep, or activity.\nType \`/help\` for navigation commands.`
    );
    tui.requestRender();
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data as string);
      switch (msg.type) {
        case "page":
          handlePageMessage(msg);
          break;

        case "agent_text":
          if (msg.is_final) {
            finishResponse();
          } else {
            currentAssistantMessage = msg.content;
            if (loader) {
              const preview =
                msg.content.length > 60 ? msg.content.substring(0, 60) + "..." : msg.content;
              loader.setMessage(preview);
            }
          }
          break;

        case "tool_call":
          if (loader) loader.setMessage(`Using ${msg.tool}...`);
          break;

        case "modal":
          handleModal(msg);
          break;

        case "toast":
          handleToast(msg);
          break;

        case "error":
          finishResponse();
          addChatMessage("assistant", `**Error:** ${msg.message}`);
          break;
      }
    } catch {
      // Ignore parse errors
    }
  };

  ws.onerror = () => {
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
  await new Promise<void>((resolve) => {
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
  process.stdin.on = function (event: string, listener: (...args: any[]) => void) {
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
