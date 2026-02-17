/**
 * Unified Tool Types
 *
 * Single definition source for all PHA tools.
 * Each tool is defined once with MCP standard fields + PHA metadata.
 */

export interface PHATool<TArgs = Record<string, unknown>> {
  // MCP standard fields
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  execute: (args: TArgs) => Promise<unknown>;

  // PHA metadata (single definition source)
  displayName: string;
  category: ToolCategory;
  icon?: string;
  companionSkill?: string;
  label?: string;
  sessionBound?: boolean;
}

export type ToolCategory =
  | "health"
  | "memory"
  | "skill"
  | "config"
  | "profile"
  | "presentation"
  | "planning"
  | "proactive"
  | "git"
  | "evolution"
  | "system"
  | "feedback";

export interface MCPToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}
