/**
 * Page Generators for A2UI
 *
 * Each function generates A2UI component trees for different views.
 * Agent calls these to render pages.
 */

import { A2UIGenerator, type A2UIMessage } from "./a2ui.js";

// Types for page data
interface Message {
  role: "user" | "assistant" | "tool";
  content: string;
}

interface ChatState {
  messages: Message[];
  streaming: boolean;
  streamingContent: string;
}

interface HealthMetric {
  label: string;
  value: number | string;
  unit?: string;
  icon?: string;
  trend?: { direction: "up" | "down" | "stable"; value: string };
}

interface ChartData {
  label: string;
  value: number;
}

// ============================================================================
// Sidebar Generator
// ============================================================================

export function generateSidebar(activeView: string): A2UIMessage {
  const ui = new A2UIGenerator("sidebar");

  // Main navigation
  const mainNav = ui.nav(
    [
      { id: "chat", label: "Chat", icon: "💬" },
      { id: "health", label: "Health", icon: "❤️" },
      { id: "sleep", label: "Sleep", icon: "🌙" },
      { id: "activity", label: "Activity", icon: "🏃" },
    ],
    { activeId: activeView }
  );

  // Divider
  const dividerId = `div_${Date.now()}`;
  ui.addComponent(dividerId, { id: dividerId, type: "divider" });

  // Settings navigation
  const settingsNav = ui.nav(
    [
      { id: "settings/prompts", label: "Prompts", icon: "📝" },
      { id: "settings/skills", label: "Skills", icon: "🧩" },
      { id: "settings/evolution", label: "Evolution", icon: "🔬" },
    ],
    { activeId: activeView }
  );

  const root = ui.column([mainNav, dividerId, settingsNav], { gap: 8 });

  return ui.build(root);
}

// ============================================================================
// Chat Page Generator
// ============================================================================

export function generateChatPage(state: ChatState): A2UIMessage {
  const ui = new A2UIGenerator("main");

  // Chat messages component
  const messagesId = `chat_msgs_${Date.now()}`;
  ui.addComponent(messagesId, {
    id: messagesId,
    type: "chat_messages",
    messages: state.messages,
    streaming: state.streaming,
    streamingContent: state.streamingContent,
  });

  // Chat input component
  const inputId = `chat_input_${Date.now()}`;
  ui.addComponent(inputId, {
    id: inputId,
    type: "chat_input",
    disabled: state.streaming,
    placeholder: "Ask me anything about your health...",
  });

  const root = ui.column([messagesId, inputId], { gap: 0 });

  // Make the column fill the height
  const rootComponent = ui["components"].get(root);
  if (rootComponent) {
    rootComponent["style"] = "height: 100%;";
  }

  return ui.build(root);
}

// ============================================================================
// Health Page Generator
// ============================================================================

export function generateHealthPage(data: {
  heartRate: HealthMetric;
  bloodPressure: HealthMetric;
  spo2: HealthMetric;
  heartRateChart: ChartData[];
}): A2UIMessage {
  const ui = new A2UIGenerator("main");

  // Header
  const title = ui.text("Health Overview", "h2");
  const subtitle = ui.text("Your vital signs and trends", "caption");
  const header = ui.column([title, subtitle], { gap: 4, padding: 24 });

  // Stats grid
  const hrCard = ui.statCard({
    title: data.heartRate.label,
    value: `${data.heartRate.value}`,
    subtitle: data.heartRate.unit,
    icon: data.heartRate.icon || "❤️",
    trend: data.heartRate.trend,
    color: "#ef4444",
  });

  const bpCard = ui.statCard({
    title: data.bloodPressure.label,
    value: `${data.bloodPressure.value}`,
    subtitle: data.bloodPressure.unit,
    icon: data.bloodPressure.icon || "🩺",
    trend: data.bloodPressure.trend,
    color: "#3b82f6",
  });

  const spo2Card = ui.statCard({
    title: data.spo2.label,
    value: `${data.spo2.value}`,
    subtitle: data.spo2.unit,
    icon: data.spo2.icon || "🫁",
    trend: data.spo2.trend,
    color: "#10b981",
  });

  const statsGrid = ui.grid([hrCard, bpCard, spo2Card], { columns: 3, gap: 16 });

  // Heart rate chart
  const chartTitle = ui.text("Heart Rate Trend", "h3");
  const chart = ui.chart({
    chartType: "line",
    data: data.heartRateChart.map((d) => ({ label: d.label, value: d.value })),
    xKey: "label",
    yKey: "value",
    height: 200,
    color: "#ef4444",
  });
  const chartCard = ui.card([chartTitle, chart], { padding: 20 });

  // Content container
  const content = ui.column([statsGrid, chartCard], { gap: 24, padding: 24 });

  const root = ui.column([header, content], { gap: 0 });

  return ui.build(root);
}

