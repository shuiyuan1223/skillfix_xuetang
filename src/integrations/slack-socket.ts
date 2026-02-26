/**
 * Slack Socket Mode Client
 *
 * Maintains a persistent outbound WebSocket connection to Slack.
 * No inbound port required — works behind firewalls / internal networks.
 *
 * Message routing (after @mention + subtype filter):
 *   /badcase <text>              → bad case ingestion
 *   我这有个badcase / 反馈: ...  → bad case ingestion (natural language)
 *   everything else              → SA Chat (DB context + LLM response)
 *
 * Config (.pha/config.json):
 *   slack.appToken   — xapp-... (App-Level Token, connections:write scope)
 *   slack.botToken   — xoxb-... (Bot Token, channels:history + chat:write)
 *   slack.channelId  — optional channel ID filter
 */

import { createLogger } from "../utils/logger.js";

const log = createLogger("slack-socket");

const SLACK_CONNECTIONS_OPEN = "https://slack.com/api/apps.connections.open";
const RECONNECT_DELAY_MS = 5_000;
const MAX_RECONNECT_DELAY_MS = 60_000;

interface SlackSocketEnvelope {
  type: string;
  envelope_id?: string;
  payload?: {
    event?: {
      type?: string;
      subtype?: string;
      text?: string;
      user?: string;
      channel?: string;
      bot_id?: string;
      ts?: string;
    };
  };
  reason?: string;
}

// ── Bad case trigger detection ─────────────────────────────────────────────────

/** Prefixes that indicate the user is reporting a bad case. Case-insensitive. */
const BAD_CASE_TRIGGERS = [
  "/badcase",
  "/bad-case",
  "badcase:",
  "bad case:",
  "我这有个badcase",
  "我有个badcase",
  "我这有一个badcase",
  "我有一个badcase",
  "有个问题反馈",
  "反馈:",
  "feedback:",
];

/**
 * Detect if a message is a bad case report.
 * Returns the cleaned text (trigger prefix stripped) if so.
 */
function parseBadCaseReport(
  text: string
): { isBadCase: true; cleanText: string } | { isBadCase: false } {
  const lower = text.toLowerCase();
  for (const trigger of BAD_CASE_TRIGGERS) {
    if (lower.startsWith(trigger.toLowerCase())) {
      const cleanText = text
        .slice(trigger.length)
        .replace(/^[：:\s]+/, "")
        .trim();
      return { isBadCase: true, cleanText };
    }
  }
  return { isBadCase: false };
}

// ── SA Chat ────────────────────────────────────────────────────────────────────

/**
 * Handle a general SA query via Slack.
 * Fetches relevant DB context and lets the LLM formulate a response.
 * Does NOT use full agent tool-calling — uses context injection for read ops.
 */
async function handleSaChat(
  message: string,
  llmCall: (prompt: string) => Promise<string>
): Promise<string> {
  // Gather context from DB
  let badCaseContext = "（数据获取失败）";
  let benchmarkContext = "（数据获取失败）";

  try {
    const { listBadCases, getBadCasesStats } = await import("../memory/db.js");
    const stats = getBadCasesStats();
    const pending = listBadCases({ status: "pending", limit: 5 });

    badCaseContext = `总计 ${stats.total} | 待处理 ${stats.pending} | Bug ${stats.bug} | Effect ${stats.effect} | 本周已解决 ${stats.resolvedThisWeek}${
      pending.length > 0
        ? `\n待处理（最新5条）:\n${pending
            .map(
              (bc) =>
                `  • [${bc.id.slice(0, 8)}] *${bc.type}* / ${bc.priority} — ${bc.raw_text.slice(0, 80)}${bc.raw_text.length > 80 ? "…" : ""}`
            )
            .join("\n")}`
        : "\n暂无待处理"
    }`;
  } catch {
    // keep default
  }

  try {
    const { listBenchmarkRuns, listCategoryScores } = await import("../memory/db.js");
    const runs = listBenchmarkRuns({ limit: 3 });
    if (runs.length === 0) {
      benchmarkContext = "暂无 Benchmark 运行记录";
    } else {
      benchmarkContext = runs
        .map((run) => {
          const scores = listCategoryScores(run.id);
          const avg =
            scores.length > 0
              ? (scores.reduce((s, c) => s + c.score, 0) / scores.length).toFixed(1)
              : "N/A";
          return `• ${new Date(run.timestamp).toLocaleDateString()} | 综合 ${avg} | ${run.passed_count}/${run.total_test_cases} 通过 | ${run.id.slice(0, 8)}`;
        })
        .join("\n");
    }
  } catch {
    // keep default
  }

  const prompt = `你是 PHA System Agent，正在通过 Slack 与团队成员对话。

## 当前数据快照

**Bad Cases**
${badCaseContext}

**Benchmark（最近3次）**
${benchmarkContext}

## 你的能力
- 分析和解读以上数据
- 解答关于 PHA 系统、进化流程、Benchmark 的问题
- 指导如何上报 bad case（发消息时用 \`/badcase <描述>\` 前缀）
- 协助分析某个 bad case 是 bug 还是 effect 类型

## 用户消息
${message}

## 回复要求
- 与用户使用相同语言
- 简洁，适合 Slack 展示（*粗体*、_斜体_、• 列表）
- 不要重复用户的问题
- 如需完整操作（修改状态、创建 Issue 等），提示用户去 Evolution Lab Dashboard`;

  try {
    return await llmCall(prompt);
  } catch {
    return "抱歉，SA 暂时无法响应，请稍后重试。";
  }
}

// ── Slack API helpers ──────────────────────────────────────────────────────────

