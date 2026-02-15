/**
 * SSE Connection Manager
 *
 * Replaces WebSocket send callback pattern with HTTP SSE push.
 * Each session gets one SSE connection for server-push events.
 */

import { createLogger } from "../utils/logger.js";

const log = createLogger("SSE");

// ---------------------------------------------------------------------------
// SSE Event
// ---------------------------------------------------------------------------

export interface SSEEvent {
  id: number;
  data: string; // JSON-serialized
}

// ---------------------------------------------------------------------------
// Ring Buffer — fixed-size replay buffer for reconnection
// ---------------------------------------------------------------------------

class RingBuffer<T> {
  private buf: (T | undefined)[];
  private head = 0;
  private size = 0;

  constructor(private capacity: number) {
    this.buf = new Array(capacity);
  }

  push(item: T): void {
    this.buf[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
    if (this.size < this.capacity) this.size++;
  }

  /** Return items in insertion order. */
  toArray(): T[] {
    if (this.size === 0) return [];
    const start = (this.head - this.size + this.capacity) % this.capacity;
    const result: T[] = [];
    for (let i = 0; i < this.size; i++) {
      result.push(this.buf[(start + i) % this.capacity] as T);
    }
    return result;
  }
}

// ---------------------------------------------------------------------------
// SSE Connection — wraps a WritableStreamDefaultWriter
// ---------------------------------------------------------------------------

export class SSEConnection {
  private writer: WritableStreamDefaultWriter<Uint8Array>;
  private encoder = new TextEncoder();
  private closed = false;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(writer: WritableStreamDefaultWriter<Uint8Array>) {
    this.writer = writer;
    // 30s heartbeat keep-alive
    this.heartbeatTimer = setInterval(() => this.sendHeartbeat(), 30_000);
  }

  /** Send an SSE event with id + data fields. */
  send(msg: unknown, eventId?: number): void {
    if (this.closed) return;
    try {
      let frame = "";
      if (eventId !== undefined) {
        frame += `id: ${eventId}\n`;
      }
      frame += `data: ${JSON.stringify(msg)}\n\n`;
      this.writer.write(this.encoder.encode(frame));
    } catch {
      this.closed = true;
    }
  }

  /** SSE comment line as heartbeat. */
  sendHeartbeat(): void {
    if (this.closed) return;
    try {
      this.writer.write(this.encoder.encode(": heartbeat\n\n"));
    } catch {
      this.closed = true;
    }
  }

  /** Close the underlying stream. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    try {
      this.writer.close();
    } catch {
      /* already closed */
    }
  }

  get isClosed(): boolean {
    return this.closed;
  }
}

// ---------------------------------------------------------------------------
// SSE Connection Manager
// ---------------------------------------------------------------------------

const REPLAY_BUFFER_SIZE = 100;

export class SSEConnectionManager {
  private connections = new Map<string, SSEConnection>();
  private eventBuffers = new Map<string, RingBuffer<SSEEvent>>();
  private eventCounters = new Map<string, number>();

  /**
   * Create a new SSE connection for a session.
   * Closes any existing connection for the same session (browser reconnect).
   */
  createConnection(sessionId: string): {
    readable: ReadableStream<Uint8Array>;
    connection: SSEConnection;
  } {
    // Close previous connection if any
    const prev = this.connections.get(sessionId);
    if (prev) {
      prev.close();
    }

    const { readable, writable } = new TransformStream<Uint8Array>();
    const writer = writable.getWriter();
    const connection = new SSEConnection(writer);
    this.connections.set(sessionId, connection);

    // Ensure buffer exists
    if (!this.eventBuffers.has(sessionId)) {
      this.eventBuffers.set(sessionId, new RingBuffer(REPLAY_BUFFER_SIZE));
      this.eventCounters.set(sessionId, 0);
    }

    log.info("SSE connection created", { sessionId: sessionId.slice(0, 8) });
    return { readable, connection };
  }

  /**
   * Send a message through a session's SSE connection + buffer for replay.
   */
  send(sessionId: string, msg: unknown): void {
    const counter = (this.eventCounters.get(sessionId) || 0) + 1;
    this.eventCounters.set(sessionId, counter);

    const event: SSEEvent = { id: counter, data: JSON.stringify(msg) };
    this.eventBuffers.get(sessionId)?.push(event);

    const conn = this.connections.get(sessionId);
    if (conn && !conn.isClosed) {
      conn.send(msg, counter);
    }
  }

  /**
   * Replay events from the buffer after a given event ID (for reconnection).
   */
  replayFrom(sessionId: string, lastEventId: number): SSEEvent[] {
    const buffer = this.eventBuffers.get(sessionId);
    if (!buffer) return [];
    return buffer.toArray().filter((e) => e.id > lastEventId);
  }

  /**
   * Close and remove a connection.
   */
  closeConnection(sessionId: string): void {
    const conn = this.connections.get(sessionId);
    if (conn) {
      conn.close();
      this.connections.delete(sessionId);
    }
  }

  /**
   * Get the connection for a session (if active).
   */
  getConnection(sessionId: string): SSEConnection | undefined {
    return this.connections.get(sessionId);
  }

  /**
   * Check if a session has an active connection.
   */
  hasConnection(sessionId: string): boolean {
    const conn = this.connections.get(sessionId);
    return !!conn && !conn.isClosed;
  }
}
