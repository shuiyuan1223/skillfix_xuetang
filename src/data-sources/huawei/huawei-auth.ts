/**
 * Huawei OAuth 2.0 Authentication
 *
 * Handles OAuth flow for Huawei Health Kit API.
 */

import { loadConfig } from "../../utils/config.js";
import { TokenStore, tokenStore as defaultTokenStore } from "./token-store.js";
import type { HuaweiTokenResponse, TokenData } from "./huawei-types.js";

// Huawei OAuth endpoints
const HUAWEI_AUTH_URL = "https://oauth-login.cloud.huawei.com/oauth2/v3/authorize";
const HUAWEI_TOKEN_URL = "https://oauth-login.cloud.huawei.com/oauth2/v3/token";

// Default scopes for health data access
const DEFAULT_SCOPES = [
  "https://www.huawei.com/healthkit/step.read",
  "https://www.huawei.com/healthkit/distance.read",
  "https://www.huawei.com/healthkit/calories.read",
  "https://www.huawei.com/healthkit/activity.read",
];

export class HuaweiAuth {
  private tokenStore: TokenStore;

  constructor(tokenStore: TokenStore = defaultTokenStore) {
    this.tokenStore = tokenStore;
  }

  /**
   * Generate OAuth authorization URL
   * User should open this in a browser to authorize
   */
  getAuthUrl(clientId: string, redirectUri: string, scopes: string[] = DEFAULT_SCOPES): string {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: scopes.join(" "),
      access_type: "offline", // Request refresh token
    });

    return `${HUAWEI_AUTH_URL}?${params.toString()}`;
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

    const response = await fetch(HUAWEI_TOKEN_URL, {
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

    const response = await fetch(HUAWEI_TOKEN_URL, {
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
      refreshToken: response.refresh_token,
      expiresAt: Date.now() + response.expires_in * 1000,
      tokenType: response.token_type,
      scope: response.scope,
    };
  }
}

// Default instance
export const huaweiAuth = new HuaweiAuth();