async function getWssUrl(appToken: string): Promise<string> {
  const resp = await fetch(SLACK_CONNECTIONS_OPEN, {
    method: "POST",
    headers: { Authorization: `Bearer ${appToken}`, "Content-Type": "application/json" },
  });
  if (!resp.ok) throw new Error(`apps.connections.open HTTP ${resp.status}`);
  const raw: unknown = await resp.json();
  const data = raw as Record<string, unknown>;
  if (!data.ok) throw new Error(`apps.connections.open error: ${String(data.error)}`);
  return String(data.url);
}

async function getBotUserId(botToken: string): Promise<string | undefined> {
  try {
    const resp = await fetch("https://slack.com/api/auth.test", {
      method: "POST",
      headers: { Authorization: `Bearer ${botToken}` },
    });
    const raw: unknown = await resp.json();
    const data = raw as Record<string, unknown>;
    if (!data.ok) return undefined;
    return String(data.user_id);
  } catch {
    return undefined;
  }
}

async function resolveDisplayName(userId: string, botToken: string): Promise<string> {
  try {
    const resp = await fetch(`https://slack.com/api/users.info?user=${userId}`, {
      headers: { Authorization: `Bearer ${botToken}` },
    });
    const raw: unknown = await resp.json();
    const data = raw as Record<string, unknown>;
    const user = data.user as Record<string, unknown> | undefined;
    const profile = user?.profile as Record<string, unknown> | undefined;
    return (
      String(profile?.display_name ?? "").trim() ||
      String(profile?.real_name ?? "").trim() ||
      userId
    );
  } catch {
    return userId;
  }
}

async function postThreadReply(
  channel: string,
  threadTs: string,
  text: string,
  botToken: string
): Promise<void> {
  try {
    await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ channel, thread_ts: threadTs, text }),
    });
  } catch (err) {
    log.warn("Failed to post Slack thread reply", { error: String(err) });
  }
}

// ── Main entry ─────────────────────────────────────────────────────────────────

export function startSlackSocketMode(
  appToken: string,
  botToken: string | undefined,
  channelId: string | undefined,
  llmCall: (prompt: string) => Promise<string>
): void {
  let reconnectDelay = RECONNECT_DELAY_MS;

  let botUserId: string | undefined;
  if (botToken) {
    void getBotUserId(botToken).then((id) => {
      botUserId = id;
      if (id) log.info("Slack bot user ID resolved", { botUserId: id });
    });
  }

  const connect = (): void => {
    void (async (): Promise<void> => {
      let wssUrl: string;
      try {
        wssUrl = await getWssUrl(appToken);
      } catch (err) {
        log.warn("Failed to get Slack WSS URL, will retry", {
          error: String(err),
          retryMs: reconnectDelay,
        });
        setTimeout(connect, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
        return;
      }

      const ws = new WebSocket(wssUrl);

      ws.addEventListener("open", () => {
        log.info("Slack Socket Mode: connected");
        reconnectDelay = RECONNECT_DELAY_MS;
      });

      ws.addEventListener("message", (ev: MessageEvent) => {
        let envelope: SlackSocketEnvelope;
        try {
          envelope = JSON.parse(String(ev.data)) as SlackSocketEnvelope;
        } catch {
          return;
        }

        if (envelope.envelope_id) {
          ws.send(JSON.stringify({ envelope_id: envelope.envelope_id }));
        }

        if (envelope.type === "hello") {
          log.info("Slack Socket Mode: handshake complete");
          return;
        }

        if (envelope.type === "disconnect") {
          log.info("Slack Socket Mode: server requested disconnect", { reason: envelope.reason });
          ws.close();
          return;
        }

        if (envelope.type !== "events_api") return;

        const event = envelope.payload?.event;
        if (!event || event.type !== "message") return;
        if (event.subtype) return; // system messages: channel_join, etc.
        if (event.bot_id) return; // bot messages — avoid loops

        const rawText = (event.text ?? "").trim();
        if (!rawText) return;

        // Require @mention
        if (botUserId) {
          const mentionRe = new RegExp(`<@${botUserId}>`, "i");
          if (!mentionRe.test(rawText)) return;
        }

        // Strip @mention
        const text = botUserId
          ? rawText.replace(new RegExp(`<@${botUserId}>\\s*`, "gi"), "").trim()
          : rawText;

        if (!text) return;

        if (channelId && event.channel !== channelId) return;

        const userId = event.user ?? "";
        const channel = event.channel ?? "";
        const ts = event.ts ?? "";

        void (async (): Promise<void> => {
          const displayName =
            botToken && userId ? await resolveDisplayName(userId, botToken) : userId;

          // ── Route: bad case report vs SA chat ───────────────────────────────
          const parsed = parseBadCaseReport(text);

          let replyText: string;
          if (parsed.isBadCase) {
            // Direct ingestion path
            try {
              const { handleSlackWebhook } = await import("./slack-webhook.js");
              const result = await handleSlackWebhook(
                { text: parsed.cleanText, user_id: displayName, channel_id: channel },
                llmCall
              );
              replyText = result.message;
            } catch {
              replyText = "❌ Bad case 上报失败，请稍后重试。";
            }
          } else {
            // SA Chat path
            replyText = await handleSaChat(text, llmCall);
          }

          if (botToken && channel && ts) {
            await postThreadReply(channel, ts, replyText, botToken);
          }
        })();
      });

      ws.addEventListener("close", () => {
        log.info("Slack Socket Mode: connection closed, reconnecting", { retryMs: reconnectDelay });
        setTimeout(connect, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
      });

      ws.addEventListener("error", (err) => {
        log.warn("Slack Socket Mode: WebSocket error", { error: String(err) });
      });
    })();
  };

  connect();
}
