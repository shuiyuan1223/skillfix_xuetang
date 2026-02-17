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

    -- Benchmark Runs: Each execution of the benchmark suite
    CREATE TABLE IF NOT EXISTS benchmark_runs (
      id TEXT PRIMARY KEY,
      timestamp INTEGER NOT NULL,
      version_tag TEXT,
      prompt_versions TEXT,    -- JSON: {filename: gitHash}
      skill_versions TEXT,     -- JSON: {filename: gitHash}
      total_test_cases INTEGER NOT NULL,
      passed_count INTEGER NOT NULL DEFAULT 0,
      failed_count INTEGER NOT NULL DEFAULT 0,
      overall_score REAL NOT NULL DEFAULT 0,
      duration_ms INTEGER,
      profile TEXT DEFAULT 'quick',
      metadata TEXT             -- JSON
    );

    -- Category Scores: Per-category scores within a benchmark run
    CREATE TABLE IF NOT EXISTS category_scores (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES benchmark_runs(id),
      category TEXT NOT NULL,
      subcategory TEXT,
      score REAL NOT NULL DEFAULT 0,
      test_count INTEGER NOT NULL DEFAULT 0,
      passed_count INTEGER NOT NULL DEFAULT 0,
      details TEXT               -- JSON
    );

    -- Benchmark Results: Per-test-case results within a benchmark run
    CREATE TABLE IF NOT EXISTS benchmark_results (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES benchmark_runs(id),
      test_case_id TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      agent_response TEXT,
      tool_calls TEXT,           -- JSON
      scores TEXT,               -- JSON: {accuracy, relevance, helpfulness, safety, completeness}
      overall_score REAL NOT NULL DEFAULT 0,
      passed INTEGER NOT NULL DEFAULT 0,
      feedback TEXT,
      issues TEXT,               -- JSON
      duration_ms INTEGER
    );

    -- Evolution Versions: Agent version snapshots managed via git worktrees
    CREATE TABLE IF NOT EXISTS evolution_versions (
      id TEXT PRIMARY KEY,
      branch_name TEXT NOT NULL UNIQUE,
      parent_branch TEXT,
      created_at INTEGER NOT NULL,
      status TEXT DEFAULT 'active',       -- active | merged | abandoned | rollback
      trigger_mode TEXT,                  -- diagnose | auto-evolve | issue-fix
      trigger_ref TEXT,                   -- issue number or description
      baseline_run_id TEXT,
      latest_run_id TEXT,
      score_delta REAL,
      files_changed TEXT,                 -- JSON array
      worktree_path TEXT,
      metadata TEXT                       -- JSON
    );

    -- Indexes for common queries
    CREATE INDEX IF NOT EXISTS idx_traces_timestamp ON traces(timestamp);
    CREATE INDEX IF NOT EXISTS idx_traces_session ON traces(session_id);
    CREATE INDEX IF NOT EXISTS idx_evaluations_trace ON evaluations(trace_id);
    CREATE INDEX IF NOT EXISTS idx_evaluations_score ON evaluations(overall_score);
    CREATE INDEX IF NOT EXISTS idx_test_cases_category ON test_cases(category);
    CREATE INDEX IF NOT EXISTS idx_suggestions_status ON suggestions(status);
    CREATE INDEX IF NOT EXISTS idx_suggestions_type ON suggestions(type);
    CREATE INDEX IF NOT EXISTS idx_benchmark_runs_timestamp ON benchmark_runs(timestamp);
    CREATE INDEX IF NOT EXISTS idx_category_scores_run ON category_scores(run_id);
    CREATE INDEX IF NOT EXISTS idx_category_scores_category ON category_scores(category);
    CREATE INDEX IF NOT EXISTS idx_benchmark_results_run ON benchmark_results(run_id);
    CREATE INDEX IF NOT EXISTS idx_benchmark_results_test_case ON benchmark_results(test_case_id);
    CREATE INDEX IF NOT EXISTS idx_evolution_versions_status ON evolution_versions(status);
    CREATE INDEX IF NOT EXISTS idx_evolution_versions_branch ON evolution_versions(branch_name);
  `);

  // Add columns to test_cases if they don't exist (safe migration)
  migrateTestCasesTable(db);
  migrateBenchmarkRunsTable(db);
}

/**
 * Migrate test_cases table to add new columns
 */
function migrateTestCasesTable(db: Database): void {
  try {
    // Check if subcategory column exists
    const tableInfo = db.prepare("PRAGMA table_info(test_cases)").all() as Array<{
      name: string;
    }>;
    const columnNames = tableInfo.map((c) => c.name);

    if (!columnNames.includes("subcategory")) {
      db.exec("ALTER TABLE test_cases ADD COLUMN subcategory TEXT");
    }
    if (!columnNames.includes("difficulty")) {
      db.exec("ALTER TABLE test_cases ADD COLUMN difficulty TEXT DEFAULT 'medium'");
    }
    if (!columnNames.includes("mock_context")) {
      db.exec("ALTER TABLE test_cases ADD COLUMN mock_context TEXT");
    }
  } catch {
    // Table might not exist yet on first run, which is fine
  }
}

/**
 * Migrate benchmark_runs table to add branch_name column
 */
function migrateBenchmarkRunsTable(db: Database): void {
  try {
    const tableInfo = db.prepare("PRAGMA table_info(benchmark_runs)").all() as Array<{
      name: string;
    }>;
    const columnNames = tableInfo.map((c) => c.name);

    if (!columnNames.includes("branch_name")) {
      db.exec("ALTER TABLE benchmark_runs ADD COLUMN branch_name TEXT");
    }
  } catch {
    // Table might not exist yet on first run
  }
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
  subcategory?: string;
  query: string;
  expected: {
    shouldMention?: string[];
    shouldNotMention?: string[];
    minScore?: number;
    safetyConcerns?: string[];
    expectedTools?: string[];
  };
  difficulty?: string;
  userUuid?: string;
}): void {
  const database = getDatabase();
  const now = Date.now();
  const stmt = database.prepare(`
    INSERT OR REPLACE INTO test_cases (id, category, subcategory, query, context, expected, created_at, updated_at, difficulty, mock_context)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    testCase.id,
    testCase.category,
    testCase.subcategory ?? null,
    testCase.query,
    testCase.userUuid ?? null,
    JSON.stringify(testCase.expected),
    now,
    now,
    testCase.difficulty ?? "medium",
    null
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

