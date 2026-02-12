/**
 * Evolution Lab Page Generator
 *
 * 5-Tab Dashboard layout: Overview | Benchmark | Versions | Data | Agent
 * Dashboard/GUI-centric with Agent mode as a dedicated tab.
 */

import { A2UIGenerator, type A2UIMessage } from "./a2ui.js";
import { t } from "../locales/index.js";

// ============================================================================
// Types
// ============================================================================

interface EvoChatMessage {
  role: "user" | "assistant" | "tool";
  content: string;
  cards?: { components: unknown[]; root_id: string };
}

interface PipelineStep {
  id: string;
  label: string;
  icon: string;
  status: "pending" | "active" | "completed" | "failed" | "skipped";
}

interface TimelineEvent {
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
}

interface SubComponentScore {
  name: string;
  score: number;
  scoring: "binary" | "3-point";
}

interface CategoryScoreInfo {
  category: string;
  score: number;
  test_count: number;
  passed_count: number;
  subComponents?: SubComponentScore[];
}

interface BenchmarkRunInfo {
  id: string;
  timestamp: number;
  version_tag: string;
  overall_score: number;
  passed_count: number;
  failed_count: number;
  total_test_cases: number;
  profile: string;
  duration_ms: number;
  modelId?: string;
  presetName?: string;
  status?: "running" | "completed" | "failed";
}

interface ChangedFile {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
  additions?: number;
  deletions?: number;
}

interface TestCaseInfo {
  id: string;
  category: string;
  query: string;
  expected: { shouldMention?: string[]; shouldNotMention?: string[]; minScore?: number };
}

interface EvaluationStats {
  totalCount: number;
  averageScore: number;
  scoreDistribution: Record<string, number>;
}

interface TraceInfo {
  id: string;
  timestamp: number;
  userMessage: string;
  score?: number;
}

interface EvaluationInfo {
  id: string;
  traceId: string;
  timestamp: number;
  score: number;
  feedback?: string | null;
}

interface SuggestionInfo {
  id: string;
  timestamp: number;
  type: string;
  target: string;
  status: string;
  rationale?: string | null;
}

interface ExternalProgressInfo {
  current: number;
  total: number;
  category: string;
  profile: string;
  modelId?: string;
  presetName?: string;
}

interface VersionInfo {
  id: string;
  branchName: string;
  status: string;
  triggerMode: string;
  triggerRef: string;
  scoreDelta: number | null;
  filesChanged: string[];
  createdAt: number;
}

export interface ComparisonRun {
  id: string;
  label: string;
  color: string;
  overallScore: number;
  categoryScores: CategoryScoreInfo[];
}

// ============================================================================
// Playground Types
// ============================================================================

export type PlaygroundStep =
  | "idle"
  | "benchmark"
  | "diagnose"
  | "propose"
  | "approve"
  | "apply"
  | "validate"
  | "analyse"
  | "complete";

export interface PlaygroundLogEntry {
  timestamp: number;
  step: string;
  message: string;
  type: "info" | "success" | "error" | "warning";
}

export interface PlaygroundState {
  cycleId: string | null;
  step: PlaygroundStep;
  startedAt?: number;
  viewingStep?: PlaygroundStep;

  benchmarkResult?: {
    runId: string;
    overallScore: number;
    categoryScores: CategoryScoreInfo[];
    passedCount: number;
    totalCount: number;
    durationMs: number;
    profile: string;
    versionTag?: string;
    modelId?: string;
  };
  diagnoseResult?: {
    weaknesses: Array<{
      category: string;
      label: string;
      score: number;
      gap: number;
      failingCount: number;
      patterns: string[];
      weakSubComponents?: Array<{ name: string; score: number }>;
    }>;
    suggestions: Array<{
      category: string;
      description: string;
      targetFiles: string[];
      priority: "high" | "medium" | "low";
    }>;
  };
  proposal?: {
    description: string;
    changes: Array<{ path: string; description: string }>;
    expectedImprovement: string;
  };
  approval?: {
    approved: boolean;
    reason?: string;
    timestamp: number;
  };
  applyResult?: {
    branch: string;
    commits: string[];
    filesChanged: Array<{ path: string; status: string }>;
  };
  validateResult?: {
    beforeScore: number;
    afterScore: number;
    delta: number;
    categoryDeltas: Array<{ category: string; before: number; after: number }>;
    recommendation: "merge" | "revert" | "iterate";
    validationRunId: string;
    // Full category data with subComponents for radar toggle
    beforeCategoryScores?: CategoryScoreInfo[];
    afterCategoryScores?: CategoryScoreInfo[];
  };
  validateRadarMode?: "categories" | "criteria";

  analyseResult?: {
    summary: string;
    recommendation: "merge" | "revert" | "iterate";
    confidence: number;
    keyFindings: string[];
  };
  analyseProgress?: string;
  analyseError?: string;

  paused?: boolean;
  log: PlaygroundLogEntry[];
  benchmarkProgress?: { current: number; total: number };
  diagnoseProgress?: string;
  proposeProgress?: string;
  applyProgress?: string;
  applyError?: string;
  applyPrompt?: string;
  validateProgress?: string;
  validateError?: string;
}

export interface EvolutionLabData {
  activeTab: "overview" | "benchmark" | "versions" | "data" | "agent" | "playground";
  // Overview
  stats?: EvaluationStats;
  latestCategoryScores?: CategoryScoreInfo[];
  latestRunCategoryScores?: CategoryScoreInfo[];
  benchmarkRuns?: BenchmarkRunInfo[];
  activeVersionBranch?: string | null;
  scoreTrend?: Array<{ version: string; score: number }>;
  versionCount?: number;
  testCaseCount?: number;
  // Arena comparison
  selectedRunIds?: string[];
  radarMode?: "categories" | "criteria";
  comparisonRuns?: ComparisonRun[];
  // Benchmark
  testCases?: TestCaseInfo[];
  externalProgressMap?: Record<string, ExternalProgressInfo>;
  // Versions
  versions?: VersionInfo[];
  timelineEvents?: TimelineEvent[];
  selectedVersion?: string;
  selectedTimelineEvent?: string;
  changedFiles?: ChangedFile[];
  diffContent?: { before: string; after: string; path: string; unifiedDiff?: string };
  // Data
  dataSubTab?: "traces" | "evaluations" | "suggestions";
  traces?: TraceInfo[];
  tracesPage?: number;
  tracesTotal?: number;
  evaluations?: EvaluationInfo[];
  suggestions?: SuggestionInfo[];
  // Agent
  chatMessages: EvoChatMessage[];
  streaming: boolean;
  streamingContent: string;
  currentPipelineStep?: string;
  pipelineSteps: PipelineStep[];
  agentContextData?: { radarScores?: CategoryScoreInfo[]; changedFiles?: ChangedFile[] };
  loading?: boolean;
  // Playground
  playgroundState?: PlaygroundState;
}

// Default pipeline steps
export function getDefaultPipelineSteps(currentStep?: string): PipelineStep[] {
  const stepsConfig = [
    { id: "benchmark", label: t("evolution.pipelineBenchmark"), icon: "test-tube" },
    { id: "diagnose", label: t("evolution.pipelineDiagnose"), icon: "search" },
    { id: "propose", label: t("evolution.pipelinePropose"), icon: "lightbulb" },
    { id: "approve", label: t("evolution.pipelineApprove"), icon: "check" },
    { id: "apply", label: t("evolution.pipelineApply"), icon: "zap" },
    { id: "validate", label: t("evolution.pipelineValidate"), icon: "shield" },
  ];

  let foundActive = false;
  return stepsConfig.map((s) => {
    if (foundActive) {
      return { ...s, status: "pending" as const };
    }
    if (s.id === currentStep) {
      foundActive = true;
      return { ...s, status: "active" as const };
    }
    if (currentStep) {
      return { ...s, status: "completed" as const };
    }
    return { ...s, status: "pending" as const };
  });
}

// Category label mapping
// SHARP category color mapping
export const SHARP_CATEGORY_COLORS: Record<string, string> = {
  safety: "#ff6b6b",
  usefulness: "#4ecdc4",
  accuracy: "#ffe66d",
  relevance: "#95e1d3",
  personalization: "#dda0dd",
  // Legacy category names → same color mapping
  "safety-boundaries": "#ff6b6b",
  "health-coaching": "#4ecdc4",
  "health-data-analysis": "#ffe66d",
  "communication-quality": "#95e1d3",
  "personalization-memory": "#dda0dd",
};

export const RUN_COLORS = [
  "rgb(99, 102, 241)",
  "rgb(236, 72, 153)",
  "rgb(34, 211, 238)",
  "rgb(245, 158, 11)",
  "rgb(16, 185, 129)",
];

function getScoreColor(score: number): string {
  if (score >= 0.9) return "#4ade80";
  if (score >= 0.7) return "#fbbf24";
  return "#f87171";
}

/**
 * Build multiSeries radar data from comparison runs.
 * categories mode: 5 SHARP data points per series.
 * criteria mode: all sub-component data points per series.
 */
function buildMultiSeriesRadarData(
  comparisonRuns: ComparisonRun[],
  mode: "categories" | "criteria"
): Array<{
  label: string;
  data: Array<{ label: string; value: number; maxValue: number }>;
  color: string;
}> {
  if (mode === "categories") {
    return comparisonRuns.map((run) => ({
      label: run.label,
      color: run.color,
      data: run.categoryScores.map((cs) => ({
        label: getCategoryLabel(cs.category),
        value: Math.round((cs.score <= 1.0 ? cs.score : cs.score / 100) * 100),
        maxValue: 100,
      })),
    }));
  }
  // criteria mode: collect all sub-components in fixed order
  // Use first run's category order and sub-component order as reference
  const ref = comparisonRuns[0];
  const criteriaOrder: Array<{ category: string; name: string }> = [];
  for (const cs of ref.categoryScores) {
    if (cs.subComponents) {
      for (const sub of cs.subComponents) {
        criteriaOrder.push({ category: cs.category, name: sub.name });
      }
    }
  }
  if (criteriaOrder.length === 0) {
    // Fallback to categories mode if no sub-components
    return buildMultiSeriesRadarData(comparisonRuns, "categories");
  }
  return comparisonRuns.map((run) => ({
    label: run.label,
    color: run.color,
    data: criteriaOrder.map((cr) => {
      const cat = run.categoryScores.find((cs) => cs.category === cr.category);
      const sub = cat?.subComponents?.find((s) => s.name === cr.name);
      const score = sub ? sub.score : 0;
      return {
        label: cr.name.length > 14 ? cr.name.slice(0, 12) + ".." : cr.name,
        value: Math.round(score * 100),
        maxValue: 100,
      };
    }),
  }));
}

