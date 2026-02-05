/**
 * MCP (Model Context Protocol) Handler
 *
 * Exposes health tools via MCP protocol.
 */

import { healthTools } from "../tools/health-data.js";

// MCP Tool Definition
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

// MCP Tool Call
export interface MCPToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

// MCP Tool Result
export interface MCPToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

/**
 * MCP Handler - Handles MCP protocol requests
 */
export class MCPHandler {
  private tools: Map<string, typeof healthTools[number]> = new Map();

  constructor() {
    // Register all health tools
    for (const tool of healthTools) {
      this.tools.set(tool.name, tool);
    }
  }

  /**
   * List all available tools
   */
  listTools(): MCPTool[] {
    return healthTools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: {
        type: "object" as const,
        properties: tool.parameters.properties,
        required: "required" in tool.parameters ? tool.parameters.required : undefined,
      },
    }));
  }

  /**
   * Call a tool
   */
  async callTool(call: MCPToolCall): Promise<MCPToolResult> {
    const tool = this.tools.get(call.name);
    if (!tool) {
      return {
        content: [{ type: "text", text: `Unknown tool: ${call.name}` }],
        isError: true,
      };
    }

    try {
      const result = await tool.execute(call.arguments as any);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      };
    }
  }
}

// Singleton instance
export const mcpHandler = new MCPHandler();
