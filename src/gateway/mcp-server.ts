/**
 * MCP Streamable HTTP Server
 *
 * Standard JSON-RPC 2.0 endpoint for MCP protocol.
 * Uses globalRegistry as single source of truth for all tools.
 */

import { globalRegistry } from "../tools/index.js";
import { getRemoteMCPToolDefinitions, getRemoteMCPTools } from "../services/remote-mcp-client.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("MCP-RPC");

// JSON-RPC 2.0 types
interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

// MCP server info
const SERVER_INFO = {
  name: "pha-health",
  version: "1.0.0",
};

const PROTOCOL_VERSION = "2024-11-05";

/**
 * Handle a single JSON-RPC 2.0 MCP request.
 */
export async function handleMCPRequest(body: unknown): Promise<JsonRpcResponse> {
  const req = body as JsonRpcRequest;

  if (!req.jsonrpc || req.jsonrpc !== "2.0" || !req.method) {
    return {
      jsonrpc: "2.0",
      id: req?.id ?? null,
      error: { code: -32600, message: "Invalid Request" },
    };
  }

  const id = req.id ?? null;

  try {
    switch (req.method) {
      case "initialize": {
        return {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: {
              tools: { listChanged: false },
            },
            serverInfo: SERVER_INFO,
          },
        };
      }

      case "notifications/initialized": {
        if (id !== null) {
          return { jsonrpc: "2.0", id, result: {} };
        }
        return null as any;
      }

      case "tools/list": {
        // Local tools from registry
        const localTools = globalRegistry.listTools();

        // Remote tools (lazy load)
        let remoteToolDefs: Array<{ name: string; description: string; inputSchema: unknown }> = [];
        try {
          remoteToolDefs = (await getRemoteMCPToolDefinitions()).map((d) => ({
            name: d.name,
            description: d.description,
            inputSchema: d.inputSchema || { type: "object", properties: {} },
          }));
        } catch {
          // Remote tools unavailable
        }

        return {
          jsonrpc: "2.0",
          id,
          result: { tools: [...localTools, ...remoteToolDefs] },
        };
      }

      case "tools/call": {
        const params = req.params as
          | { name: string; arguments?: Record<string, unknown> }
          | undefined;
        if (!params?.name) {
          return {
            jsonrpc: "2.0",
            id,
            error: { code: -32602, message: "Missing tool name" },
          };
        }

        // Try local registry first
        if (globalRegistry.has(params.name)) {
          const result = await globalRegistry.callTool(params.name, params.arguments || {});
          return { jsonrpc: "2.0", id, result };
        }

        // Try remote tools
        try {
          const remoteTools = await getRemoteMCPTools();
          const remoteTool = remoteTools.find((t) => t.name === params.name);
          if (remoteTool) {
            const result = await remoteTool.execute("mcp-call", params.arguments || {});
            const text = result.content?.[0];
            const textStr =
              typeof text === "object" && "text" in text ? text.text : JSON.stringify(result);
            return {
              jsonrpc: "2.0",
              id,
              result: {
                content: [{ type: "text", text: textStr }],
              },
            };
          }
        } catch {
          // Remote tools unavailable
        }

        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32602, message: `Unknown tool: ${params.name}` },
        };
      }

      case "ping": {
        return { jsonrpc: "2.0", id, result: {} };
      }

      default: {
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `Method not found: ${req.method}` },
        };
      }
    }
  } catch (error) {
    log.error("MCP request failed", { method: req.method, error });
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32603,
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}
