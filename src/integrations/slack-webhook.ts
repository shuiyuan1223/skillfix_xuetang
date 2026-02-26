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

  const typeEmoji = { bug: "🐛", effect: "📉", unclassified: "❓" }[classification.type];
  const confidencePct = (classification.confidence * 100).toFixed(0);

  return {
    id,
    classification,
    traceId,
    persisted: true,
    message:
      `${typeEmoji} Incident recorded (ID: \`${id.slice(0, 8)}\`)\n` +
      `分类: *${classification.type}* (置信度 ${confidencePct}%)\n` +
      `优先级: ${classification.priority}\n` +
      `原因: ${classification.reason}\n${
        traceId ? `Trace ID: \`${traceId}\`\n` : ""
      }\n在 Evolution Lab → Incidents 查看详情。`,
  };
}
