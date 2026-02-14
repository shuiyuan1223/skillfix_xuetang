import React from "react";
import type { A2UIComponent, A2UISurfaceData, PlotlyChart } from "../../lib/types";
import { ICONS, getIcon } from "../../lib/icons";
import { renderMarkdown } from "../../lib/markdown";
import { i18n } from "../../lib/i18n";
import {
  renderCodeEditor, renderCommitList, renderDiffView, renderDataTable,
  renderScoreGauge, renderActivityRings, renderRadarChart, renderStatusBadge,
  renderCollapsible, renderModalComponent, renderForm, renderFormInput,
  renderGitTimeline, renderStepIndicator, renderFileTree,
  renderArenaPills, renderArenaScoreTable, renderArenaCategoryCard,
  renderPlotlyRadar, renderArenaRunPicker, renderArenaModeToggle,
  renderPlaygroundFab, renderEvolutionPipeline,
} from "./AdvancedRenderers";

export interface RenderContext {
  sendAction: (action: string, payload?: Record<string, unknown>) => void;
  sendNavigate: (view: string) => void;
  renderChildren: (ids?: string[]) => React.ReactNode[];
  renderComponent: (id: string) => React.ReactNode;
  renderInline: (data: { components: A2UIComponent[]; root_id: string }) => React.ReactNode;
  pendingPlotlyCharts: React.MutableRefObject<PlotlyChart[]>;
  chatAutoScrollRef: React.MutableRefObject<boolean>;
  isAutoScrollingRef: React.MutableRefObject<boolean>;
}

interface A2UIRendererProps {
  data: A2UISurfaceData;
  sendAction: (action: string, payload?: Record<string, unknown>) => void;
  sendNavigate: (view: string) => void;
  pendingPlotlyCharts: React.MutableRefObject<PlotlyChart[]>;
  chatAutoScrollRef: React.MutableRefObject<boolean>;
  isAutoScrollingRef: React.MutableRefObject<boolean>;
}

