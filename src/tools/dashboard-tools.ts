/**
 * Dashboard Tools — create_dashboard + update_dashboard
 *
 * MCP tools that let the Agent dynamically create custom dashboard pages.
 * The tool itself is pass-through; storage and rendering are handled by
 * server.ts (tool_execution_end interception) and pages.ts (generateCustomDashboard).
 */

import type { PHATool } from "./types.js";
import { MAX_DASHBOARDS_PER_SESSION } from "./dashboard-types.js";
import type { WidgetType } from "./dashboard-types.js";

const VALID_WIDGET_TYPES: WidgetType[] = [
  "stat_row",
  "line_chart",
  "bar_chart",
  "progress_tracker",
  "data_table",
  "text_block",
  "milestone_timeline",
  "metric_grid",
];

interface CreateDashboardArgs {
  title: string;
  subtitle?: string;
  icon?: string;
  sections: Array<{
    title?: string;
    widgets: Array<{ type: string; config: Record<string, unknown> }>;
  }>;
}

interface UpdateDashboardArgs {
  dashboardId: string;
  title?: string;
  subtitle?: string;
  icon?: string;
  sections?: Array<{
    title?: string;
    widgets: Array<{ type: string; config: Record<string, unknown> }>;
  }>;
}

const createDashboardTool: PHATool<CreateDashboardArgs> = {
  name: "create_dashboard",
  description:
    "创建一个自定义仪表盘页面，用于追踪健康实验、目标进度等。仪表盘由多个 section 组成，每个 section 包含若干 widget。" +
    "可用 widget 类型：stat_row（指标卡片行）、line_chart（折线图）、bar_chart（柱状图）、progress_tracker（进度条）、" +
    "data_table（数据表格）、text_block（文本块）、milestone_timeline（里程碑时间线）、metric_grid（指标网格）。" +
    "创建后侧边栏会自动出现入口。每个会话最多 " +
    MAX_DASHBOARDS_PER_SESSION +
    " 个仪表盘。",
  displayName: "创建仪表盘",
  category: "presentation",
  icon: "activity",
  label: "Create Dashboard",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Dashboard title" },
      subtitle: { type: "string", description: "Optional subtitle / description" },
      icon: {
        type: "string",
        description:
          "Icon name (e.g. heart, activity, moon, brain, target). See available icons in the system.",
      },
      sections: {
        type: "array",
        description: "Dashboard sections, each containing widgets",
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "Section title (optional)" },
            widgets: {
              type: "array",
              description: "Widgets in this section",
              items: {
                type: "object",
                properties: {
                  type: {
                    type: "string",
                    description:
                      "Widget type: stat_row, line_chart, bar_chart, progress_tracker, data_table, text_block, milestone_timeline, metric_grid",
                  },
                  config: {
                    type: "object",
                    description: "Widget-specific configuration",
                  },
                },
                required: ["type", "config"],
              },
            },
          },
          required: ["widgets"],
        },
      },
    },
    required: ["title", "sections"],
  },
  execute: async (args: CreateDashboardArgs) => {
    // Validate widget types
    for (const section of args.sections) {
      for (const widget of section.widgets) {
        if (!VALID_WIDGET_TYPES.includes(widget.type as WidgetType)) {
          return {
            success: false,
            error: `Invalid widget type: ${widget.type}. Valid types: ${VALID_WIDGET_TYPES.join(", ")}`,
          };
        }
      }
    }

    const dashboardId = `dash_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const totalWidgets = args.sections.reduce((sum, s) => sum + s.widgets.length, 0);

    // Pass-through: server.ts will intercept tool_execution_end and store the dashboard
    return {
      success: true,
      details: {
        dashboardId,
        title: args.title,
        subtitle: args.subtitle,
        icon: args.icon || "activity",
        sections: args.sections,
        widgetCount: totalWidgets,
        sectionCount: args.sections.length,
      },
    };
  },
};

const updateDashboardTool: PHATool<UpdateDashboardArgs> = {
  name: "update_dashboard",
  description:
    "更新已有的自定义仪表盘。可更新标题、副标题和 sections（包括所有 widget）。" +
    "需提供 dashboardId（从 create_dashboard 返回值中获取）。",
  displayName: "更新仪表盘",
  category: "presentation",
  icon: "activity",
  label: "Update Dashboard",
  inputSchema: {
    type: "object",
    properties: {
      dashboardId: { type: "string", description: "Dashboard ID from create_dashboard" },
      title: { type: "string", description: "New title (optional)" },
      subtitle: { type: "string", description: "New subtitle (optional)" },
      icon: { type: "string", description: "New icon name (optional)" },
      sections: {
        type: "array",
        description: "New sections (replaces all existing sections)",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            widgets: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  type: { type: "string" },
                  config: { type: "object" },
                },
                required: ["type", "config"],
              },
            },
          },
          required: ["widgets"],
        },
      },
    },
    required: ["dashboardId"],
  },
  execute: async (args: UpdateDashboardArgs) => {
    // Validate widget types if sections provided
    if (args.sections) {
      for (const section of args.sections) {
        for (const widget of section.widgets) {
          if (!VALID_WIDGET_TYPES.includes(widget.type as WidgetType)) {
            return {
              success: false,
              error: `Invalid widget type: ${widget.type}. Valid types: ${VALID_WIDGET_TYPES.join(", ")}`,
            };
          }
        }
      }
    }

    // Pass-through: server.ts will intercept tool_execution_end and update the dashboard
    return {
      success: true,
      details: {
        dashboardId: args.dashboardId,
        ...(args.title && { title: args.title }),
        ...(args.subtitle && { subtitle: args.subtitle }),
        ...(args.icon && { icon: args.icon }),
        ...(args.sections && { sections: args.sections }),
      },
    };
  },
};

export const dashboardTools = [createDashboardTool, updateDashboardTool];