// ============================================================================
// Sleep Page Generator
// ============================================================================

export function generateSleepPage(data: {
  duration: HealthMetric;
  quality: HealthMetric;
  deepSleep: HealthMetric;
  sleepChart: ChartData[];
}): A2UIMessage {
  const ui = new A2UIGenerator("main");

  // Header
  const title = ui.text("Sleep Analysis", "h2");
  const subtitle = ui.text("Your sleep patterns and quality", "caption");
  const header = ui.column([title, subtitle], { gap: 4, padding: 24 });

  // Stats grid
  const durationCard = ui.statCard({
    title: data.duration.label,
    value: `${data.duration.value}`,
    subtitle: data.duration.unit,
    icon: "🌙",
    trend: data.duration.trend,
    color: "#8b5cf6",
  });

  const qualityCard = ui.statCard({
    title: data.quality.label,
    value: `${data.quality.value}`,
    subtitle: data.quality.unit,
    icon: "⭐",
    trend: data.quality.trend,
    color: "#f59e0b",
  });

  const deepCard = ui.statCard({
    title: data.deepSleep.label,
    value: `${data.deepSleep.value}`,
    subtitle: data.deepSleep.unit,
    icon: "😴",
    trend: data.deepSleep.trend,
    color: "#6366f1",
  });

  const statsGrid = ui.grid([durationCard, qualityCard, deepCard], { columns: 3, gap: 16 });

  // Sleep chart
  const chartTitle = ui.text("Sleep Duration (Past Week)", "h3");
  const chart = ui.chart({
    chartType: "bar",
    data: data.sleepChart.map((d) => ({ label: d.label, value: d.value })),
    xKey: "label",
    yKey: "value",
    height: 200,
    color: "#8b5cf6",
  });
  const chartCard = ui.card([chartTitle, chart], { padding: 20 });

  // Content container
  const content = ui.column([statsGrid, chartCard], { gap: 24, padding: 24 });

  const root = ui.column([header, content], { gap: 0 });

  return ui.build(root);
}

// ============================================================================
// Activity Page Generator
// ============================================================================

export function generateActivityPage(data: {
  steps: HealthMetric;
  calories: HealthMetric;
  activeMinutes: HealthMetric;
  stepsChart: ChartData[];
}): A2UIMessage {
  const ui = new A2UIGenerator("main");

  // Header
  const title = ui.text("Activity Summary", "h2");
  const subtitle = ui.text("Your daily movement and exercise", "caption");
  const header = ui.column([title, subtitle], { gap: 4, padding: 24 });

  // Stats grid
  const stepsCard = ui.statCard({
    title: data.steps.label,
    value: `${data.steps.value}`,
    subtitle: data.steps.unit,
    icon: "👟",
    trend: data.steps.trend,
    color: "#10b981",
  });

  const caloriesCard = ui.statCard({
    title: data.calories.label,
    value: `${data.calories.value}`,
    subtitle: data.calories.unit,
    icon: "🔥",
    trend: data.calories.trend,
    color: "#f97316",
  });

  const activeCard = ui.statCard({
    title: data.activeMinutes.label,
    value: `${data.activeMinutes.value}`,
    subtitle: data.activeMinutes.unit,
    icon: "⏱️",
    trend: data.activeMinutes.trend,
    color: "#3b82f6",
  });

  const statsGrid = ui.grid([stepsCard, caloriesCard, activeCard], { columns: 3, gap: 16 });

  // Steps chart
  const chartTitle = ui.text("Steps (Past Week)", "h3");
  const chart = ui.chart({
    chartType: "bar",
    data: data.stepsChart.map((d) => ({ label: d.label, value: d.value })),
    xKey: "label",
    yKey: "value",
    height: 200,
    color: "#10b981",
  });
  const chartCard = ui.card([chartTitle, chart], { padding: 20 });

  // Content container
  const content = ui.column([statsGrid, chartCard], { gap: 24, padding: 24 });

  const root = ui.column([header, content], { gap: 0 });

  return ui.build(root);
}

// ============================================================================
// Settings: Prompts Page Generator
// ============================================================================

