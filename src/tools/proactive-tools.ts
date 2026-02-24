/**
 * Proactive Health Tools — MCP tools for recommendations, reminders, calendar
 *
 * 11 tools defining a standard protocol for proactive health capabilities.
 * Internal implementation uses JSON storage; production can swap with real
 * system APIs (Celia Suggestions, Reminders, Calendar) via MCP.
 */

import { getUserUuid } from "../utils/config.js";
import {
  listRecommendations,
  saveRecommendation,
  getRecommendation,
  listReminders,
  saveReminder,
  getReminder,
  deleteReminder,
  listCalendarEvents,
  saveCalendarEvent,
  getCalendarEvent,
  deleteCalendarEvent,
} from "../proactive/store.js";
import type {
  Recommendation,
  RecommendationType,
  Priority,
  Reminder,
  ReminderCategory,
  RepeatRule,
  CalendarEvent,
  CalendarCategory,
} from "../proactive/types.js";
import type { PHATool } from "./types.js";

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ============================================================================
// create_recommendation
// ============================================================================

interface CreateRecommendationParams {
  type: RecommendationType;
  title: string;
  body: string;
  priority?: Priority;
  icon?: string;
  actionLabel?: string;
  actionId?: string;
  relatedPlanId?: string;
  relatedMetric?: string;
  expiresInHours?: number;
}

const createRecommendationTool: PHATool<CreateRecommendationParams> = {
  name: "create_recommendation",
  description:
    "创建主动健康建议/推荐（类似小艺建议）。适用于根据用户健康数据主动推送有针对性的建议。",
  displayName: "健康推荐",
  category: "proactive",
  icon: "sparkles",
  label: "Create Recommendation",
  inputSchema: {
    type: "object",
    properties: {
      type: {
        type: "string",
        description:
          "Type: health_tip (日常建议), plan_reminder (计划提醒), achievement (成就), alert (警示), suggestion (一般建议)",
      },
      title: { type: "string", description: "Recommendation title" },
      body: { type: "string", description: "Detailed recommendation content" },
      priority: {
        type: "string",
        description: "Priority: low, medium, high, urgent (default: medium)",
      },
      icon: { type: "string", description: "Icon name (e.g., heart, moon, footprints)" },
      actionLabel: { type: "string", description: "Optional CTA button label" },
      actionId: { type: "string", description: "Optional CTA action identifier" },
      relatedPlanId: { type: "string", description: "Related health plan ID" },
      relatedMetric: { type: "string", description: "Related metric (steps, sleep_hours, etc.)" },
      expiresInHours: { type: "number", description: "Auto-expire after N hours (default: 24)" },
    },
    required: ["type", "title", "body"],
  },
  execute: async (params: CreateRecommendationParams) => {
    const uuid = getUserUuid();
    const now = new Date();
    const expiresHours = params.expiresInHours ?? 24;
    const expiresAt = new Date(now.getTime() + expiresHours * 3600000).toISOString();

    const rec: Recommendation = {
      id: genId("rec"),
      type: params.type,
      title: params.title,
      body: params.body,
      priority: params.priority || "medium",
      icon: params.icon,
      action:
        params.actionLabel && params.actionId
          ? { label: params.actionLabel, action: params.actionId }
          : undefined,
      relatedPlanId: params.relatedPlanId,
      relatedMetric: params.relatedMetric,
      createdAt: now.toISOString(),
      expiresAt,
      status: "active",
    };

    saveRecommendation(uuid, rec);
    return { success: true, id: rec.id, title: rec.title, expiresAt };
  },
};

// ============================================================================
// list_recommendations
// ============================================================================

interface ListRecommendationsParams {
  status?: string;
}

