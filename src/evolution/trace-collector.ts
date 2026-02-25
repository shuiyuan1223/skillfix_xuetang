/**
 * Trace Collector
 *
 * Records agent interactions for later evaluation and analysis.
 * Persists to SQLite database.
 */

import type { Trace } from "./types.js";
import {
  insertTrace,
  getTrace as dbGetTrace,
  listTraces,
  countTraces,
  clearTraces,
  type TraceRow,
} from "../memory/db.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("TraceCollector");

/**
 * Convert database row to Trace object
 */
function rowToTrace(row: TraceRow): Trace {
  return {
    id: row.id,
    timestamp: row.timestamp,
    sessionId: row.session_id,
    userMessage: row.user_message,
    agentResponse: row.agent_response,
    toolCalls: row.tool_calls ? JSON.parse(row.tool_calls) : [],
    context: row.context ? JSON.parse(row.context) : undefined,
    duration: row.duration_ms || 0,
    tokenUsage: row.token_usage ? JSON.parse(row.token_usage) : undefined,
  };
}

export class TraceCollector {
  // In-memory cache for active (incomplete) traces
  private activeTraces: Map<string, Trace> = new Map();

  constructor() {
    // SQLite handles persistence, no maxTraces limit needed
  }

  /**
   * Start recording a new trace
   */
  startTrace(sessionId: string, userMessage: string, context?: Trace["context"]): string {
    const id = crypto.randomUUID();
    const trace: Trace = {
      id,
      timestamp: Date.now(),
      sessionId,
      userMessage,
      context,
      agentResponse: "",
      toolCalls: [],
      duration: 0,
    };

    // Keep in memory until complete
    this.activeTraces.set(id, trace);

    return id;
  }

  /**
   * Record a tool call
   */
  recordToolCall(
    traceId: string,
    tool: string,
    args: Record<string, unknown>,
    result: unknown
  ): void {
    const trace = this.activeTraces.get(traceId);
    if (!trace) return;

    trace.toolCalls = trace.toolCalls || [];
    trace.toolCalls.push({ tool, arguments: args, result });
  }

  /**
   * Complete the trace with the final response and persist to database
   */
  completeTrace(
    traceId: string,
    response: string,
    tokenUsage?: Trace["tokenUsage"]
  ): Trace | undefined {
    const trace = this.activeTraces.get(traceId);
    if (!trace) return undefined;

    trace.agentResponse = response;
    trace.duration = Date.now() - trace.timestamp;
    trace.tokenUsage = tokenUsage;

    // Persist to SQLite
    try {
      insertTrace({
        id: trace.id,
        sessionId: trace.sessionId,
        timestamp: trace.timestamp,
        userMessage: trace.userMessage,
        agentResponse: trace.agentResponse,
        toolCalls: trace.toolCalls,
        context: trace.context,
        duration: trace.duration,
        tokenUsage: trace.tokenUsage,
      });
    } catch (error) {
      log.error("Failed to persist trace:", error);
    }

    // Remove from active traces
    this.activeTraces.delete(traceId);

    return trace;
  }

  /**
   * Get a trace by ID (checks active traces first, then database)
   */
  getTrace(traceId: string): Trace | undefined {
    // Check active traces first
    const active = this.activeTraces.get(traceId);
    if (active) return active;

    // Check database
    const row = dbGetTrace(traceId);
    if (row) return rowToTrace(row);

    return undefined;
  }

  /**
   * Get all traces (from database, limited for performance)
   */
  getAllTraces(limit = 100): Trace[] {
    const rows = listTraces({ limit });
    return rows.map(rowToTrace);
  }

  /**
   * Get traces for a specific session
   */
  getSessionTraces(sessionId: string, limit = 100): Trace[] {
    const rows = listTraces({ sessionId, limit });
    return rows.map(rowToTrace);
  }

  /**
   * Get traces within a time range
   */
  getTracesByTimeRange(start: number, end: number, limit = 100): Trace[] {
    const rows = listTraces({ startTime: start, endTime: end, limit });
    return rows.map(rowToTrace);
  }

  /**
   * Get total trace count
   */
  getTraceCount(): number {
    return countTraces();
  }

  /**
   * Export traces as JSON
   */
  exportTraces(limit = 1000): string {
    return JSON.stringify(this.getAllTraces(limit), null, 2);
  }

  /**
   * Import traces from JSON
   */
  importTraces(json: string): void {
    const traces: Trace[] = JSON.parse(json);
    for (const trace of traces) {
      try {
        insertTrace({
          id: trace.id,
          sessionId: trace.sessionId,
          timestamp: trace.timestamp,
          userMessage: trace.userMessage,
          agentResponse: trace.agentResponse,
          toolCalls: trace.toolCalls,
          context: trace.context,
          duration: trace.duration,
          tokenUsage: trace.tokenUsage,
        });
      } catch (error) {
        // Skip duplicates
        log.warn(`Skipping trace ${trace.id}:`, error);
      }
    }
  }

  /**
   * Clear active traces (database traces remain for history)
   */
  clearActive(): void {
    this.activeTraces.clear();
  }

  /**
   * Clear all traces (both active and persisted)
   */
  clear(): void {
    this.activeTraces.clear();
    clearTraces();
  }
}

// Default instance
export const traceCollector = new TraceCollector();