/**
 * Build Plotly scatterpolar traces from comparison runs.
 */
export function buildPlotlyRadarTraces(
  runs: ComparisonRun[],
  mode: "categories" | "criteria"
): Array<Record<string, unknown>> {
  return runs.map((run) => {
    let dataPoints: Array<{ name: string; score: number }>;
    if (mode === "criteria") {
      // Average each criterion across all categories to get 16 unique points
      const criteriaMap = new Map<string, number[]>();
      for (const cs of run.categoryScores) {
        for (const sub of cs.subComponents || []) {
          const score = sub.score <= 1 ? sub.score : sub.score / 100;
          if (!criteriaMap.has(sub.name)) criteriaMap.set(sub.name, []);
          criteriaMap.get(sub.name)!.push(score);
        }
      }
      dataPoints = Array.from(criteriaMap.entries()).map(([name, scores]) => ({
        name,
        score: scores.reduce((a, b) => a + b, 0) / scores.length,
      }));
      // Fallback to categories mode if no sub-components available
      if (dataPoints.length === 0) {
        dataPoints = run.categoryScores.map((cs) => ({
          name: getCategoryLabel(cs.category),
          score: cs.score <= 1 ? cs.score : cs.score / 100,
        }));
      }
    } else {
      dataPoints = run.categoryScores.map((cs) => ({
        name: getCategoryLabel(cs.category),
        score: cs.score <= 1 ? cs.score : cs.score / 100,
      }));
    }

    const r = dataPoints.map((d) => d.score);
    const theta = dataPoints.map((d) => d.name);
    // Close the polygon
    if (r.length > 0) {
      r.push(r[0]);
      theta.push(theta[0]);
    }

    return {
      type: "scatterpolar",
      r,
      theta,
      fill: "toself",
      fillcolor: run.color
        .replace("rgb", "rgba")
        .replace(")", mode === "criteria" ? ", 0.15)" : ", 0.2)"),
      line: { color: run.color, width: mode === "criteria" ? 2 : 3 },
      name: run.label,
      hovertemplate: "%{theta}<br>Score: %{r:.2f}<extra></extra>",
    };
  });
}

export const PLOTLY_LAYOUT = {
  polar: {
    radialaxis: {
      visible: true,
      range: [0, 1],
      tickvals: [0.25, 0.5, 0.75, 1.0],
      ticktext: ["0.25", "0.50", "0.75", "1.00"],
      tickfont: { size: 10, color: "#55556a", family: "JetBrains Mono" },
      gridcolor: "rgba(255, 255, 255, 0.06)",
      linecolor: "rgba(255, 255, 255, 0.1)",
    },
    angularaxis: {
      tickfont: { size: 10, color: "#8888a0", family: "Outfit" },
      gridcolor: "rgba(255, 255, 255, 0.06)",
      linecolor: "rgba(255, 255, 255, 0.1)",
      rotation: 90,
      direction: "clockwise",
    },
    bgcolor: "rgba(0, 0, 0, 0)",
  },
  paper_bgcolor: "rgba(0, 0, 0, 0)",
  plot_bgcolor: "rgba(0, 0, 0, 0)",
  font: { color: "#f0f0f5", family: "Outfit" },
  showlegend: true,
  legend: {
    x: 0.5,
    y: -0.15,
    xanchor: "center",
    orientation: "h",
    font: { size: 12 },
    bgcolor: "rgba(0,0,0,0)",
  },
  margin: { t: 60, b: 80, l: 80, r: 80 },
  dragmode: false,
};

export function getCategoryLabel(category: string): string {
  const labelMap: Record<string, string> = {
    "health-data-analysis": "Health Data Analysis",
    "health-coaching": "Health Coaching",
    "safety-boundaries": "Safety & Boundaries",
    "personalization-memory": "Personalization & Memory",
    "communication-quality": "Communication Quality",
    // SHARP 2.0 categories
    safety: "Safety",
    usefulness: "Usefulness",
    accuracy: "Accuracy",
    relevance: "Relevance",
    personalization: "Personalization",
  };
  return labelMap[category] || category;
}

export function getCategoryIcon(category: string): string {
  const iconMap: Record<string, string> = {
    safety: "shield",
    usefulness: "lightbulb",
    accuracy: "target",
    relevance: "link",
    personalization: "user",
    "safety-boundaries": "shield",
    "health-coaching": "lightbulb",
    "health-data-analysis": "target",
    "communication-quality": "link",
    "personalization-memory": "user",
  };
  return iconMap[category] || "star";
}

// ============================================================================
// Main Lab Page — 5-Tab Dashboard
// ============================================================================

