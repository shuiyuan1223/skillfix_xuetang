/**
 * TUI command - Terminal User Interface using pi-tui
 *
 * Full A2UI client: renders all Gateway pages (Chat, Dashboard, Memory,
 * Evolution, Prompts, Skills, Integrations) in the terminal.
 *
 * Navigation via slash commands (/dashboard, /evolution, etc).
 * Actions via numbered selection ([1], [2], ...).
 *
 * Transport: HTTP+SSE (POST /api/a2ui/init, POST /api/a2ui/action, GET /api/a2ui/events)
 */

import type { Command } from "commander";
import { loadConfig, PROVIDER_CONFIGS, type LLMProvider, type PHAConfig } from "../utils/config.js";
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

interface A2UIPage {
  components: unknown[];
  root_id: string;
}

interface GatewayMessage {
  type: string;
  is_final?: boolean;
  content?: string;
  tool?: string;
  message?: string;
  text?: string;
  variant?: string;
  surfaces?: { main?: A2UIPage; sidebar?: A2UIPage };
  components?: unknown[];
  root_id?: string;
  title?: string;
}

/** Shared mutable state for the TUI session */
interface TUIContext {
  baseUrl: string;
  tui: TUI;
  editor: Editor;
  chatMessages: ChatMessage[];
  connected: boolean;
  isProcessing: boolean;
  currentAssistantMessage: string;
  loader: Loader | null;
  sessionId: string;
  sseAbortController: AbortController | null;
  currentView: string;
  pageActions: TUIAction[];
  contentContainer: Container;
  headerText: Text;
  messagesContainer: Container;
  pageContainer: Container;
  processMessage: (msg: GatewayMessage) => void;
  addChatMessage: (role: "user" | "assistant" | "tool", content: string) => void;
  finishResponse: () => void;
}

