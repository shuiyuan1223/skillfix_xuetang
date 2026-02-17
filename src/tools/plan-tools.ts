/**
 * Plan Tools — MCP tools for health plan management
 *
 * 6 tools: create, list, get, update_progress, adjust, update_status
 */

import { getUserUuid } from "../utils/config.js";
import { savePlan, loadPlan, listPlans } from "../plans/store.js";
import type {
  HealthPlan,
  PlanGoal,
  PlanMilestone,
  PlanStatus,
  GoalMetric,
  GoalStatus,
} from "../plans/types.js";
import type { PHATool } from "./types.js";

// ============================================================================
// create_health_plan
// ============================================================================

interface CreatePlanParams {
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  goals: Array<{
    metric: GoalMetric;
    label: string;
    targetValue: number;
    unit: string;
    frequency: "daily" | "weekly";
    baselineValue?: number;
  }>;
  milestones?: Array<{
    label: string;
    targetDate: string;
    criteria: string;
  }>;
  tags?: string[];
}

const createHealthPlanTool: PHATool<CreatePlanParams> = {
  name: "create_health_plan",
  description: "创建个性化健康计划。根据用户数据和目标，制定包含具体指标、里程碑的可追踪计划。",
  displayName: "创建健康计划",
  category: "planning",
  icon: "target",
  companionSkill: "health-planner",
  label: "Create Health Plan",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Plan name (e.g. '30-day sleep improvement')" },
      description: { type: "string", description: "Plan description and rationale" },
      startDate: { type: "string", description: "Start date (YYYY-MM-DD)" },
      endDate: { type: "string", description: "End date (YYYY-MM-DD)" },
      goals: {
        type: "array",
        description: "Plan goals with measurable targets",
        items: {
          type: "object",
          properties: {
            metric: {
              type: "string",
              description:
                "Metric type: steps, sleep_hours, exercise_count, heart_rate_resting, weight, calories, active_minutes, custom",
            },
            label: { type: "string", description: "Human-readable goal label" },
            targetValue: { type: "number", description: "Target value to achieve" },
            unit: { type: "string", description: "Unit (e.g. steps, hours, times)" },
            frequency: { type: "string", description: "daily or weekly" },
            baselineValue: { type: "number", description: "Current baseline value (optional)" },
          },
          required: ["metric", "label", "targetValue", "unit", "frequency"],
        },
      },
      milestones: {
        type: "array",
        description: "Plan milestones (optional)",
        items: {
          type: "object",
          properties: {
            label: { type: "string", description: "Milestone label" },
            targetDate: { type: "string", description: "Target date (YYYY-MM-DD)" },
            criteria: { type: "string", description: "Completion criteria" },
          },
          required: ["label", "targetDate", "criteria"],
        },
      },
      tags: { type: "array", description: "Tags for categorization", items: { type: "string" } },
    },
    required: ["name", "description", "startDate", "endDate", "goals"],
  },
  execute: async (params: CreatePlanParams) => {
    const uuid = getUserUuid();
    const now = new Date().toISOString();
    const planId = `plan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const goals: PlanGoal[] = params.goals.map((g, i) => ({
      id: `goal_${i + 1}`,
      metric: g.metric,
      label: g.label,
      targetValue: g.targetValue,
      unit: g.unit,
      frequency: g.frequency,
      baselineValue: g.baselineValue,
      status: "on_track" as GoalStatus,
    }));

    const milestones: PlanMilestone[] = (params.milestones || []).map((m, i) => ({
      id: `ms_${i + 1}`,
      label: m.label,
      targetDate: m.targetDate,
      criteria: m.criteria,
      completed: false,
    }));

    const plan: HealthPlan = {
      id: planId,
      name: params.name,
      description: params.description,
      status: "active",
      createdAt: now,
      updatedAt: now,
      startDate: params.startDate,
      endDate: params.endDate,
      goals,
      milestones,
      adjustments: [],
      progress: [],
      tags: params.tags,
    };

    savePlan(uuid, plan);

    return {
      success: true,
      planId: plan.id,
      name: plan.name,
      goalsCount: goals.length,
      milestonesCount: milestones.length,
      startDate: plan.startDate,
      endDate: plan.endDate,
    };
  },
};

// ============================================================================
// list_health_plans
// ============================================================================

interface ListPlansParams {
  status?: PlanStatus;
}

const listHealthPlansTool: PHATool<ListPlansParams> = {
  name: "list_health_plans",
  description: "列出用户的健康计划，可按状态筛选。",
  displayName: "健康计划列表",
  category: "planning",
  icon: "bar-chart",
  companionSkill: "health-planner",
  label: "List Health Plans",
  inputSchema: {
    type: "object",
    properties: {
      status: {
        type: "string",
        description: "Filter by status: active, paused, completed, archived (optional)",
      },
    },
  },
  execute: async (params: ListPlansParams) => {
    const uuid = getUserUuid();
    const plans = listPlans(uuid, params.status);

    return {
      total: plans.length,
      plans: plans.map((p) => ({
        id: p.id,
        name: p.name,
        status: p.status,
        startDate: p.startDate,
        endDate: p.endDate,
        goalsCount: p.goals.length,
        goalsCompleted: p.goals.filter((g) => g.status === "completed").length,
        tags: p.tags,
      })),
    };
  },
};

// ============================================================================
// get_health_plan
// ============================================================================

interface GetPlanParams {
  planId: string;
}

const getHealthPlanTool: PHATool<GetPlanParams> = {
  name: "get_health_plan",
  description: "获取健康计划的完整详情，包含目标、里程碑、进度和调整记录。",
  displayName: "计划详情",
  category: "planning",
  icon: "file-text",
  companionSkill: "health-planner",
  label: "Get Health Plan",
  inputSchema: {
    type: "object",
    properties: {
      planId: { type: "string", description: "Plan ID" },
    },
    required: ["planId"],
  },
  execute: async (params: GetPlanParams) => {
    const uuid = getUserUuid();
    const plan = loadPlan(uuid, params.planId);
    if (!plan) {
      return { error: "Plan not found", planId: params.planId };
    }
    return plan;
  },
};

// ============================================================================
// update_plan_progress
// ============================================================================

interface UpdateProgressParams {
  planId: string;
  entries: Array<{
    goalId: string;
    date?: string;
    actualValue: number;
    note?: string;
  }>;
}

const updatePlanProgressTool: PHATool<UpdateProgressParams> = {
  name: "update_plan_progress",
  description: "记录健康计划的目标进度数据。",
  displayName: "更新进度",
  category: "planning",
  icon: "trending-up",
  companionSkill: "health-planner",
  label: "Update Plan Progress",
  inputSchema: {
    type: "object",
    properties: {
      planId: { type: "string", description: "Plan ID" },
      entries: {
        type: "array",
        description: "Progress entries",
        items: {
          type: "object",
          properties: {
            goalId: { type: "string", description: "Goal ID" },
            date: { type: "string", description: "Date (YYYY-MM-DD, defaults to today)" },
            actualValue: { type: "number", description: "Actual measured value" },
            note: { type: "string", description: "Optional note" },
          },
          required: ["goalId", "actualValue"],
        },
      },
    },
    required: ["planId", "entries"],
  },
  execute: async (params: UpdateProgressParams) => {
    const uuid = getUserUuid();
    const plan = loadPlan(uuid, params.planId);
    if (!plan) {
      return { error: "Plan not found", planId: params.planId };
    }

    const today = new Date().toISOString().split("T")[0];
    const updated: string[] = [];

    for (const entry of params.entries) {
      const goal = plan.goals.find((g) => g.id === entry.goalId);
      if (!goal) continue;

      const date = entry.date || today;

      // Add progress entry
      plan.progress.push({
        date,
        goalId: entry.goalId,
        actualValue: entry.actualValue,
        targetValue: goal.targetValue,
        note: entry.note,
      });

      // Update goal's current value
      goal.currentValue = entry.actualValue;

      // Auto-update goal status
      const ratio = entry.actualValue / goal.targetValue;
      if (ratio >= 1) goal.status = "completed";
      else if (ratio >= 0.9) goal.status = "ahead";
      else if (ratio >= 0.6) goal.status = "on_track";
      else goal.status = "behind";

      updated.push(goal.label);
    }

    savePlan(uuid, plan);

    return {
      success: true,
      planId: plan.id,
      updatedGoals: updated,
      totalProgress: plan.progress.length,
    };
  },
};

// ============================================================================
// adjust_health_plan
// ============================================================================

interface AdjustPlanParams {
  planId: string;
  reason: string;
  changes: string;
  updatedGoals?: Array<{
    goalId: string;
    targetValue?: number;
    label?: string;
  }>;
  newEndDate?: string;
}

const adjustHealthPlanTool: PHATool<AdjustPlanParams> = {
  name: "adjust_health_plan",
  description: "调整健康计划（修改目标值、延长周期等），记录调整原因。",
  displayName: "调整计划",
  category: "planning",
  icon: "refresh-cw",
  companionSkill: "health-planner",
  label: "Adjust Health Plan",
  inputSchema: {
    type: "object",
    properties: {
      planId: { type: "string", description: "Plan ID" },
      reason: { type: "string", description: "Reason for adjustment" },
      changes: { type: "string", description: "Description of changes made" },
      updatedGoals: {
        type: "array",
        description: "Goals to update (optional)",
        items: {
          type: "object",
          properties: {
            goalId: { type: "string", description: "Goal ID" },
            targetValue: { type: "number", description: "New target value" },
            label: { type: "string", description: "New label" },
          },
          required: ["goalId"],
        },
      },
      newEndDate: { type: "string", description: "New end date (YYYY-MM-DD, optional)" },
    },
    required: ["planId", "reason", "changes"],
  },
  execute: async (params: AdjustPlanParams) => {
    const uuid = getUserUuid();
    const plan = loadPlan(uuid, params.planId);
    if (!plan) {
      return { error: "Plan not found", planId: params.planId };
    }

    // Record adjustment
    plan.adjustments.push({
      date: new Date().toISOString(),
      reason: params.reason,
      changes: params.changes,
    });

    // Apply goal updates
    if (params.updatedGoals) {
      for (const update of params.updatedGoals) {
        const goal = plan.goals.find((g) => g.id === update.goalId);
        if (!goal) continue;
        if (update.targetValue !== undefined) goal.targetValue = update.targetValue;
        if (update.label !== undefined) goal.label = update.label;
      }
    }

    // Apply end date change
    if (params.newEndDate) {
      plan.endDate = params.newEndDate;
    }

    savePlan(uuid, plan);

    return {
      success: true,
      planId: plan.id,
      adjustmentCount: plan.adjustments.length,
    };
  },
};

// ============================================================================
// update_plan_status
// ============================================================================

interface UpdatePlanStatusParams {
  planId: string;
  status: PlanStatus;
  note?: string;
}

const updatePlanStatusTool: PHATool<UpdatePlanStatusParams> = {
  name: "update_plan_status",
  description: "更新计划状态（暂停、恢复、完成、归档）。",
  displayName: "更新计划状态",
  category: "planning",
  icon: "check",
  companionSkill: "health-planner",
  label: "Update Plan Status",
  inputSchema: {
    type: "object",
    properties: {
      planId: { type: "string", description: "Plan ID" },
      status: {
        type: "string",
        description: "New status: active, paused, completed, archived",
      },
      note: { type: "string", description: "Optional note about the status change" },
    },
    required: ["planId", "status"],
  },
  execute: async (params: UpdatePlanStatusParams) => {
    const uuid = getUserUuid();
    const plan = loadPlan(uuid, params.planId);
    if (!plan) {
      return { error: "Plan not found", planId: params.planId };
    }

    const oldStatus = plan.status;
    plan.status = params.status;

    // Record as adjustment if there's a note
    if (params.note) {
      plan.adjustments.push({
        date: new Date().toISOString(),
        reason: params.note,
        changes: `Status: ${oldStatus} → ${params.status}`,
      });
    }

    // Mark all goals as completed when plan is completed
    if (params.status === "completed") {
      for (const goal of plan.goals) {
        if (goal.status !== "completed" && goal.status !== "missed") {
          goal.status =
            goal.currentValue && goal.currentValue >= goal.targetValue ? "completed" : "missed";
        }
      }
    }

    savePlan(uuid, plan);

    return {
      success: true,
      planId: plan.id,
      oldStatus,
      newStatus: plan.status,
    };
  },
};

// ============================================================================
// Export
// ============================================================================

export const planTools: PHATool<any>[] = [
  createHealthPlanTool,
  listHealthPlansTool,
  getHealthPlanTool,
  updatePlanProgressTool,
  adjustHealthPlanTool,
  updatePlanStatusTool,
];
