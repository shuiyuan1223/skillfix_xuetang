import React from 'react';
import ReactDOM from 'react-dom';
import type { A2UIComponent, A2UISurfaceData, MessagePart } from '../../lib/types';
import { componentType, prop, getChildren } from '../../lib/types';
import { ICONS, getIcon } from '../../lib/icons';
import { Markdown } from '../../lib/markdown';
import { i18n } from '../../lib/i18n';
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import {
  renderCodeEditor,
  renderCommitList,
  renderDiffView,
  renderDataTable,
  renderScoreGauge,
  renderActivityRings,
  renderStatusBadge,
  renderCollapsible,
  renderModalComponent,
  renderForm,
  renderFormInput,
  renderGitTimeline,
  renderStepIndicator,
  renderFileTree,
  renderArenaPills,
  renderArenaScoreTable,
  renderArenaCategoryCard,
  renderRadarChart,
  renderArenaRunPicker,
  renderArenaModeToggle,
  renderPlaygroundFab,
  renderEvolutionPipeline,
  renderLogViewer,
  renderVersionGraph,
} from './AdvancedRenderers';
import { CountUp, BlurText, AnimatedContent, SpotlightCard, StarBorder } from '../reactbits';

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
  get_health_data: '健康数据',
  get_heart_rate: '心率数据',
  get_sleep: '睡眠数据',
  get_weekly_summary: '周报汇总',
  get_workouts: '运动数据',
  get_hrv: '心率变异性',
  update_user_profile: '更新健康档案',
  complete_onboarding: '完成引导',
  present_insight: '健康洞察',
  create_health_plan: '创建健康计划',
  list_health_plans: '健康计划列表',
  get_health_plan: '计划详情',
  update_plan_progress: '更新进度',
  adjust_health_plan: '调整计划',
  update_plan_status: '更新计划状态',
  create_recommendation: '健康推荐',
  list_recommendations: '推荐列表',
  dismiss_recommendation: '关闭推荐',
  create_reminder: '创建提醒',
  list_reminders: '提醒列表',
  complete_reminder: '完成提醒',
  delete_reminder: '删除提醒',
  create_calendar_event: '创建日历事件',
  list_calendar_events: '日历事件列表',
  update_calendar_event: '更新日历事件',
  delete_calendar_event: '删除日历事件',
  get_weather: '天气查询',
  create_dashboard: '创建仪表盘',
  update_dashboard: '更新仪表盘',
  list_incidents: 'Incidents 列表',
  get_incident: 'Incident 详情',
  update_incident_status: '更新 Incident 状态',
  update_incident_type: '修改 Incident 类型',
  create_github_issue_for_incident: '创建 GitHub Issue',
  convert_incident_to_test_case: '转为测试用例',
  get_incident_stats: 'Incidents 统计',
  update_incident_trace: '关联 Trace',
  search_llm_logs: '搜索 LLM 日志',
};

// ---- ThinkingMessage: collapsible thinking block for thinking-mode chat ----

function ThinkingMessage({
  parts,
  isActiveMsg,
  renderPartFn,
  msgBubble,
}: {
  parts: MessagePart[];
  isActiveMsg: boolean;
  renderPartFn: (part: MessagePart, idx: number) => React.ReactNode;
  msgBubble: string;
}) {
  // Find the split point: last tool_use / tool_result index
  let lastToolIdx = -1;
  for (let i = parts.length - 1; i >= 0; i--) {
    if (parts[i].type === 'tool_use' || parts[i].type === 'tool_result') {
      lastToolIdx = i;
      break;
    }
  }

  const hasToolCalls = lastToolIdx >= 0;
  const thinkingParts = hasToolCalls ? parts.slice(0, lastToolIdx + 1) : [];
  const answerParts = hasToolCalls ? parts.slice(lastToolIdx + 1) : parts;
  const hasAnswer = answerParts.some((p) => p.type === 'text' && p.content?.trim());
  const toolCount = thinkingParts.filter((p) => p.type === 'tool_use').length;

  // Start expanded; auto-collapse when streaming ends and answer exists
  const [expanded, setExpanded] = React.useState(true);
  React.useEffect(() => {
    if (!isActiveMsg && hasAnswer) {
      setExpanded(false);
    }
    if (isActiveMsg) {
      setExpanded(true);
    }
  }, [isActiveMsg, hasAnswer]);

  // If no tool calls, render parts normally (no thinking/answer split)
  if (!hasToolCalls) {
    return (
      <>
        {parts.map((part, pi) => {
          if (isActiveMsg && part.type === 'text' && part.content?.trim() && pi === parts.length - 1) {
            return (
              <div
                key={pi}
                className={`${msgBubble} bg-surface-card border border-border`}
                style={{ boxShadow: 'var(--shadow-sm)', animation: 'stream-border-pulse 2s ease-in-out infinite' }}
              >
                <Markdown>{part.content}</Markdown>
              </div>
            );
          }
          return renderPartFn(part, pi);
        })}
        {isActiveMsg &&
          !parts.some(
            (p) => (p.type === 'text' && p.content?.trim()) || p.type === 'tool_use' || p.type === 'tool_result'
          ) && (
            <div
              className="inline-flex gap-1.5 items-center px-4 py-3 rounded-2xl bg-surface-card border border-border self-start"
              style={{ boxShadow: 'var(--shadow-sm)' }}
            >
              <div
                className="w-2 h-2 rounded-full bg-primary/60 motion-safe:animate-bounce-dot"
                style={{ animationDelay: '0s' }}
              />
              <div
                className="w-2 h-2 rounded-full bg-primary/60 motion-safe:animate-bounce-dot"
                style={{ animationDelay: '0.2s' }}
              />
              <div
                className="w-2 h-2 rounded-full bg-primary/60 motion-safe:animate-bounce-dot"
                style={{ animationDelay: '0.4s' }}
              />
            </div>
          )}
      </>
    );
  }

  // Collapsible thinking + answer
  const isThinking = isActiveMsg && !hasAnswer;
  let headerLabel: string;
  if (isThinking) {
    headerLabel = '思考中';
  } else if (expanded) {
    headerLabel = '思考过程';
  } else {
    headerLabel = `已搜索 ${toolCount} 项数据`;
  }

  return (
    <>
      {/* Collapsible thinking header */}
      <button
        className="flex items-center gap-2 text-xs text-text-muted py-1 cursor-pointer hover:text-text transition-colors select-none"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="text-[10px]">{expanded ? '\u25BE' : '\u25B8'}</span>
        <span>{headerLabel}</span>
        {isThinking && (
          <span className="inline-flex gap-1 items-center">
            <span
              className="w-1 h-1 rounded-full bg-primary/70 motion-safe:animate-bounce-dot"
              style={{ animationDelay: '0s' }}
            />
            <span
              className="w-1 h-1 rounded-full bg-primary/70 motion-safe:animate-bounce-dot"
              style={{ animationDelay: '0.15s' }}
            />
            <span
              className="w-1 h-1 rounded-full bg-primary/70 motion-safe:animate-bounce-dot"
              style={{ animationDelay: '0.3s' }}
            />
          </span>
        )}
      </button>

      {/* Thinking parts (collapsible) */}
      {expanded && (
        <div className="border-l-2 border-border/50 pl-3 flex flex-col gap-1.5 ml-1">
          {thinkingParts.map((part, pi) => {
            if (part.type === 'text') {
              if (!part.content?.trim()) {
                return null;
              }
              return (
                <div key={pi} className="text-xs text-text-secondary opacity-80 leading-relaxed">
                  <Markdown>{part.content}</Markdown>
                </div>
              );
            }
            return renderPartFn(part, pi);
          })}
        </div>
      )}

      {/* Answer parts */}
      {answerParts.map((part, pi) => {
        const realIdx = lastToolIdx + 1 + pi;
        if (isActiveMsg && part.type === 'text' && part.content?.trim() && realIdx === parts.length - 1) {
          return (
            <div
              key={realIdx}
              className={`${msgBubble} bg-surface-card border border-border`}
              style={{ boxShadow: 'var(--shadow-sm)', animation: 'stream-border-pulse 2s ease-in-out infinite' }}
            >
              <Markdown>{part.content}</Markdown>
            </div>
          );
        }
        return renderPartFn(part, realIdx);
      })}

      {/* Typing indicator when streaming but no answer yet */}
      {isActiveMsg && !hasAnswer && thinkingParts.length > 0 && (
        <div
          className="inline-flex gap-1.5 items-center px-4 py-3 rounded-2xl bg-surface-card border border-border self-start"
          style={{ boxShadow: 'var(--shadow-sm)' }}
        >
          <div
            className="w-2 h-2 rounded-full bg-primary/60 motion-safe:animate-bounce-dot"
            style={{ animationDelay: '0s' }}
          />
          <div
            className="w-2 h-2 rounded-full bg-primary/60 motion-safe:animate-bounce-dot"
            style={{ animationDelay: '0.2s' }}
          />
          <div
            className="w-2 h-2 rounded-full bg-primary/60 motion-safe:animate-bounce-dot"
            style={{ animationDelay: '0.4s' }}
          />
        </div>
      )}
    </>
  );
}

