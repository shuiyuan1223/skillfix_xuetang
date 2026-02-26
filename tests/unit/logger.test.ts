/**
 * Tests for Logger
 *
 * Tests structured logging with Error object serialization.
 */

import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { createLogger, subscribeToLogs, readLogFile } from "../../src/utils/logger.js";
import type { LogEntry, SubsystemLogger } from "../../src/utils/logger.js";
import { existsSync, rmSync, mkdirSync } from "fs";
import { join } from "path";

// Mock the config module to use a temp directory
const tempDir = `/tmp/pha-logger-test-${Date.now()}`;

// We need to mock getStateDir before importing logger
const originalEnv = process.env.PHA_STATE_DIR;

describe("Logger", () => {
  let log: SubsystemLogger;
  let receivedEntries: LogEntry[] = [];
  let unsubscribe: (() => void) | null = null;

  beforeEach(() => {
    // Set temp state dir
    process.env.PHA_STATE_DIR = tempDir;

    // Create temp directory
    if (!existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true });
    }
    const logsDir = join(tempDir, "logs");
    if (!existsSync(logsDir)) {
      mkdirSync(logsDir, { recursive: true });
    }

    // Create fresh logger instance
    log = createLogger("Test");

    // Reset received entries
    receivedEntries = [];

    // Subscribe to logs
    unsubscribe = subscribeToLogs((entry) => {
      receivedEntries.push(entry);
    });
  });

  afterEach(() => {
    // Unsubscribe
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }

    // Clean up temp directory
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }

    // Restore env
    process.env.PHA_STATE_DIR = originalEnv;
  });

  describe("Error object serialization", () => {
    test("serializes Error object with message, stack, and name", () => {
      const error = new Error("Test error message");
      error.name = "CustomError";

      log.error("Operation failed", error);

      // Check subscriber received properly serialized error
      expect(receivedEntries.length).toBe(1);
      const entry = receivedEntries[0];
      expect(entry.level).toBe("error");
      expect(entry.message).toBe("Operation failed");
      expect(entry.data).toEqual({
        message: "Test error message",
        name: "CustomError",
        stack: expect.stringContaining("Error: Test error message"),
      });
    });

    test("serializes TypeError with correct name", () => {
      const error = new TypeError("Cannot read property");

      log.warn("Type error occurred", error);

      expect(receivedEntries.length).toBe(1);
      const entry = receivedEntries[0];
      expect(entry.data).toEqual({
        message: "Cannot read property",
        name: "TypeError",
        stack: expect.any(String),
      });
    });

    test("serializes RangeError with correct name", () => {
      const error = new RangeError("Index out of bounds");

      log.error("Range error", error);

      expect(receivedEntries.length).toBe(1);
      const entry = receivedEntries[0];
      expect(entry.data).toEqual({
        message: "Index out of bounds",
        name: "RangeError",
        stack: expect.any(String),
      });
    });

    test("preserves stack trace in serialized error", () => {
      const error = new Error("Stack test");

      log.error("Stack trace test", error);

      const entry = receivedEntries[0];
      expect(entry.data).toHaveProperty("stack");
      expect((entry.data as { stack: string }).stack).toContain("at ");
      expect((entry.data as { stack: string }).stack).toContain("Error: Stack test");
    });

    test("serializes nested Error in object property", () => {
      const error = new Error("Nested error");
      const data = { error, context: "some context" };

      log.warn("Nested error test", data);

      expect(receivedEntries.length).toBe(1);
      const entry = receivedEntries[0];
      expect(entry.data).toEqual({
        error: {
          message: "Nested error",
          name: "Error",
          stack: expect.any(String),
        },
        context: "some context",
      });
    });

    test("serializes deeply nested Errors", () => {
      const error1 = new Error("Deep error 1");
      const error2 = new TypeError("Deep error 2");
      const data = {
        level1: {
          error: error1,
          level2: {
            errors: [error2],
            value: 42,
          },
        },
      };

      log.error("Deeply nested errors", data);

      const entry = receivedEntries[0];
      expect(entry.data).toEqual({
        level1: {
          error: {
            message: "Deep error 1",
            name: "Error",
            stack: expect.any(String),
          },
          level2: {
            errors: [
              {
                message: "Deep error 2",
                name: "TypeError",
                stack: expect.any(String),
              },
            ],
            value: 42,
          },
        },
      });
    });

    test("handles circular references", () => {
      const data: { self?: typeof data; value: number } = { value: 1 };
      data.self = data;

      log.info("Circular test", data);

      const entry = receivedEntries[0];
      expect(entry.data).toEqual({
        value: 1,
        self: "[Circular]",
      });
    });
  });

  describe("Non-Error data serialization", () => {
    test("serializes plain object unchanged", () => {
      const data = { foo: "bar", count: 42, nested: { a: 1 } };

      log.info("Object data", data);

      expect(receivedEntries.length).toBe(1);
      const entry = receivedEntries[0];
      expect(entry.data).toEqual(data);
    });

    test("serializes array unchanged", () => {
      const data = [1, 2, 3, "four"];

      log.debug("Array data", data);

      expect(receivedEntries.length).toBe(1);
      const entry = receivedEntries[0];
      expect(entry.data).toEqual(data);
    });

    test("handles null data", () => {
      log.info("Null data", null);

      expect(receivedEntries.length).toBe(1);
      const entry = receivedEntries[0];
      expect(entry.data).toBeNull();
    });

    test("handles undefined data (no data field)", () => {
      log.info("No data");

      expect(receivedEntries.length).toBe(1);
      const entry = receivedEntries[0];
      expect(entry.data).toBeUndefined();
    });

    test("serializes string data", () => {
      log.info("String data", "just a string");

      expect(receivedEntries.length).toBe(1);
      const entry = receivedEntries[0];
      expect(entry.data).toBe("just a string");
    });

    test("serializes number data", () => {
      log.info("Number data", 42);

      expect(receivedEntries.length).toBe(1);
      const entry = receivedEntries[0];
      expect(entry.data).toBe(42);
    });
  });

  describe("Log levels", () => {
    test("trace level", () => {
      log.trace("Trace message");
      expect(receivedEntries[0].level).toBe("trace");
    });

    test("debug level", () => {
      log.debug("Debug message");
      expect(receivedEntries[0].level).toBe("debug");
    });

    test("info level", () => {
      log.info("Info message");
      expect(receivedEntries[0].level).toBe("info");
    });

    test("warn level", () => {
      log.warn("Warn message");
      expect(receivedEntries[0].level).toBe("warn");
    });

    test("error level", () => {
      log.error("Error message");
      expect(receivedEntries[0].level).toBe("error");
    });

    test("fatal level", () => {
      log.fatal("Fatal message");
      expect(receivedEntries[0].level).toBe("fatal");
    });
  });

  describe("Subsystem", () => {
    test("includes subsystem name", () => {
      const customLog = createLogger("CustomSubsystem");
      const localEntries: LogEntry[] = [];
      const unsub = subscribeToLogs((e) => localEntries.push(e));

      customLog.info("Test");

      expect(localEntries[0].subsystem).toBe("CustomSubsystem");
      unsub();
    });

    test("child logger has nested subsystem", () => {
      const childLog = log.child("Child");
      const localEntries: LogEntry[] = [];
      const unsub = subscribeToLogs((e) => localEntries.push(e));

      childLog.info("Child message");

      expect(localEntries[0].subsystem).toBe("Test/Child");
      unsub();
    });
  });

  describe("Timestamp", () => {
    test("includes ISO timestamp", () => {
      log.info("Timestamp test");

      const entry = receivedEntries[0];
      expect(entry.time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

      // Verify it's a valid date
      const date = new Date(entry.time);
      expect(date.getTime()).not.toBeNaN();
    });
  });

  describe("File persistence", () => {
    test("writes to JSONL file", () => {
      const error = new Error("Persist test");
      log.error("Persist this error", error);

      // Read the log file
      const entries = readLogFile();
      expect(entries.length).toBeGreaterThan(0);

      // Find our entry
      const ourEntry = entries.find((e) => e.message === "Persist this error");
      expect(ourEntry).toBeDefined();
      expect(ourEntry?.data).toEqual({
        message: "Persist test",
        name: "Error",
        stack: expect.any(String),
      });
    });

    test("file entries are valid JSON", () => {
      log.info("JSON test", { key: "value" });

      const entries = readLogFile();
      const ourEntry = entries.find((e) => e.message === "JSON test");
      expect(ourEntry).toBeDefined();

      // Verify it can be round-tripped through JSON
      const json = JSON.stringify(ourEntry);
      const parsed = JSON.parse(json);
      expect(parsed.message).toBe("JSON test");
    });
  });

  describe("Console forwarding", () => {
    test("forwards to console.log for info", () => {
      const consoleSpy = mock(() => {});
      const originalLog = console.log;
      console.log = consoleSpy;

      log.info("Console test", { data: 123 });

      expect(consoleSpy).toHaveBeenCalled();
      const callArg = consoleSpy.mock.calls[0][0];
      expect(callArg).toContain("[Test]");
      expect(callArg).toContain("Console test");

      console.log = originalLog;
    });

    test("forwards to console.error for error level", () => {
      const consoleSpy = mock(() => {});
      const originalError = console.error;
      console.error = consoleSpy;

      log.error("Error console test", new Error("test"));

      expect(consoleSpy).toHaveBeenCalled();
      const callArg = consoleSpy.mock.calls[0][0];
      expect(callArg).toContain("[Test]");
      expect(callArg).toContain("Error console test");

      console.error = originalError;
    });

    test("forwards to console.warn for warn level", () => {
      const consoleSpy = mock(() => {});
      const originalWarn = console.warn;
      console.warn = consoleSpy;

      log.warn("Warn console test");

      expect(consoleSpy).toHaveBeenCalled();
      const callArg = consoleSpy.mock.calls[0][0];
      expect(callArg).toContain("[Test]");
      expect(callArg).toContain("Warn console test");

      console.warn = originalWarn;
    });
  });

  describe("Edge cases", () => {
    test("handles Error with no stack (rare edge case)", () => {
      const error = new Error("No stack");
      delete error.stack;

      log.error("No stack error", error);

      const entry = receivedEntries[0];
      expect(entry.data).toEqual({
        message: "No stack",
        name: "Error",
        stack: undefined,
      });
    });

    test("handles Error with custom properties", () => {
      const error = new Error("Custom props") as Error & { code?: string };
      error.code = "ERR_CUSTOM";

      log.error("Custom props error", error);

      // Custom properties are not enumerable, so they won't be serialized
      const entry = receivedEntries[0];
      expect(entry.data).toEqual({
        message: "Custom props",
        name: "Error",
        stack: expect.any(String),
      });
    });

    test("handles Date objects", () => {
      const date = new Date("2026-01-15T10:30:00Z");
      log.info("Date test", { timestamp: date });

      const entry = receivedEntries[0];
      // Date is not a plain object, so it's returned as-is
      expect(entry.data).toEqual({ timestamp: date });
    });

    test("handles mixed data types with errors", () => {
      const data = {
        count: 42,
        message: "test",
        error: new Error("Mixed error"),
        nested: {
          arr: [1, 2, { err: new Error("Array error") }],
        },
      };

      log.info("Mixed types", data);

      const entry = receivedEntries[0];
      expect(entry.data).toEqual({
        count: 42,
        message: "test",
        error: {
          message: "Mixed error",
          name: "Error",
          stack: expect.any(String),
        },
        nested: {
          arr: [
            1,
            2,
            {
              err: {
                message: "Array error",
                name: "Error",
                stack: expect.any(String),
              },
            },
          ],
        },
      });
    });
  });
});
