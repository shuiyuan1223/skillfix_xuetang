import React from "react";
import type { A2UIComponent, A2UISurfaceData, MessagePart } from "../../lib/types";
import { ICONS, getIcon } from "../../lib/icons";
import { Markdown } from "../../lib/markdown";
import { i18n } from "../../lib/i18n";
import {
  ResponsiveContainer, ComposedChart, BarChart, Bar, LineChart, Line,
  AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import {
  renderCodeEditor, renderCommitList, renderDiffView, renderDataTable,
  renderScoreGauge, renderActivityRings, renderStatusBadge,
  renderCollapsible, renderModalComponent, renderForm, renderFormInput,
  renderGitTimeline, renderStepIndicator, renderFileTree,
  renderArenaPills, renderArenaScoreTable, renderArenaCategoryCard,
  renderRadarChart, renderArenaRunPicker, renderArenaModeToggle,
  renderPlaygroundFab, renderEvolutionPipeline, renderLogViewer,
} from "./AdvancedRenderers";

export interface RenderContext {
  sendAction: (action: string, payload?: Record<string, unknown>) => void;
  sendNavigate: (view: string) => void;
  renderChildren: (ids?: string[]) => React.ReactNode[];
  renderComponent: (id: string) => React.ReactNode;
  renderInline: (data: { components: A2UIComponent[]; root_id: string }) => React.ReactNode;
  chatAutoScrollRef: React.MutableRefObject<boolean>;
  isAutoScrollingRef: React.MutableRefObject<boolean>;
}

interface A2UIRendererProps {
  data: A2UISurfaceData;
  sendAction: (action: string, payload?: Record<string, unknown>) => void;
  sendNavigate: (view: string) => void;
  chatAutoScrollRef: React.MutableRefObject<boolean>;
  isAutoScrollingRef: React.MutableRefObject<boolean>;
}

const TOOL_DISPLAY_NAMES: Record<string, string> = {
  get_health_data: "健康数据",
  get_heart_rate: "心率数据",
  get_sleep: "睡眠数据",
  get_weekly_summary: "周报汇总",
  get_workouts: "运动数据",
  get_hrv: "心率变异性",
  get_health_trends: "健康趋势",
  update_user_profile: "更新健康档案",
  complete_onboarding: "完成引导",
  present_insight: "健康洞察",
  create_health_plan: "创建健康计划",
  list_health_plans: "健康计划列表",
  get_health_plan: "计划详情",
  update_plan_progress: "更新进度",
  adjust_health_plan: "调整计划",
  update_plan_status: "更新计划状态",
  create_recommendation: "健康推荐",
  list_recommendations: "推荐列表",
  dismiss_recommendation: "关闭推荐",
  create_reminder: "创建提醒",
  list_reminders: "提醒列表",
  complete_reminder: "完成提醒",
  delete_reminder: "删除提醒",
  create_calendar_event: "创建日历事件",
  list_calendar_events: "日历事件列表",
  update_calendar_event: "更新日历事件",
  delete_calendar_event: "删除日历事件",
};

export function A2UIRenderer({
  data, sendAction, sendNavigate, chatAutoScrollRef, isAutoScrollingRef,
}: A2UIRendererProps) {
  let components = new Map<string, A2UIComponent>();
  for (const c of data.components) {
    components.set(c.id, c);
  }

  function renderComponent(id: string): React.ReactNode {
    const c = components.get(id);
    if (!c) return null;
    switch (c.type) {
      case "column": return rcColumn(c);
      case "row": return rcRow(c);
      case "grid": return rcGrid(c);
      case "text": return rcText(c);
      case "card": return rcCard(c);
      case "stat_card": return rcStatCard(c);
      case "metric": return rcMetric(c);
      case "chart": return rcChart(c);
      case "table": return rcTable(c);
      case "button": return rcButton(c);
      case "nav": return rcNav(c);
      case "tabs": return rcTabs(c);
      case "progress": return rcProgress(c);
      case "badge": return rcBadge(c);
      case "skeleton": return rcSkeleton(c);
      case "divider": return <div className="sidebar-divider" />;
      case "spacer": return <div style={{ height: (c.height as number) || 16 }} />;
      case "chat_messages": return rcChatMessages(c);
      case "chat_input": return rcChatInput(c);
      case "code_editor": return renderCodeEditor(c, ctx);
      case "commit_list": return renderCommitList(c, ctx);
      case "diff_view": return renderDiffView(c, ctx);
      case "data_table": return renderDataTable(c, ctx);
      case "score_gauge": return renderScoreGauge(c, ctx);
      case "activity_rings": return renderActivityRings(c, ctx);
      case "status_badge": return renderStatusBadge(c, ctx);
      case "collapsible": return renderCollapsible(c, ctx);
      case "modal": return renderModalComponent(c, ctx);
      case "form": return renderForm(c, ctx);
      case "form_input": return renderFormInput(c, ctx);
      case "git_timeline": return renderGitTimeline(c, ctx);
      case "step_indicator": return renderStepIndicator(c, ctx);
      case "file_tree": return renderFileTree(c, ctx);
      case "arena_pills": return renderArenaPills(c, ctx);
      case "arena_score_table": return renderArenaScoreTable(c, ctx);
      case "arena_category_card": return renderArenaCategoryCard(c, ctx);
      case "radar_chart": return renderRadarChart(c, ctx);
      case "arena_run_picker": return renderArenaRunPicker(c, ctx);
      case "arena_mode_toggle": return renderArenaModeToggle(c, ctx);
      case "playground_fab": return renderPlaygroundFab(c, ctx);
      case "evolution_pipeline": return renderEvolutionPipeline(c, ctx);
      case "log_viewer": return renderLogViewer(c, ctx);
      default:
        return <div className="text-text-muted text-xs p-2">[Unknown: {c.type}]</div>;
    }
  }

  function renderChildren(ids?: string[]): React.ReactNode[] {
    if (!ids) return [];
    return ids.map((id) => <React.Fragment key={id}>{renderComponent(id)}</React.Fragment>);
  }

  function renderInline(inlineData: { components: A2UIComponent[]; root_id: string }): React.ReactNode {
    const saved = components;
    components = new Map(saved);
    for (const c of inlineData.components) {
      components.set(c.id, c);
    }
    const result = renderComponent(inlineData.root_id);
    components = saved;
    return result;
  }

  const ctx: RenderContext = {
    sendAction, sendNavigate, renderChildren, renderComponent, renderInline,
    chatAutoScrollRef, isAutoScrollingRef,
  };

  // ---- Layout Components ----

  function rcColumn(c: A2UIComponent) {
    const gap = (c.gap as number) || 0;
    const padding = (c.padding as number) || 0;
    const align = (c.align as string) || "stretch";
    const extraStyle = (c.style as string) || "";
    const className = (c.className as string) || "";
    const isGrid = extraStyle.includes("display: grid");
    const baseClass = isGrid ? className : `flex flex-col ${className}`;
    return (
      <div className={baseClass} style={parseStyle(`gap: ${gap}px; padding: ${padding}px; align-items: ${align}; ${extraStyle}`)}>
        {renderChildren(c.children)}
      </div>
    );
  }

  function rcRow(c: A2UIComponent) {
    const gap = (c.gap as number) || 0;
    const rawJustify = (c.justify as string) || "start";
    const align = (c.align as string) || "center";
    const className = (c.className as string) || "";
    const extraStyle = (c.style as string) || "";
    // Map shorthand values to valid CSS
    const justifyMap: Record<string, string> = {
      start: "flex-start", center: "center", end: "flex-end",
      between: "space-between", around: "space-around",
    };
    const justify = justifyMap[rawJustify] || rawJustify;
    return (
      <div className={`flex flex-row ${className}`} style={parseStyle(`gap: ${gap}px; justify-content: ${justify}; align-items: ${align}; ${extraStyle}`)}>
        {renderChildren(c.children)}
      </div>
    );
  }

  function rcGrid(c: A2UIComponent) {
    const columns = (c.columns as number) || 2;
    const gap = (c.gap as number) || 16;
    return (
      <div className="grid stagger-children" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)`, gap }}>
        {(c.children || []).map((id, index) => (
          <div key={id} style={{ "--stagger-index": index } as React.CSSProperties}>{renderComponent(id)}</div>
        ))}
      </div>
    );
  }

  // ---- Content Components ----

  function rcText(c: A2UIComponent) {
    const variant = (c.variant as string) || "body";
    const color = (c.color as string) || "inherit";
    const weight = (c.weight as string) || "normal";
    const text = c.text as string;
    const textVariants: Record<string, string> = {
      h1: "text-[2rem] font-bold",
      h2: "text-2xl font-semibold",
      h3: "text-lg font-semibold",
      body: "text-sm",
      caption: "text-xs text-text-secondary",
      label: "text-xs font-medium uppercase tracking-widest text-text-muted",
    };
    const variantClass = textVariants[variant] || textVariants.body;
    return (
      <span className={variantClass} style={{ color, fontWeight: weight }}>
        {c.markdown ? <Markdown>{text}</Markdown> : text}
      </span>
    );
  }

  function rcCard(c: A2UIComponent) {
    const title = c.title as string;
    const padding = (c.padding as number) || 20;
    const className = (c.className as string) || "";
    return (
      <div
        className={`card-hover bg-surface-card border border-border rounded-xl ${className}`}
        style={{
          padding,
          boxShadow: "var(--shadow-sm), inset 0 1px 0 var(--color-card-highlight)",
          animation: "rise 0.3s cubic-bezier(0.16, 1, 0.3, 1) backwards",
        }}
      >
        {title && <div className="text-[15px] font-semibold mb-4 text-text-strong tracking-tight">{title}</div>}
        {renderChildren(c.children)}
      </div>
    );
  }

  function rcStatCard(c: A2UIComponent) {
    const title = c.title as string;
    const value = c.value as string | number;
    const subtitle = c.subtitle as string;
    const icon = c.icon as string;
    const trend = c.trend as { direction: string; value: string } | undefined;
    const color = (c.color as string) || "rgb(var(--color-text))";
    const trendColors: Record<string, string> = {
      up: "text-emerald-500", down: "text-red-500", stable: "text-text-muted",
    };
    return (
      <div
        className="card-hover bg-surface-card border border-border rounded-xl p-5 relative overflow-hidden group"
        style={{
          boxShadow: "var(--shadow-sm), inset 0 1px 0 var(--color-card-highlight)",
          animation: "rise 0.3s cubic-bezier(0.16, 1, 0.3, 1) backwards",
        }}
      >
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        <div className="flex items-center gap-2 mb-3">
          {icon && <span className="w-5 h-5 text-text-secondary [&>svg]:w-5 [&>svg]:h-5" dangerouslySetInnerHTML={{ __html: getIcon(icon) }} />}
          <span className="text-[13px] text-text-secondary font-medium">{title}</span>
        </div>
        <div className="text-3xl font-bold" style={{ color, letterSpacing: "-0.03em" }}>{value}</div>
        {subtitle && <div className="text-xs text-text-muted mt-1.5">{subtitle}</div>}
        {trend && (
          <div className={`text-xs mt-2 font-medium ${trendColors[trend.direction] || "text-text-muted"}`}>
            {trend.direction === "up" ? "↑" : trend.direction === "down" ? "↓" : "→"} {trend.value}
          </div>
        )}
      </div>
    );
  }

  function rcMetric(c: A2UIComponent) {
    const label = c.label as string;
    const value = c.value as string | number;
    const unit = c.unit as string;
    const icon = c.icon as string;
    return (
      <div className="flex items-baseline gap-1">
        {icon && <span className="text-base">{icon}</span>}
        <span className="text-2xl font-semibold">{value}</span>
        {unit && <span className="text-sm text-text-muted">{unit}</span>}
        <span className="text-xs text-text-muted ml-2">{label}</span>
      </div>
    );
  }

  function rcChart(c: A2UIComponent) {
    const chartType = c.chartType as string;
    const data = c.data as Record<string, unknown>[];
    const height = (c.height as number) || 200;
    const xKey = c.xKey as string;
    const yKey = c.yKey as string;
    const color = (c.color as string) || "#667eea";

    if (!data || data.length === 0) {
      return <div className="flex items-center justify-center text-text-muted" style={{ height }}>No data</div>;
    }

    const axisStyle = { fontSize: 11, fill: "currentColor", fillOpacity: 0.45 };
    const gridStroke = "currentColor";
    const gridOpacity = 0.08;
    const tooltipStyle = {
      contentStyle: { background: "var(--color-surface-elevated)", border: "1px solid rgb(var(--color-border))", borderRadius: 8, fontSize: 12 },
      labelStyle: { color: "rgb(var(--color-text-secondary))" },
      itemStyle: { color: "rgb(var(--color-text))" },
    };
    const gradientId = `chart-grad-${c.id}`;
    const dense = data.length > 15;
    const dotStyle = dense ? false : { r: 3, fill: color };

    if (chartType === "bar") {
      return (
        <ResponsiveContainer width="100%" height={height}>
          <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.12} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} strokeOpacity={gridOpacity} vertical={false} />
            <XAxis dataKey={xKey} tick={axisStyle} tickLine={false} axisLine={false} />
            <YAxis tick={axisStyle} tickLine={false} axisLine={false} />
            <Tooltip {...tooltipStyle} cursor={{ fill: "currentColor", fillOpacity: 0.04 }} />
            <Bar dataKey={yKey} fill={color} fillOpacity={0.6} radius={[3, 3, 0, 0]} />
            <Area type="monotone" dataKey={yKey} fill={`url(#${gradientId})`} stroke="none" />
            <Line type="monotone" dataKey={yKey} stroke={color} strokeWidth={2} dot={dotStyle} strokeOpacity={0.8} />
          </ComposedChart>
        </ResponsiveContainer>
      );
    }

    if (chartType === "area") {
      return (
        <ResponsiveContainer width="100%" height={height}>
          <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.25} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} strokeOpacity={gridOpacity} vertical={false} />
            <XAxis dataKey={xKey} tick={axisStyle} tickLine={false} axisLine={false} />
            <YAxis tick={axisStyle} tickLine={false} axisLine={false} domain={['dataMin - 5', 'dataMax + 5']} />
            <Tooltip {...tooltipStyle} />
            <Area type="monotone" dataKey={yKey} stroke={color} strokeWidth={2} fill={`url(#${gradientId})`} dot={dotStyle} />
          </AreaChart>
        </ResponsiveContainer>
      );
    }

    if (chartType === "pie" || chartType === "donut") {
      const COLORS = [color, "#14b8a6", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16", "#f97316"];
      const innerRadius = chartType === "donut" ? "55%" : 0;
      return (
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <Tooltip {...tooltipStyle} />
            <Pie data={data} dataKey={yKey} nameKey={xKey} cx="50%" cy="50%" innerRadius={innerRadius} outerRadius="80%" paddingAngle={2} strokeWidth={0}>
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} fillOpacity={0.85} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      );
    }

    // Default: line chart (also fallback for unknown types)
    return (
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.15} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} strokeOpacity={gridOpacity} vertical={false} />
          <XAxis dataKey={xKey} tick={axisStyle} tickLine={false} axisLine={false} />
          <YAxis tick={axisStyle} tickLine={false} axisLine={false} domain={['dataMin - 5', 'dataMax + 5']} />
          <Tooltip {...tooltipStyle} />
          <Area type="monotone" dataKey={yKey} stroke={color} strokeWidth={dense ? 1.5 : 2.5} fill={`url(#${gradientId})`} dot={dotStyle} />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  function rcTable(c: A2UIComponent) {
    const columns = c.columns as { key: string; label: string }[];
    const rows = c.rows as Record<string, unknown>[];
    return (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key} className="p-3 text-left text-xs font-medium uppercase text-text-muted border-b border-border">{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {columns.map((col) => (
                  <td key={col.key} className="p-3 text-left border-b border-border text-sm">{String(row[col.key] ?? "")}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // ---- Interactive Components ----

  function rcButton(c: A2UIComponent) {
    const label = c.label as string;
    const action = c.action as string;
    const variant = (c.variant as string) || "primary";
    const disabled = c.disabled as boolean;
    const payload = c.payload as Record<string, unknown>;
    const icon = c.icon as string | undefined;
    const tooltip = c.tooltip as string | undefined;
    const isIconOnly = icon && !label;

    const btnVariants: Record<string, string> = {
      primary: "bg-primary text-primary-fg hover:-translate-y-px",
      secondary: "bg-surface text-text border border-border hover:bg-surface-hover hover:border-border-hover",
      outline: "bg-transparent border border-border text-text hover:border-border-hover hover:bg-surface-hover",
      ghost: "bg-transparent text-text-secondary hover:bg-primary/8 hover:text-text",
      danger: "bg-red-600 text-white hover:bg-red-700 hover:-translate-y-px",
      accent: "text-white hover:-translate-y-0.5 animate-[glow-pulse_3s_ease-in-out_infinite]",
    };

    const btnBase = isIconOnly
      ? "inline-flex items-center justify-center w-8 h-8 rounded-lg text-[13px] font-medium cursor-pointer border-none disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.93] transition-all duration-150 [&>svg]:w-4 [&>svg]:h-4"
      : "inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-medium cursor-pointer border-none disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.97] transition-all duration-150";

    const isAccent = variant === "accent";
    const isElevated = variant === "primary" || isAccent;
    const accentStyle: React.CSSProperties = isAccent
      ? {
          background: "linear-gradient(135deg, rgb(var(--color-primary)), rgb(var(--color-accent-2)))",
          boxShadow: "var(--shadow-md), 0 0 24px var(--color-accent-glow)",
        }
      : variant === "primary"
        ? { boxShadow: "var(--shadow-sm)" }
        : {};
    return (
      <button
        className={`${btnBase} ${btnVariants[variant] || btnVariants.primary}`}
        style={accentStyle}
        disabled={disabled}
        title={tooltip || (isIconOnly ? undefined : undefined)}
        onClick={() => sendAction(action, payload)}
        onMouseEnter={isElevated ? (e) => { (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-md), 0 0 30px var(--color-accent-glow)"; } : undefined}
        onMouseLeave={isElevated ? (e) => { (e.currentTarget as HTMLElement).style.boxShadow = isAccent ? "var(--shadow-md), 0 0 24px var(--color-accent-glow)" : "var(--shadow-sm)"; } : undefined}
      >
        {icon && (isIconOnly
          ? <span dangerouslySetInnerHTML={{ __html: getIcon(icon) }} />
          : <span className="inline-flex w-4 h-4 [&>svg]:w-4 [&>svg]:h-4" dangerouslySetInnerHTML={{ __html: getIcon(icon) }} />
        )}
        {label}
      </button>
    );
  }

  function rcNav(c: A2UIComponent) {
    const items = c.items as { id: string; label: string; icon?: string }[];
    const activeId = c.activeId as string;
    const orientation = (c.orientation as string) || "vertical";
    const navDir = orientation === "horizontal" ? "flex-row" : "flex-col";
    return (
      <nav className={`flex gap-1 items-center ${navDir}`}>
        {items.map((item) => {
          const isActive = item.id === activeId;
          return (
            <button
              key={item.id}
              title={item.label}
              className={`sidebar-nav-btn ${isActive ? "active" : ""}`}
              onClick={() => sendNavigate(item.id)}
            >
              {item.icon && (
                <span
                  className="sidebar-nav-icon"
                  dangerouslySetInnerHTML={{ __html: getIcon(item.icon) }}
                />
              )}
            </button>
          );
        })}
      </nav>
    );
  }

  function rcTabs(c: A2UIComponent) {
    const tabs = c.tabs as { id: string; label: string }[];
    const activeTab = c.activeTab as string;
    const contentIds = c.contentIds as Record<string, string>;
    return (
      <div>
        <div className="flex border-b border-border gap-0">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTab;
            return (
              <button key={tab.id} className={`py-3 px-5 bg-transparent border-none text-sm cursor-pointer relative transition-colors duration-normal ${isActive ? "text-text" : "text-text-muted hover:text-text-secondary"}`} onClick={() => sendAction("tab_change", { tab: tab.id })}>
                {tab.label}
                <div className={`absolute bottom-[-1px] left-0 right-0 h-0.5 bg-gradient-to-r from-primary to-accent transition-all duration-normal origin-center ${isActive ? "opacity-100 scale-x-100" : "opacity-0 scale-x-0"}`} />
              </button>
            );
          })}
        </div>
        <div className="pt-4">
          {contentIds[activeTab] ? renderComponent(contentIds[activeTab]) : null}
        </div>
      </div>
    );
  }

  function rcProgress(c: A2UIComponent) {
    const value = (c.value as number) || 0;
    const maxValue = (c.maxValue as number) || 100;
    const label = c.label as string;
    const color = (c.color as string) || "#667eea";
    const pct = Math.min(100, (value / maxValue) * 100);
    return (
      <div>
        {label && <div className="text-xs text-text-secondary mb-1.5">{label}</div>}
        <div className="h-2 bg-surface rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-[width] duration-slow" style={{ width: `${pct}%`, background: color }} />
        </div>
      </div>
    );
  }

  function rcBadge(c: A2UIComponent) {
    const text = c.text as string;
    const variant = (c.variant as string) || "default";
    const badgeVariants: Record<string, string> = {
      default: "bg-slate-500/20 text-slate-300",
      success: "bg-emerald-500/20 text-emerald-400",
      warning: "bg-amber-500/20 text-amber-400",
      error: "bg-red-500/20 text-red-400",
      info: "bg-blue-500/20 text-blue-400",
    };
    return <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${badgeVariants[variant] || badgeVariants.default}`}>{text}</span>;
  }

  function rcSkeleton(c: A2UIComponent) {
    const variant = (c.variant as string) || "rectangular";
    const width = c.width || "100%";
    const height = c.height || (variant === "text" ? "1em" : "100px");
    const radiusClass = variant === "circular" ? "rounded-full" : variant === "text" ? "rounded" : "rounded-xl";
    return (
      <div
        className={`bg-gradient-to-r from-white/5 via-white/10 to-white/5 bg-[length:200%_100%] motion-safe:animate-skeleton-shimmer ${radiusClass}`}
        style={{ width: typeof width === "number" ? width + "px" : width, height: typeof height === "number" ? height + "px" : height }}
      />
    );
  }

  // ---- Chat Components ----

  function rcChatMessages(c: A2UIComponent) {
    const rawMessages = (c.messages as any[]) || [];
    const streaming = c.streaming as boolean;
    const streamingContent = c.streamingContent as string;
    const welcomeTitle = c.welcomeTitle as string | undefined;
    const welcomeSubtitle = c.welcomeSubtitle as string | undefined;
    const welcomeIcon = (c.welcomeIcon as string) || "bot";
    const welcomeActions = c.welcomeActions as Array<{ label: string; icon?: string; action: string; content: string }> | undefined;

    // Server-driven welcome screen
    if (rawMessages.length === 0 && !streaming && welcomeTitle) {
      const sugBtn = "flex items-center gap-2 px-4 py-2.5 rounded-xl bg-surface-card border border-border text-text-secondary text-[13px] font-medium cursor-pointer transition-all duration-150 hover:border-border-hover hover:bg-surface-hover hover:text-text hover:-translate-y-px";
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-8 gap-5 text-center" style={{ animation: "rise 0.4s cubic-bezier(0.16, 1, 0.3, 1) backwards" }}>
          <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center text-primary [&>svg]:w-6 [&>svg]:h-6" dangerouslySetInnerHTML={{ __html: ICONS[welcomeIcon] || ICONS["bot"] }} />
          <div className="text-xl font-bold text-text-strong tracking-tight">{welcomeTitle}</div>
          {welcomeSubtitle && <div className="text-[13px] text-text-muted max-w-[380px] leading-relaxed">{welcomeSubtitle}</div>}
          {welcomeActions && welcomeActions.length > 0 && (
            <div className="flex flex-wrap gap-2.5 mt-3 justify-center">
              {welcomeActions.map((a, i) => (
                <button key={i} className={sugBtn} style={{ boxShadow: "var(--shadow-sm)", animationDelay: `${i * 60}ms`, animation: "rise 0.3s cubic-bezier(0.16, 1, 0.3, 1) backwards" }} onClick={() => { const actionName = (c.action as string) || a.action || "send_message"; sendAction(actionName, { content: a.content, value: a.content }); }}>
                  {a.icon && <span className="w-4 h-4 [&>svg]:w-4 [&>svg]:h-4" dangerouslySetInnerHTML={{ __html: ICONS[a.icon] || "" }} />}
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </div>
      );
    }

    const noWelcome = c.noWelcome as boolean;
    if (rawMessages.length === 0 && !streaming && noWelcome) {
      return (
        <div className="flex-1 flex items-center justify-center p-4 text-text-muted text-[13px] opacity-50">
          {i18n.evolution?.playgroundChatPlaceholder || "Waiting for messages..."}
        </div>
      );
    }

    // Default welcome
    if (rawMessages.length === 0 && !streaming) {
      const sugBtn = "flex items-center gap-2 px-4 py-2.5 rounded-xl bg-surface-card border border-border text-text-secondary text-[13px] font-medium cursor-pointer transition-all duration-150 hover:border-border-hover hover:bg-surface-hover hover:text-text hover:-translate-y-px";
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-8 gap-5 text-center" style={{ animation: "rise 0.4s cubic-bezier(0.16, 1, 0.3, 1) backwards" }}>
          <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center text-primary [&>svg]:w-6 [&>svg]:h-6" dangerouslySetInnerHTML={{ __html: ICONS["chat"] }} />
          <div className="text-xl font-bold text-text-strong tracking-tight">{i18n.chat.title}</div>
          <div className="text-[13px] text-text-muted max-w-[380px] leading-relaxed">{i18n.chat.subtitle}</div>
          <div className="flex flex-wrap gap-2.5 mt-3 justify-center">
            <button className={sugBtn} style={{ boxShadow: "var(--shadow-sm)", animation: "rise 0.3s cubic-bezier(0.16, 1, 0.3, 1) backwards" }} onClick={() => sendAction("send_message", { content: i18n.chat.sleepQuestion })}>
              <span className="w-4 h-4 [&>svg]:w-4 [&>svg]:h-4" dangerouslySetInnerHTML={{ __html: ICONS["moon"] }} />{i18n.chat.sleepAnalysis}
            </button>
            <button className={sugBtn} style={{ boxShadow: "var(--shadow-sm)", animation: "rise 0.3s cubic-bezier(0.16, 1, 0.3, 1) 60ms backwards" }} onClick={() => sendAction("send_message", { content: i18n.chat.activityQuestion })}>
              <span className="w-4 h-4 [&>svg]:w-4 [&>svg]:h-4" dangerouslySetInnerHTML={{ __html: ICONS["activity"] }} />{i18n.chat.activitySummary}
            </button>
            <button className={sugBtn} style={{ boxShadow: "var(--shadow-sm)", animation: "rise 0.3s cubic-bezier(0.16, 1, 0.3, 1) 120ms backwards" }} onClick={() => sendAction("send_message", { content: i18n.chat.heartRateQuestion })}>
              <span className="w-4 h-4 [&>svg]:w-4 [&>svg]:h-4" dangerouslySetInnerHTML={{ __html: ICONS["heart"] }} />{i18n.chat.heartRate}
            </button>
          </div>
        </div>
      );
    }

    const avatarBase = "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-white [&>svg]:w-4 [&>svg]:h-4";
    const msgBubble = "max-w-[70%] px-5 py-3.5 rounded-2xl leading-relaxed text-[13.5px]";

    // Normalize messages to Parts format
    interface NormalizedMsg {
      id: string;
      role: "user" | "assistant";
      parts: MessagePart[];
    }
    const messages: NormalizedMsg[] = [];
    for (const raw of rawMessages) {
      if (raw.parts && raw.parts.length > 0) {
        // New format with parts
        messages.push({ id: raw.id || String(messages.length), role: raw.role === "tool" ? "assistant" : raw.role, parts: raw.parts });
      } else if (raw.role === "tool") {
        // Legacy: merge tool message into previous assistant or create standalone
        // (old format: independent tool messages)
        const prev = messages[messages.length - 1];
        if (prev && prev.role === "assistant") {
          prev.parts.push({ type: "tool_use", toolCallId: String(messages.length), toolName: raw.toolName || "", status: raw.toolStatus || "completed" });
          if (raw.cards) {
            prev.parts.push({ type: "tool_result", toolCallId: String(messages.length), cards: raw.cards });
          }
        } else {
          messages.push({
            id: raw.id || String(messages.length),
            role: "assistant",
            parts: [
              { type: "tool_use", toolCallId: String(messages.length), toolName: raw.toolName || "", status: raw.toolStatus || "completed" },
              ...(raw.cards ? [{ type: "tool_result" as const, toolCallId: String(messages.length), cards: raw.cards }] : []),
            ],
          });
        }
      } else {
        // Legacy text-only or user message
        const parts: MessagePart[] = [{ type: "text", content: raw.content || "" }];
        if (raw.cards) {
          parts.push({ type: "tool_result", toolCallId: "legacy", cards: raw.cards });
        }
        messages.push({ id: raw.id || String(messages.length), role: raw.role === "user" ? "user" : "assistant", parts });
      }
    }

    // Render a single part
    function renderPart(part: MessagePart, partIdx: number) {
      if (part.type === "text") {
        if (!part.content?.trim()) return null;
        return (
          <div key={partIdx} className={`${msgBubble} bg-surface-card border border-border`} style={{ boxShadow: "var(--shadow-sm)" }}>
            <Markdown>{part.content}</Markdown>
          </div>
        );
      }
      if (part.type === "tool_use") {
        const status = part.status || "completed";
        const dotClass = status === "running" ? "bg-primary motion-safe:animate-pulse" : status === "error" ? "bg-error" : "bg-success";
        const statusIcon = status === "running"
          ? <span className="tool-spinner" />
          : status === "error"
            ? <span className="text-error [&>svg]:w-3 [&>svg]:h-3" dangerouslySetInnerHTML={{ __html: ICONS["x"] }} />
            : <span className="text-success [&>svg]:w-3 [&>svg]:h-3" dangerouslySetInnerHTML={{ __html: ICONS["check"] }} />;
        const displayName = part.displayName || TOOL_DISPLAY_NAMES[part.toolName] || part.toolName;
        const progress = part.progressData;
        const pct = progress && progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
        return (
          <div key={partIdx} className="flex items-center gap-2 text-xs text-text-muted py-1 max-w-[70%]">
            <div className={`w-2 h-2 rounded-full ${dotClass} shrink-0`} />
            <span className="truncate">{displayName}</span>
            {progress && progress.total > 0 && (
              <div className="flex items-center gap-1.5 shrink-0 min-w-[100px]">
                <div className="h-1.5 bg-surface rounded-full overflow-hidden flex-1">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${status === "running" ? "bg-primary animate-status-pulse" : status === "error" ? "bg-error" : "bg-success"}`}
                    style={{ width: `${Math.max(pct, 3)}%` }}
                  />
                </div>
                <span className="tabular-nums text-[10px] w-[3ch] text-right">{pct}%</span>
              </div>
            )}
            {statusIcon}
          </div>
        );
      }
      if (part.type === "tool_result" && part.cards) {
        return (
          <div key={partIdx} className="max-w-[70%]">
            {renderInline(part.cards as { components: A2UIComponent[]; root_id: string })}
          </div>
        );
      }
      return null;
    }

    return (
      <div
        className="chat-scroll-container flex-1 min-h-0 overflow-y-auto p-6 flex flex-col gap-6"
        onScroll={(e) => {
          if (isAutoScrollingRef.current) return;
          const el = e.currentTarget;
          chatAutoScrollRef.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 80;
        }}
      >
        {messages.map((msg, mi) => {
          const isUser = msg.role === "user";

          if (isUser) {
            const textContent = msg.parts.filter((p) => p.type === "text").map((p) => (p as { type: "text"; content: string }).content).join("");
            return (
              <div key={mi} className="flex gap-4 flex-row-reverse motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-4 motion-safe:duration-normal">
                <div className={`${avatarBase} bg-bg-tertiary text-text-secondary`} dangerouslySetInnerHTML={{ __html: ICONS["user"] }} />
                <div className={`${msgBubble} bg-primary/10 text-text border border-primary/20`}>
                  {textContent}
                </div>
              </div>
            );
          }

          // Assistant message — render parts inline
          {
            const hasVisibleParts = msg.parts.some((p) =>
              (p.type === "text" && p.content?.trim()) || p.type === "tool_use" || p.type === "tool_result"
            );
            const isActiveMsg = streaming && mi === messages.length - 1;

            // Skip empty assistant messages that aren't actively streaming
            if (!isActiveMsg && !hasVisibleParts) return null;

            return (
              <div key={mi} className="flex gap-4 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-left-4 motion-safe:duration-normal">
                <div className={`${avatarBase} bg-primary self-start`} dangerouslySetInnerHTML={{ __html: ICONS["bot"] }} />
                <div className="flex flex-col gap-2 min-w-0 flex-1">
                  {msg.parts.map((part, pi) => {
                    // Add stream-border-pulse to actively streaming text part
                    if (
                      isActiveMsg && part.type === "text" && part.content?.trim() &&
                      pi === msg.parts.length - 1
                    ) {
                      return (
                        <div key={pi} className={`${msgBubble} bg-surface-card border border-border`} style={{ boxShadow: "var(--shadow-sm)", animation: "stream-border-pulse 2s ease-in-out infinite" }}>
                          <Markdown>{part.content}</Markdown>
                        </div>
                      );
                    }
                    return renderPart(part, pi);
                  })}
                  {/* Typing indicator when assistant message has no visible parts yet */}
                  {isActiveMsg && !hasVisibleParts && (
                    <div className="inline-flex gap-1.5 items-center px-4 py-3 rounded-2xl bg-surface-card border border-border self-start" style={{ boxShadow: "var(--shadow-sm)" }}>
                      <div className="w-2 h-2 rounded-full bg-primary/60 motion-safe:animate-bounce-dot" style={{ animationDelay: "0s" }} />
                      <div className="w-2 h-2 rounded-full bg-primary/60 motion-safe:animate-bounce-dot" style={{ animationDelay: "0.2s" }} />
                      <div className="w-2 h-2 rounded-full bg-primary/60 motion-safe:animate-bounce-dot" style={{ animationDelay: "0.4s" }} />
                    </div>
                  )}
                </div>
              </div>
            );
          }
        })}

        {!streaming && (c.quickReplies as Array<{ label: string; content: string; icon?: string; variant?: string }>)?.length ? (
          <div className="flex gap-2 pl-13 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-normal">
            {(c.quickReplies as Array<{ label: string; content: string; icon?: string; variant?: string }>).map((qr, i) => (
              <button
                key={i}
                className={`quick-reply-btn flex items-center gap-1.5 px-4 py-2 rounded-2xl text-sm font-medium cursor-pointer transition-all duration-fast border ${
                  qr.variant === "danger" ? "border-error/30 text-error bg-error/10 hover:bg-error/20 hover:border-error/50"
                    : qr.variant === "primary" ? "border-primary/30 text-primary bg-primary/10 hover:bg-primary/20 hover:border-primary/50"
                    : "border-border text-text-secondary bg-surface hover:bg-surface-hover hover:border-border-hover"
                }`}
                onClick={() => { const actionName = (c.action as string) || "send_message"; sendAction(actionName, { content: qr.content, value: qr.content }); }}
              >
                {qr.icon && <span className="w-4 h-4 [&>svg]:w-4 [&>svg]:h-4" dangerouslySetInnerHTML={{ __html: ICONS[qr.icon] || "" }} />}
                {qr.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  function rcChatInput(c: A2UIComponent) {
    const streaming = c.streaming as boolean;
    const disabled = c.disabled as boolean;
    const placeholder = (c.placeholder as string) || "Ask me anything...";
    const actionName = (c.action as string) || "send_message";
    const clearAction = c.clearAction as string | undefined;
    const stopAction = actionName.startsWith("sa_") ? "sa_stop_generation" : "stop_generation";
    return (
      <div className="chat-input-bar flex shrink-0 gap-3 p-4 border-t border-border bg-surface backdrop-blur-[16px]">
        {clearAction && (
          <button
            className="w-10 h-10 rounded-xl border border-border bg-transparent text-text-secondary cursor-pointer flex items-center justify-center shrink-0 [&>svg]:w-4 [&>svg]:h-4 hover:text-text hover:bg-surface-hover hover:border-border-hover transition-all duration-150 active:scale-[0.93]"
            title={i18n.common?.newChat || "New Chat"}
            onClick={() => sendAction(clearAction)}
            dangerouslySetInnerHTML={{ __html: ICONS["refresh-cw"] }}
          />
        )}
        <input
          type="text"
          className="flex-1 py-2.5 px-4 bg-bg border border-border rounded-xl text-text text-[13.5px] transition-all duration-150 outline-none placeholder:text-text-muted focus:border-primary/50 focus:ring-2 focus:ring-primary/10"
          placeholder={placeholder}
          disabled={disabled}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              const input = e.currentTarget;
              if (input.value.trim()) {
                sendAction(actionName, { content: input.value.trim(), value: input.value.trim() });
                input.value = "";
              }
            }
          }}
        />
        <button
          className={`chat-send-btn w-10 h-10 rounded-xl border-none ${streaming ? "bg-red-500 hover:bg-red-600" : "bg-primary"} text-primary-fg cursor-pointer flex items-center justify-center shrink-0 [&>svg]:w-4 [&>svg]:h-4`}
          style={{ boxShadow: "var(--shadow-sm)" }}
          title={streaming ? "Stop generating" : "Send"}
          onMouseEnter={!streaming ? (e) => { (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-md), 0 0 16px var(--color-accent-glow)"; } : undefined}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-sm)"; }}
          onClick={(e) => {
            if (streaming) { sendAction(stopAction, {}); return; }
            const container = (e.target as HTMLElement).closest(".chat-input-bar");
            const input = container?.querySelector("input") as HTMLInputElement;
            if (input?.value.trim()) {
              sendAction(actionName, { content: input.value.trim(), value: input.value.trim() });
              input.value = "";
            }
          }}
          dangerouslySetInnerHTML={{ __html: streaming ? (ICONS["square"] || "■") : ICONS["send"] }}
        />
      </div>
    );
  }

  return <>{renderComponent(data.root_id)}</>;
}

// Helper: parse inline style string to React CSSProperties
function parseStyle(styleStr: string): React.CSSProperties {
  const style: Record<string, string> = {};
  for (const part of styleStr.split(";")) {
    const [key, ...vals] = part.split(":");
    if (key && vals.length) {
      const camelKey = key.trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      style[camelKey] = vals.join(":").trim();
    }
  }
  return style as React.CSSProperties;
}
