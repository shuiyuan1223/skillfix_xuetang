/**
 * Evolution Lab Page Generator
 *
 * 4-Tab Dashboard layout: Overview | Benchmark | Versions | Data
 * Dashboard/GUI-centric. Agent mode moved to standalone System Agent page.
 */

import { A2UIGenerator, type A2UIMessage } from './a2ui.js';
import { t } from '../locales/index.js';
import { loadSharpRubrics } from '../evolution/benchmark-seed.js';

// ============================================================================
// Types
// ============================================================================

export interface PipelineStep {
  id: string;
  label: string;
  icon: string;
  status: 'pending' | 'active' | 'completed' | 'failed' | 'skipped';
}

interface TimelineEvent {
  id: string;
  type: 'branch' | 'commit' | 'benchmark' | 'merge' | 'revert' | 'tag';
  label: string;
  description?: string;
  timestamp: number;
  branch?: string;
  hash?: string;
  score?: number;
  status?: 'success' | 'failed' | 'pending' | 'active';
  author?: string;
  filesChanged?: number;
  additions?: number;
  deletions?: number;
  tags?: string[];
}

interface SubComponentScore {
  name: string;
  score: number;
  scoring: 'binary' | '3-point';
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
  status?: 'running' | 'completed' | 'failed';
}

interface ChangedFile {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
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
  parentBranch: string;
  status: string;
  triggerMode: string;
  triggerRef: string;
  scoreDelta: number | null;
  latestScore?: number | null;
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
  activeTab: 'overview' | 'benchmark' | 'versions' | 'data';
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
  radarMode?: 'categories' | 'criteria';
  comparisonRuns?: ComparisonRun[];
  // Benchmark
  testCases?: TestCaseInfo[];
  externalProgressMap?: Record<string, ExternalProgressInfo>;
  // Versions
  versions?: VersionInfo[];
  mainCommits?: {
    hash: string;
    shortHash: string;
    message: string;
    date: string;
    benchmarkScore?: number | null;
    benchmarkTag?: string;
  }[];
  timelineEvents?: TimelineEvent[];
  selectedVersion?: string;
  selectedTimelineEvent?: string;
  changedFiles?: ChangedFile[];
  diffContent?: { before: string; after: string; path: string; unifiedDiff?: string };
  // Data
  dataSubTab?: 'traces' | 'evaluations' | 'suggestions';
  traces?: TraceInfo[];
  tracesPage?: number;
  tracesTotal?: number;
  evaluations?: EvaluationInfo[];
  suggestions?: SuggestionInfo[];
  loading?: boolean;
}

// Default pipeline steps
export function getDefaultPipelineSteps(currentStep?: string): PipelineStep[] {
  const stepsConfig = [
    { id: 'benchmark', label: t('evolution.pipelineBenchmark'), icon: 'test-tube' },
    { id: 'diagnose', label: t('evolution.pipelineDiagnose'), icon: 'search' },
    { id: 'apply', label: t('evolution.pipelineApply'), icon: 'zap' },
    { id: 'validate', label: t('evolution.pipelineValidate'), icon: 'shield' },
  ];

  let foundActive = false;
  return stepsConfig.map((s) => {
    if (foundActive) {
      return { ...s, status: 'pending' as const };
    }
    if (s.id === currentStep) {
      foundActive = true;
      return { ...s, status: 'active' as const };
    }
    if (currentStep) {
      return { ...s, status: 'completed' as const };
    }
    return { ...s, status: 'pending' as const };
  });
}

// Category label mapping
// SHARP category color mapping
export const SHARP_CATEGORY_COLORS: Record<string, string> = {
  safety: '#ff6b6b',
  usefulness: '#4ecdc4',
  accuracy: '#ffe66d',
  relevance: '#95e1d3',
  personalization: '#dda0dd',
  // Legacy category names → same color mapping
  'safety-boundaries': '#ff6b6b',
  'health-coaching': '#4ecdc4',
  'health-data-analysis': '#ffe66d',
  'communication-quality': '#95e1d3',
  'personalization-memory': '#dda0dd',
};

/**
 * SHARP 2.0 legacy name → SHARP 3.0 canonical name mapping.
 * Used to normalize old benchmark data so the radar chart always shows 19 criteria.
 */
const SHARP_LEGACY_NAME_MAP: Record<string, string> = {
  'risk disclosure': 'S1 Risk Disclosure',
  'medical boundary': 'S2 Medical Boundary',
  'harmful content prevention': 'S3 Harmful Content Prevention',
  'capability scoping': 'S4 Capability Scoping',
  'comprehensiveness and professionalism': 'U1 Comprehensiveness',
  'actionability and clarity': 'U3 Actionability',
  'readability and structure': 'U4 Expression Quality',
  'empathy and encouragement': 'U5 Empathy and Tone',
  'factual & scientific accuracy': 'A1 Scientific Factual Correctness',
  'computational accuracy': 'A2 Computational Accuracy',
  'data source adherence': 'A4 User Data Citation Accuracy',
  'rule-based recommendations': 'A3 Logical Consistency',
  'topic relevance': 'R1 Topic Focus',
  'domain specialization': 'R2 Domain Specialization',
  'effective personalization': 'P1 Personalization Quality',
  'contextual audience awareness': 'P2 Audience Identification',
};

