/**
 * A2UI (Agent-to-UI) Protocol
 *
 * JSONL-based protocol for generative UI.
 */

// A2UI Component Types
export type A2UIComponentType =
  | "text"
  | "card"
  | "column"
  | "row"
  | "grid"
  | "chart"
  | "metric"
  | "stat_card"
  | "table"
  | "button"
  | "form"
  | "form_input"
  | "nav"
  | "tabs"
  | "progress"
  | "badge"
  | "skeleton"
  | "date_picker"
  | "select"
  | "modal"
  | "toast"
  | "divider"
  | "spacer"
  | "icon"
  | "chat_messages"
  | "chat_input"
  // New components for admin/evolution features
  | "code_editor"
  | "commit_list"
  | "diff_view"
  | "data_table"
  | "score_gauge"
  | "status_badge"
  | "collapsible"
  | "radar_chart"
  | "activity_rings"
  // Evolution Lab components
  | "git_timeline"
  | "step_indicator"
  | "file_tree"
  // Arena dashboard components
  | "arena_pills"
  | "arena_score_table"
  | "arena_category_card"
  | "plotly_radar"
  | "arena_run_picker"
  | "arena_mode_toggle"
  | "playground_fab";

// Base component interface
export interface A2UIComponent {
  id: string;
  type: A2UIComponentType;
  children?: string[];
  [key: string]: unknown;
}

// Text Component
export interface TextComponent extends A2UIComponent {
  type: "text";
  text: string;
  variant?: "h1" | "h2" | "h3" | "body" | "caption" | "label";
  color?: string;
  weight?: "normal" | "medium" | "semibold" | "bold";
}

// Card Component
export interface CardComponent extends A2UIComponent {
  type: "card";
  title?: string;
  padding?: number;
  shadow?: "none" | "sm" | "md" | "lg";
}

// Layout Components
export interface ColumnComponent extends A2UIComponent {
  type: "column";
  gap?: number;
  padding?: number;
  align?: "start" | "center" | "end" | "stretch";
}

export interface RowComponent extends A2UIComponent {
  type: "row";
  gap?: number;
  justify?: "start" | "center" | "end" | "between" | "around";
  align?: "start" | "center" | "end" | "stretch";
  wrap?: boolean;
}

export interface GridComponent extends A2UIComponent {
  type: "grid";
  columns?: number;
  gap?: number;
  responsive?: boolean;
}

// Chart Component
export interface ChartComponent extends A2UIComponent {
  type: "chart";
  chartType: "line" | "bar" | "area" | "pie" | "donut";
  data: Record<string, unknown>[];
  xKey: string;
  yKey: string;
  height?: number;
  color?: string;
}

// Metric Component
export interface MetricComponent extends A2UIComponent {
  type: "metric";
  label: string;
  value: string | number;
  unit?: string;
  target?: number;
  trend?: "up" | "down" | "stable";
  icon?: string;
}

// Stat Card Component
export interface StatCardComponent extends A2UIComponent {
  type: "stat_card";
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: string;
  trend?: { direction: "up" | "down" | "stable"; value: string };
  color?: string;
}

// Table Component
export interface TableComponent extends A2UIComponent {
  type: "table";
  columns: { key: string; label: string; width?: string }[];
  rows: Record<string, unknown>[];
}

// Button Component
export interface ButtonComponent extends A2UIComponent {
  type: "button";
  label: string;
  action: string;
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  payload?: Record<string, unknown>;
  disabled?: boolean;
}

// Progress Component
export interface ProgressComponent extends A2UIComponent {
  type: "progress";
  value: number;
  maxValue?: number;
  label?: string;
  color?: string;
  size?: "sm" | "md" | "lg";
}

// Badge Component
export interface BadgeComponent extends A2UIComponent {
  type: "badge";
  text: string;
  variant?: "default" | "success" | "warning" | "error" | "info";
  size?: "sm" | "md";
}

// Skeleton Component (loading state)
export interface SkeletonComponent extends A2UIComponent {
  type: "skeleton";
  variant?: "text" | "circular" | "rectangular" | "card";
  width?: string | number;
  height?: string | number;
}

// Navigation Component
export interface NavComponent extends A2UIComponent {
  type: "nav";
  items: { id: string; label: string; icon?: string; href?: string }[];
  activeId?: string;
  collapsed?: boolean;
  orientation?: "horizontal" | "vertical";
}

// Tabs Component
export interface TabsComponent extends A2UIComponent {
  type: "tabs";
  tabs: { id: string; label: string; icon?: string }[];
  activeTab: string;
  contentIds: Record<string, string>;
}

