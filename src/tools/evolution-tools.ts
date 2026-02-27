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
} from '../memory/db.js';
import { BenchmarkRunner, type BenchmarkRunnerConfig } from '../evolution/benchmark-runner.js';
import { diagnose, type DiagnoseResult, type ExistingBenchmarkData } from '../evolution/diagnose.js';
import type {
  BenchmarkProfile,
  BenchmarkCategory,
  BenchmarkRun,
  BenchmarkResult,
  CategoryScore,
} from '../evolution/types.js';
import { appendEvolutionLog } from './system-memory-tools.js';
import type { PHATool } from './types.js';

// ============================================================================
// Runtime config for benchmark/diagnose (injected by server.ts)
// ============================================================================

let _runnerConfig: BenchmarkRunnerConfig | null = null;

/**
 * Set the runner config at runtime (called by server.ts when agent is available).
 */
export function setEvolutionRunnerConfig(config: BenchmarkRunnerConfig): void {
  _runnerConfig = config;
}

function getRunnerConfig(): BenchmarkRunnerConfig {
  if (!_runnerConfig) {
    throw new Error('Evolution runner not configured. Start the server or initialize the agent first.');
  }
  return _runnerConfig;
}

// ============================================================================
// Traces Tools
// ============================================================================

export const listTracesTool: PHATool<{ limit?: number; offset?: number; sessionId?: string }> = {
  name: 'list_traces',
  description: '列出 Agent 交互追踪记录，支持筛选',
  displayName: '追踪列表',
  category: 'evolution' as const,
  icon: 'search',
  label: 'List Traces',
  inputSchema: {
    type: 'object' as const,
    properties: {
      limit: {
        type: 'number',
        description: 'Maximum number of traces to return (default: 20)',
      },
      offset: {
        type: 'number',
        description: 'Number of traces to skip for pagination',
      },
      sessionId: {
        type: 'string',
        description: 'Filter by session ID',
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
        userMessage: r.user_message.slice(0, 100) + (r.user_message.length > 100 ? '...' : ''),
        responsePreview: r.agent_response.slice(0, 100) + (r.agent_response.length > 100 ? '...' : ''),
        durationMs: r.duration_ms,
        hasToolCalls: !!r.tool_calls,
      })),
      total,
      limit: options.limit || 20,
      offset: options.offset || 0,
    };
  },
};

