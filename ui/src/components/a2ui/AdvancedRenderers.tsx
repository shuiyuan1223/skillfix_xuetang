import React from 'react';
import type { A2UIComponent } from '../../lib/types';
import { prop, getChildren } from '../../lib/types';
import { ICONS, getIcon } from '../../lib/icons';
import type { RenderContext } from './A2UIRenderer';
import {
  ResponsiveContainer,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Tooltip,
  Legend,
} from 'recharts';

// ---- Shared Helper Functions ----

/** Map a diff line type to its prefix symbol */
function diffLineSymbol(type: string): string {
  if (type === 'add') {
    return '+';
  }
  if (type === 'remove') {
    return '-';
  }
  if (type === 'hunk') {
    return '@@';
  }
  return ' ';
}

/** Map a score to a CSS class: high / mid / low */
function scoreClass(s: number): string {
  if (s >= 0.9) {
    return 'score-high';
  }
  if (s >= 0.7) {
    return 'score-mid';
  }
  return 'score-low';
}

/** Map a score to a hex color */
function scoreColor(s: number): string {
  if (s >= 0.9) {
    return '#4ade80';
  }
  if (s >= 0.7) {
    return '#fbbf24';
  }
  return '#f87171';
}

/** Map step status to the circle CSS class */
function stepCircleClass(status: string): string {
  if (status === 'completed') {
    return 'bg-emerald-500 border-emerald-500 text-white shadow-[0_0_12px_rgba(16,185,129,0.4)]';
  }
  if (status === 'active') {
    return 'bg-indigo-500 border-indigo-500 text-white ring-4 ring-indigo-500/30 shadow-[0_0_20px_rgba(99,102,241,0.5)]';
  }
  if (status === 'failed') {
    return 'bg-red-500 border-red-500 text-white';
  }
  if (status === 'skipped') {
    return 'bg-transparent border-slate-600 border-dashed text-slate-500';
  }
  return 'bg-transparent border-slate-600 text-slate-500';
}

/** Map step status to the label CSS class */
function stepLabelClass(status: string): string {
  if (status === 'active') {
    return 'text-indigo-400 font-semibold';
  }
  if (status === 'completed') {
    return 'text-emerald-400 font-medium';
  }
  return 'text-slate-500 font-medium';
}

/** Map step status to size class */
function stepSizeClass(status: string): string {
  return status === 'active' ? 'w-12 h-12' : 'w-9 h-9';
}

/** Map step status to icon size class */
function stepIconSize(status: string): string {
  return status === 'active' ? 'w-5 h-5' : 'w-4 h-4';
}

/** Map evolution version status to dot color */
function versionDotColor(status: string): string {
  if (status === 'active') {
    return 'rgb(var(--color-primary))';
  }
  if (status === 'merged') {
    return 'rgb(var(--color-success))';
  }
  return 'rgb(var(--color-text-muted))';
}

/** Map recommendation to badge CSS class */
function recommendationBadgeClass(recommendation: string): string {
  if (recommendation === 'merge') {
    return 'bg-emerald-500/15 text-emerald-400';
  }
  if (recommendation === 'revert') {
    return 'bg-red-500/15 text-red-400';
  }
  return 'bg-amber-500/15 text-amber-400';
}

/** Build connector className for step indicator (horizontal vs vertical) */
function stepConnectorClass(isH: boolean, connectorDone: boolean): string {
  const layout = isH ? 'h-1 flex-1 min-w-[24px] rounded-full' : 'w-1 h-8 ml-[17px] rounded-full';
  const color = connectorDone ? 'bg-gradient-to-r from-emerald-500 to-indigo-500' : 'bg-slate-700';
  return `${layout} ${color} transition-colors`;
}

/** Build step container className */
function stepContainerClass(isH: boolean, clickable: boolean | string | undefined): string {
  const layout = isH ? 'flex-col' : 'flex-row';
  const gap = isH ? 'gap-2' : 'gap-3';
  const cursor = clickable ? 'cursor-pointer' : '';
  return `flex ${layout} items-center ${gap} ${cursor}`;
}

/** Render the icon content inside a step circle */
function renderStepIcon(step: any, iconSizeCls: string, index: number): React.ReactNode {
  if (step.status === 'completed') {
    return <span className={iconSizeCls} dangerouslySetInnerHTML={{ __html: getIcon('check') }} />;
  }
  if (step.icon) {
    return <span className={iconSizeCls} dangerouslySetInnerHTML={{ __html: getIcon(step.icon as string) }} />;
  }
  return <span>{index + 1}</span>;
}

/** Compute relative time string from a timestamp */
function relativeTimeStr(ts: number | string): string {
  const d = typeof ts === 'string' ? new Date(ts).getTime() : ts;
  const diff = Date.now() - d;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) {
    return 'just now';
  }
  if (mins < 60) {
    return `${mins}m ago`;
  }
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) {
    return `${hrs}h ago`;
  }
  const days = Math.floor(hrs / 24);
  if (days < 30) {
    return `${days}d ago`;
  }
  return `${Math.floor(days / 30)}mo ago`;
}

