/**
 * Huawei OAuth 2.0 Authentication
 *
 * Handles OAuth flow for Huawei Health Kit API.
 */

import { loadConfig } from "../../utils/config.js";
import { TokenStore, tokenStore as defaultTokenStore } from "./token-store.js";
import { UserStore, getUserStore } from "./user-store.js";
import type { HuaweiTokenResponse, TokenData } from "./huawei-types.js";

// Huawei OAuth endpoints (defaults, can be overridden in config)
const DEFAULT_AUTH_URL = "https://oauth-login.cloud.huawei.com/oauth2/v3/authorize";
const DEFAULT_TOKEN_URL = "https://oauth-login.cloud.huawei.com/oauth2/v3/token";
const DEFAULT_REDIRECT_URI = "hms://redirect_url";

// Default scopes — used only when config.scopes is not set
const DEFAULT_SCOPES = [
  "openid",
  "https://www.huawei.com/healthkit/step.read",
  "https://www.huawei.com/healthkit/calories.read",
  "https://www.huawei.com/healthkit/distance.read",
  "https://www.huawei.com/healthkit/heartrate.read",
  "https://www.huawei.com/healthkit/sleep.read",
  "https://www.huawei.com/healthkit/activity.read",
  "https://www.huawei.com/healthkit/activityrecord.read",
  "https://www.huawei.com/healthkit/stress.read",
  "https://www.huawei.com/healthkit/oxygensaturation.read",
  "https://www.huawei.com/healthkit/hearthealth.read",
  "https://www.huawei.com/healthkit/bloodpressure.read",
  "https://www.huawei.com/healthkit/bloodglucose.read",
  "https://www.huawei.com/healthkit/heightweight.read",
  "https://www.huawei.com/healthkit/bodytemperature.read",
  "https://www.huawei.com/healthkit/nutrition.read",
  "https://www.huawei.com/healthkit/reproductive.read",
  "https://www.huawei.com/healthkit/pulmonary.read",
  "https://www.huawei.com/healthkit/emotion.read",
];

function getConfigAuthBaseUrl(): string {
  const config = loadConfig();
  return config.dataSources.huawei?.authUrl || DEFAULT_AUTH_URL;
}

function getConfigTokenUrl(): string {
  const config = loadConfig();
  return config.dataSources.huawei?.tokenUrl || DEFAULT_TOKEN_URL;
}

function getConfigScopes(): string[] {
  const config = loadConfig();
  return config.dataSources.huawei?.scopes || DEFAULT_SCOPES;
}

function getConfigRedirectUri(): string {
  const config = loadConfig();
  return config.dataSources.huawei?.redirectUri || DEFAULT_REDIRECT_URI;
}

export class HuaweiAuth {
  private tokenStore: TokenStore;

  constructor(tokenStore: TokenStore = defaultTokenStore) {
    this.tokenStore = tokenStore;
  }

