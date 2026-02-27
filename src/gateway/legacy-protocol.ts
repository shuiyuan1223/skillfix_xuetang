/**
 * Legacy Protocol Adapter
 *
 * State machine that converts Agent events into "边想边搜" SSE protocol.
 *
 * Content flow:
 *   Pre-tool reasoning  → buffered; flushed as reasoning when tool call is confirmed
 *   Post-tool answer    → streamed incrementally without content_type
 *   No-tool answer      → emitted in full at agent_end
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

const TOOL_LABELS: Record<string, string> = {
  get_health_data: "正在查询健康数据",
  get_heart_rate: "正在查询心率数据",
  get_sleep: "正在查询睡眠数据",
  get_workouts: "正在查询运动记录",
  get_weekly_summary: "正在生成每周摘要",
  get_stress: "正在查询压力数据",
  get_spo2: "正在查询血氧数据",
  get_health_trends: "正在分析健康趋势",
  get_blood_pressure: "正在查询血压数据",
  get_blood_glucose: "正在查询血糖数据",
  get_body_composition: "正在查询体成分数据",
  get_body_temperature: "正在查询体温数据",
  get_nutrition: "正在查询营养数据",
  get_menstrual_cycle: "正在查询生理周期数据",
  get_vo2max: "正在查询最大摄氧量数据",
  get_emotion: "正在查询情绪数据",
  get_hrv: "正在查询心率变异数据",
};

function toolLabel(toolName: string): string {
  return TOOL_LABELS[toolName] ?? "正在查询数据";
}

function extractText(content: unknown): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((b: any) => b?.type === "text")
      .map((b: any) => b.text ?? "")
      .join("");
  }
  return "";
}

export class LegacyProtocolAdapter {
  private state: AdapterState = "initial";
  private pendingText = "";
  private finalText = "";
  private hasToolCalled = false;
  private finalStreamStarted = false;

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

        const text = extractText(event.message.content);
        const delta = text.slice(this.pendingText.length);
        this.pendingText = text;

        if (!delta) break;

        if (this.hasToolCalled) {
          // Post-tool phase: stream directly as final answer
          if (!this.finalStreamStarted) {
            this.send({ event: "rag_status", content: "search_with_think" });
            this.finalStreamStarted = true;
          }
          this.send({ event: "data", content: delta });
        }
        // Pre-tool: buffer only — role not yet confirmed
        break;
      }

      case "message_end": {
        if (event.message?.role !== "assistant") break;

        const text = extractText(event.message.content);
        this.finalText = text || this.pendingText;
        this.state = "pending";
        this.pendingText = "";
        break;
      }

      case "tool_execution_start": {
        // Pre-tool buffered text is discarded — it's internal model thinking,
        // not meant for the user (often contains draft answers that would duplicate the final reply)
        this.finalText = "";

        this.hasToolCalled = true;
        if (this.state === "pending" || this.state === "reasoning") {
          this.state = "searching";
        }

        this.send({
          event: "data",
          content: `\n${toolLabel(event.toolName ?? "")}\n`,
          content_type: "reasoning",
        });
        break;
      }

      case "tool_execution_end": {
        this.send({ event: "rag_status", content: "start_search" });
        this.state = "reasoning";
        this.pendingText = "";
        this.finalText = "";
        break;
      }

      case "agent_end": {
        if (this.state === "done") break;

        if (!this.finalStreamStarted) {
          // No tool calls: emit everything at once
          this.send({ event: "rag_status", content: "search_with_think" });
          const content = this.finalText || this.pendingText;
          if (content.trim()) {
            this.send({ event: "data", content });
          }
        }

        this.send({ event: "finish" });
        this.state = "done";
        break;
      }
    }
  }
}