// ---- Code Editor ----
export function renderCodeEditor(c: A2UIComponent, ctx: RenderContext) {
  const value = prop(c, 'value') as string;
  const readonly = prop(c, 'readonly') as boolean;
  const height = prop(c, 'height') || 400;
  const lineNumbers = prop(c, 'lineNumbers') !== false;
  const lines = value.split('\n');

  let highlightedHtml = '';
  if (readonly) {
    // Simple HTML escaping fallback (hljs can be added later)
    highlightedHtml = value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  const lineNumbersEl = lineNumbers ? (
    <div className="code-line-numbers" id={`code-ln-${c.id || 'default'}`}>
      {lines.map((_, i) => (
        <div key={i}>{i + 1}</div>
      ))}
    </div>
  ) : null;

  const syncScroll = lineNumbers
    ? (e: React.UIEvent) => {
        const el = e.currentTarget as HTMLElement;
        const ln = el.closest('.code-editor-container')?.querySelector('.code-line-numbers') as HTMLElement | null;
        if (ln) {
          ln.scrollTop = el.scrollTop;
        }
      }
    : undefined;

  if (readonly) {
    return (
      <div className="code-editor-container" style={{ height: typeof height === 'number' ? height + 'px' : height }}>
        {lineNumbersEl}
        <pre className="code-highlight" onScroll={syncScroll}>
          <code className="hljs" dangerouslySetInnerHTML={{ __html: highlightedHtml }} />
        </pre>
      </div>
    );
  }

  // Track IME composition state
  const [isComposing, setIsComposing] = React.useState(false);

  return (
    <div className="code-editor-container" style={{ height: typeof height === 'number' ? height + 'px' : height }}>
      {lineNumbersEl}
      <textarea
        key={c.id}
        className="code-textarea"
        spellCheck={false}
        defaultValue={value}
        onCompositionStart={() => setIsComposing(true)}
        onCompositionEnd={(e) => {
          setIsComposing(false);
          // Send action after composition ends
          const onChange = prop(c, 'onChange');
          if (onChange) {
            ctx.sendAction(onChange as string, { value: (e.target as HTMLTextAreaElement).value });
          }
        }}
        onChange={(e) => {
          // Only send action if not composing (IME input)
          if (!isComposing) {
            const onChange = prop(c, 'onChange');
            if (onChange) {
              ctx.sendAction(onChange as string, { value: e.target.value });
            }
          }
        }}
        onScroll={syncScroll}
      />
    </div>
  );
}

// ---- Commit List ----
export function renderCommitList(c: A2UIComponent, ctx: RenderContext) {
  const commits = prop(c, 'commits') as {
    hash: string;
    shortHash: string;
    message: string;
    date: string;
    author: string;
  }[];
  const selectedHash = prop(c, 'selectedHash') as string;
  return (
    <div className="flex flex-col gap-1">
      {commits.map((commit) => (
        <div
          key={commit.hash}
          className={`p-3 rounded-lg cursor-pointer transition-all duration-fast border border-transparent hover:bg-surface-hover ${commit.hash === selectedHash ? 'bg-primary/10 border-primary/30' : ''}`}
          onClick={() => {
            const onSelect = prop(c, 'onSelect');
            if (onSelect) ctx.sendAction(onSelect as string, { hash: commit.hash });
          }}
        >
          <div className="font-mono text-xs text-primary">{commit.shortHash}</div>
          <div className="text-sm text-text mt-0.5">{commit.message}</div>
          <div className="flex gap-3 mt-1 text-xs text-text-muted">
            <span>{commit.date}</span>
            <span>{commit.author}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---- Diff View ----
export function renderDiffView(c: A2UIComponent, ctx: RenderContext) {
  const before = prop(c, 'before') as string;
  const after = prop(c, 'after') as string;
  const title = prop(c, 'title') as string;
  const unifiedDiff = prop(c, 'unifiedDiff') as string | undefined;

  if (unifiedDiff) {
    return renderUnifiedDiff(title, unifiedDiff);
  }

  const beforeLines = before.split('\n');
  const afterLines = after.split('\n');
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      {title && (
        <div className="px-4 py-2 text-sm font-medium text-text border-b border-border bg-surface">{title}</div>
      )}
      <div className="grid grid-cols-2">
        <div className="border-r border-border">
          <div className="px-4 py-2 text-xs font-medium text-text-muted bg-surface border-b border-border">Before</div>
          <div className="font-mono text-xs">
            {beforeLines.map((line, i) => (
              <div key={i} className={`flex ${afterLines[i] !== line ? 'bg-red-500/10' : ''}`}>
                <span className="w-10 text-right pr-2 text-text-muted select-none shrink-0 py-px">{i + 1}</span>
                <span className="flex-1 py-px px-2 whitespace-pre">{line || ' '}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="px-4 py-2 text-xs font-medium text-text-muted bg-surface border-b border-border">After</div>
          <div className="font-mono text-xs">
            {afterLines.map((line, i) => (
              <div key={i} className={`flex ${beforeLines[i] !== line ? 'bg-emerald-500/10' : ''}`}>
                <span className="w-10 text-right pr-2 text-text-muted select-none shrink-0 py-px">{i + 1}</span>
                <span className="flex-1 py-px px-2 whitespace-pre">{line || ' '}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function renderUnifiedDiff(title: string, diff: string) {
  const lines = diff.split('\n');
  const bodyLines: { text: string; type: 'add' | 'remove' | 'context' | 'hunk' }[] = [];
  for (const line of lines) {
    if (line.startsWith('@@')) {
      bodyLines.push({ text: line, type: 'hunk' });
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      bodyLines.push({ text: line, type: 'add' });
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      bodyLines.push({ text: line, type: 'remove' });
    } else if (
      line.startsWith('diff ') ||
      line.startsWith('index ') ||
      line.startsWith('---') ||
      line.startsWith('+++')
    ) {
      /* skip */
    } else {
      bodyLines.push({ text: line, type: 'context' });
    }
  }
  const lineClass = (type: string) => {
    switch (type) {
      case 'add':
        return 'bg-emerald-500/20 text-emerald-300';
      case 'remove':
        return 'bg-red-500/20 text-red-300';
      case 'hunk':
        return 'bg-blue-500/10 text-blue-400';
      default:
        return '';
    }
  };
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      {title && (
        <div className="px-4 py-2 text-sm font-medium text-text border-b border-border bg-surface">{title}</div>
      )}
      <div className="font-mono text-xs overflow-x-auto max-h-[600px] overflow-y-auto">
        {bodyLines.map((l, i) => (
          <div key={i} className={`flex ${lineClass(l.type)}`}>
            <span className="w-8 text-center text-text-muted select-none shrink-0 py-px opacity-60">
              {diffLineSymbol(l.type)}
            </span>
            <span className="flex-1 py-px px-2 whitespace-pre">
              {l.type === 'hunk' ? l.text : l.text.slice(1) || ' '}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Data Table ----

const BADGE_VARIANTS: Record<string, string> = {
  success: 'bg-emerald-500/20 text-emerald-400',
  error: 'bg-red-500/20 text-red-400',
  failed: 'bg-red-500/20 text-red-400',
  warning: 'bg-amber-500/20 text-amber-400',
  pending: 'bg-amber-500/20 text-amber-400',
  view: 'bg-blue-500/15 text-blue-500',
  selected: 'bg-emerald-500/15 text-emerald-500',
  info: 'bg-blue-500/15 text-blue-500',
  // Chinese locale variants
  '启用': 'bg-emerald-500/20 text-emerald-400',
  '禁用': 'bg-red-500/20 text-red-400',
  enabled: 'bg-emerald-500/20 text-emerald-400',
  disabled: 'bg-red-500/20 text-red-400',
};

function renderTableCell(value: unknown, render?: string): React.ReactNode {
  if (render === 'badge') {
    const status = String(value).toLowerCase();
    const cls = BADGE_VARIANTS[status] || 'bg-slate-500/15 text-slate-600 dark:text-slate-300';
    return (
      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${cls}`}>
        {String(value)}
      </span>
    );
  }
  if (render === 'progress') {
    return renderProgressCell(value);
  }
  if (render === 'date') {
    return new Date(Number(value)).toLocaleString();
  }
  if (render === 'link') {
    const text = String(value ?? '');
    if (!text || text === '-') {
      return text;
    }
    return (
      <span className="text-primary underline underline-offset-2 decoration-primary/40 hover:decoration-primary">
        {text}
      </span>
    );
  }
  return String(value ?? '');
}

function renderProgressCell(value: unknown): React.ReactNode {
  const str = String(value);
  let num: number;
  let barCls = 'bg-primary';
  let anim = '';
  if (str.includes('|')) {
    const [n, v] = str.split('|');
    num = Number(n) || 0;
    if (v === 'success') {
      barCls = 'bg-success';
    } else if (v === 'error') {
      barCls = 'bg-error';
    } else if (v === 'running') {
      anim = 'animate-status-pulse';
    }
  } else {
    num = Number(str) || 0;
  }
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 bg-surface rounded-full overflow-hidden flex-1 min-w-[48px]">
        <div className={`h-full rounded-full ${barCls} ${anim}`} style={{ width: `${Math.max(num, 3)}%` }} />
      </div>
      <span className="text-xs text-text-muted whitespace-nowrap">{num}%</span>
    </div>
  );
}

function renderTablePagination(
  pagination: { page: number; pageSize: number; total: number },
  onPageChange: string | undefined,
  ctx: RenderContext,
) {
  const paginationBtnCls =
    'px-3 py-1.5 rounded-lg border border-border bg-transparent text-text-secondary text-xs cursor-pointer transition-all hover:bg-surface-hover disabled:opacity-40';
  return (
    <div className="flex items-center justify-between px-3 py-3 border-t border-border text-xs text-text-muted">
      <span>
        Page {pagination.page + 1} of {Math.ceil(pagination.total / pagination.pageSize)} ({pagination.total} items)
      </span>
      <div className="flex gap-2">
        <button
          className={paginationBtnCls}
          disabled={pagination.page === 0}
          onClick={() => {
            if (onPageChange) {
              ctx.sendAction(onPageChange, { page: pagination.page - 1 });
            }
          }}
        >
          ←
        </button>
        <button
          className={paginationBtnCls}
          disabled={(pagination.page + 1) * pagination.pageSize >= pagination.total}
          onClick={() => {
            if (onPageChange) {
              ctx.sendAction(onPageChange, { page: pagination.page + 1 });
            }
          }}
        >
          →
        </button>
      </div>
    </div>
  );
}

export function renderDataTable(c: A2UIComponent, ctx: RenderContext) {
  const columns = prop(c, 'columns') as {
    key: string;
    label: string;
    width?: string;
    sortable?: boolean;
    render?: string;
    action?: string;
  }[];
  const rows = prop(c, 'rows') as Record<string, unknown>[];
  const pagination = prop(c, 'pagination') as { page: number; pageSize: number; total: number } | undefined;
  const sortBy = prop(c, 'sortBy') as string;
  const sortOrder = (prop(c, 'sortOrder') as string) || 'asc';
  const onSort = prop(c, 'onSort') as string | undefined;
  const onRowClick = prop(c, 'onRowClick') as string | undefined;
  const onPageChange = prop(c, 'onPageChange') as string | undefined;

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                style={col.width ? { width: col.width } : undefined}
                className={`p-3 text-left text-xs font-medium uppercase text-text-muted border-b border-border ${col.sortable ? 'cursor-pointer hover:text-text' : ''}`}
                onClick={() => {
                  if (col.sortable && onSort) {
                    ctx.sendAction(onSort, {
                      sortBy: col.key,
                      sortOrder: sortBy === col.key && sortOrder === 'asc' ? 'desc' : 'asc',
                    });
                  }
                }}
              >
                {col.label}
                {col.sortable && sortBy === col.key && (
                  <span className="ml-1 text-primary">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className={`border-b border-border transition-colors hover:bg-primary/5 ${onRowClick ? 'cursor-pointer' : ''}`}
              onClick={() => {
                if (onRowClick) {
                  ctx.sendAction(onRowClick, { row });
                }
              }}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`p-3 max-w-[300px] ${col.action && row[col.key] && String(row[col.key]) !== '-' ? 'cursor-pointer' : ''}`}
                  title={String(row[col.key] ?? '')}
                  onClick={
                    col.action && row[col.key] && String(row[col.key]) !== '-'
                      ? (e) => {
                          e.stopPropagation();
                          ctx.sendAction(col.action!, { row, value: row[col.key] });
                        }
                      : undefined
                  }
                >
                  <span className="block truncate">{renderTableCell(row[col.key], col.render)}</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {pagination && renderTablePagination(pagination, onPageChange, ctx)}
    </div>
  );
}

// ---- Score Gauge ----
export function renderScoreGauge(c: A2UIComponent, _ctx: RenderContext) {
  const value = (prop(c, 'value') as number) || 0;
  const max = (prop(c, 'max') as number) || 100;
  const label = prop(c, 'label') as string;
  const showValue = prop(c, 'showValue') !== false;
  const size = (prop(c, 'size') as string) || 'md';
  const defaultThresholds =
    max <= 1
      ? [
          { value: 0.3, color: '#ef4444' },
          { value: 0.6, color: '#f59e0b' },
          { value: 1.0, color: '#10b981' },
        ]
      : [
          { value: 30, color: '#ef4444' },
          { value: 60, color: '#f59e0b' },
          { value: 100, color: '#10b981' },
        ];
  const thresholds = (prop(c, 'thresholds') as { value: number; color: string }[]) || defaultThresholds;
  const pct = Math.min(100, (value / max) * 100);
  let color = thresholds[thresholds.length - 1]?.color || '#667eea';
  for (const t of thresholds) {
    if (value <= t.value) {
      color = t.color;
      break;
    }
  }
  const sizeMap: Record<string, number> = { sm: 80, md: 120, lg: 160 };
  const diameter = sizeMap[size] || 120;
  const strokeWidth = diameter / 10;
  const radius = (diameter - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (pct / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center" style={{ width: diameter, height: diameter }}>
      <svg viewBox={`0 0 ${diameter} ${diameter}`}>
        <circle className="gauge-bg" cx={diameter / 2} cy={diameter / 2} r={radius} strokeWidth={strokeWidth} />
        <circle
          className="gauge-fill"
          cx={diameter / 2}
          cy={diameter / 2}
          r={radius}
          strokeWidth={strokeWidth}
          stroke={color}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${diameter / 2} ${diameter / 2})`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {showValue && (
          <div className="text-2xl font-bold" style={{ color }}>
            {max <= 1 ? (Math.floor(value * 1000) / 1000).toString() : Math.round(value)}
          </div>
        )}
        {label && <div className="text-[10px] text-text-muted mt-0.5">{label}</div>}
      </div>
    </div>
  );
}

// ---- Activity Rings ----
export function renderActivityRings(c: A2UIComponent, _ctx: RenderContext) {
  const rings = (prop(c, 'rings') as Array<{ value: number; max: number; label: string; color: string }>) || [];
  const size = (prop(c, 'size') as number) || 200;
  const center = size / 2;
  const strokeWidth = size / 11;
  const gap = strokeWidth * 0.35;

  return (
    <div className="flex items-center gap-6">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        {rings.map((ring, i) => {
          const radius = center - strokeWidth / 2 - i * (strokeWidth + gap);
          if (radius <= 0) {
            return null;
          }
          const circumference = 2 * Math.PI * radius;
          const pct = Math.min(ring.value / ring.max, 1);
          const dashOffset = circumference - pct * circumference;
          return (
            <React.Fragment key={i}>
              <circle
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={ring.color + '30'}
                strokeWidth={strokeWidth}
              />
              <circle
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={ring.color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeDasharray={circumference}
                transform={`rotate(-90 ${center} ${center})`}
                className="ring-fill"
                style={{
                  strokeDashoffset: dashOffset,
                  ['--ring-circ' as any]: circumference,
                  animationDelay: `${i * 200}ms`,
                }}
              />
            </React.Fragment>
          );
        })}
      </svg>
      <div className="flex flex-col gap-2">
        {rings.map((ring, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: ring.color }} />
            <span className="text-text-secondary">{ring.label}</span>
            <span className="font-semibold ml-auto" style={{ color: ring.color }}>
              {Math.min(100, Math.round((ring.value / ring.max) * 100))}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Status Badge ----
export function renderStatusBadge(c: A2UIComponent, _ctx: RenderContext) {
  const status = prop(c, 'status') as string;
  const label = (prop(c, 'label') as string) || status;
  const pulse = prop(c, 'pulse') as boolean;
  const statusIcons: Record<string, string> = {
    pending: 'loader',
    running: 'loader',
    success: 'check',
    failed: 'x',
    warning: 'alert-triangle',
  };
  const statusColors: Record<string, string> = {
    pending: 'bg-slate-500/20 text-slate-400',
    running: 'bg-blue-500/20 text-blue-400',
    success: 'bg-emerald-500/20 text-emerald-400',
    failed: 'bg-red-500/20 text-red-400',
    warning: 'bg-amber-500/20 text-amber-400',
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${statusColors[status] || statusColors.pending} ${pulse ? 'motion-safe:animate-status-pulse' : ''}`}
    >
      <span className="w-4 h-4" dangerouslySetInnerHTML={{ __html: ICONS[statusIcons[status]] || '•' }} />
      <span>{label}</span>
    </span>
  );
}

// ---- Collapsible ----
export function renderCollapsible(c: A2UIComponent, ctx: RenderContext) {
  const title = prop(c, 'title') as string;
  const expanded = prop(c, 'expanded') !== false;
  const icon = prop(c, 'icon') as string;
  return (
    <div className={`collapsible-group ${expanded ? 'is-open' : ''}`}>
      <button
        className="flex items-center gap-2 w-full p-3 bg-transparent border-none text-text text-sm cursor-pointer rounded-lg transition-colors hover:bg-surface-hover text-left"
        onClick={(e) => {
          (e.currentTarget as HTMLElement).parentElement?.classList.toggle('is-open');
        }}
      >
        {icon && <span>{icon}</span>}
        <span className="font-medium flex-1">{title}</span>
        <span className="text-text-muted transition-transform duration-normal [.is-open>button>&]:rotate-90">▶</span>
      </button>
      <div className="collapsible-grid pl-4">
        <div className="flex flex-col gap-3">{ctx.renderChildren(getChildren(c))}</div>
      </div>
    </div>
  );
}

// ---- Modal Component ----
export function renderModalComponent(c: A2UIComponent, ctx: RenderContext) {
  const title = prop(c, 'title') as string;
  const size = (prop(c, 'size') as string) || 'md';
  const closable = prop(c, 'closable') !== false;
  const onClose = prop(c, 'onClose') as string | undefined;
  const modalSizes: Record<string, string> = {
    sm: 'max-w-[400px] w-[90%]',
    md: 'max-w-[600px] w-[90%]',
    lg: 'max-w-[800px] w-[90%]',
    xl: 'max-w-[1000px] w-[95%]',
  };
  return (
    <div
      className={`bg-surface-elevated border border-border rounded-2xl shadow-2xl backdrop-blur-[16px] overflow-hidden ${modalSizes[size] || modalSizes.md}`}
    >
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <h3 className="text-lg font-semibold text-text">{title}</h3>
        {closable && (
          <button
            className="w-8 h-8 rounded-lg border-none bg-transparent text-text-muted cursor-pointer flex items-center justify-center text-xl transition-colors hover:bg-surface-hover hover:text-text"
            onClick={() => {
              if (onClose) ctx.sendAction(onClose);
              else ctx.sendAction('close_modal');
            }}
          >
            ×
          </button>
        )}
      </div>
      <div className="p-6 overflow-y-auto max-h-[70vh]">{ctx.renderChildren(getChildren(c))}</div>
    </div>
  );
}

// ---- Form ----
export function renderForm(c: A2UIComponent, ctx: RenderContext) {
  const onSubmit = prop(c, 'onSubmit') as string;
  const submitLabel = (prop(c, 'submitLabel') as string) || '';
  const submitIcon = prop(c, 'submitIcon') as string | undefined;
  const cancelLabel = prop(c, 'cancelLabel') as string | undefined;
  const onCancel = prop(c, 'onCancel') as string | undefined;
  const footerExtra = prop(c, 'footerExtra') as string[] | undefined;
  const submitTooltip = prop(c, 'submitTooltip') as string | undefined;
  const btnBase =
    'px-5 py-2.5 rounded-[10px] text-sm font-medium cursor-pointer transition-all duration-fast border-none';
  const iconBtnCls =
    'inline-flex items-center justify-center w-9 h-9 rounded-lg cursor-pointer border-none transition-all duration-150 active:scale-[0.93] [&>svg]:w-4 [&>svg]:h-4';
  const isIconOnly = submitIcon && !submitLabel;
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const formData = new FormData(form);
        const data: Record<string, unknown> = {};
        formData.forEach((v, k) => {
          data[k] = v;
        });
        ctx.sendAction(onSubmit, data);
      }}
    >
      {ctx.renderChildren(getChildren(c))}
      <div className="flex items-center gap-3 mt-2">
        {footerExtra && <div className="flex gap-2">{ctx.renderChildren(footerExtra)}</div>}
        <div className="flex-1" />
        {cancelLabel && onCancel && (
          <button
            type="button"
            className={`${btnBase} bg-transparent text-text-secondary hover:bg-primary/10 hover:text-text`}
            onClick={() => ctx.sendAction(onCancel)}
          >
            {cancelLabel}
          </button>
        )}
        {isIconOnly ? (
          <button
            type="submit"
            title={submitTooltip || undefined}
            className={`${iconBtnCls} bg-gradient-to-br from-primary to-accent text-white hover:-translate-y-px hover:shadow-[0_4px_12px_rgba(102,126,234,0.4)]`}
          >
            <span dangerouslySetInnerHTML={{ __html: getIcon(submitIcon) }} />
          </button>
        ) : (
          <button
            type="submit"
            className={`${btnBase} bg-gradient-to-br from-primary to-accent text-white hover:-translate-y-px hover:shadow-[0_4px_12px_rgba(102,126,234,0.4)]`}
          >
            {submitIcon && (
              <span
                className="inline-flex w-4 h-4 [&>svg]:w-4 [&>svg]:h-4 mr-1"
                dangerouslySetInnerHTML={{ __html: getIcon(submitIcon) }}
              />
            )}
            {submitLabel || 'Submit'}
          </button>
        )}
      </div>
    </form>
  );
}

// ---- Form Input ----

const FORM_INPUT_CLS =
  'w-full py-2.5 px-3.5 bg-surface border border-border rounded-[10px] text-text text-[0.9375rem] transition-all duration-fast outline-none placeholder:text-text-muted focus:border-primary/50 focus:bg-surface-hover focus:ring-4 focus:ring-primary/10';

function renderSelectInput(
  name: string,
  value: string | number | boolean | undefined,
  options: { value: string; label: string }[] | undefined,
  placeholder: string,
  onChange: string | undefined,
  ctx: RenderContext,
): React.ReactNode {
  const selectedOpt = options?.find((opt) => opt.value === value);
  const selectedLabel = selectedOpt?.label || placeholder || 'Select...';
  return (
    <div className="custom-select relative" data-name={name}>
      <input type="hidden" name={name} defaultValue={String(value ?? '')} />
      <button
        type="button"
        className={`${FORM_INPUT_CLS} flex items-center justify-between cursor-pointer`}
        onClick={(e) => {
          const wrapper = (e.currentTarget as HTMLElement).closest('.custom-select') as HTMLElement;
          wrapper.classList.toggle('open');
          const closeHandler = (ev: Event) => {
            if (!wrapper.contains(ev.target as Node)) {
              wrapper.classList.remove('open');
              document.removeEventListener('click', closeHandler);
            }
          };
          setTimeout(() => document.addEventListener('click', closeHandler), 0);
        }}
      >
        <span className={`select-label ${!selectedOpt ? 'text-text-muted' : 'text-text'}`}>{selectedLabel}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 16 16"
          fill="currentColor"
          className="text-text-muted shrink-0 transition-transform duration-fast"
        >
          <path d="M8 11L3 6h10l-5 5z" />
        </svg>
      </button>
      <div className="select-dropdown absolute top-full mt-1 left-0 right-0 z-50 bg-surface-elevated backdrop-blur-[12px] border border-primary/20 rounded-xl shadow-2xl max-h-[200px] overflow-y-auto">
        {options?.map((opt) => (
          <div
            key={opt.value}
            className={`select-option px-3 py-2 cursor-pointer text-sm transition-colors ${value === opt.value ? 'text-text bg-primary/10 border-l-2 border-l-primary' : 'text-text-secondary border-l-2 border-l-transparent hover:bg-primary/10 hover:text-text'}`}
            onClick={(e) => {
              const wrapper = (e.currentTarget as HTMLElement).closest('.custom-select') as HTMLElement;
              if (wrapper) {
                const hidden = wrapper.querySelector('input[type="hidden"]') as HTMLInputElement;
                if (hidden) {
                  hidden.value = opt.value;
                }
                const lbl = wrapper.querySelector('.select-label') as HTMLElement;
                if (lbl) {
                  lbl.textContent = opt.label;
                  lbl.className = 'select-label text-text';
                }
                wrapper.querySelectorAll('.select-option').forEach((el) => {
                  (el as HTMLElement).className =
                    el === e.currentTarget
                      ? 'select-option px-3 py-2 cursor-pointer text-sm transition-colors text-text bg-primary/10 border-l-2 border-l-primary'
                      : 'select-option px-3 py-2 cursor-pointer text-sm transition-colors text-text-secondary border-l-2 border-l-transparent hover:bg-primary/10 hover:text-text';
                });
                wrapper.classList.remove('open');
              }
              if (onChange) {
                ctx.sendAction(onChange, { name, value: opt.value });
              }
            }}
          >
            {opt.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function renderCheckboxInput(
  name: string,
  label: string | undefined,
  value: string | number | boolean | undefined,
  onChange: string | undefined,
  ctx: RenderContext,
): React.ReactNode {
  const checked = value === true || value === 'true';
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-text">{label}</span>
      <label className="relative inline-flex items-center cursor-pointer">
        <input type="hidden" name={name} defaultValue={checked ? 'true' : 'false'} />
        <input
          type="checkbox"
          className="sr-only peer"
          defaultChecked={checked}
          onChange={(e) => {
            const hidden = e.currentTarget.previousElementSibling as HTMLInputElement;
            if (hidden) {
              hidden.value = e.currentTarget.checked ? 'true' : 'false';
            }
            if (onChange) {
              ctx.sendAction(onChange, { name, value: String(e.currentTarget.checked) });
            }
          }}
        />
        <div className="w-9 h-5 bg-border rounded-full peer peer-checked:bg-primary peer-focus:ring-4 peer-focus:ring-primary/10 transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
      </label>
    </div>
  );
}

export function renderFormInput(c: A2UIComponent, ctx: RenderContext) {
  const inputType = prop(c, 'inputType') as string;
  const name = prop(c, 'name') as string;
  const label = prop(c, 'label') as string | undefined;
  const placeholder = (prop(c, 'placeholder') as string) || '';
  const value = prop(c, 'value') as string | number | boolean | undefined;
  const options = prop(c, 'options') as { value: string; label: string }[] | undefined;
  const required = prop(c, 'required') as boolean | undefined;
  const onChange = prop(c, 'onChange') as string | undefined;
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    if (onChange) {
      ctx.sendAction(onChange, { name, value: e.target.value });
    }
  };

  if (inputType === 'checkbox') {
    return renderCheckboxInput(name, label, value, onChange, ctx);
  }

  let input: React.ReactNode;
  switch (inputType) {
    case 'textarea':
      input = (
        <textarea
          className={`${FORM_INPUT_CLS} min-h-[100px] resize-y`}
          name={name}
          placeholder={placeholder}
          required={required}
          onChange={handleChange}
          defaultValue={String(value || '')}
        />
      );
      break;
    case 'select':
      input = renderSelectInput(name, value, options, placeholder, onChange, ctx);
      break;
    case 'number':
      input = (
        <input
          type="number"
          className={FORM_INPUT_CLS}
          name={name}
          placeholder={placeholder}
          defaultValue={value ?? ''}
          required={required}
          onChange={handleChange}
        />
      );
      break;
    default:
      input = (
        <input
          type="text"
          className={FORM_INPUT_CLS}
          name={name}
          placeholder={placeholder}
          defaultValue={String(value ?? '')}
          required={required}
          onChange={handleChange}
        />
      );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-xs font-medium text-text-secondary">
          {label}
          {required && <span className="text-red-400 ml-0.5">*</span>}
        </label>
      )}
      {input}
    </div>
  );
}

// ---- Git Timeline ----

const TIMELINE_TYPE_ICONS: Record<string, string> = {
  branch: 'git-branch',
  commit: 'git-commit',
  benchmark: 'test-tube',
  merge: 'git-merge',
  revert: 'alert-triangle',
  tag: 'star',
};

const TIMELINE_STATUS_COLORS: Record<string, string> = {
  success: 'rgb(var(--color-success))',
  failed: 'rgb(var(--color-error))',
  pending: 'rgb(var(--color-text-muted))',
  active: 'rgb(var(--color-primary))',
};

const CTX_BTN_CLS =
  'flex items-center gap-2 w-full px-3 py-2 text-xs bg-transparent border-none text-text-secondary cursor-pointer transition-colors hover:bg-primary/10 hover:text-text text-left';

function groupEventsByDate(events: any[]): { date: string; events: { evt: any; idx: number }[] }[] {
  const groups: { date: string; events: { evt: any; idx: number }[] }[] = [];
  let lastDate = '';
  for (let i = 0; i < events.length; i++) {
    const d = new Date(events[i].timestamp as number).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
    if (d !== lastDate) {
      groups.push({ date: d, events: [] });
      lastDate = d;
    }
    groups[groups.length - 1].events.push({ evt: events[i], idx: i });
  }
  return groups;
}

function renderTimelineEventMeta(evt: any) {
  return (
    <div className="flex items-center gap-3 mt-1.5 text-[11px] text-text-muted flex-wrap">
      {evt.author && (
        <span className="flex items-center gap-1">
          <span className="w-4 h-4 rounded-full bg-bg-tertiary flex items-center justify-center text-[9px] text-text-secondary font-medium">
            {(evt.author as string).charAt(0).toUpperCase()}
          </span>
          {evt.author}
        </span>
      )}
      {evt.branch && (
        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/10 text-primary">
          <span dangerouslySetInnerHTML={{ __html: getIcon('git-branch') }} /> {evt.branch}
        </span>
      )}
      {evt.tags &&
        (evt.tags as string[]).map((tag: string, ti: number) => (
          <span key={ti} className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">
            <span dangerouslySetInnerHTML={{ __html: getIcon('star') }} /> {tag}
          </span>
        ))}
      {evt.filesChanged && (
        <span className="flex items-center gap-1">
          {evt.filesChanged} file{(evt.filesChanged as number) > 1 ? 's' : ''}{' '}
          {evt.additions && <span className="text-emerald-400">+{evt.additions}</span>}{' '}
          {evt.deletions && <span className="text-red-400">-{evt.deletions}</span>}
        </span>
      )}
      <span className="ml-auto">{relativeTimeStr(evt.timestamp as number)}</span>
    </div>
  );
}

function renderTimelineContextMenu(evt: any, onContextAction: string, ctx: RenderContext) {
  return (
    <div
      className="timeline-context-menu absolute z-50 bg-surface-elevated border border-border rounded-lg shadow-2xl py-1 min-w-[140px]"
      style={{ display: 'none' }}
    >
      {(evt.type === 'commit' || evt.type === 'merge') && (
        <>
          <button
            className={CTX_BTN_CLS}
            onClick={(e) => {
              e.stopPropagation();
              ctx.sendAction(onContextAction, { eventId: evt.id, action: 'view_diff' });
            }}
          >
            <span dangerouslySetInnerHTML={{ __html: getIcon('search') }} /> View Diff
          </button>
          <button
            className={CTX_BTN_CLS}
            onClick={(e) => {
              e.stopPropagation();
              ctx.sendAction(onContextAction, { eventId: evt.id, action: 'cherry_pick' });
            }}
          >
            <span dangerouslySetInnerHTML={{ __html: getIcon('git-commit') }} /> Cherry-Pick
          </button>
          <button
            className={`${CTX_BTN_CLS} !text-red-400 hover:!bg-red-500/10`}
            onClick={(e) => {
              e.stopPropagation();
              ctx.sendAction(onContextAction, { eventId: evt.id, action: 'revert' });
            }}
          >
            <span dangerouslySetInnerHTML={{ __html: getIcon('alert-triangle') }} /> Revert
          </button>
        </>
      )}
      {evt.type === 'branch' && (
        <>
          <button
            className={CTX_BTN_CLS}
            onClick={(e) => {
              e.stopPropagation();
              ctx.sendAction('switch_version', { branch: evt.branch });
            }}
          >
            <span dangerouslySetInnerHTML={{ __html: getIcon('git-branch') }} /> Switch
          </button>
          <button
            className={CTX_BTN_CLS}
            onClick={(e) => {
              e.stopPropagation();
              ctx.sendAction('merge_version', { branch: evt.branch });
            }}
          >
            <span dangerouslySetInnerHTML={{ __html: getIcon('git-merge') }} /> Merge
          </button>
        </>
      )}
      {evt.type === 'benchmark' && (
        <button
          className={CTX_BTN_CLS}
          onClick={(e) => {
            e.stopPropagation();
            ctx.sendAction('view_benchmark_run', { eventId: evt.id });
          }}
        >
          <span dangerouslySetInnerHTML={{ __html: getIcon('bar-chart') }} /> View Results
        </button>
      )}
    </div>
  );
}

export function renderGitTimeline(c: A2UIComponent, ctx: RenderContext) {
  const events = (prop(c, 'events') as any[]) || [];
  const onEventClick = prop(c, 'onEventClick') as string | undefined;
  const onContextAction = prop(c, 'onContextAction') as string | undefined;
  const selectedEventId = prop(c, 'selectedEventId') as string | undefined;

  const dateGroups = groupEventsByDate(events);

  return (
    <div
      className="a2ui-git-timeline flex flex-col"
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (!target.closest('.timeline-context-menu') && !target.closest('.timeline-context-trigger')) {
          (e.currentTarget as HTMLElement)
            .querySelectorAll('.timeline-context-menu')
            .forEach((m) => ((m as HTMLElement).style.display = 'none'));
        }
      }}
    >
      {dateGroups.map((group, gi) => (
        <div key={gi} className="mb-2">
          <div className="flex items-center gap-3 py-2">
            <span className="flex-1 h-px bg-border" />
            <span className="text-xs text-text-muted font-medium">{group.date}</span>
            <span className="flex-1 h-px bg-border" />
          </div>
          {group.events.map(({ evt, idx }) => (
            <div
              key={idx}
              className={`flex gap-3 p-2 rounded-lg transition-colors relative ${selectedEventId === evt.id ? 'bg-primary/10' : 'hover:bg-surface-hover'}`}
              onClick={() => onEventClick && ctx.sendAction(onEventClick, { eventId: evt.id })}
              onContextMenu={(e) => {
                if (!onContextAction) {
                  return;
                }
                e.preventDefault();
                const menu = (e.currentTarget as HTMLElement).querySelector('.timeline-context-menu') as HTMLElement;
                if (menu) {
                  (e.currentTarget as HTMLElement)
                    .closest('.a2ui-git-timeline')
                    ?.querySelectorAll('.timeline-context-menu')
                    .forEach((m) => ((m as HTMLElement).style.display = 'none'));
                  menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
                  menu.style.top = `${e.nativeEvent.offsetY}px`;
                  menu.style.left = `${e.nativeEvent.offsetX}px`;
                }
              }}
              style={{ cursor: onEventClick ? 'pointer' : 'default' }}
            >
              <div className="flex flex-col items-center">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white shrink-0"
                  style={{ background: TIMELINE_STATUS_COLORS[evt.status as string] || TIMELINE_STATUS_COLORS.pending }}
                >
                  <span
                    className="w-4 h-4"
                    dangerouslySetInnerHTML={{ __html: getIcon(TIMELINE_TYPE_ICONS[evt.type as string] || 'git-commit') }}
                  />
                </div>
                {idx < events.length - 1 && <div className="w-0.5 flex-1 bg-border mt-1 min-h-[8px]" />}
              </div>
              <div className="flex-1 min-w-0 pb-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-text truncate">{evt.label}</span>
                  <span className="flex items-center gap-2 shrink-0">
                    {evt.hash && (
                      <code className="text-[11px] font-mono text-primary/80 bg-primary/10 px-1.5 py-0.5 rounded">
                        {(evt.hash as string).slice(0, 7)}
                      </code>
                    )}
                    {evt.score !== undefined && <span className="text-xs font-semibold text-primary">{evt.score}</span>}
                  </span>
                </div>
                {evt.description && (
                  <div className="text-xs text-text-muted mt-0.5 line-clamp-2">{evt.description}</div>
                )}
                {renderTimelineEventMeta(evt)}
              </div>
              {onContextAction && renderTimelineContextMenu(evt, onContextAction, ctx)}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ---- Step Indicator ----
export function renderStepIndicator(c: A2UIComponent, ctx: RenderContext) {
  const steps = (prop(c, 'steps') as any[]) || [];
  const orientation = (prop(c, 'orientation') as string) || 'horizontal';
  const onStepClick = prop(c, 'onStepClick') as string | undefined;
  const isH = orientation === 'horizontal';
  const layoutClass = isH ? 'flex-row items-center justify-center' : 'flex-col';

  return (
    <div className={`flex ${layoutClass} gap-0`}>
      {steps.map((step: any, i: number) => {
        const status = (step.status as string) || 'pending';
        const connectorDone = status === 'completed' || status === 'active';
        const clickable = onStepClick && (status === 'completed' || status === 'active');
        const iconSizeCls = stepIconSize(status);

        return (
          <React.Fragment key={i}>
            {i > 0 && <div className={stepConnectorClass(isH, connectorDone)} />}
            <div
              className={stepContainerClass(isH, clickable)}
              onClick={clickable ? () => ctx.sendAction(onStepClick!, { stepId: step.id }) : undefined}
            >
              <div
                className={`${stepSizeClass(status)} rounded-full flex items-center justify-center text-xs border-2 shrink-0 transition-all ${stepCircleClass(status)}`}
              >
                {renderStepIcon(step, iconSizeCls, i)}
              </div>
              <span className={`text-[11px] whitespace-nowrap uppercase tracking-wider ${stepLabelClass(status)}`}>
                {step.label}
              </span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ---- File Tree ----
export function renderFileTree(c: A2UIComponent, ctx: RenderContext) {
  const files = (prop(c, 'files') as any[]) || [];
  const selectedPath = prop(c, 'selectedPath') as string | undefined;
  const onFileSelect = prop(c, 'onFileSelect') as string | undefined;
  const statusIcons: Record<string, { symbol: string; color: string }> = {
    added: { symbol: '+', color: 'rgb(var(--color-success))' },
    modified: { symbol: 'M', color: 'rgb(var(--color-primary))' },
    deleted: { symbol: '-', color: 'rgb(var(--color-error))' },
    renamed: { symbol: 'R', color: 'rgb(var(--color-warning))' },
  };
  const tree = new Map<string, typeof files>();
  for (const f of files) {
    const parts = (f.path as string).split('/');
    const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : '.';
    if (!tree.has(dir)) {
      tree.set(dir, []);
    }
    tree.get(dir)!.push(f);
  }
  return (
    <div className="text-sm font-mono">
      {Array.from(tree.entries()).map(([dir, dirFiles]) => (
        <div key={dir} className="mb-2">
          <div className="text-xs text-text-muted font-medium py-1">{dir}/</div>
          {dirFiles.map((f: any, fi: number) => {
            const si = statusIcons[f.status as string] || statusIcons.modified;
            const filename = (f.path as string).split('/').pop();
            return (
              <div
                key={fi}
                className={`flex items-center gap-2 py-1 px-2 rounded transition-colors ${f.path === selectedPath ? 'bg-primary/10' : 'hover:bg-surface-hover'}`}
                onClick={() => onFileSelect && ctx.sendAction(onFileSelect, { path: f.path })}
                style={{ cursor: onFileSelect ? 'pointer' : 'default' }}
              >
                <span className="w-4 text-center font-bold text-xs" style={{ color: si.color }}>
                  {si.symbol}
                </span>
                <span className="text-text flex-1">{filename}</span>
                {(f.additions !== undefined || f.deletions !== undefined) && (
                  <span className="flex gap-1.5 text-[11px]">
                    {f.additions ? <span className="text-emerald-400">+{f.additions}</span> : null}
                    {f.deletions ? <span className="text-red-400">-{f.deletions}</span> : null}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ---- Arena Pills ----
export function renderArenaPills(c: A2UIComponent, ctx: RenderContext) {
  const pills =
    (prop(c, 'pills') as Array<{
      label: string;
      color: string;
      active: boolean;
      action: string;
      payload?: Record<string, unknown>;
    }>) || [];
  const clearAction = prop(c, 'clearAction') as string | undefined;
  const hasActive = pills.some((p) => p.active);
  return (
    <div className="arena-pills">
      {pills.map((p, i) => (
        <div
          key={i}
          className={`arena-pill ${p.active ? 'active' : ''}`}
          onClick={() => ctx.sendAction(p.action, p.payload)}
        >
          <span className="arena-glow-dot" style={{ background: p.color, color: p.color }} />
          <span>{p.label}</span>
        </div>
      ))}
      {hasActive && clearAction && (
        <div className="arena-clear-pill" onClick={() => ctx.sendAction(clearAction)}>
          ✕ Clear
        </div>
      )}
    </div>
  );
}

// ---- Arena Score Table ----
export function renderArenaScoreTable(c: A2UIComponent, _ctx: RenderContext) {
  const rows = (prop(c, 'rows') as Array<{ label: string; color: string; score: number }>) || [];
  return (
    <table className="arena-score-table">
      <thead>
        <tr>
          <th>Run</th>
          <th>Overall Score</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td>
              <div className="arena-score-cell">
                <span
                  style={{ background: r.color, width: 8, height: 8, borderRadius: '50%', display: 'inline-block' }}
                />
                {r.label}
              </div>
            </td>
            <td>
              <div className="arena-score-cell">
                <div className="arena-score-bar">
                  <div className="arena-score-bar-fill" style={{ width: `${r.score * 100}%`, background: r.color }} />
                </div>
                <span className={`arena-score-value ${scoreClass(r.score)}`}>{r.score.toFixed(2)}</span>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ---- Arena Category Card ----
export function renderArenaCategoryCard(c: A2UIComponent, _ctx: RenderContext) {
  const name = prop(c, 'categoryName') as string;
  const color = prop(c, 'categoryColor') as string;
  const icon = prop(c, 'categoryIcon') as string;
  const avgScore = prop(c, 'avgScore') as number;
  const criteria =
    (prop(c, 'criteria') as Array<{ name: string; scores: Array<{ value: number; color: string }> }>) || [];
  const showBar = criteria.length > 0 && criteria[0].scores.length <= 1;
  return (
    <div className="arena-category-card">
      <div className="arena-category-header">
        <div
          className="arena-category-icon"
          style={{ background: `${color}20`, color }}
          dangerouslySetInnerHTML={{ __html: getIcon(icon) }}
        />
        <span className="arena-category-name">{name}</span>
        <span className={`arena-category-avg ${scoreClass(avgScore)}`}>{avgScore.toFixed(2)}</span>
      </div>
      <div className="arena-criteria-list">
        {criteria.map((cr, i) => (
          <div key={i} className="arena-criterion-row">
            <span className="arena-criterion-name">{cr.name}</span>
            {showBar && (
              <div className="arena-criterion-bar">
                {cr.scores.map((s, j) => (
                  <div key={j} className="arena-criterion-bar-track" title={s.value.toFixed(3)}>
                    <div
                      className="arena-criterion-bar-fill"
                      style={{ width: `${Math.min(100, s.value * 100)}%`, background: s.color }}
                    />
                  </div>
                ))}
              </div>
            )}
            <div className="arena-criterion-scores">
              {cr.scores.map((s, j) => (
                <span key={j} className="arena-criterion-score" style={{ color: s.color }}>
                  {s.value.toFixed(2)}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Radar Chart (Recharts) ----
export function renderRadarChart(c: A2UIComponent, _ctx: RenderContext) {
  const data = (prop(c, 'radarData') as Array<Record<string, unknown>>) || [];
  const series = (prop(c, 'radarSeries') as Array<{ key: string; name: string; color: string }>) || [];
  const height = (prop(c, 'height') as number) || 400;
  const legend = (prop(c, 'categoryLegend') as Array<{ name: string; color: string }>) || [];

  if (data.length === 0 || series.length === 0) {
    return (
      <div className="flex items-center justify-center text-text-muted" style={{ height }}>
        No data
      </div>
    );
  }

  const tickStyle = { fontSize: 10, fill: 'currentColor', fillOpacity: 0.5 };
  const tooltipStyle = {
    contentStyle: {
      background: 'var(--color-surface-elevated)',
      border: '1px solid rgb(var(--color-border))',
      borderRadius: 8,
      fontSize: 12,
    },
    labelStyle: { color: 'rgb(var(--color-text-secondary))' },
    itemStyle: { color: 'rgb(var(--color-text))' },
  };

  return (
    <>
      <ResponsiveContainer width="100%" height={height}>
        <RadarChart data={data} cx="50%" cy="50%" outerRadius="75%">
          <PolarGrid stroke="currentColor" strokeOpacity={0.08} />
          <PolarAngleAxis dataKey="subject" tick={tickStyle} />
          <PolarRadiusAxis domain={[0, 1]} tick={tickStyle} tickCount={5} axisLine={false} />
          {series.map((s) => (
            <Radar
              key={s.key}
              name={s.name}
              dataKey={s.key}
              stroke={s.color}
              fill={s.color}
              fillOpacity={0.15}
              strokeWidth={2}
              dot={{ r: 2, fill: s.color }}
            />
          ))}
          <Tooltip {...tooltipStyle} formatter={(value: number) => (value * 100).toFixed(0) + '%'} />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
        </RadarChart>
      </ResponsiveContainer>
      {legend.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 16,
            marginTop: 12,
            paddingTop: 12,
            borderTop: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          {legend.map((cat, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: '0.8rem',
                color: 'rgb(var(--color-text-secondary))',
              }}
            >
              <span
                style={{ width: 10, height: 10, borderRadius: '50%', background: cat.color, display: 'inline-block' }}
              />
              <span>{cat.name}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ---- Arena Run Picker ----
export function renderArenaRunPicker(c: A2UIComponent, ctx: RenderContext) {
  const runs =
    (prop(c, 'runs') as Array<{ id: string; label: string; selected: boolean; color?: string; score?: number }>) || [];
  const action = prop(c, 'action') as string;
  const clearAction = prop(c, 'clearAction') as string | undefined;
  const selectedCount = runs.filter((r) => r.selected).length;
  return (
    <details className="arena-run-picker">
      <summary className="arena-run-picker-btn">Runs ({selectedCount}) ▾</summary>
      <div className="arena-run-picker-panel">
        {runs.map((r) => (
          <div
            key={r.id}
            className={`arena-run-picker-item ${r.selected ? 'selected' : ''}`}
            onClick={() => ctx.sendAction(action, { runId: r.id })}
          >
            <span className="arena-run-picker-dot" style={{ background: r.color || '#555' }} />
            <span className="arena-run-picker-label">{r.label}</span>
            {r.score != null && <span className="arena-run-picker-score">{r.score.toFixed(2)}</span>}
            <span className="arena-run-picker-check">{r.selected ? '✓' : ''}</span>
          </div>
        ))}
        {clearAction && (
          <div className="arena-run-picker-footer" onClick={() => ctx.sendAction(clearAction)}>
            Clear All
          </div>
        )}
      </div>
    </details>
  );
}

// ---- Arena Mode Toggle ----
export function renderArenaModeToggle(c: A2UIComponent, ctx: RenderContext) {
  const options = (prop(c, 'options') as Array<{ label: string; value: string }>) || [];
  const active = prop(c, 'active') as string;
  const action = prop(c, 'action') as string;
  return (
    <div className="arena-toggle">
      {options.map((opt, i) => (
        <button
          key={i}
          className={`arena-toggle-btn ${opt.value === active ? 'active' : ''}`}
          onClick={() => ctx.sendAction(action, { mode: opt.value })}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ---- Playground FAB ----
export function renderPlaygroundFab(c: A2UIComponent, ctx: RenderContext) {
  const primary = prop(c, 'primary') as { icon: string; action: string; payload?: Record<string, unknown> };
  const actions =
    (prop(c, 'actions') as Array<{
      icon: string;
      action: string;
      payload?: Record<string, unknown>;
      tooltip?: string;
    }>) || [];
  return (
    <div className="pg-fab-container">
      <button
        className="pg-fab-primary"
        onClick={() => ctx.sendAction(primary.action, primary.payload)}
        dangerouslySetInnerHTML={{ __html: getIcon(primary.icon) }}
      />
      {actions.map((a, i) => (
        <button
          key={i}
          className="pg-fab-secondary"
          data-tooltip={a.tooltip || ''}
          onClick={() => ctx.sendAction(a.action, a.payload)}
          dangerouslySetInnerHTML={{ __html: getIcon(a.icon) }}
        />
      ))}
    </div>
  );
}

// ---- Log Viewer ----
export function renderLogViewer(c: A2UIComponent, _ctx: RenderContext) {
  const entries =
    (prop(c, 'entries') as Array<{
      time: string;
      level: string;
      subsystem: string;
      message: string;
      data?: unknown;
    }>) || [];
  const levelColors: Record<string, string> = {
    trace: 'text-text-muted bg-text-muted/10',
    debug: 'text-text-muted bg-text-muted/10',
    info: 'text-blue-400 bg-blue-500/10',
    warn: 'text-amber-400 bg-amber-500/10',
    error: 'text-red-400 bg-red-500/10',
    fatal: 'text-red-400 bg-red-500/10',
  };

  return (
    <div id="log-viewer-scroll" className="overflow-y-auto max-h-[600px] font-mono text-xs">
      <table className="w-full border-collapse">
        <thead className="sticky top-0 z-10 bg-surface">
          <tr>
            <th className="p-1.5 text-left text-[10px] font-medium uppercase text-text-muted border-b border-border w-[140px]">
              Time
            </th>
            <th className="p-1.5 text-left text-[10px] font-medium uppercase text-text-muted border-b border-border w-[70px]">
              Level
            </th>
            <th className="p-1.5 text-left text-[10px] font-medium uppercase text-text-muted border-b border-border w-[100px]">
              Subsystem
            </th>
            <th className="p-1.5 text-left text-[10px] font-medium uppercase text-text-muted border-b border-border">
              Message
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, i) => {
            const colorCls = levelColors[entry.level] || levelColors.info;
            return (
              <tr key={i} className="border-b border-border/50 hover:bg-surface-hover transition-colors">
                <td className="p-1.5 text-text-muted whitespace-nowrap">{entry.time}</td>
                <td className="p-1.5">
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium uppercase ${colorCls}`}>
                    {entry.level}
                  </span>
                </td>
                <td className="p-1.5 text-text-secondary">{entry.subsystem}</td>
                <td className="p-1.5 text-text break-all">{entry.message}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {entries.length === 0 && (
        <div className="flex items-center justify-center p-8 text-text-muted text-sm">No log entries</div>
      )}
    </div>
  );
}

// ---- Version Graph Helpers ----

function renderGraphCommit(
  cm: any,
  ti: number,
  isLast: boolean,
  G: number,
  dotCx: number,
  trunkColor: string,
  onVersionClick: string | undefined,
  ctx: RenderContext
): React.ReactNode {
  const hasBenchmark = cm.benchmarkScore != null;
  const dotSize = hasBenchmark ? 8 : 6;
  return (
    <div
      key={`c-${ti}`}
      className="flex items-center cursor-pointer hover:bg-surface-hover rounded-lg transition-colors"
      style={{ minHeight: 28 }}
      onClick={() => onVersionClick && ctx.sendAction(onVersionClick, { branch: 'main', commit: cm.shortHash })}
    >
      <div className="shrink-0 relative" style={{ width: G, alignSelf: 'stretch' }}>
        <div
          className="absolute"
          style={{ width: 2, left: dotCx - 1, top: 0, bottom: isLast ? '50%' : 0, background: trunkColor }}
        />
        <div
          className="absolute rounded-full"
          style={{
            width: dotSize,
            height: dotSize,
            left: dotCx - dotSize / 2,
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'rgb(var(--color-text-muted))',
          }}
        />
      </div>
      <div className="flex-1 min-w-0 flex items-center justify-between gap-2 py-0.5 pr-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[11px] text-text-muted font-mono shrink-0">{cm.shortHash}</span>
          <span className="text-[12px] text-text-secondary truncate">{cm.message}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {hasBenchmark && (
            <span className="text-[11px] font-semibold tabular-nums" style={{ color: scoreColor(cm.benchmarkScore) }}>
              {cm.benchmarkScore.toFixed(2)}
            </span>
          )}
          <span className="text-[10px] text-text-muted whitespace-nowrap">{relativeTimeStr(cm.date)}</span>
        </div>
      </div>
    </div>
  );
}

function renderGraphBranch(
  v: any,
  ti: number,
  isLast: boolean,
  selectedBranch: string | undefined,
  G: number,
  dotCx: number,
  trunkColor: string,
  onVersionClick: string | undefined,
  ctx: RenderContext
): React.ReactNode {
  const selected = v.branch === selectedBranch;
  const status = v.status as string;
  const dotColor = versionDotColor(status);
  const branchY = 16;
  const branchNameCls = status === 'abandoned' ? 'text-text-muted line-through' : 'text-text';
  const deltaPrefix = v.scoreDelta > 0 ? '+' : '';
  const deltaCls = v.scoreDelta > 0 ? 'text-emerald-400' : 'text-red-400';

  return (
    <div
      key={`v-${ti}`}
      className={`flex items-stretch cursor-pointer rounded-lg transition-colors ${selected ? 'bg-primary/8' : 'hover:bg-surface-hover'}`}
      onClick={() => onVersionClick && ctx.sendAction(onVersionClick, { branch: v.branch })}
    >
      <div className="shrink-0 relative" style={{ width: G }}>
        <div
          className="absolute"
          style={{ width: 2, left: dotCx - 1, top: 0, bottom: isLast ? branchY : 0, background: trunkColor }}
        />
        <div className="absolute" style={{ height: 2, left: dotCx, right: 0, top: branchY, background: dotColor }} />
        <div
          className="absolute rounded-full"
          style={{ width: 6, height: 6, left: dotCx - 3, top: branchY - 3, background: dotColor }}
        />
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-0.5 py-1.5 pr-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: dotColor }} />
            <span className={`text-[13px] font-medium truncate ${branchNameCls}`}>{v.branch}</span>
            {status === 'merged' && <span className="text-[10px] text-emerald-400 shrink-0">→ merged</span>}
            {status === 'abandoned' && <span className="text-[10px] text-text-muted shrink-0">✕</span>}
            {status === 'active' && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/15 text-primary shrink-0">
                active
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {v.latestScore != null && (
              <span className="text-[13px] font-semibold tabular-nums" style={{ color: scoreColor(v.latestScore) }}>
                {v.latestScore.toFixed(2)}
              </span>
            )}
            {v.scoreDelta != null && v.scoreDelta !== 0 && (
              <span className={`text-[10px] font-medium tabular-nums ${deltaCls}`}>
                ({deltaPrefix}
                {Number(v.scoreDelta).toFixed(2)})
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 ml-4 text-[10px] text-text-muted">
          {v.trigger && <span>{v.trigger}</span>}
          {v.trigger && v.filesChanged > 0 && <span>·</span>}
          {v.filesChanged > 0 && <span>{v.filesChanged} files</span>}
          <span className="ml-auto">{relativeTimeStr(v.createdAt as number)}</span>
        </div>
      </div>
    </div>
  );
}

// ---- Version Graph (Git Graph style tree) ----
export function renderVersionGraph(c: A2UIComponent, ctx: RenderContext) {
  const mainBranch = prop(c, 'mainBranch') as
    | { name: string; latestScore?: number | null; benchmarkCount: number }
    | undefined;
  const mainCommits = (prop(c, 'mainCommits') as any[]) || [];
  const versions = (prop(c, 'versions') as any[]) || [];
  const selectedBranch = prop(c, 'selectedBranch') as string | undefined;
  const onVersionClick = prop(c, 'onVersionClick') as string | undefined;

  const mainName = mainBranch?.name || 'main';
  const mainScore = mainBranch?.latestScore;
  const isMainSelected = selectedBranch === 'main';

  // TRUNK_W = width of the trunk gutter column (dot + vertical line)
  const TRUNK_W = 'w-6'; // 24px

  // Build interleaved timeline: merge main commits with evo branch fork points
  // Each item is either a "commit" (main commit) or a "branch" (evo version)
  type TimelineItem = { kind: 'commit'; commit: any; index: number } | { kind: 'branch'; version: any; index: number };

  const timeline: TimelineItem[] = [];

  if (mainCommits.length > 0) {
    // Main commits are sorted newest-first from git log
    // Versions have createdAt timestamps
    // Interleave: walk commits and insert version forks at the right position
    let vIdx = 0;
    const sortedVersions = [...versions].sort((a, b) => b.createdAt - a.createdAt);

    for (let ci = 0; ci < mainCommits.length; ci++) {
      const commitTime = new Date(mainCommits[ci].date).getTime();
      // Insert any versions whose createdAt is newer than this commit
      while (vIdx < sortedVersions.length && sortedVersions[vIdx].createdAt >= commitTime) {
        timeline.push({ kind: 'branch', version: sortedVersions[vIdx], index: vIdx });
        vIdx++;
      }
      timeline.push({ kind: 'commit', commit: mainCommits[ci], index: ci });
    }
    // Remaining versions older than all commits
    while (vIdx < sortedVersions.length) {
      timeline.push({ kind: 'branch', version: sortedVersions[vIdx], index: vIdx });
      vIdx++;
    }
  } else {
    // No main commits — just show versions flat
    versions.forEach((v: any, i: number) => {
      timeline.push({ kind: 'branch', version: v, index: i });
    });
  }

  // Gutter width in px — all trunk elements are positioned inside this
  const G = 28;
  const dotCx = G / 2; // center X of trunk line
  // Trunk line color — slightly brighter than border for visibility
  const trunkColor = 'rgb(var(--color-text-muted) / 0.4)';

  return (
    <div className="flex flex-col font-mono text-[13px]" style={{ paddingLeft: 8 }}>
      {/* Main branch HEAD node */}
      <div
        className={`flex items-center cursor-pointer rounded-lg transition-colors py-1.5 pr-2
          ${isMainSelected ? 'bg-primary/8' : 'hover:bg-surface-hover'}`}
        onClick={() => onVersionClick && ctx.sendAction(onVersionClick, { branch: 'main' })}
        style={{ paddingLeft: 0 }}
      >
        {/* Gutter: HEAD dot + start of trunk line below */}
        <div className="shrink-0 relative" style={{ width: G, minHeight: 28 }}>
          {/* HEAD dot */}
          <div
            className="absolute rounded-full"
            style={{
              width: 12,
              height: 12,
              left: dotCx - 6,
              top: 8,
              background: 'rgb(var(--color-text))',
              border: '2px solid rgb(var(--color-text))',
            }}
          />
          {/* Trunk line below dot (only if timeline has items) */}
          {timeline.length > 0 && (
            <div
              className="absolute"
              style={{ width: 2, left: dotCx - 1, top: 22, bottom: 0, background: trunkColor }}
            />
          )}
        </div>
        <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-text">{mainName}</span>
            <span className="text-[10px] px-1 py-0.5 rounded bg-text/10 text-text-muted">HEAD</span>
          </div>
          {mainScore != null && (
            <span className="text-sm font-semibold tabular-nums shrink-0" style={{ color: scoreColor(mainScore) }}>
              {mainScore.toFixed(2)}
            </span>
          )}
        </div>
      </div>

      {/* Timeline items */}
      {timeline.length === 0 && (
        <div className="flex items-center py-3 pr-2">
          <div className="shrink-0" style={{ width: G }} />
          <span className="text-xs text-text-muted italic">No commits or evolution versions</span>
        </div>
      )}

      {timeline.map((item, ti) => {
        const isLast = ti === timeline.length - 1;
        if (item.kind === 'commit') {
          return renderGraphCommit(item.commit, ti, isLast, G, dotCx, trunkColor, onVersionClick, ctx);
        }
        return renderGraphBranch(item.version, ti, isLast, selectedBranch, G, dotCx, trunkColor, onVersionClick, ctx);
      })}
    </div>
  );
}

// ---- Evolution Pipeline ----
function renderCycleHeader(cycle: any): React.ReactNode {
  const deltaClass = cycle.score.delta >= 0 ? 'text-emerald-400' : 'text-red-400';
  const deltaPrefix = cycle.score.delta >= 0 ? '+' : '';
  return (
    <>
      <span className="text-[11px] text-slate-400">
        {cycle.score.before.toFixed(2)} → {cycle.score.after.toFixed(2)}
      </span>
      <span className={`text-[11px] font-semibold ${deltaClass}`}>
        ({deltaPrefix}
        {cycle.score.delta.toFixed(3)})
      </span>
      {cycle.recommendation && (
        <span
          className={`text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase ${recommendationBadgeClass(cycle.recommendation)}`}
        >
          {cycle.recommendation}
        </span>
      )}
    </>
  );
}

function renderPipelineStep(
  step: any,
  i: number,
  cycle: any,
  onStepClick: string | undefined,
  ctx: RenderContext
): React.ReactNode {
  const status = (step.status as string) || 'pending';
  const connectorDone = status === 'completed' || status === 'active';
  const clickable = onStepClick && (status === 'completed' || status === 'active');
  const iconSizeCls = stepIconSize(status);
  const cursorCls = clickable ? 'cursor-pointer' : '';

  return (
    <React.Fragment key={i}>
      {i > 0 && <div className={stepConnectorClass(true, connectorDone)} />}
      <div
        className={`flex flex-col items-center gap-2 ${cursorCls}`}
        onClick={
          clickable
            ? () => ctx.sendAction(onStepClick!, { stepId: step.id, cycleNumber: cycle.cycleNumber })
            : undefined
        }
      >
        <div
          className={`${stepSizeClass(status)} rounded-full flex items-center justify-center text-xs border-2 shrink-0 transition-all ${stepCircleClass(status)}`}
        >
          {renderStepIcon(step, iconSizeCls, i)}
        </div>
        <span className={`text-[11px] whitespace-nowrap uppercase tracking-wider ${stepLabelClass(status)}`}>
          {step.label}
        </span>
      </div>
    </React.Fragment>
  );
}

export function renderEvolutionPipeline(c: A2UIComponent, ctx: RenderContext) {
  const cycles = (prop(c, 'cycles') as any[]) || [];
  const onStepClick = prop(c, 'onStepClick') as string | undefined;

  return (
    <div className="flex flex-col gap-0">
      {cycles.map((cycle: any, cycleIdx: number) => {
        const isLast = cycleIdx === cycles.length - 1;
        const steps = (cycle.steps as any[]) || [];
        return (
          <React.Fragment key={cycleIdx}>
            <div className="flex flex-col gap-1 py-2">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                  Cycle {cycle.cycleNumber}
                </span>
                {cycle.score && renderCycleHeader(cycle)}
              </div>
              <div className="flex flex-row items-center justify-center gap-0">
                {steps.map((step: any, i: number) => renderPipelineStep(step, i, cycle, onStepClick, ctx))}
              </div>
            </div>
            {!isLast && (
              <div className="flex justify-end pr-8 py-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-amber-400/60 uppercase tracking-wider">iterate</span>
                  <svg width="40" height="24" viewBox="0 0 40 24">
                    <path
                      d="M 38 0 C 38 12, 20 12, 20 24"
                      stroke="rgb(245,158,11)"
                      strokeWidth="1.5"
                      fill="none"
                      opacity="0.4"
                      strokeDasharray="4 2"
                    />
                    <path
                      d="M 17 20 L 20 24 L 23 20"
                      stroke="rgb(245,158,11)"
                      strokeWidth="1.5"
                      fill="none"
                      opacity="0.4"
                    />
                  </svg>
                </div>
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
