/**
 * Bad Case MCP Tools
 *
 * Tools for managing the bad-case data loop:
 * - list/get/create bad cases
 * - update status/type (confirm, suspend, resolve)
 * - create GitHub Issue (System Agent only, uses gh CLI)
 * - convert confirmed effect-type cases to Benchmark TestCases
 * - get aggregated stats for Dashboard
 *
 * Category: "evolution" → available to System Agent (SA)
 */

import {
  insertBadCase,
  getBadCase,
  listBadCases,
  updateBadCaseStatus,
  updateBadCaseType,
  updateBadCaseGitHubIssue,
  updateBadCaseNotes,
  getBadCasesStats,
  insertTestCase,
  type BadCaseType,
  type BadCaseStatus,
  type BadCasePriority,
  type BadCaseSource,
} from "../memory/db.js";
import { isGitHubCLIAvailable, createGitHubIssue } from "../evolution/github-issues.js";
import type { PHATool } from "./types.js";

// ============================================================================
// list_bad_cases
// ============================================================================

export const listBadCasesTool: PHATool<{
  status?: string;
  type?: string;
  limit?: number;
}> = {
  name: "list_bad_cases",
  description: "列出 bad cases，支持按状态和类型筛选",
  displayName: "Bad Cases 列表",
  category: "evolution",
  icon: "alert-triangle",
  label: "List Bad Cases",
  inputSchema: {
    type: "object",
    properties: {
      status: {
        type: "string",
        description: "Filter by status: pending | confirmed | suspended | resolved | closed",
      },
      type: {
        type: "string",
        description: "Filter by type: bug | effect | unclassified",
      },
      limit: { type: "number", description: "Max results (default 50)" },
    },
  },
  execute: async (args) => {
    const rows = listBadCases({
      status: args.status as BadCaseStatus | undefined,
      type: args.type as BadCaseType | undefined,
      limit: args.limit,
    });

    return {
      success: true,
      badCases: rows.map((r) => ({
        id: r.id,
        timestamp: r.timestamp,
        source: r.source,
        reporter: r.reporter,
        type: r.type,
        status: r.status,
        priority: r.priority,
        summary: r.raw_text.slice(0, 120) + (r.raw_text.length > 120 ? "..." : ""),
        confidence: r.classification_confidence,
        hasGitHubIssue: !!r.github_issue_url,
        githubIssueNumber: r.github_issue_number,
      })),
      count: rows.length,
    };
  },
};

// ============================================================================
// get_bad_case
// ============================================================================

export const getBadCaseTool: PHATool<{ id: string }> = {
  name: "get_bad_case",
  description: "获取 bad case 的完整详情",
  displayName: "Bad Case 详情",
  category: "evolution",
  icon: "alert-triangle",
  label: "Get Bad Case",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "Bad case ID" },
    },
    required: ["id"],
  },
  execute: async (args) => {
    const row = getBadCase(args.id);
    if (!row) return { success: false, error: `Bad case not found: ${args.id}` };

    return {
      success: true,
      badCase: {
        id: row.id,
        timestamp: row.timestamp,
        source: row.source,
        reporter: row.reporter,
        rawText: row.raw_text,
        traceId: row.trace_id,
        type: row.type,
        status: row.status,
        priority: row.priority,
        classificationConfidence: row.classification_confidence,
        classificationReason: row.classification_reason,
        githubIssueUrl: row.github_issue_url,
        githubIssueNumber: row.github_issue_number,
        notes: row.notes,
        resolvedAt: row.resolved_at,
      },
    };
  },
};

// ============================================================================
// update_bad_case_status
// ============================================================================

export const updateBadCaseStatusTool: PHATool<{
  id: string;
  status: string;
  notes?: string;
}> = {
  name: "update_bad_case_status",
  description: "更新 bad case 状态：确认、挂起、解决或关闭",
  displayName: "更新 Bad Case 状态",
  category: "evolution",
  icon: "check",
  label: "Update Bad Case Status",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "Bad case ID" },
      status: {
        type: "string",
        description: "New status: pending | confirmed | suspended | resolved | closed",
      },
      notes: { type: "string", description: "Optional notes explaining the status change" },
    },
    required: ["id", "status"],
  },
  execute: async (args) => {
    const existing = getBadCase(args.id);
    if (!existing) return { success: false, error: `Bad case not found: ${args.id}` };

    updateBadCaseStatus(args.id, args.status as BadCaseStatus, args.notes);

    return {
      success: true,
      message: `Bad case ${args.id} status updated to: ${args.status}`,
    };
  },
};

