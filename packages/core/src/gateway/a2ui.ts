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
  | "icon";

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
    return `${prefix}_${++this.idCounter}`;
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
