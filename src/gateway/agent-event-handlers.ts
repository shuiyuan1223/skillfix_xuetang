/**
 * Agent Event Handlers — extracted from GatewaySession._handleAgentEventInner()
 *
 * Each handler corresponds to a `case` in the original switch statement.
 * Reduces CC=96, Lines=324 → dispatch map.
 */

import type { GatewaySession } from "./server.js";
import type { PartsChatMessage, MessagePart, AGUIEvent } from "./a2ui.js";
import { generateToolCards, generateExperimentPage } from "./pages.js";
import { globalRegistry } from "../tools/index.js";
import { MAX_DASHBOARDS_PER_SESSION } from "../tools/dashboard-types.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("Gateway/Agent");

type SendFn = (msg: unknown) => void;

// ── Helpers ─────────────────────────────────────────────────────

function findLastTextIdx(parts: MessagePart[]): number {
  for (let i = parts.length - 1; i >= 0; i--) {
    if (parts[i].type === "text") return i;
  }
  return -1;
}

function extractText(content: unknown[]): string {
  let text = "";
  for (const block of content || []) {
    if ((block as { type: string }).type === "text") text += (block as { text: string }).text;
  }
  return text;
}

function getChannelState(
  session: GatewaySession,
  isLegacy: boolean
): {
  messages: PartsChatMessage[];
  persistChannel: "legacy-chat" | "chat";
  sessionId: string;
} {
  return {
    messages: isLegacy ? session.legacyChatMessages : session.chatMessages,
    persistChannel: isLegacy ? "legacy-chat" : "chat",
    sessionId: isLegacy ? session.legacyChatSessionId : session.sessionId,
  };
}

function clearStreamingState(session: GatewaySession, isLegacy: boolean): void {
  if (isLegacy) {
    session.legacyChatStreaming = false;
    session.legacyChatStreamingContent = "";
    session.legacyChatCurrentAssistantMsgId = null;
    session.legacyChatLastStreamedText = "";
  } else {
    session.isStreaming = false;
    session.streamingContent = "";
    session.currentAssistantMsgId = null;
    session.lastStreamedText = "";
  }
}

// ── Event handlers ──────────────────────────────────────────────