const listRecommendationsTool: PHATool<ListRecommendationsParams> = {
  name: "list_recommendations",
  description: "列出用户的健康推荐/建议，可按状态筛选。",
  displayName: "推荐列表",
  category: "proactive",
  icon: "sparkles",
  label: "List Recommendations",
  inputSchema: {
    type: "object",
    properties: {
      status: {
        type: "string",
        description: "Filter by status: active, dismissed, acted (optional)",
      },
    },
  },
  execute: async (params: ListRecommendationsParams) => {
    const uuid = getUserUuid();
    const items = listRecommendations(uuid, params.status);
    return {
      total: items.length,
      recommendations: items.map((r) => ({
        id: r.id,
        type: r.type,
        title: r.title,
        body: r.body,
        priority: r.priority,
        status: r.status,
        createdAt: r.createdAt,
        expiresAt: r.expiresAt,
      })),
    };
  },
};

// ============================================================================
// dismiss_recommendation
// ============================================================================

interface DismissRecommendationParams {
  id: string;
  acted?: boolean;
}

const dismissRecommendationTool: PHATool<DismissRecommendationParams> = {
  name: "dismiss_recommendation",
  description: "关闭/确认一个健康推荐。acted=true 表示用户已采纳。",
  displayName: "关闭推荐",
  category: "proactive",
  icon: "check",
  label: "Dismiss Recommendation",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "Recommendation ID" },
      acted: { type: "boolean", description: "Whether user acted on it (default: false)" },
    },
    required: ["id"],
  },
  execute: async (params: DismissRecommendationParams) => {
    const uuid = getUserUuid();
    const rec = getRecommendation(uuid, params.id);
    if (!rec) return { error: "Recommendation not found", id: params.id };

    rec.status = params.acted ? "acted" : "dismissed";
    rec.dismissedAt = new Date().toISOString();
    saveRecommendation(uuid, rec);
    return { success: true, id: rec.id, status: rec.status };
  },
};

// ============================================================================
// create_reminder
// ============================================================================

interface CreateReminderParams {
  title: string;
  body?: string;
  scheduledAt: string;
  repeatRule?: RepeatRule;
  category?: ReminderCategory;
  icon?: string;
  relatedPlanId?: string;
}

const createReminderTool: PHATool<CreateReminderParams> = {
  name: "create_reminder",
  description: "创建健康提醒/待办。支持定时和重复提醒，适用于用药、运动、喝水、就寝等场景。",
  displayName: "创建提醒",
  category: "proactive",
  icon: "timer",
  label: "Create Reminder",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Reminder title" },
      body: { type: "string", description: "Optional details" },
      scheduledAt: {
        type: "string",
        description: "When to remind (ISO datetime, e.g., 2026-02-17T22:30:00)",
      },
      repeatRule: {
        type: "string",
        description: "Repeat: daily, weekly, weekdays, none (default: none)",
      },
      category: {
        type: "string",
        description:
          "Category: medication, exercise, sleep, hydration, meal, checkup, custom (default: custom)",
      },
      icon: { type: "string", description: "Icon name" },
      relatedPlanId: { type: "string", description: "Related plan ID" },
    },
    required: ["title", "scheduledAt"],
  },
  execute: async (params: CreateReminderParams) => {
    const uuid = getUserUuid();
    const reminder: Reminder = {
      id: genId("rem"),
      title: params.title,
      body: params.body,
      scheduledAt: params.scheduledAt,
      repeatRule: params.repeatRule || "none",
      category: params.category || "custom",
      icon: params.icon,
      relatedPlanId: params.relatedPlanId,
      status: "pending",
      createdAt: new Date().toISOString(),
    };

    saveReminder(uuid, reminder);
    return {
      success: true,
      id: reminder.id,
      title: reminder.title,
      scheduledAt: reminder.scheduledAt,
      repeatRule: reminder.repeatRule,
    };
  },
};

// ============================================================================
// list_reminders
// ============================================================================

interface ListRemindersParams {
  status?: string;
}