export function generateEvolutionLab(data: EvolutionLabData): A2UIMessage {
  const ui = new A2UIGenerator("main");

  // ---- Header ----
  const titleId = ui.text(t("evolution.lab"), "h1");
  const subtitleId = ui.text(t("evolution.labSubtitle"), "caption");
  const headerChildren = [titleId, subtitleId];

  if (data.activeVersionBranch) {
    const badgeId = ui.badge(data.activeVersionBranch, { variant: "info" });
    headerChildren.push(badgeId);
  }

  const header = ui.row(headerChildren, { gap: 12, align: "center" });

  // ---- Loading skeleton ----
  if (data.loading) {
    const s1 = ui.skeleton({ variant: "rectangular", height: 80 });
    const s2 = ui.skeleton({ variant: "rectangular", height: 80 });
    const s3 = ui.skeleton({ variant: "rectangular", height: 80 });
    const statsRow = ui.grid([s1, s2, s3], { columns: 3, gap: 16 });
    const s4 = ui.skeleton({ variant: "rectangular", height: 250 });
    const loadingContent = ui.column([statsRow, s4], { gap: 16, padding: 24 });
    const root = ui.column([header, loadingContent], { gap: 0, padding: 16 });
    return ui.build(root);
  }

  // ---- Tab Content ----
  const tabContentIds: Record<string, string> = {};

  if (data.activeTab === "overview") {
    tabContentIds["overview"] = generateOverviewTab(ui, data);
  }
  if (data.activeTab === "benchmark") {
    tabContentIds["benchmark"] = generateBenchmarkTab(ui, data);
  }
  if (data.activeTab === "versions") {
    tabContentIds["versions"] = generateVersionsTab(ui, data);
  }
  if (data.activeTab === "data") {
    tabContentIds["data"] = generateDataTab(ui, data);
  }
  if (data.activeTab === "playground") {
    tabContentIds["playground"] = generatePlaygroundTab(ui, data);
  }

  // ---- Tabs ----
  const tabs = ui.tabs(
    [
      { id: "overview", label: t("evolution.tabOverview"), icon: "bar-chart" },
      { id: "benchmark", label: t("evolution.tabBenchmark"), icon: "test-tube" },
      { id: "playground", label: t("evolution.tabPlayground"), icon: "zap" },
      { id: "versions", label: t("evolution.tabVersions"), icon: "git-branch" },
      { id: "data", label: t("evolution.tabData"), icon: "file-text" },
    ],
    data.activeTab,
    tabContentIds
  );

  const content = ui.column([tabs], { gap: 0, padding: 24 });
  const root = ui.column([header, content], {
    gap: 12,
    padding: 16,
    className: "relative min-h-full",
  } as any);

  return ui.build(root);
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Format a benchmark run's progress as "pct|variant" for the progress renderer.
 * - completed → "100|success" (green)
 * - running   → "N|running"  (blue + pulse)
 * - failed    → "N|error"    (red)
 */
function formatRunProgress(
  r: BenchmarkRunInfo,
  progressMap?: Record<string, ExternalProgressInfo>
): string {
  const status = r.status || (r.duration_ms && r.duration_ms > 0 ? "completed" : "running");
  if (status === "completed") return "100|success";
  if (status === "failed") {
    const pct =
      r.total_test_cases > 0 ? Math.round((r.passed_count / r.total_test_cases) * 100) : 0;
    return `${pct}|error`;
  }
  // running — find matching progress entry from the map
  let ep: ExternalProgressInfo | undefined;
  if (progressMap) {
    const entries = Object.values(progressMap);
    // Match primarily by modelId (always consistent between DB and progress files)
    ep = entries.find((e) => r.modelId && e.modelId && r.modelId === e.modelId);
    // Fallback: if only one entry and no match, use it (default model case)
    if (!ep && entries.length === 1 && !r.modelId) {
      ep = entries[0];
    }
  }
  const pct = ep && ep.total > 0 ? Math.round((ep.current / ep.total) * 100) : 0;
  return `${pct}|running`;
}

// ============================================================================
// Tab 1: Overview
// ============================================================================

function generateOverviewTab(ui: A2UIGenerator, data: EvolutionLabData): string {
  const children: string[] = [];

  // Row 1: Stat Cards
  const statCards: string[] = [];

  if (data.benchmarkRuns && data.benchmarkRuns.length > 0) {
    const rawScore = data.benchmarkRuns[0].overall_score;
    const displayScore = rawScore <= 1.0 ? rawScore : rawScore / 100;
    const gauge = ui.scoreGauge(displayScore, {
      label: t("evolution.latestRun"),
      max: 1.0,
      size: "lg",
    });
    statCards.push(gauge);
  } else if (data.stats && data.stats.totalCount > 0) {
    const avgNorm =
      data.stats.averageScore <= 1.0 ? data.stats.averageScore : data.stats.averageScore / 100;
    const gauge = ui.scoreGauge(avgNorm, {
      label: t("evolution.avgScore"),
      max: 1.0,
      size: "lg",
    });
    statCards.push(gauge);
  } else {
    statCards.push(
      ui.statCard({
        title: t("evolution.score"),
        value: "-",
        subtitle: t("evolution.noBenchmarkRuns"),
        icon: "star",
        color: "#94a3b8",
      })
    );
  }

  if (data.benchmarkRuns && data.benchmarkRuns.length > 0) {
    const latest = data.benchmarkRuns[0];
    statCards.push(
      ui.statCard({
        title: t("evolution.testCases"),
        value: `${latest.passed_count}/${latest.total_test_cases}`,
        subtitle: t("evolution.passed"),
        icon: "test-tube",
        color: "#10b981",
      })
    );
  } else {
    statCards.push(
      ui.statCard({
        title: t("evolution.testCases"),
        value: data.testCaseCount ?? 0,
        icon: "test-tube",
        color: "#10b981",
      })
    );
  }

  statCards.push(
    ui.statCard({
      title: t("evolution.versions"),
      value: data.versionCount ?? 0,
      icon: "git-branch",
      color: "#667eea",
    })
  );

  statCards.push(
    ui.statCard({
      title: t("evolution.currentVersion"),
      value: data.activeVersionBranch || "main",
      icon: "git-commit",
      color: "#818cf8",
    })
  );

  children.push(ui.grid(statCards, { columns: 4, gap: 16 }));

  // Row 2: Score Trend (moved above Arena)
  if (data.scoreTrend && data.scoreTrend.length > 0) {
    const trendLabel = ui.text(t("evolution.scoreTrend"), "label");
    const trendChart = ui.chart({
      chartType: "bar",
      data: data.scoreTrend.map((p) => {
        const displayScore = p.score <= 1.0 ? p.score : p.score / 100;
        return { version: p.version, score: parseFloat(displayScore.toFixed(2)) };
      }),
      xKey: "version",
      yKey: "score",
      height: 200,
      color: "#667eea",
    });
    children.push(ui.card([trendLabel, trendChart], { padding: 16 }));
  }

  // Row 3: Arena Comparison Area (includes radar, scores, category cards, and recent runs)
  if (data.benchmarkRuns && data.benchmarkRuns.length > 0) {
    const arenaChildren: string[] = [];
    const radarMode = data.radarMode || "categories";
    const selectedIds = new Set(data.selectedRunIds || []);
    const selectedOrder = data.selectedRunIds || [];
    const recentRuns = data.benchmarkRuns.slice(0, 10);

    // Header row: title + mode toggle + run picker
    const arenaTitle = ui.text(t("evolution.selectRunsForComparison"), "label");
    const toggleId = `arena_toggle_${Date.now()}`;
    ui.addComponent(toggleId, {
      id: toggleId,
      type: "arena_mode_toggle",
      options: [
        { label: t("evolution.categoriesMode"), value: "categories" },
        { label: t("evolution.criteriaMode"), value: "criteria" },
      ],
      active: radarMode,
      action: "set_radar_mode",
    });

    // Run picker dropdown (replaces pills)
    const pickerId = `arena_picker_${Date.now()}`;
    ui.addComponent(pickerId, {
      id: pickerId,
      type: "arena_run_picker",
      runs: recentRuns.map((r) => ({
        id: r.id,
        label: r.presetName || r.modelId?.split("/").pop() || r.version_tag || r.id.slice(0, 8),
        selected: selectedIds.has(r.id),
        color: selectedIds.has(r.id)
          ? RUN_COLORS[selectedOrder.indexOf(r.id) % RUN_COLORS.length]
          : undefined,
        date: undefined,
        score: r.overall_score > 0 ? r.overall_score : undefined,
      })),
      action: "toggle_benchmark_run",
      clearAction: "clear_run_selection",
    });

    arenaChildren.push(
      ui.row([arenaTitle, toggleId, pickerId], {
        gap: 8,
        align: "center",
        justify: "between",
      })
    );

    // Comparison content
    if (data.comparisonRuns && data.comparisonRuns.length > 0) {
      const refRun = data.comparisonRuns[0];

      // Build category legend from actual data
      const legendCategories = refRun.categoryScores.map((cs) => ({
        name: getCategoryLabel(cs.category),
        color: SHARP_CATEGORY_COLORS[cs.category] || "#818cf8",
      }));

      // Plotly radar chart (with embedded legend data)
      const plotlyId = `plotly_radar_${Date.now()}`;
      const traces = buildPlotlyRadarTraces(data.comparisonRuns, radarMode);
      ui.addComponent(plotlyId, {
        id: plotlyId,
        type: "plotly_radar",
        traces,
        layout: PLOTLY_LAYOUT,
        config: { responsive: true, displayModeBar: false },
        categoryLegend: legendCategories,
      });

      // Score table card (custom component)
      const scoreTitleId = ui.text(t("evolution.overallScores"), "label");
      const scoreTableId = `arena_score_${Date.now()}`;
      ui.addComponent(scoreTableId, {
        id: scoreTableId,
        type: "arena_score_table",
        rows: data.comparisonRuns.map((cr) => ({
          label: cr.label,
          color: cr.color,
          score: cr.overallScore,
        })),
      });
      const scoreCardId = ui.column([scoreTitleId, scoreTableId], {
        gap: 8,
        className: "arena-card",
      } as any);

      // Dashboard grid (plotly radar + scores side by side)
      const radarCardId = ui.column([plotlyId], {
        gap: 8,
        className: "arena-card",
      } as any);
      const dashGridId = ui.column([radarCardId, scoreCardId], {
        gap: 24,
        style: "display: grid; grid-template-columns: 1.2fr 0.8fr;",
      } as any);
      arenaChildren.push(dashGridId);

      // Category Breakdown cards (always show in both modes)
      if (data.comparisonRuns.length > 0) {
        const breakdownTitle = ui.text(t("evolution.categoryBreakdown"), "label");
        arenaChildren.push(breakdownTitle);

        const breakdownCards: string[] = [];
        for (const cs of refRun.categoryScores) {
          if (!cs.subComponents || cs.subComponents.length === 0) continue;
          const avgScore = cs.score <= 1.0 ? cs.score : cs.score / 100;
          const criteria = cs.subComponents.map((sub) => ({
            name: sub.name,
            scores: data.comparisonRuns!.map((cr) => {
              const crCat = cr.categoryScores.find((c) => c.category === cs.category);
              const crSub = crCat?.subComponents?.find((s) => s.name === sub.name);
              const val = crSub?.score ?? 0;
              return { value: val, color: cr.color };
            }),
          }));

          const catCardId = `arena_cat_${cs.category}_${Date.now()}`;
          ui.addComponent(catCardId, {
            id: catCardId,
            type: "arena_category_card",
            categoryName: getCategoryLabel(cs.category),
            categoryColor: SHARP_CATEGORY_COLORS[cs.category] || "#818cf8",
            categoryIcon: getCategoryIcon(cs.category),
            avgScore,
            criteria,
          });
          breakdownCards.push(catCardId);
        }

        if (breakdownCards.length > 0) {
          const breakdownGridId = ui.column(breakdownCards, {
            gap: 20,
            style: "display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));",
          } as any);
          arenaChildren.push(breakdownGridId);
        }
      }
    } else {
      arenaChildren.push(ui.text(t("evolution.noRunsSelected"), "caption"));
    }

    // Recent Benchmark Runs table (merged into Arena section)
    const runsLabel = ui.text(t("evolution.recentRuns"), "label");
    const runRows = data.benchmarkRuns.slice(0, 5).map((r) => {
      const scoreDisplay =
        r.overall_score > 0
          ? (r.overall_score <= 1.0 ? r.overall_score : r.overall_score / 100).toFixed(2)
          : "-";
      return {
        id: r.id,
        progress: formatRunProgress(r, data.externalProgressMap),
        version_tag: r.version_tag || "-",
        score: scoreDisplay,
        passed: `${r.passed_count}/${r.total_test_cases}`,
        model: r.presetName || r.modelId || "-",
        profile: r.profile,
        duration:
          r.duration_ms && r.duration_ms > 0 ? `${(r.duration_ms / 1000).toFixed(1)}s` : "-",
      };
    });
    const runsTable = ui.dataTable(
      [
        { key: "progress", label: t("evolution.progress"), render: "progress" },
        { key: "version_tag", label: t("evolution.versionTag") },
        { key: "score", label: t("evolution.score") },
        { key: "passed", label: t("evolution.passed") },
        { key: "model", label: t("evolution.model") },
        { key: "profile", label: t("evolution.profile"), render: "badge" },
        { key: "duration", label: t("evolution.duration") },
      ],
      runRows,
      { onRowClick: "view_benchmark_run" }
    );

    arenaChildren.push(runsLabel, runsTable);

    children.push(ui.card(arenaChildren, { padding: 16, className: "arena-section" } as any));
  } else {
    const emptyText = ui.text(t("evolution.noBenchmarkRuns"), "caption");
    children.push(ui.card([emptyText], { padding: 24 }));
  }

  // Row 4: Active evolution branch (if any)
  if (data.activeVersionBranch && data.activeVersionBranch !== "main") {
    const branchBadge = ui.badge(data.activeVersionBranch, { variant: "info" });
    const branchLabel = ui.text(t("evolution.activeVersion"), "label");
    const switchBtn = ui.button(t("evolution.switchVersion"), "switch_version", {
      variant: "outline",
      size: "sm",
      payload: { branch: data.activeVersionBranch },
    });
    const mergeBtn = ui.button(t("evolution.mergeVersion"), "merge_version", {
      variant: "primary",
      size: "sm",
      payload: { branch: data.activeVersionBranch },
    });
    const branchRow = ui.row([branchLabel, branchBadge, switchBtn, mergeBtn], {
      gap: 12,
      align: "center",
    });
    children.push(ui.card([branchRow], { padding: 12 }));
  }

  return ui.column(children, { gap: 16, padding: 16 });
}

// ============================================================================
// Tab 2: Benchmark
// ============================================================================

function generateBenchmarkTab(ui: A2UIGenerator, data: EvolutionLabData): string {
  const children: string[] = [];

  // Action buttons
  const quickBtn = ui.button(t("evolution.runQuickBenchmark"), "run_benchmark", {
    variant: "secondary",
    size: "sm",
    payload: { profile: "quick" },
  });
  const fullBtn = ui.button(t("evolution.runFullBenchmark"), "run_benchmark", {
    variant: "secondary",
    size: "sm",
    payload: { profile: "full" },
  });
  children.push(ui.card([ui.row([quickBtn, fullBtn], { gap: 8 })], { padding: 12 }));

  // SHARP Category Breakdown Cards (using arena_category_card style)
  if (data.latestRunCategoryScores && data.latestRunCategoryScores.length > 0) {
    const sharpTitle = ui.text("SHARP 2.0 Evaluation", "h3");
    const sharpCards: string[] = [];

    for (const cs of data.latestRunCategoryScores) {
      const catColor = SHARP_CATEGORY_COLORS[cs.category] || "#818cf8";
      const avgScore = cs.score <= 1.0 ? cs.score : cs.score / 100;
      const criteria = (cs.subComponents || []).map((sub) => ({
        name: sub.name,
        scores: [{ value: sub.score <= 1 ? sub.score : sub.score / 100, color: catColor }],
      }));
      const catCardId = `bench_cat_${cs.category}_${Date.now()}`;
      ui.addComponent(catCardId, {
        id: catCardId,
        type: "arena_category_card",
        categoryName: getCategoryLabel(cs.category),
        categoryColor: catColor,
        categoryIcon: getCategoryIcon(cs.category),
        avgScore,
        criteria,
      });
      sharpCards.push(catCardId);
    }

    const sharpGrid = ui.column(sharpCards, {
      gap: 16,
      style: "display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));",
    } as any);
    children.push(
      ui.card([sharpTitle, sharpGrid], { padding: 16, className: "arena-section" } as any)
    );
  }

  // Test Cases table
  if (data.testCases && data.testCases.length > 0) {
    const testCasesLabel = ui.text(t("evolution.testCases"), "label");
    const testRows = data.testCases.map((tc) => ({
      id: tc.id.slice(0, 8),
      category: tc.category,
      query: tc.query.slice(0, 60) + (tc.query.length > 60 ? "..." : ""),
      minScore: tc.expected.minScore ?? "-",
      keywords: tc.expected.shouldMention?.length || 0,
    }));
    const testsTable = ui.dataTable(
      [
        { key: "category", label: t("evolution.category"), render: "badge" },
        { key: "query", label: t("evolution.query") },
        { key: "minScore", label: t("evolution.minScore") },
        { key: "keywords", label: t("evolution.keywords") },
      ],
      testRows,
      { onRowClick: "view_test_case" }
    );
    const addTestBtn = ui.button(t("evolution.addTestCase"), "create_test_case", {
      variant: "primary",
      size: "sm",
    });
    children.push(ui.card([testCasesLabel, testsTable, addTestBtn], { padding: 16 }));
  }

  // Run History table
  if (data.benchmarkRuns && data.benchmarkRuns.length > 0) {
    const historyLabel = ui.text(t("evolution.benchmarkRuns"), "label");
    const runRows = data.benchmarkRuns.map((r) => {
      const scoreDisplay =
        r.overall_score > 0
          ? (r.overall_score <= 1.0 ? r.overall_score : r.overall_score / 100).toFixed(2)
          : "-";
      return {
        id: r.id,
        time: new Date(r.timestamp).toLocaleString(),
        progress: formatRunProgress(r, data.externalProgressMap),
        version_tag: r.version_tag || "-",
        score: scoreDisplay,
        passed: `${r.passed_count}/${r.total_test_cases}`,
        model: r.presetName || r.modelId || "-",
        profile: r.profile,
        duration:
          r.duration_ms && r.duration_ms > 0 ? `${(r.duration_ms / 1000).toFixed(1)}s` : "-",
      };
    });
    const runsTable = ui.dataTable(
      [
        { key: "time", label: t("evolution.time"), sortable: true },
        { key: "progress", label: t("evolution.progress"), render: "progress" },
        { key: "version_tag", label: t("evolution.versionTag") },
        { key: "score", label: t("evolution.score") },
        { key: "passed", label: t("evolution.passed") },
        { key: "model", label: t("evolution.model") },
        { key: "profile", label: t("evolution.profile"), render: "badge" },
        { key: "duration", label: t("evolution.duration") },
      ],
      runRows,
      { onRowClick: "view_benchmark_run" }
    );
    children.push(ui.card([historyLabel, runsTable], { padding: 16 }));
  }

  // Config summary
  const configHint = ui.text(t("evolution.editConfigHint"), "caption");
  children.push(configHint);

  return ui.column(children, { gap: 20, padding: 16 });
}

// ============================================================================
// Tab 3: Versions
// ============================================================================

function generateVersionsTab(ui: A2UIGenerator, data: EvolutionLabData): string {
  const children: string[] = [];

  // Active version indicator
  if (data.activeVersionBranch) {
    const activeBadge = ui.badge(data.activeVersionBranch, { variant: "info" });
    const activeLabel = ui.text(t("evolution.activeVersion"), "label");
    const resetBtn = ui.button(t("evolution.resetToMain"), "switch_version", {
      variant: "outline",
      size: "sm",
      payload: { branch: null },
    });
    children.push(ui.row([activeLabel, activeBadge, resetBtn], { gap: 12, align: "center" }));
  }

  // Left-right layout: GitLens timeline + detail panel
  const leftChildren: string[] = [];
  const rightChildren: string[] = [];

  // GitLens-style vertical timeline
  if (data.timelineEvents && data.timelineEvents.length > 0) {
    const timelineLabel = ui.text(t("evolution.timeline"), "label");
    leftChildren.push(timelineLabel);

    const timeline = ui.gitTimeline(data.timelineEvents, {
      activeBranch: data.activeVersionBranch || undefined,
      onEventClick: "evo_timeline_click",
      onContextAction: "evo_timeline_context",
      selectedEventId: data.selectedTimelineEvent,
    });
    leftChildren.push(timeline);
  } else {
    leftChildren.push(ui.text(t("evolution.noVersions"), "caption"));
  }

  // Version detail panel (right side)
  if (data.selectedVersion) {
    const selectedInfo = data.versions?.find((v) => v.branchName === data.selectedVersion);

    const detailLabel = ui.text(t("evolution.versionDetail"), "label");
    rightChildren.push(detailLabel);

    if (selectedInfo) {
      const branchBadge = ui.badge(selectedInfo.branchName, { variant: "info" });
      const statusBadge = ui.badge(selectedInfo.status, {
        variant:
          selectedInfo.status === "active"
            ? "warning"
            : selectedInfo.status === "merged"
              ? "success"
              : "default",
      });
      rightChildren.push(ui.row([branchBadge, statusBadge], { gap: 8 }));

      if (selectedInfo.triggerMode) {
        const triggerText = ui.text(
          `${t("evolution.versionTrigger")}: ${selectedInfo.triggerMode} ${selectedInfo.triggerRef || ""}`,
          "caption"
        );
        rightChildren.push(triggerText);
      }

      if (selectedInfo.scoreDelta != null) {
        const sign = selectedInfo.scoreDelta > 0 ? "+" : "";
        const deltaText = ui.text(
          `${t("evolution.scoreDelta")}: ${sign}${selectedInfo.scoreDelta.toFixed(1)}`,
          "caption"
        );
        rightChildren.push(deltaText);
      }
    }

    // Changed files (file tree)
    if (data.changedFiles && data.changedFiles.length > 0) {
      const fileTreeId = ui.fileTree(data.changedFiles, {
        selectedPath: data.diffContent?.path,
        onFileSelect: "evo_file_select",
      });
      rightChildren.push(fileTreeId);

      // Diff view
      if (data.diffContent) {
        const diffId = ui.diffView(data.diffContent.before, data.diffContent.after, {
          title: data.diffContent.path,
          unifiedDiff: data.diffContent.unifiedDiff,
        });
        rightChildren.push(diffId);
      }
    } else {
      rightChildren.push(ui.text(t("evolution.noChanges"), "caption"));
    }

    // Action buttons
    if (selectedInfo && selectedInfo.status === "active") {
      const switchBtn = ui.button(t("evolution.switchVersion"), "switch_version", {
        variant: "outline",
        size: "sm",
        payload: { branch: selectedInfo.branchName },
      });
      const mergeBtn = ui.button(t("evolution.mergeVersion"), "merge_version", {
        variant: "primary",
        size: "sm",
        payload: { branch: selectedInfo.branchName },
      });
      const abandonBtn = ui.button(t("evolution.abandonVersion"), "abandon_version", {
        variant: "ghost",
        size: "sm",
        payload: { branch: selectedInfo.branchName },
      });
      rightChildren.push(ui.row([switchBtn, mergeBtn, abandonBtn], { gap: 12 }));
    }
  } else if (data.selectedTimelineEvent) {
    // Show selected commit detail
    const selectedEvt = data.timelineEvents?.find((e) => e.id === data.selectedTimelineEvent);
    if (selectedEvt) {
      const commitLabel = ui.text(t("evolution.commitDetail"), "label");
      rightChildren.push(commitLabel);

      const typeBadge = ui.badge(selectedEvt.type, { variant: "info" });
      const hashCode = selectedEvt.hash
        ? ui.badge(selectedEvt.hash.slice(0, 7), { variant: "default" })
        : null;
      const badges = [typeBadge];
      if (hashCode) badges.push(hashCode);
      if (selectedEvt.status) {
        badges.push(
          ui.badge(selectedEvt.status, {
            variant:
              selectedEvt.status === "success"
                ? "success"
                : selectedEvt.status === "failed"
                  ? "error"
                  : selectedEvt.status === "active"
                    ? "warning"
                    : "default",
          })
        );
      }
      rightChildren.push(ui.row(badges, { gap: 8 }));

      rightChildren.push(ui.text(selectedEvt.label, "body"));

      if (selectedEvt.description) {
        rightChildren.push(ui.text(selectedEvt.description, "caption"));
      }

      if (selectedEvt.author) {
        rightChildren.push(
          ui.text(`${t("evolution.commitAuthor")}: ${selectedEvt.author}`, "caption")
        );
      }

      if (selectedEvt.filesChanged) {
        const stats: string[] = [`${selectedEvt.filesChanged} ${t("evolution.filesChanged")}`];
        if (selectedEvt.additions) stats.push(`+${selectedEvt.additions}`);
        if (selectedEvt.deletions) stats.push(`-${selectedEvt.deletions}`);
        rightChildren.push(ui.text(stats.join("  "), "caption"));
      }

      if (selectedEvt.branch) {
        rightChildren.push(
          ui.text(`${t("evolution.versionBranch")}: ${selectedEvt.branch}`, "caption")
        );
      }

      if (selectedEvt.tags && selectedEvt.tags.length > 0) {
        const tagBadges = selectedEvt.tags.map((tag) => ui.badge(tag, { variant: "info" }));
        rightChildren.push(ui.row(tagBadges, { gap: 4 }));
      }

      // Context action buttons
      const contextBtns: string[] = [];
      if (selectedEvt.type === "commit" || selectedEvt.type === "merge") {
        contextBtns.push(
          ui.button(t("evolution.viewDiff"), "evo_timeline_context", {
            variant: "outline",
            size: "sm",
            icon: "search",
            payload: { eventId: selectedEvt.id, action: "view_diff" },
          })
        );
        contextBtns.push(
          ui.button(t("evolution.cherryPick"), "evo_timeline_context", {
            variant: "outline",
            size: "sm",
            icon: "git-commit",
            payload: { eventId: selectedEvt.id, action: "cherry_pick" },
          })
        );
        contextBtns.push(
          ui.button(t("evolution.revertCommit"), "evo_timeline_context", {
            variant: "ghost",
            size: "sm",
            icon: "alert-triangle",
            payload: { eventId: selectedEvt.id, action: "revert" },
          })
        );
      }
      if (selectedEvt.type === "branch") {
        contextBtns.push(
          ui.button(t("evolution.switchVersion"), "switch_version", {
            variant: "outline",
            size: "sm",
            payload: { branch: selectedEvt.branch },
          })
        );
        contextBtns.push(
          ui.button(t("evolution.mergeVersion"), "merge_version", {
            variant: "primary",
            size: "sm",
            payload: { branch: selectedEvt.branch },
          })
        );
      }
      if (selectedEvt.type === "benchmark" && selectedEvt.score !== undefined) {
        contextBtns.push(
          ui.button(t("evolution.viewDetails"), "view_benchmark_run", {
            variant: "outline",
            size: "sm",
            icon: "bar-chart",
            payload: { eventId: selectedEvt.id },
          })
        );
      }
      if (contextBtns.length > 0) {
        rightChildren.push(ui.row(contextBtns, { gap: 8, wrap: true } as any));
      }
    }
  } else {
    rightChildren.push(ui.text(t("evolution.selectCommitToView"), "caption"));
  }

  // Two-column layout: timeline (left) + detail (right)
  const leftPanel = ui.column(leftChildren, { gap: 8 });
  const rightPanel = ui.column(rightChildren, { gap: 12 });

  const twoCol = ui.row([leftPanel, rightPanel], {
    gap: 16,
    style: "align-items: flex-start;",
  } as any);

  children.push(twoCol);

  // Versions table (always shown)
  if (data.versions && data.versions.length > 0) {
    const versionRows = data.versions.map((v) => ({
      id: v.id.slice(0, 8),
      branch: v.branchName,
      status: v.status,
      trigger: v.triggerMode || "-",
      scoreDelta:
        v.scoreDelta != null ? `${v.scoreDelta > 0 ? "+" : ""}${v.scoreDelta.toFixed(1)}` : "-",
      files: v.filesChanged.length > 0 ? `${v.filesChanged.length} files` : "-",
      created: new Date(v.createdAt).toLocaleString(),
    }));
    const versionsTable = ui.dataTable(
      [
        { key: "branch", label: t("evolution.versionBranch") },
        { key: "status", label: t("evolution.versionStatus"), render: "badge" },
        { key: "trigger", label: t("evolution.versionTrigger"), render: "badge" },
        { key: "scoreDelta", label: t("evolution.scoreDelta") },
        { key: "files", label: t("evolution.filesChanged") },
        { key: "created", label: t("evolution.time"), sortable: true },
      ],
      versionRows,
      { onRowClick: "view_version" }
    );
    children.push(versionsTable);
  }

  return ui.column(children, { gap: 16, padding: 16 });
}

// ============================================================================
// Tab 4: Data
// ============================================================================

function generateDataTab(ui: A2UIGenerator, data: EvolutionLabData): string {
  const children: string[] = [];

  // Sub-tabs as buttons
  const subTab = data.dataSubTab || "traces";
  const tracesBtn = ui.button(t("evolution.traces"), "evo_data_subtab_change", {
    variant: subTab === "traces" ? "primary" : "ghost",
    size: "sm",
    payload: { tab: "traces" },
  });
  const evalsBtn = ui.button(t("evolution.evaluations"), "evo_data_subtab_change", {
    variant: subTab === "evaluations" ? "primary" : "ghost",
    size: "sm",
    payload: { tab: "evaluations" },
  });
  const suggsBtn = ui.button(t("evolution.suggestions"), "evo_data_subtab_change", {
    variant: subTab === "suggestions" ? "primary" : "ghost",
    size: "sm",
    payload: { tab: "suggestions" },
  });
  children.push(ui.row([tracesBtn, evalsBtn, suggsBtn], { gap: 8 }));

  // Traces sub-tab
  if (subTab === "traces") {
    if (data.traces && data.traces.length > 0) {
      const traceRows = data.traces.map((tr) => ({
        id: tr.id.slice(0, 8),
        time: new Date(tr.timestamp).toLocaleString(),
        message: tr.userMessage.slice(0, 50) + (tr.userMessage.length > 50 ? "..." : ""),
        score: tr.score ?? "-",
      }));
      const tracesTable = ui.dataTable(
        [
          { key: "id", label: "ID" },
          { key: "time", label: t("evolution.time"), sortable: true },
          { key: "message", label: t("evolution.message") },
          { key: "score", label: t("evolution.score"), render: "progress" },
        ],
        traceRows,
        {
          pagination: {
            page: data.tracesPage || 0,
            pageSize: 20,
            total: data.tracesTotal || 0,
          },
          onRowClick: "view_trace",
          onPageChange: "traces_page_change",
        }
      );
      children.push(tracesTable);
    } else {
      children.push(ui.text(t("evolution.noTracesHint"), "caption"));
    }
  }

  // Evaluations sub-tab
  if (subTab === "evaluations") {
    if (data.evaluations && data.evaluations.length > 0) {
      const evalRows = data.evaluations.map((e) => ({
        id: e.id.slice(0, 8),
        traceId: e.traceId.slice(0, 8),
        time: new Date(e.timestamp).toLocaleString(),
        score: e.score,
        feedback: e.feedback?.slice(0, 50) || "-",
      }));
      const evalsTable = ui.dataTable(
        [
          { key: "id", label: "ID" },
          { key: "traceId", label: t("evolution.trace") },
          { key: "time", label: t("evolution.time"), sortable: true },
          { key: "score", label: t("evolution.score"), render: "progress" },
          { key: "feedback", label: t("evolution.feedback") },
        ],
        evalRows,
        { onRowClick: "view_evaluation" }
      );
      children.push(evalsTable);
    } else {
      children.push(ui.text(t("evolution.noEvaluationsHint"), "caption"));
    }
  }

  // Suggestions sub-tab
  if (subTab === "suggestions") {
    if (data.suggestions && data.suggestions.length > 0) {
      const suggRows = data.suggestions.map((s) => ({
        id: s.id.slice(0, 8),
        time: new Date(s.timestamp).toLocaleString(),
        type: s.type,
        target: s.target,
        status: s.status,
        rationale: s.rationale?.slice(0, 50) || "-",
      }));
      const suggsTable = ui.dataTable(
        [
          { key: "id", label: "ID" },
          { key: "time", label: t("evolution.time"), sortable: true },
          { key: "type", label: t("evolution.type"), render: "badge" },
          { key: "target", label: t("evolution.target") },
          { key: "status", label: t("skills.status"), render: "badge" },
          { key: "rationale", label: t("evolution.rationale") },
        ],
        suggRows,
        { onRowClick: "view_suggestion" }
      );
      children.push(suggsTable);
    } else {
      children.push(ui.text(t("evolution.noSuggestionsHint"), "caption"));
    }
  }

  return ui.column(children, { gap: 16, padding: 16 });
}

// ============================================================================
// Tab 5: Agent
// ============================================================================

function generateAgentTab(ui: A2UIGenerator, data: EvolutionLabData): string {
  const children: string[] = [];

  // Pipeline step indicator
  const stepsId = ui.stepIndicator(data.pipelineSteps, { orientation: "horizontal" });
  children.push(stepsId);

  // Chat area
  const chatMsgsId = `evo_chat_msgs_${Date.now()}`;
  ui.addComponent(chatMsgsId, {
    id: chatMsgsId,
    type: "chat_messages",
    messages: data.chatMessages,
    streaming: data.streaming,
    streamingContent: data.streamingContent,
  });
  children.push(chatMsgsId);

  // Approval buttons (visible when pipeline is at "propose" step)
  if (data.currentPipelineStep === "propose" && !data.streaming) {
    const approveBtn = ui.button(t("evolution.approveProposal"), "evo_approve", {
      variant: "primary",
      size: "md",
    });
    const rejectBtn = ui.button(t("evolution.rejectProposal"), "evo_reject", {
      variant: "secondary",
      size: "md",
    });
    const approvalRow = ui.row([approveBtn, rejectBtn], { gap: 12, justify: "center" });
    children.push(ui.card([approvalRow], { padding: 12 }));
  }

  // Chat input
  const chatInputId = `evo_chat_input_${Date.now()}`;
  ui.addComponent(chatInputId, {
    id: chatInputId,
    type: "chat_input",
    disabled: data.streaming,
    placeholder: t("evolution.evoChatPlaceholder"),
    action: "evo_send_message",
  });
  children.push(chatInputId);

  // Collapsible context section
  if (data.agentContextData) {
    const ctxChildren: string[] = [];
    const ctxLabel = ui.text(t("evolution.agentContext"), "label");
    ctxChildren.push(ctxLabel);

    if (data.agentContextData.radarScores && data.agentContextData.radarScores.length > 0) {
      const radarData = data.agentContextData.radarScores.map((cs) => {
        const displayScore = cs.score <= 1.0 ? cs.score : cs.score / 100;
        return {
          label: getCategoryLabel(cs.category),
          value: parseFloat(displayScore.toFixed(3)),
          maxValue: 1.0,
        };
      });
      const radar = ui.radarChart(radarData, {
        size: 200,
        showLabels: true,
        color: "#818cf8",
      });
      ctxChildren.push(radar);
    }

    if (data.agentContextData.changedFiles && data.agentContextData.changedFiles.length > 0) {
      const fileTreeId = ui.fileTree(data.agentContextData.changedFiles, {
        onFileSelect: "evo_file_select",
      });
      ctxChildren.push(fileTreeId);
    }

    if (ctxChildren.length > 1) {
      children.push(ui.card(ctxChildren, { padding: 12 }));
    }
  }

  return ui.column(children, { gap: 12, padding: 16 });
}

// ============================================================================
// Tab 6: Playground
// ============================================================================

function buildPlaygroundPipelineSteps(state: PlaygroundState): PipelineStep[] {
  const stepIds: PlaygroundStep[] = [
    "benchmark",
    "diagnose",
    "propose",
    "approve",
    "apply",
    "validate",
    "analyse",
  ];
  const stepLabels: Record<string, { label: string; icon: string }> = {
    benchmark: { label: t("evolution.pipelineBenchmark"), icon: "test-tube" },
    diagnose: { label: t("evolution.pipelineDiagnose"), icon: "search" },
    propose: { label: t("evolution.pipelinePropose"), icon: "lightbulb" },
    approve: { label: t("evolution.pipelineApprove"), icon: "check" },
    apply: { label: t("evolution.pipelineApply"), icon: "zap" },
    validate: { label: t("evolution.pipelineValidate"), icon: "shield" },
    analyse: { label: t("evolution.pipelineAnalyse"), icon: "brain" },
  };

  const currentIdx = stepIds.indexOf(state.step as PlaygroundStep);
  const isComplete = state.step === "complete";

  return stepIds.map((id, idx) => {
    const cfg = stepLabels[id];
    let status: PipelineStep["status"] = "pending";
    if (isComplete) {
      status = "completed";
    } else if (idx < currentIdx) {
      status = "completed";
    } else if (idx === currentIdx) {
      status = "active";
    }
    return { id, label: cfg.label, icon: cfg.icon, status };
  });
}

function generatePlaygroundTab(ui: A2UIGenerator, data: EvolutionLabData): string {
  const state = data.playgroundState || { step: "idle" as const, log: [], cycleId: null };

  // Determine which step to show details for
  const viewing =
    state.viewingStep ||
    (state.step === "idle" || state.step === "complete" ? state.step : state.step);

  const children: string[] = [];

  // ─── Top: Horizontal Pipeline (always visible) ───
  const steps = buildPlaygroundPipelineSteps(state);
  const pipeline = ui.stepIndicator(steps, {
    orientation: "horizontal",
    onStepClick: "pg_view_step",
  } as any);
  children.push(pipeline);

  // ─── Details Panel (below pipeline, empty when idle) ───
  if (viewing !== "idle") {
    let detailContent: string;
    switch (viewing) {
      case "benchmark":
        detailContent = generatePgBenchmark(ui, state, data);
        break;
      case "diagnose":
        detailContent = generatePgDiagnose(ui, state);
        break;
      case "propose":
        detailContent = generatePgPropose(ui, state);
        break;
      case "approve":
        detailContent = generatePgApprove(ui, state);
        break;
      case "apply":
        detailContent = generatePgApply(ui, state, data);
        break;
      case "validate":
        detailContent = generatePgValidate(ui, state);
        break;
      case "analyse":
        detailContent = generatePgAnalyse(ui, state);
        break;
      case "complete":
        detailContent = generatePgComplete(ui, state);
        break;
      default:
        detailContent = "";
    }
    if (detailContent) children.push(detailContent);
  }

  // ─── Bottom-right: FAB ───
  children.push(generatePgFab(ui, state));

  return ui.column(children, {
    gap: 24,
    padding: 16,
    style: "min-height: calc(100vh - 220px); position: relative;",
  } as any);
}

// ─── FAB helpers ───

const PG_STEP_ORDER: PlaygroundStep[] = [
  "benchmark",
  "diagnose",
  "propose",
  "approve",
  "apply",
  "validate",
  "analyse",
  "complete",
];

function pgStepHasResult(state: PlaygroundState): boolean {
  switch (state.step) {
    case "benchmark":
      return !!state.benchmarkResult;
    case "diagnose":
      return !!state.diagnoseResult;
    case "propose":
      return !!state.proposal;
    case "approve":
      return !!state.approval;
    case "apply":
      return !!state.applyResult;
    case "validate":
      return !!state.validateResult;
    case "analyse":
      return !!state.analyseResult;
    default:
      return false;
  }
}

function pgGetNextStep(current: PlaygroundStep): string {
  const idx = PG_STEP_ORDER.indexOf(current);
  return idx >= 0 && idx < PG_STEP_ORDER.length - 1 ? PG_STEP_ORDER[idx + 1] : "complete";
}

function generatePgFab(ui: A2UIGenerator, state: PlaygroundState): string {
  let primary: { icon: string; action: string; payload?: Record<string, unknown> };
  const actions: {
    icon: string;
    action: string;
    payload?: Record<string, unknown>;
    tooltip?: string;
  }[] = [];

  if (state.step === "idle") {
    primary = { icon: "play", action: "pg_start_cycle", payload: { profile: "quick" } };
    actions.push(
      {
        icon: "zap",
        action: "pg_start_cycle",
        payload: { profile: "quick" },
        tooltip: "Quick (5)",
      },
      {
        icon: "target",
        action: "pg_start_cycle",
        payload: { profile: "full" },
        tooltip: "Full (16)",
      }
    );
  } else if (state.step === "complete") {
    primary = { icon: "refresh-cw", action: "pg_reset" };
    actions.push(
      {
        icon: "zap",
        action: "pg_start_cycle",
        payload: { profile: "quick" },
        tooltip: t("evolution.rerunQuick"),
      },
      {
        icon: "target",
        action: "pg_start_cycle",
        payload: { profile: "full" },
        tooltip: t("evolution.rerunFull"),
      }
    );
  } else if (state.paused) {
    primary = { icon: "play", action: "pg_continue" };
    actions.push({
      icon: "refresh-cw",
      action: "pg_retry_step",
      tooltip: t("evolution.retry"),
    });
  } else if (pgStepHasResult(state)) {
    const nextStep = pgGetNextStep(state.step);
    primary = { icon: "skip-forward", action: "pg_advance", payload: { nextStep } };
    // Retry current step
    actions.push({
      icon: "refresh-cw",
      action: "pg_retry_step",
      tooltip: t("evolution.retryStep"),
    });
    // Rerun benchmark from scratch
    actions.push(
      {
        icon: "zap",
        action: "pg_start_cycle",
        payload: { profile: "quick" },
        tooltip: t("evolution.rerunQuick"),
      },
      {
        icon: "target",
        action: "pg_start_cycle",
        payload: { profile: "full" },
        tooltip: t("evolution.rerunFull"),
      }
    );
  } else {
    // Running: show pause + retry
    primary = { icon: "pause", action: "pg_pause" };
    actions.push({
      icon: "refresh-cw",
      action: "pg_retry_step",
      tooltip: t("evolution.retry"),
    });
  }

  const fabId = `pg_fab_${Date.now()}`;
  ui.addComponent(fabId, { id: fabId, type: "playground_fab", primary, actions });
  return fabId;
}

function generatePgBenchmark(
  ui: A2UIGenerator,
  state: PlaygroundState,
  data: EvolutionLabData
): string {
  // Running: progress bar
  if (state.benchmarkProgress && !state.benchmarkResult) {
    const pct = Math.round(
      (state.benchmarkProgress.current / Math.max(state.benchmarkProgress.total, 1)) * 100
    );
    const progressText = ui.text(
      `${state.benchmarkProgress.current}/${state.benchmarkProgress.total} test cases`,
      "body"
    );
    const progressBar = ui.progress(pct, { variant: "info" });
    return ui.card([ui.text(t("evolution.benchmarkRunning"), "h3"), progressBar, progressText], {
      padding: 16,
    });
  }

  // Complete: score gauge + radar + category cards
  if (state.benchmarkResult) {
    const result = state.benchmarkResult;
    const gauge = ui.scoreGauge(result.overallScore, { max: 1.0, size: "lg" });
    const statItems: string[] = [
      gauge,
      ui.text(`${result.passedCount}/${result.totalCount} passed`, "caption"),
      ui.text(`${(result.durationMs / 1000).toFixed(1)}s`, "caption"),
    ];
    if (result.versionTag) {
      statItems.push(ui.badge(result.versionTag, { variant: "default" }));
    }
    if (result.modelId) {
      const shortModel = result.modelId.split("/").pop() || result.modelId;
      statItems.push(ui.text(shortModel, "caption"));
    }
    const statsCol = ui.column(statItems, {
      gap: 8,
      align: "center",
      style: "flex: 0 0 auto; min-width: 180px;",
    } as any);

    // Radar mode toggle (5 categories / 16 criteria)
    const radarMode = data.radarMode || "categories";
    const toggleId = `pg_radar_toggle_${Date.now()}`;
    ui.addComponent(toggleId, {
      id: toggleId,
      type: "arena_mode_toggle",
      options: [
        { label: t("evolution.categoriesMode"), value: "categories" },
        { label: t("evolution.criteriaMode"), value: "criteria" },
      ],
      active: radarMode,
      action: "set_radar_mode",
    });

    // Build plotly radar (same style as overview page)
    const pgRun: ComparisonRun = {
      id: result.runId,
      label: result.profile === "full" ? "Full" : "Quick",
      color: RUN_COLORS[0],
      overallScore: result.overallScore,
      categoryScores: result.categoryScores,
    };
    const traces = buildPlotlyRadarTraces([pgRun], radarMode);
    const radarId = `pg_radar_${Date.now()}`;
    ui.addComponent(radarId, {
      id: radarId,
      type: "plotly_radar",
      traces,
      height: 350,
      layout: { ...PLOTLY_LAYOUT, showlegend: false, margin: { t: 30, b: 30, l: 50, r: 50 } },
      config: { responsive: true, displayModeBar: false },
    });

    const catCards: string[] = [];
    for (const cs of result.categoryScores) {
      const catColor = SHARP_CATEGORY_COLORS[cs.category] || "#818cf8";
      const catCardId = `pg_bench_cat_${cs.category}_${Date.now()}`;
      ui.addComponent(catCardId, {
        id: catCardId,
        type: "arena_category_card",
        categoryName: getCategoryLabel(cs.category),
        categoryColor: catColor,
        categoryIcon: getCategoryIcon(cs.category),
        avgScore: cs.score <= 1.0 ? cs.score : cs.score / 100,
        criteria: (cs.subComponents || []).map((sub) => ({
          name: sub.name,
          scores: [{ value: sub.score <= 1 ? sub.score : sub.score / 100, color: catColor }],
        })),
      });
      catCards.push(catCardId);
    }
    const catGrid = ui.column(catCards, {
      gap: 16,
      style: "display: grid; grid-template-columns: repeat(2, 1fr);",
    } as any);

    return ui.column(
      [
        ui.card(
          [
            ui.text(t("evolution.benchmarkComplete"), "h3"),
            ui.row(
              [
                statsCol,
                ui.column([toggleId, radarId], {
                  gap: 8,
                  align: "center",
                  style: "flex: 1; min-width: 0;",
                } as any),
              ],
              { gap: 24, align: "center" }
            ),
          ],
          { padding: 20 }
        ),
        catGrid,
      ],
      { gap: 16 }
    );
  }

  return ui.card(
    [
      ui.text(t("evolution.benchmarkRunning"), "h3"),
      ui.skeleton({ variant: "rectangular", height: 200 }),
    ],
    { padding: 16 }
  );
}

function generatePgDiagnose(ui: A2UIGenerator, state: PlaygroundState): string {
  if (!state.diagnoseResult) {
    const children: string[] = [ui.text(t("evolution.diagnosing"), "h3")];
    if (state.diagnoseProgress) {
      children.push(ui.badge(state.diagnoseProgress, { variant: "info" }));
    } else {
      children.push(ui.text(t("evolution.diagnosePipelineSteps"), "body"));
    }
    children.push(ui.skeleton({ variant: "rectangular", height: 120 }));
    children.push(ui.text(t("evolution.diagnosePipelineHint"), "caption"));
    return ui.card(children, { padding: 16 });
  }

  const { weaknesses, suggestions } = state.diagnoseResult;
  const children: string[] = [];

  const weakTitle = ui.text(`${t("evolution.weakCategories")}: ${weaknesses.length}`, "h3");
  children.push(weakTitle);

  for (const w of weaknesses) {
    const scoreText = ui.text(`${w.label}: ${w.score.toFixed(2)}`, "h3");
    const gap = ui.badge(`gap: ${w.gap.toFixed(2)}`, { variant: "warning" });
    const failing = ui.text(`${w.failingCount} ${t("evolution.diagnoseFailingTests")}`, "body");
    const cardChildren = [ui.row([scoreText, gap], { gap: 8, align: "center" }), failing];

    // Sub-component breakdown
    if (w.weakSubComponents && w.weakSubComponents.length > 0) {
      const subCompText = w.weakSubComponents
        .map((sc) => `${sc.name}: ${sc.score.toFixed(2)}`)
        .join(" | ");
      cardChildren.push(ui.text(`${t("evolution.weakSubComponents")}: ${subCompText}`, "caption"));
    }

    if (w.patterns.length > 0) {
      cardChildren.push(
        ui.text(`${t("evolution.diagnosePatterns")}: ${w.patterns.join(", ")}`, "body")
      );
    }
    children.push(ui.card(cardChildren, { padding: 12 }));
  }

  if (suggestions.length > 0) {
    const sugTitle = ui.text(t("evolution.suggestions"), "h3");
    const sugRows = suggestions.map((s, i) => ({
      index: i + 1,
      category: s.category,
      description: s.description,
      files: s.targetFiles.join(", "),
      priority: s.priority,
    }));
    const sugTable = ui.dataTable(
      [
        { key: "category", label: t("evolution.category"), render: "badge" },
        { key: "description", label: t("evolution.rationale") },
        { key: "files", label: t("evolution.filesChanged") },
        { key: "priority", label: t("evolution.priority"), render: "badge" },
      ],
      sugRows
    );
    children.push(sugTitle, sugTable);
  }

  if (weaknesses.length === 0) {
    children.push(ui.card([ui.text(t("evolution.noWeaknesses"), "body")], { padding: 16 }));
  }

  return ui.column(children, { gap: 12 });
}

function generatePgPropose(ui: A2UIGenerator, state: PlaygroundState): string {
  const children: string[] = [];

  if (!state.proposal) {
    const loadingChildren: string[] = [ui.text(t("evolution.pipelinePropose"), "h3")];
    if (state.proposeProgress) {
      loadingChildren.push(ui.badge(state.proposeProgress, { variant: "info" }));
    }
    loadingChildren.push(ui.skeleton({ variant: "rectangular", height: 120 }));
    loadingChildren.push(ui.text(t("evolution.proposeGenerating"), "caption"));
    children.push(ui.card(loadingChildren, { padding: 16 }));
  } else {
    const { description, changes, expectedImprovement } = state.proposal;

    // ── Header row: title + file count badge ──
    const headerItems: string[] = [ui.text(t("evolution.pipelinePropose"), "h3")];
    if (changes.length > 0) {
      headerItems.push(
        ui.badge(`${changes.length} ${t("evolution.filesChanged")}`, {
          variant: "info",
          size: "sm",
        })
      );
    }
    children.push(ui.row(headerItems, { gap: 8, align: "center" }));

    // ── Summary stat cards ──
    const statCards: string[] = [];
    if (expectedImprovement) {
      statCards.push(
        ui.statCard({
          title: t("evolution.expectedImprovement"),
          value: expectedImprovement,
          icon: "trending-up",
          color: "green",
        })
      );
    }
    if (statCards.length > 0) {
      children.push(ui.row(statCards, { gap: 12 }));
    }

    // ── Description in collapsible ──
    children.push(
      ui.collapsible(t("evolution.proposalOverview"), [ui.text(description, "body")], {
        expanded: true,
        icon: "lightbulb",
      })
    );

    // ── File changes as individual cards ──
    if (changes.length > 0) {
      children.push(ui.text(t("evolution.changeDescription"), "label"));
      const fileCards = changes.map((f) =>
        ui.card(
          [ui.badge(f.path, { variant: "default", size: "sm" }), ui.text(f.description, "body")],
          { padding: 12 }
        )
      );
      children.push(ui.column(fileCards, { gap: 8 }));
    }
  }

  return ui.card(children, { padding: 16 });
}

function generatePgApprove(ui: A2UIGenerator, state: PlaygroundState): string {
  const children: string[] = [];
  children.push(ui.text(t("evolution.pipelineApprove"), "h3"));
  children.push(ui.badge(t("evolution.humanReviewRequired"), { variant: "warning" }));

  if (state.proposal) {
    children.push(ui.text(state.proposal.description, "body"));
    if (state.proposal.changes.length > 0) {
      const files = state.proposal.changes.map((c) => `- ${c.path}: ${c.description}`).join("\n");
      children.push(ui.text(files, "body"));
    }
    if (state.proposal.expectedImprovement) {
      children.push(ui.text(`Expected: ${state.proposal.expectedImprovement}`, "caption"));
    }
  }

  const approveBtn = ui.button(t("evolution.approveProposal"), "pg_approve", {
    variant: "primary",
    size: "md",
    payload: { approved: true },
  });
  const rejectBtn = ui.button(t("evolution.rejectProposal"), "pg_approve", {
    variant: "ghost",
    size: "md",
    payload: { approved: false },
  });
  children.push(ui.row([approveBtn, rejectBtn], { gap: 12, justify: "center" }));

  return ui.card(children, { padding: 16 });
}

function generatePgApply(
  ui: A2UIGenerator,
  state: PlaygroundState,
  data: EvolutionLabData
): string {
  const children: string[] = [];
  children.push(ui.text(t("evolution.pipelineApply"), "h3"));

  if (state.applyResult) {
    const { branch, commits, filesChanged } = state.applyResult;
    // ── Summary stats ──
    const stats: string[] = [];
    stats.push(
      ui.statCard({ title: t("evolution.versionBranch"), value: branch, icon: "git-branch" })
    );
    if (commits.length > 0) {
      stats.push(ui.statCard({ title: "Commits", value: commits.length, icon: "git-commit" }));
    }
    children.push(ui.row(stats, { gap: 12 }));

    // ── File tree ──
    if (filesChanged.length > 0) {
      const fileTree = ui.fileTree(
        filesChanged.map((f) => ({
          path: f.path,
          status: f.status as "added" | "modified" | "deleted" | "renamed",
          additions: 0,
          deletions: 0,
        })),
        { onFileSelect: "pg_file_select", selectedPath: data.diffContent?.path }
      );
      children.push(fileTree);
    }

    // ── Diff view (when a file is selected) ──
    if (data.diffContent) {
      children.push(
        ui.diffView(data.diffContent.before, data.diffContent.after, {
          title: data.diffContent.path,
          unifiedDiff: data.diffContent.unifiedDiff,
        })
      );
    }
  } else if (state.applyError) {
    // Error state
    children.push(ui.badge("Failed", { variant: "error" }));
    children.push(ui.text(state.applyError, "body"));
  } else {
    // Loading state with progress
    if (state.applyPrompt) {
      children.push(
        ui.collapsible(t("evolution.pipelineApply") + " — Task", [
          ui.text(state.applyPrompt, "body"),
        ])
      );
    }
    if (state.applyProgress) {
      children.push(ui.badge(state.applyProgress, { variant: "info" }));
    }
    children.push(ui.text(t("evolution.applying"), "body"));
    children.push(ui.skeleton({ variant: "rectangular", height: 100 }));
  }

  return ui.card(children, { padding: 16 });
}

function generatePgValidate(ui: A2UIGenerator, state: PlaygroundState): string {
  const children: string[] = [];
  children.push(ui.text(t("evolution.pipelineValidate"), "h3"));

  if (state.validateResult) {
    const { beforeScore, afterScore, delta, categoryDeltas, recommendation } = state.validateResult;
    const deltaSign = delta >= 0 ? "+" : "";
    const scoreSummary = ui.text(
      `${beforeScore.toFixed(2)} → ${afterScore.toFixed(2)} (${deltaSign}${delta.toFixed(2)})`,
      "h2"
    );
    children.push(scoreSummary);

    // Check if sub-component data is available for criteria mode
    const beforeCatScores = state.validateResult.beforeCategoryScores;
    const afterCatScores = state.validateResult.afterCategoryScores;
    const hasSubComponents =
      beforeCatScores &&
      afterCatScores &&
      beforeCatScores.some((cs) => cs.subComponents && cs.subComponents.length > 0);

    // Only show toggle when criteria data exists; otherwise force categories mode
    const radarMode = hasSubComponents ? state.validateRadarMode || "categories" : "categories";

    if (hasSubComponents) {
      const toggleId = `pg_validate_toggle_${Date.now()}`;
      ui.addComponent(toggleId, {
        id: toggleId,
        type: "arena_mode_toggle",
        options: [
          { label: t("evolution.categoriesMode"), value: "categories" },
          { label: t("evolution.criteriaMode"), value: "criteria" },
        ],
        active: radarMode,
        action: "pg_validate_radar_mode",
      });
      children.push(toggleId);
    }

    // Build before/after ComparisonRuns with full category data (including subComponents)
    let beforeCategories: CategoryScoreInfo[];
    let afterCategories: CategoryScoreInfo[];

    if (beforeCatScores && afterCatScores) {
      beforeCategories = beforeCatScores;
      afterCategories = afterCatScores;
    } else {
      // Fallback: construct from categoryDeltas (no subComponents)
      beforeCategories = categoryDeltas.map((d) => ({
        category: d.category,
        score: d.before,
        test_count: 0,
        passed_count: 0,
      }));
      afterCategories = categoryDeltas.map((d) => ({
        category: d.category,
        score: d.after,
        test_count: 0,
        passed_count: 0,
      }));
    }

    const validateTraces = buildPlotlyRadarTraces(
      [
        {
          id: "before",
          label: "Before",
          color: "rgb(148, 163, 184)",
          overallScore: beforeScore,
          categoryScores: beforeCategories,
        },
        {
          id: "after",
          label: "After",
          color: RUN_COLORS[0],
          overallScore: afterScore,
          categoryScores: afterCategories,
        },
      ],
      radarMode
    );
    const validateRadarId = `pg_validate_radar_${Date.now()}`;
    ui.addComponent(validateRadarId, {
      id: validateRadarId,
      type: "plotly_radar",
      traces: validateTraces,
      layout: { ...PLOTLY_LAYOUT, margin: { t: 40, b: 60, l: 60, r: 60 } },
      config: { responsive: true, displayModeBar: false },
    });
    children.push(validateRadarId);

    // Delta table: criteria mode shows sub-components, categories mode shows 5 categories
    if (radarMode === "criteria" && hasSubComponents && beforeCatScores && afterCatScores) {
      // Build rows from sub-components
      const subRows: Array<{ category: string; before: string; after: string; delta: string }> = [];
      for (const bcs of beforeCatScores) {
        const acs = afterCatScores.find((a) => a.category === bcs.category);
        for (const bsub of bcs.subComponents || []) {
          const asub = acs?.subComponents?.find((s) => s.name === bsub.name);
          const bScore = bsub.score <= 1 ? bsub.score : bsub.score / 100;
          const aScore = asub ? (asub.score <= 1 ? asub.score : asub.score / 100) : 0;
          const d = aScore - bScore;
          subRows.push({
            category: bsub.name,
            before: bScore.toFixed(2),
            after: aScore.toFixed(2),
            delta: `${d >= 0 ? "+" : ""}${d.toFixed(2)}`,
          });
        }
      }
      children.push(
        ui.dataTable(
          [
            { key: "category", label: t("evolution.criteria"), render: "badge" },
            { key: "before", label: "Before" },
            { key: "after", label: "After" },
            { key: "delta", label: "Delta" },
          ],
          subRows
        )
      );
    } else {
      const deltaRows = categoryDeltas.map((d) => ({
        category: d.category,
        before: d.before.toFixed(2),
        after: d.after.toFixed(2),
        delta: `${d.after - d.before >= 0 ? "+" : ""}${(d.after - d.before).toFixed(2)}`,
      }));
      children.push(
        ui.dataTable(
          [
            { key: "category", label: t("evolution.category"), render: "badge" },
            { key: "before", label: "Before" },
            { key: "after", label: "After" },
            { key: "delta", label: "Delta" },
          ],
          deltaRows
        )
      );
    }

    const recBadge = ui.badge(
      recommendation === "merge"
        ? "Merge Recommended"
        : recommendation === "revert"
          ? "Revert Recommended"
          : "Iterate",
      {
        variant:
          recommendation === "merge"
            ? "success"
            : recommendation === "revert"
              ? "error"
              : "warning",
      }
    );
    children.push(recBadge);
  } else if (state.validateError) {
    children.push(ui.badge("Failed", { variant: "error" }));
    children.push(ui.text(state.validateError, "body"));
  } else {
    if (state.validateProgress) {
      children.push(ui.badge(state.validateProgress, { variant: "info" }));
    }
    children.push(ui.text(t("evolution.validating"), "body"));
    children.push(ui.skeleton({ variant: "rectangular", height: 200 }));
  }

  return ui.card(children, { padding: 16 });
}

function generatePgAnalyse(ui: A2UIGenerator, state: PlaygroundState): string {
  const children: string[] = [];
  children.push(ui.text(t("evolution.pipelineAnalyse"), "h3"));

  if (state.analyseResult) {
    const { summary, recommendation, confidence, keyFindings } = state.analyseResult;

    // Stat cards: recommendation + confidence
    const recCard = ui.statCard({
      title: t("evolution.pipelineAnalyse"),
      value:
        recommendation === "merge"
          ? t("evolution.mergeVersion")
          : recommendation === "revert"
            ? t("evolution.abandonVersion")
            : t("evolution.startNewCycle"),
      icon:
        recommendation === "merge"
          ? "git-merge"
          : recommendation === "revert"
            ? "alert-triangle"
            : "refresh-cw",
      color:
        recommendation === "merge"
          ? "#4ade80"
          : recommendation === "revert"
            ? "#f87171"
            : "#fbbf24",
    });
    const confCard = ui.statCard({
      title: t("evolution.analyseConfidence"),
      value: `${Math.round(confidence * 100)}%`,
      icon: "target",
      color: confidence >= 0.7 ? "#4ade80" : confidence >= 0.4 ? "#fbbf24" : "#f87171",
    });
    children.push(ui.grid([recCard, confCard], { columns: 2, gap: 16 }));

    // Key findings
    if (keyFindings.length > 0) {
      children.push(ui.text(t("evolution.keyFindings"), "label"));
      const findingItems = keyFindings.map((f) => ui.text(`- ${f}`, "body"));
      children.push(ui.column(findingItems, { gap: 4 }));
    }

    // Detailed analysis (collapsible)
    if (summary) {
      children.push(
        ui.collapsible(t("evolution.analyseReport"), [ui.text(summary, "body")], {
          expanded: false,
          icon: "brain",
        })
      );
    }

    // Decision buttons (moved from validate)
    const mergeBtn = ui.button(t("evolution.mergeVersion"), "pg_complete", {
      variant: "primary",
      size: "md",
      payload: { action: "merge" },
    });
    const revertBtn = ui.button(t("evolution.abandonVersion"), "pg_complete", {
      variant: "ghost",
      size: "md",
      payload: { action: "revert" },
    });
    const newCycleBtn = ui.button(t("evolution.startNewCycle"), "pg_complete", {
      variant: "secondary",
      size: "md",
      payload: { action: "new_cycle" },
    });
    children.push(ui.row([mergeBtn, revertBtn, newCycleBtn], { gap: 12, justify: "center" }));
  } else if (state.analyseError) {
    children.push(ui.badge("Failed", { variant: "error" }));
    children.push(ui.text(state.analyseError, "body"));
  } else {
    if (state.analyseProgress) {
      children.push(ui.badge(state.analyseProgress, { variant: "info" }));
    }
    children.push(ui.text(t("evolution.analysing"), "body"));
    children.push(ui.skeleton({ variant: "rectangular", height: 150 }));
  }

  return ui.card(children, { padding: 16 });
}

function generatePgComplete(ui: A2UIGenerator, state: PlaygroundState): string {
  const children: string[] = [];
  children.push(ui.text(t("evolution.cycleComplete"), "h2"));

  if (state.benchmarkResult && state.validateResult) {
    const before = state.benchmarkResult.overallScore;
    const after = state.validateResult.afterScore;
    const delta = after - before;
    const deltaSign = delta >= 0 ? "+" : "";
    children.push(
      ui.text(
        `Score: ${before.toFixed(2)} → ${after.toFixed(2)} (${deltaSign}${delta.toFixed(2)})`,
        "h3"
      )
    );
  }

  if (state.applyResult?.branch) {
    const branchStatus = state.validateResult?.recommendation === "merge" ? "merged" : "reverted";
    children.push(ui.text(`Branch: ${state.applyResult.branch} (${branchStatus})`, "body"));
  }

  const duration = state.startedAt ? `${((Date.now() - state.startedAt) / 1000).toFixed(0)}s` : "-";
  children.push(ui.text(`Duration: ${duration}`, "caption"));

  return ui.card(children, { padding: 24 });
}

function generateEvolutionConsole(
  ui: A2UIGenerator,
  data: EvolutionLabData,
  state: PlaygroundState
): string {
  const children: string[] = [];

  // Header: "Evolution Console" title + status indicator
  const statusDot = state.step === "idle" ? "pg-status-idle" : "pg-status-active";
  const headerRow = ui.row(
    [
      ui.text(t("evolution.evolutionConsole"), "label"),
      ui.badge(state.step, { variant: state.step === "idle" ? "default" : "info" }),
    ],
    { gap: 8, align: "center", className: `pg-console-header ${statusDot}` } as any
  );
  children.push(headerRow);

  // Event Log (terminal-style — last 10 entries, wrapped in a div with class)
  if (state.log.length > 0) {
    const logLines = state.log
      .slice(-10)
      .map((e) => {
        const time = new Date(e.timestamp).toLocaleTimeString();
        const prefix =
          e.type === "error"
            ? "ERR"
            : e.type === "success"
              ? "OK "
              : e.type === "warning"
                ? "WRN"
                : "INF";
        return `[${time}] ${prefix} ${e.message}`;
      })
      .join("\n");
    const logContainer = ui.column([ui.text(logLines, "body")], {
      gap: 0,
      className: "pg-event-log",
    } as any);
    children.push(logContainer);
  }

  // Agent Chat (with noWelcome flag — no PHA welcome page)
  const chatMsgsId = `pg_chat_msgs_${Date.now()}`;
  ui.addComponent(chatMsgsId, {
    id: chatMsgsId,
    type: "chat_messages",
    messages: data.chatMessages,
    streaming: data.streaming,
    streamingContent: data.streamingContent,
    noWelcome: true,
  });
  children.push(chatMsgsId);

  // Chat Input
  const chatInputId = `pg_chat_input_${Date.now()}`;
  ui.addComponent(chatInputId, {
    id: chatInputId,
    type: "chat_input",
    disabled: data.streaming,
    placeholder: t("evolution.playgroundChatPlaceholder"),
    action: "pg_send_message",
  });
  children.push(chatInputId);

  return ui.card(children, { padding: 0, className: "pg-console-card" } as any);
}