// ============================================================================
// update_bad_case_type
// ============================================================================

export const updateBadCaseTypeTool: PHATool<{
  id: string;
  type: string;
  priority?: string;
  notes?: string;
}> = {
  name: "update_bad_case_type",
  description: "修改 bad case 的类型分类（bug/effect）和优先级",
  displayName: "修改 Bad Case 类型",
  category: "evolution",
  icon: "alert-triangle",
  label: "Update Bad Case Type",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "Bad case ID" },
      type: { type: "string", description: "New type: bug | effect | unclassified" },
      priority: {
        type: "string",
        description: "Optional new priority: high | medium | low | ignore",
      },
      notes: { type: "string", description: "Optional notes for the reclassification" },
    },
    required: ["id", "type"],
  },
  execute: async (args) => {
    const existing = getBadCase(args.id);
    if (!existing) return { success: false, error: `Bad case not found: ${args.id}` };

    updateBadCaseType(args.id, args.type as BadCaseType, args.priority as BadCasePriority);
    if (args.notes) updateBadCaseNotes(args.id, args.notes);

    return {
      success: true,
      message: `Bad case ${args.id} reclassified as: ${args.type}${args.priority ? ` (${args.priority})` : ""}`,
    };
  },
};

// ============================================================================
// create_github_issue_for_bad_case (System Agent only — requires gh CLI)
// ============================================================================

