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

export type WSMessage =
  | PageMessage
  | A2UIMessage
  | ClearSurfaceMessage
  | AgentTextMessage
  | ToolCallMessage
  | ErrorMessage;

export interface PlotlyChart {
  elementId: string;
  traces: unknown[];
  layout: unknown;
  config: unknown;
}
