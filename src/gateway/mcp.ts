/**
 * MCP (Model Context Protocol) Handler
 *
 * Thin wrapper around globalRegistry for legacy REST endpoints.
 * The primary MCP interface is now mcp-server.ts (JSON-RPC 2.0).
 */

import { globalRegistry } from '../tools/index.js';
import type { MCPToolResult } from '../tools/types.js';
import { getRemoteMCPToolDefinitions } from '../services/remote-mcp-client.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('MCP');

// MCP Tool Definition
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

// MCP Tool Call
export interface MCPToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

// MCPToolResult is imported from tools/types.ts and re-exported
export type { MCPToolResult } from '../tools/types.js';

/**
 * MCP Handler - Handles MCP protocol requests via legacy REST endpoints.
 * Delegates to globalRegistry for tool listing and execution.
 */
export class MCPHandler {
  /** Remote tool definitions loaded lazily */
  private remoteToolDefs: MCPTool[] = [];
  /** Remote tool executors keyed by tool name */
  private remoteToolExecutors: Map<string, (args: Record<string, unknown>) => Promise<unknown>> = new Map();
  private remoteToolsLoaded = false;

  /**
   * Load remote MCP tool definitions (called once lazily).
   */
  private async ensureRemoteTools(): Promise<void> {
    if (this.remoteToolsLoaded) {
      return;
    }
    this.remoteToolsLoaded = true;

    try {
      const { getRemoteMCPTools } = await import('../services/remote-mcp-client.js');
      const defs = await getRemoteMCPToolDefinitions();
      const agentTools = await getRemoteMCPTools();

      // Build executor map from AgentTools
      for (const at of agentTools) {
        this.remoteToolExecutors.set(at.name, async (args) => {
          const result = await at.execute('mcp-call', args);
          if (result.content && result.content.length > 0) {
            const text = result.content[0];
            if (typeof text === 'object' && 'text' in text) {
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
          type: 'object' as const,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          properties: (d.inputSchema as any)?.properties || {},
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          required: (d.inputSchema as any)?.required,
        },
      }));

      if (defs.length > 0) {
        log.info(`Registered ${defs.length} remote MCP tools`);
      }
    } catch (err) {
      log.error('Failed to load remote MCP tools', { error: err });
    }
  }

  /**
   * List all available tools
   */
  async listTools(): Promise<MCPTool[]> {
    await this.ensureRemoteTools();
    const local = globalRegistry.listTools() as MCPTool[];
    return [...local, ...this.remoteToolDefs];
  }

  /**
   * Call a tool
   */
  async callTool(call: MCPToolCall): Promise<MCPToolResult> {
    // Check local registry first
    if (globalRegistry.has(call.name)) {
      return globalRegistry.callTool(call.name, call.arguments);
    }

    // Check remote tools
    await this.ensureRemoteTools();
    const remoteExecutor = this.remoteToolExecutors.get(call.name);
    if (remoteExecutor) {
      try {
        const result = await remoteExecutor(call.arguments);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }

    return {
      content: [{ type: 'text', text: `Unknown tool: ${call.name}` }],
      isError: true,
    };
  }
}

// Singleton instance
export const mcpHandler = new MCPHandler();