export const createGitHubIssueForBadCaseTool: PHATool<{
  id: string;
  titleOverride?: string;
  additionalContext?: string;
}> = {
  name: "create_github_issue_for_bad_case",
  description: "为 bad case 创建 GitHub Issue（需要 gh CLI 认证）。自动打 label：bug 或 effect。",
  displayName: "创建 GitHub Issue",
  category: "evolution",
  icon: "git-branch",
  label: "Create GitHub Issue",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "Bad case ID" },
      titleOverride: {
        type: "string",
        description:
          "Optional custom issue title. Defaults to LLM-suggested title or raw_text summary.",
      },
      additionalContext: {
        type: "string",
        description: "Extra context to include in the issue body",
      },
    },
    required: ["id"],
  },
  execute: async (args) => {
    const row = getBadCase(args.id);
    if (!row) return { success: false, error: `Bad case not found: ${args.id}` };

    if (!isGitHubCLIAvailable()) {
      return {
        success: false,
        error:
          "gh CLI is not available or not authenticated. Run `gh auth status` to check. The bad case remains in pending state in the Dashboard.",
      };
    }

    const typeLabel =
      row.type === "bug" ? "bug" : row.type === "effect" ? "effect" : "needs-triage";
    const priorityLabel = `priority:${row.priority}`;

    const title =
      args.titleOverride ??
      (row.raw_text.length <= 80 ? row.raw_text : `${row.raw_text.slice(0, 77)}...`);

    const body = buildIssueBody(row, args.additionalContext);

    try {
      const result = await createGitHubIssue({
        title,
        body,
        labels: [typeLabel, priorityLabel, "bad-case"],
      });

      updateBadCaseGitHubIssue(args.id, result.number, result.url);

      return {
        success: true,
        issueNumber: result.number,
        issueUrl: result.url,
        message: `GitHub Issue #${result.number} created for bad case ${args.id}`,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to create GitHub issue: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};

function buildIssueBody(
  row: ReturnType<typeof getBadCase> & object,
  additionalContext?: string
): string {
  if (!row) return "";
  const lines: string[] = [];

  lines.push("## Bad Case Report");
  lines.push("");
  lines.push(`**Source:** ${row.source}`);
  if (row.reporter) lines.push(`**Reporter:** ${row.reporter}`);
  lines.push(`**Type:** ${row.type}`);
  lines.push(`**Priority:** ${row.priority}`);
  lines.push(`**Reported at:** ${new Date(row.timestamp).toISOString()}`);
  lines.push("");
  lines.push("## Description");
  lines.push("");
  lines.push(row.raw_text);

  if (row.trace_id) {
    lines.push("");
    lines.push(`## Linked Trace`);
    lines.push(`Trace ID: \`${row.trace_id}\``);
    lines.push("_(View in Evolution Lab → Data → Traces)_");
  }

  if (row.classification_reason) {
    lines.push("");
    lines.push("## AI Classification");
    lines.push(`> ${row.classification_reason}`);
    lines.push(`> Confidence: ${((row.classification_confidence ?? 0) * 100).toFixed(0)}%`);
  }

  if (additionalContext) {
    lines.push("");
    lines.push("## Additional Context");
    lines.push(additionalContext);
  }

  lines.push("");
  lines.push("## Action Items");
  if (row.type === "bug") {
    lines.push("- [ ] Reproduce the issue with a minimal test case");
    lines.push("- [ ] Add a unit test to `tests/unit/` to prevent regression");
    lines.push("- [ ] Fix the root cause");
    lines.push("- [ ] Mark bad case as `resolved` in the Dashboard");
  } else {
    lines.push("- [ ] Confirm this is an effect/quality issue (not a bug)");
    lines.push("- [ ] At iteration end: review with algorithm team");
    lines.push("- [ ] Add to Benchmark test cases if appropriate");
    lines.push("- [ ] Mark bad case as `closed` in the Dashboard after iteration");
  }
  lines.push("");
  lines.push("---");
  lines.push("_Auto-created from PHA Bad Case Dashboard_");

  return lines.join("\n");
}

// ============================================================================
// convert_bad_case_to_test_case
// ============================================================================

export const convertBadCaseToTestCaseTool: PHATool<{
  id: string;
  category: string;
  query: string;
  shouldMention?: string[];
  shouldNotMention?: string[];
  minScore?: number;
}> = {
  name: "convert_bad_case_to_test_case",
  description:
    "将已确认的 effect 类 bad case 转为 Benchmark TestCase，纳入回归防护。适用于算法专家审核后的 effect 类问题。",
  displayName: "转为测试用例",
  category: "evolution",
  icon: "test-tube",
  label: "Convert to Test Case",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "Bad case ID" },
      category: {
        type: "string",
        description:
          "Benchmark category: health-data-analysis | health-coaching | safety-boundaries | personalization-memory | communication-quality",
      },
      query: { type: "string", description: "The user query that triggers this scenario" },
      shouldMention: {
        type: "array",
        items: { type: "string" },
        description: "Keywords the agent response should contain",
      },
      shouldNotMention: {
        type: "array",
        items: { type: "string" },
        description: "Keywords the agent response should NOT contain",
      },
      minScore: { type: "number", description: "Minimum acceptable score (0-100, default 70)" },
    },
    required: ["id", "category", "query"],
  },
  execute: async (args) => {
    const row = getBadCase(args.id);
    if (!row) return { success: false, error: `Bad case not found: ${args.id}` };

    if (row.status !== "confirmed") {
      return {
        success: false,
        error: `Bad case must be in 'confirmed' status before converting to a test case. Current status: ${row.status}`,
      };
    }

    const testCaseId = `bad-case-${args.id.slice(0, 8)}-${Date.now()}`;

    insertTestCase({
      id: testCaseId,
      category: args.category,
      query: args.query,
      expected: {
        shouldMention: args.shouldMention,
        shouldNotMention: args.shouldNotMention,
        minScore: args.minScore ?? 70,
      },
    });

    // Mark bad case as closed after converting
    updateBadCaseStatus(args.id, "closed", `Converted to benchmark test case: ${testCaseId}`);

    return {
      success: true,
      testCaseId,
      message: `Bad case converted to benchmark test case: ${testCaseId}. Bad case marked as closed.`,
    };
  },
};

// ============================================================================
// get_bad_cases_stats
// ============================================================================

export const getBadCasesStatsTool: PHATool<Record<string, never>> = {
  name: "get_bad_cases_stats",
  description: "获取 bad cases 聚合统计，用于 Dashboard 概览",
  displayName: "Bad Cases 统计",
  category: "evolution",
  icon: "bar-chart",
  label: "Get Bad Cases Stats",
  inputSchema: {
    type: "object",
    properties: {},
  },
  execute: async () => {
    const stats = getBadCasesStats();
    return { success: true, stats };
  },
};

// ============================================================================
// Export
// ============================================================================

export const badCaseTools = [
  listBadCasesTool,
  getBadCaseTool,
  updateBadCaseStatusTool,
  updateBadCaseTypeTool,
  createGitHubIssueForBadCaseTool,
  convertBadCaseToTestCaseTool,
  getBadCasesStatsTool,
];
