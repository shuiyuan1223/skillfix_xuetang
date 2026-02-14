/**
 * Chrome DevTools MCP Client
 *
 * Connects to chrome-devtools-mcp server to control browser for OAuth flow.
 * Features:
 * - Configurable MCP server (command, args, browserUrl)
 * - Isolated (incognito-like) mode by default
 * - Reuses existing browser connection if available
 * - Monitors network/URL for OAuth code capture
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { loadConfig } from "../utils/config.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("Service/ChromeMCP");

export interface ChromePage {
  id: number;
  url: string;
  selected?: boolean;
}

export class ChromeMCPClient {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private connected = false;

  /**
   * Get MCP configuration from config file
   */
  private getMCPConfig() {
    const config = loadConfig();
    const mcpConfig = config.mcp?.chromeMcp || {};

    return {
      command: mcpConfig.command || "npx",
      args: mcpConfig.args || ["-y", "chrome-devtools-mcp@latest", "--isolated"],
      browserUrl: mcpConfig.browserUrl,
      wsEndpoint: mcpConfig.wsEndpoint,
    };
  }

  /**
   * Connect to chrome-devtools-mcp server
   * Uses configuration from config file, defaults to isolated mode
   */
  async connect(): Promise<void> {
    if (this.connected) {
      log.info("Already connected");
      return;
    }

    const mcpConfig = this.getMCPConfig();
    log.info("Starting chrome-devtools-mcp server...");
    log.debug("Config", mcpConfig);

    // Build args with optional browserUrl/wsEndpoint
    const args = [...mcpConfig.args];
    if (mcpConfig.browserUrl) {
      args.push("--browserUrl", mcpConfig.browserUrl);
    }
    if (mcpConfig.wsEndpoint) {
      args.push("--wsEndpoint", mcpConfig.wsEndpoint);
    }

    // Create transport - it spawns the process automatically
    this.transport = new StdioClientTransport({
      command: mcpConfig.command,
      args,
      stderr: "pipe",
    });

    // Log stderr for debugging
    const stderrStream = this.transport.stderr;
    if (stderrStream) {
      stderrStream.on("data", (data: Buffer) => {
        const msg = data.toString().trim();
        if (msg) {
          log.debug("stderr: " + msg);
        }
      });
    }

    this.client = new Client({ name: "pha-oauth-client", version: "1.0.0" }, { capabilities: {} });

    try {
      await this.client.connect(this.transport);
      this.connected = true;
      log.info("Connected to MCP server");
    } catch (error) {
      log.error("Failed to connect", error);
      throw error;
    }
  }

  /**
   * Disconnect from server
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close();
      } catch (e) {
        log.warn("Error closing client", e);
      }
      this.client = null;
    }
    if (this.transport) {
      try {
        await this.transport.close();
      } catch (e) {
        log.warn("Error closing transport", e);
      }
      this.transport = null;
    }
    this.connected = false;
    log.info("Disconnected");
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Call a tool on the MCP server
   */
  private async callTool(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
    if (!this.client) {
      throw new Error("Not connected to MCP server");
    }

    log.debug(`Calling tool: ${name}`, JSON.stringify(args).slice(0, 100));
    const result = await this.client.callTool({ name, arguments: args });
    log.debug(`Tool result`, JSON.stringify(result).slice(0, 200));

    // Parse the result content
    if (result.content && Array.isArray(result.content)) {
      const textContent = result.content.find((c: unknown) => {
        const item = c as { type?: string };
        return item.type === "text";
      });
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

  /**
   * List open pages
   */
  async listPages(): Promise<string> {
    const result = await this.callTool("list_pages");
    return result as string;
  }

  /**
   * Open a new page with URL
   */
  async newPage(url: string): Promise<unknown> {
    return await this.callTool("new_page", { url });
  }

  /**
   * Navigate current page to URL
   */
  async navigatePage(url: string): Promise<unknown> {
    return await this.callTool("navigate_page", { type: "url", url });
  }

  /**
   * Select a page by ID
   */
  async selectPage(pageId: number): Promise<void> {
    await this.callTool("select_page", { pageId });
  }

  /**
   * Get current page URL via evaluate_script
   */
  async getCurrentUrl(): Promise<string> {
    const result = await this.callTool("evaluate_script", {
      function: "() => window.location.href",
    });
    return String(result);
  }

  /**
   * Get all network entries from Performance API
   */
  async getNetworkEntries(): Promise<Array<{ name: string; entryType: string }>> {
    const result = await this.callTool("evaluate_script", {
      function: `() => {
        const entries = performance.getEntriesByType('navigation')
          .concat(performance.getEntriesByType('resource'));
        return entries.map(e => ({ name: e.name, entryType: e.entryType }));
      }`,
    });
    return (result as Array<{ name: string; entryType: string }>) || [];
  }

  /**
   * List all network requests using Chrome DevTools Network API
   * This captures all requests including XHR, redirects, etc.
   */
  async listNetworkRequests(): Promise<string> {
    const result = await this.callTool("list_network_requests", {});
    return String(result);
  }

  /**
   * Get a specific network request by ID
   */
  async getNetworkRequest(requestId: string): Promise<unknown> {
    return await this.callTool("get_network_request", { requestId });
  }

  /**
   * Close a page by ID
   */
  async closePage(pageId: number): Promise<void> {
    await this.callTool("close_page", { pageId });
  }

  /**
   * Take a snapshot of the page
   */
  async takeSnapshot(): Promise<string> {
    const result = await this.callTool("take_snapshot");
    return String(result);
  }

  /**
   * Get all network requests including failed navigations (for hms:// capture)
   * Uses a script that captures any redirect attempts to hms:// protocol
   */
  async checkForHmsRedirect(): Promise<string | null> {
    const result = await this.callTool("evaluate_script", {
      function: `() => {
        // Check if there's a pending redirect to hms:// stored by our observer
        if (window.__hmsRedirectUrl) {
          return window.__hmsRedirectUrl;
        }
        // Check all links and forms for hms:// action
        const links = document.querySelectorAll('a[href^="hms://"]');
        for (const link of links) {
          if (link.href.includes('code=')) {
            return link.href;
          }
        }
        // Check for any script that might set location to hms://
        const scripts = document.querySelectorAll('script');
        for (const script of scripts) {
          const text = script.textContent || '';
          const match = text.match(/hms:\\/\\/redirect_url\\?[^"'\\s]+code=([^"'\\s&]+)/);
          if (match) {
            return 'hms://redirect_url?code=' + match[1];
          }
        }
        return null;
      }`,
    });
    const url = result as string | null;
    if (url && url.includes("code=")) {
      return url;
    }
    return null;
  }

  /**
   * Install a redirect observer to capture hms:// redirects
   */
  async installRedirectObserver(): Promise<void> {
    await this.callTool("evaluate_script", {
      function: `() => {
        if (window.__hmsObserverInstalled) return;
        window.__hmsObserverInstalled = true;

        // Override window.location setter to capture hms:// redirects
        const originalLocation = Object.getOwnPropertyDescriptor(window, 'location');

        // Listen for beforeunload to capture redirect attempts
        window.addEventListener('beforeunload', (e) => {
          // Try to capture the target URL
          console.log('[PHA] beforeunload event');
        });

        // Intercept link clicks
        document.addEventListener('click', (e) => {
          const link = e.target.closest('a');
          if (link && link.href && link.href.startsWith('hms://')) {
            window.__hmsRedirectUrl = link.href;
            console.log('[PHA] Captured hms:// redirect:', link.href);
          }
        }, true);

        // Monitor for dynamic redirects via MutationObserver
        const observer = new MutationObserver((mutations) => {
          for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
              if (node.nodeType === 1) {
                const el = node;
                if (el.tagName === 'A' && el.href && el.href.startsWith('hms://')) {
                  window.__hmsRedirectUrl = el.href;
                }
                if (el.tagName === 'SCRIPT') {
                  const text = el.textContent || '';
                  const match = text.match(/hms:\\/\\/[^"'\\s]+/);
                  if (match) {
                    window.__hmsRedirectUrl = match[0];
                  }
                }
              }
            }
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });

        console.log('[PHA] Redirect observer installed');
      }`,
    });
  }

  /**
   * Wait for URL to match pattern or network request containing code (polling)
   */
  async waitForCodeInUrlOrNetwork(
    options: { timeout?: number; pollInterval?: number } = {}
  ): Promise<string> {
    const { timeout = 180000, pollInterval = 1000 } = options;
    const startTime = Date.now();
    const codePattern = /[?&]code=([^&]+)/;

    log.info("Waiting for OAuth code in URL or network...");

    // Install redirect observer
    try {
      await this.installRedirectObserver();
    } catch (e) {
      log.warn("Could not install redirect observer", e);
    }

    while (Date.now() - startTime < timeout) {
      try {
        // Check current URL
        const url = await this.getCurrentUrl();
        log.debug(`Current URL: ${url.slice(0, 80)}...`);

        // Check if URL contains code (for hms:// redirect)
        const urlMatch = url.match(codePattern);
        if (urlMatch) {
          const code = decodeURIComponent(urlMatch[1]);
          log.info("Found code in URL!");
          return code;
        }

        // Check for captured hms:// redirect
        try {
          const hmsUrl = await this.checkForHmsRedirect();
          if (hmsUrl) {
            const hmsMatch = hmsUrl.match(codePattern);
            if (hmsMatch) {
              const code = decodeURIComponent(hmsMatch[1]);
              log.info(`Found code in hms:// redirect: ${hmsUrl.slice(0, 50)}...`);
              return code;
            }
          }
        } catch (e) {
          // Ignore errors
        }

        // Check Chrome DevTools network requests for code
        try {
          const networkData = await this.listNetworkRequests();
          log.debug(`Network requests: ${networkData.slice(0, 200)}...`);

          // Search for code in network data
          const networkMatch = networkData.match(codePattern);
          if (networkMatch) {
            const code = decodeURIComponent(networkMatch[1]);
            log.info("Found code in network requests!");
            return code;
          }
        } catch (e) {
          log.warn("Error getting network requests", e);
        }

        // Also check Performance API entries as fallback
        try {
          const entries = await this.getNetworkEntries();
          for (const entry of entries) {
            const entryMatch = entry.name.match(codePattern);
            if (entryMatch) {
              const code = decodeURIComponent(entryMatch[1]);
              log.info(`Found code in performance entry: ${entry.name.slice(0, 50)}...`);
              return code;
            }
          }
        } catch (e) {
          // Performance entries might not be available
        }
      } catch (e) {
        // Page might be navigating, ignore errors
        log.warn("Error checking", e);
      }
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error(`Timeout waiting for OAuth code after ${timeout / 1000}s`);
  }
}

// Singleton instance
let _client: ChromeMCPClient | null = null;

export function getChromeMCPClient(): ChromeMCPClient {
  if (!_client) {
    _client = new ChromeMCPClient();
  }
  return _client;
}

/**
 * Run the full OAuth flow using Chrome MCP
 *
 * Flow:
 * 1. Connect to MCP server (reuses if already connected)
 * 2. Open auth URL in new page (isolated mode)
 * 3. Wait for user to complete login
 * 4. Capture code from redirect URL or network request
 */
export async function runOAuthFlowWithChrome(
  authUrl: string,
  options: { timeout?: number } = {}
): Promise<{ code: string } | { error: string }> {
  const { timeout = 180000 } = options; // 3 minutes default
  const client = getChromeMCPClient();

  try {
    // Connect to MCP server (will reuse if already connected)
    await client.connect();

    // Open auth URL in new page
    log.info(`Opening auth URL: ${authUrl.slice(0, 100)}...`);
    await client.newPage(authUrl);

    // Wait for code in URL or network
    const code = await client.waitForCodeInUrlOrNetwork({ timeout, pollInterval: 1000 });

    log.info(`Got authorization code: ${code.slice(0, 10)}...`);
    return { code };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error("OAuth error", message);
    return { error: message };
  }
  // Note: Don't disconnect here to allow reuse
}
