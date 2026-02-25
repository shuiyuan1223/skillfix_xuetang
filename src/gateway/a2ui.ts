/**
 * A2UI (Agent-to-UI) Protocol — v0.8 Standard
 *
 * JSONL-based protocol for generative UI.
 */

// ==================== A2UI v0.8 Standard Types ====================

export type BoundValue =
  | { literalString: string }
  | { literalNumber: number }
  | { literalBoolean: boolean }
  | { literalArray: unknown[] }
  | { literalObject: unknown }
  | { path: string };

export type ChildrenValue = { explicitList: string[] };

/** v0.8 standard component */
export interface A2UIComponent {
  id: string;
  component: Record<string, Record<string, BoundValue | ChildrenValue>>;
}

/** v0.8 standard messages */
export type A2UIMessage =
  | { surfaceUpdate: { surfaceId: string; components: A2UIComponent[] } }
  | { beginRendering: { surfaceId: string; root: string; catalogId?: string } }
  | { deleteSurface: { surfaceId: string } }
  | { dataModelUpdate: { surfaceId: string; path: string; contents: unknown } };

/** Surface data (frontend storage) */
export interface A2UISurfaceData {
  components: A2UIComponent[];
  root_id: string;
}

// ==================== BoundValue Utilities ====================

/** Wrap a JS value into a BoundValue */
export function toBoundValue(v: unknown): BoundValue {
  if (typeof v === "string") return { literalString: v };
  if (typeof v === "number") return { literalNumber: v };
  if (typeof v === "boolean") return { literalBoolean: v };
  if (Array.isArray(v)) return { literalArray: v };
  return { literalObject: v };
}

/** Unwrap a BoundValue/ChildrenValue back to JS */
export function fromBoundValue(bv: BoundValue | ChildrenValue | undefined): unknown {
  if (!bv) return undefined;
  if ("literalString" in bv) return bv.literalString;
  if ("literalNumber" in bv) return bv.literalNumber;
  if ("literalBoolean" in bv) return bv.literalBoolean;
  if ("literalArray" in bv) return bv.literalArray;
  if ("literalObject" in bv) return bv.literalObject;
  if ("explicitList" in bv) return bv.explicitList;
  if ("path" in bv) return bv.path;
  return undefined;
}

// ==================== Component Read Utilities ====================
// All renderers use these three functions to read v0.8 components uniformly.

/** Get component type name (PascalCase) */
export function componentType(c: A2UIComponent): string {
  return Object.keys(c.component)[0] || "";
}

/** Get a component property value (auto-unwrap BoundValue) */
export function prop(c: A2UIComponent, key: string): unknown {
  const typeName = componentType(c);
  const props = c.component[typeName];
  if (!props) return undefined;
  return fromBoundValue(props[key]);
}

/** Get children ID list */
export function children(c: A2UIComponent): string[] {
  const typeName = componentType(c);
  const ch = c.component[typeName]?.children;
  if (ch && "explicitList" in ch) return ch.explicitList;
  return [];
}

/** Return a new component with a single prop replaced */
export function withProp(c: A2UIComponent, key: string, value: unknown): A2UIComponent {
  const typeName = componentType(c);
  return {
    ...c,
    component: {
      [typeName]: { ...c.component[typeName], [key]: toBoundValue(value) },
    },
  };
}

// ==================== Component Name Mapping ====================

const TYPE_TO_PASCAL: Record<string, string> = {
  text: "Text",
  button: "Button",
  column: "Column",
  row: "Row",
  grid: "Grid",
  card: "Card",
  tabs: "Tabs",
  modal: "Modal",
  divider: "Divider",
  spacer: "Spacer",
  icon: "Icon",
  progress: "Progress",
  badge: "Badge",
  skeleton: "Skeleton",
  table: "Table",
  nav: "Nav",
  form: "Form",
  form_input: "FormInput",
  select: "Select",
  date_picker: "DatePicker",
  toast: "Toast",
  metric: "Metric",
  // PHA custom components
  chat_messages: "ChatMessages",
  chat_input: "ChatInput",
  stat_card: "StatCard",
  chart: "Chart",
  data_table: "DataTable",
  score_gauge: "ScoreGauge",
  activity_rings: "ActivityRings",
  status_badge: "StatusBadge",
  collapsible: "Collapsible",
  code_editor: "CodeEditor",
  commit_list: "CommitList",
  diff_view: "DiffView",
  git_timeline: "GitTimeline",
  step_indicator: "StepIndicator",
  file_tree: "FileTree",
  version_graph: "VersionGraph",
  log_viewer: "LogViewer",
  tag_picker: "TagPicker",
  radar_chart: "RadarChart",
  auth_page: "AuthPage",
  arena_pills: "ArenaPills",
  arena_score_table: "ArenaScoreTable",
  arena_category_card: "ArenaCategoryCard",
  arena_run_picker: "ArenaRunPicker",
  arena_mode_toggle: "ArenaModeToggle",
  playground_fab: "PlaygroundFab",
  evolution_pipeline: "EvolutionPipeline",
};

