/**
 * Tests for API Cache
 *
 * Tests memory cache and file cache operations.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  getFromMemoryCache,
  saveToMemoryCache,
  clearMemoryCache,
} from "../../src/data-sources/huawei/api-cache.js";

describe("Memory Cache", () => {
  beforeEach(() => {
    clearMemoryCache();
  });

  afterEach(() => {
    clearMemoryCache();
  });

  describe("saveToMemoryCache and getFromMemoryCache", () => {
    test("saves and retrieves data", () => {
      const data = { steps: 1000, calories: 500 };
      saveToMemoryCache("polymerize", { date: "2025-01-01" }, data);

      const cached = getFromMemoryCache("polymerize", { date: "2025-01-01" });
      expect(cached).toEqual(data);
    });

    test("returns null for non-existent key", () => {
      const cached = getFromMemoryCache("non-existent", { foo: "bar" });
      expect(cached).toBeNull();
    });

    test("returns null when TTL expired", async () => {
      const data = { value: 123 };
      saveToMemoryCache("test-endpoint", { id: 1 }, data);

      // Use very short TTL to test expiration
      const cached = getFromMemoryCache("test-endpoint", { id: 1 }, 1); // 1ms TTL
      await new Promise((resolve) => setTimeout(resolve, 10)); // Wait 10ms

      const expiredCached = getFromMemoryCache("test-endpoint", { id: 1 }, 1);
      expect(expiredCached).toBeNull();
    });

    test("uses same cache key for same params in different order", () => {
      const data = { result: "test" };
      saveToMemoryCache("endpoint", { b: 2, a: 1 }, data);

      // Same params, different order
      const cached = getFromMemoryCache("endpoint", { a: 1, b: 2 });
      expect(cached).toEqual(data);
    });

    test("different endpoints have different cache keys", () => {
      saveToMemoryCache("endpoint-a", { id: 1 }, { data: "a" });
      saveToMemoryCache("endpoint-b", { id: 1 }, { data: "b" });

      expect(getFromMemoryCache("endpoint-a", { id: 1 })).toEqual({ data: "a" });
      expect(getFromMemoryCache("endpoint-b", { id: 1 })).toEqual({ data: "b" });
    });

    test("different params have different cache keys", () => {
      saveToMemoryCache("endpoint", { id: 1 }, { data: "first" });
      saveToMemoryCache("endpoint", { id: 2 }, { data: "second" });

      expect(getFromMemoryCache("endpoint", { id: 1 })).toEqual({ data: "first" });
      expect(getFromMemoryCache("endpoint", { id: 2 })).toEqual({ data: "second" });
    });
  });

  describe("clearMemoryCache", () => {
    test("clears all cached data", () => {
      saveToMemoryCache("a", { x: 1 }, { data: 1 });
      saveToMemoryCache("b", { x: 2 }, { data: 2 });

      clearMemoryCache();

      expect(getFromMemoryCache("a", { x: 1 })).toBeNull();
      expect(getFromMemoryCache("b", { x: 2 })).toBeNull();
    });
  });

  describe("cache key determinism", () => {
    test("complex params produce consistent keys", () => {
      const params = {
        startTime: 1700000000000,
        endTime: 1700086400000,
        dataTypeName: "com.huawei.instantaneous.heart_rate",
        nested: { a: 1, b: [2, 3] },
      };

      saveToMemoryCache("complex", params, { result: "ok" });

      // Retrieve with same params (keys might be in different insertion order)
      const cached = getFromMemoryCache("complex", {
        nested: { a: 1, b: [2, 3] },
        dataTypeName: "com.huawei.instantaneous.heart_rate",
        endTime: 1700086400000,
        startTime: 1700000000000,
      });

      expect(cached).toEqual({ result: "ok" });
    });
  });
});