function handleMessageStart(
  session: GatewaySession,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  event: any,
  activeSend: SendFn,
  send: SendFn,
  isLegacy: boolean
): void {
  if (event.message.role !== "assistant") return;

  const text = extractText(event.message.content || []);
  const { sessionId } = getChannelState(session, isLegacy);

  const runId = crypto.randomUUID();
  if (isLegacy) {
    session.legacyChatCurrentRunId = runId;
  } else {
    session.currentRunId = runId;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const assistantMsg = (session as any).getOrCreateAssistantMsg();

  if (text) {
    assistantMsg.parts.push({ type: "text", content: text });
  }

  if (isLegacy) {
    session.legacyChatStreamingContent = text;
    session.legacyChatLastStreamedText = text;
  } else {
    session.streamingContent = text;
    session.lastStreamedText = text;
  }

  activeSend({ type: "RunStarted", threadId: sessionId, runId } satisfies AGUIEvent);
  activeSend({
    type: "TextMessageStart",
    messageId: assistantMsg.id,
    role: "assistant",
  } satisfies AGUIEvent);
  if (text) {
    activeSend({
      type: "TextMessageContent",
      messageId: assistantMsg.id,
      delta: text,
    } satisfies AGUIEvent);
  }
  activeSend({ type: "agent_text", content: text, is_final: false });
  session.sendChatUpdate(send);
}

function handleMessageUpdate(
  session: GatewaySession,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  event: any,
  activeSend: SendFn,
  isLegacy: boolean
): void {
  if (event.message.role !== "assistant") return;

  const text = extractText(event.message.content || []);

  if (isLegacy) {
    session.legacyChatStreamingContent = text;
  } else {
    session.streamingContent = text;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const assistantMsg = (session as any).getOrCreateAssistantMsg();
  const lastPart = assistantMsg.parts[assistantMsg.parts.length - 1];
  if (lastPart && lastPart.type === "text") {
    lastPart.content = text;
  } else if (text) {
    assistantMsg.parts.push({ type: "text", content: text });
  }

  const prevText = isLegacy ? session.legacyChatLastStreamedText : session.lastStreamedText;
  const delta = text.slice(prevText.length);
  if (delta) {
    activeSend({
      type: "TextMessageContent",
      messageId: assistantMsg.id,
      delta,
    } satisfies AGUIEvent);
  }
  if (isLegacy) {
    session.legacyChatLastStreamedText = text;
  } else {
    session.lastStreamedText = text;
  }

  activeSend({ type: "agent_text", content: text, is_final: false });
}

function handleMessageEnd(
  session: GatewaySession,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  event: any,
  activeSend: SendFn,
  send: SendFn,
  isLegacy: boolean
): void {
  if (event.message.role !== "assistant") return;

  const text = extractText(event.message.content || []);
  const { persistChannel, sessionId } = getChannelState(session, isLegacy);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const assistantMsg = (session as any).getOrCreateAssistantMsg();

  // Check for error responses
  if (event.message.stopReason === "error") {
    handleMessageEndError(
      session,
      event,
      assistantMsg,
      text,
      activeSend,
      send,
      isLegacy,
      persistChannel,
      sessionId
    );
    return;
  }

  // Finalize: ensure last text part has final text
  if (text.trim()) {
    const lastTextIdx = findLastTextIdx(assistantMsg.parts);
    if (lastTextIdx >= 0) {
      (assistantMsg.parts[lastTextIdx] as { type: "text"; content: string }).content = text;
    } else {
      assistantMsg.parts.push({ type: "text", content: text });
    }
    session.persistMessage(persistChannel, {
      timestamp: Date.now(),
      role: "assistant",
      content: text,
    });
  }

  clearStreamingState(session, isLegacy);

  activeSend({ type: "TextMessageEnd", messageId: assistantMsg.id } satisfies AGUIEvent);
  session.sendChatUpdate(send);
  if (text.trim()) {
    activeSend({ type: "agent_text", content: text, is_final: true });
  }
}

function handleMessageEndError(
  session: GatewaySession,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  event: any,
  assistantMsg: PartsChatMessage,
  text: string,
  activeSend: SendFn,
  send: SendFn,
  isLegacy: boolean,
  persistChannel: "legacy-chat" | "chat",
  sessionId: string
): void {
  const errorMsg = event.message.errorMessage || "Unknown error occurred";
  log.error("LLM error in streaming path", {
    errorMessage: errorMsg,
    stopReason: event.message.stopReason,
  });
  const errContent = text.trim() ? `${text}\n\n⚠️ ${errorMsg}` : `⚠️ ${errorMsg}`;

  const lastTextIdx = findLastTextIdx(assistantMsg.parts);
  if (lastTextIdx >= 0) {
    (assistantMsg.parts[lastTextIdx] as { type: "text"; content: string }).content = errContent;
  } else {
    assistantMsg.parts.push({ type: "text", content: errContent });
  }

  session.persistMessage(persistChannel, {
    timestamp: Date.now(),
    role: "assistant",
    content: errContent,
  });
  clearStreamingState(session, isLegacy);

  activeSend({ type: "TextMessageEnd", messageId: assistantMsg.id } satisfies AGUIEvent);
  const currentRunId = isLegacy ? session.legacyChatCurrentRunId : session.currentRunId;
  if (currentRunId) {
    activeSend({
      type: "RunFinished",
      threadId: sessionId,
      runId: currentRunId,
    } satisfies AGUIEvent);
  }

  session.sendChatUpdate(send);
  activeSend({ type: "agent_text", content: errorMsg, is_final: true });
}

function handleToolStart(
  session: GatewaySession,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  event: any,
  activeSend: SendFn,
  send: SendFn
): void {
  const toolCallId = crypto.randomUUID();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const assistantMsg = (session as any).getOrCreateAssistantMsg();

  const lastPart = assistantMsg.parts[assistantMsg.parts.length - 1];
  if (lastPart && lastPart.type === "text" && !lastPart.content.trim()) {
    assistantMsg.parts.pop();
  }

  const toolDisplayName = globalRegistry.get(event.toolName)?.displayName;
  assistantMsg.parts.push({
    type: "tool_use",
    toolCallId,
    toolName: event.toolName,
    status: "running",
    ...(toolDisplayName ? { displayName: toolDisplayName } : {}),
  });

  event._toolCallId = toolCallId;

  activeSend({
    type: "ToolCallStart",
    toolCallId,
    toolCallName: event.toolName,
    parentMessageId: assistantMsg.id,
    ...(toolDisplayName ? { displayName: toolDisplayName } : {}),
  } satisfies AGUIEvent);
  activeSend({ type: "tool_call", tool: event.toolName });
  session.sendChatUpdate(send);
}

function handleToolEnd(
  session: GatewaySession,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  event: any,
  activeSend: SendFn,
  send: SendFn,
  isLegacy: boolean
): void {
  const messages = isLegacy ? session.legacyChatMessages : session.chatMessages;
  const currentMsgId = isLegacy
    ? session.legacyChatCurrentAssistantMsgId
    : session.currentAssistantMsgId;
  const assistantMsg = currentMsgId ? messages.find((m) => m.id === currentMsgId) : null;

  if (assistantMsg) {
    const matchedToolCallId = matchAndUpdateToolPart(assistantMsg, event.toolName, event.isError);
    addToolResultCards(assistantMsg, event, matchedToolCallId, activeSend);

    // After tool finishes, push a new empty text part
    assistantMsg.parts.push({ type: "text", content: "" });
    if (isLegacy) {
      session.legacyChatLastStreamedText = "";
    } else {
      session.lastStreamedText = "";
    }
  }

  // Intercept dashboard create/update
  interceptDashboardTools(session, event, send);

  session.sendChatUpdate(send);
}

function matchAndUpdateToolPart(
  assistantMsg: PartsChatMessage,
  toolName: string,
  isError: boolean
): string | null {
  for (let i = assistantMsg.parts.length - 1; i >= 0; i--) {
    const part = assistantMsg.parts[i];
    if (part.type === "tool_use" && part.toolName === toolName && part.status === "running") {
      part.status = isError ? "error" : "completed";
      return part.toolCallId;
    }
  }
  return null;
}

function addToolResultCards(
  assistantMsg: PartsChatMessage,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  event: any,
  matchedToolCallId: string | null,
  activeSend: SendFn
): void {
  if (event.isError || !matchedToolCallId) return;

  // Inline cards
  try {
    const cards = generateToolCards(event.toolName, event.result);
    if (cards) {
      assistantMsg.parts.push({ type: "tool_result", toolCallId: matchedToolCallId, cards });
    }
  } catch (err) {
    log.error("Failed to generate cards", { tool: event.toolName, error: err });
  }

  // AG-UI events
  activeSend({ type: "ToolCallEnd", toolCallId: matchedToolCallId } satisfies AGUIEvent);
  let resultCards: ReturnType<typeof generateToolCards> = null;
  try {
    resultCards = generateToolCards(event.toolName, event.result);
  } catch (err) {
    log.error("Failed to generate AG-UI cards", { tool: event.toolName, error: err });
  }
  activeSend({
    type: "ToolCallResult",
    messageId: assistantMsg.id,
    toolCallId: matchedToolCallId,
    ...(resultCards ? { cards: resultCards } : {}),
  } satisfies AGUIEvent);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function handleCreateDashboard(session: GatewaySession, event: any): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = (event.result as any)?.details;
  const d = raw?.details ?? raw;
  if (!d?.dashboardId || !d?.sections) return;
  if (session.customDashboards.size >= MAX_DASHBOARDS_PER_SESSION) return;

  session.customDashboards.set(d.dashboardId, {
    id: d.dashboardId,
    title: d.title,
    subtitle: d.subtitle,
    icon: d.icon || "activity",
    sections: d.sections,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (session as any).saveDashboards();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function handleUpdateDashboard(session: GatewaySession, event: any, send: SendFn): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = (event.result as any)?.details;
  const d = raw?.details ?? raw;
  if (!d?.dashboardId || !session.customDashboards.has(d.dashboardId)) return;

  const existing = session.customDashboards.get(d.dashboardId)!;
  session.customDashboards.set(d.dashboardId, {
    ...existing,
    ...(d.title && { title: d.title }),
    ...(d.subtitle && { subtitle: d.subtitle }),
    ...(d.icon && { icon: d.icon }),
    ...(d.sections && { sections: d.sections }),
    updatedAt: new Date().toISOString(),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (session as any).saveDashboards();

  if (session.currentView === "experiment" && session.activeDashboardTab === d.dashboardId) {
    const experimentPage = generateExperimentPage(
      session.customDashboards,
      session.activeDashboardTab
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const activeSend = (session as any).getSend(send);
    const buildPage = session.buildPage("experiment", experimentPage);
    for (const msg of buildPage) activeSend(msg);
  }
}

function interceptDashboardTools(
  session: GatewaySession,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  event: any,
  send: SendFn
): void {
  if (event.toolName === "create_dashboard" && !event.isError) {
    handleCreateDashboard(session, event);
  }
  if (event.toolName === "update_dashboard" && !event.isError) {
    handleUpdateDashboard(session, event, send);
  }
}

function handleAgentEnd(
  session: GatewaySession,
  activeSend: SendFn,
  send: SendFn,
  isLegacy: boolean
): void {
  const { sessionId } = getChannelState(session, isLegacy);

  if (isLegacy) {
    session.legacyChatStreaming = false;
    session.legacyChatCurrentAssistantMsgId = null;
    session.legacyChatLastStreamedText = "";
  } else {
    session.isStreaming = false;
    session.currentAssistantMsgId = null;
    session.lastStreamedText = "";
  }

  const currentRunId = isLegacy ? session.legacyChatCurrentRunId : session.currentRunId;
  if (currentRunId) {
    activeSend({
      type: "RunFinished",
      threadId: sessionId,
      runId: currentRunId,
    } satisfies AGUIEvent);
  }

  session.sendChatUpdate(send);
}

// ── Dispatch ────────────────────────────────────────────────────

/**
 * Handle an agent event and route to the appropriate handler.
 * Replaces the CC=96 _handleAgentEventInner switch statement.
 */
export function dispatchAgentEvent(
  session: GatewaySession,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  event: any,
  send: SendFn
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sseMode = (session as any)._sseMode;
  const activeSend = sseMode ? send : (session as any).getSend(send);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isLegacy = (session as any)._chatChannel === "legacy";

  switch (event.type) {
    case "message_start":
      handleMessageStart(session, event, activeSend, send, isLegacy);
      break;
    case "message_update":
      handleMessageUpdate(session, event, activeSend, isLegacy);
      break;
    case "message_end":
      handleMessageEnd(session, event, activeSend, send, isLegacy);
      break;
    case "tool_execution_start":
      handleToolStart(session, event, activeSend, send);
      break;
    case "tool_execution_end":
      handleToolEnd(session, event, activeSend, send, isLegacy);
      break;
    case "agent_end":
      handleAgentEnd(session, activeSend, send, isLegacy);
      break;
    default:
      break;
  }
}
