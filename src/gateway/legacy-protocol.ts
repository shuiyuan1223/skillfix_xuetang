/**
 * Legacy Protocol Adapter
 *
 * State machine that converts Agent events into "边想边搜" SSE protocol.
 *
 * Content is never emitted during streaming (message_update). Instead it is
 * emitted at well-defined boundaries so each chunk has a confirmed role:
 *   - Reasoning text  → flushed when tool_execution_start confirms it was thinking
 *   - Final answer    → emitted at agent_end without content_type
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

type AdapterState = "initial" | "reasoning" | "searching" | "pending" | "done";

export class LegacyProtocolAdapter {
  private state: AdapterState = "initial";
  private pendingText = "";
  private finalText = "";

  constructor(private send: (event: LegacySSEEvent) => void) {}

  handleAgentEvent(event: any): void {
    switch (event.type) {
      case "message_start": {
        if (event.message?.role !== "assistant") break;

        if (this.state === "initial") {
          this.send({ event: "search_mode", content: "search_with_think" });
          this.send({ event: "rag_status", content: "start_search" });
          this.state = "reasoning";
        }

        this.pendingText = "";
        break;
      }

      case "message_update": {
        if (event.message?.role !== "assistant") break;

        // Accumulate text only — do not emit yet.
        // We don't know the role of this message (reasoning vs final answer)
        // until we see what event follows message_end.
        const content = event.message.content || [];
        let text = "";
        for (const block of content) {
          if (block.type === "text") text += block.text;
        }
        this.pendingText = text;
        break;
      }

      case "message_end": {
        if (event.message?.role !== "assistant") break;

        // Capture the complete text for this turn.
        // Use pendingText as fallback if content blocks are empty.
        const content = event.message.content || [];
        let text = "";
        for (const block of content) {
          if (block.type === "text") text += block.text;
        }
        this.finalText = text || this.pendingText;
        this.state = "pending";
        this.pendingText = "";
        break;
      }

      case "tool_execution_start": {
        // A tool call follows → the buffered text was reasoning, flush it now.
        if (this.finalText.trim()) {
          this.send({ event: "data", content: this.finalText, content_type: "reasoning" });
          this.finalText = "";
        }

        if (this.state === "pending" || this.state === "reasoning") {
          this.state = "searching";
        }

        const toolName = event.toolName || "unknown";
        this.send({
          event: "data",
          content: `\n[searching: ${toolName}]\n`,
          content_type: "reasoning",
        });
        break;
      }

      case "tool_execution_end": {
        this.send({ event: "rag_status", content: "start_search" });
        this.state = "reasoning";
        this.pendingText = "";
        break;
      }

      case "agent_end": {
        if (this.state === "done") break;

        this.send({ event: "rag_status", content: "search_with_think" });

        // Emit final answer without content_type
        const finalContent = this.finalText || this.pendingText;
        if (finalContent.trim()) {
          this.send({ event: "data", content: finalContent });
        }

        this.send({ event: "finish" });
        this.state = "done";
        break;
      }
    }
  }
}