// ============================================================================
// Benchmark Run Operations
// ============================================================================

export interface BenchmarkRunRow {
  id: string;
  timestamp: number;
  version_tag: string | null;
  prompt_versions: string | null;
  skill_versions: string | null;
  total_test_cases: number;
  passed_count: number;
  failed_count: number;
  overall_score: number;
  duration_ms: number | null;
  profile: string;
  metadata: string | null;
}

export function insertBenchmarkRun(run: {
  id: string;
  timestamp: number;
  versionTag?: string;
  promptVersions?: Record<string, string>;
  skillVersions?: Record<string, string>;
  totalTestCases: number;
  passedCount: number;
  failedCount: number;
  overallScore: number;
  durationMs?: number;
  profile?: string;
  metadata?: Record<string, unknown>;
}): void {
  const database = getDatabase();
  const stmt = database.prepare(`
    INSERT OR REPLACE INTO benchmark_runs (id, timestamp, version_tag, prompt_versions, skill_versions,
      total_test_cases, passed_count, failed_count, overall_score, duration_ms, profile, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    run.id,
    run.timestamp,
    run.versionTag ?? null,
    run.promptVersions ? JSON.stringify(run.promptVersions) : null,
    run.skillVersions ? JSON.stringify(run.skillVersions) : null,
    run.totalTestCases,
    run.passedCount,
    run.failedCount,
    run.overallScore,
    run.durationMs ?? null,
    run.profile ?? "quick",
    run.metadata ? JSON.stringify(run.metadata) : null
  );
}

/**
 * Find a matching successful benchmark run by version, model, profile, and prompt/skill versions.
 * Used for cache hit detection — if an identical run exists, we can skip re-running.
 */
export function findMatchingBenchmarkRun(criteria: {
  versionTag: string;
  modelId: string;
  profile: string;
  promptVersions: string;
  skillVersions: string;
}): BenchmarkRunRow | null {
  const database = getDatabase();
  const stmt = database.prepare(`
    SELECT * FROM benchmark_runs
    WHERE version_tag = ?
      AND json_extract(metadata, '$.modelId') = ?
      AND profile = ?
      AND prompt_versions = ?
      AND skill_versions = ?
      AND overall_score > 0
    ORDER BY timestamp DESC
    LIMIT 1
  `);
  return stmt.get(
    criteria.versionTag,
    criteria.modelId,
    criteria.profile,
    criteria.promptVersions,
    criteria.skillVersions
  ) as BenchmarkRunRow | null;
}

export function getBenchmarkRun(id: string): BenchmarkRunRow | null {
  const database = getDatabase();
  const stmt = database.prepare("SELECT * FROM benchmark_runs WHERE id = ?");
  return stmt.get(id) as BenchmarkRunRow | null;
}

export function listBenchmarkRuns(
  options: { limit?: number; offset?: number; modelId?: string } = {}
): BenchmarkRunRow[] {
  const database = getDatabase();
  let sql = "SELECT * FROM benchmark_runs";
  const params: SQLParam[] = [];

  if (options.modelId) {
    sql += " WHERE json_extract(metadata, '$.modelId') = ?";
    params.push(options.modelId);
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
  return stmt.all(...params) as BenchmarkRunRow[];
}

export function updateBenchmarkRun(
  id: string,
  updates: {
    passedCount?: number;
    failedCount?: number;
    overallScore?: number;
    durationMs?: number;
  }
): void {
  const database = getDatabase();
  const setClauses: string[] = [];
  const params: SQLParam[] = [];

  if (updates.passedCount !== undefined) {
    setClauses.push("passed_count = ?");
    params.push(updates.passedCount);
  }
  if (updates.failedCount !== undefined) {
    setClauses.push("failed_count = ?");
    params.push(updates.failedCount);
  }
  if (updates.overallScore !== undefined) {
    setClauses.push("overall_score = ?");
    params.push(updates.overallScore);
  }
  if (updates.durationMs !== undefined) {
    setClauses.push("duration_ms = ?");
    params.push(updates.durationMs);
  }

  if (setClauses.length === 0) return;

  params.push(id);
  const stmt = database.prepare(`UPDATE benchmark_runs SET ${setClauses.join(", ")} WHERE id = ?`);
  stmt.run(...params);
}

/**
 * Clean up interrupted benchmark runs on server startup.
 * Interrupted runs (duration_ms = 0/NULL AND overall_score = 0) contain
 * no useful data, so delete them outright instead of marking as failed.
 * Also cleans up legacy marked-interrupted runs (duration_ms = -1) with no score.
 */
export function markInterruptedBenchmarkRuns(): number {
  const database = getDatabase();
  try {
    // Delete runs with no progress (never started or interrupted before any test completed)
    database
      .prepare(
        "DELETE FROM benchmark_runs WHERE ((duration_ms IS NULL OR duration_ms = 0) AND overall_score = 0) OR (duration_ms = -1 AND overall_score = 0)"
      )
      .run();
    const row = database.prepare("SELECT changes() as c").get() as { c: number } | null;
    return row?.c ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Delete a benchmark run and its associated results and category scores.
 */
export function deleteBenchmarkRun(id: string): boolean {
  const database = getDatabase();
  try {
    database.prepare("DELETE FROM benchmark_results WHERE run_id = ?").run(id);
    database.prepare("DELETE FROM category_scores WHERE run_id = ?").run(id);
    database.prepare("DELETE FROM benchmark_runs WHERE id = ?").run(id);
    const row = database.prepare("SELECT changes() as c").get() as { c: number } | null;
    return (row?.c ?? 0) > 0;
  } catch {
    return false;
  }
}

// ============================================================================
// Category Score Operations
// ============================================================================

export interface CategoryScoreRow {
  id: string;
  run_id: string;
  category: string;
  subcategory: string | null;
  score: number;
  test_count: number;
  passed_count: number;
  details: string | null;
}

export function insertCategoryScore(score: {
  id: string;
  runId: string;
  category: string;
  subcategory?: string;
  score: number;
  testCount: number;
  passedCount: number;
  details?: Record<string, unknown> | unknown[];
}): void {
  const database = getDatabase();
  const stmt = database.prepare(`
    INSERT OR REPLACE INTO category_scores (id, run_id, category, subcategory, score, test_count, passed_count, details)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    score.id,
    score.runId,
    score.category,
    score.subcategory ?? null,
    score.score,
    score.testCount,
    score.passedCount,
    score.details ? JSON.stringify(score.details) : null
  );
}

