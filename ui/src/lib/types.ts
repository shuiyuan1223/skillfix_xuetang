export interface A2UIComponent {
  id: string;
  type: string;
  children?: string[];
  [key: string]: unknown;
}

export interface A2UISurfaceData {
  components: A2UIComponent[];
  root_id: string;
}

export interface PageMessage {
  type: "page";
  surfaces: {
    sidebar?: A2UISurfaceData;
    main?: A2UISurfaceData;
  };
}

export interface A2UIMessage {
  type: "a2ui";
  surface_id: string;
  components: A2UIComponent[];
  root_id: string;
}

export interface ClearSurfaceMessage {
  type: "clear_surface";
  surface_id: string;
}

export interface AgentTextMessage {
  type: "agent_text";
  content: string;
  is_final: boolean;
}

export interface ToolCallMessage {
  type: "tool_call";
  tool: string;
}

export interface ErrorMessage {
  type: "error";
  message: string;
}

// AG-UI Standard Events
export interface AGUIRunStarted {
  type: "RunStarted";
  threadId: string;
  runId: string;
}

export interface AGUIRunFinished {
  type: "RunFinished";
  threadId: string;
  runId: string;
}

export interface AGUITextMessageStart {
  type: "TextMessageStart";
  messageId: string;
  role: "assistant";
}

export interface AGUITextMessageContent {
  type: "TextMessageContent";
  messageId: string;
  delta: string;
}

export interface AGUITextMessageEnd {
  type: "TextMessageEnd";
  messageId: string;
}

export interface AGUIToolCallStart {
  type: "ToolCallStart";
  toolCallId: string;
  toolCallName: string;
  parentMessageId?: string;
}

export interface AGUIToolCallEnd {
  type: "ToolCallEnd";
  toolCallId: string;
}

export interface AGUIToolCallResult {
  type: "ToolCallResult";
  messageId: string;
  toolCallId: string;
  content?: string;
  cards?: { components: unknown[]; root_id: string };
}

export interface AGUICustom {
  type: "Custom";
  name: string;
  data: unknown;
}

export interface QuickReply {
  label: string;
  content: string;
  icon?: string;
  variant?: "primary" | "danger";
}

export type AGUIEvent =
  | AGUIRunStarted
  | AGUIRunFinished
  | AGUITextMessageStart
  | AGUITextMessageContent
  | AGUITextMessageEnd
  | AGUIToolCallStart
  | AGUIToolCallEnd
  | AGUIToolCallResult
  | AGUICustom;

// Parts message model
export type MessagePart =
  | { type: "text"; content: string }
  | {
      type: "tool_use";
      toolCallId: string;
      toolName: string;
      status: "running" | "completed" | "error";
    }
  | { type: "tool_result"; toolCallId: string; cards?: { components: unknown[]; root_id: string } };

export type WSMessage =
  | PageMessage
  | A2UIMessage
  | ClearSurfaceMessage
  | AgentTextMessage
  | ToolCallMessage
  | ErrorMessage
  | AGUIEvent;
