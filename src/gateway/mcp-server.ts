/**
 * MCP Streamable HTTP Server
 *
 * Standard JSON-RPC 2.0 endpoint for MCP protocol.
 * Uses globalRegistry as single source of truth for all tools.
 */

import { globalRegistry } from '../tools/index.js';
import { getRemoteMCPToolDefinitions, getRemoteMCPTools } from '../services/remote-mcp-client.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('MCP-RPC');

// JSON-RPC 2.0 types
interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

// MCP server info
const SERVER_INFO = {
  name: 'pha-health',
  version: '1.0.0',
};

const PROTOCOL_VERSION = '2024-11-05';

function makeResult(id: string | number | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result };
}

function makeError(id: string | number | null, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

function handleInitialize(id: string | number | null): JsonRpcResponse {
  return makeResult(id, {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: { tools: { listChanged: false } },
    serverInfo: SERVER_INFO,
  });
}

function handleNotificationsInitialized(id: string | number | null): JsonRpcResponse {
  if (id !== null) {
    return makeResult(id, {});
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return null as any;
}

async function handleToolsList(id: string | number | null): Promise<JsonRpcResponse> {
  const localTools = globalRegistry.listTools();

  let remoteToolDefs: Array<{ name: string; description: string; inputSchema: unknown }> = [];
  try {
    remoteToolDefs = (await getRemoteMCPToolDefinitions()).map((d) => ({
      name: d.name,
      description: d.description,
      inputSchema: d.inputSchema || { type: 'object', properties: {} },
    }));
  } catch {
    // Remote tools unavailable
  }

  return makeResult(id, { tools: [...localTools, ...remoteToolDefs] });
}

async function handleToolsCall(
  id: string | number | null,
  params: Record<string, unknown> | undefined
): Promise<JsonRpcResponse> {
  const p = params as { name: string; arguments?: Record<string, unknown> } | undefined;
  if (!p?.name) {
    return makeError(id, -32602, 'Missing tool name');
  }

  if (globalRegistry.has(p.name)) {
    const result = await globalRegistry.callTool(p.name, p.arguments || {});
    return makeResult(id, result);
  }

  try {
    const remoteTools = await getRemoteMCPTools();
    const remoteTool = remoteTools.find((t) => t.name === p.name);
    if (remoteTool) {
      const result = await remoteTool.execute('mcp-call', p.arguments || {});
      const text = result.content?.[0];
      const textStr = typeof text === 'object' && 'text' in text ? text.text : JSON.stringify(result);
      return makeResult(id, { content: [{ type: 'text', text: textStr }] });
    }
  } catch {
    // Remote tools unavailable
  }

  return makeError(id, -32602, `Unknown tool: ${p.name}`);
}

type McpMethodHandler = (
  id: string | number | null,
  params: Record<string, unknown> | undefined
) => JsonRpcResponse | Promise<JsonRpcResponse>;

const MCP_METHOD_HANDLERS: Record<string, McpMethodHandler> = {
  initialize: (id) => handleInitialize(id),
  'notifications/initialized': (id) => handleNotificationsInitialized(id),
  'tools/list': (id) => handleToolsList(id),
  'tools/call': (id, params) => handleToolsCall(id, params),
  ping: (id) => makeResult(id, {}),
};

/**
 * Handle a single JSON-RPC 2.0 MCP request.
 */
export async function handleMCPRequest(body: unknown): Promise<JsonRpcResponse> {
  const req = body as JsonRpcRequest;

  if (!req.jsonrpc || req.jsonrpc !== '2.0' || !req.method) {
    return makeError(req?.id ?? null, -32600, 'Invalid Request');
  }

  const id = req.id ?? null;

  try {
    const handler = MCP_METHOD_HANDLERS[req.method];
    if (handler) {
      return await handler(id, req.params);
    }
    return makeError(id, -32601, `Method not found: ${req.method}`);
  } catch (error) {
    log.error('MCP request failed', { method: req.method, error });
    return makeError(id, -32603, error instanceof Error ? error.message : String(error));
  }
}
