/**
 * Legacy Protocol Adapter
 *
 * State machine that converts Agent events into "边想边搜" SSE protocol.
 * All tool calls are retained — they map to the "searching" phase.
 *
 * Protocol events:
 *   search_mode  — mode announcement
 *   rag_status   — phase transitions (start_search / search_with_think)
 *   data         — content chunks (reasoning or final content)
 *   finish       — end of stream
 */

export interface LegacySSEEvent {
  event: "search_mode" | "rag_status" | "data" | "finish";
  content?: string;
  content_type?: "reasoning";
}

type AdapterState = "initial" | "reasoning" | "searching" | "pending" | "content" | "done";

export class LegacyProtocolAdapter {
  private state: AdapterState = "initial";
  private pendingText = "";
  private allReasoningText = "";
  private finalText = "";

  constructor(private send: (event: LegacySSEEvent) => void) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleAgentEvent(event: any): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handler = this.eventHandlers[event.type as string] as ((e: any) => void) | undefined;
    if (handler) {
      handler(event);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private extractText(message: any): string {
    const content = message?.content || [];
    let text = "";
    for (const block of content) {
      if (block.type === "text") {
        text += block.text;
      }
    }
    return text;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly eventHandlers: Record<string, (event: any) => void> = {
    message_start: (event) => {
      if (event.message?.role !== "assistant") return;

      if (this.state === "initial") {
        this.send({ event: "search_mode", content: "search_with_think" });
        this.send({ event: "rag_status", content: "start_search" });
        this.state = "reasoning";
      }

      const text = this.extractText(event.message);
      if (text) {
        this.pendingText = text;
        this.allReasoningText += text;
      }
    },

    message_update: (event) => {
      if (event.message?.role !== "assistant") return;

      const text = this.extractText(event.message);
      const delta = text.slice(this.pendingText.length);
      this.pendingText = text;

      if (delta && (this.state === "reasoning" || this.state === "searching")) {
        this.send({ event: "data", content: delta, content_type: "reasoning" });
        this.allReasoningText += delta;
      } else if (delta) {
        this.allReasoningText += delta;
      }
    },

    message_end: (event) => {
      if (event.message?.role !== "assistant") return;

      this.finalText = this.extractText(event.message);
      this.state = "pending";
      this.pendingText = "";
    },

    tool_execution_start: (event) => {
      if (this.state === "pending" || this.state === "reasoning") {
        this.state = "searching";
      }

      const toolName = event.toolName || "unknown";
      this.send({
        event: "data",
        content: `\n[searching: ${toolName}]\n`,
        content_type: "reasoning",
      });
    },

    tool_execution_end: () => {
      this.send({ event: "rag_status", content: "start_search" });
      this.state = "reasoning";
      this.pendingText = "";
    },

    agent_end: () => {
      if (this.state === "done") return;

      this.send({ event: "rag_status", content: "search_with_think" });

      if (this.finalText.trim()) {
        this.send({ event: "data", content: this.finalText });
      }

      this.send({ event: "finish" });
      this.state = "done";
    },
  };
}
