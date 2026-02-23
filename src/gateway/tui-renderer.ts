/**
 * A2UI → TUI Renderer
 *
 * Converts A2UI component trees to formatted terminal text strings.
 * Pure function: input A2UI components, output text lines + action list.
 */

import type { A2UIComponent } from "./a2ui.js";
import { componentType, prop, children as getChildren } from "./a2ui.js";

// ANSI color helpers
const ansi = {
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  magenta: (s: string) => `\x1b[35m${s}\x1b[0m`,
  blue: (s: string) => `\x1b[34m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  gray: (s: string) => `\x1b[90m${s}\x1b[0m`,
  white: (s: string) => `\x1b[37m${s}\x1b[0m`,
  bgGreen: (s: string) => `\x1b[42;30m${s}\x1b[0m`,
  bgRed: (s: string) => `\x1b[41;37m${s}\x1b[0m`,
  bgYellow: (s: string) => `\x1b[43;30m${s}\x1b[0m`,
  bgBlue: (s: string) => `\x1b[44;37m${s}\x1b[0m`,
};

export interface TUIAction {
  number: number;
  label: string;
  action: string;
  payload?: Record<string, unknown>;
}

export interface TUIRenderResult {
  lines: string[];
  actions: TUIAction[];
}

interface RenderContext {
  width: number;
  indent: number;
  components: Map<string, A2UIComponent>;
  actions: TUIAction[];
  actionCounter: number;
}

/**
 * Main entry: render an A2UI component tree to terminal text.
 */
export function renderA2UIToTUI(
  components: unknown[],
  rootId: string,
  termWidth: number = 80
): TUIRenderResult {
  // Build component map
  const compMap = new Map<string, A2UIComponent>();
  for (const c of components as A2UIComponent[]) {
    compMap.set(c.id, c);
  }

  const ctx: RenderContext = {
    width: termWidth,
    indent: 0,
    components: compMap,
    actions: [],
    actionCounter: 0,
  };

  const root = compMap.get(rootId);
  if (!root) {
    return { lines: [ansi.dim("(empty page)")], actions: [] };
  }

  const lines = renderComponent(root, ctx);
  return { lines, actions: ctx.actions };
}

function renderComponent(comp: A2UIComponent, ctx: RenderContext): string[] {
  switch (componentType(comp)) {
    case "Text":
      return renderText(comp, ctx);
    case "Card":
      return renderCard(comp, ctx);
    case "Column":
      return renderColumn(comp, ctx);
    case "Row":
      return renderRow(comp, ctx);
    case "Grid":
      return renderGrid(comp, ctx);
    case "StatCard":
      return renderStatCard(comp, ctx);
    case "Metric":
      return renderMetric(comp, ctx);
    case "Chart":
      return renderChart(comp, ctx);
    case "Table":
    case "DataTable":
      return renderTable(comp, ctx);
    case "Tabs":
      return renderTabs(comp, ctx);
    case "Button":
      return renderButton(comp, ctx);
    case "Nav":
      return renderNav(comp, ctx);
    case "ChatMessages":
      return renderChatMessages(comp, ctx);
    case "ChatInput":
      return [];
    case "Form":
      return renderForm(comp, ctx);
    case "FormInput":
      return renderFormInput(comp, ctx);
    case "Progress":
      return renderProgress(comp, ctx);
    case "ScoreGauge":
      return renderScoreGauge(comp, ctx);
    case "Badge":
      return renderBadge(comp, ctx);
    case "StatusBadge":
      return renderStatusBadge(comp, ctx);
    case "GitTimeline":
      return renderGitTimeline(comp, ctx);
    case "StepIndicator":
      return renderStepIndicator(comp, ctx);
    case "FileTree":
      return renderFileTree(comp, ctx);
    case "VersionGraph":
      return renderVersionGraph(comp, ctx);
    case "DiffView":
      return renderDiffView(comp, ctx);
    case "CodeEditor":
      return renderCodeEditor(comp, ctx);
    case "CommitList":
      return renderCommitList(comp, ctx);
    case "ArenaPills":
      return renderArenaPills(comp, ctx);
    case "ArenaScoreTable":
      return renderArenaScoreTable(comp, ctx);
    case "ArenaCategoryCard":
      return renderArenaCategoryCard(comp, ctx);
    case "RadarChart":
      return renderRadarChartTUI(comp, ctx);
    case "ArenaRunPicker":
      return renderArenaRunPickerTUI(comp, ctx);
    case "ArenaModeToggle":
      return renderArenaModeToggleTUI(comp, ctx);
    case "Collapsible":
      return renderCollapsible(comp, ctx);
    case "ActivityRings":
      return renderActivityRings(comp, ctx);
    case "LogViewer":
      return renderLogViewer(comp, ctx);
    case "Skeleton":
      return [indent(ctx, ansi.dim("Loading..."))];
    case "Divider":
      return [indent(ctx, ansi.dim("─".repeat(Math.min(ctx.width - ctx.indent * 2, 60))))];
    case "Spacer":
      return [""];
    case "Icon":
      return [];
    case "Modal":
      return renderModal(comp, ctx);
    default:
      return renderChildren(comp, ctx);
  }
}

// ============================================================================
// Component Renderers
// ============================================================================

function renderText(comp: A2UIComponent, ctx: RenderContext): string[] {
  const text = String(prop(comp, "text") || "");
  const variant = prop(comp, "variant") as string;
  const color = prop(comp, "color") as string | undefined;

  let formatted: string;
  switch (variant) {
    case "h1":
      formatted = ansi.bold(ansi.cyan(text));
      break;
    case "h2":
      formatted = ansi.bold(text);
      break;
    case "h3":
      formatted = ansi.cyan(text);
      break;
    case "caption":
    case "label":
      formatted = ansi.dim(text);
      break;
    default:
      formatted = text;
  }

  if (color) {
    formatted = applyColor(formatted, color);
  }

  return wrapLines(formatted, ctx);
}

function renderCard(comp: A2UIComponent, ctx: RenderContext): string[] {
  const lines: string[] = [];
  const title = prop(comp, "title") as string | undefined;

  if (title) {
    lines.push(indent(ctx, ansi.bold(title)));
    lines.push(indent(ctx, ansi.dim("─".repeat(Math.min(title.length + 4, 40)))));
  }

  const childCtx = { ...ctx, indent: ctx.indent + 1 };
  lines.push(...renderChildren(comp, childCtx));

  return lines;
}

function renderColumn(comp: A2UIComponent, ctx: RenderContext): string[] {
  return renderChildren(comp, ctx);
}

function renderRow(comp: A2UIComponent, ctx: RenderContext): string[] {
  // For TUI, render row children separated by spaces on the same line if short,
  // otherwise render them vertically
  const childIds = getChildren(comp);
  if (childIds.length === 0) return [];

  const childOutputs: string[][] = [];
  for (const childId of childIds) {
    const child = ctx.components.get(childId);
    if (child) {
      childOutputs.push(renderComponent(child, ctx));
    }
  }

  // If all children are single-line and fit in width, join them
  const allSingleLine = childOutputs.every((o) => o.length <= 1);
  if (allSingleLine) {
    const joined = childOutputs.map((o) => o[0] || "").join("  ");
    if (stripAnsi(joined).length <= ctx.width - ctx.indent * 2) {
      return [indent(ctx, joined)];
    }
  }

  // Otherwise render vertically
  return childOutputs.flat();
}

function renderGrid(comp: A2UIComponent, ctx: RenderContext): string[] {
  // Render grid children in pairs per line if possible
  const childIds = getChildren(comp);
  const cols = (prop(comp, "columns") as number) || 2;
  const lines: string[] = [];

  for (let i = 0; i < childIds.length; i += cols) {
    const chunk = childIds.slice(i, i + cols);
    const parts: string[] = [];
    const colWidth = Math.floor((ctx.width - ctx.indent * 2) / cols);

    for (const childId of chunk) {
      const child = ctx.components.get(childId);
      if (child) {
        const childLines = renderComponent(child, { ...ctx, width: colWidth });
        parts.push((childLines[0] || "").trimStart());
      }
    }

    lines.push(indent(ctx, parts.join("  ")));

    // If children have multiple lines, render them too
    for (const childId of chunk) {
      const child = ctx.components.get(childId);
      if (child) {
        const childLines = renderComponent(child, {
          ...ctx,
          indent: ctx.indent + 1,
          width: colWidth,
        });
        if (childLines.length > 1) {
          lines.push(...childLines.slice(1));
        }
      }
    }
  }

  return lines;
}

function renderStatCard(comp: A2UIComponent, ctx: RenderContext): string[] {
  const title = String(prop(comp, "title") || "");
  const value = String(prop(comp, "value") ?? "");
  const subtitle = prop(comp, "subtitle") as string | undefined;
  const trend = prop(comp, "trend") as { direction: string; value: string } | undefined;

  let trendStr = "";
  if (trend) {
    const arrow = trend.direction === "up" ? "▲" : trend.direction === "down" ? "▼" : "─";
    const trendColor =
      trend.direction === "up" ? ansi.green : trend.direction === "down" ? ansi.red : ansi.dim;
    trendStr = " " + trendColor(`${arrow} ${trend.value}`);
  }

  const lines: string[] = [];
  lines.push(indent(ctx, `${ansi.bold(value)}${trendStr}  ${ansi.dim(title)}`));
  if (subtitle) {
    lines.push(indent(ctx, ansi.dim(subtitle)));
  }
  return lines;
}

function renderMetric(comp: A2UIComponent, ctx: RenderContext): string[] {
  const label = String(prop(comp, "label") || "");
  const value = String(prop(comp, "value") ?? "");
  const unit = (prop(comp, "unit") as string) || "";
  const trend = prop(comp, "trend") as string | undefined;

  let trendStr = "";
  if (trend === "up") trendStr = ansi.green(" ▲");
  else if (trend === "down") trendStr = ansi.red(" ▼");
  else if (trend === "stable") trendStr = ansi.dim(" ─");

  return [
    indent(ctx, `${ansi.dim(label)}: ${ansi.bold(value)}${unit ? " " + unit : ""}${trendStr}`),
  ];
}

function renderChart(comp: A2UIComponent, ctx: RenderContext): string[] {
  const data = (prop(comp, "data") as Record<string, unknown>[]) || [];
  const yKey = prop(comp, "yKey") as string;
  const xKey = prop(comp, "xKey") as string;
  const chartType = prop(comp, "chartType") as string;
  const lines: string[] = [];

  lines.push(indent(ctx, ansi.dim(`[${chartType} chart]`)));

  if (data.length === 0) {
    lines.push(indent(ctx, ansi.dim("  No data")));
    return lines;
  }

  // Simple sparkline for line/area charts
  const values = data.map((d) => Number(d[yKey]) || 0);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const barChars = "▁▂▃▄▅▆▇█";

  const spark = values
    .map((v) => {
      const idx = Math.round(((v - min) / range) * (barChars.length - 1));
      return barChars[idx];
    })
    .join("");

  lines.push(indent(ctx, ansi.cyan(spark)));
  lines.push(indent(ctx, ansi.dim(`  min: ${min}  max: ${max}`)));

  // Show first/last data points
  if (data.length > 1) {
    const first = data[0];
    const last = data[data.length - 1];
    lines.push(indent(ctx, ansi.dim(`  ${first[xKey]} → ${last[xKey]}`)));
  }

  return lines;
}

function renderTable(comp: A2UIComponent, ctx: RenderContext): string[] {
  const columns = (prop(comp, "columns") as Array<{ key: string; label: string }>) || [];
  const rows = (prop(comp, "rows") as Record<string, unknown>[]) || [];
  const lines: string[] = [];

  if (columns.length === 0) return [indent(ctx, ansi.dim("(empty table)"))];

  // Calculate column widths
  const availWidth = ctx.width - ctx.indent * 2;
  const colWidth = Math.max(8, Math.floor(availWidth / columns.length));

  // Header
  const headerLine = columns.map((c) => padRight(c.label, colWidth)).join("");
  lines.push(indent(ctx, ansi.bold(headerLine)));
  lines.push(indent(ctx, ansi.dim("─".repeat(Math.min(headerLine.length, availWidth)))));

  // Rows (with action numbers if clickable)
  const onRowClick = prop(comp, "onRowClick") as string | undefined;

  for (const row of rows) {
    const cells = columns.map((c) => {
      const val = row[c.key];
      return padRight(String(val ?? ""), colWidth);
    });

    let prefix = "";
    if (onRowClick) {
      ctx.actionCounter++;
      ctx.actions.push({
        number: ctx.actionCounter,
        label: String(row[columns[0].key] || "row"),
        action: onRowClick,
        payload: { row },
      });
      prefix = ansi.cyan(`[${ctx.actionCounter}] `);
    }

    lines.push(indent(ctx, prefix + cells.join("")));
  }

  // Pagination info
  const pagination = prop(comp, "pagination") as
    | { page: number; pageSize: number; total: number }
    | undefined;
  if (pagination) {
    const totalPages = Math.ceil(pagination.total / pagination.pageSize);
    lines.push(
      indent(
        ctx,
        ansi.dim(`  Page ${pagination.page + 1}/${totalPages} (${pagination.total} total)`)
      )
    );
  }

  return lines;
}

function renderTabs(comp: A2UIComponent, ctx: RenderContext): string[] {
  const tabs = (prop(comp, "tabs") as Array<{ id: string; label: string }>) || [];
  const activeTab = prop(comp, "activeTab") as string;
  const contentIds = (prop(comp, "contentIds") as Record<string, string>) || {};
  const lines: string[] = [];

  // Render tab header with action numbers
  const tabParts: string[] = [];
  for (const tab of tabs) {
    ctx.actionCounter++;
    const isActive = tab.id === activeTab;
    const label = isActive
      ? ansi.bold(ansi.cyan(`[${ctx.actionCounter}:${tab.label}]`))
      : ansi.dim(`[${ctx.actionCounter}:${tab.label}]`);
    tabParts.push(label);

    ctx.actions.push({
      number: ctx.actionCounter,
      label: `Tab: ${tab.label}`,
      action: "switch_tab",
      payload: { tab: tab.id },
    });
  }

  lines.push(indent(ctx, tabParts.join(" ")));
  lines.push(indent(ctx, ansi.dim("─".repeat(Math.min(60, ctx.width - ctx.indent * 2)))));

  // Render active tab content
  const activeContentId = contentIds[activeTab];
  if (activeContentId) {
    const content = ctx.components.get(activeContentId);
    if (content) {
      lines.push(...renderComponent(content, ctx));
    }
  }

  return lines;
}

function renderButton(comp: A2UIComponent, ctx: RenderContext): string[] {
  const label = String(prop(comp, "label") || "");
  const action = String(prop(comp, "action") || "");
  const disabled = prop(comp, "disabled") as boolean | undefined;
  const variant = prop(comp, "variant") as string | undefined;

  if (disabled) {
    return [indent(ctx, ansi.dim(`[×] ${label}`))];
  }

  ctx.actionCounter++;
  ctx.actions.push({
    number: ctx.actionCounter,
    label,
    action,
    payload: (prop(comp, "payload") as Record<string, unknown>) || undefined,
  });

  const numStr = ansi.cyan(`[${ctx.actionCounter}]`);
  const labelStr =
    variant === "danger" ? ansi.red(label) : variant === "primary" ? ansi.bold(label) : label;

  return [indent(ctx, `${numStr} ${labelStr}`)];
}

function renderNav(comp: A2UIComponent, ctx: RenderContext): string[] {
  const items = (prop(comp, "items") as Array<{ id: string; label: string; icon?: string }>) || [];
  const activeId = prop(comp, "activeId") as string | undefined;
  const lines: string[] = [];

  for (const item of items) {
    const isActive = item.id === activeId;
    const marker = isActive ? ansi.cyan("●") : ansi.dim("○");
    const label = isActive ? ansi.bold(ansi.cyan(item.label)) : item.label;
    lines.push(indent(ctx, `${marker} ${label}`));
  }

  return lines;
}

function renderChatMessages(comp: A2UIComponent, ctx: RenderContext): string[] {
  const messages =
    (prop(comp, "messages") as Array<{
      role: string;
      content?: string;
      parts?: Array<{ type: string; content?: string; toolName?: string; status?: string }>;
    }>) || [];
  const streaming = prop(comp, "streaming") as boolean | undefined;
  const streamingContent = prop(comp, "streamingContent") as string | undefined;
  const lines: string[] = [];

  for (const msg of messages) {
    if (msg.role === "user") {
      const text = msg.parts?.[0]?.content || msg.content || "";
      lines.push(indent(ctx, `${ansi.green("You")} ${ansi.dim("›")} ${text}`));
    } else if (msg.role === "assistant") {
      lines.push(indent(ctx, ansi.cyan("Assistant")));
      if (msg.parts && msg.parts.length > 0) {
        for (const part of msg.parts) {
          if (part.type === "text" && part.content?.trim()) {
            lines.push(...wrapLines(part.content, ctx));
          } else if (part.type === "tool_use") {
            const statusLabel =
              part.status === "running" ? "..." : part.status === "error" ? "ERR" : "OK";
            lines.push(indent(ctx, `  ${ansi.yellow("Tool")} ${part.toolName} [${statusLabel}]`));
          } else if (part.type === "tool_result") {
            lines.push(indent(ctx, ansi.dim("  [Card Results]")));
          }
        }
      } else {
        lines.push(...wrapLines(msg.content || "", ctx));
      }
    } else if (msg.role === "tool") {
      // Legacy tool messages
      lines.push(indent(ctx, `${ansi.yellow("Tool")} ${ansi.dim("›")} ${msg.content || ""}`));
    }
    lines.push("");
  }

  if (streaming && streamingContent) {
    lines.push(indent(ctx, ansi.cyan("Assistant")));
    lines.push(...wrapLines(streamingContent, ctx));
    lines.push(indent(ctx, ansi.dim("...")));
  }

  return lines;
}

function renderForm(comp: A2UIComponent, ctx: RenderContext): string[] {
  const lines: string[] = [];
  lines.push(...renderChildren(comp, ctx));

  const submitLabel = (prop(comp, "submitLabel") as string) || "Submit";
  const onSubmit = prop(comp, "onSubmit") as string;

  ctx.actionCounter++;
  ctx.actions.push({
    number: ctx.actionCounter,
    label: submitLabel,
    action: onSubmit,
  });
  lines.push(indent(ctx, `${ansi.cyan(`[${ctx.actionCounter}]`)} ${ansi.bold(submitLabel)}`));

  const onCancel = prop(comp, "onCancel") as string | undefined;
  if (onCancel) {
    const cancelLabel = (prop(comp, "cancelLabel") as string) || "Cancel";
    ctx.actionCounter++;
    ctx.actions.push({
      number: ctx.actionCounter,
      label: cancelLabel,
      action: onCancel,
    });
    lines.push(indent(ctx, `${ansi.cyan(`[${ctx.actionCounter}]`)} ${cancelLabel}`));
  }

  return lines;
}

function renderFormInput(comp: A2UIComponent, ctx: RenderContext): string[] {
  const label = (prop(comp, "label") as string) || (prop(comp, "name") as string) || "";
  const rawValue = prop(comp, "value");
  const value = rawValue != null ? String(rawValue) : "";
  const inputType = prop(comp, "inputType") as string;

  if (inputType === "checkbox") {
    const checked = rawValue as boolean;
    return [indent(ctx, `${checked ? "☑" : "☐"} ${label}`)];
  }

  if (inputType === "select") {
    const options = (prop(comp, "options") as Array<{ value: string; label: string }>) || [];
    const currentOption = options.find((o) => o.value === value);
    return [indent(ctx, `${ansi.dim(label + ":")} ${currentOption?.label || value}`)];
  }

  return [
    indent(
      ctx,
      `${ansi.dim(label + ":")} ${value || ansi.dim(String(prop(comp, "placeholder") || ""))}`
    ),
  ];
}

function renderProgress(comp: A2UIComponent, ctx: RenderContext): string[] {
  const value = Number(prop(comp, "value")) || 0;
  const maxValue = Number(prop(comp, "maxValue")) || 100;
  const label = prop(comp, "label") as string | undefined;
  return [indent(ctx, renderProgressBar(value, maxValue, label, ctx.width - ctx.indent * 2))];
}

function renderScoreGauge(comp: A2UIComponent, ctx: RenderContext): string[] {
  const value = Number(prop(comp, "value")) || 0;
  const max = Number(prop(comp, "max")) || 100;
  const label = prop(comp, "label") as string | undefined;
  return [indent(ctx, renderProgressBar(value, max, label, ctx.width - ctx.indent * 2))];
}

function renderBadge(comp: A2UIComponent, ctx: RenderContext): string[] {
  const text = String(prop(comp, "text") || "");
  const variant = prop(comp, "variant") as string | undefined;

  switch (variant) {
    case "success":
      return [indent(ctx, ansi.green(`[${text}]`))];
    case "warning":
      return [indent(ctx, ansi.yellow(`[${text}]`))];
    case "error":
      return [indent(ctx, ansi.red(`[${text}]`))];
    case "info":
      return [indent(ctx, ansi.blue(`[${text}]`))];
    default:
      return [indent(ctx, `[${text}]`)];
  }
}

function renderStatusBadge(comp: A2UIComponent, ctx: RenderContext): string[] {
  const status = prop(comp, "status") as string;
  const label = (prop(comp, "label") as string) || status;

  switch (status) {
    case "success":
      return [indent(ctx, ansi.green(`● ${label}`))];
    case "failed":
      return [indent(ctx, ansi.red(`● ${label}`))];
    case "running":
      return [indent(ctx, ansi.yellow(`◉ ${label}`))];
    case "pending":
      return [indent(ctx, ansi.dim(`○ ${label}`))];
    case "warning":
      return [indent(ctx, ansi.yellow(`● ${label}`))];
    default:
      return [indent(ctx, `● ${label}`)];
  }
}

function renderGitTimeline(comp: A2UIComponent, ctx: RenderContext): string[] {
  const events =
    (prop(comp, "events") as Array<{
      id: string;
      type: string;
      label: string;
      description?: string;
      branch?: string;
      hash?: string;
      score?: number;
      status?: string;
    }>) || [];
  const lines: string[] = [];

  lines.push(indent(ctx, ansi.bold("Git Timeline")));

  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const isLast = i === events.length - 1;
    const connector = isLast ? "└" : "├";
    const pipe = isLast ? " " : "│";

    const statusIcon =
      e.status === "success"
        ? ansi.green("●")
        : e.status === "failed"
          ? ansi.red("●")
          : e.status === "active"
            ? ansi.yellow("●")
            : ansi.dim("○");

    const hashStr = e.hash ? ansi.dim(` (${e.hash.substring(0, 7)})`) : "";
    const scoreStr = e.score != null ? ansi.cyan(` [${e.score}]`) : "";
    const branchStr = e.branch ? ansi.magenta(` ${e.branch}`) : "";

    lines.push(
      indent(ctx, `${connector}─ ${statusIcon} ${e.label}${hashStr}${scoreStr}${branchStr}`)
    );

    if (e.description) {
      lines.push(indent(ctx, `${pipe}  ${ansi.dim(e.description)}`));
    }
  }

  return lines;
}

function renderStepIndicator(comp: A2UIComponent, ctx: RenderContext): string[] {
  const steps =
    (prop(comp, "steps") as Array<{
      id: string;
      label: string;
      status: string;
    }>) || [];

  const parts: string[] = [];
  for (const step of steps) {
    let icon: string;
    switch (step.status) {
      case "completed":
        icon = ansi.green("●");
        break;
      case "active":
        icon = ansi.yellow("◉");
        break;
      case "failed":
        icon = ansi.red("●");
        break;
      case "skipped":
        icon = ansi.dim("⊘");
        break;
      default:
        icon = ansi.dim("○");
    }
    parts.push(`${icon} ${step.label}`);
  }

  return [indent(ctx, parts.join(" → "))];
}

function renderFileTree(comp: A2UIComponent, ctx: RenderContext): string[] {
  const files =
    (prop(comp, "files") as Array<{
      path: string;
      status: string;
      additions?: number;
      deletions?: number;
    }>) || [];
  const lines: string[] = [];

  for (const f of files) {
    const statusColor =
      f.status === "added"
        ? ansi.green
        : f.status === "deleted"
          ? ansi.red
          : f.status === "modified"
            ? ansi.yellow
            : ansi.dim;

    const statusChar =
      f.status === "added"
        ? "A"
        : f.status === "deleted"
          ? "D"
          : f.status === "modified"
            ? "M"
            : f.status === "renamed"
              ? "R"
              : "?";

    const stats = [];
    if (f.additions) stats.push(ansi.green(`+${f.additions}`));
    if (f.deletions) stats.push(ansi.red(`-${f.deletions}`));
    const statsStr = stats.length > 0 ? " " + stats.join(" ") : "";

    lines.push(indent(ctx, `${statusColor(statusChar)} ${f.path}${statsStr}`));
  }

  return lines;
}

function renderVersionGraph(comp: A2UIComponent, ctx: RenderContext): string[] {
  const mainBranch = prop(comp, "mainBranch") as
    | { name: string; latestScore?: number | null; benchmarkCount: number }
    | undefined;
  const mainCommits =
    (prop(comp, "mainCommits") as Array<{
      hash: string;
      shortHash: string;
      message: string;
      date: string;
      benchmarkScore?: number | null;
      benchmarkTag?: string;
    }>) || [];
  const versions =
    (prop(comp, "versions") as Array<{
      id: string;
      branch: string;
      parentBranch: string;
      status: string;
      trigger?: string;
      scoreDelta?: number | null;
      latestScore?: number | null;
      filesChanged?: number;
      createdAt: number;
    }>) || [];
  const onVersionClick = prop(comp, "onVersionClick") as string | undefined;
  const selectedBranch = prop(comp, "selectedBranch") as string | undefined;
  const lines: string[] = [];

  // Main branch HEAD node
  const mainName = mainBranch?.name || "main";
  const mainScore = mainBranch?.latestScore;
  const mainScoreStr = mainScore != null ? "  " + ansi.bold(mainScore.toFixed(2)) : "";

  lines.push(indent(ctx, `${ansi.bold("●")} ${ansi.bold(mainName)} (HEAD)${mainScoreStr}`));

  // Build interleaved timeline (same logic as React renderer)
  type TimelineItem =
    | { kind: "commit"; commit: (typeof mainCommits)[0] }
    | { kind: "branch"; version: (typeof versions)[0] };

  const timeline: TimelineItem[] = [];
  if (mainCommits.length > 0) {
    let vIdx = 0;
    const sortedVersions = [...versions].sort((a, b) => b.createdAt - a.createdAt);
    for (const cm of mainCommits) {
      const commitTime = new Date(cm.date).getTime();
      while (vIdx < sortedVersions.length && sortedVersions[vIdx].createdAt >= commitTime) {
        timeline.push({ kind: "branch", version: sortedVersions[vIdx] });
        vIdx++;
      }
      timeline.push({ kind: "commit", commit: cm });
    }
    while (vIdx < sortedVersions.length) {
      timeline.push({ kind: "branch", version: sortedVersions[vIdx] });
      vIdx++;
    }
  } else {
    versions.forEach((v) => timeline.push({ kind: "branch", version: v }));
  }

  if (timeline.length === 0) {
    lines.push(indent(ctx, ansi.dim("│")));
    lines.push(indent(ctx, ansi.dim("  No evolution versions yet")));
    return lines;
  }

  for (let i = 0; i < timeline.length; i++) {
    const item = timeline[i];
    const isLast = i === timeline.length - 1;

    if (item.kind === "commit") {
      const cm = item.commit;
      const trunk = isLast ? " " : "│";
      const dot = cm.benchmarkScore != null ? "○" : "·";
      let scoreStr = "";
      if (cm.benchmarkScore != null) {
        const sColor =
          cm.benchmarkScore >= 0.9 ? ansi.green : cm.benchmarkScore >= 0.7 ? ansi.yellow : ansi.red;
        scoreStr = "  " + sColor(cm.benchmarkScore.toFixed(2));
      }
      const msg = cm.message.length > 40 ? cm.message.slice(0, 40) + "…" : cm.message;
      lines.push(
        indent(ctx, `${trunk} ${ansi.dim(dot)} ${ansi.dim(cm.shortHash)} ${msg}${scoreStr}`)
      );
      continue;
    }

    // Branch (evo version)
    const v = item.version;
    const connector = isLast ? "└" : "├";
    const statusIcon =
      v.status === "active"
        ? ansi.blue("●")
        : v.status === "merged"
          ? ansi.green("●")
          : ansi.dim("●");
    const statusSuffix =
      v.status === "merged"
        ? ansi.green(" → merged")
        : v.status === "abandoned"
          ? ansi.dim(" ✕")
          : ansi.blue(" [active]");

    let scoreStr = "";
    if (v.latestScore != null) {
      const scoreColor =
        v.latestScore >= 0.9 ? ansi.green : v.latestScore >= 0.7 ? ansi.yellow : ansi.red;
      scoreStr = "  " + scoreColor(v.latestScore.toFixed(2));
      if (v.scoreDelta != null && v.scoreDelta !== 0) {
        const deltaColor = v.scoreDelta > 0 ? ansi.green : ansi.red;
        scoreStr += " " + deltaColor(`(${v.scoreDelta > 0 ? "+" : ""}${v.scoreDelta.toFixed(2)})`);
      }
    }

    const selected = v.branch === selectedBranch;
    const branchStr = selected ? ansi.bold(ansi.cyan(v.branch)) : v.branch;

    let prefix = "";
    if (onVersionClick) {
      ctx.actionCounter++;
      ctx.actions.push({
        number: ctx.actionCounter,
        label: v.branch,
        action: onVersionClick,
        payload: { branch: v.branch },
      });
      prefix = `${ansi.cyan(`[${ctx.actionCounter}]`)} `;
    }

    lines.push(
      indent(ctx, `${prefix}${connector}── ${statusIcon} ${branchStr}${statusSuffix}${scoreStr}`)
    );
  }

  return lines;
}

function renderDiffView(comp: A2UIComponent, ctx: RenderContext): string[] {
  const before = String(prop(comp, "before") || "");
  const after = String(prop(comp, "after") || "");
  const title = prop(comp, "title") as string | undefined;
  const lines: string[] = [];

  if (title) {
    lines.push(indent(ctx, ansi.bold(title)));
  }

  // Simple unified diff display
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");

  // Show removed lines
  for (const line of beforeLines) {
    if (!afterLines.includes(line)) {
      lines.push(indent(ctx, ansi.red(`- ${line}`)));
    }
  }
  // Show added lines
  for (const line of afterLines) {
    if (!beforeLines.includes(line)) {
      lines.push(indent(ctx, ansi.green(`+ ${line}`)));
    }
  }

  if (lines.length === (title ? 1 : 0)) {
    lines.push(indent(ctx, ansi.dim("  No changes")));
  }

  return lines;
}

function renderCodeEditor(comp: A2UIComponent, ctx: RenderContext): string[] {
  const value = String(prop(comp, "value") || "");
  const language = prop(comp, "language") as string | undefined;
  const lines: string[] = [];

  lines.push(indent(ctx, ansi.dim(`──── ${language || "code"} ────`)));

  const codeLines = value.split("\n");
  const showLines = codeLines.slice(0, 20); // Limit display
  for (let i = 0; i < showLines.length; i++) {
    const lineNum = ansi.dim(String(i + 1).padStart(3));
    lines.push(indent(ctx, `${lineNum} ${showLines[i]}`));
  }

  if (codeLines.length > 20) {
    lines.push(indent(ctx, ansi.dim(`... ${codeLines.length - 20} more lines`)));
  }

  lines.push(indent(ctx, ansi.dim("────────────")));

  return lines;
}

function renderCommitList(comp: A2UIComponent, ctx: RenderContext): string[] {
  const commits =
    (prop(comp, "commits") as Array<{
      shortHash: string;
      message: string;
      date: string;
      author: string;
    }>) || [];
  const lines: string[] = [];

  for (const c of commits) {
    const hash = ansi.yellow(c.shortHash);
    const msg = c.message.length > 50 ? c.message.substring(0, 50) + "..." : c.message;
    lines.push(indent(ctx, `${hash} ${msg} ${ansi.dim(c.date)}`));
  }

  return lines;
}

function renderArenaPills(comp: A2UIComponent, ctx: RenderContext): string[] {
  const pills =
    (prop(comp, "pills") as Array<{
      label: string;
      active: boolean;
      action: string;
      payload?: Record<string, unknown>;
    }>) || [];
  const clearAction = prop(comp, "clearAction") as string | undefined;
  const lines: string[] = [];

  for (const p of pills) {
    ctx.actionCounter++;
    const marker = p.active ? ansi.cyan("●") : ansi.dim("○");
    const label = p.active ? ansi.bold(p.label) : p.label;
    ctx.actions.push({
      number: ctx.actionCounter,
      label: p.label,
      action: p.action,
      payload: p.payload,
    });
    lines.push(indent(ctx, `${ansi.cyan(`[${ctx.actionCounter}]`)} ${marker} ${label}`));
  }

  if (clearAction) {
    ctx.actionCounter++;
    ctx.actions.push({
      number: ctx.actionCounter,
      label: "Clear",
      action: clearAction,
    });
    lines.push(indent(ctx, `${ansi.cyan(`[${ctx.actionCounter}]`)} ${ansi.dim("✕ Clear")}`));
  }

  return lines;
}

function renderArenaScoreTable(comp: A2UIComponent, ctx: RenderContext): string[] {
  const rows = (prop(comp, "rows") as Array<{ label: string; score: number }>) || [];
  const lines: string[] = [];
  const colWidth = 20;

  lines.push(indent(ctx, ansi.bold(padRight("Run", colWidth) + padRight("Score", 12))));
  lines.push(indent(ctx, "─".repeat(colWidth + 12)));

  for (const r of rows) {
    const pct = Math.round(r.score * 100);
    const barLen = Math.round(pct / 5);
    const bar = "█".repeat(barLen) + "░".repeat(20 - barLen);
    const scoreColor = r.score >= 0.9 ? ansi.green : r.score >= 0.7 ? ansi.yellow : ansi.red;
    lines.push(
      indent(
        ctx,
        `${padRight(r.label, colWidth)}${ansi.cyan(bar)} ${scoreColor(r.score.toFixed(2))}`
      )
    );
  }

  return lines;
}

function renderArenaCategoryCard(comp: A2UIComponent, ctx: RenderContext): string[] {
  const name = prop(comp, "categoryName") as string;
  const avgScore = prop(comp, "avgScore") as number;
  const criteria =
    (prop(comp, "criteria") as Array<{
      name: string;
      scores: Array<{ value: number }>;
    }>) || [];
  const lines: string[] = [];
  const scoreColor = avgScore >= 0.9 ? ansi.green : avgScore >= 0.7 ? ansi.yellow : ansi.red;

  lines.push(
    indent(ctx, `${ansi.bold(`=== ${name}`)} ${scoreColor(`(${avgScore.toFixed(2)})`)} ===`)
  );

  for (const cr of criteria) {
    const scores = cr.scores.map((s) => s.value.toFixed(2)).join(" / ");
    lines.push(indent(ctx, `  ${padRight(cr.name, 22)} ${scores}`));
  }

  return lines;
}

function renderRadarChartTUI(comp: A2UIComponent, ctx: RenderContext): string[] {
  const radarData = (prop(comp, "radarData") as Array<Record<string, unknown>>) || [];
  const radarSeries =
    (prop(comp, "radarSeries") as Array<{ key: string; name: string; color: string }>) || [];
  const lines: string[] = [];
  lines.push(indent(ctx, ansi.dim("[Radar Chart]")));

  if (radarData.length === 0 || radarSeries.length === 0) {
    lines.push(indent(ctx, ansi.dim("  No data")));
    return lines;
  }

  const colWidth = 10;
  const headerLine =
    "  " +
    padRight("Dimension", 18) +
    radarSeries.map((s) => padRight(s.name.slice(0, colWidth), colWidth)).join(" ");
  lines.push(indent(ctx, ansi.bold(headerLine)));
  lines.push(indent(ctx, "  " + "─".repeat(18 + radarSeries.length * (colWidth + 1))));

  for (const row of radarData) {
    const label = String(row.subject || "");
    const vals = radarSeries.map((s) => {
      const val = Number(row[s.key] ?? 0);
      const pct = Math.round(val * 100);
      return padRight(`${pct}%`, colWidth);
    });
    lines.push(indent(ctx, `  ${padRight(label, 18)}${vals.join(" ")}`));
  }
  return lines;
}

function renderArenaRunPickerTUI(comp: A2UIComponent, ctx: RenderContext): string[] {
  const runs =
    (prop(comp, "runs") as Array<{
      id: string;
      label: string;
      selected: boolean;
      score?: number;
    }>) || [];
  const action = prop(comp, "action") as string;
  const clearAction = prop(comp, "clearAction") as string | undefined;
  const lines: string[] = [];

  for (const r of runs) {
    ctx.actionCounter++;
    const marker = r.selected ? ansi.cyan("●") : ansi.dim("○");
    const label = r.selected ? ansi.bold(r.label) : r.label;
    const scoreStr = r.score != null ? ansi.dim(` (${r.score.toFixed(2)})`) : "";
    ctx.actions.push({
      number: ctx.actionCounter,
      label: r.label,
      action,
      payload: { runId: r.id },
    });
    lines.push(indent(ctx, `${ansi.cyan(`[${ctx.actionCounter}]`)} ${marker} ${label}${scoreStr}`));
  }

  if (clearAction) {
    ctx.actionCounter++;
    ctx.actions.push({
      number: ctx.actionCounter,
      label: "Clear",
      action: clearAction,
    });
    lines.push(indent(ctx, `${ansi.cyan(`[${ctx.actionCounter}]`)} ${ansi.dim("✕ Clear All")}`));
  }

  return lines;
}

function renderArenaModeToggleTUI(comp: A2UIComponent, ctx: RenderContext): string[] {
  const options = (prop(comp, "options") as Array<{ label: string; value: string }>) || [];
  const active = prop(comp, "active") as string;
  const action = prop(comp, "action") as string;
  const lines: string[] = [];
  for (const opt of options) {
    ctx.actionCounter++;
    const isActive = opt.value === active;
    const label = isActive ? ansi.cyan(`[${opt.label}]`) : opt.label;
    ctx.actions.push({
      number: ctx.actionCounter,
      label: opt.label,
      action,
      payload: { mode: opt.value },
    });
    lines.push(indent(ctx, `${ansi.cyan(`[${ctx.actionCounter}]`)} ${label}`));
  }
  return lines;
}

function renderCollapsible(comp: A2UIComponent, ctx: RenderContext): string[] {
  const title = String(prop(comp, "title") || "");
  const expanded = prop(comp, "expanded") as boolean | undefined;
  const lines: string[] = [];

  const arrow = expanded ? "▼" : "▶";
  lines.push(indent(ctx, `${arrow} ${ansi.bold(title)}`));

  if (expanded) {
    lines.push(...renderChildren(comp, { ...ctx, indent: ctx.indent + 1 }));
  }

  return lines;
}

function renderActivityRings(comp: A2UIComponent, ctx: RenderContext): string[] {
  const rings =
    (prop(comp, "rings") as Array<{
      value: number;
      max: number;
      label: string;
      color: string;
    }>) || [];
  const lines: string[] = [];

  for (const ring of rings) {
    const pct = ring.max > 0 ? Math.round((ring.value / ring.max) * 100) : 0;
    lines.push(
      indent(
        ctx,
        renderProgressBar(
          ring.value,
          ring.max,
          `${ring.label} (${pct}%)`,
          ctx.width - ctx.indent * 2
        )
      )
    );
  }

  return lines;
}

function renderLogViewer(comp: A2UIComponent, ctx: RenderContext): string[] {
  const entries =
    (prop(comp, "entries") as Array<{
      time: string;
      level: string;
      subsystem: string;
      message: string;
    }>) || [];
  const lines: string[] = [];

  // Header
  lines.push(
    indent(
      ctx,
      ansi.bold(padRight("Time", 12) + padRight("Level", 8) + padRight("Subsystem", 22) + "Message")
    )
  );
  lines.push(indent(ctx, ansi.dim("─".repeat(Math.min(80, ctx.width - ctx.indent * 2)))));

  // Show last 50 entries
  const recent = entries.slice(-50);
  for (const e of recent) {
    const timeStr = ansi.dim(e.time.split("T")[1]?.split(".")[0] || e.time.slice(11, 19));

    let levelStr: string;
    switch (e.level) {
      case "error":
      case "fatal":
        levelStr = ansi.red(padRight(e.level.toUpperCase(), 8));
        break;
      case "warn":
        levelStr = ansi.yellow(padRight("WARN", 8));
        break;
      case "info":
        levelStr = ansi.cyan(padRight("INFO", 8));
        break;
      default:
        levelStr = ansi.gray(padRight(e.level.toUpperCase(), 8));
    }

    const subsysStr = ansi.magenta(padRight(e.subsystem, 22));
    const msgStr = e.message;

    lines.push(indent(ctx, `${padRight(timeStr, 12)}${levelStr}${subsysStr}${msgStr}`));
  }

  if (entries.length === 0) {
    lines.push(indent(ctx, ansi.dim("  No log entries")));
  }

  return lines;
}

function renderModal(comp: A2UIComponent, ctx: RenderContext): string[] {
  const title = String(prop(comp, "title") || "");
  const lines: string[] = [];
  const boxWidth = Math.min(60, ctx.width - 4);

  lines.push(indent(ctx, "╔" + "═".repeat(boxWidth) + "╗"));
  lines.push(indent(ctx, "║ " + ansi.bold(padRight(title, boxWidth - 2)) + "║"));
  lines.push(indent(ctx, "╠" + "═".repeat(boxWidth) + "╣"));

  const childLines = renderChildren(comp, { ...ctx, indent: ctx.indent + 1, width: boxWidth - 4 });
  for (const line of childLines) {
    lines.push(indent(ctx, "║ " + padRight(stripAnsi(line).trimStart(), boxWidth - 2) + "║"));
  }

  lines.push(indent(ctx, "╚" + "═".repeat(boxWidth) + "╝"));
  return lines;
}

// ============================================================================
// Helpers
// ============================================================================

function renderChildren(comp: A2UIComponent, ctx: RenderContext): string[] {
  const childIds = getChildren(comp);
  if (!childIds.length) return [];
  const lines: string[] = [];

  for (const childId of childIds) {
    const child = ctx.components.get(childId);
    if (child) {
      lines.push(...renderComponent(child, ctx));
    }
  }

  return lines;
}

function indent(ctx: RenderContext, text: string): string {
  return "  ".repeat(ctx.indent) + text;
}

function wrapLines(text: string, ctx: RenderContext): string[] {
  const maxLen = ctx.width - ctx.indent * 2;
  if (maxLen <= 10) return [indent(ctx, text)];

  const lines: string[] = [];
  for (const rawLine of text.split("\n")) {
    if (stripAnsi(rawLine).length <= maxLen) {
      lines.push(indent(ctx, rawLine));
    } else {
      // Simple word wrap
      const words = rawLine.split(" ");
      let current = "";
      for (const word of words) {
        if (stripAnsi(current + " " + word).length > maxLen && current) {
          lines.push(indent(ctx, current));
          current = word;
        } else {
          current = current ? current + " " + word : word;
        }
      }
      if (current) lines.push(indent(ctx, current));
    }
  }
  return lines;
}

function padRight(s: string, width: number): string {
  const visLen = stripAnsi(s).length;
  if (visLen >= width) return s.substring(0, width);
  return s + " ".repeat(width - visLen);
}

function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

function renderProgressBar(
  value: number,
  max: number,
  label: string | undefined,
  width: number
): string {
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  const barWidth = Math.max(10, Math.min(30, width - 20));
  const filled = Math.round(pct * barWidth);
  const bar = "█".repeat(filled) + "░".repeat(barWidth - filled);
  const pctStr = `${Math.round(pct * 100)}%`;
  const labelStr = label ? ` ${label}` : "";
  return `${ansi.cyan(bar)} ${pctStr}${labelStr}`;
}

function applyColor(text: string, color: string): string {
  switch (color) {
    case "green":
    case "success":
      return ansi.green(text);
    case "red":
    case "error":
    case "danger":
      return ansi.red(text);
    case "yellow":
    case "warning":
      return ansi.yellow(text);
    case "blue":
    case "info":
    case "primary":
      return ansi.blue(text);
    case "cyan":
      return ansi.cyan(text);
    case "magenta":
      return ansi.magenta(text);
    case "gray":
    case "secondary":
    case "muted":
      return ansi.dim(text);
    default:
      return text;
  }
}

/**
 * Render a navigation bar showing current view.
 */
export function renderNavBar(currentView: string, views: string[]): string {
  const parts = views.map((v) => {
    if (v === currentView) return ansi.bold(ansi.cyan(v));
    return ansi.dim(v);
  });
  return parts.join(ansi.dim(" │ "));
}

/**
 * Render the action bar (numbered actions at the bottom).
 */
export function renderActionBar(actions: TUIAction[]): string {
  if (actions.length === 0) return "";
  const parts = actions.map((a) => `${ansi.cyan(`[${a.number}]`)} ${a.label}`);
  return parts.join("  ");
}
