/**
 * Evolution MCP Tools
 *
 * Tools for managing the self-evolution system:
 * - Traces: Agent interaction records
 * - Evaluations: Quality assessments
 * - Test Cases: Benchmark tests
 * - Suggestions: Optimization proposals
 */

import {
  listTraces,
  getTrace,
  countTraces,
  listEvaluations,
  getEvaluationStats,
  getEvaluationByTraceId,
  listTestCases,
  getTestCase,
  insertTestCase,
  deleteTestCase,
  listSuggestions,
  getSuggestion,
  insertSuggestion,
  updateSuggestionStatus,
  type TraceRow,
  type EvaluationRow,
  type TestCaseRow,
  type SuggestionRow,
} from "../memory/db.js";

// ============================================================================
// Traces Tools
// ============================================================================

export const listTracesTool = {
  name: "list_traces",
  description: "List agent interaction traces with optional filtering",
  parameters: {
    type: "object" as const,
    properties: {
      limit: {
        type: "number",
        description: "Maximum number of traces to return (default: 20)",
      },
      offset: {
        type: "number",
        description: "Number of traces to skip for pagination",
      },
      sessionId: {
        type: "string",
        description: "Filter by session ID",
      },
    },
  },
  execute: async (args?: { limit?: number; offset?: number; sessionId?: string }) => {
    const options = args || {};
    const rows = listTraces({
      limit: options.limit || 20,
      offset: options.offset,
      sessionId: options.sessionId,
    });

    const total = countTraces();

    return {
      success: true,
      traces: rows.map((r) => ({
        id: r.id,
        sessionId: r.session_id,
        timestamp: r.timestamp,
        userMessage: r.user_message.slice(0, 100) + (r.user_message.length > 100 ? "..." : ""),
        responsePreview:
          r.agent_response.slice(0, 100) + (r.agent_response.length > 100 ? "..." : ""),
        durationMs: r.duration_ms,
        hasToolCalls: !!r.tool_calls,
      })),
      total,
      limit: options.limit || 20,
      offset: options.offset || 0,
    };
  },
};

export const getTraceTool = {
  name: "get_trace",
  description: "Get full details of a specific trace",
  parameters: {
    type: "object" as const,
    properties: {
      id: {
        type: "string",
        description: "Trace ID",
      },
    },
    required: ["id"],
  },
  execute: async (args: { id: string }) => {
    const row = getTrace(args.id);

    if (!row) {
      return {
        success: false,
        error: `Trace not found: ${args.id}`,
      };
    }

    // Get evaluation if exists
    const evalRow = getEvaluationByTraceId(args.id);

    return {
      success: true,
      trace: {
        id: row.id,
        sessionId: row.session_id,
        timestamp: row.timestamp,
        userMessage: row.user_message,
        agentResponse: row.agent_response,
        toolCalls: row.tool_calls ? JSON.parse(row.tool_calls) : [],
        context: row.context ? JSON.parse(row.context) : null,
        durationMs: row.duration_ms,
        tokenUsage: row.token_usage ? JSON.parse(row.token_usage) : null,
      },
      evaluation: evalRow
        ? {
            overallScore: evalRow.overall_score,
            scores: JSON.parse(evalRow.scores),
            feedback: evalRow.feedback,
            issues: evalRow.issues ? JSON.parse(evalRow.issues) : [],
          }
        : null,
    };
  },
};

// ============================================================================
// Evaluations Tools
// ============================================================================

export const getEvaluationStatsTool = {
  name: "get_evaluation_stats",
  description: "Get aggregate evaluation statistics",
  parameters: {
    type: "object" as const,
    properties: {},
  },
  execute: async () => {
    const stats = getEvaluationStats();

    return {
      success: true,
      stats: {
        totalCount: stats.totalCount,
        averageScore: Math.round(stats.averageScore * 10) / 10,
        scoreDistribution: stats.scoreDistribution,
      },
    };
  },
};