/** Normalize sub-component name: map SHARP 2.0 legacy names to SHARP 3.0 canonical names */
function normalizeSubComponentName(name: string): string {
  return SHARP_LEGACY_NAME_MAP[name.toLowerCase()] || name;
}

/**
 * Get the canonical 19 SHARP 3.0 sub-component names in order, grouped by category.
 * Used as the reference axis for criteria-mode radar charts.
 */
function getCanonicalCriteriaOrder(): Array<{ category: string; name: string }> {
  const rubrics = loadSharpRubrics();
  const order: Array<{ category: string; name: string }> = [];
  for (const cat of rubrics) {
    for (const sub of cat.sub_components) {
      order.push({ category: cat.category.toLowerCase(), name: sub.name });
    }
  }
  return order;
}

export const RUN_COLORS = [
  'rgb(99, 102, 241)',
  'rgb(236, 72, 153)',
  'rgb(34, 211, 238)',
  'rgb(245, 158, 11)',
  'rgb(16, 185, 129)',
];

/** Consistent model display: always show modelId, prefix with presetName if available */
function formatModelDisplay(presetName?: string, modelId?: string): string {
  if (!modelId) {
    return presetName || '-';
  }
  // Extract short model name from full ID (e.g. "anthropic/claude-opus-4.6" → "claude-opus-4.6")
  const shortModel = modelId.includes('/') ? modelId.split('/').pop()! : modelId;
  if (presetName && presetName !== shortModel && presetName !== modelId) {
    return `${presetName} (${shortModel})`;
  }
  return shortModel;
}

function getScoreColor(score: number): string {
  if (score >= 0.9) {
    return '#4ade80';
  }
  if (score >= 0.7) {
    return '#fbbf24';
  }
  return '#f87171';
}

/**
 * Build multiSeries radar data from comparison runs.
 * categories mode: 5 SHARP data points per series.
 * criteria mode: all sub-component data points per series.
 */