// ============================================================================
// New Admin/Evolution Components
// ============================================================================

// Code Editor Component
export interface CodeEditorComponent extends A2UIComponent {
  type: "code_editor";
  value: string;
  language?: "markdown" | "json" | "yaml" | "typescript" | "javascript";
  readonly?: boolean;
  lineNumbers?: boolean;
  height?: number | string;
  onChange?: string; // Action name to send on change
}

// Commit List Component (Git history)
export interface CommitListComponent extends A2UIComponent {
  type: "commit_list";
  commits: {
    hash: string;
    shortHash: string;
    message: string;
    date: string;
    author: string;
  }[];
  selectedHash?: string;
  onSelect?: string; // Action name
}

// Diff View Component
export interface DiffViewComponent extends A2UIComponent {
  type: "diff_view";
  before: string;
  after: string;
  language?: string;
  title?: string;
  unifiedDiff?: string;
}

// Data Table Component (enhanced table with pagination, sorting, filtering)
export interface DataTableComponent extends A2UIComponent {
  type: "data_table";
  columns: {
    key: string;
    label: string;
    width?: string;
    sortable?: boolean;
    render?: "text" | "badge" | "progress" | "date" | "link";
  }[];
  rows: Record<string, unknown>[];
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
  };
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  filterable?: boolean;
  onRowClick?: string; // Action name
  onSort?: string; // Action name
  onPageChange?: string; // Action name
}

// Score Gauge Component
export interface ScoreGaugeComponent extends A2UIComponent {
  type: "score_gauge";
  value: number;
  max?: number;
  label?: string;
  showValue?: boolean;
  size?: "sm" | "md" | "lg";
  color?: string;
  thresholds?: { value: number; color: string }[];
}

// Activity Rings Component (Apple Watch-style concentric rings)
export interface ActivityRingsComponent extends A2UIComponent {
  type: "activity_rings";
  rings: Array<{
    value: number;
    max: number;
    label: string;
    color: string;
  }>;
  size?: number; // diameter in px, default 200
}

// Status Badge Component
export interface StatusBadgeComponent extends A2UIComponent {
  type: "status_badge";
  status: "pending" | "running" | "success" | "failed" | "warning";
  label?: string;
  pulse?: boolean; // Animated pulse for running state
}

// Collapsible Panel Component
export interface CollapsibleComponent extends A2UIComponent {
  type: "collapsible";
  title: string;
  expanded?: boolean;
  icon?: string;
  children: string[];
}

// Radar Chart Component
export interface RadarChartComponent extends A2UIComponent {
  type: "radar_chart";
  data: Array<{
    label: string;
    value: number;
    maxValue: number;
  }>;
  size?: number;
  showLabels?: boolean;
  showValues?: boolean;
  color?: string;
  compareData?: Array<{
    label: string;
    value: number;
    maxValue: number;
  }>;
  compareColor?: string;
  /** N-series overlay mode. When present, `data`/`compareData` are ignored. */
  multiSeries?: Array<{
    label: string;
    data: Array<{ label: string; value: number; maxValue: number }>;
    color: string;
  }>;
}

// Git Timeline Component
export interface GitTimelineComponent extends A2UIComponent {
  type: "git_timeline";
  events: Array<{
    id: string;
    type: "branch" | "commit" | "benchmark" | "merge" | "revert" | "tag";
    label: string;
    description?: string;
    timestamp: number;
    branch?: string;
    hash?: string;
    score?: number;
    status?: "success" | "failed" | "pending" | "active";
    author?: string;
    filesChanged?: number;
    additions?: number;
    deletions?: number;
    tags?: string[];
  }>;
  activeBranch?: string;
  onEventClick?: string;
  onContextAction?: string;
  selectedEventId?: string;
}

// Step Indicator Component
export interface StepIndicatorComponent extends A2UIComponent {
  type: "step_indicator";
  steps: Array<{
    id: string;
    label: string;
    icon?: string;
    status: "pending" | "active" | "completed" | "failed" | "skipped";
  }>;
  orientation?: "horizontal" | "vertical";
}

// File Tree Component
export interface FileTreeComponent extends A2UIComponent {
  type: "file_tree";
  files: Array<{
    path: string;
    status: "added" | "modified" | "deleted" | "renamed";
    additions?: number;
    deletions?: number;
  }>;
  selectedPath?: string;
  onFileSelect?: string;
}

