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
    switch (event.type) {
      case "message_start": {
        if (event.message?.role !== "assistant") break;

        if (this.state === "initial") {
          // First message — emit mode announcement + start reasoning
          this.send({ event: "search_mode", content: "search_with_think" });
          this.send({ event: "rag_status", content: "start_search" });
          this.state = "reasoning";
        }

        // Extract initial text
        const content = event.message.content || [];
        let text = "";
        for (const block of content) {
          if (block.type === "text") text += block.text;
        }

        if (text) {
          this.pendingText = text;
          this.allReasoningText += text;
        }
        break;
      }

      case "message_update": {
        if (event.message?.role !== "assistant") break;

        const content = event.message.content || [];
        let text = "";
        for (const block of content) {
          if (block.type === "text") text += block.text;
        }

        // Calculate delta from what we've already sent
        const delta = text.slice(this.pendingText.length);
        this.pendingText = text;

        if (delta && (this.state === "reasoning" || this.state === "searching")) {
          // Flush reasoning text
          this.send({ event: "data", content: delta, content_type: "reasoning" });
          this.allReasoningText += delta;
        } else if (delta) {
          // Accumulate for later decision
          this.allReasoningText += delta;
        }
        break;
      }

      case "message_end": {
        if (event.message?.role !== "assistant") break;

        // Flush remaining pending text as reasoning
        // The text is complete for this turn. We move to "pending" state —
        // waiting to see if next event is tool_execution_start (more reasoning)
        // or agent_end (this was the final content).
        const content = event.message.content || [];
        let text = "";
        for (const block of content) {
          if (block.type === "text") text += block.text;
        }

        this.finalText = text;
        this.state = "pending";
        this.pendingText = "";
        break;
      }

      case "tool_execution_start": {
        // We were in pending or reasoning — confirm this is still reasoning phase
        if (this.state === "pending") {
          // The pending text was reasoning, not final content
          this.state = "searching";
        } else if (this.state === "reasoning") {
          this.state = "searching";
        }

        // Emit a search indicator as reasoning text
        const toolName = event.toolName || "unknown";
        this.send({
          event: "data",
          content: `\n[searching: ${toolName}]\n`,
          content_type: "reasoning",
        });
        break;
      }

      case "tool_execution_end": {
        // Tool finished — back to reasoning, start new reasoning phase
        this.send({ event: "rag_status", content: "start_search" });
        this.state = "reasoning";
        this.pendingText = "";
        break;
      }

      case "agent_end": {
        if (this.state === "done") break;

        // Signal end of thinking phase
        this.send({ event: "rag_status", content: "search_with_think" });

        // Emit final content
        if (this.finalText.trim()) {
          this.send({ event: "data", content: this.finalText });
        }

        // Finish
        this.send({ event: "finish" });
        this.state = "done";
        break;
      }
    }
  }
}