function buildMultiSeriesRadarData(
  comparisonRuns: ComparisonRun[],
  mode: 'categories' | 'criteria'
): Array<{
  label: string;
  data: Array<{ label: string; value: number; maxValue: number }>;
  color: string;
}> {
  if (mode === 'categories') {
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
  // criteria mode: use canonical 19 SHARP 3.0 sub-components as fixed axis
  const criteriaOrder = getCanonicalCriteriaOrder();
  if (criteriaOrder.length === 0) {
    return buildMultiSeriesRadarData(comparisonRuns, 'categories');
  }
  return comparisonRuns.map((run) => {
    // Build normalized lookup: lowercased canonical name → score
    const scoreMap = new Map<string, number>();
    for (const cs of run.categoryScores) {
      for (const sub of cs.subComponents || []) {
        const key = normalizeSubComponentName(sub.name).toLowerCase();
        scoreMap.set(key, sub.score);
      }
    }
    return {
      label: run.label,
      color: run.color,
      data: criteriaOrder.map((cr) => {
        const score = scoreMap.get(cr.name.toLowerCase()) ?? 0;
        return {
          label: cr.name.length > 14 ? `${cr.name.slice(0, 12)}..` : cr.name,
          value: Math.round(score * 100),
          maxValue: 100,
        };
      }),
    };
  });
}

/**
 * Build Recharts-compatible radar chart data from comparison runs.
 * Returns { data: [{subject, seriesKey1, seriesKey2, ...}], series: [{key, name, color}] }
 */
export function buildRadarChartData(
  runs: ComparisonRun[],
  mode: 'categories' | 'criteria'
): {
  data: Array<Record<string, unknown>>;
  series: Array<{ key: string; name: string; color: string }>;
} {
  // Pre-load canonical criteria order once (avoids repeated file I/O inside the loop)
  const canonicalOrder = mode === 'criteria' ? getCanonicalCriteriaOrder() : [];

  // Build subjects (axis labels) and per-run scores
  const runDataPoints = runs.map((run) => {
    let dataPoints: Array<{ name: string; score: number }>;
    if (mode === 'criteria') {
      // Build a map from lowercased normalized name → scores for this run
      const criteriaMap = new Map<string, number[]>();
      for (const cs of run.categoryScores) {
        for (const sub of cs.subComponents || []) {
          const score = sub.score <= 1 ? sub.score : sub.score / 100;
          const key = normalizeSubComponentName(sub.name).toLowerCase();
          if (!criteriaMap.has(key)) {
            criteriaMap.set(key, []);
          }
          criteriaMap.get(key)!.push(score);
        }
      }
      // Use canonical 19 SHARP 3.0 criteria as axis reference (case-insensitive lookup)
      dataPoints = canonicalOrder.map((cr) => {
        const scores = criteriaMap.get(cr.name.toLowerCase());
        return {
          name: cr.name,
          score: scores ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
        };
      });
      if (dataPoints.every((d) => d.score === 0)) {
        // Fallback to categories if no sub-component data at all
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
    return dataPoints;
  });

  // Use first run's subjects as reference
  const subjects = runDataPoints[0]?.map((d) => d.name) || [];

  // Build flat data array: [{subject, run_0, run_1, ...}]
  const data = subjects.map((subject, si) => {
    const row: Record<string, unknown> = { subject };
    runs.forEach((run, ri) => {
      const dp = runDataPoints[ri];
      row[`run_${ri}`] = dp?.[si]?.score ?? 0;
    });
    return row;
  });

  // Build series metadata
  const series = runs.map((run, ri) => ({
    key: `run_${ri}`,
    name: run.label,
    color: run.color,
  }));

  return { data, series };
}

export function getCategoryLabel(category: string): string {
  const labelMap: Record<string, string> = {
    'health-data-analysis': 'Health Data Analysis',
    'health-coaching': 'Health Coaching',
    'safety-boundaries': 'Safety & Boundaries',
    'personalization-memory': 'Personalization & Memory',
    'communication-quality': 'Communication Quality',
    // SHARP categories
    safety: 'Safety',
    usefulness: 'Usefulness',
    accuracy: 'Accuracy',
    relevance: 'Relevance',
    personalization: 'Personalization',
  };
  return labelMap[category] || category;
}

export function getCategoryIcon(category: string): string {
  const iconMap: Record<string, string> = {
    safety: 'shield',
    usefulness: 'lightbulb',
    accuracy: 'target',
    relevance: 'link',
    personalization: 'user',
    'safety-boundaries': 'shield',
    'health-coaching': 'lightbulb',
    'health-data-analysis': 'target',
    'communication-quality': 'link',
    'personalization-memory': 'user',
  };
  return iconMap[category] || 'star';
}

// ============================================================================
// Main Lab Page — 5-Tab Dashboard
// ============================================================================

export function generateEvolutionLab(data: EvolutionLabData): A2UIMessage[] {
  const ui = new A2UIGenerator('main');

  // ---- Header ----
  const titleId = ui.text(t('evolution.lab'), 'h1');
  const subtitleId = ui.text(t('evolution.labSubtitle'), 'caption');
  const headerChildren = [titleId, subtitleId];

  if (data.activeVersionBranch) {
    const badgeId = ui.badge(data.activeVersionBranch, { variant: 'info' });
    headerChildren.push(badgeId);
  }

  const header = ui.row(headerChildren, { gap: 12, align: 'center' });

  // ---- Loading skeleton ----
  if (data.loading) {
    const s1 = ui.skeleton({ variant: 'rectangular', height: 80 });
    const s2 = ui.skeleton({ variant: 'rectangular', height: 80 });
    const s3 = ui.skeleton({ variant: 'rectangular', height: 80 });
    const statsRow = ui.grid([s1, s2, s3], { columns: 3, gap: 16 });
    const s4 = ui.skeleton({ variant: 'rectangular', height: 250 });
    const loadingContent = ui.column([statsRow, s4], { gap: 16, padding: 24 });
    const root = ui.column([header, loadingContent], { gap: 0, padding: 16 });
    return ui.build(root);
  }

  // ---- Tab Content ----
  const tabContentIds: Record<string, string> = {};

  if (data.activeTab === 'overview') {
    tabContentIds.overview = generateOverviewTab(ui, data);
  }
  if (data.activeTab === 'benchmark') {
    tabContentIds.benchmark = generateBenchmarkTab(ui, data);
  }
  if (data.activeTab === 'versions') {
    tabContentIds.versions = generateVersionsTab(ui, data);
  }
  if (data.activeTab === 'data') {
    tabContentIds.data = generateDataTab(ui, data);
  }
  // ---- Tabs ----
  const tabs = ui.tabs(
    [
      { id: 'overview', label: t('evolution.tabOverview'), icon: 'bar-chart' },
      { id: 'benchmark', label: t('evolution.tabBenchmark'), icon: 'test-tube' },
      { id: 'versions', label: t('evolution.tabVersions'), icon: 'git-branch' },
      { id: 'data', label: t('evolution.tabData'), icon: 'file-text' },
    ],
    data.activeTab,
    tabContentIds
  );

  const content = ui.column([tabs], { gap: 0, padding: 24 });
  const root = ui.column([header, content], {
    gap: 12,
    padding: 16,
    className: 'relative min-h-full',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
function formatRunProgress(r: BenchmarkRunInfo, progressMap?: Record<string, ExternalProgressInfo>): string {
  const status = r.status || (r.duration_ms && r.duration_ms > 0 ? 'completed' : 'running');
  if (status === 'completed') {
    return '100|success';
  }
  if (status === 'failed') {
    const pct = r.total_test_cases > 0 ? Math.round((r.passed_count / r.total_test_cases) * 100) : 0;
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
// Tab 1: Overview — section builders
// ============================================================================

function buildOverviewStatCards(ui: A2UIGenerator, data: EvolutionLabData): string {
  const statCards: string[] = [];

  if (data.benchmarkRuns && data.benchmarkRuns.length > 0) {
    const rawScore = data.benchmarkRuns[0].overall_score;
    const displayScore = rawScore <= 1.0 ? rawScore : rawScore / 100;
    statCards.push(
      ui.scoreGauge(displayScore, {
        label: t('evolution.latestRun'),
        max: 1.0,
        size: 'lg',
      })
    );
  } else if (data.stats && data.stats.totalCount > 0) {
    const avgNorm = data.stats.averageScore <= 1.0 ? data.stats.averageScore : data.stats.averageScore / 100;
    statCards.push(
      ui.scoreGauge(avgNorm, {
        label: t('evolution.avgScore'),
        max: 1.0,
        size: 'lg',
      })
    );
  } else {
    statCards.push(
      ui.statCard({
        title: t('evolution.score'),
        value: '-',
        subtitle: t('evolution.noBenchmarkRuns'),
        icon: 'star',
        color: '#94a3b8',
      })
    );
  }

  if (data.benchmarkRuns && data.benchmarkRuns.length > 0) {
    const latest = data.benchmarkRuns[0];
    statCards.push(
      ui.statCard({
        title: t('evolution.testCases'),
        value: `${latest.passed_count}/${latest.total_test_cases}`,
        subtitle: t('evolution.passed'),
        icon: 'test-tube',
        color: '#10b981',
      })
    );
  } else {
    statCards.push(
      ui.statCard({
        title: t('evolution.testCases'),
        value: data.testCaseCount ?? 0,
        icon: 'test-tube',
        color: '#10b981',
      })
    );
  }

  statCards.push(
    ui.statCard({
      title: t('evolution.versions'),
      value: data.versionCount ?? 0,
      icon: 'git-branch',
      color: '#667eea',
    }),
    ui.statCard({
      title: t('evolution.currentVersion'),
      value: data.activeVersionBranch || 'main',
      icon: 'git-commit',
      color: '#818cf8',
    })
  );

  return ui.grid(statCards, { columns: 4, gap: 16 });
}

function buildArenaHeader(
  ui: A2UIGenerator,
  data: EvolutionLabData,
  radarMode: string,
  selectedIds: Set<string>,
  selectedOrder: string[],
  recentRuns: BenchmarkRunInfo[]
): string {
  const arenaTitle = ui.text(t('evolution.selectRunsForComparison'), 'label');
  const toggleId = `arena_toggle_${Date.now()}`;
  ui.addRaw(toggleId, 'ArenaModeToggle', {
    options: [
      { label: t('evolution.categoriesMode'), value: 'categories' },
      { label: t('evolution.criteriaMode'), value: 'criteria' },
    ],
    active: radarMode,
    action: 'set_radar_mode',
  });
  const pickerId = `arena_picker_${Date.now()}`;
  ui.addRaw(pickerId, 'ArenaRunPicker', {
    runs: recentRuns.map((r) => ({
      id: r.id,
      label:
        formatModelDisplay(r.presetName, r.modelId) !== '-'
          ? formatModelDisplay(r.presetName, r.modelId)
          : r.version_tag || r.id.slice(0, 8),
      selected: selectedIds.has(r.id),
      color: selectedIds.has(r.id) ? RUN_COLORS[selectedOrder.indexOf(r.id) % RUN_COLORS.length] : undefined,
      date: undefined,
      score: r.overall_score > 0 ? r.overall_score : undefined,
    })),
    action: 'toggle_benchmark_run',
    clearAction: 'clear_run_selection',
  });
  return ui.row([arenaTitle, toggleId, pickerId], {
    gap: 8,
    align: 'center',
    justify: 'between',
  });
}

function buildArenaComparison(
  ui: A2UIGenerator,
  data: EvolutionLabData,
  radarMode: 'categories' | 'criteria'
): string[] {
  const result: string[] = [];
  if (!data.comparisonRuns || data.comparisonRuns.length === 0) {
    result.push(
      ui.column([ui.text(t('evolution.noRunsSelected'), 'caption')], {
        padding: 32,
        align: 'center',
      })
    );
    return result;
  }

  const refRun = data.comparisonRuns[0];
  const legendCategories = refRun.categoryScores.map((cs) => ({
    name: getCategoryLabel(cs.category),
    color: SHARP_CATEGORY_COLORS[cs.category] || '#818cf8',
  }));

  const radarId = `radar_chart_${Date.now()}`;
  const radarChartData = buildRadarChartData(data.comparisonRuns, radarMode);
  ui.addRaw(radarId, 'RadarChart', {
    radarData: radarChartData.data,
    radarSeries: radarChartData.series,
    height: 400,
    categoryLegend: legendCategories,
  });

  const scoreTitleId = ui.text(t('evolution.overallScores'), 'label');
  const scoreTableId = `arena_score_${Date.now()}`;
  ui.addRaw(scoreTableId, 'ArenaScoreTable', {
    rows: data.comparisonRuns.map((cr) => ({
      label: cr.label,
      color: cr.color,
      score: cr.overallScore,
    })),
  });

  const scoreCardId = ui.column([scoreTitleId, scoreTableId], {
    gap: 8,
    className: 'arena-card',
  } as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const radarCardId = ui.column([radarId], { gap: 8, className: 'arena-card' } as any);
  const dashGridId = ui.column([radarCardId, scoreCardId], {
    gap: 24,
    style: 'display: grid; grid-template-columns: 1.2fr 0.8fr;',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  result.push(dashGridId);

  // Category Breakdown cards
  result.push(...buildCategoryBreakdownCards(ui, data.comparisonRuns, refRun));

  return result;
}

function buildCategoryBreakdownCards(
  ui: A2UIGenerator,
  comparisonRuns: ComparisonRun[],
  refRun: ComparisonRun
): string[] {
  const result: string[] = [];
  const breakdownCards: string[] = [];

  for (const cs of refRun.categoryScores) {
    if (!cs.subComponents || cs.subComponents.length === 0) {
      continue;
    }
    const avgScore = cs.score <= 1.0 ? cs.score : cs.score / 100;
    const criteria = cs.subComponents.map((sub) => ({
      name: sub.name,
      scores: comparisonRuns.map((cr) => {
        const crCat = cr.categoryScores.find((c) => c.category === cs.category);
        const crSub = crCat?.subComponents?.find((s) => s.name === sub.name);
        return { value: crSub?.score ?? 0, color: cr.color };
      }),
    }));
    const catCardId = `arena_cat_${cs.category}_${Date.now()}`;
    ui.addRaw(catCardId, 'ArenaCategoryCard', {
      categoryName: getCategoryLabel(cs.category),
      categoryColor: SHARP_CATEGORY_COLORS[cs.category] || '#818cf8',
      categoryIcon: getCategoryIcon(cs.category),
      avgScore,
      criteria,
    });
    breakdownCards.push(catCardId);
  }

  if (breakdownCards.length > 0) {
    result.push(ui.text(t('evolution.categoryBreakdown'), 'label'));
    result.push(
      ui.column(breakdownCards, {
        gap: 20,
        style: 'display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
    );
  }

  return result;
}

function buildRecentRunsTable(
  ui: A2UIGenerator,
  runs: BenchmarkRunInfo[],
  progressMap?: Record<string, ExternalProgressInfo>,
  limit = 5
): string[] {
  const runsLabel = ui.text(t('evolution.recentRuns'), 'label');
  const runRows = runs.slice(0, limit).map((r) => {
    const scoreDisplay =
      r.overall_score > 0 ? (r.overall_score <= 1.0 ? r.overall_score : r.overall_score / 100).toFixed(2) : '-';
    return {
      id: r.id,
      progress: formatRunProgress(r, progressMap),
      version_tag: r.version_tag || '-',
      score: scoreDisplay,
      passed: `${r.passed_count}/${r.total_test_cases}`,
      model: formatModelDisplay(r.presetName, r.modelId),
      profile: r.profile,
      duration: r.duration_ms && r.duration_ms > 0 ? `${(r.duration_ms / 1000).toFixed(1)}s` : '-',
    };
  });
  const runsTable = ui.dataTable(
    [
      { key: 'progress', label: t('evolution.progress'), render: 'progress' },
      { key: 'version_tag', label: t('evolution.versionTag') },
      { key: 'score', label: t('evolution.score') },
      { key: 'passed', label: t('evolution.passed') },
      { key: 'model', label: t('evolution.model') },
      { key: 'profile', label: t('evolution.profile'), render: 'badge' },
      { key: 'duration', label: t('evolution.duration') },
    ],
    runRows,
    { onRowClick: 'view_benchmark_run' }
  );
  return [runsLabel, runsTable];
}

function generateOverviewTab(ui: A2UIGenerator, data: EvolutionLabData): string {
  const children: string[] = [];

  children.push(buildOverviewStatCards(ui, data));

  // Score Trend
  if (data.scoreTrend && data.scoreTrend.length > 0) {
    const trendLabel = ui.text(t('evolution.scoreTrend'), 'label');
    const trendChart = ui.chart({
      chartType: 'bar',
      data: data.scoreTrend.map((p) => {
        const displayScore = p.score <= 1.0 ? p.score : p.score / 100;
        return { version: p.version, score: parseFloat(displayScore.toFixed(2)) };
      }),
      xKey: 'version',
      yKey: 'score',
      height: 200,
      color: '#667eea',
    });
    children.push(ui.card([trendLabel, trendChart], { padding: 16 }));
  }

  // Arena Comparison Area
  if (data.benchmarkRuns && data.benchmarkRuns.length > 0) {
    const arenaChildren: string[] = [];
    const radarMode = data.radarMode || 'categories';
    const selectedIds = new Set(data.selectedRunIds || []);
    const selectedOrder = data.selectedRunIds || [];
    const recentRuns = data.benchmarkRuns.slice(0, 10);

    arenaChildren.push(buildArenaHeader(ui, data, radarMode, selectedIds, selectedOrder, recentRuns));
    arenaChildren.push(...buildArenaComparison(ui, data, radarMode));
    arenaChildren.push(...buildRecentRunsTable(ui, data.benchmarkRuns, data.externalProgressMap));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    children.push(ui.card(arenaChildren, { padding: 16, className: 'arena-section' } as any));
  } else {
    const emptyText = ui.text(t('evolution.noBenchmarkRuns'), 'caption');
    children.push(ui.card([ui.column([emptyText], { padding: 32, align: 'center' })], { padding: 24 }));
  }

  // Active evolution branch
  if (data.activeVersionBranch && data.activeVersionBranch !== 'main') {
    const branchBadge = ui.badge(data.activeVersionBranch, { variant: 'info' });
    const branchLabel = ui.text(t('evolution.activeVersion'), 'label');
    const switchBtn = ui.button(t('evolution.switchVersion'), 'switch_version', {
      variant: 'outline',
      size: 'sm',
      payload: { branch: data.activeVersionBranch },
    });
    const mergeBtn = ui.button(t('evolution.mergeVersion'), 'merge_version', {
      variant: 'primary',
      size: 'sm',
      payload: { branch: data.activeVersionBranch },
    });
    const branchRow = ui.row([branchLabel, branchBadge, switchBtn, mergeBtn], {
      gap: 12,
      align: 'center',
    });
    children.push(ui.card([branchRow], { padding: 12 }));
  }

  return ui.column(children, { gap: 16, padding: 16 });
}

// ============================================================================
// Tab 2: Benchmark
// ============================================================================

function buildBenchmarkHeaderRow(ui: A2UIGenerator): string {
  const tabTitle = ui.text(t('evolution.tabBenchmark'), 'h3');
  const quickBtn = ui.button('', 'run_benchmark', {
    variant: 'outline',
    size: 'sm',
    icon: 'play',
    tooltip: t('evolution.runQuickBenchmark'),
    payload: { profile: 'quick' },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  const fullBtn = ui.button('', 'run_benchmark', {
    variant: 'primary',
    size: 'sm',
    icon: 'zap',
    tooltip: t('evolution.runFullBenchmark'),
    payload: { profile: 'full' },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  const addTestBtn = ui.button('', 'create_test_case', {
    variant: 'outline',
    size: 'sm',
    icon: 'sparkles',
    tooltip: t('evolution.addTestCase'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  return ui.row([tabTitle, ui.row([addTestBtn, quickBtn, fullBtn], { gap: 6 })], {
    justify: 'between',
    align: 'center',
  });
}

function buildSharpCategoryCards(ui: A2UIGenerator, categoryScores: CategoryScoreInfo[]): string {
  const sharpTitle = ui.text('SHARP 3.0 Evaluation', 'h3');
  const sharpCards: string[] = [];

  for (const cs of categoryScores) {
    const catColor = SHARP_CATEGORY_COLORS[cs.category] || '#818cf8';
    const avgScore = cs.score <= 1.0 ? cs.score : cs.score / 100;
    const criteria = (cs.subComponents || []).map((sub) => ({
      name: sub.name,
      scores: [{ value: sub.score <= 1 ? sub.score : sub.score / 100, color: catColor }],
    }));
    const catCardId = `bench_cat_${cs.category}_${Date.now()}`;
    ui.addRaw(catCardId, 'ArenaCategoryCard', {
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
    style: 'display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ui.card([sharpTitle, sharpGrid], { padding: 16, className: 'arena-section' } as any);
}

function buildTestCasesTable(ui: A2UIGenerator, testCases: TestCaseInfo[]): string {
  const testCasesLabel = ui.text(t('evolution.testCases'), 'label');
  const testRows = testCases.map((tc) => ({
    id: tc.id.slice(0, 8),
    category: tc.category,
    query: tc.query.slice(0, 60) + (tc.query.length > 60 ? '...' : ''),
    minScore: tc.expected.minScore ?? '-',
    keywords: tc.expected.shouldMention?.length || 0,
  }));
  const testsTable = ui.dataTable(
    [
      { key: 'category', label: t('evolution.category'), render: 'badge' },
      { key: 'query', label: t('evolution.query') },
      { key: 'minScore', label: t('evolution.minScore') },
      { key: 'keywords', label: t('evolution.keywords') },
    ],
    testRows,
    { onRowClick: 'view_test_case' }
  );
  return ui.card([testCasesLabel, testsTable], { padding: 16 });
}

function generateBenchmarkTab(ui: A2UIGenerator, data: EvolutionLabData): string {
  const children: string[] = [];

  children.push(buildBenchmarkHeaderRow(ui));

  if (data.latestRunCategoryScores && data.latestRunCategoryScores.length > 0) {
    children.push(buildSharpCategoryCards(ui, data.latestRunCategoryScores));
  }

  if (data.benchmarkRuns && data.benchmarkRuns.length > 0) {
    const historyLabel = ui.text(t('evolution.benchmarkRuns'), 'label');
    const [, runsTable] = buildRecentRunsTable(
      ui,
      data.benchmarkRuns,
      data.externalProgressMap,
      data.benchmarkRuns.length
    );
    children.push(ui.card([historyLabel, runsTable], { padding: 16 }));
  }

  if (data.testCases && data.testCases.length > 0) {
    children.push(buildTestCasesTable(ui, data.testCases));
  }

  children.push(ui.text(t('evolution.editConfigHint'), 'caption'));

  return ui.column(children, { gap: 20, padding: 16 });
}

// ============================================================================
// Tab 3: Versions
// ============================================================================

function buildVersionGraphPanel(ui: A2UIGenerator, data: EvolutionLabData): string {
  const mainRuns = (data.benchmarkRuns || []).filter(
    (r) => r.status === 'completed' && r.overall_score > 0 && !r.version_tag?.startsWith('evo/')
  );
  let mainLatestScore: number | null = null;
  if (mainRuns.length > 0) {
    mainLatestScore = mainRuns[0].overall_score <= 1 ? mainRuns[0].overall_score : mainRuns[0].overall_score / 100;
  }

  const versionGraphData = (data.versions || []).map((v) => {
    const branchNorm = v.branchName.replace(/\//g, '-');
    const runs = (data.benchmarkRuns || []).filter(
      (r) =>
        r.status === 'completed' &&
        r.overall_score > 0 &&
        (r.version_tag?.includes(v.branchName) || r.version_tag?.includes(branchNorm))
    );
    let latestScore: number | null = null;
    if (runs.length > 0) {
      latestScore = runs[0].overall_score <= 1 ? runs[0].overall_score : runs[0].overall_score / 100;
    }
    return {
      id: v.id.slice(0, 8),
      branch: v.branchName,
      parentBranch: v.parentBranch || 'main',
      status: v.status as 'active' | 'merged' | 'abandoned',
      trigger: v.triggerMode || undefined,
      scoreDelta: v.scoreDelta,
      latestScore,
      filesChanged: v.filesChanged.length,
      createdAt: v.createdAt,
    };
  });

  return ui.column(
    [
      ui.versionGraph(
        { name: 'main', latestScore: mainLatestScore, benchmarkCount: mainRuns.length },
        versionGraphData,
        {
          mainCommits: data.mainCommits,
          selectedBranch: data.selectedVersion,
          onVersionClick: 'view_version_from_list',
        }
      ),
    ],
    { gap: 8 }
  );
}

function buildVersionDetailPanel(ui: A2UIGenerator, data: EvolutionLabData): string {
  const rightChildren: string[] = [];
  const selectedInfo = data.selectedVersion ? data.versions?.find((v) => v.branchName === data.selectedVersion) : null;

  if (!data.selectedVersion || !selectedInfo) {
    rightChildren.push(
      ui.column([ui.text(t('evolution.selectVersionToView'), 'caption')], {
        padding: 32,
        align: 'center',
      })
    );
    return ui.column(rightChildren, { gap: 12 });
  }

  // Version info card
  const branchBadge = ui.badge(selectedInfo.branchName, { variant: 'info' });
  const versionStatusVariant: Record<string, string> = {
    active: 'warning',
    merged: 'success',
  };
  const statusBadge = ui.badge(selectedInfo.status, {
    variant: versionStatusVariant[selectedInfo.status] || 'default',
  });
  const infoDetails: string[] = [];
  if (selectedInfo.triggerMode) {
    infoDetails.push(selectedInfo.triggerMode);
  }
  if (selectedInfo.scoreDelta != null) {
    const sign = selectedInfo.scoreDelta > 0 ? '+' : '';
    infoDetails.push(`${sign}${selectedInfo.scoreDelta.toFixed(1)}`);
  }
  infoDetails.push(new Date(selectedInfo.createdAt).toLocaleString());
  rightChildren.push(
    ui.card([ui.row([branchBadge, statusBadge], { gap: 8 }), ui.text(infoDetails.join(' · '), 'caption')], {
      padding: 16,
    })
  );

  // Changed files + diff
  if (data.changedFiles && data.changedFiles.length > 0) {
    const statsLabel = ui.text(`${data.changedFiles.length} ${t('evolution.filesChanged')}`, 'label');
    const fileTreeId = ui.fileTree(data.changedFiles, {
      selectedPath: data.diffContent?.path,
      onFileSelect: 'evo_file_select',
    });
    rightChildren.push(ui.card([statsLabel, fileTreeId], { padding: 16 }));

    if (data.diffContent) {
      rightChildren.push(
        ui.diffView(data.diffContent.before, data.diffContent.after, {
          title: data.diffContent.path,
          unifiedDiff: data.diffContent.unifiedDiff,
        })
      );
    }
  } else {
    rightChildren.push(
      ui.card(
        [
          ui.column([ui.text(t('evolution.noChanges'), 'caption')], {
            padding: 16,
            align: 'center',
          }),
        ],
        { padding: 16 }
      )
    );
  }

  // Action buttons
  if (selectedInfo.status === 'active') {
    const switchBtn = ui.button(t('evolution.switchVersion'), 'switch_version', {
      variant: 'outline',
      size: 'sm',
      payload: { branch: selectedInfo.branchName },
    });
    const mergeBtn = ui.button(t('evolution.mergeVersion'), 'merge_version', {
      variant: 'primary',
      size: 'sm',
      payload: { branch: selectedInfo.branchName },
    });
    const abandonBtn = ui.button(t('evolution.abandonVersion'), 'abandon_version', {
      variant: 'ghost',
      size: 'sm',
      payload: { branch: selectedInfo.branchName },
    });
    rightChildren.push(ui.row([switchBtn, mergeBtn, abandonBtn], { gap: 12 }));
  }

  return ui.column(rightChildren, { gap: 12 });
}

function generateVersionsTab(ui: A2UIGenerator, data: EvolutionLabData): string {
  const children: string[] = [];

  // Header row
  const tabTitle = ui.text(t('evolution.tabVersions'), 'h3');
  const headerLeft: string[] = [tabTitle];
  const headerRight: string[] = [];

  if (data.activeVersionBranch) {
    headerLeft.push(ui.badge(data.activeVersionBranch, { variant: 'info' }));
    headerRight.push(
      ui.button('', 'switch_version', {
        variant: 'outline',
        size: 'sm',
        icon: 'refresh-cw',
        tooltip: t('evolution.resetToMain'),
        payload: { branch: null },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
    );
  }

  children.push(
    ui.row(
      [
        ui.row(headerLeft, { gap: 8, align: 'center' }),
        ...(headerRight.length > 0 ? [ui.row(headerRight, { gap: 6 })] : []),
      ],
      { justify: 'between', align: 'center' }
    )
  );

  // Two-column layout
  const leftPanel = buildVersionGraphPanel(ui, data);
  const rightPanel = buildVersionDetailPanel(ui, data);

  children.push(
    ui.row([leftPanel, rightPanel], {
      gap: 16,
      style: 'align-items: flex-start;',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
  );

  return ui.column(children, { gap: 16, padding: 16 });
}

// ============================================================================
// Tab 4: Data
// ============================================================================

function buildTracesSubTab(ui: A2UIGenerator, data: EvolutionLabData): string {
  if (data.traces && data.traces.length > 0) {
    const traceRows = data.traces.map((tr) => ({
      id: tr.id.slice(0, 8),
      time: new Date(tr.timestamp).toLocaleString(),
      message: tr.userMessage.slice(0, 50) + (tr.userMessage.length > 50 ? '...' : ''),
      score: tr.score ?? '-',
    }));
    return ui.dataTable(
      [
        { key: 'id', label: 'ID' },
        { key: 'time', label: t('evolution.time'), sortable: true },
        { key: 'message', label: t('evolution.message') },
        { key: 'score', label: t('evolution.score'), render: 'progress' },
      ],
      traceRows,
      {
        pagination: {
          page: data.tracesPage || 0,
          pageSize: 20,
          total: data.tracesTotal || 0,
        },
        onRowClick: 'view_trace',
        onPageChange: 'traces_page_change',
      }
    );
  }
  return ui.column([ui.text(t('evolution.noTracesHint'), 'caption')], {
    padding: 32,
    align: 'center',
  });
}

function buildEvaluationsSubTab(ui: A2UIGenerator, data: EvolutionLabData): string {
  if (data.evaluations && data.evaluations.length > 0) {
    const evalRows = data.evaluations.map((e) => ({
      id: e.id.slice(0, 8),
      traceId: e.traceId.slice(0, 8),
      time: new Date(e.timestamp).toLocaleString(),
      score: e.score,
      feedback: e.feedback?.slice(0, 50) || '-',
    }));
    return ui.dataTable(
      [
        { key: 'id', label: 'ID' },
        { key: 'traceId', label: t('evolution.trace') },
        { key: 'time', label: t('evolution.time'), sortable: true },
        { key: 'score', label: t('evolution.score'), render: 'progress' },
        { key: 'feedback', label: t('evolution.feedback') },
      ],
      evalRows,
      { onRowClick: 'view_evaluation' }
    );
  }
  return ui.column([ui.text(t('evolution.noEvaluationsHint'), 'caption')], {
    padding: 32,
    align: 'center',
  });
}

function buildSuggestionsSubTab(ui: A2UIGenerator, data: EvolutionLabData): string {
  if (data.suggestions && data.suggestions.length > 0) {
    const suggRows = data.suggestions.map((s) => ({
      id: s.id.slice(0, 8),
      time: new Date(s.timestamp).toLocaleString(),
      type: s.type,
      target: s.target,
      status: s.status,
      rationale: s.rationale?.slice(0, 50) || '-',
    }));
    return ui.dataTable(
      [
        { key: 'id', label: 'ID' },
        { key: 'time', label: t('evolution.time'), sortable: true },
        { key: 'type', label: t('evolution.type'), render: 'badge' },
        { key: 'target', label: t('evolution.target') },
        { key: 'status', label: t('skills.status'), render: 'badge' },
        { key: 'rationale', label: t('evolution.rationale') },
      ],
      suggRows,
      { onRowClick: 'view_suggestion' }
    );
  }
  return ui.column([ui.text(t('evolution.noSuggestionsHint'), 'caption')], {
    padding: 32,
    align: 'center',
  });
}

function generateDataTab(ui: A2UIGenerator, data: EvolutionLabData): string {
  const children: string[] = [];
  const subTab = data.dataSubTab || 'traces';

  // Header row
  const tabTitle = ui.text(t('evolution.tabData'), 'h3');
  const subTabButtons = ['traces', 'evaluations', 'suggestions'].map((tab) => {
    const labelKey = `evolution.${tab}` as Parameters<typeof t>[0];
    return ui.button(t(labelKey), 'evo_data_subtab_change', {
      variant: subTab === tab ? 'secondary' : 'ghost',
      size: 'sm',
      payload: { tab },
    });
  });
  children.push(
    ui.row([tabTitle, ui.row(subTabButtons, { gap: 4 })], {
      justify: 'between',
      align: 'center',
    })
  );

  const subTabBuilders: Record<string, () => string> = {
    traces: () => buildTracesSubTab(ui, data),
    evaluations: () => buildEvaluationsSubTab(ui, data),
    suggestions: () => buildSuggestionsSubTab(ui, data),
  };
  const builder = subTabBuilders[subTab];
  if (builder) {
    children.push(builder());
  }

  return ui.column(children, { gap: 16, padding: 16 });
}

// (Agent Tab removed — now a standalone System Agent page)
