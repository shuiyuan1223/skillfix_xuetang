/**
 * Huawei OAuth Service
 *
 * Uses Chrome MCP to automate OAuth flow:
 * 1. Open Huawei auth page in browser
 * 2. User completes login
 * 3. Capture authorization code from redirect URL
 * 4. Exchange code for token
 */

import { loadConfig } from "../utils/config.js";
import { huaweiAuth } from "../data-sources/huawei/huawei-auth.js";
import { getUserStore } from "../data-sources/huawei/user-store.js";
import { tokenStore } from "../data-sources/huawei/token-store.js";

// OAuth state tracking
interface OAuthSession {
  status: "pending" | "waiting_login" | "success" | "error";
  pageId?: number;
  code?: string;
  error?: string;
  startedAt: number;
}

const oauthSessions = new Map<string, OAuthSession>();

/**
 * Generate Huawei OAuth URL
 * All scopes / redirectUri / authUrl come from config via HuaweiAuth.
 */
export function getHuaweiAuthUrl(state: string): string {
  const config = loadConfig();
  const clientId = config.dataSources.huawei?.clientId;

  if (!clientId) {
    throw new Error("Huawei client ID not configured");
  }

  // HuaweiAuth.getAuthUrl reads scopes/redirectUri/baseUrl from config
  const base = huaweiAuth.getAuthUrl(clientId);
  return `${base}&state=${encodeURIComponent(state)}`;
}

/**
 * Start OAuth session - returns auth URL for browser
 */
export function startOAuthSession(sessionId: string): { authUrl: string; sessionId: string } {
  const authUrl = getHuaweiAuthUrl(sessionId);

  oauthSessions.set(sessionId, {
    status: "pending",
    startedAt: Date.now(),
  });

  return { authUrl, sessionId };
}

/**
 * Get OAuth session status
 */
export function getOAuthSessionStatus(sessionId: string): OAuthSession | null {
  return oauthSessions.get(sessionId) || null;
}

/**
 * Complete OAuth with authorization code
 */
export async function completeOAuth(
  sessionId: string,
  code: string,
  userUuid?: string
): Promise<{ success: boolean; error?: string }> {
  const session = oauthSessions.get(sessionId);
  if (!session) {
    return { success: false, error: "Session not found" };
  }

  const config = loadConfig();
  const huaweiConfig = config.dataSources.huawei;

  if (!huaweiConfig?.clientId || !huaweiConfig?.clientSecret) {
    return { success: false, error: "Huawei credentials not configured" };
  }

  try {
    const redirectUri = huaweiConfig.redirectUri || "hms://redirect_url";

    // Exchange code for token
    const token = await huaweiAuth.exchangeCodeForUser(
      code,
      huaweiConfig.clientId,
      huaweiConfig.clientSecret,
      redirectUri
    );

    // Store token
    if (userUuid) {
      // Multi-user: store in SQLite
      const userStore = getUserStore();
      userStore.saveToken(userUuid, token);
    } else {
      // Single-user: store in file (CLI compatible)
      tokenStore.saveToken(token);
    }

    // Update session
    session.status = "success";
    session.code = code;

    return { success: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    session.status = "error";
    session.error = errorMsg;
    return { success: false, error: errorMsg };
  }
}

/**
 * Parse authorization code from redirect URL
 */
export function parseCodeFromUrl(url: string): string | null {
  // URL format: hms://redirect_url?code=xxx&state=xxx
  const match = url.match(/[?&]code=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Parse state from redirect URL
 */
export function parseStateFromUrl(url: string): string | null {
  const match = url.match(/[?&]state=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Clean up old sessions (older than 10 minutes)
 */
export function cleanupOldSessions(): void {
  const now = Date.now();
  const maxAge = 10 * 60 * 1000; // 10 minutes

  for (const [id, session] of oauthSessions) {
    if (now - session.startedAt > maxAge) {
      oauthSessions.delete(id);
    }
  }
}

// Cleanup old sessions periodically
setInterval(cleanupOldSessions, 60 * 1000);
