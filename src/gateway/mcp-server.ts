/**
 * MCP Streamable HTTP Server
 *
 * Standard JSON-RPC 2.0 endpoint for MCP protocol.
 * Wraps existing tool registry into MCP-compliant interface.
 */

import { healthTools } from "../tools/health-data.js";
import { gitTools } from "../tools/git-tools.js";
import { evolutionTools } from "../tools/evolution-tools.js";
import { configTools } from "../tools/config-tools.js";
import { getRemoteMCPToolDefinitions, getRemoteMCPTools } from "../services/remote-mcp-client.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("MCP-RPC");

// All local tools
const allLocalTools = [...healthTools, ...gitTools, ...evolutionTools, ...configTools];

// Tool registry for execution
const toolMap = new Map<string, { execute: (args: any) => Promise<any> }>();
for (const tool of allLocalTools) {
  toolMap.set(tool.name, tool);
}

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
        // Client acknowledgment — no response needed for notification
        // But since we received an id, respond with empty result
        if (id !== null) {
          return { jsonrpc: "2.0", id, result: {} };
        }
        // Notifications have no id — this shouldn't produce a response
        return null as any;
      }

      case "tools/list": {
        // Load remote tools lazily
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

        const tools = allLocalTools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: {
            type: "object" as const,
            properties: tool.parameters.properties,
            required: "required" in tool.parameters ? (tool.parameters as any).required : undefined,
          },
        }));

        return {
          jsonrpc: "2.0",
          id,
          result: { tools: [...tools, ...remoteToolDefs] },
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

        const tool = toolMap.get(params.name);
        if (!tool) {
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

        try {
          const result = await tool.execute(params.arguments || {});
          return {
            jsonrpc: "2.0",
            id,
            result: {
              content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            },
          };
        } catch (error) {
          return {
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: `Error: ${error instanceof Error ? error.message : String(error)}`,
                },
              ],
              isError: true,
            },
          };
        }
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