export function A2UIRenderer({
  data, sendAction, sendNavigate, pendingPlotlyCharts, chatAutoScrollRef, isAutoScrollingRef,
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
      case "divider": return <div className="h-px bg-border my-2" />;
      case "spacer": return <div style={{ height: (c.height as number) || 16 }} />;
      case "chat_messages": return rcChatMessages(c);
      case "chat_input": return rcChatInput(c);
      case "code_editor": return renderCodeEditor(c, ctx);
      case "commit_list": return renderCommitList(c, ctx);
      case "diff_view": return renderDiffView(c, ctx);
      case "data_table": return renderDataTable(c, ctx);
      case "score_gauge": return renderScoreGauge(c, ctx);
      case "activity_rings": return renderActivityRings(c, ctx);
      case "radar_chart": return renderRadarChart(c, ctx);
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
      case "plotly_radar": return renderPlotlyRadar(c, ctx);
      case "arena_run_picker": return renderArenaRunPicker(c, ctx);
      case "arena_mode_toggle": return renderArenaModeToggle(c, ctx);
      case "playground_fab": return renderPlaygroundFab(c, ctx);
      case "evolution_pipeline": return renderEvolutionPipeline(c, ctx);
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
    pendingPlotlyCharts, chatAutoScrollRef, isAutoScrollingRef,
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
    const justify = (c.justify as string) || "start";
    const align = (c.align as string) || "center";
    const className = (c.className as string) || "";
    const extraStyle = (c.style as string) || "";
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
        {c.markdown ? <span dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }} /> : text}
      </span>
    );
  }

  function rcCard(c: A2UIComponent) {
    const title = c.title as string;
    const padding = (c.padding as number) || 20;
    const className = (c.className as string) || "";
    return (
      <div
        className={`bg-surface border border-border rounded-[20px] backdrop-blur-[16px] shadow-[0_8px_32px_rgba(0,0,0,0.1)] transition-all duration-normal hover:border-primary/25 hover:shadow-[0_12px_40px_rgba(0,0,0,0.4)] ${className}`}
        style={{ padding }}
      >
        {title && <div className="text-base font-semibold mb-4 text-text">{title}</div>}
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
    const color = (c.color as string) || "#667eea";
    const trendColors: Record<string, string> = {
      up: "text-emerald-500", down: "text-red-500", stable: "text-text-muted",
    };
    return (
      <div className="bg-surface border border-border rounded-[20px] p-6 backdrop-blur-[16px] shadow-[0_8px_32px_rgba(0,0,0,0.1)] transition-all duration-normal relative overflow-hidden hover:-translate-y-1 hover:border-primary/30 hover:shadow-[0_16px_48px_rgba(0,0,0,0.4)] motion-safe:animate-card-entrance">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
        <div className="flex items-center gap-2 mb-3">
          {icon && <span className="text-xl" dangerouslySetInnerHTML={{ __html: getIcon(icon) }} />}
          <span className="text-sm text-text-secondary">{title}</span>
        </div>
        <div className="text-4xl font-bold text-text" style={{ color }}>{value}</div>
        {subtitle && <div className="text-xs text-text-muted mt-1">{subtitle}</div>}
        {trend && (
          <div className={`text-xs mt-2 ${trendColors[trend.direction] || "text-text-muted"}`}>
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

    const values = data.map((d) => Number(d[yKey]) || 0);
    const maxVal = Math.max(...values, 1);

    if (chartType === "bar") {
      return (
        <div className="w-full relative flex items-end gap-2 px-2 pb-8 pt-4 box-border" style={{ height }}>
          {data.map((d, i) => {
            const pct = (values[i] / maxVal) * 100;
            return (
              <div key={i} className="flex-1 flex flex-col items-center h-full justify-end relative cursor-pointer group">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full bg-surface-elevated text-text px-2 py-1 rounded text-xs font-medium whitespace-nowrap opacity-0 pointer-events-none transition-opacity duration-fast z-10 shadow-lg group-hover:opacity-100">
                  {values[i]}
                </div>
                <div
                  className="w-full max-w-[40px] min-h-[4px] rounded-t transition-[height] duration-normal origin-bottom motion-safe:animate-bar-grow group-hover:brightness-125"
                  style={{ height: `${pct}%`, background: color }}
                />
                <div className="text-[10px] text-text-muted mt-2 whitespace-nowrap">{String(d[xKey])}</div>
              </div>
            );
          })}
        </div>
      );
    }

    // Line chart
    const chartW = 960;
    const mL = 52, mR = 12, mT = 12, mB = 22;
    const plotW = chartW - mL - mR;
    const plotH = height - mT - mB;
    const minVal = Math.min(...values);
    const dataRange = maxVal - minVal;
    const yPad = dataRange > 0 ? dataRange * 0.15 : maxVal * 0.1 || 1;
    const yMin = Math.max(0, Math.floor(minVal - yPad));
    const yMax = Math.ceil(maxVal + yPad);
    const yRange = yMax - yMin || 1;

    const pointCoords = data.map((d, i) => ({
      x: mL + (data.length > 1 ? (i / (data.length - 1)) * plotW : plotW / 2),
      y: mT + plotH - ((values[i] - yMin) / yRange) * plotH,
      label: String(d[xKey]),
      value: values[i],
    }));
    const points = pointCoords.map((p) => `${p.x},${p.y}`).join(" ");
    const areaPoints = `${pointCoords[0].x},${mT + plotH} ${points} ${pointCoords[pointCoords.length - 1].x},${mT + plotH}`;

    const gridCount = 4;
    const gridLines = Array.from({ length: gridCount + 1 }, (_, i) => {
      const pct = i / gridCount;
      const val = yMin + pct * yRange;
      return {
        y: mT + plotH - pct * plotH,
        label: val >= 10000 ? `${(val / 1000).toFixed(0)}k` : val >= 1000 ? `${(val / 1000).toFixed(1)}k` : String(Math.round(val)),
      };
    });

    const maxXLabels = Math.min(data.length, 7);
    const xLabelIdxs = data.length <= maxXLabels
      ? data.map((_, i) => i)
      : Array.from({ length: maxXLabels }, (_, i) => Math.round((i * (data.length - 1)) / (maxXLabels - 1)));

    return (
      <div className="w-full relative" style={{ height }}>
        <svg viewBox={`0 0 ${chartW} ${height}`} className="w-full h-auto">
          {gridLines.map((g, i) => (
            <React.Fragment key={i}>
              <line x1={mL} y1={g.y} x2={chartW - mR} y2={g.y} stroke="currentColor" strokeOpacity="0.08" strokeWidth="1" />
              <text x={mL - 8} y={g.y + 4} textAnchor="end" fill="currentColor" fillOpacity="0.45" fontSize="11" fontFamily="system-ui">{g.label}</text>
            </React.Fragment>
          ))}
          <polygon points={areaPoints} fill={color} fillOpacity="0.06" />
          <polyline fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" points={points} />
          {pointCoords.map((p, i) => (
            <g key={i} className="chart-point-group">
              <circle cx={p.x} cy={p.y} r="4" fill={color} className="chart-point"><title>{p.label}: {p.value}</title></circle>
              <circle cx={p.x} cy={p.y} r="14" fill="transparent" className="chart-point-hitarea" />
            </g>
          ))}
          {xLabelIdxs.map((i) => (
            <text key={i} x={pointCoords[i].x} y={height - 4} textAnchor="middle" fill="currentColor" fillOpacity="0.4" fontSize="11" fontFamily="system-ui">{pointCoords[i].label}</text>
          ))}
        </svg>
      </div>
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
    const btnBase = "px-5 py-2.5 rounded-[10px] text-sm font-medium cursor-pointer transition-all duration-fast border-none disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.97]";
    const btnVariants: Record<string, string> = {
      primary: "bg-gradient-to-br from-primary to-accent text-white hover:-translate-y-px hover:shadow-[0_4px_12px_rgba(102,126,234,0.4)]",
      secondary: "bg-surface text-text hover:bg-surface-hover",
      outline: "bg-transparent !border !border-solid !border-border text-text hover:!border-primary/50",
      ghost: "bg-transparent text-text-secondary hover:bg-primary/10 hover:text-text",
    };
    return (
      <button className={`${btnBase} ${btnVariants[variant] || btnVariants.primary}`} disabled={disabled} onClick={() => sendAction(action, payload)}>
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
      <nav className={`flex gap-1 ${navDir}`}>
        {items.map((item) => {
          const isActive = item.id === activeId;
          const activeClass = isActive
            ? "bg-gradient-to-br from-primary/20 to-accent/15 text-text border-primary/40 shadow-[0_4px_16px_rgba(102,126,234,0.2)]"
            : "text-text-secondary border-transparent hover:text-text hover:border-border-hover";
          return (
            <button key={item.id} className={`flex items-center gap-3 py-3.5 px-[18px] rounded-[14px] cursor-pointer transition-all duration-normal border border-solid bg-transparent text-sm font-normal text-left w-full relative overflow-hidden ${activeClass}`} onClick={() => sendNavigate(item.id)}>
              <div className={`absolute left-0 top-[15%] bottom-[15%] w-[3px] rounded-r-full bg-gradient-to-b from-primary to-accent shadow-[0_0_8px_rgba(102,126,234,0.5)] transition-all duration-normal origin-center ${isActive ? "opacity-100 scale-y-100" : "opacity-0 scale-y-0"}`} />
              {item.icon && <span className="transition-transform duration-fast" dangerouslySetInnerHTML={{ __html: getIcon(item.icon) }} />}
              <span className="nav-label">{item.label}</span>
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
        <div className="flex border-b-2 border-border gap-0">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTab;
            return (
              <button key={tab.id} className={`py-3 px-5 bg-transparent border-none text-sm cursor-pointer relative transition-colors duration-normal ${isActive ? "text-text" : "text-text-muted hover:text-text-secondary"}`} onClick={() => sendAction("tab_change", { tab: tab.id })}>
                {tab.label}
                <div className={`absolute bottom-[-2px] left-0 right-0 h-0.5 bg-gradient-to-r from-primary to-accent transition-all duration-normal origin-center ${isActive ? "opacity-100 scale-x-100" : "opacity-0 scale-x-0"}`} />
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
    const messages = (c.messages as { role: string; content: string; cards?: { components: A2UIComponent[]; root_id: string }; toolName?: string; toolStatus?: string; progressData?: { current: number; total: number; category: string } }[]) || [];
    const streaming = c.streaming as boolean;
    const streamingContent = c.streamingContent as string;
    const welcomeTitle = c.welcomeTitle as string | undefined;
    const welcomeSubtitle = c.welcomeSubtitle as string | undefined;
    const welcomeIcon = (c.welcomeIcon as string) || "bot";
    const welcomeActions = c.welcomeActions as Array<{ label: string; icon?: string; action: string; content: string }> | undefined;

    // Server-driven welcome screen
    if (messages.length === 0 && !streaming && welcomeTitle) {
      const sugBtn = "flex items-center gap-2 px-4 py-3 rounded-2xl bg-surface border border-border text-text-secondary text-sm cursor-pointer transition-all duration-fast hover:border-primary/30 hover:bg-surface-hover hover:text-text hover:shadow-[0_4px_12px_rgba(102,126,234,0.15)]";
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-8 gap-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center text-primary" dangerouslySetInnerHTML={{ __html: ICONS[welcomeIcon] || ICONS["bot"] }} />
          <div className="text-2xl font-bold text-text">{welcomeTitle}</div>
          {welcomeSubtitle && <div className="text-sm text-text-muted max-w-[400px]">{welcomeSubtitle}</div>}
          {welcomeActions && welcomeActions.length > 0 && (
            <div className="flex flex-wrap gap-3 mt-4 justify-center">
              {welcomeActions.map((a, i) => (
                <button key={i} className={sugBtn} onClick={() => { const actionName = (c.action as string) || a.action || "send_message"; sendAction(actionName, { content: a.content, value: a.content }); }}>
                  {a.icon && <span dangerouslySetInnerHTML={{ __html: ICONS[a.icon] || "" }} />}
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </div>
      );
    }

    const noWelcome = c.noWelcome as boolean;
    if (messages.length === 0 && !streaming && noWelcome) {
      return (
        <div className="flex-1 flex items-center justify-center p-4 text-text-muted text-sm opacity-50">
          {i18n.evolution?.playgroundChatPlaceholder || "Waiting for messages..."}
        </div>
      );
    }

    // Default welcome
    if (messages.length === 0 && !streaming) {
      const sugBtn = "flex items-center gap-2 px-4 py-3 rounded-2xl bg-surface border border-border text-text-secondary text-sm cursor-pointer transition-all duration-fast hover:border-primary/30 hover:bg-surface-hover hover:text-text hover:shadow-[0_4px_12px_rgba(102,126,234,0.15)]";
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-8 gap-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center text-primary" dangerouslySetInnerHTML={{ __html: ICONS["chat"] }} />
          <div className="text-2xl font-bold text-text">{i18n.chat.title}</div>
          <div className="text-sm text-text-muted max-w-[400px]">{i18n.chat.subtitle}</div>
          <div className="flex flex-wrap gap-3 mt-4 justify-center">
            <button className={sugBtn} onClick={() => sendAction("send_message", { content: i18n.chat.sleepQuestion })}>
              <span dangerouslySetInnerHTML={{ __html: ICONS["moon"] }} />{i18n.chat.sleepAnalysis}
            </button>
            <button className={sugBtn} onClick={() => sendAction("send_message", { content: i18n.chat.activityQuestion })}>
              <span dangerouslySetInnerHTML={{ __html: ICONS["activity"] }} />{i18n.chat.activitySummary}
            </button>
            <button className={sugBtn} onClick={() => sendAction("send_message", { content: i18n.chat.heartRateQuestion })}>
              <span dangerouslySetInnerHTML={{ __html: ICONS["heart"] }} />{i18n.chat.heartRate}
            </button>
          </div>
        </div>
      );
    }

    const avatarBase = "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-white";
    const msgContent = "max-w-[70%] px-5 py-4 rounded-[20px] leading-relaxed text-sm";

    // Group consecutive tool messages
    type MsgGroup = { type: "message"; msg: (typeof messages)[0] } | { type: "tools"; msgs: (typeof messages)[0][] };
    const groups: MsgGroup[] = [];
    for (const msg of messages) {
      if (msg.role === "tool") {
        const last = groups[groups.length - 1];
        if (last && last.type === "tools") { last.msgs.push(msg); }
        else { groups.push({ type: "tools", msgs: [msg] }); }
      } else {
        groups.push({ type: "message", msg });
      }
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
        {groups.map((group, gi) => {
          if (group.type === "tools") {
            return (
              <div key={gi} className="flex gap-4 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-left-4 motion-safe:duration-normal">
                <div className="flex flex-col max-w-[70%] ml-13">
                  {group.msgs.map((msg, idx) => {
                    const toolName = msg.toolName || "";
                    const status = msg.toolStatus || "completed";
                    const hasCards = !!msg.cards;
                    const isLast = idx === group.msgs.length - 1;
                    const statusIcon = status === "running"
                      ? <span className="tool-spinner" />
                      : status === "error"
                        ? <span className="text-error" dangerouslySetInnerHTML={{ __html: ICONS["x"] }} />
                        : <span className="text-success" dangerouslySetInnerHTML={{ __html: ICONS["check"] }} />;
                    const dotClass = status === "running" ? "bg-primary motion-safe:animate-pulse" : status === "error" ? "bg-error" : "bg-success";

                    return (
                      <div key={idx} className="flex">
                        <div className="flex flex-col items-center mr-3 relative">
                          <div className={`w-2.5 h-2.5 rounded-full ${dotClass} z-10 mt-1.5 shrink-0`} />
                          {!isLast && <div className="w-0.5 flex-1 bg-border" />}
                        </div>
                        <div className={`flex-1 pb-3 min-w-0 ${hasCards ? "collapsible-group" : ""}`}>
                          <div
                            className={`flex items-center gap-2 text-xs text-text-muted py-1 ${hasCards ? "cursor-pointer select-none" : ""}`}
                            onClick={hasCards ? (e) => { (e.currentTarget as HTMLElement).parentElement?.classList.toggle("is-open"); } : undefined}
                          >
                            <span className="flex-1 truncate">{msg.content || `Using ${toolName}...`}</span>
                            {statusIcon}
                            {hasCards && <span className="text-text-muted transition-transform duration-200 [.is-open>&]:rotate-90 text-xs">&#9654;</span>}
                          </div>
                          {msg.progressData && status === "running" && (
                            <div className="flex items-center gap-2 mt-1">
                              <div className="flex-1 h-1.5 rounded-full bg-border overflow-hidden">
                                <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${Math.round((msg.progressData.current / msg.progressData.total) * 100)}%` }} />
                              </div>
                              <span className="text-[10px] text-text-muted shrink-0">{msg.progressData.category}</span>
                            </div>
                          )}
                          {hasCards && (
                            <div className="collapsible-grid">
                              <div>{renderInline(msg.cards!)}</div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          }

          const msg = group.msg;
          const isUser = msg.role === "user";
          return (
            <div key={gi} className={`flex gap-4 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-normal ${isUser ? "flex-row-reverse motion-safe:slide-in-from-right-4" : "motion-safe:slide-in-from-left-4"}`}>
              <div className={`${avatarBase} ${isUser ? "bg-bg-tertiary" : "bg-gradient-to-br from-primary to-accent"}`} dangerouslySetInnerHTML={{ __html: ICONS[msg.role === "assistant" ? "bot" : "user"] }} />
              {msg.role === "assistant" && msg.cards ? (
                <div className="flex flex-col gap-3 max-w-[70%]">
                  <div className={`${msgContent} bg-surface border border-border`} dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                  <div>{renderInline(msg.cards)}</div>
                </div>
              ) : (
                <div className={`${msgContent} ${isUser ? "bg-gradient-to-br from-primary to-accent text-white" : "bg-surface border border-border"}`}>
                  {msg.role === "assistant" ? <span dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} /> : msg.content}
                </div>
              )}
            </div>
          );
        })}

        {streaming && (
          <div className="flex gap-4 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-left-4 motion-safe:duration-normal">
            <div className={`${avatarBase} bg-gradient-to-br from-primary to-accent`} dangerouslySetInnerHTML={{ __html: ICONS["bot"] }} />
            {streamingContent ? (
              <div className={`${msgContent} bg-surface border border-border`} dangerouslySetInnerHTML={{ __html: renderMarkdown(streamingContent) }} />
            ) : (
              <div className="flex gap-1.5 px-5 py-4">
                <div className="w-2 h-2 rounded-full bg-text-muted motion-safe:animate-bounce-dot" style={{ animationDelay: "0s" }} />
                <div className="w-2 h-2 rounded-full bg-text-muted motion-safe:animate-bounce-dot" style={{ animationDelay: "0.2s" }} />
                <div className="w-2 h-2 rounded-full bg-text-muted motion-safe:animate-bounce-dot" style={{ animationDelay: "0.4s" }} />
              </div>
            )}
          </div>
        )}

        {!streaming && (c.quickReplies as Array<{ label: string; content: string; icon?: string; variant?: string }>)?.length ? (
          <div className="flex gap-2 pl-13 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-normal">
            {(c.quickReplies as Array<{ label: string; content: string; icon?: string; variant?: string }>).map((qr, i) => (
              <button
                key={i}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-2xl text-sm font-medium cursor-pointer transition-all duration-fast border ${
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
    const stopAction = actionName.startsWith("sa_") ? "sa_stop_generation" : "stop_generation";
    return (
      <div className="flex shrink-0 gap-3 p-6 border-t border-border bg-surface backdrop-blur-[12px]">
        <input
          type="text"
          className="flex-1 py-3.5 px-5 bg-surface border border-border rounded-2xl text-text text-[0.9375rem] transition-all duration-fast outline-none placeholder:text-text-muted focus:border-primary/50 focus:bg-surface-hover focus:ring-4 focus:ring-primary/10"
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
          className={`w-[54px] h-[54px] rounded-2xl border-none ${streaming ? "bg-red-500/90 hover:bg-red-600" : "bg-gradient-to-br from-primary to-accent"} text-white cursor-pointer flex items-center justify-center shrink-0 transition-all duration-fast hover:shadow-[0_4px_16px_rgba(102,126,234,0.4)] hover:-translate-y-px`}
          title={streaming ? "Stop generating" : "Send"}
          onClick={(e) => {
            if (streaming) { sendAction(stopAction, {}); return; }
            const container = (e.target as HTMLElement).closest(".flex");
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
