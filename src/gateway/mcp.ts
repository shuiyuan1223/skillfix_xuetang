/**
 * MCP (Model Context Protocol) Handler
 *
 * Exposes health tools via MCP protocol.
 */

import { healthTools } from "../tools/health-data.js";
import { gitTools } from "../tools/git-tools.js";
import { evolutionTools } from "../tools/evolution-tools.js";
import { getRemoteMCPToolDefinitions } from "../services/remote-mcp-client.js";

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
  private tools: Map<
    string,
    { name: string; description: string; parameters: any; execute: (args: any) => Promise<any> }
  > = new Map();

  /** Remote tool definitions loaded lazily */
  private remoteToolDefs: MCPTool[] = [];
  /** Remote tool executors keyed by tool name */
  private remoteToolExecutors: Map<string, (args: Record<string, unknown>) => Promise<unknown>> =
    new Map();
  private remoteToolsLoaded = false;

  constructor() {
    // Register all health tools
    for (const tool of healthTools) {
      this.tools.set(tool.name, tool);
    }
    // Register git tools
    for (const tool of gitTools) {
      this.tools.set(tool.name, tool);
    }
    // Register evolution tools
    for (const tool of evolutionTools) {
      this.tools.set(tool.name, tool);
    }
  }

  private get allTools() {
    return [...healthTools, ...gitTools, ...evolutionTools];
  }

  /**
   * Load remote MCP tool definitions (called once lazily).
   */
  private async ensureRemoteTools(): Promise<void> {
    if (this.remoteToolsLoaded) return;
    this.remoteToolsLoaded = true;

    try {
      const { getRemoteMCPTools } = await import("../services/remote-mcp-client.js");
      const defs = await getRemoteMCPToolDefinitions();
      const agentTools = await getRemoteMCPTools();

      // Build executor map from AgentTools
      for (const at of agentTools) {
        this.remoteToolExecutors.set(at.name, async (args) => {
          const result = await at.execute("mcp-call", args);
          // Extract text from AgentToolResult
          if (result.content && result.content.length > 0) {
            const text = result.content[0];
            if (typeof text === "object" && "text" in text) {
              try {
                return JSON.parse(text.text);
              } catch {
                return text.text;
              }
            }
          }
          return result.details ?? result;
        });
      }

      this.remoteToolDefs = defs.map((d) => ({
        name: d.name,
        description: d.description,
        inputSchema: {
          type: "object" as const,
          properties: (d.inputSchema as any)?.properties || {},
          required: (d.inputSchema as any)?.required,
        },
      }));

      if (defs.length > 0) {
        console.log(`[MCPHandler] Registered ${defs.length} remote MCP tools`);
      }
    } catch (err) {
      console.error("[MCPHandler] Failed to load remote MCP tools:", err);
    }
  }

  /**
   * List all available tools
   */
  async listTools(): Promise<MCPTool[]> {
    await this.ensureRemoteTools();

    const local = this.allTools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: {
        type: "object" as const,
        properties: tool.parameters.properties,
        required: "required" in tool.parameters ? (tool.parameters as any).required : undefined,
      },
    }));

    return [...local, ...this.remoteToolDefs];
  }

  /**
   * Call a tool
   */
  async callTool(call: MCPToolCall): Promise<MCPToolResult> {
    // Check local tools first
    const tool = this.tools.get(call.name);
    if (tool) {
      try {
        const result = await tool.execute(call.arguments as any);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }

    // Check remote tools
    await this.ensureRemoteTools();
    const remoteExecutor = this.remoteToolExecutors.get(call.name);
    if (remoteExecutor) {
      try {
        const result = await remoteExecutor(call.arguments);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }

    return {
      content: [{ type: "text", text: `Unknown tool: ${call.name}` }],
      isError: true,
    };
  }
}

// Singleton instance
export const mcpHandler = new MCPHandler();