const listRemindersTool: PHATool<ListRemindersParams> = {
  name: "list_reminders",
  description: "列出用户的健康提醒/待办。",
  displayName: "提醒列表",
  category: "proactive",
  icon: "timer",
  label: "List Reminders",
  inputSchema: {
    type: "object",
    properties: {
      status: {
        type: "string",
        description: "Filter: pending, completed, snoozed, expired (optional)",
      },
    },
  },
  execute: async (params: ListRemindersParams) => {
    const uuid = getUserUuid();
    const items = listReminders(uuid, params.status);
    return {
      total: items.length,
      reminders: items.map((r) => ({
        id: r.id,
        title: r.title,
        body: r.body,
        scheduledAt: r.scheduledAt,
        repeatRule: r.repeatRule,
        category: r.category,
        status: r.status,
      })),
    };
  },
};

// ============================================================================
// complete_reminder
// ============================================================================

interface CompleteReminderParams {
  id: string;
}

const completeReminderTool: PHATool<CompleteReminderParams> = {
  name: "complete_reminder",
  description: "标记提醒为已完成。",
  displayName: "完成提醒",
  category: "proactive",
  icon: "check",
  label: "Complete Reminder",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "Reminder ID" },
    },
    required: ["id"],
  },
  execute: async (params: CompleteReminderParams) => {
    const uuid = getUserUuid();
    const reminder = getReminder(uuid, params.id);
    if (!reminder) return { error: "Reminder not found", id: params.id };

    reminder.status = "completed";
    reminder.completedAt = new Date().toISOString();
    saveReminder(uuid, reminder);
    return { success: true, id: reminder.id, title: reminder.title };
  },
};

// ============================================================================
// delete_reminder
// ============================================================================

interface DeleteReminderParams {
  id: string;
}

const deleteReminderTool: PHATool<DeleteReminderParams> = {
  name: "delete_reminder",
  description: "删除一个提醒。",
  displayName: "删除提醒",
  category: "proactive",
  icon: "x",
  label: "Delete Reminder",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "Reminder ID" },
    },
    required: ["id"],
  },
  execute: async (params: DeleteReminderParams) => {
    const uuid = getUserUuid();
    const ok = deleteReminder(uuid, params.id);
    return ok ? { success: true, id: params.id } : { error: "Reminder not found", id: params.id };
  },
};

// ============================================================================
// create_calendar_event
// ============================================================================

interface CreateCalendarEventParams {
  title: string;
  description?: string;
  startTime: string;
  endTime?: string;
  allDay?: boolean;
  category?: CalendarCategory;
  icon?: string;
  relatedPlanId?: string;
}

const createCalendarEventTool: PHATool<CreateCalendarEventParams> = {
  name: "create_calendar_event",
  description: "创建健康日历事件。适用于运动安排、体检预约、用药计划等需要日程管理的场景。",
  displayName: "创建日历事件",
  category: "proactive",
  icon: "calendar",
  label: "Create Calendar Event",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Event title" },
      description: { type: "string", description: "Event description" },
      startTime: {
        type: "string",
        description: "Start time (ISO datetime, e.g., 2026-02-18T18:00:00)",
      },
      endTime: { type: "string", description: "End time (ISO datetime, optional)" },
      allDay: { type: "boolean", description: "All-day event (default: false)" },
      category: {
        type: "string",
        description:
          "Category: workout, checkup, meal, sleep, medication, custom (default: custom)",
      },
      icon: { type: "string", description: "Icon name" },
      relatedPlanId: { type: "string", description: "Related plan ID" },
    },
    required: ["title", "startTime"],
  },
  execute: async (params: CreateCalendarEventParams) => {
    const uuid = getUserUuid();
    const event: CalendarEvent = {
      id: genId("cal"),
      title: params.title,
      description: params.description,
      startTime: params.startTime,
      endTime: params.endTime,
      allDay: params.allDay,
      category: params.category || "custom",
      icon: params.icon,
      relatedPlanId: params.relatedPlanId,
      status: "scheduled",
      createdAt: new Date().toISOString(),
    };

    saveCalendarEvent(uuid, event);
    return {
      success: true,
      id: event.id,
      title: event.title,
      startTime: event.startTime,
      endTime: event.endTime,
    };
  },
};

