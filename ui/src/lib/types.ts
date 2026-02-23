// ==================== A2UI v0.8 Standard ====================
export type BoundValue =
  | { literalString: string }
  | { literalNumber: number }
  | { literalBoolean: boolean }
  | { literalArray: unknown[] }
  | { literalObject: unknown }
  | { path: string };

export type ChildrenValue = { explicitList: string[] };

export interface A2UIComponent {
  id: string;
  component: Record<string, Record<string, BoundValue | ChildrenValue>>;
}

export interface A2UISurfaceData {
  components: A2UIComponent[];
  root_id: string;
}

export interface SurfaceUpdateMessage {
  surfaceUpdate: { surfaceId: string; components: A2UIComponent[] };
}
export interface BeginRenderingMessage {
  beginRendering: { surfaceId: string; root: string; catalogId?: string };
}
export interface DeleteSurfaceMessage {
  deleteSurface: { surfaceId: string };
}

export function componentType(c: A2UIComponent): string {
  return Object.keys(c.component)[0] || "";
}

export function prop(c: A2UIComponent, key: string): unknown {
  const props = c.component[componentType(c)];
  if (!props) return undefined;
  const bv = props[key];
  if (!bv) return undefined;
  if ("literalString" in bv) return bv.literalString;
  if ("literalNumber" in bv) return bv.literalNumber;
  if ("literalBoolean" in bv) return bv.literalBoolean;
  if ("literalArray" in bv) return bv.literalArray;
  if ("literalObject" in bv) return bv.literalObject;
  if ("explicitList" in bv) return bv.explicitList;
  if ("path" in bv) return bv.path;
  return undefined;
}

export function getChildren(c: A2UIComponent): string[] {
  const ch = c.component[componentType(c)]?.children;
  if (ch && "explicitList" in ch) return ch.explicitList;
  return [];
}

export function toBoundValue(v: unknown): BoundValue {
  if (typeof v === "string") return { literalString: v };
  if (typeof v === "number") return { literalNumber: v };
  if (typeof v === "boolean") return { literalBoolean: v };
  if (Array.isArray(v)) return { literalArray: v };
  return { literalObject: v };
}

export function withProp(c: A2UIComponent, key: string, value: unknown): A2UIComponent {
  const typeName = componentType(c);
  return {
    ...c,
    component: {
      [typeName]: { ...c.component[typeName], [key]: toBoundValue(value) },
    },
  };
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
  displayName?: string;
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
      displayName?: string;
      progressData?: { current: number; total: number };
    }
  | { type: "tool_result"; toolCallId: string; cards?: { components: unknown[]; root_id: string } };

export type WSMessage =
  | SurfaceUpdateMessage
  | BeginRenderingMessage
  | DeleteSurfaceMessage
  | AgentTextMessage
  | ToolCallMessage
  | ErrorMessage
  | AGUIEvent;