interface PromptInfo {
  name: string;
  filename: string;
  title: string;
  lines: number;
}

interface CommitInfo {
  hash: string;
  shortHash: string;
  message: string;
  date: string;
  author: string;
}

export function generatePromptsPage(data: {
  prompts: PromptInfo[];
  selectedPrompt?: string;
  content?: string;
  commits?: CommitInfo[];
  editing?: boolean;
}): A2UIMessage {
  const ui = new A2UIGenerator("main");

  // Header
  const title = ui.text("Prompts", "h2");
  const subtitle = ui.text("Manage agent personality and instructions", "caption");
  const header = ui.column([title, subtitle], { gap: 4, padding: 24 });

  // Prompts list
  const promptRows = data.prompts.map(p => ({
    name: p.name,
    title: p.title,
    lines: p.lines,
    actions: p.name === data.selectedPrompt ? "Selected" : "View",
  }));

  const promptsTable = ui.dataTable(
    [
      { key: "name", label: "Name", sortable: true },
      { key: "title", label: "Title" },
      { key: "lines", label: "Lines" },
      { key: "actions", label: "", render: "badge" },
    ],
    promptRows,
    { onRowClick: "select_prompt" }
  );

  const promptsCard = ui.card([promptsTable], { title: "Prompt Files", padding: 20 });

  const children: string[] = [promptsCard];

  // If a prompt is selected, show editor and history
  if (data.selectedPrompt && data.content !== undefined) {
    // Editor
    const editor = ui.codeEditor(data.content, {
      language: "markdown",
      readonly: !data.editing,
      lineNumbers: true,
      height: 400,
      onChange: "prompt_content_change",
    });

    const editBtn = data.editing
      ? ui.button("Save", "save_prompt", { variant: "primary" })
      : ui.button("Edit", "edit_prompt", { variant: "outline" });

    const cancelBtn = data.editing
      ? ui.button("Cancel", "cancel_edit", { variant: "ghost" })
      : null;

    const revertBtn = data.editing
      ? null
      : (data.commits && data.commits.length > 1)
        ? ui.button("Revert", "revert_prompt", { variant: "ghost" })
        : null;

    const editorBtns = [editBtn];
    if (cancelBtn) editorBtns.push(cancelBtn);
    if (revertBtn) editorBtns.push(revertBtn);

    const editorHeader = ui.row(editorBtns, { gap: 8, justify: "end" });

    const editorCard = ui.card(
      [editorHeader, editor],
      { title: `${data.selectedPrompt}.md`, padding: 20 }
    );

    children.push(editorCard);

    // Version history
    if (data.commits && data.commits.length > 0) {
      const commitList = ui.commitList(data.commits, {
        onSelect: "select_commit",
      });

      const historyCard = ui.card([commitList], { title: "Version History", padding: 20 });
      children.push(historyCard);
    }
  }

  // Content container
  const content = ui.column(children, { gap: 24, padding: 24 });
  const root = ui.column([header, content], { gap: 0 });

  return ui.build(root);
}

// ============================================================================
// Settings: Skills Page Generator
// ============================================================================

interface SkillInfo {
  name: string;
  description?: string;
  enabled: boolean;
  emoji?: string;
  triggers?: string[];
}