// Modal Component
export interface ModalComponent extends A2UIComponent {
  type: "modal";
  title: string;
  size?: "sm" | "md" | "lg" | "xl";
  closable?: boolean;
  onClose?: string; // Action name
}

// Form Input Component
export interface FormInputComponent extends A2UIComponent {
  type: "form_input";
  inputType: "text" | "textarea" | "number" | "select" | "checkbox";
  name: string;
  label?: string;
  placeholder?: string;
  value?: string | number | boolean;
  options?: { value: string; label: string }[]; // For select
  required?: boolean;
  onChange?: string; // Action name
}

// Form Component
export interface FormComponent extends A2UIComponent {
  type: "form";
  onSubmit: string; // Action name
  submitLabel?: string;
  cancelLabel?: string;
  onCancel?: string; // Action name
}

// A2UI Message format
export interface A2UIMessage {
  type: "a2ui";
  surface_id: string;
  components: A2UIComponent[];
  root_id: string;
}

// Surface IDs
export const SURFACE_MAIN = "main";
export const SURFACE_SIDEBAR = "sidebar";
export const SURFACE_MODAL = "modal";
export const SURFACE_TOAST = "toast";

/**
 * A2UI Generator - Helper class to build A2UI component trees
 */
export class A2UIGenerator {
  private components: Map<string, A2UIComponent> = new Map();
  private idCounter = 0;
  private surfaceId: string;

  constructor(surfaceId: string = SURFACE_MAIN) {
    this.surfaceId = surfaceId;
  }

  private nextId(prefix: string = "c"): string {
    return `${this.surfaceId}_${prefix}_${++this.idCounter}`;
  }

  // Layout components
  column(children: string[], opts: Partial<ColumnComponent> = {}): string {
    const id = this.nextId("col");
    this.components.set(id, { id, type: "column", children, ...opts });
    return id;
  }

  row(children: string[], opts: Partial<RowComponent> = {}): string {
    const id = this.nextId("row");
    this.components.set(id, { id, type: "row", children, ...opts });
    return id;
  }

  grid(children: string[], opts: Partial<GridComponent> = {}): string {
    const id = this.nextId("grid");
    this.components.set(id, { id, type: "grid", children, ...opts });
    return id;
  }

  // Content components
  text(text: string, variant: TextComponent["variant"] = "body"): string {
    const id = this.nextId("txt");
    this.components.set(id, { id, type: "text", text, variant });
    return id;
  }

  card(children: string[], opts: Partial<CardComponent> = {}): string {
    const id = this.nextId("card");
    this.components.set(id, { id, type: "card", children, ...opts });
    return id;
  }

  metric(opts: Omit<MetricComponent, "id" | "type">): string {
    const id = this.nextId("metric");
    this.components.set(id, { id, type: "metric", ...opts });
    return id;
  }

  statCard(opts: Omit<StatCardComponent, "id" | "type">): string {
    const id = this.nextId("stat");
    this.components.set(id, { id, type: "stat_card", ...opts });
    return id;
  }

  chart(opts: Omit<ChartComponent, "id" | "type">): string {
    const id = this.nextId("chart");
    this.components.set(id, { id, type: "chart", ...opts });
    return id;
  }

  table(columns: TableComponent["columns"], rows: TableComponent["rows"]): string {
    const id = this.nextId("table");
    this.components.set(id, { id, type: "table", columns, rows });
    return id;
  }

  button(label: string, action: string, opts: Partial<ButtonComponent> = {}): string {
    const id = this.nextId("btn");
    this.components.set(id, { id, type: "button", label, action, ...opts });
    return id;
  }

  progress(value: number, opts: Partial<ProgressComponent> = {}): string {
    const id = this.nextId("prog");
    this.components.set(id, { id, type: "progress", value, ...opts });
    return id;
  }

  badge(text: string, opts: Partial<BadgeComponent> = {}): string {
    const id = this.nextId("badge");
    this.components.set(id, { id, type: "badge", text, ...opts });
    return id;
  }

  skeleton(opts: Partial<SkeletonComponent> = {}): string {
    const id = this.nextId("skel");
    this.components.set(id, { id, type: "skeleton", ...opts });
    return id;
  }

  nav(items: NavComponent["items"], opts: Partial<NavComponent> = {}): string {
    const id = this.nextId("nav");
    this.components.set(id, { id, type: "nav", items, ...opts });
    return id;
  }

  tabs(tabs: TabsComponent["tabs"], activeTab: string, contentIds: Record<string, string>): string {
    const id = this.nextId("tabs");
    this.components.set(id, { id, type: "tabs", tabs, activeTab, contentIds });
    return id;
  }