export const getTraceTool: PHATool<{ id: string }> = {
  name: 'get_trace',
  description: '获取特定追踪记录的完整详情',
  displayName: '追踪详情',
  category: 'evolution' as const,
  icon: 'search',
  label: 'Get Trace',
  inputSchema: {
    type: 'object' as const,
    properties: {
      id: {
        type: 'string',
        description: 'Trace ID',
      },
    },
    required: ['id'],
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

export const getEvaluationStatsTool: PHATool<Record<string, never>> = {
  name: 'get_evaluation_stats',
  description: '获取评估统计汇总',
  displayName: '评估统计',
  category: 'evolution' as const,
  icon: 'bar-chart',
  label: 'Get Evaluation Stats',
  inputSchema: {
    type: 'object' as const,
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

export const listEvaluationsTool: PHATool<{
  limit?: number;
  minScore?: number;
  maxScore?: number;
}> = {
  name: 'list_evaluations',
  description: '列出评估结果，支持按分数筛选',
  displayName: '评估列表',
  category: 'evolution' as const,
  icon: 'bar-chart',
  label: 'List Evaluations',
  inputSchema: {
    type: 'object' as const,
    properties: {
      limit: {
        type: 'number',
        description: 'Maximum number of evaluations to return (default: 20)',
      },
      minScore: {
        type: 'number',
        description: 'Minimum overall score filter',
      },
      maxScore: {
        type: 'number',
        description: 'Maximum overall score filter',
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

export const listTestCasesTool: PHATool<{ category?: string; limit?: number }> = {
  name: 'list_test_cases',
  description: '列出基准测试用例',
  displayName: '测试用例列表',
  category: 'evolution' as const,
  icon: 'test-tube',
  label: 'List Test Cases',
  inputSchema: {
    type: 'object' as const,
    properties: {
      category: {
        type: 'string',
        description: 'Filter by category',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of test cases to return',
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
        query: r.query.slice(0, 100) + (r.query.length > 100 ? '...' : ''),
        expected: JSON.parse(r.expected),
        createdAt: r.created_at,
      })),
      count: rows.length,
    };
  },
};

export const getTestCaseTool: PHATool<{ id: string }> = {
  name: 'get_test_case',
  description: '获取测试用例的完整详情',
  displayName: '测试用例详情',
  category: 'evolution' as const,
  icon: 'test-tube',
  label: 'Get Test Case',
  inputSchema: {
    type: 'object' as const,
    properties: {
      id: {
        type: 'string',
        description: 'Test case ID',
      },
    },
    required: ['id'],
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

export const createTestCaseTool: PHATool<{
  category: string;
  query: string;
  context?: Record<string, unknown>;
  shouldMention?: string[];
  shouldNotMention?: string[];
  minScore?: number;
}> = {
  name: 'create_test_case',
  description: '创建新的基准测试用例',
  displayName: '创建测试用例',
  category: 'evolution' as const,
  icon: 'test-tube',
  label: 'Create Test Case',
  inputSchema: {
    type: 'object' as const,
    properties: {
      category: {
        type: 'string',
        description: "Test category (e.g., 'sleep', 'heart', 'activity', 'safety')",
      },
      query: {
        type: 'string',
        description: 'The user query to test',
      },
      context: {
        type: 'object',
        description: 'Optional context (health data) for the test',
      },
      shouldMention: {
        type: 'array',
        items: { type: 'string' },
        description: 'Keywords the response should mention',
      },
      shouldNotMention: {
        type: 'array',
        items: { type: 'string' },
        description: 'Keywords the response should NOT mention',
      },
      minScore: {
        type: 'number',
        description: 'Minimum acceptable score (0-100)',
      },
    },
    required: ['category', 'query'],
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

export const deleteTestCaseTool: PHATool<{ id: string }> = {
  name: 'delete_test_case',
  description: '删除基准测试用例',
  displayName: '删除测试用例',
  category: 'evolution' as const,
  icon: 'test-tube',
  label: 'Delete Test Case',
  inputSchema: {
    type: 'object' as const,
    properties: {
      id: {
        type: 'string',
        description: 'Test case ID to delete',
      },
    },
    required: ['id'],
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

export const listSuggestionsTool: PHATool<{ status?: string; type?: string; limit?: number }> = {
  name: 'list_suggestions',
  description: '列出优化建议',
  displayName: '建议列表',
  category: 'evolution' as const,
  icon: 'lightbulb',
  label: 'List Suggestions',
  inputSchema: {
    type: 'object' as const,
    properties: {
      status: {
        type: 'string',
        description: 'Filter by status: pending, testing, validated, applied, rejected',
      },
      type: {
        type: 'string',
        description: 'Filter by type: prompt, tool, behavior',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of suggestions to return',
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
        rationale: r.rationale?.slice(0, 100) + ((r.rationale?.length || 0) > 100 ? '...' : ''),
        hasValidation: !!r.validation_results,
      })),
      count: rows.length,
    };
  },
};

export const getSuggestionTool: PHATool<{ id: string }> = {
  name: 'get_suggestion',
  description: '获取建议的完整详情',
  displayName: '建议详情',
  category: 'evolution' as const,
  icon: 'lightbulb',
  label: 'Get Suggestion',
  inputSchema: {
    type: 'object' as const,
    properties: {
      id: {
        type: 'string',
        description: 'Suggestion ID',
      },
    },
    required: ['id'],
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

export const createSuggestionTool: PHATool<{
  type: 'prompt' | 'tool' | 'behavior';
  target: string;
  currentValue?: string;
  suggestedValue: string;
  rationale?: string;
}> = {
  name: 'create_suggestion',
  description: '创建优化建议',
  displayName: '创建建议',
  category: 'evolution' as const,
  icon: 'lightbulb',
  label: 'Create Suggestion',
  inputSchema: {
    type: 'object' as const,
    properties: {
      type: {
        type: 'string',
        description: 'Type: prompt, tool, or behavior',
      },
      target: {
        type: 'string',
        description: "What to change (e.g., 'SOUL.md', 'get_health_data')",
      },
      currentValue: {
        type: 'string',
        description: 'Current value/behavior',
      },
      suggestedValue: {
        type: 'string',
        description: 'Suggested new value/behavior',
      },
      rationale: {
        type: 'string',
        description: 'Why this change would improve performance',
      },
    },
    required: ['type', 'target', 'suggestedValue'],
  },
  execute: async (args: {
    type: 'prompt' | 'tool' | 'behavior';
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

export const updateSuggestionStatusTool: PHATool<{
  id: string;
  status: 'pending' | 'testing' | 'validated' | 'applied' | 'rejected';
  validationResults?: { before: number; after: number; improvement: number };
}> = {
  name: 'update_suggestion_status',
  description: '更新建议的状态',
  displayName: '更新建议状态',
  category: 'evolution' as const,
  icon: 'lightbulb',
  label: 'Update Suggestion Status',
  inputSchema: {
    type: 'object' as const,
    properties: {
      id: {
        type: 'string',
        description: 'Suggestion ID',
      },
      status: {
        type: 'string',
        description: 'New status: pending, testing, validated, applied, rejected',
      },
      validationResults: {
        type: 'object',
        properties: {
          before: { type: 'number' },
          after: { type: 'number' },
          improvement: { type: 'number' },
        },
        description: "Optional validation results when status is 'validated'",
      },
    },
    required: ['id', 'status'],
  },
  execute: async (args: {
    id: string;
    status: 'pending' | 'testing' | 'validated' | 'applied' | 'rejected';
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

export const listBenchmarkRunsTool: PHATool<{ limit?: number }> = {
  name: 'list_benchmark_runs',
  description: '列出基准评测运行历史，含分数和通过/失败计数',
  displayName: '评测列表',
  category: 'evolution' as const,
  icon: 'flask',
  label: 'List Benchmark Runs',
  inputSchema: {
    type: 'object' as const,
    properties: {
      limit: {
        type: 'number',
        description: 'Maximum number of runs to return (default: 10)',
      },
    },
  },
  execute: async (args?: { limit?: number }) => {
    const { listBenchmarkRuns } = await import('../memory/db.js');
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

export const getBenchmarkRunDetailsTool: PHATool<{ runId: string }> = {
  name: 'get_benchmark_run_details',
  description: '获取基准评测运行的详细结果，含各维度分数',
  displayName: '评测详情',
  category: 'evolution' as const,
  icon: 'flask',
  label: 'Get Benchmark Run Details',
  inputSchema: {
    type: 'object' as const,
    properties: {
      runId: {
        type: 'string',
        description: 'Benchmark run ID',
      },
    },
    required: ['runId'],
  },
  execute: async (args: { runId: string }) => {
    const { getBenchmarkRun, listCategoryScores, listBenchmarkResults } = await import('../memory/db.js');

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

// ============================================================================
// run_benchmark — Agent can run benchmarks
// ============================================================================

export const runBenchmarkTool: PHATool<{
  profile?: string;
  category?: string;
  versionTag?: string;
}> = {
  name: 'run_benchmark',
  description:
    '运行基准评测套件，从五个维度衡量 Agent 能力：健康数据分析、健康指导、安全边界、个性化记忆、沟通质量。返回分数和雷达图数据。',
  displayName: '运行评测',
  category: 'evolution' as const,
  icon: 'play',
  label: 'Run Benchmark',
  inputSchema: {
    type: 'object' as const,
    properties: {
      profile: {
        type: 'string',
        description: "Benchmark profile: 'quick' (20 core tests) or 'full' (80+ tests). Default: 'quick'",
      },
      category: {
        type: 'string',
        description:
          'Optional: run only a specific category (health-data-analysis, health-coaching, safety-boundaries, personalization-memory, communication-quality)',
      },
      versionTag: {
        type: 'string',
        description: 'Optional version tag for this benchmark run',
      },
    },
  },
  execute: async (args?: { profile?: string; category?: string; versionTag?: string }) => {
    const config = getRunnerConfig();
    const profile = (args?.profile || 'quick') as BenchmarkProfile;

    const runner = new BenchmarkRunner(config);
    await runner.seedTestCases();

    const { run, results, categoryScores } = await runner.run({
      profile,
      category: args?.category as BenchmarkCategory | undefined,
      versionTag: args?.versionTag,
    });

    const categories: Array<{ category: string; score: number; passed: number; total: number }> = [];
    for (const [cat, catScore] of categoryScores) {
      categories.push({
        category: cat,
        score: Math.round(catScore.score),
        passed: catScore.passedCount,
        total: catScore.testCount,
      });
    }

    // Auto-log benchmark result to evolution-log.md
    try {
      const catSummary = categories.map((c) => `  - ${c.category}: ${c.score} (${c.passed}/${c.total})`).join('\n');
      appendEvolutionLog(
        `**Benchmark Run** (${profile})\n` +
          `Overall: ${run.overallScore.toFixed(3)} | Passed: ${run.passedCount}/${run.totalTestCases} | Duration: ${run.durationMs}ms\n` +
          `Categories:\n${catSummary}`
      );
    } catch {
      /* best-effort logging */
    }

    return {
      success: true,
      runId: run.id,
      overallScore: run.overallScore,
      passed: run.passedCount,
      failed: run.failedCount,
      total: run.totalTestCases,
      profile,
      durationMs: run.durationMs,
      categories,
      failedTests: results
        .filter((r) => !r.passed)
        .slice(0, 10)
        .map((r) => ({
          testCaseId: r.testCaseId,
          score: r.overallScore,
          feedback: r.feedback,
        })),
    };
  },
};

// ============================================================================
// Diagnose helpers
// ============================================================================

async function loadExistingBenchmarkData(runId: string): Promise<ExistingBenchmarkData | undefined> {
  const { getBenchmarkRun, listBenchmarkResults: listBR, listCategoryScores: listCS } = await import('../memory/db.js');

  const runRow = getBenchmarkRun(runId);
  if (!runRow) {
    return undefined;
  }

  const run: BenchmarkRun = {
    id: runRow.id,
    timestamp: runRow.timestamp,
    versionTag: runRow.version_tag ?? undefined,
    promptVersions: runRow.prompt_versions ? JSON.parse(runRow.prompt_versions) : {},
    skillVersions: runRow.skill_versions ? JSON.parse(runRow.skill_versions) : {},
    totalTestCases: runRow.total_test_cases,
    passedCount: runRow.passed_count,
    failedCount: runRow.failed_count,
    overallScore: runRow.overall_score,
    durationMs: runRow.duration_ms ?? 0,
    profile: runRow.profile as 'quick' | 'full',
    metadata: runRow.metadata ? JSON.parse(runRow.metadata) : undefined,
  };

  const results: BenchmarkResult[] = listBR({ runId }).map((r) => ({
    id: r.id,
    runId: r.run_id,
    testCaseId: r.test_case_id,
    timestamp: r.timestamp,
    agentResponse: r.agent_response ?? '',
    toolCalls: r.tool_calls ? JSON.parse(r.tool_calls) : undefined,
    scores: r.scores ? JSON.parse(r.scores) : [],
    overallScore: r.overall_score,
    passed: r.passed === 1,
    feedback: r.feedback ?? '',
    issues: r.issues ? JSON.parse(r.issues) : undefined,
    durationMs: r.duration_ms ?? 0,
  }));

  const categoryScores = new Map<BenchmarkCategory, CategoryScore>();
  for (const row of listCS(runId)) {
    if (!row.subcategory) {
      categoryScores.set(row.category as BenchmarkCategory, {
        id: row.id,
        runId: row.run_id,
        category: row.category as BenchmarkCategory,
        score: row.score,
        testCount: row.test_count,
        passedCount: row.passed_count,
        details: row.details ? JSON.parse(row.details) : undefined,
      });
    }
  }

  return { run, results, categoryScores };
}

function logDiagnoseResult(result: DiagnoseResult): void {
  try {
    const weakSummary = result.weaknesses
      .map((w) => `  - ${w.label}: ${w.score.toFixed(2)} (gap: ${w.gap.toFixed(2)}, ${w.failingTests.length} failing)`)
      .join('\n');
    const sugSummary = result.suggestions
      .slice(0, 5)
      .map((s) => `  - [${s.priority}] ${s.category}: ${s.description.slice(0, 80)}`)
      .join('\n');
    const gapSummary = result.dataGaps.length > 0 ? `Data Gaps: ${result.dataGaps.length} issues found` : '';
    appendEvolutionLog(
      `**Diagnose Result**\n` +
        `Overall: ${result.overallScore.toFixed(3)} | ${result.run.passedCount}/${result.run.totalTestCases} passed\n${
          weakSummary ? `Weaknesses:\n${weakSummary}\n` : ''
        }${sugSummary ? `Top Suggestions:\n${sugSummary}\n` : ''}${gapSummary ? `${gapSummary}\n` : ''}`
    );
  } catch {
    /* best-effort logging */
  }
}

function formatDiagnoseResponse(result: DiagnoseResult): Record<string, unknown> {
  return {
    success: true,
    overallScore: result.overallScore,
    passed: result.run.passedCount,
    failed: result.run.failedCount,
    total: result.run.totalTestCases,
    weaknesses: result.weaknesses.map((w) => ({
      category: w.category,
      label: w.label,
      score: w.score,
      gap: w.gap,
      failingTestCount: w.failingTests.length,
      commonPatterns: w.commonPatterns,
      weakSubComponents: w.weakSubComponents,
    })),
    suggestions: result.suggestions.map((s) => ({
      category: s.category,
      description: s.description,
      targetFiles: s.targetFiles,
      priority: s.priority,
    })),
    dataGaps: result.dataGaps.map((g) => ({
      testCaseId: g.testCaseId,
      type: g.type,
      description: g.description,
      field: g.field,
      suggestion: g.suggestion,
    })),
    issuesCreated: result.issuesCreated,
  };
}

// ============================================================================
// run_diagnose — Agent can run diagnose pipeline
// ============================================================================

export const runDiagnoseTool: PHATool<{
  runId?: string;
  profile?: string;
  createIssues?: boolean;
}> = {
  name: 'run_diagnose',
  description:
    '运行诊断流水线：使用 LLM 分析评测弱项并生成改进建议。如提供 runId 则使用数据库中已有的评测结果（快速，无需重跑）；否则先运行新的基准评测。',
  displayName: '运行诊断',
  category: 'evolution' as const,
  icon: 'stethoscope',
  label: 'Run Diagnose',
  inputSchema: {
    type: 'object' as const,
    properties: {
      runId: {
        type: 'string',
        description:
          'Existing benchmark run ID to analyze. If provided, loads results from DB instead of re-running benchmark. Use list_benchmark_runs to find available run IDs.',
      },
      profile: {
        type: 'string',
        description: "Benchmark profile: 'quick' or 'full'. Only used when runId is not provided. Default: 'quick'",
      },
      createIssues: {
        type: 'boolean',
        description: 'Whether to create GitHub issues for each weakness. Default: false',
      },
    },
  },
  execute: async (args?: { runId?: string; profile?: string; createIssues?: boolean }) => {
    const config = getRunnerConfig();
    const profile = (args?.profile || 'quick') as BenchmarkProfile;

    const existingBenchmark = args?.runId ? await loadExistingBenchmarkData(args.runId) : undefined;
    if (args?.runId && !existingBenchmark) {
      return { success: false, error: `Benchmark run ${args.runId} not found in database` };
    }

    const result: DiagnoseResult = await diagnose({
      profile,
      existingBenchmark,
      runnerConfig: existingBenchmark ? undefined : config,
      llmCall: config.llmCall,
      createIssues: args?.createIssues || false,
    });

    logDiagnoseResult(result);

    return formatDiagnoseResponse(result);
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
  // Execution tools (require runtime config)
  runBenchmarkTool,
  runDiagnoseTool,
];