export const PHA_CATALOG_ID = "pha";

// Surface IDs
export const SURFACE_MAIN = "main";
export const SURFACE_SIDEBAR = "sidebar";
export const SURFACE_MODAL = "modal";
export const SURFACE_TOAST = "toast";

// ==================== A2UIGenerator ====================

/**
 * A2UI Generator — builds v0.8 component trees.
 *
 * Public API is unchanged from the old generator (same method signatures).
 * Internally stores v0.8 format components.
 * build() now returns A2UIMessage[] (surfaceUpdate + beginRendering).
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

  /** Internal: create a v0.8 component and add to the map */
  private add(prefix: string, typeName: string, props: Record<string, unknown>): string {
    const id = this.nextId(prefix);
    const v08Props: Record<string, BoundValue | ChildrenValue> = {};
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null) continue;
      if (k === "children" && Array.isArray(v) && v.every((i) => typeof i === "string")) {
        v08Props.children = { explicitList: v as string[] };
      } else {
        v08Props[k] = toBoundValue(v);
      }
    }
    this.components.set(id, { id, component: { [typeName]: v08Props } });
    return id;
  }

  // Layout components
  column(childIds: string[], opts: Record<string, unknown> = {}): string {
    return this.add("col", "Column", { children: childIds, ...opts });
  }

  row(childIds: string[], opts: Record<string, unknown> = {}): string {
    return this.add("row", "Row", { children: childIds, ...opts });
  }

  grid(childIds: string[], opts: Record<string, unknown> = {}): string {
    return this.add("grid", "Grid", { children: childIds, ...opts });
  }

  // Content components
  text(text: string, variant: string = "body", opts: Record<string, unknown> = {}): string {
    return this.add("txt", "Text", { text, variant, ...opts });
  }

  card(childIds: string[], opts: Record<string, unknown> = {}): string {
    return this.add("card", "Card", { children: childIds, ...opts });
  }

  metric(opts: Record<string, unknown>): string {
    return this.add("metric", "Metric", opts);
  }

  statCard(opts: Record<string, unknown>): string {
    return this.add("stat", "StatCard", opts);
  }

  chart(opts: Record<string, unknown>): string {
    return this.add("chart", "Chart", opts);
  }

  table(columns: unknown[], rows: unknown[]): string {
    return this.add("table", "Table", { columns, rows });
  }

  button(label: string, action: string, opts: Record<string, unknown> = {}): string {
    return this.add("btn", "Button", { label, action, ...opts });
  }

  progress(value: number, opts: Record<string, unknown> = {}): string {
    return this.add("prog", "Progress", { value, ...opts });
  }

  badge(text: string, opts: Record<string, unknown> = {}): string {
    return this.add("badge", "Badge", { text, ...opts });
  }

  skeleton(opts: Record<string, unknown> = {}): string {
    return this.add("skel", "Skeleton", opts);
  }

  nav(items: unknown[], opts: Record<string, unknown> = {}): string {
    return this.add("nav", "Nav", { items, ...opts });
  }

  tabs(tabsList: unknown[], activeTab: string, contentIds: Record<string, string>): string {
    return this.add("tabs", "Tabs", { tabs: tabsList, activeTab, contentIds });
  }

  // Admin/Evolution Component Methods
  codeEditor(value: string, opts: Record<string, unknown> = {}): string {
    return this.add("editor", "CodeEditor", { value, ...opts });
  }

  commitList(commits: unknown[], opts: Record<string, unknown> = {}): string {
    return this.add("commits", "CommitList", { commits, ...opts });
  }

  diffView(before: string, after: string, opts: Record<string, unknown> = {}): string {
    return this.add("diff", "DiffView", { before, after, ...opts });
  }

  dataTable(columns: unknown[], rows: unknown[], opts: Record<string, unknown> = {}): string {
    return this.add("dtable", "DataTable", { columns, rows, ...opts });
  }

  scoreGauge(value: number, opts: Record<string, unknown> = {}): string {
    return this.add("gauge", "ScoreGauge", { value, ...opts });
  }

  activityRings(rings: unknown[], opts: Record<string, unknown> = {}): string {
    return this.add("rings", "ActivityRings", { rings, ...opts });
  }

  radarChart(opts: Record<string, unknown>): string {
    return this.add("radar", "RadarChart", opts);
  }

  statusBadge(status: string, opts: Record<string, unknown> = {}): string {
    return this.add("status", "StatusBadge", { status, ...opts });
  }

  collapsible(title: string, childIds: string[], opts: Record<string, unknown> = {}): string {
    return this.add("collapse", "Collapsible", { title, children: childIds, ...opts });
  }

  modal(title: string, childIds: string[], opts: Record<string, unknown> = {}): string {
    return this.add("modal", "Modal", { title, children: childIds, ...opts });
  }

  form(childIds: string[], onSubmit: string, opts: Record<string, unknown> = {}): string {
    return this.add("form", "Form", { children: childIds, onSubmit, ...opts });
  }

  formInput(name: string, inputType: string, opts: Record<string, unknown> = {}): string {
    return this.add("input", "FormInput", { name, inputType, ...opts });
  }

  tagPicker(opts: Record<string, unknown>): string {
    return this.add("tagpick", "TagPicker", opts);
  }

  // Evolution Lab Component Methods
  gitTimeline(events: unknown[], opts: Record<string, unknown> = {}): string {
    return this.add("timeline", "GitTimeline", { events, ...opts });
  }

  stepIndicator(steps: unknown[], opts: Record<string, unknown> = {}): string {
    return this.add("steps", "StepIndicator", { steps, ...opts });
  }

  fileTree(files: unknown[], opts: Record<string, unknown> = {}): string {
    return this.add("ftree", "FileTree", { files, ...opts });
  }

  versionGraph(
    mainBranch: unknown,
    versions: unknown[],
    opts: Record<string, unknown> = {}
  ): string {
    return this.add("vgraph", "VersionGraph", { mainBranch, versions, ...opts });
  }

  logViewer(entries: unknown[], opts: Record<string, unknown> = {}): string {
    return this.add("logviewer", "LogViewer", { entries, ...opts });
  }

  /**
   * Add a raw v0.8 component with explicit type name and props.
   * Replaces the old addComponent() which accepted old-format objects.
   */
  addRaw(id: string, typeName: string, props: Record<string, unknown>): void {
    const v08Props: Record<string, BoundValue | ChildrenValue> = {};
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null) continue;
      if (k === "children" && Array.isArray(v) && v.every((i) => typeof i === "string")) {
        v08Props.children = { explicitList: v as string[] };
      } else {
        v08Props[k] = toBoundValue(v);
      }
    }
    this.components.set(id, { id, component: { [typeName]: v08Props } });
  }

  /**
   * Add a pre-built v0.8 component directly.
   */
  addComponent(id: string, component: A2UIComponent): void {
    this.components.set(id, { ...component, id });
  }

  /**
   * Build the A2UI v0.8 messages (surfaceUpdate + beginRendering)
   */
  build(rootId: string): A2UIMessage[] {
    return [
      {
        surfaceUpdate: {
          surfaceId: this.surfaceId,
          components: Array.from(this.components.values()),
        },
      },
      { beginRendering: { surfaceId: this.surfaceId, root: rootId, catalogId: PHA_CATALOG_ID } },
    ];
  }

  /**
   * Convert to JSONL format (one message per line)
   */
  toJsonl(rootId: string): string {
    return this.build(rootId)
      .map((m) => JSON.stringify(m))
      .join("\n");
  }
}