export const listEvaluationsTool = {
  name: "list_evaluations",
  description: "List evaluation results with optional score filtering",
  parameters: {
    type: "object" as const,
    properties: {
      limit: {
        type: "number",
        description: "Maximum number of evaluations to return (default: 20)",
      },
      minScore: {
        type: "number",
        description: "Minimum overall score filter",
      },
      maxScore: {
        type: "number",
        description: "Maximum overall score filter",
      },
    },
  },
  execute: async (args?: { limit?: number; minScore?: number; maxScore?: number }) => {
    const options = args || {};
    const rows = listEvaluations({
      limit: options.limit || 20,
      minScore: options.minScore,
      maxScore: options.maxScore,
    });

    return {
      success: true,
      evaluations: rows.map((r) => ({
        id: r.id,
        traceId: r.trace_id,
        timestamp: r.timestamp,
        overallScore: r.overall_score,
        scores: JSON.parse(r.scores),
        feedback: r.feedback,
        issueCount: r.issues ? JSON.parse(r.issues).length : 0,
      })),
      count: rows.length,
    };
  },
};

// ============================================================================
// Test Cases (Benchmark) Tools
// ============================================================================

export const listTestCasesTool = {
  name: "list_test_cases",
  description: "List benchmark test cases",
  parameters: {
    type: "object" as const,
    properties: {
      category: {
        type: "string",
        description: "Filter by category",
      },
      limit: {
        type: "number",
        description: "Maximum number of test cases to return",
      },
    },
  },
  execute: async (args?: { category?: string; limit?: number }) => {
    const options = args || {};
    const rows = listTestCases({
      category: options.category,
      limit: options.limit || 50,
    });

    return {
      success: true,
      testCases: rows.map((r) => ({
        id: r.id,
        category: r.category,
        query: r.query.slice(0, 100) + (r.query.length > 100 ? "..." : ""),
        expected: JSON.parse(r.expected),
        createdAt: r.created_at,
      })),
      count: rows.length,
    };
  },
};