export function A2UIRenderer({
  data,
  sendAction,
  sendNavigate,
  chatAutoScrollRef,
  isAutoScrollingRef,
}: A2UIRendererProps) {
  let components = new Map<string, A2UIComponent>();
  for (const c of data.components) {
    components.set(c.id, c);
  }

  function renderComponent(id: string): React.ReactNode {
    const c = components.get(id);
    if (!c) {
      return null;
    }
    switch (componentType(c)) {
      case 'Column':
        return rcColumn(c);
      case 'Row':
        return rcRow(c);
      case 'Grid':
        return rcGrid(c);
      case 'Text':
        return rcText(c);
      case 'Card':
        return rcCard(c);
      case 'StatCard':
        return rcStatCard(c);
      case 'Metric':
        return rcMetric(c);
      case 'Chart':
        return rcChart(c);
      case 'Table':
        return rcTable(c);
      case 'Button':
        return rcButton(c);
      case 'Nav':
        return rcNav(c);
      case 'Tabs':
        return rcTabs(c);
      case 'Progress':
        return rcProgress(c);
      case 'Badge':
        return rcBadge(c);
      case 'Skeleton':
        return rcSkeleton(c);
      case 'Divider':
        return <div className="sidebar-divider" />;
      case 'Spacer':
        return <div style={{ height: (prop(c, 'height') as number) || 16 }} />;
      case 'ChatMessages':
        return rcChatMessages(c);
      case 'ChatInput':
        return rcChatInput(c);
      case 'CodeEditor':
        return renderCodeEditor(c, ctx);
      case 'CommitList':
        return renderCommitList(c, ctx);
      case 'DiffView':
        return renderDiffView(c, ctx);
      case 'DataTable':
        return renderDataTable(c, ctx);
      case 'ScoreGauge':
        return renderScoreGauge(c, ctx);
      case 'ActivityRings':
        return renderActivityRings(c, ctx);
      case 'StatusBadge':
        return renderStatusBadge(c, ctx);
      case 'Collapsible':
        return renderCollapsible(c, ctx);
      case 'Modal':
        return renderModalComponent(c, ctx);
      case 'Form':
        return renderForm(c, ctx);
      case 'FormInput':
        return renderFormInput(c, ctx);
      case 'GitTimeline':
        return renderGitTimeline(c, ctx);
      case 'StepIndicator':
        return renderStepIndicator(c, ctx);
      case 'FileTree':
        return renderFileTree(c, ctx);
      case 'ArenaPills':
        return renderArenaPills(c, ctx);
      case 'ArenaScoreTable':
        return renderArenaScoreTable(c, ctx);
      case 'ArenaCategoryCard':
        return renderArenaCategoryCard(c, ctx);
      case 'RadarChart':
        return renderRadarChart(c, ctx);
      case 'ArenaRunPicker':
        return renderArenaRunPicker(c, ctx);
      case 'ArenaModeToggle':
        return renderArenaModeToggle(c, ctx);
      case 'PlaygroundFab':
        return renderPlaygroundFab(c, ctx);
      case 'VersionGraph':
        return renderVersionGraph(c, ctx);
      case 'EvolutionPipeline':
        return renderEvolutionPipeline(c, ctx);
      case 'LogViewer':
        return renderLogViewer(c, ctx);
      case 'AuthPage':
        return rcAuthPage(c);
      case 'TagPicker':
        return <TagPickerComponent key={(prop(c, 'stableKey') as string) || c.id} c={c} sendAction={sendAction} />;
      default:
        return <div className="text-text-muted text-xs p-2">[Unknown: {componentType(c)}]</div>;
    }
  }

  function renderChildren(ids?: string[]): React.ReactNode[] {
    if (!ids) {
      return [];
    }
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
    sendAction,
    sendNavigate,
    renderChildren,
    renderComponent,
    renderInline,
    chatAutoScrollRef,
    isAutoScrollingRef,
  };

  // ---- Layout Components ----

  function rcColumn(c: A2UIComponent) {
    const gap = (prop(c, 'gap') as number) || 0;
    const padding = (prop(c, 'padding') as number) || 0;
    const align = (prop(c, 'align') as string) || 'stretch';
    const extraStyle = (prop(c, 'style') as string) || '';
    const className = (prop(c, 'className') as string) || '';
    const isGrid = extraStyle.includes('display: grid');
    const baseClass = isGrid ? className : `flex flex-col ${className}`;
    return (
      <div
        className={baseClass}
        style={parseStyle(`gap: ${gap}px; padding: ${padding}px; align-items: ${align}; ${extraStyle}`)}
      >
        {renderChildren(getChildren(c))}
      </div>
    );
  }

  function rcRow(c: A2UIComponent) {
    const gap = (prop(c, 'gap') as number) || 0;
    const rawJustify = (prop(c, 'justify') as string) || 'start';
    const align = (prop(c, 'align') as string) || 'center';
    const wrap = prop(c, 'wrap') as boolean;
    const className = (prop(c, 'className') as string) || '';
    const extraStyle = (prop(c, 'style') as string) || '';
    // Map shorthand values to valid CSS
    const justifyMap: Record<string, string> = {
      start: 'flex-start',
      center: 'center',
      end: 'flex-end',
      between: 'space-between',
      around: 'space-around',
    };
    const justify = justifyMap[rawJustify] || rawJustify;
    return (
      <div
        className={`flex flex-row ${wrap ? 'flex-wrap' : ''} ${className}`}
        style={parseStyle(`gap: ${gap}px; justify-content: ${justify}; align-items: ${align}; ${extraStyle}`)}
      >
        {renderChildren(getChildren(c))}
      </div>
    );
  }

  function rcGrid(c: A2UIComponent) {
    const columns = (prop(c, 'columns') as number) || 2;
    const gap = (prop(c, 'gap') as number) || 16;
    let minColWidth = 240;
    if (columns >= 4) {
      minColWidth = 160;
    } else if (columns >= 3) {
      minColWidth = 200;
    }
    return (
      <div
        className="grid stagger-children"
        style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(${minColWidth}px, 100%), 1fr))`, gap }}
      >
        {getChildren(c).map((id, index) => (
          <div key={id} style={{ '--stagger-index': index } as React.CSSProperties}>
            {renderComponent(id)}
          </div>
        ))}
      </div>
    );
  }

  // ---- Content Components ----

  function rcText(c: A2UIComponent) {
    const variant = (prop(c, 'variant') as string) || 'body';
    const color = (prop(c, 'color') as string) || 'inherit';
    const weight = (prop(c, 'weight') as string) || 'normal';
    const text = prop(c, 'text') as string;
    const className = (prop(c, 'className') as string) || '';
    const extraStyle = (prop(c, 'style') as string) || '';
    const textVariants: Record<string, string> = {
      h1: 'text-[2rem] font-bold',
      h2: 'text-2xl font-semibold',
      h3: 'text-lg font-semibold',
      body: 'text-sm',
      caption: 'text-xs text-text-secondary',
      label: 'text-xs font-medium uppercase tracking-widest text-text-muted',
    };
    const variantClass = textVariants[variant] || textVariants.body;
    const isMarkdown = prop(c, 'markdown') as boolean;
    if (isMarkdown) {
      return (
        <div className={`text-sm ${className}`} style={parseStyle(extraStyle)}>
          <Markdown>{text}</Markdown>
        </div>
      );
    }
    return (
      <span
        className={`${variantClass} ${className}`}
        style={parseStyle(`color: ${color}; font-weight: ${weight}; ${extraStyle}`)}
      >
        {text}
      </span>
    );
  }

  function rcCard(c: A2UIComponent) {
    const title = prop(c, 'title') as string;
    const padding = (prop(c, 'padding') as number) || 20;
    const className = (prop(c, 'className') as string) || '';
    const accent = prop(c, 'accent') as boolean;
    const spotlightColor = 'rgba(var(--color-primary), 0.08)';

    const inner = (
      <>
        {title && <div className="text-[15px] font-semibold mb-4 text-text-strong tracking-tight">{title}</div>}
        {renderChildren(getChildren(c))}
      </>
    );

    const card = (
      <SpotlightCard
        className={`card-hover bg-surface-card border border-border rounded-xl ${className}`}
        spotlightColor={spotlightColor}
      >
        <div style={{ padding, position: 'relative', zIndex: 2 }}>{inner}</div>
      </SpotlightCard>
    );

    if (accent) {
      return (
        <AnimatedContent distance={30} duration={0.5}>
          <StarBorder color="rgb(var(--color-primary))" speed="8s" thickness={1}>
            <div style={{ padding }}>{inner}</div>
          </StarBorder>
        </AnimatedContent>
      );
    }

    return (
      <AnimatedContent distance={30} duration={0.5}>
        {card}
      </AnimatedContent>
    );
  }

  function rcStatCard(c: A2UIComponent) {
    const title = prop(c, 'title') as string;
    const value = prop(c, 'value') as string | number;
    const subtitle = prop(c, 'subtitle') as string;
    const icon = prop(c, 'icon') as string;
    const trend = prop(c, 'trend') as { direction: string; value: string } | undefined;
    const color = (prop(c, 'color') as string) || 'rgb(var(--color-text))';
    const trendColors: Record<string, string> = {
      up: 'text-emerald-500',
      down: 'text-red-500',
      stable: 'text-text-muted',
    };

    // Parse numeric value for CountUp animation
    const numericValue = typeof value === 'number' ? value : parseFloat(String(value).replace(/,/g, ''));
    const isNumeric = !isNaN(numericValue) && isFinite(numericValue);
    // Extract non-numeric suffix (e.g. "bpm", "%", "kcal")
    const valueSuffix = isNumeric && typeof value === 'string' ? value.replace(/[\d.,\s-]+/, '').trim() : '';

    return (
      <AnimatedContent distance={30} duration={0.5}>
        <SpotlightCard
          className="card-hover bg-surface-card border border-border rounded-xl p-5 relative overflow-hidden group"
          spotlightColor="rgba(var(--color-primary), 0.08)"
        >
          <div
            className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ zIndex: 2 }}
          />
          <div className="flex items-center gap-2 mb-3 relative" style={{ zIndex: 2 }}>
            {icon && (
              <span
                className="w-5 h-5 text-text-secondary [&>svg]:w-5 [&>svg]:h-5"
                dangerouslySetInnerHTML={{ __html: getIcon(icon) }}
              />
            )}
            <span className="text-[13px] text-text-secondary font-medium">{title}</span>
          </div>
          <div className="text-3xl font-bold relative" style={{ color, letterSpacing: '-0.03em', zIndex: 2 }}>
            {isNumeric ? (
              <>
                <CountUp to={numericValue} duration={1.8} separator="," />
                {valueSuffix && <span className="ml-0.5">{valueSuffix}</span>}
              </>
            ) : (
              value
            )}
          </div>
          {subtitle && (
            <div className="text-xs text-text-muted mt-1.5 relative" style={{ zIndex: 2 }}>
              {subtitle}
            </div>
          )}
          {trend && (
            <div
              className={`text-xs mt-2 font-medium relative ${trendColors[trend.direction] || 'text-text-muted'}`}
              style={{ zIndex: 2 }}
            >
              {getTrendArrow(trend.direction)} {trend.value}
            </div>
          )}
        </SpotlightCard>
      </AnimatedContent>
    );
  }

  function rcMetric(c: A2UIComponent) {
    const label = prop(c, 'label') as string;
    const value = prop(c, 'value') as string | number;
    const unit = prop(c, 'unit') as string;
    const icon = prop(c, 'icon') as string;
    return (
      <div className="flex items-baseline gap-1">
        {icon && (
          <span
            className="w-4 h-4 text-text-secondary [&>svg]:w-4 [&>svg]:h-4"
            dangerouslySetInnerHTML={{ __html: getIcon(icon) }}
          />
        )}
        <span className="text-2xl font-semibold">{value}</span>
        {unit && <span className="text-sm text-text-muted">{unit}</span>}
        <span className="text-xs text-text-muted ml-2">{label}</span>
      </div>
    );
  }

  interface ChartRenderParams {
    data: Record<string, unknown>[];
    height: number;
    xKey: string;
    yKey: string;
    color: string;
    gradientId: string;
    dense: boolean;
    dotStyle: false | { r: number; fill: string };
    axisStyle: { fontSize: number; fill: string; fillOpacity: number };
    gridStroke: string;
    gridOpacity: number;
    tooltipStyle: {
      contentStyle: Record<string, unknown>;
      labelStyle: Record<string, unknown>;
      itemStyle: Record<string, unknown>;
    };
  }

  function renderBarChart(p: ChartRenderParams) {
    return (
      <ResponsiveContainer width="100%" height={p.height}>
        <ComposedChart data={p.data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
          <defs>
            <linearGradient id={p.gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={p.color} stopOpacity={0.12} />
              <stop offset="100%" stopColor={p.color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={p.gridStroke} strokeOpacity={p.gridOpacity} vertical={false} />
          <XAxis dataKey={p.xKey} tick={p.axisStyle} tickLine={false} axisLine={false} />
          <YAxis tick={p.axisStyle} tickLine={false} axisLine={false} />
          <Tooltip {...p.tooltipStyle} cursor={{ fill: 'currentColor', fillOpacity: 0.04 }} />
          <Bar dataKey={p.yKey} fill={p.color} fillOpacity={0.6} radius={[3, 3, 0, 0]} />
          <Area type="monotone" dataKey={p.yKey} fill={`url(#${p.gradientId})`} stroke="none" />
          <Line
            type="monotone"
            dataKey={p.yKey}
            stroke={p.color}
            strokeWidth={2}
            dot={p.dotStyle}
            strokeOpacity={0.8}
          />
        </ComposedChart>
      </ResponsiveContainer>
    );
  }

  function renderAreaChart(p: ChartRenderParams) {
    return (
      <ResponsiveContainer width="100%" height={p.height}>
        <AreaChart data={p.data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
          <defs>
            <linearGradient id={p.gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={p.color} stopOpacity={0.25} />
              <stop offset="100%" stopColor={p.color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={p.gridStroke} strokeOpacity={p.gridOpacity} vertical={false} />
          <XAxis dataKey={p.xKey} tick={p.axisStyle} tickLine={false} axisLine={false} />
          <YAxis tick={p.axisStyle} tickLine={false} axisLine={false} domain={['dataMin - 5', 'dataMax + 5']} />
          <Tooltip {...p.tooltipStyle} />
          <Area
            type="monotone"
            dataKey={p.yKey}
            stroke={p.color}
            strokeWidth={2}
            fill={`url(#${p.gradientId})`}
            dot={p.dotStyle}
          />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  function renderPieChart(p: ChartRenderParams, chartType: string) {
    const COLORS = [p.color, '#14b8a6', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316'];
    const innerRadius = chartType === 'donut' ? '55%' : 0;
    return (
      <ResponsiveContainer width="100%" height={p.height}>
        <PieChart>
          <Tooltip {...p.tooltipStyle} />
          <Pie
            data={p.data}
            dataKey={p.yKey}
            nameKey={p.xKey}
            cx="50%"
            cy="50%"
            innerRadius={innerRadius}
            outerRadius="80%"
            paddingAngle={2}
            strokeWidth={0}
          >
            {p.data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} fillOpacity={0.85} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    );
  }

  function renderLineChart(p: ChartRenderParams) {
    return (
      <ResponsiveContainer width="100%" height={p.height}>
        <AreaChart data={p.data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
          <defs>
            <linearGradient id={p.gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={p.color} stopOpacity={0.15} />
              <stop offset="100%" stopColor={p.color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={p.gridStroke} strokeOpacity={p.gridOpacity} vertical={false} />
          <XAxis dataKey={p.xKey} tick={p.axisStyle} tickLine={false} axisLine={false} />
          <YAxis tick={p.axisStyle} tickLine={false} axisLine={false} domain={['dataMin - 5', 'dataMax + 5']} />
          <Tooltip {...p.tooltipStyle} />
          <Area
            type="monotone"
            dataKey={p.yKey}
            stroke={p.color}
            strokeWidth={p.dense ? 1.5 : 2.5}
            fill={`url(#${p.gradientId})`}
            dot={p.dotStyle}
          />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  function rcChart(c: A2UIComponent) {
    const chartType = prop(c, 'chartType') as string;
    const data = prop(c, 'data') as Record<string, unknown>[];
    const height = (prop(c, 'height') as number) || 200;
    const xKey = prop(c, 'xKey') as string;
    const yKey = prop(c, 'yKey') as string;
    const color = (prop(c, 'color') as string) || '#667eea';

    if (!data || data.length === 0) {
      return (
        <div className="flex items-center justify-center text-text-muted" style={{ height }}>
          No data
        </div>
      );
    }

    const dense = data.length > 15;
    const p: ChartRenderParams = {
      data,
      height,
      xKey,
      yKey,
      color,
      gradientId: `chart-grad-${c.id}`,
      dense,
      dotStyle: dense ? false : { r: 3, fill: color },
      axisStyle: { fontSize: 11, fill: 'currentColor', fillOpacity: 0.45 },
      gridStroke: 'currentColor',
      gridOpacity: 0.08,
      tooltipStyle: {
        contentStyle: {
          background: 'var(--color-surface-elevated)',
          border: '1px solid rgb(var(--color-border))',
          borderRadius: 8,
          fontSize: 12,
        },
        labelStyle: { color: 'rgb(var(--color-text-secondary))' },
        itemStyle: { color: 'rgb(var(--color-text))' },
      },
    };

    if (chartType === 'bar') {
      return renderBarChart(p);
    }
    if (chartType === 'area') {
      return renderAreaChart(p);
    }
    if (chartType === 'pie' || chartType === 'donut') {
      return renderPieChart(p, chartType);
    }
    // Default: line chart (also fallback for unknown types)
    return renderLineChart(p);
  }

  function rcTable(c: A2UIComponent) {
    const columns = prop(c, 'columns') as { key: string; label: string }[];
    const rows = prop(c, 'rows') as Record<string, unknown>[];
    return (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="p-3 text-left text-xs font-medium uppercase text-text-muted border-b border-border"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {columns.map((col) => (
                  <td key={col.key} className="p-3 text-left border-b border-border text-sm">
                    {String(row[col.key] ?? '')}
                  </td>
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
    const label = prop(c, 'label') as string;
    const action = prop(c, 'action') as string;
    const variant = (prop(c, 'variant') as string) || 'primary';
    const disabled = prop(c, 'disabled') as boolean;
    const payload = prop(c, 'payload') as Record<string, unknown>;
    const icon = prop(c, 'icon') as string | undefined;
    const tooltip = prop(c, 'tooltip') as string | undefined;
    const isIconOnly = icon && !label;

    const btnVariants: Record<string, string> = {
      primary: 'bg-primary text-primary-fg hover:-translate-y-px',
      secondary: 'bg-surface text-text border border-border hover:bg-surface-hover hover:border-border-hover',
      outline: 'bg-transparent border border-border text-text hover:border-border-hover hover:bg-surface-hover',
      ghost: 'bg-transparent text-text-secondary hover:bg-primary/8 hover:text-text',
      danger: 'bg-red-600 text-white hover:bg-red-700 hover:-translate-y-px',
      accent: 'text-white hover:-translate-y-0.5 animate-[glow-pulse_3s_ease-in-out_infinite]',
    };

    const btnBase = isIconOnly
      ? 'inline-flex items-center justify-center w-8 h-8 rounded-lg text-[13px] font-medium cursor-pointer border-none disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.93] transition-all duration-150 [&>svg]:w-4 [&>svg]:h-4'
      : 'inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-medium cursor-pointer border-none disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.97] transition-all duration-150';

    const isAccent = variant === 'accent';
    const isElevated = variant === 'primary' || isAccent;
    const accentStyle: React.CSSProperties = getAccentStyle(variant, isAccent);
    return (
      <button
        type="button"
        className={`${btnBase} ${btnVariants[variant] || btnVariants.primary}`}
        style={accentStyle}
        disabled={disabled}
        title={tooltip || (isIconOnly ? undefined : undefined)}
        onClick={() => sendAction(action, payload)}
        onMouseEnter={
          isElevated
            ? (e) => {
                (e.currentTarget as HTMLElement).style.boxShadow =
                  'var(--shadow-md), 0 0 30px var(--color-accent-glow)';
              }
            : undefined
        }
        onMouseLeave={
          isElevated
            ? (e) => {
                (e.currentTarget as HTMLElement).style.boxShadow = isAccent
                  ? 'var(--shadow-md), 0 0 24px var(--color-accent-glow)'
                  : 'var(--shadow-sm)';
              }
            : undefined
        }
      >
        {icon &&
          (isIconOnly ? (
            <span dangerouslySetInnerHTML={{ __html: getIcon(icon) }} />
          ) : (
            <span
              className="inline-flex w-4 h-4 [&>svg]:w-4 [&>svg]:h-4"
              dangerouslySetInnerHTML={{ __html: getIcon(icon) }}
            />
          ))}
        {label}
      </button>
    );
  }

  // rcTagPicker extracted to standalone TagPickerComponent (see below)

  function rcNav(c: A2UIComponent) {
    const items = prop(c, 'items') as { id: string; label: string; icon?: string }[];
    const activeId = prop(c, 'activeId') as string;
    const orientation = (prop(c, 'orientation') as string) || 'vertical';
    const navDir = orientation === 'horizontal' ? 'flex-row' : 'flex-col';
    return (
      <nav className={`flex gap-1 items-center ${navDir}`}>
        {items.map((item) => {
          const isActive = item.id === activeId;
          return (
            <button
              key={item.id}
              title={item.label}
              className={`sidebar-nav-btn ${isActive ? 'active' : ''}`}
              onClick={() => sendNavigate(item.id)}
            >
              {item.icon && (
                <span className="sidebar-nav-icon" dangerouslySetInnerHTML={{ __html: getIcon(item.icon) }} />
              )}
            </button>
          );
        })}
      </nav>
    );
  }

  function rcTabs(c: A2UIComponent) {
    const tabs = prop(c, 'tabs') as { id: string; label: string }[];
    const activeTab = prop(c, 'activeTab') as string;
    const contentIds = prop(c, 'contentIds') as Record<string, string>;
    const actionIds = (prop(c, 'actionIds') as string[]) || [];
    return (
      <div>
        <div className="flex border-b border-border gap-0 items-center">
          <div className="flex gap-0 flex-1">
            {tabs.map((tab) => {
              const isActive = tab.id === activeTab;
              return (
                <button
                  key={tab.id}
                  className={`py-3 px-5 bg-transparent border-none text-sm cursor-pointer relative transition-colors duration-normal ${isActive ? 'text-text' : 'text-text-muted hover:text-text-secondary'}`}
                  onClick={() => sendAction('tab_change', { tab: tab.id })}
                >
                  {tab.label}
                  <div
                    className={`absolute bottom-[-1px] left-0 right-0 h-0.5 bg-gradient-to-r from-primary to-accent transition-all duration-normal origin-center ${isActive ? 'opacity-100 scale-x-100' : 'opacity-0 scale-x-0'}`}
                  />
                </button>
              );
            })}
          </div>
          {actionIds.length > 0 && (
            <div className="flex gap-1 px-2">
              {actionIds.map((id) => (
                <React.Fragment key={id}>{renderComponent(id)}</React.Fragment>
              ))}
            </div>
          )}
        </div>
        <div className="pt-4">{contentIds[activeTab] ? renderComponent(contentIds[activeTab]) : null}</div>
      </div>
    );
  }

  function rcProgress(c: A2UIComponent) {
    const value = (prop(c, 'value') as number) || 0;
    const maxValue = (prop(c, 'maxValue') as number) || 100;
    const label = prop(c, 'label') as string;
    const color = (prop(c, 'color') as string) || '#667eea';
    const pct = Math.min(100, (value / maxValue) * 100);
    return (
      <div>
        {label && <div className="text-xs text-text-secondary mb-1.5">{label}</div>}
        <div className="h-2 bg-surface rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-[width] duration-slow"
            style={{ width: `${pct}%`, background: color }}
          />
        </div>
      </div>
    );
  }

  function rcBadge(c: A2UIComponent) {
    const text = prop(c, 'text') as string;
    const variant = (prop(c, 'variant') as string) || 'default';
    const tooltip = prop(c, 'tooltip') as string | undefined;
    const badgeVariants: Record<string, string> = {
      default: 'bg-slate-500/20 text-slate-300',
      success: 'bg-emerald-500/20 text-emerald-400',
      warning: 'bg-amber-500/20 text-amber-400',
      error: 'bg-red-500/20 text-red-400',
      info: 'bg-blue-500/20 text-blue-400',
    };
    const badge = (
      <span
        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${badgeVariants[variant] || badgeVariants.default}`}
      >
        {text}
      </span>
    );
    if (!tooltip) return badge;
    const items = tooltip.split(', ').filter(Boolean);
    return (
      <span className="relative group inline-flex">
        {badge}
        <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-50 hidden group-hover:flex flex-col gap-0.5 min-w-max max-w-56 bg-surface border border-border rounded-lg px-3 py-2 shadow-lg">
          {items.map((item, i) => (
            <span key={i} className="text-xs text-text-secondary whitespace-nowrap leading-5">
              {item}
            </span>
          ))}
        </span>
      </span>
    );
  }

  function rcSkeleton(c: A2UIComponent) {
    const variant = (prop(c, 'variant') as string) || 'rectangular';
    const width = prop(c, 'width') || '100%';
    const height = prop(c, 'height') || (variant === 'text' ? '1em' : '100px');
    const radiusClass = getSkeletonRadiusClass(variant);
    return (
      <div
        className={`bg-gradient-to-r from-white/5 via-white/10 to-white/5 bg-[length:200%_100%] motion-safe:animate-skeleton-shimmer ${radiusClass}`}
        style={{ width: toDimensionStr(width as string | number), height: toDimensionStr(height as string | number) }}
      />
    );
  }

  // ---- Chat Components ----

  function rcChatMessages(c: A2UIComponent) {
    const rawMessages = (prop(c, 'messages') as any[]) || [];
    const streaming = prop(c, 'streaming') as boolean;

    // Empty state: show welcome screen
    if (rawMessages.length === 0 && !streaming) {
      return renderChatWelcome(c, sendAction);
    }

    const avatarBase =
      'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-white [&>svg]:w-4 [&>svg]:h-4';
    const msgBubble =
      'max-w-[85%] sm:max-w-[70%] px-4 sm:px-5 py-3 sm:py-3.5 rounded-2xl leading-relaxed text-[13.5px]';
    const messages = normalizeMessages(rawMessages);
    const thinkingMode = prop(c, 'thinkingMode') as boolean;

    // Render a single message part
    function renderPart(part: MessagePart, partIdx: number) {
      return renderMessagePart(part, partIdx, msgBubble, renderInline);
    }

    return (
      <div
        className="chat-scroll-container flex-1 min-h-0 overflow-y-auto p-6 flex flex-col gap-6"
        onScroll={(e) => {
          if (isAutoScrollingRef.current) {
            return;
          }
          const el = e.currentTarget;
          chatAutoScrollRef.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 80;
        }}
      >
        {messages.map((msg, mi) => {
          if (msg.role === 'user') {
            return renderUserMessage(msg, mi, avatarBase, msgBubble);
          }
          return renderAssistantMessage(
            msg,
            mi,
            messages.length,
            streaming,
            thinkingMode,
            avatarBase,
            msgBubble,
            renderPart
          );
        })}

        {renderQuickReplies(c, streaming, sendAction)}
      </div>
    );
  }

  function rcChatInput(c: A2UIComponent) {
    const streaming = prop(c, 'streaming') as boolean;
    const disabled = prop(c, 'disabled') as boolean;
    const placeholder = (prop(c, 'placeholder') as string) || 'Ask me anything...';
    const actionName = (prop(c, 'action') as string) || 'send_message';
    const clearAction = prop(c, 'clearAction') as string | undefined;
    const stopAction = actionName.startsWith('sa_') ? 'sa_stop_generation' : 'stop_generation';
    return (
      <div className="chat-input-bar flex shrink-0 gap-3 p-4 border-t border-border bg-surface backdrop-blur-[16px]">
        {clearAction && (
          <button
            className="w-10 h-10 rounded-xl border border-border bg-transparent text-text-secondary cursor-pointer flex items-center justify-center shrink-0 [&>svg]:w-4 [&>svg]:h-4 hover:text-text hover:bg-surface-hover hover:border-border-hover transition-all duration-150 active:scale-[0.93]"
            title={i18n.common?.newChat || 'New Chat'}
            onClick={() => sendAction(clearAction)}
            dangerouslySetInnerHTML={{ __html: ICONS['refresh-cw'] }}
          />
        )}
        <input
          type="text"
          className="flex-1 py-2.5 px-4 bg-bg border border-border rounded-xl text-text text-[13.5px] transition-all duration-150 outline-none placeholder:text-text-muted focus:border-primary/50 focus:ring-2 focus:ring-primary/10"
          placeholder={placeholder}
          disabled={disabled}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              const input = e.currentTarget;
              if (input.value.trim()) {
                sendAction(actionName, { content: input.value.trim(), value: input.value.trim() });
                input.value = '';
              }
            }
          }}
        />
        <button
          className={`chat-send-btn w-10 h-10 rounded-xl border-none ${streaming ? 'bg-red-500 hover:bg-red-600' : 'bg-primary'} text-primary-fg cursor-pointer flex items-center justify-center shrink-0 [&>svg]:w-4 [&>svg]:h-4`}
          style={{ boxShadow: 'var(--shadow-sm)' }}
          title={streaming ? 'Stop generating' : 'Send'}
          onMouseEnter={
            !streaming
              ? (e) => {
                  (e.currentTarget as HTMLElement).style.boxShadow =
                    'var(--shadow-md), 0 0 16px var(--color-accent-glow)';
                }
              : undefined
          }
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-sm)';
          }}
          onClick={(e) => {
            if (streaming) {
              sendAction(stopAction, {});
              return;
            }
            const container = (e.target as HTMLElement).closest('.chat-input-bar');
            const input = container?.querySelector('input') as HTMLInputElement;
            if (input?.value.trim()) {
              sendAction(actionName, { content: input.value.trim(), value: input.value.trim() });
              input.value = '';
            }
          }}
          dangerouslySetInnerHTML={{ __html: streaming ? ICONS.square || '■' : ICONS.send }}
        />
      </div>
    );
  }

  function rcAuthOrbs() {
    return (
      <>
        <div
          style={{
            position: 'absolute',
            width: 200,
            height: 200,
            borderRadius: '50%',
            background: 'rgb(var(--color-primary) / 0.12)',
            filter: 'blur(80px)',
            top: '15%',
            left: '10%',
            animation: 'auth-orb 20s ease-in-out infinite',
          }}
        />
        <div
          style={{
            position: 'absolute',
            width: 150,
            height: 150,
            borderRadius: '50%',
            background: 'rgb(var(--color-accent-2) / 0.08)',
            filter: 'blur(60px)',
            bottom: '20%',
            right: '15%',
            animation: 'auth-orb 25s ease-in-out infinite reverse',
          }}
        />
      </>
    );
  }

  function rcAuthLogo() {
    return (
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 16,
          background: 'linear-gradient(135deg, rgb(var(--color-primary)), rgb(var(--color-accent-2)))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          animation: 'auth-float 3s ease-in-out infinite',
          boxShadow: 'var(--shadow-glow)',
          marginBottom: 8,
        }}
      >
        <span
          style={{ color: 'rgb(var(--color-primary-fg))' }}
          className="[&>svg]:w-8 [&>svg]:h-8"
          dangerouslySetInnerHTML={{ __html: getIcon('heart-pulse') }}
        />
      </div>
    );
  }

  function rcAuthFeatures(features: Array<{ icon: string; title: string; desc: string }>) {
    if (!features || features.length === 0) {
      return null;
    }
    return (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 12,
          width: '100%',
          marginBottom: 24,
        }}
      >
        {features.map((f, i) => (
          <div
            key={i}
            style={{
              padding: '16px 12px',
              borderRadius: 16,
              background: 'var(--color-surface-hover)',
              border: '1px solid rgb(var(--color-border))',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
              animation: `auth-feature-enter 0.5s cubic-bezier(0.16, 1, 0.3, 1) ${0.3 + i * 0.1}s backwards`,
            }}
          >
            <span
              style={{ color: 'rgb(var(--color-text-secondary))' }}
              className="[&>svg]:w-5 [&>svg]:h-5"
              dangerouslySetInnerHTML={{ __html: getIcon(f.icon) }}
            />
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'rgb(var(--color-text-strong))' }}>
              {f.title}
            </span>
            <span style={{ fontSize: '0.7rem', color: 'rgb(var(--color-text-muted))', lineHeight: 1.4 }}>{f.desc}</span>
          </div>
        ))}
      </div>
    );
  }

  function rcAuthButton(label: string, action: string) {
    return (
      <button
        onClick={() => sendAction(action)}
        style={{
          width: '100%',
          padding: '14px 24px',
          border: 'none',
          borderRadius: 14,
          cursor: 'pointer',
          fontSize: '0.95rem',
          fontWeight: 600,
          fontFamily: 'inherit',
          color: 'rgb(var(--color-primary-fg))',
          letterSpacing: '-0.01em',
          background: 'linear-gradient(135deg, rgb(var(--color-primary)), rgb(var(--color-accent-2)))',
          boxShadow: 'var(--shadow-glow)',
          animation:
            'glow-pulse 3s ease-in-out infinite, auth-feature-enter 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.6s backwards',
          transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.transform = 'scale(1.02)';
          (e.currentTarget as HTMLElement).style.boxShadow = '0 0 40px var(--color-accent-glow)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.transform = 'scale(1)';
          (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-glow)';
        }}
      >
        {label}
      </button>
    );
  }

  function rcAuthPage(c: A2UIComponent) {
    const title = prop(c, 'title') as string;
    const subtitle = prop(c, 'subtitle') as string;
    const tagline = prop(c, 'tagline') as string;
    const buttonLabel = prop(c, 'buttonLabel') as string;
    const buttonAction = prop(c, 'buttonAction') as string;
    const features = prop(c, 'features') as Array<{ icon: string; title: string; desc: string }>;
    const footer = prop(c, 'footer') as string;

    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgb(var(--color-bg))',
          overflow: 'hidden',
        }}
      >
        {rcAuthOrbs()}

        <div
          style={{
            position: 'relative',
            zIndex: 1,
            maxWidth: 480,
            width: '90%',
            padding: '48px 40px',
            background: 'var(--color-surface-card)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            borderRadius: 24,
            border: '1px solid rgb(var(--color-border))',
            boxShadow: 'var(--shadow-xl)',
            animation: 'auth-card-enter 0.8s cubic-bezier(0.16, 1, 0.3, 1) backwards',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
          }}
        >
          {rcAuthLogo()}

          <h1
            style={{
              fontSize: '2.5rem',
              fontWeight: 800,
              letterSpacing: '-0.04em',
              background:
                'linear-gradient(90deg, rgb(var(--color-primary)), rgb(var(--color-accent-2)), rgb(var(--color-primary)))',
              backgroundSize: '200% auto',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              animation: 'auth-shimmer 4s linear infinite',
              margin: 0,
              lineHeight: 1.2,
            }}
          >
            {title}
          </h1>

          <p
            style={{
              fontSize: '1rem',
              color: 'rgb(var(--color-text))',
              fontWeight: 500,
              margin: 0,
              letterSpacing: '-0.01em',
            }}
          >
            {subtitle}
          </p>

          <p
            style={{
              fontSize: '0.85rem',
              color: 'rgb(var(--color-text-muted))',
              margin: '4px 0 16px',
              lineHeight: 1.5,
            }}
          >
            {tagline}
          </p>

          {rcAuthFeatures(features)}
          {rcAuthButton(buttonLabel, buttonAction)}

          {footer && (
            <p style={{ fontSize: '0.75rem', color: 'rgb(var(--color-text-muted))', margin: '12px 0 0' }}>{footer}</p>
          )}
        </div>
      </div>
    );
  }

  return <>{renderComponent(data.root_id)}</>;
}

// ---- Extracted chat sub-renderers ----

interface NormalizedMsg {
  id: string;
  role: 'user' | 'assistant';
  parts: MessagePart[];
}

const SUGGEST_BTN_CLASS =
  'flex items-center gap-2 px-4 py-2.5 rounded-xl bg-surface-card border border-border text-text-secondary text-[13px] font-medium cursor-pointer transition-all duration-150 hover:border-border-hover hover:bg-surface-hover hover:text-text hover:-translate-y-px';

/** Render the welcome screen (empty chat state) */
function renderChatWelcome(
  c: A2UIComponent,
  sendAction: (action: string, payload?: Record<string, unknown>) => void
): React.ReactNode {
  const welcomeTitle = prop(c, 'welcomeTitle') as string | undefined;
  if (welcomeTitle) {
    return renderCustomWelcome(c, welcomeTitle, sendAction);
  }

  const noWelcome = prop(c, 'noWelcome') as boolean;
  if (noWelcome) {
    return (
      <div className="flex-1 flex items-center justify-center p-4 text-text-muted text-[13px] opacity-50">
        {i18n.evolution?.playgroundChatPlaceholder || 'Waiting for messages...'}
      </div>
    );
  }

  return renderDefaultWelcome(sendAction);
}

/** Render server-driven welcome screen with custom title/actions */
function renderCustomWelcome(
  c: A2UIComponent,
  welcomeTitle: string,
  sendAction: (action: string, payload?: Record<string, unknown>) => void
): React.ReactNode {
  const welcomeSubtitle = prop(c, 'welcomeSubtitle') as string | undefined;
  const welcomeIcon = (prop(c, 'welcomeIcon') as string) || 'bot';
  const welcomeActions = prop(c, 'welcomeActions') as
    | Array<{ label: string; icon?: string; action: string; content: string }>
    | undefined;

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 gap-5 text-center">
      <AnimatedContent distance={20} duration={0.5}>
        <div
          className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center text-primary [&>svg]:w-6 [&>svg]:h-6 mx-auto"
          dangerouslySetInnerHTML={{ __html: ICONS[welcomeIcon] || ICONS.bot }}
        />
      </AnimatedContent>
      <BlurText
        text={welcomeTitle}
        className="text-xl font-bold text-text-strong tracking-tight justify-center"
        delay={80}
        animateBy="words"
        direction="bottom"
      />
      {welcomeSubtitle && (
        <AnimatedContent distance={15} duration={0.5} delay={0.3}>
          <div className="text-[13px] text-text-muted max-w-[380px] leading-relaxed">{welcomeSubtitle}</div>
        </AnimatedContent>
      )}
      {welcomeActions && welcomeActions.length > 0 && (
        <div className="flex flex-wrap gap-2.5 mt-3 justify-center">
          {welcomeActions.map((a, idx) => (
            <AnimatedContent key={idx} distance={20} duration={0.4} delay={0.4 + idx * 0.08}>
              <button
                className={SUGGEST_BTN_CLASS}
                style={{ boxShadow: 'var(--shadow-sm)' }}
                onClick={() => {
                  sendAction((prop(c, 'action') as string) || a.action || 'send_message', {
                    content: a.content,
                    value: a.content,
                  });
                }}
              >
                {a.icon && (
                  <span
                    className="w-4 h-4 [&>svg]:w-4 [&>svg]:h-4"
                    dangerouslySetInnerHTML={{ __html: ICONS[a.icon] || '' }}
                  />
                )}
                {a.label}
              </button>
            </AnimatedContent>
          ))}
        </div>
      )}
    </div>
  );
}

/** Render default welcome screen with built-in suggestions */
function renderDefaultWelcome(
  sendAction: (action: string, payload?: Record<string, unknown>) => void
): React.ReactNode {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 gap-5 text-center">
      <AnimatedContent distance={20} duration={0.5}>
        <div
          className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center text-primary [&>svg]:w-6 [&>svg]:h-6 mx-auto"
          dangerouslySetInnerHTML={{ __html: ICONS.chat }}
        />
      </AnimatedContent>
      <BlurText
        text={i18n.chat.title}
        className="text-xl font-bold text-text-strong tracking-tight justify-center"
        delay={80}
        animateBy="words"
        direction="bottom"
      />
      <AnimatedContent distance={15} duration={0.5} delay={0.3}>
        <div className="text-[13px] text-text-muted max-w-[380px] leading-relaxed">{i18n.chat.subtitle}</div>
      </AnimatedContent>
      <div className="flex flex-wrap gap-2.5 mt-3 justify-center">
        <AnimatedContent distance={20} duration={0.4} delay={0.4}>
          <button
            className={SUGGEST_BTN_CLASS}
            style={{ boxShadow: 'var(--shadow-sm)' }}
            onClick={() => sendAction('send_message', { content: i18n.chat.sleepQuestion })}
          >
            <span className="w-4 h-4 [&>svg]:w-4 [&>svg]:h-4" dangerouslySetInnerHTML={{ __html: ICONS.moon }} />
            {i18n.chat.sleepAnalysis}
          </button>
        </AnimatedContent>
        <AnimatedContent distance={20} duration={0.4} delay={0.48}>
          <button
            className={SUGGEST_BTN_CLASS}
            style={{ boxShadow: 'var(--shadow-sm)' }}
            onClick={() => sendAction('send_message', { content: i18n.chat.activityQuestion })}
          >
            <span className="w-4 h-4 [&>svg]:w-4 [&>svg]:h-4" dangerouslySetInnerHTML={{ __html: ICONS.activity }} />
            {i18n.chat.activitySummary}
          </button>
        </AnimatedContent>
        <AnimatedContent distance={20} duration={0.4} delay={0.56}>
          <button
            className={SUGGEST_BTN_CLASS}
            style={{ boxShadow: 'var(--shadow-sm)' }}
            onClick={() => sendAction('send_message', { content: i18n.chat.heartRateQuestion })}
          >
            <span className="w-4 h-4 [&>svg]:w-4 [&>svg]:h-4" dangerouslySetInnerHTML={{ __html: ICONS.heart }} />
            {i18n.chat.heartRate}
          </button>
        </AnimatedContent>
      </div>
    </div>
  );
}

/** Normalize raw messages into a consistent NormalizedMsg format */
function normalizeMessages(rawMessages: any[]): NormalizedMsg[] {
  const messages: NormalizedMsg[] = [];
  for (const raw of rawMessages) {
    if (raw.parts && raw.parts.length > 0) {
      messages.push({
        id: raw.id || String(messages.length),
        role: raw.role === 'tool' ? 'assistant' : raw.role,
        parts: raw.parts,
      });
    } else if (raw.role === 'tool') {
      const prev = messages[messages.length - 1];
      if (prev && prev.role === 'assistant') {
        prev.parts.push({
          type: 'tool_use',
          toolCallId: String(messages.length),
          toolName: raw.toolName || '',
          status: raw.toolStatus || 'completed',
        });
        if (raw.cards) {
          prev.parts.push({ type: 'tool_result', toolCallId: String(messages.length), cards: raw.cards });
        }
      } else {
        messages.push({
          id: raw.id || String(messages.length),
          role: 'assistant',
          parts: [
            {
              type: 'tool_use',
              toolCallId: String(messages.length),
              toolName: raw.toolName || '',
              status: raw.toolStatus || 'completed',
            },
            ...(raw.cards
              ? [{ type: 'tool_result' as const, toolCallId: String(messages.length), cards: raw.cards }]
              : []),
          ],
        });
      }
    } else {
      const parts: MessagePart[] = [{ type: 'text', content: raw.content || '' }];
      if (raw.cards) {
        parts.push({ type: 'tool_result', toolCallId: 'legacy', cards: raw.cards });
      }
      messages.push({ id: raw.id || String(messages.length), role: raw.role === 'user' ? 'user' : 'assistant', parts });
    }
  }
  return messages;
}

/** Render a single message part (text, tool_use, tool_result) */
function renderMessagePart(
  part: MessagePart,
  partIdx: number,
  msgBubble: string,
  renderInline: (data: { components: A2UIComponent[]; root_id: string }) => React.ReactNode
): React.ReactNode {
  if (part.type === 'text') {
    if (!part.content?.trim()) {
      return null;
    }
    return (
      <div
        key={partIdx}
        className={`${msgBubble} bg-surface-card border border-border`}
        style={{ boxShadow: 'var(--shadow-sm)' }}
      >
        <Markdown>{part.content}</Markdown>
      </div>
    );
  }
  if (part.type === 'tool_use') {
    return renderToolUsePart(part, partIdx);
  }
  if (part.type === 'tool_result' && part.cards) {
    return (
      <div key={partIdx} className="max-w-[90%] sm:max-w-[70%]">
        {renderInline(part.cards as { components: A2UIComponent[]; root_id: string })}
      </div>
    );
  }
  return null;
}

/** Render a tool_use part with status indicator and progress bar */
function renderToolUsePart(part: MessagePart, partIdx: number): React.ReactNode {
  const status = part.status || 'completed';
  const dotClass = getStatusDotClass(status);
  const statusIcon = getStatusIcon(status);
  const displayName = part.displayName || TOOL_DISPLAY_NAMES[part.toolName] || part.toolName;
  const progress = part.progressData;
  const pct = progress && progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
  return (
    <div key={partIdx} className="flex items-center gap-2 text-xs text-text-muted py-1 max-w-[90%] sm:max-w-[70%]">
      <div className={`w-2 h-2 rounded-full ${dotClass} shrink-0`} />
      <span className="truncate">{displayName}</span>
      {progress && progress.total > 0 && (
        <div className="flex items-center gap-1.5 shrink-0 min-w-[100px]">
          <div className="h-1.5 bg-surface rounded-full overflow-hidden flex-1">
            <div
              className={`h-full rounded-full transition-all duration-300 ${getStatusProgressClass(status)}`}
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

/** Render a user message bubble */
function renderUserMessage(msg: NormalizedMsg, index: number, avatarBase: string, msgBubble: string): React.ReactNode {
  const textContent = msg.parts
    .filter((p) => p.type === 'text')
    .map((p) => (p as { type: 'text'; content: string }).content)
    .join('');
  return (
    <div
      key={index}
      className="flex gap-4 flex-row-reverse motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-4 motion-safe:duration-normal"
    >
      <div
        className={`${avatarBase} bg-bg-tertiary text-text-secondary`}
        dangerouslySetInnerHTML={{ __html: ICONS.user }}
      />
      <div className={`${msgBubble} bg-primary/10 text-text border border-primary/20`}>{textContent}</div>
    </div>
  );
}

/** Render an assistant message with avatar and parts */
function renderAssistantMessage(
  msg: NormalizedMsg,
  index: number,
  totalMessages: number,
  streaming: boolean,
  thinkingMode: boolean,
  avatarBase: string,
  msgBubble: string,
  renderPart: (part: MessagePart, partIdx: number) => React.ReactNode
): React.ReactNode {
  const hasVisibleParts = msg.parts.some(
    (p) => (p.type === 'text' && p.content?.trim()) || p.type === 'tool_use' || p.type === 'tool_result'
  );
  const isActiveMsg = streaming && index === totalMessages - 1;

  if (!isActiveMsg && !hasVisibleParts) {
    return null;
  }

  const hasToolCalls = msg.parts.some((p) => p.type === 'tool_use');

  return (
    <div
      key={index}
      className="flex gap-4 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-left-4 motion-safe:duration-normal"
    >
      <div className="relative self-start shrink-0">
        {isActiveMsg && (
          <div
            className="absolute inset-0 rounded-lg bg-primary/20"
            style={{ animation: 'agent-breathe-ring 2s ease-out infinite' }}
          />
        )}
        <div
          className={`${avatarBase} bg-primary`}
          style={isActiveMsg ? { animation: 'agent-breathe 2.5s ease-in-out infinite' } : undefined}
          dangerouslySetInnerHTML={{ __html: ICONS.bot }}
        />
      </div>
      <div className="flex flex-col gap-2 min-w-0 flex-1">
        {thinkingMode && hasToolCalls ? (
          <ThinkingMessage
            parts={msg.parts}
            isActiveMsg={isActiveMsg}
            renderPartFn={renderPart}
            msgBubble={msgBubble}
          />
        ) : (
          <AssistantMessageParts
            parts={msg.parts}
            isActiveMsg={isActiveMsg}
            hasVisibleParts={hasVisibleParts}
            msgBubble={msgBubble}
            renderPart={renderPart}
          />
        )}
      </div>
    </div>
  );
}

/** Render assistant message parts (non-thinking mode) with typing indicator */
function AssistantMessageParts({
  parts,
  isActiveMsg,
  hasVisibleParts,
  msgBubble,
  renderPart,
}: {
  parts: MessagePart[];
  isActiveMsg: boolean;
  hasVisibleParts: boolean;
  msgBubble: string;
  renderPart: (part: MessagePart, partIdx: number) => React.ReactNode;
}) {
  return (
    <>
      {parts.map((part, pi) => {
        if (isActiveMsg && part.type === 'text' && part.content?.trim() && pi === parts.length - 1) {
          return (
            <div
              key={pi}
              className={`${msgBubble} bg-surface-card border border-border`}
              style={{ boxShadow: 'var(--shadow-sm)', animation: 'stream-border-pulse 2s ease-in-out infinite' }}
            >
              <Markdown>{part.content}</Markdown>
            </div>
          );
        }
        return renderPart(part, pi);
      })}
      {isActiveMsg && !hasVisibleParts && <TypingIndicator />}
    </>
  );
}

/** Typing indicator dots */
function TypingIndicator() {
  return (
    <div
      className="inline-flex gap-1.5 items-center px-4 py-3 rounded-2xl bg-surface-card border border-border self-start"
      style={{ boxShadow: 'var(--shadow-sm)' }}
    >
      <div
        className="w-2 h-2 rounded-full bg-primary/60 motion-safe:animate-bounce-dot"
        style={{ animationDelay: '0s' }}
      />
      <div
        className="w-2 h-2 rounded-full bg-primary/60 motion-safe:animate-bounce-dot"
        style={{ animationDelay: '0.2s' }}
      />
      <div
        className="w-2 h-2 rounded-full bg-primary/60 motion-safe:animate-bounce-dot"
        style={{ animationDelay: '0.4s' }}
      />
    </div>
  );
}

/** Render quick reply buttons after the last message */
function renderQuickReplies(
  c: A2UIComponent,
  streaming: boolean,
  sendAction: (action: string, payload?: Record<string, unknown>) => void
): React.ReactNode {
  if (streaming) {
    return null;
  }
  const quickReplies = prop(c, 'quickReplies') as
    | Array<{ label: string; content: string; icon?: string; variant?: string }>
    | undefined;
  if (!quickReplies || quickReplies.length === 0) {
    return null;
  }

  const actionName = (prop(c, 'action') as string) || 'send_message';
  return (
    <div className="flex gap-2 pl-13 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-normal">
      {quickReplies.map((qr, i) => (
        <button
          key={i}
          className={`quick-reply-btn flex items-center gap-1.5 px-4 py-2 rounded-2xl text-sm font-medium cursor-pointer transition-all duration-fast border ${getQuickReplyVariantClass(qr.variant)}`}
          onClick={() => sendAction(actionName, { content: qr.content, value: qr.content })}
        >
          {qr.icon && (
            <span
              className="w-4 h-4 [&>svg]:w-4 [&>svg]:h-4"
              dangerouslySetInnerHTML={{ __html: ICONS[qr.icon] || '' }}
            />
          )}
          {qr.label}
        </button>
      ))}
    </div>
  );
}

// Helper: get trend direction arrow
function getTrendArrow(direction: string): string {
  if (direction === 'up') {
    return '↑';
  }
  if (direction === 'down') {
    return '↓';
  }
  return '→';
}

// Helper: get skeleton border radius class
function getSkeletonRadiusClass(variant: string): string {
  if (variant === 'circular') {
    return 'rounded-full';
  }
  if (variant === 'text') {
    return 'rounded';
  }
  return 'rounded-xl';
}

// Helper: get dimension string (number → px, string → as-is)
function toDimensionStr(value: string | number): string {
  return typeof value === 'number' ? value + 'px' : String(value);
}

// Helper: get status dot class for tool_use
function getStatusDotClass(status: string): string {
  if (status === 'running') {
    return 'bg-primary motion-safe:animate-pulse';
  }
  if (status === 'error') {
    return 'bg-error';
  }
  return 'bg-success';
}

// Helper: get status icon HTML for tool_use
function getStatusIcon(status: string): React.ReactNode {
  if (status === 'running') {
    return <span className="tool-spinner" />;
  }
  if (status === 'error') {
    return <span className="text-error [&>svg]:w-3 [&>svg]:h-3" dangerouslySetInnerHTML={{ __html: ICONS.x }} />;
  }
  return <span className="text-success [&>svg]:w-3 [&>svg]:h-3" dangerouslySetInnerHTML={{ __html: ICONS.check }} />;
}

// Helper: get status progress bar class for tool_use
function getStatusProgressClass(status: string): string {
  if (status === 'running') {
    return 'bg-primary animate-status-pulse';
  }
  if (status === 'error') {
    return 'bg-error';
  }
  return 'bg-success';
}

// Helper: get quick reply variant class
function getQuickReplyVariantClass(variant: string | undefined): string {
  if (variant === 'danger') {
    return 'border-error/30 text-error bg-error/10 hover:bg-error/20 hover:border-error/50';
  }
  if (variant === 'primary') {
    return 'border-primary/30 text-primary bg-primary/10 hover:bg-primary/20 hover:border-primary/50';
  }
  return 'border-border text-text-secondary bg-surface hover:bg-surface-hover hover:border-border-hover';
}

// Helper: get accent button style
function getAccentStyle(variant: string, isAccent: boolean): React.CSSProperties {
  if (isAccent) {
    return {
      background: 'linear-gradient(135deg, rgb(var(--color-primary)), rgb(var(--color-accent-2)))',
      boxShadow: 'var(--shadow-md), 0 0 24px var(--color-accent-glow)',
    };
  }
  if (variant === 'primary') {
    return { boxShadow: 'var(--shadow-sm)' };
  }
  return {};
}

// Helper: parse inline style string to React CSSProperties
function parseStyle(styleStr: string): React.CSSProperties {
  const style: Record<string, string> = {};
  for (const part of styleStr.split(';')) {
    const [key, ...vals] = part.split(':');
    if (key && vals.length) {
      const camelKey = key.trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      style[camelKey] = vals.join(':').trim();
    }
  }
  return style as React.CSSProperties;
}

// ============================================================================
// TagPickerComponent — standalone React component (proper hooks support)
// ============================================================================
function TagPickerComponent({
  c,
  sendAction,
}: {
  c: A2UIComponent;
  sendAction: (action: string, payload?: Record<string, unknown>) => void;
}) {
  const selected = (prop(c, 'selected') as string[]) || [];
  const options = (prop(c, 'options') as string[]) || [];
  const onToggle = prop(c, 'onToggle') as string;
  const basePayload = (prop(c, 'payload') as Record<string, unknown>) || {};
  const placeholder = (prop(c, 'placeholder') as string) || '...';
  const label = (prop(c, 'label') as string) || '';
  const [open, setOpen] = React.useState(false);
  const [customVal, setCustomVal] = React.useState('');
  const dropRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const [dropPos, setDropPos] = React.useState<{ top: number; left: number }>({ top: 0, left: 0 });

  React.useEffect(() => {
    if (!open) {
      return;
    }
    const handler = (e: MouseEvent) => {
      if (
        dropRef.current &&
        !dropRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Calculate dropdown position when opening
  React.useEffect(() => {
    if (open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropPos({ top: rect.bottom + 4, left: rect.left });
    }
  }, [open]);

  const allTags = React.useMemo(() => [...new Set([...options, ...selected])].sort(), [options, selected]);

  const handleToggle = (tag: string) => {
    const isSelected = selected.includes(tag);
    sendAction(onToggle, { ...basePayload, tag, action: isSelected ? 'remove' : 'add' });
  };
  const handleCustomAdd = () => {
    const v = customVal.trim();
    if (v && !selected.includes(v)) {
      sendAction(onToggle, { ...basePayload, tag: v, action: 'add' });
    }
    setCustomVal('');
  };

  // Custom check icon SVG
  const checkSvg = `<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3 8l3.5 3.5L13 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  return (
    <div className="relative">
      {label && <div className="text-xs text-text-muted mb-1">{label}</div>}
      <div className="flex flex-wrap items-center gap-1.5">
        {selected.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-xs font-medium"
          >
            {tag}
            <button
              type="button"
              className="hover:text-red-500 transition-colors cursor-pointer bg-transparent border-none p-0 text-current"
              onClick={() => handleToggle(tag)}
            >
              <span className="text-[10px]">&times;</span>
            </button>
          </span>
        ))}
        <button
          ref={triggerRef}
          type="button"
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-dashed border-border text-xs text-text-muted cursor-pointer bg-transparent hover:border-primary hover:text-primary transition-colors"
          onClick={() => setOpen(!open)}
        >
          <span className="text-[11px]">+</span> {placeholder}
        </button>
      </div>
      {open &&
        ReactDOM.createPortal(
          <div
            ref={dropRef}
            className="fixed z-[9999] w-64 bg-surface border border-border rounded-lg shadow-lg overflow-hidden"
            style={{ top: dropPos.top, left: dropPos.left, boxShadow: 'var(--shadow-lg)' }}
          >
            <div className="p-2 border-b border-border">
              <input
                type="text"
                value={customVal}
                onChange={(e) => setCustomVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleCustomAdd();
                  }
                }}
                placeholder={placeholder}
                className="w-full px-2 py-1.5 text-xs rounded-md border border-border bg-surface-hover text-text outline-none focus:border-primary"
              />
            </div>
            <div className="max-h-48 overflow-y-auto p-1">
              {allTags.map((tag) => {
                const checked = selected.includes(tag);
                return (
                  <div
                    key={tag}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-xs cursor-pointer transition-colors ${checked ? 'bg-primary/8' : 'hover:bg-surface-hover'}`}
                    onClick={() => handleToggle(tag)}
                  >
                    <span
                      className={`inline-flex items-center justify-center w-4 h-4 rounded border transition-all duration-150 ${checked ? 'bg-primary border-primary text-white' : 'border-border bg-transparent'}`}
                    >
                      {checked && <span dangerouslySetInnerHTML={{ __html: checkSvg }} />}
                    </span>
                    <span className={checked ? 'text-text font-medium' : 'text-text-muted'}>{tag}</span>
                  </div>
                );
              })}
              {customVal.trim() && !allTags.includes(customVal.trim()) && (
                <div
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs cursor-pointer hover:bg-surface-hover transition-colors text-primary"
                  onClick={handleCustomAdd}
                >
                  <span>+</span>
                  <span>&ldquo;{customVal.trim()}&rdquo;</span>
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
