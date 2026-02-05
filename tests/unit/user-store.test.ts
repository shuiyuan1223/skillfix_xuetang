/**
 * Tests for User Store
 *
 * Tests SQLite-based multi-user token storage.
 * Uses in-memory database for isolation.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { UserStore } from "../../src/data-sources/huawei/user-store.js";
import type { TokenData } from "../../src/data-sources/huawei/huawei-types.js";

describe("UserStore", () => {
  let store: UserStore;

  beforeEach(() => {
    // Use in-memory SQLite for test isolation
    store = new UserStore(":memory:");
  });

  afterEach(() => {
    store.close();
  });

  describe("saveToken", () => {
    test("saves a new token", () => {
      const token: TokenData = {
        accessToken: "test-access-token",
        refreshToken: "test-refresh-token",
        expiresAt: Date.now() + 3600000,
        tokenType: "Bearer",
        scope: "health.read",
      };

      store.saveToken("user-123", token);
      const retrieved = store.getToken("user-123");

      expect(retrieved).not.toBeNull();
      expect(retrieved!.uuid).toBe("user-123");
      expect(retrieved!.accessToken).toBe("test-access-token");
      expect(retrieved!.refreshToken).toBe("test-refresh-token");
      expect(retrieved!.tokenType).toBe("Bearer");
      expect(retrieved!.scope).toBe("health.read");
    });

    test("updates existing token (upsert)", () => {
      const token1: TokenData = {
        accessToken: "old-token",
        refreshToken: "old-refresh",
        expiresAt: Date.now() + 3600000,
        tokenType: "Bearer",
      };

      const token2: TokenData = {
        accessToken: "new-token",
        refreshToken: "new-refresh",
        expiresAt: Date.now() + 7200000,
        tokenType: "Bearer",
      };

      store.saveToken("user-123", token1);
      store.saveToken("user-123", token2);

      const retrieved = store.getToken("user-123");
      expect(retrieved!.accessToken).toBe("new-token");
      expect(retrieved!.refreshToken).toBe("new-refresh");
    });

    test("handles token without optional fields", () => {
      const token: TokenData = {
        accessToken: "access",
        refreshToken: "refresh",
        expiresAt: Date.now() + 3600000,
        tokenType: "Bearer",
      };

      store.saveToken("user-456", token);
      const retrieved = store.getToken("user-456");

      expect(retrieved!.scope).toBeUndefined();
    });
  });

  describe("getToken", () => {
    test("returns null for non-existent user", () => {
      const token = store.getToken("non-existent-user");
      expect(token).toBeNull();
    });

    test("returns correct user when multiple users exist", () => {
      const token1: TokenData = {
        accessToken: "token-1",
        refreshToken: "refresh-1",
        expiresAt: Date.now() + 3600000,
        tokenType: "Bearer",
      };

      const token2: TokenData = {
        accessToken: "token-2",
        refreshToken: "refresh-2",
        expiresAt: Date.now() + 3600000,
        tokenType: "Bearer",
      };

      store.saveToken("user-1", token1);
      store.saveToken("user-2", token2);

      expect(store.getToken("user-1")!.accessToken).toBe("token-1");
      expect(store.getToken("user-2")!.accessToken).toBe("token-2");
    });
  });

  describe("deleteToken", () => {
    test("deletes existing token", () => {
      const token: TokenData = {
        accessToken: "access",
        refreshToken: "refresh",
        expiresAt: Date.now() + 3600000,
        tokenType: "Bearer",
      };

      store.saveToken("user-to-delete", token);
      expect(store.getToken("user-to-delete")).not.toBeNull();

      store.deleteToken("user-to-delete");
      expect(store.getToken("user-to-delete")).toBeNull();
    });

    test("does not throw when deleting non-existent user", () => {
      expect(() => store.deleteToken("non-existent")).not.toThrow();
    });
  });

  describe("needsRefresh", () => {
    test("returns true for non-existent user", () => {
      expect(store.needsRefresh("non-existent")).toBe(true);
    });

    test("returns false when token is fresh", () => {
      const token: TokenData = {
        accessToken: "access",
        refreshToken: "refresh",
        expiresAt: Date.now() + 3600000, // 1 hour from now
        tokenType: "Bearer",
      };

      store.saveToken("fresh-user", token);
      expect(store.needsRefresh("fresh-user")).toBe(false);
    });

    test("returns true when token is within buffer period", () => {
      const token: TokenData = {
        accessToken: "access",
        refreshToken: "refresh",
        expiresAt: Date.now() + 4 * 60 * 1000, // 4 minutes from now (within 5-min buffer)
        tokenType: "Bearer",
      };

      store.saveToken("expiring-user", token);
      expect(store.needsRefresh("expiring-user")).toBe(true);
    });

    test("returns true when token is expired", () => {
      const token: TokenData = {
        accessToken: "access",
        refreshToken: "refresh",
        expiresAt: Date.now() - 1000, // Already expired
        tokenType: "Bearer",
      };

      store.saveToken("expired-user", token);
      expect(store.needsRefresh("expired-user")).toBe(true);
    });
  });

  describe("hasValidToken", () => {
    test("returns false for non-existent user", () => {
      expect(store.hasValidToken("non-existent")).toBe(false);
    });

    test("returns true when token is not expired", () => {
      const token: TokenData = {
        accessToken: "access",
        refreshToken: "refresh",
        expiresAt: Date.now() + 3600000,
        tokenType: "Bearer",
      };

      store.saveToken("valid-user", token);
      expect(store.hasValidToken("valid-user")).toBe(true);
    });

    test("returns false when token is expired", () => {
      const token: TokenData = {
        accessToken: "access",
        refreshToken: "refresh",
        expiresAt: Date.now() - 1000,
        tokenType: "Bearer",
      };

      store.saveToken("expired-user", token);
      expect(store.hasValidToken("expired-user")).toBe(false);
    });
  });

  describe("isAuthenticated", () => {
    test("returns false for non-existent user", () => {
      expect(store.isAuthenticated("non-existent")).toBe(false);
    });

    test("returns true when user has token (even if expired)", () => {
      const token: TokenData = {
        accessToken: "access",
        refreshToken: "refresh",
        expiresAt: Date.now() - 1000, // Expired
        tokenType: "Bearer",
      };

      store.saveToken("auth-user", token);
      // isAuthenticated only checks existence, not validity
      expect(store.isAuthenticated("auth-user")).toBe(true);
    });
  });

  describe("getTokenData", () => {
    test("returns null for non-existent user", () => {
      expect(store.getTokenData("non-existent")).toBeNull();
    });

    test("returns TokenData format", () => {
      const token: TokenData = {
        accessToken: "access",
        refreshToken: "refresh",
        expiresAt: Date.now() + 3600000,
        tokenType: "Bearer",
        scope: "health.read",
      };

      store.saveToken("data-user", token);
      const data = store.getTokenData("data-user");

      expect(data).not.toBeNull();
      expect(data!.accessToken).toBe("access");
      expect(data!.refreshToken).toBe("refresh");
      expect(data!.tokenType).toBe("Bearer");
      expect(data!.scope).toBe("health.read");
    });

    test("defaults tokenType to Bearer when null", () => {
      const token: TokenData = {
        accessToken: "access",
        refreshToken: "refresh",
        expiresAt: Date.now() + 3600000,
        tokenType: "", // Empty
      };

      store.saveToken("default-type-user", token);
      const data = store.getTokenData("default-type-user");

      expect(data!.tokenType).toBe("Bearer");
    });
  });
});
