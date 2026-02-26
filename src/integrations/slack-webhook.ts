/**
 * Slack Webhook Handler
 *
 * Receives incident reports from Slack, classifies them via LLM,
 * and persists to the incidents database for Dashboard tracking.
 *
 * Supported Slack integration modes:
 *   A) Outgoing Webhook (trigger word, e.g. "bad-case:")
 *   B) Slash Command (/bad-case)
 *   C) Events API (message in dedicated channel)
 *
 * Format accepted (free text):
 *   "用户问了睡眠质量，Agent 回答跑题说了步数。TraceID: abc-123"
 *   "/bad-case Agent 报错了，工具调用返回 null"
 *
 * GitHub Issue creation is intentionally NOT done here.
 * It is handled by the System Agent via create_github_issue_for_incident MCP tool.
 */

import { insertIncident, type IncidentSource } from "../memory/db.js";
import { classifyIncident, type ClassificationResult } from "../evolution/incident-classifier.js";

export interface SlackWebhookPayload {
  token?: string;
  team_id?: string;
  team_domain?: string;
  channel_id?: string;
  channel_name?: string;
  user_id?: string;
  user_name?: string;
  text: string;
  timestamp?: string;
  trigger_word?: string;
  // Slash command fields
  command?: string;
  response_url?: string;
}

export interface IncidentIngestResult {
  id: string;
  classification: ClassificationResult;
  traceId?: string;
  persisted: boolean;
  message: string;
}

/**
 * Extract Trace ID from free-text if mentioned.
 * Patterns: "TraceID: abc-123", "trace: abc", "trace_id=abc"
 */
function extractTraceId(text: string): string | undefined {
  const match = text.match(/trace[_\s-]?id[:\s=]+([a-zA-Z0-9_-]{8,})/i);
  return match?.[1];
}

/**
 * Strip trigger words and slash command prefixes from text.
 */
function normalizeText(payload: SlackWebhookPayload): string {
  let text = payload.text ?? "";

  // Strip trigger word (e.g. "bad-case: ...")
  if (payload.trigger_word) {
    text = text.replace(new RegExp(`^${payload.trigger_word}[:\\s]*`, "i"), "").trim();
  }

  // Strip slash command (e.g. "/bad-case ...")
  if (payload.command) {
    text = text.replace(/^\/\S+\s*/, "").trim();
  }

  return text.trim();
}

/**
 * Determine source based on payload shape
 */
function detectSource(payload: SlackWebhookPayload): IncidentSource {
  if (payload.command) return "slack"; // slash command
  return "slack";
}

/**
 * Handle incoming Slack webhook — ingest, classify, persist.
 *
 * @param payload     Slack payload (Outgoing Webhook, Slash Command, or Events API)
 * @param llmCall     LLM inference function (injected by server.ts)
 */
export async function handleSlackWebhook(
  payload: SlackWebhookPayload,
  llmCall?: (prompt: string) => Promise<string>
): Promise<IncidentIngestResult> {
  const rawText = normalizeText(payload);
  const traceId = extractTraceId(rawText);
  const source = detectSource(payload);
  const reporter = payload.user_name ?? payload.user_id ?? undefined;

  const id = crypto.randomUUID();

  // LLM classification (if llmCall provided), else persist as unclassified
  let classification: ClassificationResult = {
    type: "unclassified",
    priority: "medium",
    confidence: 0,
    reason: "LLM not available at ingest time — pending manual classification.",
  };

  if (llmCall) {
    try {
      classification = await classifyIncident({ rawText, llmCall });
    } catch {
      // Keep unclassified fallback
    }
  }

  // Persist to DB — always, regardless of classification outcome
  try {
    insertIncident({
      id,
      timestamp: Date.now(),
      source,
      reporter,
      rawText,
      traceId,
      type: classification.type,
      status: "pending",
      priority: classification.priority,
      classificationConfidence: classification.confidence,
      classificationReason: classification.reason,
    });
  } catch (err) {
    return {
      id,
      classification,
      traceId,
      persisted: false,
      message: `Failed to persist incident: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  return {
    id,
    classification,
    traceId,
    persisted: true,
    message: buildReply(id, rawText, classification, traceId),
  };
}

/**
 * Build a conversational Slack reply based on classification quality.
 *
 * - High confidence + enough context  → confirm + brief summary
 * - Low confidence or too vague       → confirm + ask ONE targeted follow-up
 * - Unclassified                      → confirm + ask what went wrong
 */
function buildReply(
  id: string,
  rawText: string,
  classification: ClassificationResult,
  traceId: string | undefined
): string {
  const shortId = id.slice(0, 8);
  const isVague = rawText.length < 30 || classification.confidence < 0.55;

  const followUp = getFollowUp(classification, rawText);

  if (isVague || classification.type === "unclassified") {
    // Acknowledge but ask for more context
    return `已记录（\`${shortId}\`）。${traceId ? ` Trace: \`${traceId}\`` : ""}\n\n${followUp}`;
  }

  // Clear enough — confirm with light summary
  const typeLabel: Record<string, string> = {
    bug: "🐛 Bug",
    effect: "📉 效果问题",
    unclassified: "❓ 待分类",
  };
  const label = typeLabel[classification.type] ?? classification.type;
  const priorityLabel: Record<string, string> = {
    high: "⚠️ 高",
    medium: "中",
    low: "低",
    ignore: "忽略",
  };
  const priority = priorityLabel[classification.priority] ?? classification.priority;

  return `${label} 已记录（\`${shortId}\`），优先级 ${priority}。${
    traceId ? ` Trace: \`${traceId}\`` : ""
  }${followUp ? `\n\n${followUp}` : ""}`;
}

/**
 * Pick the single most useful follow-up question based on context.
 */
function getFollowUp(classification: ClassificationResult, rawText: string): string {
  const lower = rawText.toLowerCase();

  if (classification.type === "bug") {
    // Bug but short description
    return "能描述一下具体的异常行为吗？比如：工具调用失败、返回了错误数据、页面报错等。";
  }

  if (classification.type === "effect") {
    // Effect — ask what specifically was wrong
    if (lower.includes("不好") || lower.includes("效果") || lower.includes("感觉")) {
      return "能说说哪里不满意吗？是*回答太泛*、*建议不实用*、*答非所问*，还是*语气有问题*？";
    }
    return "Agent 的回答具体哪里不符合预期？";
  }

  // Unclassified or unclear
  return "能多说一点吗？比如：Agent 具体回答了什么，以及哪里不对或不满意。";
}