// ============================================================================
// list_calendar_events
// ============================================================================

interface ListCalendarEventsParams {
  from?: string;
  to?: string;
  status?: string;
}

const listCalendarEventsTool: PHATool<ListCalendarEventsParams> = {
  name: "list_calendar_events",
  description: "列出日历事件，支持按时间范围和状态筛选。",
  displayName: "日历事件列表",
  category: "proactive",
  icon: "calendar",
  label: "List Calendar Events",
  inputSchema: {
    type: "object",
    properties: {
      from: { type: "string", description: "Start date filter (ISO datetime)" },
      to: { type: "string", description: "End date filter (ISO datetime)" },
      status: {
        type: "string",
        description: "Filter: scheduled, completed, cancelled (optional)",
      },
    },
  },
  execute: async (params: ListCalendarEventsParams) => {
    const uuid = getUserUuid();
    const items = listCalendarEvents(uuid, params);
    return {
      total: items.length,
      events: items.map((e) => ({
        id: e.id,
        title: e.title,
        description: e.description,
        startTime: e.startTime,
        endTime: e.endTime,
        allDay: e.allDay,
        category: e.category,
        status: e.status,
      })),
    };
  },
};

// ============================================================================
// update_calendar_event
// ============================================================================

interface UpdateCalendarEventParams {
  id: string;
  title?: string;
  description?: string;
  startTime?: string;
  endTime?: string;
  status?: string;
}

const updateCalendarEventTool: PHATool<UpdateCalendarEventParams> = {
  name: "update_calendar_event",
  description: "更新日历事件（修改时间、标记完成/取消等）。",
  displayName: "更新日历事件",
  category: "proactive",
  icon: "calendar",
  label: "Update Calendar Event",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "Event ID" },
      title: { type: "string", description: "New title" },
      description: { type: "string", description: "New description" },
      startTime: { type: "string", description: "New start time" },
      endTime: { type: "string", description: "New end time" },
      status: { type: "string", description: "New status: scheduled, completed, cancelled" },
    },
    required: ["id"],
  },
  execute: async (params: UpdateCalendarEventParams) => {
    const uuid = getUserUuid();
    const event = getCalendarEvent(uuid, params.id);
    if (!event) return { error: "Event not found", id: params.id };

    if (params.title) event.title = params.title;
    if (params.description) event.description = params.description;
    if (params.startTime) event.startTime = params.startTime;
    if (params.endTime) event.endTime = params.endTime;
    if (params.status) event.status = params.status as CalendarEvent["status"];

    saveCalendarEvent(uuid, event);
    return { success: true, id: event.id, title: event.title, status: event.status };
  },
};

// ============================================================================
// delete_calendar_event
// ============================================================================

interface DeleteCalendarEventParams {
  id: string;
}

const deleteCalendarEventTool: PHATool<DeleteCalendarEventParams> = {
  name: "delete_calendar_event",
  description: "删除一个日历事件。",
  displayName: "删除日历事件",
  category: "proactive",
  icon: "x",
  label: "Delete Calendar Event",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "Event ID" },
    },
    required: ["id"],
  },
  execute: async (params: DeleteCalendarEventParams) => {
    const uuid = getUserUuid();
    const ok = deleteCalendarEvent(uuid, params.id);
    return ok ? { success: true, id: params.id } : { error: "Event not found", id: params.id };
  },
};

// ============================================================================
// Export
// ============================================================================

export const proactiveTools: PHATool<any>[] = [
  createRecommendationTool,
  listRecommendationsTool,
  dismissRecommendationTool,
  createReminderTool,
  listRemindersTool,
  completeReminderTool,
  deleteReminderTool,
  createCalendarEventTool,
  listCalendarEventsTool,
  updateCalendarEventTool,
  deleteCalendarEventTool,
];
