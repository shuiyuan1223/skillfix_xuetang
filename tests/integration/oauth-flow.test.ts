/**
 * Integration Tests for OAuth Flow
 *
 * Tests token storage, refresh, and multi-user scenarios.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { UserStore } from "../../src/data-sources/huawei/user-store.js";
import type { TokenData } from "../../src/data-sources/huawei/huawei-types.js";

describe("OAuth Token Storage Integration", () => {
  let store: UserStore;

  beforeEach(() => {
    store = new UserStore(":memory:");
  });

  afterEach(() => {
    store.close();
  });

  describe("Multi-User Scenarios", () => {
    test("stores tokens for multiple users independently", () => {
      const user1Token: TokenData = {
        accessToken: "user1-access",
        refreshToken: "user1-refresh",
        expiresAt: Date.now() + 3600000,
        tokenType: "Bearer",
      };

      const user2Token: TokenData = {
        accessToken: "user2-access",
        refreshToken: "user2-refresh",
        expiresAt: Date.now() + 7200000,
        tokenType: "Bearer",
      };

      store.saveToken("user-1", user1Token);
      store.saveToken("user-2", user2Token);

      const retrieved1 = store.getToken("user-1");
      const retrieved2 = store.getToken("user-2");

      expect(retrieved1!.accessToken).toBe("user1-access");
      expect(retrieved2!.accessToken).toBe("user2-access");
      expect(retrieved1!.expiresAt).not.toBe(retrieved2!.expiresAt);
    });

    test("deleting one user does not affect others", () => {
      const token: TokenData = {
        accessToken: "access",
        refreshToken: "refresh",
        expiresAt: Date.now() + 3600000,
        tokenType: "Bearer",
      };

      store.saveToken("user-1", token);
      store.saveToken("user-2", token);
      store.saveToken("user-3", token);

      store.deleteToken("user-2");

      expect(store.isAuthenticated("user-1")).toBe(true);
      expect(store.isAuthenticated("user-2")).toBe(false);
      expect(store.isAuthenticated("user-3")).toBe(true);
    });

    test("handles concurrent user operations", () => {
      // Simulate multiple users authenticating at the same time
      const users = Array.from({ length: 10 }, (_, i) => `user-${i}`);

      for (const userId of users) {
        const token: TokenData = {
          accessToken: `access-${userId}`,
          refreshToken: `refresh-${userId}`,
          expiresAt: Date.now() + 3600000 + Math.random() * 1000,
          tokenType: "Bearer",
        };
        store.saveToken(userId, token);
      }

      // Verify all users have correct tokens
      for (const userId of users) {
        const token = store.getToken(userId);
        expect(token).not.toBeNull();
        expect(token!.accessToken).toBe(`access-${userId}`);
      }
    });
  });

  describe("Token Refresh Scenarios", () => {
    test("detects token needing refresh within buffer period", () => {
      // Token expires in 4 minutes (within 5-minute buffer)
      const expiringToken: TokenData = {
        accessToken: "expiring",
        refreshToken: "refresh",
        expiresAt: Date.now() + 4 * 60 * 1000,
        tokenType: "Bearer",
      };

      store.saveToken("expiring-user", expiringToken);

      expect(store.needsRefresh("expiring-user")).toBe(true);
      expect(store.hasValidToken("expiring-user")).toBe(true);
    });

    test("fresh token does not need refresh", () => {
      // Token expires in 1 hour
      const freshToken: TokenData = {
        accessToken: "fresh",
        refreshToken: "refresh",
        expiresAt: Date.now() + 60 * 60 * 1000,
        tokenType: "Bearer",
      };

      store.saveToken("fresh-user", freshToken);

      expect(store.needsRefresh("fresh-user")).toBe(false);
      expect(store.hasValidToken("fresh-user")).toBe(true);
    });

    test("simulates token refresh flow", () => {
      // 1. User has expiring token
      const oldToken: TokenData = {
        accessToken: "old-access",
        refreshToken: "old-refresh",
        expiresAt: Date.now() + 2 * 60 * 1000, // 2 minutes (needs refresh)
        tokenType: "Bearer",
      };

      store.saveToken("refresh-user", oldToken);
      expect(store.needsRefresh("refresh-user")).toBe(true);

      // 2. Simulate refresh: new token received from API
      const newToken: TokenData = {
        accessToken: "new-access",
        refreshToken: "new-refresh",
        expiresAt: Date.now() + 60 * 60 * 1000, // 1 hour
        tokenType: "Bearer",
      };

      store.saveToken("refresh-user", newToken);

      // 3. Verify new token is active
      const token = store.getToken("refresh-user");
      expect(token!.accessToken).toBe("new-access");
      expect(store.needsRefresh("refresh-user")).toBe(false);
    });
  });

  describe("Token Data Compatibility", () => {
    test("converts between UserToken and TokenData formats", () => {
      const tokenData: TokenData = {
        accessToken: "access",
        refreshToken: "refresh",
        expiresAt: Date.now() + 3600000,
        tokenType: "Bearer",
        scope: "health.read health.write",
      };

      store.saveToken("compat-user", tokenData);

      // getToken returns UserToken format
      const userToken = store.getToken("compat-user");
      expect(userToken!.uuid).toBe("compat-user");
      expect(userToken!.accessToken).toBe(tokenData.accessToken);

      // getTokenData returns TokenData format
      const retrievedData = store.getTokenData("compat-user");
      expect(retrievedData!.accessToken).toBe(tokenData.accessToken);
      expect(retrievedData!.scope).toBe(tokenData.scope);
    });
  });

  describe("Edge Cases", () => {
    test("handles empty UUID", () => {
      const token: TokenData = {
        accessToken: "access",
        refreshToken: "refresh",
        expiresAt: Date.now() + 3600000,
        tokenType: "Bearer",
      };

      // Empty UUID should work (though not recommended)
      store.saveToken("", token);
      expect(store.getToken("")).not.toBeNull();
    });

    test("handles special characters in UUID", () => {
      const token: TokenData = {
        accessToken: "access",
        refreshToken: "refresh",
        expiresAt: Date.now() + 3600000,
        tokenType: "Bearer",
      };

      const specialUuid = "user-123_abc@test.com";
      store.saveToken(specialUuid, token);
      expect(store.getToken(specialUuid)!.accessToken).toBe("access");
    });

    test("handles very long access tokens", () => {
      const longToken = "a".repeat(10000);
      const token: TokenData = {
        accessToken: longToken,
        refreshToken: "refresh",
        expiresAt: Date.now() + 3600000,
        tokenType: "Bearer",
      };

      store.saveToken("long-token-user", token);
      expect(store.getToken("long-token-user")!.accessToken).toBe(longToken);
    });
  });
});

describe("Token Validation Flow", () => {
  let store: UserStore;

  beforeEach(() => {
    store = new UserStore(":memory:");
  });

  afterEach(() => {
    store.close();
  });

  /**
   * Simulates the token validation logic used in HuaweiAuth
   */
  function validateAndPrepareToken(
    userId: string,
    store: UserStore
  ): { needsRefresh: boolean; token: TokenData | null } {
    if (!store.isAuthenticated(userId)) {
      return { needsRefresh: false, token: null };
    }

    const token = store.getTokenData(userId);
    if (!token) {
      return { needsRefresh: false, token: null };
    }

    return {
      needsRefresh: store.needsRefresh(userId),
      token,
    };
  }

  test("returns null for unauthenticated user", () => {
    const result = validateAndPrepareToken("unknown-user", store);
    expect(result.token).toBeNull();
    expect(result.needsRefresh).toBe(false);
  });

  test("returns token for authenticated user with fresh token", () => {
    const token: TokenData = {
      accessToken: "fresh",
      refreshToken: "refresh",
      expiresAt: Date.now() + 60 * 60 * 1000,
      tokenType: "Bearer",
    };

    store.saveToken("fresh-user", token);

    const result = validateAndPrepareToken("fresh-user", store);
    expect(result.token).not.toBeNull();
    expect(result.needsRefresh).toBe(false);
  });

  test("indicates refresh needed for expiring token", () => {
    const token: TokenData = {
      accessToken: "expiring",
      refreshToken: "refresh",
      expiresAt: Date.now() + 3 * 60 * 1000, // 3 minutes
      tokenType: "Bearer",
    };

    store.saveToken("expiring-user", token);

    const result = validateAndPrepareToken("expiring-user", store);
    expect(result.token).not.toBeNull();
    expect(result.needsRefresh).toBe(true);
  });
});