export const getTestCaseTool = {
  name: "get_test_case",
  description: "Get full details of a test case",
  parameters: {
    type: "object" as const,
    properties: {
      id: {
        type: "string",
        description: "Test case ID",
      },
    },
    required: ["id"],
  },
  execute: async (args: { id: string }) => {
    const row = getTestCase(args.id);

    if (!row) {
      return {
        success: false,
        error: `Test case not found: ${args.id}`,
      };
    }

    return {
      success: true,
      testCase: {
        id: row.id,
        category: row.category,
        query: row.query,
        context: row.context ? JSON.parse(row.context) : null,
        expected: JSON.parse(row.expected),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    };
  },
};

export const createTestCaseTool = {
  name: "create_test_case",
  description: "Create a new benchmark test case",
  parameters: {
    type: "object" as const,
    properties: {
      category: {
        type: "string",
        description: "Test category (e.g., 'sleep', 'heart', 'activity', 'safety')",
      },
      query: {
        type: "string",
        description: "The user query to test",
      },
      context: {
        type: "object",
        description: "Optional context (health data) for the test",
      },
      shouldMention: {
        type: "array",
        items: { type: "string" },
        description: "Keywords the response should mention",
      },
      shouldNotMention: {
        type: "array",
        items: { type: "string" },
        description: "Keywords the response should NOT mention",
      },
      minScore: {
        type: "number",
        description: "Minimum acceptable score (0-100)",
      },
    },
    required: ["category", "query"],
  },
  execute: async (args: {
    category: string;
    query: string;
    context?: Record<string, unknown>;
    shouldMention?: string[];
    shouldNotMention?: string[];
    minScore?: number;
  }) => {
    const id = crypto.randomUUID();

    insertTestCase({
      id,
      category: args.category,
      query: args.query,
      context: args.context,
      expected: {
        shouldMention: args.shouldMention,
        shouldNotMention: args.shouldNotMention,
        minScore: args.minScore,
      },
    });

    return {
      success: true,
      message: `Created test case: ${id}`,
      id,
    };
  },
};

export const deleteTestCaseTool = {
  name: "delete_test_case",
  description: "Delete a benchmark test case",
  parameters: {
    type: "object" as const,
    properties: {
      id: {
        type: "string",
        description: "Test case ID to delete",
      },
    },
    required: ["id"],
  },
  execute: async (args: { id: string }) => {
    const existing = getTestCase(args.id);
    if (!existing) {
      return {
        success: false,
        error: `Test case not found: ${args.id}`,
      };
    }

    deleteTestCase(args.id);

    return {
      success: true,
      message: `Deleted test case: ${args.id}`,
    };
  },
};

// ============================================================================
// Suggestions Tools
// ============================================================================

export const listSuggestionsTool = {
  name: "list_suggestions",
  description: "List optimization suggestions",
  parameters: {
    type: "object" as const,
    properties: {
      status: {
        type: "string",
        description: "Filter by status: pending, testing, validated, applied, rejected",
      },
      type: {
        type: "string",
        description: "Filter by type: prompt, tool, behavior",
      },
      limit: {
        type: "number",
        description: "Maximum number of suggestions to return",
      },
    },
  },
  execute: async (args?: { status?: string; type?: string; limit?: number }) => {
    const options = args || {};
    const rows = listSuggestions({
      status: options.status,
      type: options.type,
      limit: options.limit || 20,
    });

    return {
      success: true,
      suggestions: rows.map((r) => ({
        id: r.id,
        timestamp: r.timestamp,
        type: r.type,
        target: r.target,
        status: r.status,
        rationale: r.rationale?.slice(0, 100) + ((r.rationale?.length || 0) > 100 ? "..." : ""),
        hasValidation: !!r.validation_results,
      })),
      count: rows.length,
    };
  },
};

export const getSuggestionTool = {
  name: "get_suggestion",
  description: "Get full details of a suggestion",
  parameters: {
    type: "object" as const,
    properties: {
      id: {
        type: "string",
        description: "Suggestion ID",
      },
    },
    required: ["id"],
  },
  execute: async (args: { id: string }) => {
    const row = getSuggestion(args.id);

    if (!row) {
      return {
        success: false,
        error: `Suggestion not found: ${args.id}`,
      };
    }

    return {
      success: true,
      suggestion: {
        id: row.id,
        timestamp: row.timestamp,
        type: row.type,
        target: row.target,
        currentValue: row.current_value,
        suggestedValue: row.suggested_value,
        rationale: row.rationale,
        status: row.status,
        validationResults: row.validation_results ? JSON.parse(row.validation_results) : null,
      },
    };
  },
};

export const createSuggestionTool = {
  name: "create_suggestion",
  description: "Create an optimization suggestion",
  parameters: {
    type: "object" as const,
    properties: {
      type: {
        type: "string",
        description: "Type: prompt, tool, or behavior",
      },
      target: {
        type: "string",
        description: "What to change (e.g., 'SOUL.md', 'get_health_data')",
      },
      currentValue: {
        type: "string",
        description: "Current value/behavior",
      },
      suggestedValue: {
        type: "string",
        description: "Suggested new value/behavior",
      },
      rationale: {
        type: "string",
        description: "Why this change would improve performance",
      },
    },
    required: ["type", "target", "suggestedValue"],
  },
  execute: async (args: {
    type: "prompt" | "tool" | "behavior";
    target: string;
    currentValue?: string;
    suggestedValue: string;
    rationale?: string;
  }) => {
    const id = crypto.randomUUID();

    insertSuggestion({
      id,
      timestamp: Date.now(),
      type: args.type,
      target: args.target,
      currentValue: args.currentValue,
      suggestedValue: args.suggestedValue,
      rationale: args.rationale,
    });

    return {
      success: true,
      message: `Created suggestion: ${id}`,
      id,
    };
  },
};

export const updateSuggestionStatusTool = {
  name: "update_suggestion_status",
  description: "Update the status of a suggestion",
  parameters: {
    type: "object" as const,
    properties: {
      id: {
        type: "string",
        description: "Suggestion ID",
      },
      status: {
        type: "string",
        description: "New status: pending, testing, validated, applied, rejected",
      },
      validationResults: {
        type: "object",
        properties: {
          before: { type: "number" },
          after: { type: "number" },
          improvement: { type: "number" },
        },
        description: "Optional validation results when status is 'validated'",
      },
    },
    required: ["id", "status"],
  },
  execute: async (args: {
    id: string;
    status: "pending" | "testing" | "validated" | "applied" | "rejected";
    validationResults?: { before: number; after: number; improvement: number };
  }) => {
    const existing = getSuggestion(args.id);
    if (!existing) {
      return {
        success: false,
        error: `Suggestion not found: ${args.id}`,
      };
    }

    updateSuggestionStatus(args.id, args.status, args.validationResults);

    return {
      success: true,
      message: `Updated suggestion status to: ${args.status}`,
    };
  },
};

// ============================================================================
// Benchmark Tools
// ============================================================================

export const listBenchmarkRunsTool = {
  name: "list_benchmark_runs",
  description: "List benchmark run history with scores and pass/fail counts",
  parameters: {
    type: "object" as const,
    properties: {
      limit: {
        type: "number",
        description: "Maximum number of runs to return (default: 10)",
      },
    },
  },
  execute: async (args?: { limit?: number }) => {
    const { listBenchmarkRuns } = await import("../memory/db.js");
    const rows = listBenchmarkRuns({ limit: args?.limit || 10 });

    return {
      success: true,
      runs: rows.map((r) => ({
        id: r.id,
        timestamp: r.timestamp,
        versionTag: r.version_tag,
        totalTestCases: r.total_test_cases,
        passedCount: r.passed_count,
        failedCount: r.failed_count,
        overallScore: r.overall_score,
        profile: r.profile,
        durationMs: r.duration_ms,
      })),
      count: rows.length,
    };
  },
};

export const getBenchmarkRunDetailsTool = {
  name: "get_benchmark_run_details",
  description: "Get detailed results for a benchmark run including category scores",
  parameters: {
    type: "object" as const,
    properties: {
      runId: {
        type: "string",
        description: "Benchmark run ID",
      },
    },
    required: ["runId"],
  },
  execute: async (args: { runId: string }) => {
    const { getBenchmarkRun, listCategoryScores, listBenchmarkResults } =
      await import("../memory/db.js");

    const run = getBenchmarkRun(args.runId);
    if (!run) {
      return { success: false, error: `Run not found: ${args.runId}` };
    }

    const categoryScores = listCategoryScores(args.runId);
    const results = listBenchmarkResults({ runId: args.runId });

    return {
      success: true,
      run: {
        id: run.id,
        timestamp: run.timestamp,
        versionTag: run.version_tag,
        overallScore: run.overall_score,
        profile: run.profile,
        passedCount: run.passed_count,
        failedCount: run.failed_count,
      },
      categoryScores: categoryScores.map((s) => ({
        category: s.category,
        score: s.score,
        testCount: s.test_count,
        passedCount: s.passed_count,
      })),
      results: results.map((r) => ({
        testCaseId: r.test_case_id,
        overallScore: r.overall_score,
        passed: r.passed === 1,
        feedback: r.feedback?.substring(0, 100),
      })),
    };
  },
};

// Export all tools as array
export const evolutionTools = [
  // Traces
  listTracesTool,
  getTraceTool,
  // Evaluations
  getEvaluationStatsTool,
  listEvaluationsTool,
  // Test Cases
  listTestCasesTool,
  getTestCaseTool,
  createTestCaseTool,
  deleteTestCaseTool,
  // Suggestions
  listSuggestionsTool,
  getSuggestionTool,
  createSuggestionTool,
  updateSuggestionStatusTool,
  // Benchmarks
  listBenchmarkRunsTool,
  getBenchmarkRunDetailsTool,
];
