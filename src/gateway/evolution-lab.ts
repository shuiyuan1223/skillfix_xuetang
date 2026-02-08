/**
 * Evolution Lab Page Generator
 *
 * Dual-panel layout: left = Agent chat, right = dynamic context panel.
 * Agent drives the evolution pipeline; user is the supervisor.
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
  type: "branch" | "commit" | "benchmark" | "merge" | "revert";
  label: string;
  description?: string;
  timestamp: number;
  branch?: string;
  hash?: string;
  score?: number;
  status?: "success" | "failed" | "pending" | "active";
}

interface CategoryScoreInfo {
  category: string;
  score: number;
  test_count: number;
  passed_count: number;
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
}

interface ChangedFile {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
  additions?: number;
  deletions?: number;
}

export interface EvolutionLabData {
  // Chat
  chatMessages: EvoChatMessage[];
  streaming: boolean;
  streamingContent: string;
  // Pipeline
  currentPipelineStep?: string;
  pipelineSteps: PipelineStep[];
  // Context panel
  contextTab: "timeline" | "benchmarks" | "inspector";
  // Timeline data
  timelineEvents?: TimelineEvent[];
  activeBranch?: string;
  // Benchmark data
  latestCategoryScores?: CategoryScoreInfo[];
  benchmarkRuns?: BenchmarkRunInfo[];
  // Inspector data
  inspectedBranch?: string;
  changedFiles?: ChangedFile[];
  diffContent?: { before: string; after: string; path: string };
  // Version
  activeVersionBranch?: string | null;
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

// ============================================================================
// Main Lab Page
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

  // ---- Pipeline Step Indicator ----
  const stepsId = ui.stepIndicator(data.pipelineSteps, { orientation: "horizontal" });

  // ---- Left Panel: Chat ----
  const chatMsgsId = `evo_chat_msgs_${Date.now()}`;
  ui.addComponent(chatMsgsId, {
    id: chatMsgsId,
    type: "chat_messages",
    messages: data.chatMessages,
    streaming: data.streaming,
    streamingContent: data.streamingContent,
  });

  const chatInputId = `evo_chat_input_${Date.now()}`;
  ui.addComponent(chatInputId, {
    id: chatInputId,
    type: "chat_input",
    disabled: data.streaming,
    placeholder: t("evolution.evoChatPlaceholder"),
    action: "evo_send_message",
  });

  const leftPanel = ui.column([chatMsgsId, chatInputId], {
    gap: 0,
    style: "flex: 3; min-width: 0; min-height: 0; overflow: hidden;",
  } as any);

  // ---- Right Panel: Context ----
  const rightContent = generateContextPanel(ui, data);

  const contextTabs = ui.tabs(
    [
      { id: "timeline", label: t("evolution.timeline"), icon: "git-branch" },
      { id: "benchmarks", label: t("evolution.benchmarks"), icon: "test-tube" },
      { id: "inspector", label: t("evolution.inspector"), icon: "search" },
    ],
    data.contextTab,
    {
      timeline: rightContent.timeline,
      benchmarks: rightContent.benchmarks,
      inspector: rightContent.inspector,
    }
  );

  const rightPanel = ui.column([contextTabs], {
    gap: 0,
    style:
      "flex: 2; min-width: 280px; min-height: 0; overflow: auto; border-left: 1px solid rgba(102,126,234,0.1); padding-left: 16px;",
  } as any);

  // ---- Layout ----
  const panels = ui.row([leftPanel, rightPanel], {
    gap: 0,
    style: "flex: 1; min-height: 0; overflow: hidden;",
  } as any);

  const root = ui.column([header, stepsId, panels], {
    gap: 12,
    padding: 16,
    style: "height: 100%; overflow: hidden;",
  } as any);

  return ui.build(root);
}

// ============================================================================
// Context Panel Content
// ============================================================================

function generateContextPanel(
  ui: A2UIGenerator,
  data: EvolutionLabData
): { timeline: string; benchmarks: string; inspector: string } {
  // Timeline tab
  const timelineContent = generateTimelineContent(ui, data);

  // Benchmarks tab
  const benchmarksContent = generateBenchmarksContent(ui, data);

  // Inspector tab
  const inspectorContent = generateInspectorContent(ui, data);

  return {
    timeline: timelineContent,
    benchmarks: benchmarksContent,
    inspector: inspectorContent,
  };
}

function generateTimelineContent(ui: A2UIGenerator, data: EvolutionLabData): string {
  if (!data.timelineEvents || data.timelineEvents.length === 0) {
    const emptyMsg = ui.text(
      "No evolution events yet. Start by asking the agent to evolve.",
      "caption"
    );
    return ui.column([emptyMsg], { gap: 8, padding: 8 });
  }

  const timelineId = ui.gitTimeline(data.timelineEvents, {
    activeBranch: data.activeBranch,
    onEventClick: "evo_timeline_click",
  });

  return ui.column([timelineId], { gap: 0, padding: 4 });
}

function generateBenchmarksContent(ui: A2UIGenerator, data: EvolutionLabData): string {
  const children: string[] = [];

  // Radar chart if category scores available
  if (data.latestCategoryScores && data.latestCategoryScores.length > 0) {
    const radarData = data.latestCategoryScores.map((cs) => ({
      label: cs.category,
      value: cs.score,
      maxValue: 100,
    }));
    const radarId = ui.radarChart(radarData, {
      size: 220,
      showLabels: true,
      showValues: true,
      color: "#818cf8",
    });
    children.push(radarId);
  }

  // Recent runs table
  if (data.benchmarkRuns && data.benchmarkRuns.length > 0) {
    const runsTitle = ui.text(t("evolution.recentRuns"), "h3");
    children.push(runsTitle);

    const tableId = ui.dataTable(
      [
        { key: "version_tag", label: t("evolution.versionTag"), width: "80px" },
        { key: "overall_score", label: t("evolution.score"), width: "60px" },
        { key: "passed", label: t("evolution.passed"), width: "60px" },
        { key: "profile", label: t("evolution.profile"), width: "60px" },
      ],
      data.benchmarkRuns.map((r) => ({
        id: r.id,
        version_tag: r.version_tag || "-",
        overall_score: Math.round(r.overall_score),
        passed: `${r.passed_count}/${r.total_test_cases}`,
        profile: r.profile,
      })),
      { onRowClick: "view_benchmark_run" }
    );
    children.push(tableId);
  } else {
    const noData = ui.text(t("evolution.noBenchmarkRuns"), "caption");
    children.push(noData);
  }

  return ui.column(children, { gap: 12, padding: 8 });
}

function generateInspectorContent(ui: A2UIGenerator, data: EvolutionLabData): string {
  const children: string[] = [];

  if (data.inspectedBranch) {
    const branchLabel = ui.text(`Branch: ${data.inspectedBranch}`, "label");
    children.push(branchLabel);
  }

  // File tree
  if (data.changedFiles && data.changedFiles.length > 0) {
    const fileTreeId = ui.fileTree(data.changedFiles, {
      selectedPath: data.diffContent?.path,
      onFileSelect: "evo_file_select",
    });
    children.push(fileTreeId);

    // Diff view
    if (data.diffContent) {
      const diffId = ui.diffView(data.diffContent.before, data.diffContent.after, {
        title: data.diffContent.path,
      });
      children.push(diffId);
    }
  } else {
    const noChanges = ui.text(
      data.inspectedBranch ? t("evolution.noChanges") : t("evolution.selectFileToView"),
      "caption"
    );
    children.push(noChanges);
  }

  return ui.column(children, { gap: 12, padding: 8 });
}