export function listCategoryScores(runId: string): CategoryScoreRow[] {
  const database = getDatabase();
  const stmt = database.prepare(
    "SELECT * FROM category_scores WHERE run_id = ? ORDER BY category, subcategory"
  );
  return stmt.all(runId) as CategoryScoreRow[];
}

/**
 * Get the best (highest) score per category across all benchmark runs.
 * Returns one row per category with the max score achieved.
 */
export function getBestCategoryScores(): CategoryScoreRow[] {
  const database = getDatabase();
  const stmt = database.prepare(`
    SELECT cs.*
    FROM category_scores cs
    INNER JOIN (
      SELECT category, MAX(score) as max_score
      FROM category_scores
      GROUP BY category
    ) best ON cs.category = best.category AND cs.score = best.max_score
    GROUP BY cs.category
    ORDER BY cs.category
  `);
  return stmt.all() as CategoryScoreRow[];
}

/**
 * Get the score trend: best overall_score per version_tag from benchmark_runs.
 * Used for the Overview Tab line chart in Evolution Lab.
 */
export function getScoreTrend(
  limit: number = 20
): Array<{ version_tag: string; overall_score: number; timestamp: number }> {
  const database = getDatabase();
  const stmt = database.prepare(`
    SELECT version_tag, MAX(overall_score) as overall_score, MAX(timestamp) as timestamp
    FROM benchmark_runs
    WHERE version_tag IS NOT NULL AND version_tag != ''
    GROUP BY version_tag
    ORDER BY timestamp DESC
    LIMIT ?
  `);
  const rows = stmt.all(limit) as Array<{
    version_tag: string;
    overall_score: number;
    timestamp: number;
  }>;
  return rows.reverse();
}

