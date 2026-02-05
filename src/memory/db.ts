/**
 * SQLite Database Module
 *
 * Uses Bun's built-in SQLite for persistence of traces, evaluations,
 * test cases, and optimization suggestions.
 */

import { Database } from "bun:sqlite";
import { mkdirSync, existsSync } from "fs";
import { dirname } from "path";

// Database instance singleton
let db: Database | null = null;

/**
 * Get or create the database connection
 */
export function getDatabase(dbPath: string = "data/pha.db"): Database {
  if (db) return db;

  // Ensure data directory exists
  const dir = dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  db = new Database(dbPath, { create: true });

  // Enable WAL mode for better concurrent performance
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");

  // Initialize schema
  initializeSchema(db);

  return db;
}

/**
 * Initialize database schema
 */
function initializeSchema(db: Database): void {
  db.exec(`
    -- Traces: Recorded agent interactions
    CREATE TABLE IF NOT EXISTS traces (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      user_message TEXT NOT NULL,
      agent_response TEXT NOT NULL,
      tool_calls TEXT,  -- JSON
      context TEXT,     -- JSON
      duration_ms INTEGER,
      token_usage TEXT  -- JSON
    );

    -- Evaluations: LLM-judged quality scores
    CREATE TABLE IF NOT EXISTS evaluations (
      id TEXT PRIMARY KEY,
      trace_id TEXT NOT NULL REFERENCES traces(id),
      timestamp INTEGER NOT NULL,
      scores TEXT NOT NULL,       -- JSON: {accuracy, relevance, helpfulness, safety, completeness}
      overall_score INTEGER NOT NULL,
      feedback TEXT,
      issues TEXT                 -- JSON: [{type, description, severity}]
    );

    -- Test Cases: Benchmark test inputs/expectations
    CREATE TABLE IF NOT EXISTS test_cases (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      query TEXT NOT NULL,
      context TEXT,               -- JSON
      expected TEXT NOT NULL,     -- JSON: {shouldMention, shouldNotMention, minScore, safetyConcerns}
      created_at INTEGER,
      updated_at INTEGER
    );

    -- Suggestions: AI-generated optimization proposals
    CREATE TABLE IF NOT EXISTS suggestions (
      id TEXT PRIMARY KEY,
      timestamp INTEGER NOT NULL,
      type TEXT NOT NULL,         -- 'prompt' | 'tool' | 'behavior'
      target TEXT NOT NULL,
      current_value TEXT,
      suggested_value TEXT NOT NULL,
      rationale TEXT,
      status TEXT DEFAULT 'pending',  -- 'pending' | 'testing' | 'validated' | 'applied' | 'rejected'
      validation_results TEXT     -- JSON: {before, after, improvement}
    );

    -- Indexes for common queries
    CREATE INDEX IF NOT EXISTS idx_traces_timestamp ON traces(timestamp);
    CREATE INDEX IF NOT EXISTS idx_traces_session ON traces(session_id);
    CREATE INDEX IF NOT EXISTS idx_evaluations_trace ON evaluations(trace_id);
    CREATE INDEX IF NOT EXISTS idx_evaluations_score ON evaluations(overall_score);
    CREATE INDEX IF NOT EXISTS idx_test_cases_category ON test_cases(category);
    CREATE INDEX IF NOT EXISTS idx_suggestions_status ON suggestions(status);
    CREATE INDEX IF NOT EXISTS idx_suggestions_type ON suggestions(type);
  `);
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// ============================================================================
// Trace Operations
// ============================================================================

export interface TraceRow {
  id: string;
  session_id: string;
  timestamp: number;
  user_message: string;
  agent_response: string;
  tool_calls: string | null;
  context: string | null;
  duration_ms: number | null;
  token_usage: string | null;
}

export function insertTrace(trace: {
  id: string;
  sessionId: string;
  timestamp: number;
  userMessage: string;
  agentResponse: string;
  toolCalls?: unknown[];
  context?: unknown;
  duration?: number;
  tokenUsage?: { input: number; output: number; total: number };
}): void {
  const database = getDatabase();
  const stmt = database.prepare(`
    INSERT OR REPLACE INTO traces (id, session_id, timestamp, user_message, agent_response, tool_calls, context, duration_ms, token_usage)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    trace.id,
    trace.sessionId,
    trace.timestamp,
    trace.userMessage,
    trace.agentResponse,
    trace.toolCalls ? JSON.stringify(trace.toolCalls) : null,
    trace.context ? JSON.stringify(trace.context) : null,
    trace.duration ?? null,
    trace.tokenUsage ? JSON.stringify(trace.tokenUsage) : null
  );
}

export function getTrace(id: string): TraceRow | null {
  const database = getDatabase();
  const stmt = database.prepare("SELECT * FROM traces WHERE id = ?");
  return stmt.get(id) as TraceRow | null;
}

type SQLParam = string | number | bigint | boolean | Uint8Array | null;

export function listTraces(
  options: {
    limit?: number;
    offset?: number;
    sessionId?: string;
    startTime?: number;
    endTime?: number;
  } = {}
): TraceRow[] {
  const database = getDatabase();
  let sql = "SELECT * FROM traces WHERE 1=1";
  const params: SQLParam[] = [];

  if (options.sessionId) {
    sql += " AND session_id = ?";
    params.push(options.sessionId);
  }
  if (options.startTime) {
    sql += " AND timestamp >= ?";
    params.push(options.startTime);
  }
  if (options.endTime) {
    sql += " AND timestamp <= ?";
    params.push(options.endTime);
  }

  sql += " ORDER BY timestamp DESC";

  if (options.limit) {
    sql += " LIMIT ?";
    params.push(options.limit);
  }
  if (options.offset) {
    sql += " OFFSET ?";
    params.push(options.offset);
  }

  const stmt = database.prepare(sql);
  return stmt.all(...params) as TraceRow[];
}

export function countTraces(): number {
  const database = getDatabase();
  const stmt = database.prepare("SELECT COUNT(*) as count FROM traces");
  const result = stmt.get() as { count: number };
  return result.count;
}

export function clearTraces(): void {
  const database = getDatabase();
  // Delete evaluations first due to foreign key constraint
  database.exec("DELETE FROM evaluations");
  database.exec("DELETE FROM traces");
}

// ============================================================================
// Evaluation Operations
// ============================================================================

export interface EvaluationRow {
  id: string;
  trace_id: string;
  timestamp: number;
  scores: string; // JSON
  overall_score: number;
  feedback: string | null;
  issues: string | null; // JSON
}

export function insertEvaluation(evaluation: {
  id: string;
  traceId: string;
  timestamp: number;
  scores: {
    accuracy: number;
    relevance: number;
    helpfulness: number;
    safety: number;
    completeness: number;
  };
  overallScore: number;
  feedback?: string;
  issues?: { type: string; description: string; severity: string }[];
}): void {
  const database = getDatabase();
  const stmt = database.prepare(`
    INSERT OR REPLACE INTO evaluations (id, trace_id, timestamp, scores, overall_score, feedback, issues)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    evaluation.id,
    evaluation.traceId,
    evaluation.timestamp,
    JSON.stringify(evaluation.scores),
    evaluation.overallScore,
    evaluation.feedback ?? null,
    evaluation.issues ? JSON.stringify(evaluation.issues) : null
  );
}

export function getEvaluation(id: string): EvaluationRow | null {
  const database = getDatabase();
  const stmt = database.prepare("SELECT * FROM evaluations WHERE id = ?");
  return stmt.get(id) as EvaluationRow | null;
}

export function getEvaluationByTraceId(traceId: string): EvaluationRow | null {
  const database = getDatabase();
  const stmt = database.prepare("SELECT * FROM evaluations WHERE trace_id = ?");
  return stmt.get(traceId) as EvaluationRow | null;
}

export function listEvaluations(
  options: {
    limit?: number;
    offset?: number;
    minScore?: number;
    maxScore?: number;
  } = {}
): EvaluationRow[] {
  const database = getDatabase();
  let sql = "SELECT * FROM evaluations WHERE 1=1";
  const params: SQLParam[] = [];

  if (options.minScore !== undefined) {
    sql += " AND overall_score >= ?";
    params.push(options.minScore);
  }
  if (options.maxScore !== undefined) {
    sql += " AND overall_score <= ?";
    params.push(options.maxScore);
  }

  sql += " ORDER BY timestamp DESC";

  if (options.limit) {
    sql += " LIMIT ?";
    params.push(options.limit);
  }
  if (options.offset) {
    sql += " OFFSET ?";
    params.push(options.offset);
  }

  const stmt = database.prepare(sql);
  return stmt.all(...params) as EvaluationRow[];
}

export function getEvaluationStats(): {
  totalCount: number;
  averageScore: number;
  scoreDistribution: Record<string, number>;
} {
  const database = getDatabase();

  const countStmt = database.prepare("SELECT COUNT(*) as count FROM evaluations");
  const countResult = countStmt.get() as { count: number };

  const avgStmt = database.prepare("SELECT AVG(overall_score) as avg FROM evaluations");
  const avgResult = avgStmt.get() as { avg: number | null };

  // Score distribution in buckets: 0-20, 21-40, 41-60, 61-80, 81-100
  const distStmt = database.prepare(`
    SELECT
      CASE
        WHEN overall_score <= 20 THEN '0-20'
        WHEN overall_score <= 40 THEN '21-40'
        WHEN overall_score <= 60 THEN '41-60'
        WHEN overall_score <= 80 THEN '61-80'
        ELSE '81-100'
      END as bucket,
      COUNT(*) as count
    FROM evaluations
    GROUP BY bucket
    ORDER BY bucket
  `);
  const distResult = distStmt.all() as { bucket: string; count: number }[];

  const distribution: Record<string, number> = {};
  for (const row of distResult) {
    distribution[row.bucket] = row.count;
  }

  return {
    totalCount: countResult.count,
    averageScore: avgResult.avg ?? 0,
    scoreDistribution: distribution,
  };
}

// ============================================================================
// Test Case Operations
// ============================================================================

export interface TestCaseRow {
  id: string;
  category: string;
  query: string;
  context: string | null;
  expected: string; // JSON
  created_at: number | null;
  updated_at: number | null;
}

export function insertTestCase(testCase: {
  id: string;
  category: string;
  query: string;
  context?: unknown;
  expected: {
    shouldMention?: string[];
    shouldNotMention?: string[];
    minScore?: number;
    safetyConcerns?: string[];
  };
}): void {
  const database = getDatabase();
  const now = Date.now();
  const stmt = database.prepare(`
    INSERT OR REPLACE INTO test_cases (id, category, query, context, expected, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    testCase.id,
    testCase.category,
    testCase.query,
    testCase.context ? JSON.stringify(testCase.context) : null,
    JSON.stringify(testCase.expected),
    now,
    now
  );
}

export function getTestCase(id: string): TestCaseRow | null {
  const database = getDatabase();
  const stmt = database.prepare("SELECT * FROM test_cases WHERE id = ?");
  return stmt.get(id) as TestCaseRow | null;
}

export function listTestCases(
  options: {
    category?: string;
    limit?: number;
    offset?: number;
  } = {}
): TestCaseRow[] {
  const database = getDatabase();
  let sql = "SELECT * FROM test_cases WHERE 1=1";
  const params: SQLParam[] = [];

  if (options.category) {
    sql += " AND category = ?";
    params.push(options.category);
  }

  sql += " ORDER BY created_at DESC";

  if (options.limit) {
    sql += " LIMIT ?";
    params.push(options.limit);
  }
  if (options.offset) {
    sql += " OFFSET ?";
    params.push(options.offset);
  }

  const stmt = database.prepare(sql);
  return stmt.all(...params) as TestCaseRow[];
}

export function deleteTestCase(id: string): void {
  const database = getDatabase();
  const stmt = database.prepare("DELETE FROM test_cases WHERE id = ?");
  stmt.run(id);
}

// ============================================================================
// Suggestion Operations
// ============================================================================

export interface SuggestionRow {
  id: string;
  timestamp: number;
  type: string;
  target: string;
  current_value: string | null;
  suggested_value: string;
  rationale: string | null;
  status: string;
  validation_results: string | null; // JSON
}

export function insertSuggestion(suggestion: {
  id: string;
  timestamp: number;
  type: "prompt" | "tool" | "behavior";
  target: string;
  currentValue?: string;
  suggestedValue: string;
  rationale?: string;
}): void {
  const database = getDatabase();
  const stmt = database.prepare(`
    INSERT OR REPLACE INTO suggestions (id, timestamp, type, target, current_value, suggested_value, rationale, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
  `);
  stmt.run(
    suggestion.id,
    suggestion.timestamp,
    suggestion.type,
    suggestion.target,
    suggestion.currentValue ?? null,
    suggestion.suggestedValue,
    suggestion.rationale ?? null
  );
}

export function getSuggestion(id: string): SuggestionRow | null {
  const database = getDatabase();
  const stmt = database.prepare("SELECT * FROM suggestions WHERE id = ?");
  return stmt.get(id) as SuggestionRow | null;
}

export function listSuggestions(
  options: {
    status?: string;
    type?: string;
    limit?: number;
    offset?: number;
  } = {}
): SuggestionRow[] {
  const database = getDatabase();
  let sql = "SELECT * FROM suggestions WHERE 1=1";
  const params: SQLParam[] = [];

  if (options.status) {
    sql += " AND status = ?";
    params.push(options.status);
  }
  if (options.type) {
    sql += " AND type = ?";
    params.push(options.type);
  }

  sql += " ORDER BY timestamp DESC";

  if (options.limit) {
    sql += " LIMIT ?";
    params.push(options.limit);
  }
  if (options.offset) {
    sql += " OFFSET ?";
    params.push(options.offset);
  }

  const stmt = database.prepare(sql);
  return stmt.all(...params) as SuggestionRow[];
}

export function updateSuggestionStatus(
  id: string,
  status: "pending" | "testing" | "validated" | "applied" | "rejected",
  validationResults?: { before: number; after: number; improvement: number }
): void {
  const database = getDatabase();
  const stmt = database.prepare(`
    UPDATE suggestions SET status = ?, validation_results = ? WHERE id = ?
  `);
  stmt.run(status, validationResults ? JSON.stringify(validationResults) : null, id);
}