function createTransportHelpers(ctx: TUIContext): {
  sendAction: (action: string, payload?: Record<string, unknown>) => Promise<void>;
  sendNavigate: (view: string) => Promise<void>;
  sendUserMessage: (content: string) => Promise<void>;
  startSSE: () => Promise<void>;
} {
  function processUpdates(updates: unknown[]): void {
    for (const msg of updates) ctx.processMessage(msg as GatewayMessage);
  }

  async function sendAction(action: string, payload?: Record<string, unknown>): Promise<void> {
    try {
      const res = await fetch(`${ctx.baseUrl}/api/a2ui/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "action", action, payload, sessionId: ctx.sessionId }),
      });
      const result = (await res.json()) as { updates: unknown[] };
      processUpdates(result.updates);
    } catch {
      // Ignore fetch errors
    }
  }

  async function sendNavigate(view: string): Promise<void> {
    try {
      const res = await fetch(`${ctx.baseUrl}/api/a2ui/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "navigate", view, sessionId: ctx.sessionId }),
      });
      const result = (await res.json()) as { updates: unknown[] };
      processUpdates(result.updates);
    } catch {
      // Ignore fetch errors
    }
  }

  async function sendUserMessage(content: string): Promise<void> {
    try {
      const res = await fetch(`${ctx.baseUrl}/api/a2ui/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "user_message",
          payload: { content },
          sessionId: ctx.sessionId,
        }),
      });
      const result = (await res.json()) as { updates: unknown[] };
      processUpdates(result.updates);
    } catch {
      // Ignore fetch errors
    }
  }

  async function startSSE(): Promise<void> {
    ctx.sseAbortController = new AbortController();
    try {
      const res = await fetch(`${ctx.baseUrl}/api/a2ui/events?sessionId=${ctx.sessionId}`, {
        signal: ctx.sseAbortController.signal,
      });
      if (!res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const msg = JSON.parse(line.slice(6));
              ctx.processMessage(msg);
            } catch {
              /* skip unparseable SSE data */
            }
          }
        }
      }
    } catch (e: unknown) {
      if ((e as { name?: string })?.name !== "AbortError") {
        if (ctx.connected) setTimeout(() => startSSE(), 1000);
      }
    }
  }

  return { sendAction, sendNavigate, sendUserMessage, startSSE };
}

function setupEditorSubmit(
  ctx: TUIContext,
  transport: ReturnType<typeof createTransportHelpers>,
  navigateTo: (view: string) => void,
  showToast: (message: string) => void,
  cleanup: () => void,
  showHelp: () => void
): void {
  ctx.editor.onSubmit = (text) => {
    if (!text.trim() || ctx.isProcessing) return;
    const cmd = text.trim();

    if (cmd === "/quit" || cmd === "/exit") {
      cleanup();
      return;
    }
    if (cmd === "/clear") {
      ctx.chatMessages.length = 0;
      updateChatMessages(ctx);
      ctx.editor.setText("");
      ctx.tui.requestRender();
      return;
    }
    if (cmd === "/help") {
      showHelp();
      ctx.editor.setText("");
      ctx.tui.requestRender();
      return;
    }

    const navTarget = SLASH_NAV[cmd];
    if (navTarget) {
      navigateTo(navTarget);
      ctx.editor.setText("");
      return;
    }

    if (/^\d+$/.test(cmd) && ctx.pageActions.length > 0) {
      const idx = parseInt(cmd, 10) - 1;
      if (idx >= 0 && idx < ctx.pageActions.length) {
        const action = ctx.pageActions[idx];
        transport.sendAction(action.action, action.payload);
        ctx.editor.setText("");
        return;
      }
    }

    if (ctx.currentView === "chat") {
      ctx.addChatMessage("user", cmd);
      ctx.editor.setText("");
      ctx.editor.disableSubmit = true;
      ctx.isProcessing = true;
      ctx.currentAssistantMessage = "";
      ctx.loader = new Loader(ctx.tui, colors.cyan, colors.dim, "Thinking...");
      ctx.contentContainer.addChild(ctx.loader);
      ctx.loader.start();
      ctx.tui.requestRender();
      transport.sendUserMessage(cmd);
      return;
    }

    ctx.editor.setText("");
    showToast("Type a number to select an action, or /help for commands");
  };
}

function updateChatMessages(ctx: TUIContext): void {
  ctx.messagesContainer.clear();
  for (const msg of ctx.chatMessages) {
    if (msg.role === "user") {
      ctx.messagesContainer.addChild(
        new Text(`${colors.green("You")} ${colors.dim(">")} ${msg.content}`, 1, 0)
      );
      ctx.messagesContainer.addChild(new Spacer(1));
    } else if (msg.role === "assistant") {
      ctx.messagesContainer.addChild(new Text(colors.cyan("Assistant"), 1, 0));
      ctx.messagesContainer.addChild(new Markdown(msg.content, 1, 0, markdownTheme));
      ctx.messagesContainer.addChild(new Spacer(1));
    } else if (msg.role === "tool") {
      ctx.messagesContainer.addChild(
        new Text(`${colors.yellow("Tool")} ${colors.dim(">")} ${msg.content}`, 1, 0)
      );
    }
  }
}

function switchToChatMode(ctx: TUIContext): void {
  ctx.contentContainer.clear();
  ctx.contentContainer.addChild(ctx.headerText);
  ctx.contentContainer.addChild(new Spacer(1));
  ctx.contentContainer.addChild(ctx.messagesContainer);
}

function switchToPageMode(ctx: TUIContext): void {
  ctx.contentContainer.clear();
  const viewLabels = ["chat", "dashboard", "memory", "evolution"];
  const navBar = new Text(renderNavBar(ctx.currentView, viewLabels), 1, 0);
  ctx.contentContainer.addChild(navBar);
  ctx.contentContainer.addChild(new Spacer(1));
  ctx.contentContainer.addChild(ctx.pageContainer);
}

function handlePageMessage(ctx: TUIContext, msg: GatewayMessage): void {
  const surfaces = msg.surfaces;
  if (!surfaces || !surfaces.main) return;

  const main = surfaces.main;
  const termWidth = ctx.tui.terminal.columns || 80;
  const result = renderA2UIToTUI(main.components, main.root_id, termWidth);
  ctx.pageActions = result.actions;

  if (surfaces.sidebar) {
    renderA2UIToTUI(surfaces.sidebar.components, surfaces.sidebar.root_id, termWidth);
  }

  if (ctx.currentView === "chat") return;

  switchToPageMode(ctx);
  ctx.pageContainer.clear();
  const pageText = result.lines.join("\n");
  if (pageText.trim()) {
    ctx.pageContainer.addChild(new Markdown(pageText, 1, 0, markdownTheme));
  }
  if (ctx.pageActions.length > 0) {
    ctx.pageContainer.addChild(new Spacer(1));
    ctx.pageContainer.addChild(new Text(renderActionBar(ctx.pageActions), 1, 0));
  }
  ctx.tui.requestRender();
}

function showToastMessage(ctx: TUIContext, message: string, variant?: string): void {
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
  ctx.contentContainer.addChild(toastText);
  ctx.tui.requestRender();
  setTimeout(() => {
    ctx.contentContainer.removeChild(toastText);
    ctx.tui.requestRender();
  }, 3000);
}

function handleModal(ctx: TUIContext, msg: GatewayMessage): void {
  if (!msg.components || !msg.root_id) return;
  const termWidth = ctx.tui.terminal.columns || 80;
  const result = renderA2UIToTUI(msg.components, msg.root_id, termWidth - 4);
  const modalActions = result.actions;

  const startNum = ctx.pageActions.length;
  for (const action of modalActions) action.number = startNum + action.number;
  ctx.pageActions.push(...modalActions);

  const title = msg.title || "Details";
  const border = colors.dim("=".repeat(Math.min(60, termWidth - 4)));

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
  ctx.contentContainer.addChild(modalContainer);
  ctx.tui.requestRender();
}

// Slash command -> Gateway view mapping
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
    .option("--port <number>", "Gateway port number")
    .action(async (options) => {
      const config = loadConfig();
      await runTUI(options, config);
    });
}

async function ensureGatewayRunning(baseUrl: string): Promise<void> {
  try {
    const healthCheck = await fetch(`${baseUrl}/health`, {
      signal: AbortSignal.timeout(1000),
    });
    if (!healthCheck.ok) throw new Error("not healthy");
    return;
  } catch {
    // Gateway not running, start it
  }

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
      const check = await fetch(`${baseUrl}/health`, {
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

function buildAutocompleteCommands(): Array<{ name: string; description: string }> {
  return [
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
}

function createTUIComponents(providerLabel: string): {
  tui: TUI;
  contentContainer: Container;
  headerText: Text;
  messagesContainer: Container;
  pageContainer: Container;
  editor: Editor;
} {
  const terminal = new ProcessTerminal();
  const tui = new TUI(terminal);
  const contentContainer = new Container();
  const headerText = new Text(
    `${colors.bold(colors.cyan("PHA"))} ${colors.dim("- Personal Health Agent")}\n` +
      `${colors.dim(`Provider: ${providerLabel}`)}\n` +
      `${colors.dim("Type /help for commands, /quit to exit")}`,
    1,
    0
  );
  contentContainer.addChild(headerText);
  contentContainer.addChild(new Spacer(1));
  const messagesContainer = new Container();
  contentContainer.addChild(messagesContainer);
  const pageContainer = new Container();
  const editor = new Editor(tui, editorTheme, { paddingX: 1 });
  const autocompleteProvider = new CombinedAutocompleteProvider(
    buildAutocompleteCommands(),
    process.cwd()
  );
  editor.setAutocompleteProvider(autocompleteProvider);
  return { tui, contentContainer, headerText, messagesContainer, pageContainer, editor };
}

function buildTUIContext(
  baseUrl: string,
  components: ReturnType<typeof createTUIComponents>
): TUIContext {
  const ctx: TUIContext = {
    baseUrl,
    ...components,
    chatMessages: [],
    connected: false,
    isProcessing: false,
    currentAssistantMessage: "",
    loader: null,
    sessionId: "",
    sseAbortController: null,
    currentView: "chat",
    pageActions: [],
    processMessage: () => {},
    addChatMessage: () => {},
    finishResponse: () => {},
  };
  ctx.addChatMessage = (role, content) => {
    ctx.chatMessages.push({ role, content });
    updateChatMessages(ctx);
  };
  ctx.finishResponse = () => {
    if (ctx.loader) {
      ctx.loader.stop();
      ctx.contentContainer.removeChild(ctx.loader);
      ctx.loader = null;
    }
    if (ctx.currentAssistantMessage) ctx.addChatMessage("assistant", ctx.currentAssistantMessage);
    ctx.currentAssistantMessage = "";
    ctx.isProcessing = false;
    ctx.editor.disableSubmit = false;
    ctx.tui.requestRender();
  };
  return ctx;
}

function wireMessageHandlers(ctx: TUIContext): void {
  const handlers: Record<string, (msg: GatewayMessage) => void> = {
    page: (msg) => handlePageMessage(ctx, msg),
    agent_text: (msg) => handleAgentText(ctx, msg),
    tool_call: (msg) => {
      if (ctx.loader) ctx.loader.setMessage(`Using ${msg.tool ?? "tool"}...`);
    },
    modal: (msg) => handleModal(ctx, msg),
    toast: (msg) => showToastMessage(ctx, msg.message || msg.text || "", msg.variant),
    a2ui: (msg) => {
      if (msg.surfaces) handlePageMessage(ctx, msg);
    },
    error: (msg) => {
      ctx.finishResponse();
      ctx.addChatMessage("assistant", `**Error:** ${msg.message ?? "unknown error"}`);
    },
    clear_surface: () => {},
    log_entry: () => {},
    connected: () => {},
  };
  ctx.processMessage = (msg) => {
    try {
      const handler = handlers[msg.type];
      if (handler) handler(msg);
    } catch {
      /* ignore */
    }
  };
}

async function runTUI(options: { port?: string }, config: PHAConfig): Promise<void> {
  const port = options.port ? parseInt(options.port, 10) : config.gateway.port;
  const gwBasePath = (config.gateway.basePath || "").replace(/\/+$/, "");
  const baseUrl = `http://localhost:${port}${gwBasePath}`;
  const phaRef = config.orchestrator?.pha;
  const provider = (phaRef ? phaRef.split("/")[0] : config.llm.provider) as LLMProvider;
  const providerCfg = PROVIDER_CONFIGS[provider];

  await ensureGatewayRunning(baseUrl);

  const components = createTUIComponents(providerCfg?.name || provider);
  const { tui, contentContainer, editor } = components;
  const ctx = buildTUIContext(baseUrl, components);
  wireMessageHandlers(ctx);

  const transport = createTransportHelpers(ctx);
  const navigateTo = (view: string): void => {
    ctx.currentView = view;
    ctx.pageActions = [];
    transport.sendNavigate(view);
    if (view !== "chat") {
      switchToPageMode(ctx);
      ctx.pageContainer.clear();
      ctx.pageContainer.addChild(new Text(colors.dim("Loading..."), 1, 0));
    } else {
      switchToChatMode(ctx);
    }
    ctx.tui.requestRender();
  };
  const showToast = (message: string): void => showToastMessage(ctx, message);
  let tuiStarted = false;
  const cleanup = (): void => {
    if (ctx.loader) ctx.loader.stop();
    if (ctx.sseAbortController) ctx.sseAbortController.abort();
    if (tuiStarted) ctx.tui.stop();
    process.exit(0);
  };
  const showHelp = (): void => {
    if (ctx.currentView === "chat") {
      ctx.addChatMessage("assistant", CHAT_HELP);
    } else {
      ctx.pageContainer.clear();
      ctx.pageContainer.addChild(new Markdown(PAGE_HELP, 1, 0, markdownTheme));
      ctx.tui.requestRender();
    }
  };

  setupEditorSubmit(ctx, transport, navigateTo, showToast, cleanup, showHelp);
  tui.addChild(contentContainer);
  tui.addChild(new Spacer(1));
  tui.addChild(editor);
  tui.setFocus(editor);

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  await initializeSession(baseUrl, config, {
    setSessionId: (id) => {
      ctx.sessionId = id;
    },
    setConnected: (val) => {
      ctx.connected = val;
    },
    processUpdates: (updates) => {
      for (const msg of updates) ctx.processMessage(msg as GatewayMessage);
    },
    addChatMessage: ctx.addChatMessage,
    startSSE: transport.startSSE,
    tui,
  });

  hookStdinCtrlC(cleanup);
  tuiStarted = true;
  tui.start();
}

function handleAgentText(ctx: TUIContext, msg: GatewayMessage): void {
  if (msg.is_final) {
    ctx.finishResponse();
  } else {
    ctx.currentAssistantMessage = msg.content ?? "";
    if (ctx.loader) {
      const msgContent = msg.content ?? "";
      const preview = msgContent.length > 60 ? `${msgContent.substring(0, 60)}...` : msgContent;
      ctx.loader.setMessage(preview);
    }
  }
}

const CHAT_HELP = `**Navigation Commands:**
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
In page views, type a number to trigger an action.`;

const PAGE_HELP = `**Navigation Commands:**
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

async function initializeSession(
  baseUrl: string,
  config: PHAConfig,
  ctx: {
    setSessionId: (id: string) => void;
    setConnected: (val: boolean) => void;
    processUpdates: (updates: unknown[]) => void;
    addChatMessage: (role: "user" | "assistant" | "tool", content: string) => void;
    startSSE: () => void;
    tui: TUI;
  }
): Promise<void> {
  try {
    const defaultUserId = config.uid || undefined;
    const initRes = await fetch(`${baseUrl}/api/a2ui/init`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uuid: defaultUserId }),
      signal: AbortSignal.timeout(5000),
    });

    if (!initRes.ok) {
      console.error(`Init request failed: ${initRes.status}`);
      process.exit(1);
    }

    const initData = (await initRes.json()) as {
      sessionId: string;
      uid: string;
      updates: unknown[];
    };
    ctx.setSessionId(initData.sessionId);
    ctx.setConnected(true);

    ctx.processUpdates(initData.updates);
    ctx.addChatMessage(
      "assistant",
      `Welcome to **PHA**!\n\nAsk me about your health data, sleep, or activity.\nType \`/help\` for navigation commands.`
    );
    ctx.tui.requestRender();
    ctx.startSSE();
  } catch (e) {
    console.error("Failed to connect to gateway:", e);
    process.exit(1);
  }
}

function hookStdinCtrlC(cleanup: () => void): void {
  const originalStdinOn = process.stdin.on.bind(process.stdin);
  process.stdin.on = function (event: string, listener: (...args: unknown[]) => void) {
    if (event === "data") {
      const wrappedListener = (data: Buffer | string) => {
        const str = data.toString();
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
}
