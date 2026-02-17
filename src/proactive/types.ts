/**
 * Proactive Health System — Types
 *
 * Defines the standard protocol for recommendations, reminders, and calendar events.
 * Currently backed by local JSON storage; can be swapped with real system APIs
 * (e.g., Celia Suggestions, iOS Reminders, Google Calendar) via MCP.
 */

// ============================================================================
// Recommendations (小艺建议 — proactive health suggestions)
// ============================================================================

export type RecommendationType =
  | "health_tip"
  | "plan_reminder"
  | "achievement"
  | "alert"
  | "suggestion";

export type Priority = "low" | "medium" | "high" | "urgent";

export type RecommendationStatus = "active" | "dismissed" | "acted";

export interface Recommendation {
  id: string;
  type: RecommendationType;
  title: string;
  body: string;
  priority: Priority;
  icon?: string;
  /** Optional CTA button */
  action?: {
    label: string;
    /** Action identifier for frontend handling */
    action: string;
    payload?: Record<string, unknown>;
  };
  /** Link to related health plan */
  relatedPlanId?: string;
  /** Related health metric (steps, sleep_hours, etc.) */
  relatedMetric?: string;
  createdAt: string;
  /** Auto-expire after this time */
  expiresAt?: string;
  status: RecommendationStatus;
  dismissedAt?: string;
}

// ============================================================================
// Reminders (待办/提醒)
// ============================================================================

export type ReminderCategory =
  | "medication"
  | "exercise"
  | "sleep"
  | "hydration"
  | "meal"
  | "checkup"
  | "custom";

export type RepeatRule = "daily" | "weekly" | "weekdays" | "none";

export type ReminderStatus = "pending" | "completed" | "snoozed" | "expired";

export interface Reminder {
  id: string;
  title: string;
  body?: string;
  /** ISO datetime for when reminder should fire */
  scheduledAt: string;
  repeatRule: RepeatRule;
  category: ReminderCategory;
  icon?: string;
  relatedPlanId?: string;
  status: ReminderStatus;
  completedAt?: string;
  snoozedUntil?: string;
  createdAt: string;
}

// ============================================================================
// Calendar Events (日历)
// ============================================================================

export type CalendarCategory = "workout" | "checkup" | "meal" | "sleep" | "medication" | "custom";

export type CalendarEventStatus = "scheduled" | "completed" | "cancelled";

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  /** ISO datetime */
  startTime: string;
  /** ISO datetime (optional for point-in-time events) */
  endTime?: string;
  allDay?: boolean;
  category: CalendarCategory;
  icon?: string;
  relatedPlanId?: string;
  status: CalendarEventStatus;
  createdAt: string;
}
