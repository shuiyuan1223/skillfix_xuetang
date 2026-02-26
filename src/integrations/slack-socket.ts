/**
 * Slack Socket Mode Client
 *
 * Maintains a persistent outbound WebSocket connection to Slack.
 * No inbound port required — works behind firewalls / internal networks.
 *
 * Protocol:
 *   1. POST apps.connections.open  → get WSS URL (App-Level Token)
 *   2. Connect WebSocket           → receive events
 *   3. ACK each envelope_id        → within 3 seconds
 *   4. Auto-reconnect on close
 *
 * Config (.pha/config.json):
 *   slack.appToken   — xapp-... (App-Level Token, connections:write scope)
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
      text?: string;
      user?: string;
      channel?: string;
      bot_id?: string;
    };
  };
  reason?: string;
}

/**
 * Call apps.connections.open to get a fresh WSS URL.
 * The URL is single-use and expires after the connection closes.
 */
async function getWssUrl(appToken: string): Promise<string> {
  const resp = await fetch(SLACK_CONNECTIONS_OPEN, {
    method: "POST",
    headers: { Authorization: `Bearer ${appToken}`, "Content-Type": "application/json" },
  });

  if (!resp.ok) {
    throw new Error(`apps.connections.open HTTP ${resp.status}`);
  }

  const raw: unknown = await resp.json();
  const data = raw as Record<string, unknown>;
  if (!data.ok) throw new Error(`apps.connections.open error: ${String(data.error)}`);
  return String(data.url);
}

/**
 * Start the Socket Mode connection loop.
 * Reconnects automatically with exponential backoff on disconnect.
 *
 * @param appToken   Slack App-Level Token (xapp-...)
 * @param channelId  Optional channel filter
 * @param llmCall    LLM inference function for classification
 */
export function startSlackSocketMode(
  appToken: string,
  channelId: string | undefined,
  llmCall: (prompt: string) => Promise<string>
): void {
  let reconnectDelay = RECONNECT_DELAY_MS;

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
        reconnectDelay = RECONNECT_DELAY_MS; // reset backoff on success
      });

      ws.addEventListener("message", (ev: MessageEvent) => {
        let envelope: SlackSocketEnvelope;
        try {
          envelope = JSON.parse(String(ev.data)) as SlackSocketEnvelope;
        } catch {
          return;
        }

        // Always acknowledge immediately to prevent Slack retry storm
        if (envelope.envelope_id) {
          ws.send(JSON.stringify({ envelope_id: envelope.envelope_id }));
        }

        if (envelope.type === "hello") {
          log.info("Slack Socket Mode: handshake complete");
          return;
        }

        if (envelope.type === "disconnect") {
          log.info("Slack Socket Mode: server requested disconnect, reconnecting", {
            reason: envelope.reason,
          });
          ws.close();
          return;
        }

        if (envelope.type !== "events_api") return;

        const event = envelope.payload?.event;
        if (!event || event.type !== "message") return;
        if (event.bot_id) return; // ignore bot messages
        if (channelId && event.channel !== channelId) return; // channel filter

        const text = (event.text ?? "").trim();
        if (!text) return;

        // Process asynchronously — ACK was already sent above
        void (async (): Promise<void> => {
          try {
            const { handleSlackWebhook } = await import("./slack-webhook.js");
            await handleSlackWebhook(
              { text, user_id: event.user ?? "", channel_id: event.channel ?? "" },
              llmCall
            );
          } catch (err) {
            log.warn("Slack event processing failed", { error: String(err) });
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
        // 'close' event fires after 'error', reconnect handled there
      });
    })();
  };

  connect();
}