export function generateSkillsPage(data: {
  skills: SkillInfo[];
  selectedSkill?: string;
  content?: string;
  editing?: boolean;
}): A2UIMessage {
  const ui = new A2UIGenerator("main");

  // Header
  const title = ui.text("Skills", "h2");
  const subtitle = ui.text("Manage agent capabilities and behaviors", "caption");

  const createBtn = ui.button("New Skill", "create_skill", { variant: "primary", size: "sm" });
  const headerRow = ui.row([ui.column([title, subtitle], { gap: 4 }), createBtn], {
    justify: "between",
    align: "start",
  });
  const header = ui.column([headerRow], { padding: 24 });

  // Skills list
  const skillRows = data.skills.map(s => ({
    name: `${s.emoji || "🧩"} ${s.name}`,
    description: s.description || "-",
    status: s.enabled ? "enabled" : "disabled",
    triggers: s.triggers?.join(", ") || "-",
  }));

  const skillsTable = ui.dataTable(
    [
      { key: "name", label: "Skill", sortable: true },
      { key: "description", label: "Description" },
      { key: "status", label: "Status", render: "badge" },
      { key: "triggers", label: "Triggers" },
    ],
    skillRows,
    { onRowClick: "select_skill" }
  );

  const skillsCard = ui.card([skillsTable], { title: "Installed Skills", padding: 20 });

  const children: string[] = [skillsCard];

  // If a skill is selected, show editor
  if (data.selectedSkill && data.content !== undefined) {
    const selectedInfo = data.skills.find(s => s.name === data.selectedSkill);

    // Editor
    const editor = ui.codeEditor(data.content, {
      language: "markdown",
      readonly: !data.editing,
      lineNumbers: true,
      height: 400,
      onChange: "skill_content_change",
    });

    const editBtn = data.editing
      ? ui.button("Save", "save_skill", { variant: "primary" })
      : ui.button("Edit", "edit_skill", { variant: "outline" });

    const toggleBtn = ui.button(
      selectedInfo?.enabled ? "Disable" : "Enable",
      "toggle_skill",
      { variant: selectedInfo?.enabled ? "ghost" : "secondary" }
    );

    const cancelBtn = data.editing
      ? ui.button("Cancel", "cancel_edit", { variant: "ghost" })
      : null;

    const editorActions = cancelBtn
      ? [editBtn, cancelBtn, toggleBtn]
      : [editBtn, toggleBtn];

    const editorHeader = ui.row(editorActions, { gap: 8, justify: "end" });

    const editorCard = ui.card(
      [editorHeader, editor],
      { title: `${data.selectedSkill}/SKILL.md`, padding: 20 }
    );

    children.push(editorCard);
  }

  // Content container
  const content = ui.column(children, { gap: 24, padding: 24 });
  const root = ui.column([header, content], { gap: 0 });

  return ui.build(root);
}

// ============================================================================
// Settings: Evolution Page Generator
// ============================================================================

interface TraceInfo {
  id: string;
  timestamp: number;
  userMessage: string;
  score?: number;
}

interface EvaluationStats {
  totalCount: number;
  averageScore: number;
  scoreDistribution: Record<string, number>;
}

interface EvaluationInfo {
  id: string;
  traceId: string;
  timestamp: number;
  score: number;
  feedback?: string | null;
}

interface TestCaseInfo {
  id: string;
  category: string;
  query: string;
  expected: { shouldMention?: string[]; shouldNotMention?: string[]; minScore?: number };
}

interface SuggestionInfo {
  id: string;
  timestamp: number;
  type: string;
  target: string;
  status: string;
  rationale?: string | null;
}