  /**
   * Generate OAuth authorization URL
   * All params read from config; explicit args can override.
   */
  getAuthUrl(clientId: string, redirectUri?: string, scopes?: string[]): string {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri || getConfigRedirectUri(),
      scope: (scopes || getConfigScopes()).join(" "),
      access_type: "offline", // Request refresh token
    });

    return `${getConfigAuthBaseUrl()}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCode(
    code: string,
    clientId: string,
    clientSecret: string,
    redirectUri: string
  ): Promise<TokenData> {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    });

    const response = await fetch(getConfigTokenUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to exchange code: ${error}`);
    }

    const data = (await response.json()) as HuaweiTokenResponse;
    const tokenData = this.tokenResponseToData(data);

    // Store the token
    this.tokenStore.saveToken(tokenData);

    return tokenData;
  }

  /**
   * Refresh the access token using refresh token
   */
  async refreshToken(
    refreshToken: string,
    clientId: string,
    clientSecret: string
  ): Promise<TokenData> {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    });

    const response = await fetch(getConfigTokenUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to refresh token: ${error}`);
    }

    const data = (await response.json()) as HuaweiTokenResponse;
    const tokenData = this.tokenResponseToData(data);

    // Huawei may not return a new refresh_token on refresh — preserve the old one
    if (!tokenData.refreshToken) {
      tokenData.refreshToken = refreshToken;
    }

    // Store the new token
    this.tokenStore.saveToken(tokenData);

    return tokenData;
  }

  /**
   * Ensure we have a valid access token
   * Will refresh if needed
   */
  async ensureValidToken(): Promise<string> {
    const token = this.tokenStore.getToken();

    if (!token) {
      throw new Error("No token stored. Please run 'pha huawei auth' to authorize.");
    }

    // If token is still valid, return it
    if (!this.tokenStore.needsRefresh(token)) {
      return token.accessToken;
    }

    // Token needs refresh
    const config = loadConfig();
    const huaweiConfig = config.dataSources.huawei;

    if (!huaweiConfig?.clientId || !huaweiConfig?.clientSecret) {
      throw new Error("Huawei credentials not configured. Run 'pha huawei setup' first.");
    }

    const newToken = await this.refreshToken(
      token.refreshToken,
      huaweiConfig.clientId,
      huaweiConfig.clientSecret
    );

    return newToken.accessToken;
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return this.tokenStore.hasValidToken();
  }

  /**
   * Clear stored token (logout)
   */
  logout(): void {
    this.tokenStore.deleteToken();
  }

  /**
   * Convert token response to stored format
   */
  private tokenResponseToData(response: HuaweiTokenResponse): TokenData {
    return {
      accessToken: response.access_token,
      refreshToken: response.refresh_token || "",
      expiresAt: Date.now() + response.expires_in * 1000,
      tokenType: response.token_type,
      scope: response.scope,
    };
  }

  // ============================================================================
  // Multi-user methods (for Web OAuth flow)
  // ============================================================================

  /**
   * Exchange authorization code for tokens (for specific user)
   * Does not store token - returns it for caller to store in UserStore.
   * Also extracts Huawei user ID from id_token if present.
   */
  async exchangeCodeForUser(
    code: string,
    clientId: string,
    clientSecret: string,
    redirectUri: string
  ): Promise<{ tokenData: TokenData; huaweiUserId?: string }> {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    });

    const response = await fetch(getConfigTokenUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to exchange code: ${error}`);
    }

    const data = (await response.json()) as HuaweiTokenResponse;
    const tokenData = this.tokenResponseToData(data);

    // Extract Huawei user ID: try id_token first, then UserInfo endpoint
    let huaweiUserId: string | undefined;
    if (data.id_token) {
      try {
        huaweiUserId = decodeIdToken(data.id_token);
      } catch (e) {
        console.error("[Huawei/Auth] id_token decode failed:", e);
      }
    } else {
      console.warn(
        "[Huawei/Auth] Token response has no id_token, keys:",
        Object.keys(data).join(",")
      );
    }
    if (!huaweiUserId) {
      try {
        huaweiUserId = await fetchUserInfoSub(tokenData.accessToken);
      } catch (e) {
        console.error("[Huawei/Auth] UserInfo fallback failed:", e);
      }
    }

    return { tokenData, huaweiUserId };
  }

  /**
   * Refresh token for a specific user
   * Does not store token - returns it for caller to store in UserStore
   */
  async refreshTokenForUser(
    refreshToken: string,
    clientId: string,
    clientSecret: string
  ): Promise<TokenData> {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    });

    const response = await fetch(getConfigTokenUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to refresh token: ${error}`);
    }

    const data = (await response.json()) as HuaweiTokenResponse;
    const tokenData = this.tokenResponseToData(data);

    // Huawei may not return a new refresh_token on refresh — preserve the old one
    if (!tokenData.refreshToken) {
      tokenData.refreshToken = refreshToken;
    }

    return tokenData;
  }

  /**
   * Ensure we have a valid access token for a specific user
   * Will refresh if needed, using UserStore
   */
  async ensureValidTokenForUser(uuid: string, userStore?: UserStore): Promise<string> {
    const store = userStore || getUserStore();
    const token = store.getTokenData(uuid);

    if (!token) {
      throw new Error("User not authenticated. Please authorize via the web UI.");
    }

    // If token is still valid, return it
    if (!store.needsRefresh(uuid)) {
      return token.accessToken;
    }

    // Token needs refresh
    const config = loadConfig();
    const huaweiConfig = config.dataSources.huawei;

    if (!huaweiConfig?.clientId || !huaweiConfig?.clientSecret) {
      throw new Error("Huawei credentials not configured. Run 'pha huawei setup' first.");
    }

    const newToken = await this.refreshTokenForUser(
      token.refreshToken,
      huaweiConfig.clientId,
      huaweiConfig.clientSecret
    );

    // Store the new token
    store.saveToken(uuid, newToken);

    return newToken.accessToken;
  }

  /**
   * Check if a specific user is authenticated (via UserStore)
   */
  isUserAuthenticated(uuid: string, userStore?: UserStore): boolean {
    const store = userStore || getUserStore();
    return store.isAuthenticated(uuid);
  }

  /**
   * Refresh token and resolve Huawei user ID in one step.
   * Intended for external callers (e.g. /api/query) that supply a refresh_token directly.
   */
  async refreshTokenAndGetUserId(
    refreshToken: string,
    clientId: string,
    clientSecret: string
  ): Promise<{ tokenData: TokenData; userId: string }> {
    const tokenData = await this.refreshTokenForUser(refreshToken, clientId, clientSecret);
    const userId = await fetchUserInfoSub(tokenData.accessToken);
    return { tokenData, userId };
  }
}

/**
 * Decode a JWT id_token and extract the `sub` claim (Huawei user ID).
 * Only decodes the payload (no signature verification — token comes from trusted HTTPS exchange).
 */
export function decodeIdToken(idToken: string): string {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("Invalid id_token format");
  const payload = JSON.parse(
    Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8")
  );
  if (!payload.sub) throw new Error("id_token missing sub claim");
  return payload.sub;
}

/**
 * Fetch user ID from Huawei OIDC UserInfo endpoint using access_token.
 * Fallback when id_token is not present in the token response.
 */
/**
 * Fetch user ID via Huawei's proprietary getTokenInfo API.
 * POST https://oauth-api.cloud.huawei.com/rest.php
 *   nsp_svc=huawei.oauth2.user.getTokenInfo&access_token=...&open_id=OPENID
 */
async function fetchUserInfoSub(accessToken: string): Promise<string> {
  const url = "https://oauth-api.cloud.huawei.com/rest.php";
  const body = new URLSearchParams({
    nsp_svc: "huawei.oauth2.user.getTokenInfo",
    open_id: "OPENID",
    access_token: accessToken,
  });

  console.log("[Huawei/Auth] Fetching getTokenInfo from:", url);
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    console.error("[Huawei/Auth] getTokenInfo failed:", response.status, text.slice(0, 300));
    throw new Error(`getTokenInfo request failed: ${response.status}`);
  }
  const data = (await response.json()) as Record<string, unknown>;
  console.log("[Huawei/Auth] getTokenInfo response keys:", Object.keys(data).join(","));
  const uid = (data.union_id || data.open_id || data.unionID || data.openID || data.sub) as
    | string
    | undefined;
  if (!uid) {
    console.error("[Huawei/Auth] getTokenInfo has no user ID:", JSON.stringify(data).slice(0, 300));
    throw new Error("getTokenInfo response missing user ID");
  }
  return uid;
}

// Default instance
export const huaweiAuth = new HuaweiAuth();
