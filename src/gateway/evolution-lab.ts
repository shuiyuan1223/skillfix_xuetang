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

export interface EvolutionLabData {
  activeTab: "overview" | "benchmark" | "versions" | "data" | "agent";
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
  diffContent?: { before: string; after: string; path: string };
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
const SHARP_CATEGORY_COLORS: Record<string, string> = {
  safety: "#ff6b6b",
  usefulness: "#4ecdc4",
  accuracy: "#ffe66d",
  relevance: "#95e1d3",
  personalization: "#dda0dd",
};

export const RUN_COLORS = ["#6366f1", "#ec4899", "#22d3ee", "#f59e0b", "#10b981"];

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

function getCategoryLabel(category: string): string {
  const labelMap: Record<string, string> = {
    "health-data-analysis": t("evolution.healthDataAnalysis"),
    "health-coaching": t("evolution.healthCoaching"),
    "safety-boundaries": t("evolution.safetyBoundaries"),
    "personalization-memory": t("evolution.personalization"),
    "communication-quality": t("evolution.communicationQuality"),
    // SHARP 2.0 categories
    safety: "Safety",
    usefulness: "Usefulness",
    accuracy: "Accuracy",
    relevance: "Relevance",
    personalization: "Personalization",
  };
  return labelMap[category] || category;
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
  if (data.activeTab === "agent") {
    tabContentIds["agent"] = generateAgentTab(ui, data);
  }

  // ---- Tabs ----
  const tabs = ui.tabs(
    [
      { id: "overview", label: t("evolution.tabOverview"), icon: "bar-chart" },
      { id: "benchmark", label: t("evolution.tabBenchmark"), icon: "test-tube" },
      { id: "versions", label: t("evolution.tabVersions"), icon: "git-branch" },
      { id: "data", label: t("evolution.tabData"), icon: "file-text" },
      { id: "agent", label: t("evolution.tabAgent"), icon: "sparkles" },
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
    const displayScore = rawScore <= 1.0 ? Math.round(rawScore * 100) : Math.round(rawScore);
    const gauge = ui.scoreGauge(displayScore, {
      label: t("evolution.latestRun"),
      max: 100,
      size: "lg",
    });
    statCards.push(gauge);
  } else if (data.stats && data.stats.totalCount > 0) {
    const gauge = ui.scoreGauge(data.stats.averageScore, {
      label: t("evolution.avgScore"),
      max: 100,
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

  // Row 2: Arena Comparison Area
  if (data.benchmarkRuns && data.benchmarkRuns.length > 0) {
    const arenaChildren: string[] = [];

    // Header row: title + mode toggle
    const arenaTitle = ui.text(t("evolution.selectRunsForComparison"), "label");
    const radarMode = data.radarMode || "categories";
    const catBtn = ui.button(t("evolution.categoriesMode"), "set_radar_mode", {
      variant: radarMode === "categories" ? "primary" : "outline",
      size: "sm",
      payload: { mode: "categories" },
    });
    const critBtn = ui.button(t("evolution.criteriaMode"), "set_radar_mode", {
      variant: radarMode === "criteria" ? "primary" : "outline",
      size: "sm",
      payload: { mode: "criteria" },
    });
    arenaChildren.push(
      ui.row([arenaTitle, catBtn, critBtn], { gap: 8, align: "center", justify: "between" })
    );

    // Run selector pills
    const selectedIds = new Set(data.selectedRunIds || []);
    const pillBtns: string[] = [];
    const recentRuns = data.benchmarkRuns.slice(0, 10);
    for (const r of recentRuns) {
      const shortLabel =
        r.presetName || r.modelId?.split("/").pop() || r.version_tag || r.id.slice(0, 8);
      const isSelected = selectedIds.has(r.id);
      pillBtns.push(
        ui.button(isSelected ? `● ${shortLabel}` : `○ ${shortLabel}`, "toggle_benchmark_run", {
          variant: isSelected ? "primary" : "outline",
          size: "sm",
          payload: { runId: r.id },
        })
      );
    }
    if (selectedIds.size > 0) {
      pillBtns.push(
        ui.button(t("evolution.clearSelection"), "clear_run_selection", {
          variant: "ghost",
          size: "sm",
        })
      );
    }
    arenaChildren.push(ui.row(pillBtns, { gap: 4, wrap: true } as any));

    // Comparison content
    if (data.comparisonRuns && data.comparisonRuns.length > 0) {
      const multiSeries = buildMultiSeriesRadarData(data.comparisonRuns, radarMode);
      const radar = ui.radarChart([], { multiSeries, size: 320, showLabels: true });

      // Overall scores table
      const scoreRows = data.comparisonRuns.map((cr) => ({
        run: `● ${cr.label}`,
        score: Math.round(cr.overallScore * 100),
      }));
      const scoreTable = ui.dataTable(
        [
          { key: "run", label: t("evolution.runs") },
          { key: "score", label: t("evolution.score"), render: "progress" },
        ],
        scoreRows
      );
      const scoreTitle = ui.text(t("evolution.overallScores"), "label");
      const rightCol = ui.column([scoreTitle, scoreTable], { gap: 8 });

      arenaChildren.push(ui.row([radar, rightCol], { gap: 16 }));

      // Category Breakdown (criteria mode)
      if (radarMode === "criteria" && data.comparisonRuns.length > 0) {
        const breakdownTitle = ui.text(t("evolution.categoryBreakdown"), "label");
        arenaChildren.push(breakdownTitle);

        const refRun = data.comparisonRuns[0];
        for (const cs of refRun.categoryScores) {
          if (!cs.subComponents || cs.subComponents.length === 0) continue;
          const catColor = SHARP_CATEGORY_COLORS[cs.category] || "#818cf8";
          const avgScore = cs.score <= 1.0 ? cs.score : cs.score / 100;
          const colDefs: Array<{
            key: string;
            label: string;
            render?: "text" | "badge" | "progress" | "date" | "link";
          }> = [{ key: "criterion", label: t("evolution.criteria") }];
          for (const cr of data.comparisonRuns) {
            colDefs.push({ key: `run_${cr.id.slice(0, 8)}`, label: cr.label, render: "progress" });
          }
          const rows = cs.subComponents.map((sub) => {
            const row: Record<string, unknown> = { criterion: sub.name };
            for (const cr of data.comparisonRuns!) {
              const crCat = cr.categoryScores.find((c) => c.category === cs.category);
              const crSub = crCat?.subComponents?.find((s) => s.name === sub.name);
              row[`run_${cr.id.slice(0, 8)}`] = crSub ? Math.round(crSub.score * 100) : 0;
            }
            return row;
          });
          const catTable = ui.dataTable(colDefs, rows);
          const scoreBadge = ui.badge(`${Math.round(avgScore * 100)}%`, {
            variant: avgScore >= 0.9 ? "success" : avgScore >= 0.7 ? "warning" : "error",
          });
          const header = ui.row([ui.text(getCategoryLabel(cs.category), "label"), scoreBadge], {
            gap: 8,
            align: "center",
          });
          const progress = ui.progress(Math.round(avgScore * 100), {
            maxValue: 100,
            color: catColor,
            size: "sm",
          });
          arenaChildren.push(
            ui.collapsible(getCategoryLabel(cs.category), [header, progress, catTable])
          );
        }
      }
    } else {
      arenaChildren.push(ui.text(t("evolution.noRunsSelected"), "caption"));
    }

    children.push(ui.card(arenaChildren, { padding: 16 }));
  }

  // Row 3: Score Trend
  if (data.scoreTrend && data.scoreTrend.length > 0) {
    const trendLabel = ui.text(t("evolution.scoreTrend"), "label");
    const trendChart = ui.chart({
      chartType: "bar",
      data: data.scoreTrend.map((p) => {
        const displayScore = p.score <= 1.0 ? Math.round(p.score * 100) : Math.round(p.score);
        return { version: p.version, score: displayScore };
      }),
      xKey: "version",
      yKey: "score",
      height: 200,
      color: "#667eea",
    });
    children.push(ui.card([trendLabel, trendChart], { padding: 16 }));
  }

  // Row 4: Recent Benchmark Runs
  if (data.benchmarkRuns && data.benchmarkRuns.length > 0) {
    const runsLabel = ui.text(t("evolution.recentRuns"), "label");
    const runRows = data.benchmarkRuns.slice(0, 5).map((r) => {
      const scoreDisplay = r.overall_score > 0 ? `${Math.round(r.overall_score * 100)}%` : "-";
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
    const btnRow = ui.row([quickBtn, fullBtn], { gap: 12, justify: "end" });

    const cardContent = ui.column([runsLabel, runsTable, btnRow], { gap: 16 });
    children.push(ui.card([cardContent], { padding: 16 }));
  } else {
    const emptyText = ui.text(t("evolution.noBenchmarkRuns"), "caption");
    const runBtn = ui.button(t("evolution.runQuickBenchmark"), "run_benchmark", {
      variant: "primary",
      size: "sm",
      payload: { profile: "quick" },
    });
    children.push(ui.card([emptyText, runBtn], { padding: 24 }));
  }

  // Row 5: Active evolution branch (if any)
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
  const diagnoseBtn = ui.button(t("evolution.runDiagnose"), "run_diagnose", {
    variant: "outline",
    size: "sm",
    icon: "search",
  });
  children.push(ui.card([ui.row([quickBtn, fullBtn, diagnoseBtn], { gap: 8 })], { padding: 12 }));

  // SHARP Category Breakdown Cards
  if (data.latestRunCategoryScores && data.latestRunCategoryScores.length > 0) {
    const sharpCards: string[] = [];

    for (const cs of data.latestRunCategoryScores) {
      const catColor = SHARP_CATEGORY_COLORS[cs.category] || "#818cf8";
      // Normalize: 0.0-1.0 (SHARP 2.0) or 0-100 (legacy)
      const avgScore = cs.score <= 1.0 ? cs.score : cs.score / 100;
      const cardChildren: string[] = [];

      // Header: category name + score badge (percentage display)
      const catName = ui.text(getCategoryLabel(cs.category), "label");
      const scoreBadge = ui.badge(`${Math.round(avgScore * 100)}%`, {
        variant: avgScore >= 0.9 ? "success" : avgScore >= 0.7 ? "warning" : "error",
      });
      cardChildren.push(ui.row([catName, scoreBadge], { gap: 8, align: "center" }));

      // Overall category progress bar
      cardChildren.push(
        ui.progress(Math.round(avgScore * 100), { maxValue: 100, color: catColor, size: "sm" })
      );

      // Sub-component scores
      if (cs.subComponents && cs.subComponents.length > 0) {
        for (const sub of cs.subComponents) {
          const subColor = getScoreColor(sub.score);
          const subName = ui.text(sub.name, "caption");
          const subProgress = ui.progress(sub.score * 100, {
            maxValue: 100,
            color: subColor,
            size: "sm",
          });
          const subValue = ui.text(sub.score.toFixed(1), "caption");
          cardChildren.push(ui.row([subName, subProgress, subValue], { gap: 8, align: "center" }));
        }
      }

      sharpCards.push(
        ui.card(cardChildren, {
          padding: 16,
          className: `border-t-[3px]`,
        })
      );
    }

    const sharpGrid = ui.grid(sharpCards, { columns: 2, gap: 16, responsive: true });
    const sharpTitle = ui.text("SHARP 2.0 Evaluation", "h3");
    children.push(ui.card([sharpTitle, sharpGrid], { padding: 16 }));
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
      const scoreDisplay = r.overall_score > 0 ? `${Math.round(r.overall_score * 100)}%` : "-";
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
        const displayScore = cs.score <= 1.0 ? Math.round(cs.score * 100) : Math.round(cs.score);
        return {
          label: getCategoryLabel(cs.category),
          value: displayScore,
          maxValue: 100,
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