// ============================================================================
// Benchmark Result Operations
// ============================================================================

export interface BenchmarkResultRow {
  id: string;
  run_id: string;
  test_case_id: string;
  timestamp: number;
  agent_response: string | null;
  tool_calls: string | null;
  scores: string | null;
  overall_score: number;
  passed: number;
  feedback: string | null;
  issues: string | null;
  duration_ms: number | null;
}

export function insertBenchmarkResult(result: {
  id: string;
  runId: string;
  testCaseId: string;
  timestamp: number;
  agentResponse?: string;
  toolCalls?: unknown[];
  scores?: Record<string, number> | unknown[];
  overallScore: number;
  passed: boolean;
  feedback?: string;
  issues?: Array<{ type: string; description: string; severity: string }>;
  durationMs?: number;
}): void {
  const database = getDatabase();
  const stmt = database.prepare(`
    INSERT OR REPLACE INTO benchmark_results (id, run_id, test_case_id, timestamp, agent_response,
      tool_calls, scores, overall_score, passed, feedback, issues, duration_ms)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    result.id,
    result.runId,
    result.testCaseId,
    result.timestamp,
    result.agentResponse ?? null,
    result.toolCalls ? JSON.stringify(result.toolCalls) : null,
    result.scores ? JSON.stringify(result.scores) : null,
    result.overallScore,
    result.passed ? 1 : 0,
    result.feedback ?? null,
    result.issues ? JSON.stringify(result.issues) : null,
    result.durationMs ?? null
  );
}

export function listBenchmarkResults(
  options: { runId?: string; testCaseId?: string; limit?: number } = {}
): BenchmarkResultRow[] {
  const database = getDatabase();
  let sql = "SELECT * FROM benchmark_results WHERE 1=1";
  const params: SQLParam[] = [];

  if (options.runId) {
    sql += " AND run_id = ?";
    params.push(options.runId);
  }
  if (options.testCaseId) {
    sql += " AND test_case_id = ?";
    params.push(options.testCaseId);
  }

  sql += " ORDER BY timestamp DESC";

  if (options.limit) {
    sql += " LIMIT ?";
    params.push(options.limit);
  }

  const stmt = database.prepare(sql);
  return stmt.all(...params) as BenchmarkResultRow[];
}

// ============================================================================
// Evolution Version Operations
// ============================================================================

export interface EvolutionVersionRow {
  id: string;
  branch_name: string;
  parent_branch: string | null;
  created_at: number;
  status: string;
  trigger_mode: string | null;
  trigger_ref: string | null;
  baseline_run_id: string | null;
  latest_run_id: string | null;
  score_delta: number | null;
  files_changed: string | null; // JSON
  worktree_path: string | null;
  metadata: string | null; // JSON
}

export function insertEvolutionVersion(version: {
  id: string;
  branchName: string;
  parentBranch?: string;
  createdAt: number;
  status?: string;
  triggerMode?: string;
  triggerRef?: string;
  baselineRunId?: string;
  latestRunId?: string;
  scoreDelta?: number;
  filesChanged?: string[];
  worktreePath?: string;
  metadata?: Record<string, unknown>;
}): void {
  const database = getDatabase();
  const stmt = database.prepare(`
    INSERT OR REPLACE INTO evolution_versions (id, branch_name, parent_branch, created_at, status,
      trigger_mode, trigger_ref, baseline_run_id, latest_run_id, score_delta, files_changed, worktree_path, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    version.id,
    version.branchName,
    version.parentBranch ?? null,
    version.createdAt,
    version.status ?? "active",
    version.triggerMode ?? null,
    version.triggerRef ?? null,
    version.baselineRunId ?? null,
    version.latestRunId ?? null,
    version.scoreDelta ?? null,
    version.filesChanged ? JSON.stringify(version.filesChanged) : null,
    version.worktreePath ?? null,
    version.metadata ? JSON.stringify(version.metadata) : null
  );
}

export function getEvolutionVersion(id: string): EvolutionVersionRow | null {
  const database = getDatabase();
  const stmt = database.prepare("SELECT * FROM evolution_versions WHERE id = ?");
  return stmt.get(id) as EvolutionVersionRow | null;
}

export function getEvolutionVersionByBranch(branchName: string): EvolutionVersionRow | null {
  const database = getDatabase();
  const stmt = database.prepare("SELECT * FROM evolution_versions WHERE branch_name = ?");
  return stmt.get(branchName) as EvolutionVersionRow | null;
}

export function listEvolutionVersions(
  options: { status?: string; triggerMode?: string; limit?: number; offset?: number } = {}
): EvolutionVersionRow[] {
  const database = getDatabase();
  let sql = "SELECT * FROM evolution_versions WHERE 1=1";
  const params: SQLParam[] = [];

  if (options.status) {
    sql += " AND status = ?";
    params.push(options.status);
  }
  if (options.triggerMode) {
    sql += " AND trigger_mode = ?";
    params.push(options.triggerMode);
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
  return stmt.all(...params) as EvolutionVersionRow[];
}

export function updateEvolutionVersion(
  id: string,
  updates: {
    status?: string;
    latestRunId?: string;
    scoreDelta?: number;
    filesChanged?: string[];
    worktreePath?: string;
    metadata?: Record<string, unknown>;
  }
): void {
  const database = getDatabase();
  const setClauses: string[] = [];
  const params: SQLParam[] = [];

  if (updates.status !== undefined) {
    setClauses.push("status = ?");
    params.push(updates.status);
  }
  if (updates.latestRunId !== undefined) {
    setClauses.push("latest_run_id = ?");
    params.push(updates.latestRunId);
  }
  if (updates.scoreDelta !== undefined) {
    setClauses.push("score_delta = ?");
    params.push(updates.scoreDelta);
  }
  if (updates.filesChanged !== undefined) {
    setClauses.push("files_changed = ?");
    params.push(JSON.stringify(updates.filesChanged));
  }
  if (updates.worktreePath !== undefined) {
    setClauses.push("worktree_path = ?");
    params.push(updates.worktreePath);
  }
  if (updates.metadata !== undefined) {
    setClauses.push("metadata = ?");
    params.push(JSON.stringify(updates.metadata));
  }

  if (setClauses.length === 0) return;

  params.push(id);
  const stmt = database.prepare(
    `UPDATE evolution_versions SET ${setClauses.join(", ")} WHERE id = ?`
  );
  stmt.run(...params);
}

export function countTestCases(options: { category?: string; difficulty?: string } = {}): number {
  const database = getDatabase();
  let sql = "SELECT COUNT(*) as count FROM test_cases WHERE 1=1";
  const params: SQLParam[] = [];

  if (options.category) {
    sql += " AND category = ?";
    params.push(options.category);
  }
  if (options.difficulty) {
    sql += " AND difficulty = ?";
    params.push(options.difficulty);
  }

  const stmt = database.prepare(sql);
  const result = stmt.get(...params) as { count: number };
  return result.count;
}