export function generateEvolutionPage(data: {
  activeTab: "overview" | "traces" | "evaluations" | "benchmark" | "suggestions";
  stats?: EvaluationStats;
  traces?: TraceInfo[];
  tracesPage?: number;
  tracesTotal?: number;
  evaluations?: EvaluationInfo[];
  testCases?: TestCaseInfo[];
  suggestions?: SuggestionInfo[];
}): A2UIMessage {
  const ui = new A2UIGenerator("main");

  // Header
  const title = ui.text("Evolution", "h2");
  const subtitle = ui.text("Self-improvement and quality monitoring", "caption");
  const header = ui.column([title, subtitle], { gap: 4, padding: 24 });

  // Tabs
  const tabContentIds: Record<string, string> = {};

  // Overview tab content
  if (data.activeTab === "overview" && data.stats) {
    const avgScoreGauge = ui.scoreGauge(data.stats.averageScore, {
      label: "Avg Score",
      max: 100,
      size: "lg",
    });

    const totalTraces = ui.statCard({
      title: "Total Traces",
      value: data.stats.totalCount,
      icon: "📊",
      color: "#667eea",
    });

    const avgScore = ui.statCard({
      title: "Average Score",
      value: Math.round(data.stats.averageScore),
      subtitle: "out of 100",
      icon: "⭐",
      color: "#f59e0b",
    });

    const overviewGrid = ui.grid([avgScoreGauge, totalTraces, avgScore], { columns: 3, gap: 16 });
    tabContentIds["overview"] = ui.column([overviewGrid], { gap: 16, padding: 16 });
  }

  // Traces tab content
  if (data.activeTab === "traces" && data.traces) {
    const traceRows = data.traces.map(t => ({
      id: t.id.slice(0, 8),
      time: new Date(t.timestamp).toLocaleString(),
      message: t.userMessage.slice(0, 50) + (t.userMessage.length > 50 ? "..." : ""),
      score: t.score ?? "-",
    }));

    const tracesTable = ui.dataTable(
      [
        { key: "id", label: "ID" },
        { key: "time", label: "Time", sortable: true },
        { key: "message", label: "Message" },
        { key: "score", label: "Score", render: "progress" },
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

    tabContentIds["traces"] = ui.column([tracesTable], { padding: 16 });
  }

  // Evaluations tab content
  if (data.activeTab === "evaluations" && data.evaluations) {
    const evalRows = data.evaluations.map(e => ({
      id: e.id.slice(0, 8),
      traceId: e.traceId.slice(0, 8),
      time: new Date(e.timestamp).toLocaleString(),
      score: e.score,
      feedback: e.feedback?.slice(0, 50) || "-",
    }));

    const evalsTable = ui.dataTable(
      [
        { key: "id", label: "ID" },
        { key: "traceId", label: "Trace" },
        { key: "time", label: "Time", sortable: true },
        { key: "score", label: "Score", render: "progress" },
        { key: "feedback", label: "Feedback" },
      ],
      evalRows,
      { onRowClick: "view_evaluation" }
    );

    tabContentIds["evaluations"] = ui.column([evalsTable], { padding: 16 });
  }

  // Benchmark tab content
  if (data.activeTab === "benchmark" && data.testCases) {
    const testRows = data.testCases.map(tc => ({
      id: tc.id.slice(0, 8),
      category: tc.category,
      query: tc.query.slice(0, 50) + (tc.query.length > 50 ? "..." : ""),
      minScore: tc.expected.minScore ?? "-",
      keywords: tc.expected.shouldMention?.length || 0,
    }));

    const testsTable = ui.dataTable(
      [
        { key: "id", label: "ID" },
        { key: "category", label: "Category", render: "badge" },
        { key: "query", label: "Query" },
        { key: "minScore", label: "Min Score" },
        { key: "keywords", label: "Keywords" },
      ],
      testRows,
      { onRowClick: "view_test_case" }
    );

    const runAllBtn = ui.button("Run All Tests", "run_benchmark", { variant: "secondary", size: "sm" });
    const addTestBtn = ui.button("Add Test Case", "create_test_case", { variant: "primary", size: "sm" });
    const btnRow = ui.row([runAllBtn, addTestBtn], { gap: 8, justify: "end", padding: 8 });

    tabContentIds["benchmark"] = ui.column([btnRow, testsTable], { padding: 16 });
  }

  // Suggestions tab content
  if (data.activeTab === "suggestions" && data.suggestions) {
    const suggRows = data.suggestions.map(s => ({
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
        { key: "time", label: "Time", sortable: true },
        { key: "type", label: "Type", render: "badge" },
        { key: "target", label: "Target" },
        { key: "status", label: "Status", render: "badge" },
        { key: "rationale", label: "Rationale" },
      ],
      suggRows,
      { onRowClick: "view_suggestion" }
    );

    tabContentIds["suggestions"] = ui.column([suggsTable], { padding: 16 });
  }

  const tabs = ui.tabs(
    [
      { id: "overview", label: "Overview", icon: "📊" },
      { id: "traces", label: "Traces", icon: "📝" },
      { id: "evaluations", label: "Evaluations", icon: "⭐" },
      { id: "benchmark", label: "Benchmark", icon: "🧪" },
      { id: "suggestions", label: "Suggestions", icon: "💡" },
    ],
    data.activeTab,
    tabContentIds
  );

  const tabsCard = ui.card([tabs], { padding: 20 });

  // Content container
  const content = ui.column([tabsCard], { gap: 24, padding: 24 });
  const root = ui.column([header, content], { gap: 0 });

  return ui.build(root);
}

// ============================================================================
// Toast Generator
// ============================================================================

export function generateToast(
  message: string,
  variant: "success" | "error" | "info" | "warning" = "info"
): A2UIMessage {
  const ui = new A2UIGenerator("toast");

  const icons: Record<string, string> = {
    success: "✓",
    error: "✕",
    info: "ℹ",
    warning: "⚠",
  };

  const icon = ui.text(icons[variant], "body");
  const text = ui.text(message, "body");
  const content = ui.row([icon, text], { gap: 12, align: "center" });
  const root = ui.card([content], { padding: 16 });

  return ui.build(root);
}

// ============================================================================
// Page Message Generator (combines sidebar + main)
// ============================================================================

export interface PageMessage {
  type: "page";
  surfaces: {
    sidebar: { components: unknown[]; root_id: string };
    main: { components: unknown[]; root_id: string };
  };
}

export function generatePage(
  view: string,
  mainContent: A2UIMessage
): PageMessage {
  const sidebar = generateSidebar(view);

  return {
    type: "page",
    surfaces: {
      sidebar: {
        components: sidebar.components,
        root_id: sidebar.root_id,
      },
      main: {
        components: mainContent.components,
        root_id: mainContent.root_id,
      },
    },
  };
}

// ============================================================================
// Modal Generators
// ============================================================================

interface TraceDetail {
  id: string;
  sessionId: string;
  timestamp: number;
  userMessage: string;
  agentResponse: string;
  toolCalls?: { tool: string; arguments: unknown; result: unknown }[];
  durationMs?: number;
}

export function generateTraceDetailModal(trace: TraceDetail): A2UIMessage {
  const ui = new A2UIGenerator("modal");

  const infoRow = ui.row([
    ui.text(`Session: ${trace.sessionId.slice(0, 8)}`, "caption"),
    ui.text(`Duration: ${trace.durationMs || 0}ms`, "caption"),
    ui.text(new Date(trace.timestamp).toLocaleString(), "caption"),
  ], { gap: 16 });

  const userLabel = ui.text("User Message", "label");
  const userMsg = ui.card([ui.text(trace.userMessage, "body")], { padding: 12 });

  const respLabel = ui.text("Agent Response", "label");
  const respMsg = ui.codeEditor(trace.agentResponse, {
    language: "markdown",
    readonly: true,
    height: 200,
  });

  const children: string[] = [infoRow, userLabel, userMsg, respLabel, respMsg];

  if (trace.toolCalls && trace.toolCalls.length > 0) {
    const toolsLabel = ui.text("Tool Calls", "label");
    const toolsContent = ui.codeEditor(JSON.stringify(trace.toolCalls, null, 2), {
      language: "json",
      readonly: true,
      height: 150,
    });
    children.push(toolsLabel, toolsContent);
  }

  const content = ui.column(children, { gap: 12 });
  const root = ui.modal(`Trace ${trace.id.slice(0, 8)}`, [content], { size: "lg" });

  return ui.build(root);
}

interface EvaluationDetail {
  id: string;
  traceId: string;
  timestamp: number;
  scores: { accuracy: number; relevance: number; helpfulness: number; safety: number; completeness: number };
  overallScore: number;
  feedback?: string;
  issues?: { type: string; description: string; severity: string }[];
}

export function generateEvaluationDetailModal(evaluation: EvaluationDetail): A2UIMessage {
  const ui = new A2UIGenerator("modal");

  const overallGauge = ui.scoreGauge(evaluation.overallScore, {
    label: "Overall Score",
    max: 100,
    size: "lg",
  });

  const scoreCards = Object.entries(evaluation.scores).map(([key, value]) =>
    ui.statCard({
      title: key.charAt(0).toUpperCase() + key.slice(1),
      value: value,
      icon: getScoreIcon(key),
      color: getScoreColor(value),
    })
  );

  const scoresGrid = ui.grid([overallGauge, ...scoreCards], { columns: 3, gap: 12 });

  const children: string[] = [scoresGrid];

  if (evaluation.feedback) {
    const feedbackLabel = ui.text("Feedback", "label");
    const feedbackText = ui.text(evaluation.feedback, "body");
    children.push(feedbackLabel, feedbackText);
  }

  if (evaluation.issues && evaluation.issues.length > 0) {
    const issuesLabel = ui.text("Issues", "label");
    const issueRows = evaluation.issues.map(issue => ({
      type: issue.type,
      description: issue.description,
      severity: issue.severity,
    }));
    const issuesTable = ui.dataTable(
      [
        { key: "type", label: "Type", render: "badge" },
        { key: "description", label: "Description" },
        { key: "severity", label: "Severity", render: "badge" },
      ],
      issueRows
    );
    children.push(issuesLabel, issuesTable);
  }

  const content = ui.column(children, { gap: 16 });
  const root = ui.modal(`Evaluation ${evaluation.id.slice(0, 8)}`, [content], { size: "lg" });

  return ui.build(root);
}

function getScoreIcon(key: string): string {
  const icons: Record<string, string> = {
    accuracy: "🎯",
    relevance: "🔗",
    helpfulness: "💡",
    safety: "🛡️",
    completeness: "✓",
  };
  return icons[key] || "📊";
}

function getScoreColor(score: number): string {
  if (score >= 80) return "#10b981";
  if (score >= 60) return "#f59e0b";
  return "#ef4444";
}

interface TestCaseDetail {
  id: string;
  category: string;
  query: string;
  context?: unknown;
  expected: { shouldMention?: string[]; shouldNotMention?: string[]; minScore?: number };
}

export function generateTestCaseDetailModal(testCase: TestCaseDetail): A2UIMessage {
  const ui = new A2UIGenerator("modal");

  const categoryBadge = ui.badge(testCase.category, { variant: "info" });
  const headerRow = ui.row([categoryBadge], { gap: 8 });

  const queryLabel = ui.text("Query", "label");
  const queryText = ui.text(testCase.query, "body");

  const children: string[] = [headerRow, queryLabel, queryText];

  if (testCase.expected.minScore) {
    const scoreLabel = ui.text(`Minimum Score: ${testCase.expected.minScore}`, "caption");
    children.push(scoreLabel);
  }

  if (testCase.expected.shouldMention && testCase.expected.shouldMention.length > 0) {
    const mentionLabel = ui.text("Should Mention", "label");
    const mentionBadges = testCase.expected.shouldMention.map(k => ui.badge(k, { variant: "success" }));
    const mentionRow = ui.row(mentionBadges, { gap: 8, wrap: true });
    children.push(mentionLabel, mentionRow);
  }

  if (testCase.expected.shouldNotMention && testCase.expected.shouldNotMention.length > 0) {
    const notMentionLabel = ui.text("Should NOT Mention", "label");
    const notMentionBadges = testCase.expected.shouldNotMention.map(k => ui.badge(k, { variant: "error" }));
    const notMentionRow = ui.row(notMentionBadges, { gap: 8, wrap: true });
    children.push(notMentionLabel, notMentionRow);
  }

  if (testCase.context) {
    const contextLabel = ui.text("Context", "label");
    const contextEditor = ui.codeEditor(JSON.stringify(testCase.context, null, 2), {
      language: "json",
      readonly: true,
      height: 150,
    });
    children.push(contextLabel, contextEditor);
  }

  // Action buttons
  const runBtn = ui.button("Run Test", "run_test_case", { variant: "primary", payload: { id: testCase.id } });
  const deleteBtn = ui.button("Delete", "delete_test_case", { variant: "danger", payload: { id: testCase.id } });
  const actionsRow = ui.row([runBtn, deleteBtn], { gap: 8, justify: "end" });
  children.push(actionsRow);

  const content = ui.column(children, { gap: 12 });
  const root = ui.modal(`Test Case ${testCase.id.slice(0, 8)}`, [content], { size: "md" });

  return ui.build(root);
}

interface SuggestionDetail {
  id: string;
  timestamp: number;
  type: string;
  target: string;
  currentValue?: string;
  suggestedValue: string;
  rationale?: string;
  status: string;
  validationResults?: { before: number; after: number; improvement: number };
}

export function generateSuggestionDetailModal(suggestion: SuggestionDetail): A2UIMessage {
  const ui = new A2UIGenerator("modal");

  const typeBadge = ui.badge(suggestion.type, { variant: "info" });
  const statusBadge = ui.badge(suggestion.status, {
    variant: suggestion.status === "applied" ? "success" :
             suggestion.status === "rejected" ? "error" :
             suggestion.status === "validated" ? "success" : "default"
  });
  const headerRow = ui.row([typeBadge, statusBadge], { gap: 8 });

  const targetLabel = ui.text(`Target: ${suggestion.target}`, "body");

  const children: string[] = [headerRow, targetLabel];

  if (suggestion.rationale) {
    const rationaleLabel = ui.text("Rationale", "label");
    const rationaleText = ui.text(suggestion.rationale, "body");
    children.push(rationaleLabel, rationaleText);
  }

  if (suggestion.currentValue) {
    const currentLabel = ui.text("Current Value", "label");
    const currentEditor = ui.codeEditor(suggestion.currentValue, {
      language: "markdown",
      readonly: true,
      height: 100,
    });
    children.push(currentLabel, currentEditor);
  }

  const suggestedLabel = ui.text("Suggested Value", "label");
  const suggestedEditor = ui.codeEditor(suggestion.suggestedValue, {
    language: "markdown",
    readonly: true,
    height: 150,
  });
  children.push(suggestedLabel, suggestedEditor);

  if (suggestion.validationResults) {
    const validLabel = ui.text("Validation Results", "label");
    const beforeCard = ui.statCard({ title: "Before", value: suggestion.validationResults.before, icon: "📉" });
    const afterCard = ui.statCard({ title: "After", value: suggestion.validationResults.after, icon: "📈" });
    const improvementCard = ui.statCard({
      title: "Improvement",
      value: `+${suggestion.validationResults.improvement}%`,
      icon: "✨",
      color: "#10b981"
    });
    const validGrid = ui.grid([beforeCard, afterCard, improvementCard], { columns: 3, gap: 12 });
    children.push(validLabel, validGrid);
  }

  // Action buttons (only for pending/validated suggestions)
  if (suggestion.status === "pending" || suggestion.status === "validated") {
    const applyBtn = ui.button("Apply", "apply_suggestion", { variant: "primary", payload: { id: suggestion.id } });
    const rejectBtn = ui.button("Reject", "reject_suggestion", { variant: "danger", payload: { id: suggestion.id } });
    const testBtn = ui.button("Test", "test_suggestion", { variant: "outline", payload: { id: suggestion.id } });
    const actionsRow = ui.row([testBtn, rejectBtn, applyBtn], { gap: 8, justify: "end" });
    children.push(actionsRow);
  }

  const content = ui.column(children, { gap: 12 });
  const root = ui.modal(`Suggestion ${suggestion.id.slice(0, 8)}`, [content], { size: "lg" });

  return ui.build(root);
}

// ============================================================================
// Form Modals
// ============================================================================

export function generateCreateTestCaseModal(): A2UIMessage {
  const ui = new A2UIGenerator("modal");

  const categoryInput = ui.formInput("category", "select", {
    label: "Category",
    required: true,
    options: [
      { value: "sleep", label: "Sleep" },
      { value: "heart", label: "Heart" },
      { value: "activity", label: "Activity" },
      { value: "safety", label: "Safety" },
      { value: "general", label: "General" },
    ],
  });

  const queryInput = ui.formInput("query", "textarea", {
    label: "Query",
    placeholder: "Enter the test query...",
    required: true,
  });

  const minScoreInput = ui.formInput("minScore", "number", {
    label: "Minimum Score",
    placeholder: "70",
  });

  const shouldMentionInput = ui.formInput("shouldMention", "text", {
    label: "Should Mention (comma-separated)",
    placeholder: "sleep, hours, quality",
  });

  const shouldNotMentionInput = ui.formInput("shouldNotMention", "text", {
    label: "Should NOT Mention (comma-separated)",
    placeholder: "diagnose, prescription",
  });

  const form = ui.form(
    [categoryInput, queryInput, minScoreInput, shouldMentionInput, shouldNotMentionInput],
    "submit_create_test_case",
    { submitLabel: "Create Test Case", cancelLabel: "Cancel", onCancel: "close_modal" }
  );

  const root = ui.modal("Create Test Case", [form], { size: "md" });

  return ui.build(root);
}

export function generateCreateSkillModal(): A2UIMessage {
  const ui = new A2UIGenerator("modal");

  const nameInput = ui.formInput("name", "text", {
    label: "Skill Name",
    placeholder: "my-skill (kebab-case)",
    required: true,
  });

  const descInput = ui.formInput("description", "text", {
    label: "Description",
    placeholder: "What does this skill do?",
    required: true,
  });

  const emojiInput = ui.formInput("emoji", "text", {
    label: "Emoji Icon",
    placeholder: "🎯",
  });

  const triggersInput = ui.formInput("triggers", "text", {
    label: "Triggers (comma-separated)",
    placeholder: "keyword1, keyword2",
  });

  const contentInput = ui.formInput("content", "textarea", {
    label: "Skill Instructions",
    placeholder: "Enter the skill instructions in markdown...",
  });

  const form = ui.form(
    [nameInput, descInput, emojiInput, triggersInput, contentInput],
    "submit_create_skill",
    { submitLabel: "Create Skill", cancelLabel: "Cancel", onCancel: "close_modal" }
  );

  const root = ui.modal("Create New Skill", [form], { size: "md" });

  return ui.build(root);
}

export function generatePromptRevertModal(promptName: string, commits: { hash: string; shortHash: string; message: string; date: string }[]): A2UIMessage {
  const ui = new A2UIGenerator("modal");

  const info = ui.text("Select a commit to revert to:", "body");
  const commitList = ui.commitList(commits.map(c => ({ ...c, author: "" })), { onSelect: "select_revert_commit" });

  const content = ui.column([info, commitList], { gap: 12 });
  const root = ui.modal(`Revert ${promptName}`, [content], { size: "md" });

  return ui.build(root);
}
