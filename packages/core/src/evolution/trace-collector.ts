/**
 * Trace Collector
 *
 * Records agent interactions for later evaluation and analysis.
 */

import type { Trace } from "./types.js";

export class TraceCollector {
  private traces: Map<string, Trace> = new Map();
  private maxTraces: number;

  constructor(maxTraces = 1000) {
    this.maxTraces = maxTraces;
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

    this.traces.set(id, trace);
    this.pruneOldTraces();

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
    const trace = this.traces.get(traceId);
    if (!trace) return;

    trace.toolCalls = trace.toolCalls || [];
    trace.toolCalls.push({ tool, arguments: args, result });
  }

  /**
   * Complete the trace with the final response
   */
  completeTrace(
    traceId: string,
    response: string,
    tokenUsage?: Trace["tokenUsage"]
  ): Trace | undefined {
    const trace = this.traces.get(traceId);
    if (!trace) return undefined;

    trace.agentResponse = response;
    trace.duration = Date.now() - trace.timestamp;
    trace.tokenUsage = tokenUsage;

    return trace;
  }

  /**
   * Get a trace by ID
   */
  getTrace(traceId: string): Trace | undefined {
    return this.traces.get(traceId);
  }

  /**
   * Get all traces
   */
  getAllTraces(): Trace[] {
    return Array.from(this.traces.values());
  }

  /**
   * Get traces for a specific session
   */
  getSessionTraces(sessionId: string): Trace[] {
    return this.getAllTraces().filter((t) => t.sessionId === sessionId);
  }

  /**
   * Get traces within a time range
   */
  getTracesByTimeRange(start: number, end: number): Trace[] {
    return this.getAllTraces().filter(
      (t) => t.timestamp >= start && t.timestamp <= end
    );
  }

  /**
   * Export traces as JSON
   */
  exportTraces(): string {
    return JSON.stringify(this.getAllTraces(), null, 2);
  }

  /**
   * Import traces from JSON
   */
  importTraces(json: string): void {
    const traces: Trace[] = JSON.parse(json);
    for (const trace of traces) {
      this.traces.set(trace.id, trace);
    }
    this.pruneOldTraces();
  }

  /**
   * Clear all traces
   */
  clear(): void {
    this.traces.clear();
  }

  private pruneOldTraces(): void {
    if (this.traces.size <= this.maxTraces) return;

    // Remove oldest traces
    const sortedTraces = this.getAllTraces().sort(
      (a, b) => a.timestamp - b.timestamp
    );
    const toRemove = sortedTraces.slice(0, this.traces.size - this.maxTraces);
    for (const trace of toRemove) {
      this.traces.delete(trace.id);
    }
  }
}

// Default instance
export const traceCollector = new TraceCollector();
