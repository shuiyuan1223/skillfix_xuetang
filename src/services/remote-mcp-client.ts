/**
 * Remote MCP Client
 *
 * Connects to remote MCP servers via Streamable HTTP transport.
 * Discovers tools and bridges them as AgentTools for PHA Agent.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { Type } from "@sinclair/typebox";
import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { loadConfig, type RemoteMCPServerConfig } from "../utils/config.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("Service/RemoteMCP");

export class RemoteMCPClient {
  private client: Client | null = null;
  private transport: StreamableHTTPClientTransport | SSEClientTransport | null = null;
  private connected = false;
  readonly serverKey: string;
  readonly config: RemoteMCPServerConfig;

  constructor(serverKey: string, config: RemoteMCPServerConfig) {
    this.serverKey = serverKey;
    this.config = config;
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    const url = new URL(this.config.url);
    const headers: Record<string, string> = {};
    if (this.config.apiKey) {
      headers.Authorization = `Bearer ${this.config.apiKey}`;
    }

    this.client = new Client(
      { name: `pha-remote-${this.serverKey}`, version: "1.0.0" },
      { capabilities: {} }
    );

    // Try Streamable HTTP first, fall back to SSE
    try {
      this.transport = new StreamableHTTPClientTransport(url, {
        requestInit: { headers },
      });
      await this.client.connect(this.transport);
      this.connected = true;
      log.info(`[${this.serverKey}] Connected via Streamable HTTP`);
    } catch (_e) {
      log.info(`[${this.serverKey}] Streamable HTTP failed, trying SSE fallback...`);
      // Reset client for retry
      this.client = new Client(
        { name: `pha-remote-${this.serverKey}`, version: "1.0.0" },
        { capabilities: {} }
      );
      try {
        this.transport = new SSEClientTransport(url, {
          requestInit: { headers },
        });
        await this.client.connect(this.transport);
        this.connected = true;
        log.info(`[${this.serverKey}] Connected via SSE`);
      } catch (sseErr) {
        log.error(
          `[${this.serverKey}] Failed to connect`,
          sseErr instanceof Error ? sseErr.message : sseErr
        );
        this.client = null;
        this.transport = null;
        throw sseErr;
      }
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close();
      } catch {
        // ignore
      }
      this.client = null;
    }
    if (this.transport) {
      try {
        await this.transport.close();
      } catch {
        // ignore
      }
      this.transport = null;
    }
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async listTools(): Promise<
    Array<{
      name: string;
      description?: string;
      inputSchema?: Record<string, unknown>;
    }>
  > {
    if (!this.client) throw new Error(`[RemoteMCP:${this.serverKey}] Not connected`);
    const result = await this.client.listTools();
    return result.tools;
  }

  async callTool(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
    if (!this.client) throw new Error(`[RemoteMCP:${this.serverKey}] Not connected`);
    const result = await this.client.callTool({ name, arguments: args });

    // Extract text content
    if (result.content && Array.isArray(result.content)) {
      const textContent = result.content.find(
        (c: unknown) => (c as { type?: string }).type === "text"
      );
      if (textContent && typeof textContent === "object" && "text" in textContent) {
        const text = (textContent as { text: string }).text;
        try {
          return JSON.parse(text);
        } catch {
          return text;
        }
      }
    }
    return result;
  }
}

// ============================================================================
// Singleton connection pool
// ============================================================================

const clientPool = new Map<string, RemoteMCPClient>();

function getOrCreateClient(serverKey: string, config: RemoteMCPServerConfig): RemoteMCPClient {
  let client = clientPool.get(serverKey);
  if (client && client.config.url === config.url) return client;

  // URL changed — disconnect old one
  if (client) {
    client.disconnect().catch(() => {});
    clientPool.delete(serverKey);
  }

  client = new RemoteMCPClient(serverKey, config);
  clientPool.set(serverKey, client);
  return client;
}

/**
 * Disconnect all remote MCP clients (for shutdown cleanup).
 */
export async function disconnectAllRemoteMCPClients(): Promise<void> {
  const promises: Promise<void>[] = [];
  for (const client of clientPool.values()) {
    promises.push(client.disconnect());
  }
  await Promise.allSettled(promises);
  clientPool.clear();
}

// ============================================================================
// Bridge: remote MCP tools → AgentTool[]
// ============================================================================

/**
 * Build a TypeBox schema from a JSON Schema object returned by the remote MCP server.
 * We pass through properties as-is since TypeBox Type.Unsafe accepts raw JSON Schema.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function jsonSchemaToTypebox(inputSchema?: Record<string, unknown>) {
  if (!inputSchema || typeof inputSchema !== "object") {
    return Type.Object({});
  }
  // Use Type.Unsafe to wrap the raw JSON Schema so pi-agent accepts it
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return Type.Unsafe<Record<string, unknown>>(inputSchema as any);
}

/**
 * Connect to all configured remote MCP servers and return their tools as AgentTools.
 * Safe to call when no remoteServers are configured — returns [].
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getRemoteMCPTools(): Promise<AgentTool<any>[]> {
  const config = loadConfig();
  const servers = config.mcp?.remoteServers;
  if (!servers || Object.keys(servers).length === 0) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools: AgentTool<any>[] = [];

  for (const [serverKey, serverConfig] of Object.entries(servers)) {
    if (serverConfig.enabled === false) continue;

    const client = getOrCreateClient(serverKey, serverConfig);

    try {
      await client.connect();
      const remoteTools = await client.listTools();
      const displayName = serverConfig.name || serverKey;

      for (const rt of remoteTools) {
        const schema = jsonSchemaToTypebox(rt.inputSchema);
        const toolName = rt.name;

        tools.push({
          name: toolName,
          description: rt.description || `[${displayName}] ${toolName}`,
          label: toolName,
          parameters: schema,
          execute: async (
            _toolCallId: string,
            params: Record<string, unknown>
          ): Promise<AgentToolResult<unknown>> => {
            try {
              const result = await client.callTool(toolName, params);
              return {
                content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
                details: result,
              };
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              return {
                content: [{ type: "text", text: `Error calling ${toolName}: ${msg}` }],
                details: { error: msg },
              };
            }
          },
        });
      }

      log.info(`[${serverKey}] Registered ${remoteTools.length} tools from "${displayName}"`);
    } catch (err) {
      log.error(`[${serverKey}] Failed to load tools`, err instanceof Error ? err.message : err);
    }
  }

  return tools;
}

/**
 * Get raw remote tool definitions for MCP handler registration.
 * Returns { name, description, inputSchema } for each remote tool.
 */
export async function getRemoteMCPToolDefinitions(): Promise<
  Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
    serverKey: string;
  }>
> {
  const config = loadConfig();
  const servers = config.mcp?.remoteServers;
  if (!servers || Object.keys(servers).length === 0) return [];

  const defs: Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
    serverKey: string;
  }> = [];

  for (const [serverKey, serverConfig] of Object.entries(servers)) {
    if (serverConfig.enabled === false) continue;

    const client = getOrCreateClient(serverKey, serverConfig);
    try {
      await client.connect();
      const remoteTools = await client.listTools();

      for (const rt of remoteTools) {
        defs.push({
          name: rt.name,
          description: rt.description || rt.name,
          inputSchema: (rt.inputSchema as Record<string, unknown>) || {
            type: "object",
            properties: {},
          },
          serverKey,
        });
      }
    } catch {
      // Already logged in connect()
    }
  }

  return defs;
}
