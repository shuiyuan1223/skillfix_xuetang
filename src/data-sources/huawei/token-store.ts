/**
 * Token Store
 *
 * Persists OAuth tokens for Huawei Health Kit.
 * Stores tokens in .pha/huawei-tokens.json (project directory)
 */

import * as fs from "fs";
import * as path from "path";
import { getStateDir, ensureConfigDir } from "../../utils/config.js";
import type { TokenData } from "./huawei-types.js";

const TOKEN_FILE = "huawei-tokens.json";

// Buffer time before token expiry (5 minutes)
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;

export class TokenStore {
  private tokenPath: string;

  constructor() {
    this.tokenPath = path.join(getStateDir(), TOKEN_FILE);
  }

  /**
   * Get the stored token data
   */
  getToken(): TokenData | null {
    if (!fs.existsSync(this.tokenPath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(this.tokenPath, "utf-8");
      return JSON.parse(content) as TokenData;
    } catch {
      return null;
    }
  }

  /**
   * Save token data
   */
  saveToken(token: TokenData): void {
    ensureConfigDir();
    fs.writeFileSync(this.tokenPath, JSON.stringify(token, null, 2), {
      mode: 0o600, // User-only read/write
    });
  }

  /**
   * Delete stored token
   */
  deleteToken(): void {
    if (fs.existsSync(this.tokenPath)) {
      fs.unlinkSync(this.tokenPath);
    }
  }

  /**
   * Check if token exists and is valid
   */
  hasValidToken(): boolean {
    const token = this.getToken();
    if (!token) return false;
    return !this.isExpired(token);
  }

  /**
   * Check if token is expired (with buffer)
   */
  isExpired(token: TokenData): boolean {
    return Date.now() >= token.expiresAt - TOKEN_EXPIRY_BUFFER_MS;
  }

  /**
   * Check if token needs refresh (within buffer period)
   */
  needsRefresh(token: TokenData): boolean {
    return this.isExpired(token);
  }

  /**
   * Get token expiry info for display
   */
  getTokenInfo(): {
    exists: boolean;
    isValid: boolean;
    expiresAt?: Date;
    expiresIn?: string;
  } {
    const token = this.getToken();
    if (!token) {
      return { exists: false, isValid: false };
    }

    const expiresAt = new Date(token.expiresAt);
    const msRemaining = token.expiresAt - Date.now();
    const isValid = msRemaining > 0;

    let expiresIn: string;
    if (!isValid) {
      expiresIn = "expired";
    } else if (msRemaining < 60 * 1000) {
      expiresIn = `${Math.floor(msRemaining / 1000)} seconds`;
    } else if (msRemaining < 60 * 60 * 1000) {
      expiresIn = `${Math.floor(msRemaining / (60 * 1000))} minutes`;
    } else if (msRemaining < 24 * 60 * 60 * 1000) {
      expiresIn = `${Math.floor(msRemaining / (60 * 60 * 1000))} hours`;
    } else {
      expiresIn = `${Math.floor(msRemaining / (24 * 60 * 60 * 1000))} days`;
    }

    return {
      exists: true,
      isValid,
      expiresAt,
      expiresIn,
    };
  }
}

// Default instance
export const tokenStore = new TokenStore();