// ============================================================================
// AG-UI Event Types (aligned with @ag-ui/core) — unchanged
// ============================================================================

export type AGUIEvent =
  | { type: "RunStarted"; threadId: string; runId: string }
  | { type: "RunFinished"; threadId: string; runId: string }
  | { type: "TextMessageStart"; messageId: string; role: "assistant" }
  | { type: "TextMessageContent"; messageId: string; delta: string }
  | { type: "TextMessageEnd"; messageId: string }
  | {
      type: "ToolCallStart";
      toolCallId: string;
      toolCallName: string;
      parentMessageId?: string;
      displayName?: string;
    }
  | { type: "ToolCallEnd"; toolCallId: string }
  | {
      type: "ToolCallResult";
      messageId: string;
      toolCallId: string;
      content?: string;
      cards?: { components: unknown[]; root_id: string };
    }
  | { type: "Custom"; name: string; data: unknown };

// ============================================================================
// Parts Message Model — unchanged
// ============================================================================

export type MessagePart =
  | { type: "text"; content: string }
  | {
      type: "tool_use";
      toolCallId: string;
      toolName: string;
      status: "running" | "completed" | "error";
      displayName?: string;
    }
  | { type: "tool_result"; toolCallId: string; cards?: { components: unknown[]; root_id: string } };

export interface PartsChatMessage {
  id: string;
  role: "user" | "assistant";
  parts: MessagePart[];
}
