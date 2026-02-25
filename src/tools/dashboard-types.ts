/**
 * Dashboard Types — Widget abstraction for dynamic dashboards
 *
 * Agent creates dashboards using structured widget definitions.
 * The gateway maps these to A2UI components for rendering.
 */

// ============================================================================
// Widget Types
// ============================================================================

export type WidgetType =
  | "stat_row"
  | "line_chart"
  | "bar_chart"
  | "progress_tracker"
  | "data_table"
  | "text_block"
  | "milestone_timeline"
  | "metric_grid";

// --- Widget Config Types ---

export interface StatRowConfig {
  items: Array<{
    label: string;
    value: string;
    unit?: string;
    icon?: string;
    color?: string;
    trend?: { direction: "up" | "down" | "stable"; value: string };
  }>;
  columns?: number;
}

export interface LineChartConfig {
  title?: string;
  data: Array<{ label: string; value: number }>;
  yLabel?: string;
  color?: string;
}

export interface BarChartConfig {
  title?: string;
  data: Array<{ label: string; value: number }>;
  yLabel?: string;
  color?: string;
}

export interface ProgressTrackerConfig {
  title: string;
  current: number;
  target: number;
  unit?: string;
  color?: string;
}

export interface DataTableConfig {
  columns: Array<{ key: string; label: string }>;
  rows: Array<Record<string, unknown>>;
}

export interface TextBlockConfig {
  content: string;
  variant?: "heading" | "subheading" | "body" | "caption";
}

export interface MilestoneTimelineConfig {
  entries: Array<{
    date: string;
    title: string;
    description?: string;
    status?: "completed" | "current" | "upcoming";
    icon?: string;
  }>;
}

export interface MetricGridConfig {
  metrics: Array<{
    label: string;
    value: string;
    unit?: string;
    icon?: string;
    color?: string;
  }>;
  columns?: number;
}

export type WidgetConfig =
  | StatRowConfig
  | LineChartConfig
  | BarChartConfig
  | ProgressTrackerConfig
  | DataTableConfig
  | TextBlockConfig
  | MilestoneTimelineConfig
  | MetricGridConfig;

// ============================================================================
// Dashboard Definition
// ============================================================================

export interface DashboardWidget {
  type: WidgetType;
  config: Record<string, unknown>;
}

export interface DashboardSection {
  title?: string;
  widgets: DashboardWidget[];
}

export interface DashboardDefinition {
  id: string;
  title: string;
  subtitle?: string;
  icon?: string;
  sections: DashboardSection[];
  createdAt: string;
  updatedAt: string;
}

/** Max dashboards per session */
export const MAX_DASHBOARDS_PER_SESSION = 5;