  // ========================================================================
  // New Admin/Evolution Component Methods
  // ========================================================================

  codeEditor(value: string, opts: Partial<CodeEditorComponent> = {}): string {
    const id = this.nextId("editor");
    this.components.set(id, { id, type: "code_editor", value, ...opts });
    return id;
  }

  commitList(
    commits: CommitListComponent["commits"],
    opts: Partial<CommitListComponent> = {}
  ): string {
    const id = this.nextId("commits");
    this.components.set(id, { id, type: "commit_list", commits, ...opts });
    return id;
  }

  diffView(before: string, after: string, opts: Partial<DiffViewComponent> = {}): string {
    const id = this.nextId("diff");
    this.components.set(id, { id, type: "diff_view", before, after, ...opts });
    return id;
  }

  dataTable(
    columns: DataTableComponent["columns"],
    rows: DataTableComponent["rows"],
    opts: Partial<DataTableComponent> = {}
  ): string {
    const id = this.nextId("dtable");
    this.components.set(id, { id, type: "data_table", columns, rows, ...opts });
    return id;
  }

  scoreGauge(value: number, opts: Partial<ScoreGaugeComponent> = {}): string {
    const id = this.nextId("gauge");
    this.components.set(id, { id, type: "score_gauge", value, ...opts });
    return id;
  }

  activityRings(
    rings: ActivityRingsComponent["rings"],
    opts: Partial<ActivityRingsComponent> = {}
  ): string {
    const id = this.nextId("rings");
    this.components.set(id, { id, type: "activity_rings", rings, ...opts });
    return id;
  }

  statusBadge(
    status: StatusBadgeComponent["status"],
    opts: Partial<StatusBadgeComponent> = {}
  ): string {
    const id = this.nextId("status");
    this.components.set(id, { id, type: "status_badge", status, ...opts });
    return id;
  }

  radarChart(data: RadarChartComponent["data"], opts: Partial<RadarChartComponent> = {}): string {
    const id = this.nextId("radar");
    this.components.set(id, { id, type: "radar_chart", data, ...opts });
    return id;
  }

  collapsible(title: string, children: string[], opts: Partial<CollapsibleComponent> = {}): string {
    const id = this.nextId("collapse");
    this.components.set(id, { id, type: "collapsible", title, children, ...opts });
    return id;
  }

  modal(title: string, children: string[], opts: Partial<ModalComponent> = {}): string {
    const id = this.nextId("modal");
    this.components.set(id, { id, type: "modal", title, children, ...opts });
    return id;
  }

  form(children: string[], onSubmit: string, opts: Partial<FormComponent> = {}): string {
    const id = this.nextId("form");
    this.components.set(id, { id, type: "form", children, onSubmit, ...opts });
    return id;
  }

  formInput(
    name: string,
    inputType: FormInputComponent["inputType"],
    opts: Partial<FormInputComponent> = {}
  ): string {
    const id = this.nextId("input");
    this.components.set(id, { id, type: "form_input", name, inputType, ...opts });
    return id;
  }

  // ========================================================================
  // Evolution Lab Component Methods
  // ========================================================================

  gitTimeline(
    events: GitTimelineComponent["events"],
    opts: Partial<GitTimelineComponent> = {}
  ): string {
    const id = this.nextId("timeline");
    this.components.set(id, { id, type: "git_timeline", events, ...opts });
    return id;
  }

  stepIndicator(
    steps: StepIndicatorComponent["steps"],
    opts: Partial<StepIndicatorComponent> = {}
  ): string {
    const id = this.nextId("steps");
    this.components.set(id, { id, type: "step_indicator", steps, ...opts });
    return id;
  }

  fileTree(files: FileTreeComponent["files"], opts: Partial<FileTreeComponent> = {}): string {
    const id = this.nextId("ftree");
    this.components.set(id, { id, type: "file_tree", files, ...opts });
    return id;
  }

  /**
   * Add a component directly
   */
  addComponent(id: string, component: A2UIComponent): void {
    this.components.set(id, { ...component, id });
  }

  /**
   * Build the A2UI message
   */
  build(rootId: string): A2UIMessage {
    return {
      type: "a2ui",
      surface_id: this.surfaceId,
      components: Array.from(this.components.values()),
      root_id: rootId,
    };
  }

  /**
   * Convert to JSONL format
   */
  toJsonl(rootId: string): string {
    const message = this.build(rootId);
    return JSON.stringify(message);
  }
}
