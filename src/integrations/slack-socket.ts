/**
 * Slack Socket Mode Client
 *
 * Maintains a persistent outbound WebSocket connection to Slack.
 * No inbound port required — works behind firewalls / internal networks.
 *
 * Behavior:
 *   - Only processes messages that @mention the bot (avoids noise)
 *   - Skips system messages (channel_join, channel_leave, etc.)
 *   - Resolves Slack user ID → display name via users.info API
 *   - Posts a thread reply after ingestion with classification result
 *   - Auto-reconnects with exponential backoff
 *
 * Config (.pha/config.json):
 *   slack.appToken   — xapp-... (App-Level Token, connections:write scope)
 *   slack.botToken   — xoxb-... (Bot Token, channels:history + chat:write)
 *   slack.channelId  — optional channel ID filter (e.g. "C01234ABCDE")
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
      subtype?: string; // present for system msgs: channel_join, channel_leave, etc.
      text?: string;
      user?: string;
      channel?: string;
      bot_id?: string;
      ts?: string; // message timestamp, used as thread_ts for replies
    };
  };
  reason?: string;
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

/** Resolve bot's own user ID so we can detect @mentions. */
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

/** Resolve Slack user ID → display name. Falls back to userId on any error. */
async function resolveDisplayName(userId: string, botToken: string): Promise<string> {
  try {
    const resp = await fetch(`https://slack.com/api/users.info?user=${userId}`, {
      headers: { Authorization: `Bearer ${botToken}` },
    });
    const raw: unknown = await resp.json();
    const data = raw as Record<string, unknown>;
    const user = data.user as Record<string, unknown> | undefined;
    const profile = user?.profile as Record<string, unknown> | undefined;
    const name =
      String(profile?.display_name ?? "").trim() ||
      String(profile?.real_name ?? "").trim() ||
      userId;
    return name;
  } catch {
    return userId;
  }
}

/** Post a reply in the same thread so reporters get immediate feedback. */
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

/**
 * Start the Socket Mode connection loop.
 * Reconnects automatically with exponential backoff on disconnect.
 */
export function startSlackSocketMode(
  appToken: string,
  botToken: string | undefined,
  channelId: string | undefined,
  llmCall: (prompt: string) => Promise<string>
): void {
  let reconnectDelay = RECONNECT_DELAY_MS;

  // Resolve bot user ID once at startup (needed for mention detection)
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

        // Always ACK immediately
        if (envelope.envelope_id) {
          ws.send(JSON.stringify({ envelope_id: envelope.envelope_id }));
        }

        if (envelope.type === "hello") {
          log.info("Slack Socket Mode: handshake complete");
          return;
        }

        if (envelope.type === "disconnect") {
          log.info("Slack Socket Mode: server requested disconnect", {
            reason: envelope.reason,
          });
          ws.close();
          return;
        }

        if (envelope.type !== "events_api") return;

        const event = envelope.payload?.event;
        if (!event || event.type !== "message") return;

        // ── Fix 4a: Skip system messages (channel_join, channel_leave, etc.) ──
        if (event.subtype) return;

        // Skip bot messages to avoid loops
        if (event.bot_id) return;

        // ── Fix 4b: Mention-triggered — only process if @bot is mentioned ──
        const text = (event.text ?? "").trim();
        if (!text) return;

        // If we know the bot's user ID, require a mention; otherwise fall through
        if (botUserId) {
          const mentionPattern = new RegExp(`<@${botUserId}>`, "i");
          if (!mentionPattern.test(text)) return;
        }

        // Strip the @mention and any leading/trailing whitespace from the text
        const cleanText = botUserId
          ? text.replace(new RegExp(`<@${botUserId}>\\s*`, "gi"), "").trim()
          : text;

        if (!cleanText) return;

        // Channel filter
        if (channelId && event.channel !== channelId) return;

        const userId = event.user ?? "";
        const channel = event.channel ?? "";
        const ts = event.ts ?? "";

        // Process asynchronously — ACK was already sent above
        void (async (): Promise<void> => {
          // ── Fix 3: Resolve display name ──────────────────────────────────────
          const displayName =
            botToken && userId ? await resolveDisplayName(userId, botToken) : userId;

          try {
            const { handleSlackWebhook } = await import("./slack-webhook.js");
            const result = await handleSlackWebhook(
              { text: cleanText, user_id: displayName, channel_id: channel },
              llmCall
            );

            // ── Fix 1: Reply in thread with classification result ─────────────
            if (botToken && channel && ts) {
              await postThreadReply(channel, ts, result.message, botToken);
            }
          } catch (err) {
            log.warn("Slack event processing failed", { error: String(err) });
            if (botToken && channel && ts) {
              await postThreadReply(channel, ts, "❌ 上报失败，请稍后重试。", botToken);
            }
          }
        })();
      });

      ws.addEventListener("close", () => {
        log.info("Slack Socket Mode: connection closed, reconnecting", {
          retryMs: reconnectDelay,
        });
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
