/**
 * Page Generators for A2UI
 *
 * Each function generates A2UI component trees for different views.
 * Agent calls these to render pages.
 */

import { A2UIGenerator, type A2UIMessage } from "./a2ui.js";
import { t } from "../locales/index.js";
import type { UserProfile, MemorySearchResult } from "../memory/types.js";
import {
  buildPlotlyRadarTraces,
  PLOTLY_LAYOUT,
  SHARP_CATEGORY_COLORS,
  getCategoryLabel,
  getCategoryIcon,
  type ComparisonRun,
} from "./evolution-lab.js";

// Types for page data
interface Message {
  role: "user" | "assistant" | "tool";
  content: string;
  cards?: {
    components: unknown[];
    root_id: string;
  };
}

interface QuickReply {
  label: string;
  content: string;
  icon?: string;
  variant?: "primary" | "danger";
}

interface ChatState {
  messages: Message[];
  streaming: boolean;
  streamingContent: string;
  quickReplies?: QuickReply[];
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
      { id: "chat", label: t("nav.chat"), icon: "chat" },
      { id: "dashboard", label: t("nav.dashboard"), icon: "activity" },
      { id: "memory", label: t("nav.memory"), icon: "brain" },
      { id: "evolution", label: t("nav.evolution"), icon: "flask" },
      { id: "system-agent", label: t("nav.systemAgent"), icon: "bot" },
    ],
    { activeId: activeView }
  );

  // Divider
  const dividerId = `div_${Date.now()}`;
  ui.addComponent(dividerId, { id: dividerId, type: "divider" });

  // Settings navigation
  const settingsNav = ui.nav(
    [
      { id: "settings/prompts", label: t("nav.prompts"), icon: "file-text" },
      { id: "settings/skills", label: t("nav.skills"), icon: "puzzle" },
      { id: "settings/integrations", label: t("nav.integrations"), icon: "link" },
      { id: "settings/logs", label: t("nav.logs"), icon: "bar-chart" },
      { id: "settings/general", label: t("nav.settings"), icon: "settings" },
    ],
    { activeId: activeView }
  );

  const root = ui.column([mainNav, dividerId, settingsNav], { gap: 0 });

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
    action: "send_message",
    messages: state.messages,
    streaming: state.streaming,
    streamingContent: state.streamingContent,
    ...(state.quickReplies?.length ? { quickReplies: state.quickReplies } : {}),
  });

  // Chat input component
  const inputId = `chat_input_${Date.now()}`;
  ui.addComponent(inputId, {
    id: inputId,
    type: "chat_input",
    action: "send_message",
    disabled: state.streaming,
    streaming: state.streaming,
    placeholder: t("chat.placeholder"),
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
// System Agent Page Generator
// ============================================================================

export function generateSystemAgentPage(state: {
  chatMessages: Array<{ role: string; content: string; cards?: any }>;
  streaming: boolean;
  streamingContent: string;
  quickReplies?: QuickReply[];
}): A2UIMessage {
  const ui = new A2UIGenerator("main");
  const children: string[] = [];

  // Chat messages with System Agent welcome screen
  const msgsId = `sa_msgs_${Date.now()}`;
  ui.addComponent(msgsId, {
    id: msgsId,
    type: "chat_messages",
    action: "sa_send_message",
    messages: state.chatMessages,
    streaming: state.streaming,
    streamingContent: state.streamingContent,
    ...(state.quickReplies?.length ? { quickReplies: state.quickReplies } : {}),
    welcomeTitle: t("systemAgent.title"),
    welcomeSubtitle: t("systemAgent.subtitle"),
    welcomeIcon: "bot",
    welcomeActions: [
      {
        label: t("systemAgent.runBenchmark"),
        icon: "test-tube",
        action: "sa_send_message",
        content: "Run a quick benchmark",
      },
      {
        label: t("systemAgent.startEvolution"),
        icon: "zap",
        action: "sa_send_message",
        content: "Start a full evolution cycle",
      },
      {
        label: t("systemAgent.gitStatus"),
        icon: "git-branch",
        action: "sa_send_message",
        content: "Show git status",
      },
    ],
  });
  children.push(msgsId);

  // Chat input (fixed at bottom via flexbox)
  const inputId = `sa_input_${Date.now()}`;
  ui.addComponent(inputId, {
    id: inputId,
    type: "chat_input",
    disabled: state.streaming,
    streaming: state.streaming,
    placeholder: t("systemAgent.placeholder"),
    action: "sa_send_message",
  });
  children.push(inputId);

  const root = ui.column(children, { gap: 0 });
  // Fill height for sticky input pattern
  const rootComp = ui["components"].get(root);
  if (rootComp) rootComp["style"] = "height: 100%;";

  return ui.build(root);
}

// ============================================================================
// Authorization Required Page Generator
// ============================================================================

export function generateAuthRequiredPage(): A2UIMessage {
  const ui = new A2UIGenerator("main");

  // Header
  const title = ui.text(t("auth.required"), "h2");
  const subtitle = ui.text(t("auth.requiredSubtitle"), "caption");
  const header = ui.column([title, subtitle], { gap: 4, padding: 24 });

  // Auth card with connect button
  const iconId = `auth_icon_${Date.now()}`;
  ui.addComponent(iconId, {
    id: iconId,
    type: "text",
    text: "🔐",
    variant: "h1",
  });

  const connectBtn = ui.button(t("auth.connectHuawei"), "start_huawei_auth", {
    variant: "primary",
    size: "lg",
  });

  const authContent = ui.column([iconId, connectBtn], {
    gap: 24,
    align: "center",
    padding: 48,
  });

  const authCard = ui.card([authContent], { padding: 24 });

  // Center the card
  const centeredContent = ui.column([authCard], {
    gap: 24,
    padding: 24,
    align: "center",
  });

  const root = ui.column([header, centeredContent], { gap: 0 });

  return ui.build(root);
}

// ============================================================================
// Health Page Generator
// ============================================================================

interface ECGRecord {
  time: string;
  avgHeartRate: number;
  arrhythmiaLabel: string;
}

export function generateHealthPage(data: {
  heartRate: HealthMetric;
  restingHeartRate: HealthMetric;
  spo2: HealthMetric;
  stress: HealthMetric;
  heartRateChart: ChartData[];
  ecg?: {
    hasArrhythmia: boolean;
    latestHeartRate: number | null;
    records: ECGRecord[];
  };
}): A2UIMessage {
  const ui = new A2UIGenerator("main");

  // Header
  const title = ui.text(t("health.title"), "h2");
  const subtitle = ui.text(t("health.subtitle"), "caption");
  const header = ui.column([title, subtitle], { gap: 4, padding: 24 });

  // Stats grid - 4 cards
  const hrCard = ui.statCard({
    title: data.heartRate.label,
    value: `${data.heartRate.value}`,
    subtitle: data.heartRate.unit,
    icon: data.heartRate.icon || "heart",
    trend: data.heartRate.trend,
    color: "#ef4444",
  });

  const restingHrCard = ui.statCard({
    title: data.restingHeartRate.label,
    value: `${data.restingHeartRate.value}`,
    subtitle: data.restingHeartRate.unit,
    icon: data.restingHeartRate.icon || "heart-pulse",
    trend: data.restingHeartRate.trend,
    color: "#f97316",
  });

  const spo2Card = ui.statCard({
    title: data.spo2.label,
    value: `${data.spo2.value}`,
    subtitle: data.spo2.unit,
    icon: data.spo2.icon || "wind",
    trend: data.spo2.trend,
    color: "#10b981",
  });

  const stressCard = ui.statCard({
    title: data.stress.label,
    value: `${data.stress.value}`,
    subtitle: data.stress.unit,
    icon: data.stress.icon || "brain",
    trend: data.stress.trend,
    color: "#8b5cf6",
  });

  const statsGrid = ui.grid([hrCard, restingHrCard, spo2Card, stressCard], { columns: 4, gap: 16 });

  // Heart rate chart
  const chartTitle = ui.text(t("health.heartRateTrend"), "h3");
  const chart = ui.chart({
    chartType: "line",
    data: data.heartRateChart.map((d) => ({ label: d.label, value: d.value })),
    xKey: "label",
    yKey: "value",
    height: 200,
    color: "#ef4444",
  });
  const chartCard = ui.card([chartTitle, chart], { padding: 20 });

  const contentChildren = [statsGrid, chartCard];

  // ECG section (if available)
  if (data.ecg && data.ecg.records.length > 0) {
    const ecgTitle = ui.text(t("health.ecg"), "h3");

    // ECG status badge
    const ecgStatusBadge = ui.badge(
      data.ecg.hasArrhythmia ? t("health.arrhythmiaDetected") : t("health.normalRhythm"),
      { variant: data.ecg.hasArrhythmia ? "warning" : "success" }
    );

    // Latest HR from ECG
    const latestHrText = ui.text(
      data.ecg.latestHeartRate
        ? `${t("health.latestEcgHr")}: ${data.ecg.latestHeartRate} ${t("health.bpmUnit")}`
        : "",
      "caption"
    );

    const ecgHeader = ui.row([ecgTitle, ecgStatusBadge], { gap: 12, align: "center" });

    // ECG records table
    const ecgRows = data.ecg.records.slice(0, 5).map((r) => ({
      time: new Date(r.time).toLocaleString(),
      heartRate: `${r.avgHeartRate} ${t("health.bpmUnit")}`,
      result: r.arrhythmiaLabel,
    }));

    const ecgTable = ui.table(
      [
        { key: "time", label: t("health.recordTime") },
        { key: "heartRate", label: t("health.heartRate") },
        { key: "result", label: t("health.ecgResult") },
      ],
      ecgRows
    );

    const ecgCard = ui.card([ecgHeader, latestHrText, ecgTable], { padding: 20 });
    contentChildren.push(ecgCard);
  }

  // Content container
  const content = ui.column(contentChildren, { gap: 24, padding: 24 });

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
  const title = ui.text(t("sleep.title"), "h2");
  const subtitle = ui.text(t("sleep.subtitle"), "caption");
  const header = ui.column([title, subtitle], { gap: 4, padding: 24 });

  // Stats grid
  const durationCard = ui.statCard({
    title: data.duration.label,
    value: `${data.duration.value}`,
    subtitle: data.duration.unit,
    icon: "moon",
    trend: data.duration.trend,
    color: "#8b5cf6",
  });

  const qualityCard = ui.statCard({
    title: data.quality.label,
    value: `${data.quality.value}`,
    subtitle: data.quality.unit,
    icon: "star",
    trend: data.quality.trend,
    color: "#f59e0b",
  });

  const deepCard = ui.statCard({
    title: data.deepSleep.label,
    value: `${data.deepSleep.value}`,
    subtitle: data.deepSleep.unit,
    icon: "bed",
    trend: data.deepSleep.trend,
    color: "#6366f1",
  });

  const statsGrid = ui.grid([durationCard, qualityCard, deepCard], { columns: 3, gap: 16 });

  // Sleep chart
  const chartTitle = ui.text(t("sleep.chartTitle"), "h3");
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
  const title = ui.text(t("activity.title"), "h2");
  const subtitle = ui.text(t("activity.subtitle"), "caption");
  const header = ui.column([title, subtitle], { gap: 4, padding: 24 });

  // Stats grid
  const stepsCard = ui.statCard({
    title: data.steps.label,
    value: `${data.steps.value}`,
    subtitle: data.steps.unit,
    icon: "footprints",
    trend: data.steps.trend,
    color: "#10b981",
  });

  const caloriesCard = ui.statCard({
    title: data.calories.label,
    value: `${data.calories.value}`,
    subtitle: data.calories.unit,
    icon: "flame",
    trend: data.calories.trend,
    color: "#f97316",
  });

  const activeCard = ui.statCard({
    title: data.activeMinutes.label,
    value: `${data.activeMinutes.value}`,
    subtitle: data.activeMinutes.unit,
    icon: "timer",
    trend: data.activeMinutes.trend,
    color: "#3b82f6",
  });

  const statsGrid = ui.grid([stepsCard, caloriesCard, activeCard], { columns: 3, gap: 16 });

  // Steps chart
  const chartTitle = ui.text(t("activity.chartTitle"), "h3");
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
// Memory Page Generator
// ============================================================================

const PROFILE_FIELD_LABELS: Record<string, { zh: string; en: string }> = {
  nickname: { zh: "昵称", en: "Nickname" },
  gender: { zh: "性别", en: "Gender" },
  birthYear: { zh: "出生年份", en: "Birth Year" },
  height: { zh: "身高", en: "Height" },
  weight: { zh: "体重", en: "Weight" },
  conditions: { zh: "慢性病", en: "Conditions" },
  allergies: { zh: "过敏史", en: "Allergies" },
  medications: { zh: "用药", en: "Medications" },
  "goals.primary": { zh: "主要目标", en: "Primary Goal" },
  "goals.dailySteps": { zh: "每日步数目标", en: "Steps Goal" },
  "goals.sleepHours": { zh: "睡眠目标", en: "Sleep Goal" },
  "lifestyle.sleepSchedule": { zh: "作息", en: "Sleep Schedule" },
  "lifestyle.exercisePreference": { zh: "运动偏好", en: "Exercise" },
  "lifestyle.dietPreference": { zh: "饮食偏好", en: "Diet" },
};

function formatProfileValue(key: string, value: unknown): string {
  if (value === undefined || value === null) return "-";
  if (key === "gender") return value === "male" ? "男 / Male" : "女 / Female";
  if (key === "height") return `${value}cm`;
  if (key === "weight") return `${value}kg`;
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "-";
  return String(value);
}

function getProfileRows(profile: UserProfile): Array<{ field: string; value: string }> {
  const rows: Array<{ field: string; value: string }> = [];

  const fieldMap: Array<{ key: string; getter: () => unknown }> = [
    { key: "nickname", getter: () => profile.nickname },
    { key: "gender", getter: () => profile.gender },
    { key: "birthYear", getter: () => profile.birthYear },
    { key: "height", getter: () => profile.height },
    { key: "weight", getter: () => profile.weight },
    { key: "conditions", getter: () => profile.conditions },
    { key: "allergies", getter: () => profile.allergies },
    { key: "medications", getter: () => profile.medications },
    { key: "goals.primary", getter: () => profile.goals?.primary },
    { key: "goals.dailySteps", getter: () => profile.goals?.dailySteps },
    { key: "goals.sleepHours", getter: () => profile.goals?.sleepHours },
    { key: "lifestyle.sleepSchedule", getter: () => profile.lifestyle?.sleepSchedule },
    { key: "lifestyle.exercisePreference", getter: () => profile.lifestyle?.exercisePreference },
    { key: "lifestyle.dietPreference", getter: () => profile.lifestyle?.dietPreference },
  ];

  for (const { key, getter } of fieldMap) {
    const label = PROFILE_FIELD_LABELS[key];
    rows.push({
      field: label ? `${label.zh} (${label.en})` : key,
      value: formatProfileValue(key, getter()),
    });
  }

  return rows;
}

export function generateMemoryPage(data: {
  activeTab: "profile" | "summary" | "logs" | "search" | "system-agent";
  profileCompleteness: number;
  profile: UserProfile;
  missingFields: string[];
  memorySummary: string;
  dailyLogs: Array<{ date: string; preview: string }>;
  searchQuery?: string;
  searchResults?: MemorySearchResult[];
  loading?: boolean;
  // System Agent memory tab
  saMemoryFiles?: SAMemoryFileInfo[];
  saSelectedMemoryFile?: string;
  saMemoryContent?: string;
  saEditingMemory?: boolean;
}): A2UIMessage {
  const ui = new A2UIGenerator("main");

  // Header
  const title = ui.text(t("memory.title"), "h2");
  const subtitle = ui.text(t("memory.subtitle"), "caption");
  const header = ui.column([title, subtitle], { gap: 4, padding: 24 });

  // Loading skeleton
  if (data.loading) {
    const s1 = ui.skeleton({ variant: "rectangular", height: 80 });
    const s2 = ui.skeleton({ variant: "rectangular", height: 80 });
    const s3 = ui.skeleton({ variant: "rectangular", height: 80 });
    const statsRow = ui.grid([s1, s2, s3], { columns: 3, gap: 16 });
    const s4 = ui.skeleton({ variant: "rectangular", height: 300 });
    const loadingContent = ui.column([statsRow, s4], { gap: 16, padding: 24 });
    const root = ui.column([header, loadingContent], { gap: 0 });
    return ui.build(root);
  }

  // Tab contents
  const tabContentIds: Record<string, string> = {};

  // Tab 1: Profile — stats + profile table
  if (data.activeTab === "profile") {
    const completenessCard = ui.statCard({
      title: t("memory.completeness"),
      value: `${data.profileCompleteness}%`,
      icon: "bar-chart",
      color:
        data.profileCompleteness >= 80
          ? "#10b981"
          : data.profileCompleteness >= 50
            ? "#f59e0b"
            : "#ef4444",
    });

    const missingCard = ui.statCard({
      title: t("memory.missingFields"),
      value: data.missingFields.length,
      subtitle:
        data.missingFields.length > 0
          ? data.missingFields.map((f) => PROFILE_FIELD_LABELS[f]?.zh || f).join(", ")
          : undefined,
      icon: "file-text",
      color: data.missingFields.length === 0 ? "#10b981" : "#f97316",
    });

    const statsGrid = ui.grid([completenessCard, missingCard], { columns: 2, gap: 16 });

    const profileRows = getProfileRows(data.profile);
    const profileTable = ui.dataTable(
      [
        { key: "field", label: t("memory.field") },
        { key: "value", label: t("memory.value") },
      ],
      profileRows
    );
    const profileCard = ui.card([profileTable], { title: t("memory.profile"), padding: 20 });

    tabContentIds["profile"] = ui.column([statsGrid, profileCard], { padding: 16, gap: 16 });
  }

  // Tab 2: Summary — MEMORY.md viewer
  if (data.activeTab === "summary") {
    if (data.memorySummary) {
      const editor = ui.codeEditor(data.memorySummary, {
        language: "markdown",
        readonly: true,
        height: 400,
      });
      tabContentIds["summary"] = ui.column([editor], { padding: 16 });
    } else {
      tabContentIds["summary"] = ui.column([ui.text(t("memory.noResults"), "caption")], {
        padding: 16,
      });
    }
  }

  // Tab 3: Logs — daily logs table
  if (data.activeTab === "logs") {
    if (data.dailyLogs.length > 0) {
      const logRows = data.dailyLogs.map((log) => ({
        date: log.date,
        preview: log.preview,
      }));
      const logsTable = ui.table(
        [
          { key: "date", label: t("evolution.time") },
          { key: "preview", label: t("memory.value") },
        ],
        logRows
      );
      tabContentIds["logs"] = ui.column([logsTable], { padding: 16 });
    } else {
      tabContentIds["logs"] = ui.column([ui.text(t("memory.noResults"), "caption")], {
        padding: 16,
      });
    }
  }

  // Tab 4: Search — input + results
  if (data.activeTab === "search") {
    const searchInput = ui.formInput("query", "text", {
      placeholder: t("memory.searchPlaceholder"),
      value: data.searchQuery || "",
    });
    const searchBtn = ui.button(t("memory.search"), "memory_search_submit", {
      variant: "primary",
      size: "sm",
    });
    const searchRow = ui.row([searchInput, searchBtn], { gap: 8, align: "end" });
    const searchChildren: string[] = [searchRow];

    if (data.searchQuery && data.searchResults) {
      if (data.searchResults.length === 0) {
        searchChildren.push(ui.text(t("memory.noResults"), "caption"));
      } else {
        for (const result of data.searchResults) {
          const scoreBadge = ui.badge(`${t("memory.score")}: ${Math.round(result.score * 100)}%`, {
            variant: result.score >= 0.7 ? "success" : result.score >= 0.4 ? "warning" : "default",
          });
          const pathText = ui.text(result.path, "caption");
          const snippetText = ui.text(result.snippet, "body");
          const resultHeader = ui.row([pathText, scoreBadge], { gap: 8, align: "center" });
          const resultCard = ui.card([resultHeader, snippetText], { padding: 12 });
          searchChildren.push(resultCard);
        }
      }
    }

    tabContentIds["search"] = ui.column(searchChildren, { padding: 16, gap: 12 });
  }

  // Tab 5: System Agent — memory files
  if (data.activeTab === "system-agent") {
    const saChildren: string[] = [];

    const memoryRows = (data.saMemoryFiles || []).map((f) => ({
      name: f.displayName,
      lines: f.lines,
      preview: f.preview || t("memory.memoryEmptyFile"),
    }));

    const memoryTable = ui.dataTable(
      [
        { key: "name", label: t("memory.memoryFileName"), sortable: true },
        { key: "lines", label: t("memory.memoryFileLines") },
        { key: "preview", label: t("memory.memoryFilePreview") },
      ],
      memoryRows,
      { onRowClick: "sa_memory_select" }
    );

    saChildren.push(memoryTable);

    // Selected memory file editor
    if (data.saSelectedMemoryFile && data.saMemoryContent !== undefined) {
      const editor = ui.codeEditor(data.saMemoryContent, {
        language: "markdown",
        readonly: !data.saEditingMemory,
        lineNumbers: true,
        height: 400,
        onChange: "sa_memory_content_change",
      });

      const editBtn = data.saEditingMemory
        ? ui.button(t("common.save"), "sa_memory_save", { variant: "primary" })
        : ui.button(t("common.edit"), "sa_memory_edit", { variant: "outline" });

      const cancelBtn = data.saEditingMemory
        ? ui.button(t("common.cancel"), "sa_memory_cancel", { variant: "ghost" })
        : null;

      const editorBtns = cancelBtn ? [editBtn, cancelBtn] : [editBtn];
      const editorHeader = ui.row(editorBtns, { gap: 8, justify: "end" });

      saChildren.push(
        ui.card([editorHeader, editor], {
          title: data.saSelectedMemoryFile,
          padding: 20,
        })
      );
    }

    tabContentIds["system-agent"] = ui.column(saChildren, { padding: 16, gap: 16 });
  }

  // Assemble tabs
  const tabs = ui.tabs(
    [
      { id: "profile", label: t("memory.tabProfile"), icon: "user" },
      { id: "summary", label: t("memory.tabSummary"), icon: "brain" },
      { id: "logs", label: t("memory.tabLogs"), icon: "calendar" },
      { id: "search", label: t("memory.tabSearch"), icon: "search" },
      { id: "system-agent", label: t("memory.tabSystemAgent"), icon: "bot" },
    ],
    data.activeTab,
    tabContentIds
  );

  // Content container — tabs directly without card wrapper to avoid double glass effect
  const content = ui.column([tabs], { gap: 24, padding: 24 });
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
  loading?: boolean;
  scope?: "pha" | "system";
}): A2UIMessage {
  const ui = new A2UIGenerator("main");
  const scope = data.scope || "pha";

  // Header
  const title = ui.text(t("prompts.title"), "h2");
  const subtitle = ui.text(t("prompts.subtitle"), "caption");
  const header = ui.column([title, subtitle], { gap: 4, padding: 24 });

  // Loading skeleton — need early return before building tabs
  if (data.loading) {
    const scopeTabContentIds: Record<string, string> = {};
    const s1 = ui.skeleton({ variant: "rectangular", height: 200 });
    scopeTabContentIds[scope] = ui.column([s1], { gap: 16, padding: 24 });
    const scopeTabs = ui.tabs(
      [
        { id: "pha", label: t("prompts.tabPha"), icon: "heart" },
        { id: "system", label: t("prompts.tabSystem"), icon: "bot" },
      ],
      scope,
      scopeTabContentIds
    );
    const root = ui.column([header, scopeTabs], { gap: 0 });
    return ui.build(root);
  }

  // Prompts list
  const promptRows = data.prompts.map((p) => ({
    name: p.name,
    title: p.title,
    lines: p.lines,
    actions: p.name === data.selectedPrompt ? "Selected" : "View",
  }));

  const promptsTable = ui.dataTable(
    [
      { key: "name", label: t("prompts.name"), sortable: true },
      { key: "title", label: t("prompts.promptTitle") },
      { key: "lines", label: t("prompts.lines") },
      { key: "actions", label: "", render: "badge" },
    ],
    promptRows,
    { onRowClick: "select_prompt" }
  );

  const promptsCard = ui.card([promptsTable], { title: t("prompts.cardTitle"), padding: 20 });

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
      ? ui.button(t("common.save"), "save_prompt", { variant: "primary" })
      : ui.button(t("common.edit"), "edit_prompt", { variant: "outline" });

    const cancelBtn = data.editing
      ? ui.button(t("common.cancel"), "cancel_edit", { variant: "ghost" })
      : null;

    const revertBtn = data.editing
      ? null
      : data.commits && data.commits.length > 1
        ? ui.button(t("common.revert"), "revert_prompt", { variant: "ghost" })
        : null;

    const editorBtns = [editBtn];
    if (cancelBtn) editorBtns.push(cancelBtn);
    if (revertBtn) editorBtns.push(revertBtn);

    const editorHeader = ui.row(editorBtns, { gap: 8, justify: "end" });

    const editorCard = ui.card([editorHeader, editor], {
      title: `${data.selectedPrompt}.md`,
      padding: 20,
    });

    children.push(editorCard);

    // Version history
    if (data.commits && data.commits.length > 0) {
      const commitList = ui.commitList(data.commits, {
        onSelect: "select_commit",
      });

      const historyCard = ui.card([commitList], {
        title: t("prompts.versionHistory"),
        padding: 20,
      });
      children.push(historyCard);
    }
  }

  // Wrap content as tab content so tabs component renders it
  const scopeTabContentIds: Record<string, string> = {};
  scopeTabContentIds[scope] = ui.column(children, { gap: 24, padding: 24 });
  const scopeTabs = ui.tabs(
    [
      { id: "pha", label: t("prompts.tabPha"), icon: "heart" },
      { id: "system", label: t("prompts.tabSystem"), icon: "bot" },
    ],
    scope,
    scopeTabContentIds
  );

  const root = ui.column([header, scopeTabs], { gap: 0 });

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
  type?: string;
  structure?: { files: string[]; hasReference: boolean; hasScripts: boolean };
}

export function generateSkillsPage(data: {
  skills: SkillInfo[];
  selectedSkill?: string;
  selectedSkillFile?: string;
  content?: string;
  language?: string;
  editing?: boolean;
  loading?: boolean;
  scope?: "pha" | "system";
}): A2UIMessage {
  const ui = new A2UIGenerator("main");
  const scope = data.scope || "pha";

  // Header
  const title = ui.text(t("skills.title"), "h2");
  const subtitle = ui.text(t("skills.subtitle"), "caption");

  const headerChildren = [ui.column([title, subtitle], { gap: 4 })];
  // Only show create button for PHA scope
  if (scope === "pha") {
    const createBtn = ui.button(t("skills.newSkill"), "create_skill", {
      variant: "primary",
      size: "sm",
    });
    headerChildren.push(createBtn);
  }
  const headerRow = ui.row(headerChildren, {
    justify: "between",
    align: "start",
  });
  const header = ui.column([headerRow], { padding: 24 });

  // Loading skeleton — early return before building tabs
  if (data.loading) {
    const scopeTabContentIds: Record<string, string> = {};
    const s1 = ui.skeleton({ variant: "rectangular", height: 200 });
    scopeTabContentIds[scope] = ui.column([s1], { gap: 16, padding: 24 });
    const scopeTabs = ui.tabs(
      [
        { id: "pha", label: t("skills.tabPha"), icon: "heart" },
        { id: "system", label: t("skills.tabSystem"), icon: "bot" },
      ],
      scope,
      scopeTabContentIds
    );
    const root = ui.column([header, scopeTabs], { gap: 0 });
    return ui.build(root);
  }

  // Filter skills by current scope
  const filteredSkills =
    scope === "system"
      ? data.skills.filter((s) => s.type === "system")
      : data.skills.filter((s) => s.type !== "system");

  const children: string[] = [];

  // Skills list for current scope
  if (filteredSkills.length > 0) {
    const skillRows = filteredSkills.map((s) => ({
      name: `${s.emoji || "🧩"} ${s.name}`,
      description: s.description || "-",
      status: s.enabled ? "enabled" : "disabled",
      triggers: s.triggers?.join(", ") || "-",
    }));
    const skillsTable = ui.dataTable(
      [
        { key: "name", label: t("skills.skill"), sortable: true },
        { key: "description", label: t("skills.description") },
        { key: "status", label: t("skills.status"), render: "badge" },
        { key: "triggers", label: t("skills.triggers") },
      ],
      skillRows,
      { onRowClick: "select_skill" }
    );
    children.push(ui.card([skillsTable], { title: t("skills.cardTitle"), padding: 20 }));
  } else {
    const emptyText = ui.text("No skills installed", "caption");
    children.push(emptyText);
  }

  // If a skill is selected, show editor
  if (data.selectedSkill && data.content !== undefined) {
    const selectedInfo = data.skills.find((s) => s.name === data.selectedSkill);
    const currentFile = data.selectedSkillFile || "SKILL.md";
    const editorLanguage = (data.language || "markdown") as
      | "markdown"
      | "json"
      | "yaml"
      | "typescript"
      | "javascript";

    const editorChildren: string[] = [];

    // File selector (when skill has multiple files)
    const skillFiles = selectedInfo?.structure?.files;
    if (skillFiles && skillFiles.length > 1) {
      const fileButtons = skillFiles.map((f) =>
        ui.button(f, "select_skill_file", {
          variant: f === currentFile ? "primary" : "outline",
          size: "sm",
          payload: { file: f },
        })
      );
      editorChildren.push(ui.row(fileButtons));
    }

    // Editor
    const editor = ui.codeEditor(data.content, {
      language: editorLanguage,
      readonly: !data.editing,
      lineNumbers: true,
      height: 400,
      onChange: "skill_content_change",
    });

    const editBtn = data.editing
      ? ui.button(t("common.save"), "save_skill", { variant: "primary" })
      : ui.button(t("common.edit"), "edit_skill", { variant: "outline" });

    const toggleBtn = ui.button(
      selectedInfo?.enabled ? t("common.disable") : t("common.enable"),
      "toggle_skill",
      { variant: selectedInfo?.enabled ? "ghost" : "secondary" }
    );

    const cancelBtn = data.editing
      ? ui.button(t("common.cancel"), "cancel_edit", { variant: "ghost" })
      : null;

    const editorActions = cancelBtn ? [editBtn, cancelBtn, toggleBtn] : [editBtn, toggleBtn];

    const editorHeader = ui.row(editorActions, { gap: 8, justify: "end" });

    editorChildren.push(editorHeader);
    editorChildren.push(editor);

    const editorCard = ui.card(editorChildren, {
      title: `${data.selectedSkill}/${currentFile}`,
      padding: 20,
    });

    children.push(editorCard);
  }

  // Wrap content as tab content so tabs component renders it
  const scopeTabContentIds: Record<string, string> = {};
  scopeTabContentIds[scope] = ui.column(children, { gap: 24, padding: 24 });
  const scopeTabs = ui.tabs(
    [
      { id: "pha", label: t("skills.tabPha"), icon: "heart" },
      { id: "system", label: t("skills.tabSystem"), icon: "bot" },
    ],
    scope,
    scopeTabContentIds
  );

  const root = ui.column([header, scopeTabs], { gap: 0 });

  return ui.build(root);
}

// ============================================================================
// System Agent Memory File Info (used by Memory page's system-agent tab)
// ============================================================================

interface SAMemoryFileInfo {
  name: string;
  displayName: string;
  lines: number;
  preview: string;
}

// generateSystemAgentSettingsPage removed — content merged into Prompts/Skills/Memory pages

// ============================================================================
// (Evolution Page Generator removed — now in evolution-lab.ts as 5-Tab Dashboard)
// Types retained for modal generators
// ============================================================================

interface BenchmarkRunInfo {
  id: string;
  timestamp: number;
  versionTag?: string | null;
  profile: string;
  overallScore: number;
  passedCount: number;
  failedCount: number;
  totalTestCases: number;
  durationMs?: number | null;
  metadata?: {
    modelId?: string;
    provider?: string;
    gitVersion?: string;
    [key: string]: unknown;
  };
}

interface CategoryScoreInfo {
  category: string;
  score: number;
  testCount: number;
  passedCount: number;
  subComponents?: Array<{ name: string; score: number; scoring: "binary" | "3-point" }>;
}

// ============================================================================
// Integrations Page Generator
// ============================================================================

export interface IntegrationsPageData {
  activeTab: "overview" | "issues" | "prs" | "branches";
  repo?: {
    name: string;
    url: string;
    defaultBranch: string;
    openIssueCount: number;
    openPRCount: number;
  } | null;
  issues?: Array<{
    number: number;
    title: string;
    state: string;
    labels: string[];
    createdAt: string;
    author: string;
  }>;
  prs?: Array<{
    number: number;
    title: string;
    state: string;
    labels: string[];
    createdAt: string;
    author: string;
    headRefName: string;
    baseRefName: string;
    isDraft: boolean;
  }>;
  branchInfo?: {
    current: string;
    branches: string[];
    recentCommits: Array<{
      hash: string;
      shortHash: string;
      message: string;
      date: string;
      author: string;
    }>;
  };
  ghAvailable: boolean;
  loading?: boolean;
}

export function generateIntegrationsPage(data: IntegrationsPageData): A2UIMessage {
  const ui = new A2UIGenerator("main");

  // Header
  const title = ui.text(t("integrations.title"), "h1");
  const subtitle = ui.text(t("integrations.subtitle"), "caption");
  const refreshBtn = ui.button(t("integrations.refreshData"), "refresh_integrations", {
    variant: "outline",
    size: "sm",
  });
  const headerRow = ui.row([ui.column([title, subtitle], { gap: 4 }), refreshBtn], {
    justify: "between",
    align: "center",
  });

  // Tabs (always render for navigation, even during loading)
  const tabs = ui.tabs(
    [
      { id: "overview", label: t("integrations.tabOverview"), icon: "info" },
      { id: "issues", label: t("integrations.tabIssues"), icon: "alert-triangle" },
      { id: "prs", label: t("integrations.tabPRs"), icon: "link" },
      { id: "branches", label: t("integrations.tabBranches"), icon: "activity" },
    ],
    data.activeTab,
    {
      overview: "int_tab_overview",
      issues: "int_tab_issues",
      prs: "int_tab_prs",
      branches: "int_tab_branches",
    }
  );

  // Loading skeleton
  if (data.loading) {
    const s1 = ui.skeleton({ variant: "rectangular", height: 80 });
    const s2 = ui.skeleton({ variant: "rectangular", height: 80 });
    const s3 = ui.skeleton({ variant: "rectangular", height: 80 });
    const statsRow = ui.grid([s1, s2, s3], { columns: 3, gap: 16 });
    const s4 = ui.skeleton({ variant: "rectangular", height: 200 });
    const loadingContent = ui.column([statsRow, s4], { gap: 16 });

    // Register skeleton as tab content for all tabs
    const skeletonId = `int_tab_${data.activeTab}`;
    ui.addComponent(skeletonId, { id: skeletonId, type: "column", children: [loadingContent] });
    // Register empty content for inactive tabs
    for (const tabId of ["overview", "issues", "prs", "branches"]) {
      if (tabId !== data.activeTab) {
        const emptyId = `int_tab_${tabId}`;
        ui.addComponent(emptyId, { id: emptyId, type: "column", children: [] });
      }
    }

    const root = ui.column([headerRow, tabs], { gap: 24, padding: 24 });
    return ui.build(root);
  }

  if (!data.ghAvailable) {
    // Show "not connected" state
    const noGhTitle = ui.text(t("integrations.noGitHub"), "h2");
    const noGhHint = ui.text(t("integrations.noGitHubHint"), "body");
    const noGhContent = ui.column([noGhTitle, noGhHint], { gap: 8 });
    const noGhCard = ui.card([noGhContent], { padding: 24 });
    const root = ui.column([headerRow, noGhCard], { gap: 24, padding: 24 });
    return ui.build(root);
  }

  let content: string;

  if (data.activeTab === "overview") {
    content = generateIntegrationsOverview(ui, data);
  } else if (data.activeTab === "issues") {
    content = generateIntegrationsIssues(ui, data.issues || []);
  } else if (data.activeTab === "prs") {
    content = generateIntegrationsPRs(ui, data.prs || []);
  } else {
    content = generateIntegrationsBranches(ui, data.branchInfo);
  }

  // Tab content containers
  const overviewContent = data.activeTab === "overview" ? content : ui.column([], { gap: 0 });
  const issuesContent = data.activeTab === "issues" ? content : ui.column([], { gap: 0 });
  const prsContent = data.activeTab === "prs" ? content : ui.column([], { gap: 0 });
  const branchesContent = data.activeTab === "branches" ? content : ui.column([], { gap: 0 });

  // Register tab content IDs
  ui.addComponent("int_tab_overview", {
    id: "int_tab_overview",
    type: "column",
    children: [overviewContent],
  });
  ui.addComponent("int_tab_issues", {
    id: "int_tab_issues",
    type: "column",
    children: [issuesContent],
  });
  ui.addComponent("int_tab_prs", {
    id: "int_tab_prs",
    type: "column",
    children: [prsContent],
  });
  ui.addComponent("int_tab_branches", {
    id: "int_tab_branches",
    type: "column",
    children: [branchesContent],
  });

  const header = ui.column([headerRow, tabs], { gap: 16 });
  const root = ui.column([header], { gap: 0, padding: 24 });

  return ui.build(root);
}

function generateIntegrationsOverview(ui: A2UIGenerator, data: IntegrationsPageData): string {
  const cards: string[] = [];

  if (data.repo) {
    cards.push(
      ui.statCard({
        title: t("integrations.repo"),
        value: data.repo.name,
        icon: "link",
        subtitle: data.repo.url,
      })
    );
    cards.push(
      ui.statCard({
        title: t("integrations.openIssues"),
        value: data.repo.openIssueCount,
        icon: "alert-triangle",
        color: data.repo.openIssueCount > 10 ? "#ef4444" : "#22c55e",
      })
    );
    cards.push(
      ui.statCard({
        title: t("integrations.openPRs"),
        value: data.repo.openPRCount,
        icon: "link",
        color: data.repo.openPRCount > 5 ? "#f59e0b" : "#22c55e",
      })
    );
    cards.push(
      ui.statCard({
        title: t("integrations.currentBranch"),
        value: data.branchInfo?.current || data.repo.defaultBranch,
        icon: "activity",
      })
    );
  }

  const statsGrid = ui.grid(cards, { columns: 4, gap: 16, responsive: true });

  // Feedback issues section
  const feedbackIssues = (data.issues || []).filter((i) => i.labels.some((l) => l === "feedback"));

  const sections: string[] = [statsGrid];

  if (feedbackIssues.length > 0) {
    const feedbackTitle = ui.text(t("integrations.feedbackIssues"), "h2");
    const feedbackTable = ui.dataTable(
      [
        { key: "number", label: t("integrations.issueNumber"), width: "60px" },
        { key: "title", label: t("integrations.issueTitle") },
        { key: "state", label: t("integrations.state"), width: "80px", render: "badge" },
        { key: "author", label: t("integrations.author"), width: "100px" },
        { key: "createdAt", label: t("integrations.created"), width: "120px", render: "date" },
      ],
      feedbackIssues.map((i) => ({
        number: `#${i.number}`,
        title: i.title,
        state: i.state,
        author: i.author,
        createdAt: i.createdAt,
      })),
      { onRowClick: "view_issue" }
    );
    sections.push(feedbackTitle, feedbackTable);
  }

  // Recent commits section
  if (data.branchInfo?.recentCommits.length) {
    const commitsTitle = ui.text(t("integrations.recentCommits"), "h2");
    const commitList = ui.commitList(
      data.branchInfo.recentCommits.slice(0, 5).map((c) => ({
        hash: c.hash,
        shortHash: c.shortHash,
        message: c.message,
        date: c.date,
        author: c.author,
      }))
    );
    sections.push(commitsTitle, commitList);
  }

  return ui.column(sections, { gap: 24 });
}

function generateIntegrationsIssues(
  ui: A2UIGenerator,
  issues: IntegrationsPageData["issues"] & object
): string {
  if (issues.length === 0) {
    const empty = ui.text("No issues found", "body");
    return ui.column([empty], { gap: 16 });
  }

  const table = ui.dataTable(
    [
      { key: "number", label: t("integrations.issueNumber"), width: "60px" },
      { key: "title", label: t("integrations.issueTitle") },
      { key: "state", label: t("integrations.state"), width: "80px", render: "badge" },
      { key: "labels", label: t("integrations.labels"), width: "200px" },
      { key: "author", label: t("integrations.author"), width: "100px" },
      { key: "createdAt", label: t("integrations.created"), width: "120px", render: "date" },
    ],
    issues.map((i) => ({
      number: `#${i.number}`,
      title: i.title,
      state: i.state,
      labels: i.labels.join(", "),
      author: i.author,
      createdAt: i.createdAt,
    })),
    { onRowClick: "view_issue", sortBy: "createdAt", sortOrder: "desc" as const }
  );

  return ui.column([table], { gap: 16 });
}

function generateIntegrationsPRs(
  ui: A2UIGenerator,
  prs: IntegrationsPageData["prs"] & object
): string {
  if (prs.length === 0) {
    const empty = ui.text("No pull requests found", "body");
    return ui.column([empty], { gap: 16 });
  }

  const table = ui.dataTable(
    [
      { key: "number", label: "#", width: "60px" },
      { key: "title", label: t("integrations.prTitle") },
      { key: "state", label: t("integrations.state"), width: "80px", render: "badge" },
      { key: "headRefName", label: t("integrations.branch"), width: "150px" },
      { key: "baseRefName", label: t("integrations.baseBranch"), width: "100px" },
      { key: "author", label: t("integrations.author"), width: "100px" },
      { key: "createdAt", label: t("integrations.created"), width: "120px", render: "date" },
    ],
    prs.map((p) => ({
      number: `#${p.number}`,
      title: p.isDraft ? `[${t("integrations.draft")}] ${p.title}` : p.title,
      state: p.state,
      headRefName: p.headRefName,
      baseRefName: p.baseRefName,
      author: p.author,
      createdAt: p.createdAt,
    })),
    { onRowClick: "view_pr", sortBy: "createdAt", sortOrder: "desc" as const }
  );

  return ui.column([table], { gap: 16 });
}

function generateIntegrationsBranches(
  ui: A2UIGenerator,
  branchInfo?: IntegrationsPageData["branchInfo"]
): string {
  if (!branchInfo) {
    const empty = ui.text("No branch information available", "body");
    return ui.column([empty], { gap: 16 });
  }

  const sections: string[] = [];

  // Current branch
  const currentBranchStat = ui.statCard({
    title: t("integrations.currentBranch"),
    value: branchInfo.current,
    icon: "activity",
  });
  sections.push(currentBranchStat);

  // Branch list as a table
  if (branchInfo.branches.length > 0) {
    const branchTable = ui.dataTable(
      [
        { key: "name", label: t("integrations.branch") },
        { key: "current", label: t("integrations.state"), width: "80px", render: "badge" },
      ],
      branchInfo.branches.map((b) => ({
        name: b,
        current: b === branchInfo.current ? "current" : "",
      }))
    );
    sections.push(branchTable);
  }

  // Recent commits
  if (branchInfo.recentCommits.length > 0) {
    const commitsTitle = ui.text(t("integrations.recentCommits"), "h2");
    const commitList = ui.commitList(
      branchInfo.recentCommits.map((c) => ({
        hash: c.hash,
        shortHash: c.shortHash,
        message: c.message,
        date: c.date,
        author: c.author,
      }))
    );
    sections.push(commitsTitle, commitList);
  }

  return ui.column(sections, { gap: 16 });
}

// ============================================================================
// Logs Page Generator
// ============================================================================

interface LogsPageData {
  entries: Array<{
    time: string;
    level: string;
    subsystem: string;
    message: string;
    data?: unknown;
  }>;
  levels: string[];
  subsystems: string[];
  activeLevel?: string;
  activeSubsystem?: string;
}

export function generateLogsPage(data: LogsPageData): A2UIMessage {
  const ui = new A2UIGenerator("main");

  // Header
  const title = ui.text(t("logs.title"), "h1");
  const subtitle = ui.text(t("logs.subtitle"), "caption");
  const refreshBtn = ui.button(t("logs.refresh"), "logs_refresh", {
    variant: "outline",
    size: "sm",
  });
  const headerRow = ui.row([ui.column([title, subtitle], { gap: 4 }), refreshBtn], {
    justify: "between",
    align: "center",
  });

  // Filter row
  const levelOptions = [
    { value: "", label: t("logs.allLevels") },
    ...data.levels.map((l) => ({ value: l, label: l.toUpperCase() })),
  ];
  const subsystemOptions = [
    { value: "", label: t("logs.allSubsystems") },
    ...data.subsystems.map((s) => ({ value: s, label: s })),
  ];

  const levelSelect = ui.formInput("level", "select", {
    label: t("logs.level"),
    options: levelOptions,
    value: data.activeLevel || "",
    onChange: "logs_filter_level",
  });
  const subsystemSelect = ui.formInput("subsystem", "select", {
    label: t("logs.subsystem"),
    options: subsystemOptions,
    value: data.activeSubsystem || "",
    onChange: "logs_filter_subsystem",
  });
  const filterRow = ui.row([levelSelect, subsystemSelect], { gap: 12 });

  // Log viewer component
  const logViewer = ui.logViewer(data.entries, {
    levels: data.levels,
    subsystems: data.subsystems,
    activeLevel: data.activeLevel,
    activeSubsystem: data.activeSubsystem,
  });

  // No logs message
  if (data.entries.length === 0) {
    const noLogs = ui.text(t("logs.noLogs"), "caption");
    const root = ui.column([headerRow, filterRow, noLogs], { gap: 16, padding: 24 });
    return ui.build(root);
  }

  const root = ui.column([headerRow, filterRow, logViewer], { gap: 16, padding: 24 });
  return ui.build(root);
}

// ============================================================================
// Settings (General) Page Generator
// ============================================================================

export interface SettingsPageData {
  provider: string;
  providers: Array<{ value: string; label: string; hint?: string }>;
  apiKeySet: boolean;
  modelId: string;
  baseUrl: string;
  gatewayPort: number;
  gatewayAutoStart: boolean;
  dataSourceType: string;
  embeddingEnabled: boolean;
  embeddingModel: string;
  tuiTheme: string;
  tuiShowToolCalls: boolean;
  huaweiClientId: string;
  huaweiClientSecret: string;
  huaweiRedirectUri: string;
  huaweiAuthUrl: string;
  huaweiTokenUrl: string;
  huaweiApiBaseUrl: string;
  applyEngine: string;
  benchmarkConcurrency: number;
  judgeProvider: string;
  judgeModelId: string;
  judgeLabel: string;
  benchmarkModelsJson: string;
  userUuid: string;
  huaweiScopes: string;
  mcpJson: string;
  pluginsJson: string;
}

export function generateSettingsPage(data: SettingsPageData): A2UIMessage {
  const ui = new A2UIGenerator("main");
  const saveLabel = t("settings.saveButton");

  // Header
  const title = ui.text(t("settings.title"), "h2");
  const subtitle = ui.text(t("settings.subtitle"), "caption");
  const uuidText = ui.text(`${t("settings.userUuid")}: ${data.userUuid || "—"}`, "caption");
  const header = ui.column([title, subtitle, uuidText], { gap: 4 });

  // ---- LLM Section ----
  const providerSelect = ui.formInput("provider", "select", {
    label: t("settings.llmProvider"),
    options: data.providers.map((p) => ({
      value: p.value,
      label: `${p.label}${p.hint ? ` — ${p.hint}` : ""}`,
    })),
    value: data.provider,
  });
  const apiKeyInput = ui.formInput("apiKey", "text", {
    label: t("settings.apiKey"),
    placeholder: t("settings.apiKeyPlaceholder"),
    value: data.apiKeySet ? "••••••••" : "",
  });
  const modelInput = ui.formInput("modelId", "text", {
    label: t("settings.modelId"),
    value: data.modelId,
  });
  const baseUrlInput = ui.formInput("baseUrl", "text", {
    label: t("settings.baseUrl"),
    placeholder: t("settings.baseUrlPlaceholder"),
    value: data.baseUrl,
  });
  const llmForm = ui.form(
    [providerSelect, apiKeyInput, modelInput, baseUrlInput],
    "settings_save_llm",
    { submitLabel: saveLabel }
  );
  const llmCard = ui.card([llmForm], { title: t("settings.sectionLlm"), padding: 20 });

  // ---- Gateway Section ----
  const portInput = ui.formInput("port", "text", {
    label: t("settings.gatewayPort"),
    value: String(data.gatewayPort),
  });
  const autoStartSelect = ui.formInput("autoStart", "select", {
    label: t("settings.gatewayAutoStart"),
    options: [
      { value: "true", label: t("common.enable") },
      { value: "false", label: t("common.disable") },
    ],
    value: String(data.gatewayAutoStart),
  });
  const gatewayForm = ui.form([portInput, autoStartSelect], "settings_save_gateway", {
    submitLabel: saveLabel,
  });
  const gatewayCard = ui.card([gatewayForm], { title: t("settings.sectionGateway"), padding: 20 });

  // ---- Data Source Section ----
  const dsSelect = ui.formInput("dataSourceType", "select", {
    label: t("settings.dataSource"),
    options: [
      { value: "mock", label: "Mock (Demo)" },
      { value: "huawei", label: "Huawei Health" },
      { value: "apple", label: "Apple Health" },
    ],
    value: data.dataSourceType,
  });
  const dsInputs: string[] = [dsSelect];

  // Show Huawei config fields when huawei is selected
  if (data.dataSourceType === "huawei") {
    dsInputs.push(
      ui.formInput("huaweiClientId", "text", {
        label: t("settings.huaweiClientId"),
        value: data.huaweiClientId,
        placeholder: "your-client-id",
      })
    );
    dsInputs.push(
      ui.formInput("huaweiClientSecret", "text", {
        label: t("settings.huaweiClientSecret"),
        value: data.huaweiClientSecret,
        placeholder: "your-client-secret",
      })
    );
    dsInputs.push(
      ui.formInput("huaweiRedirectUri", "text", {
        label: t("settings.huaweiRedirectUri"),
        value: data.huaweiRedirectUri,
        placeholder: "http://localhost:8000/auth/callback",
      })
    );
    dsInputs.push(
      ui.formInput("huaweiAuthUrl", "text", {
        label: t("settings.huaweiAuthUrl"),
        value: data.huaweiAuthUrl,
      })
    );
    dsInputs.push(
      ui.formInput("huaweiTokenUrl", "text", {
        label: t("settings.huaweiTokenUrl"),
        value: data.huaweiTokenUrl,
      })
    );
    dsInputs.push(
      ui.formInput("huaweiApiBaseUrl", "text", {
        label: t("settings.huaweiApiBaseUrl"),
        value: data.huaweiApiBaseUrl,
      })
    );
    dsInputs.push(
      ui.formInput("huaweiScopes", "textarea", {
        label: t("settings.huaweiScopes"),
        value: data.huaweiScopes,
      })
    );
  }

  const dsForm = ui.form(dsInputs, "settings_save_datasource", { submitLabel: saveLabel });
  const dsCard = ui.card([dsForm], { title: t("settings.sectionData"), padding: 20 });

  // ---- TUI Section ----
  const tuiThemeSelect = ui.formInput("tuiTheme", "select", {
    label: t("settings.tuiTheme"),
    options: [
      { value: "dark", label: "Dark" },
      { value: "light", label: "Light" },
    ],
    value: data.tuiTheme,
  });
  const tuiToolCallsSelect = ui.formInput("tuiShowToolCalls", "select", {
    label: t("settings.tuiShowToolCalls"),
    options: [
      { value: "true", label: t("common.enable") },
      { value: "false", label: t("common.disable") },
    ],
    value: String(data.tuiShowToolCalls),
  });
  const tuiForm = ui.form([tuiThemeSelect, tuiToolCallsSelect], "settings_save_tui", {
    submitLabel: saveLabel,
  });
  const tuiCard = ui.card([tuiForm], { title: t("settings.sectionTui"), padding: 20 });

  // ---- Embedding Section ----
  const embeddingToggle = ui.formInput("embeddingEnabled", "select", {
    label: t("settings.embedding"),
    options: [
      { value: "true", label: t("common.enable") },
      { value: "false", label: t("common.disable") },
    ],
    value: String(data.embeddingEnabled),
  });
  const embeddingModelInput = ui.formInput("embeddingModel", "text", {
    label: t("settings.embeddingModel"),
    value: data.embeddingModel,
  });
  const embeddingForm = ui.form([embeddingToggle, embeddingModelInput], "settings_save_embedding", {
    submitLabel: saveLabel,
  });
  const embeddingCard = ui.card([embeddingForm], {
    title: t("settings.sectionEmbedding"),
    padding: 20,
  });

  // ---- Benchmark & Evolution Section ----
  const concurrencyInput = ui.formInput("benchmarkConcurrency", "text", {
    label: t("settings.benchmarkConcurrency"),
    value: String(data.benchmarkConcurrency),
  });
  const applyEngineSelect = ui.formInput("applyEngine", "select", {
    label: t("settings.applyEngine"),
    options: [
      { value: "claude-code", label: "Claude Code (CLI)" },
      { value: "pi-coding-agent", label: "Pi Coding Agent (In-process)" },
    ],
    value: data.applyEngine,
  });
  const judgeProviderSelect = ui.formInput("judgeProvider", "select", {
    label: t("settings.judgeProvider"),
    options: data.providers.map((p) => ({
      value: p.value,
      label: `${p.label}${p.hint ? ` — ${p.hint}` : ""}`,
    })),
    value: data.judgeProvider,
  });
  const judgeModelInput = ui.formInput("judgeModelId", "text", {
    label: t("settings.judgeModelId"),
    value: data.judgeModelId,
  });
  const judgeLabelInput = ui.formInput("judgeLabel", "text", {
    label: t("settings.judgeLabel"),
    value: data.judgeLabel,
  });
  const benchmarkForm = ui.form(
    [concurrencyInput, applyEngineSelect, judgeProviderSelect, judgeModelInput, judgeLabelInput],
    "settings_save_benchmark",
    { submitLabel: saveLabel }
  );
  const benchmarkCard = ui.card([benchmarkForm], {
    title: t("settings.sectionBenchmark"),
    padding: 20,
  });

  // ---- Benchmark Models Section (JSON) ----
  const bmJsonInput = ui.formInput("benchmarkModelsJson", "textarea", {
    label: t("settings.benchmarkModelsJson"),
    value: data.benchmarkModelsJson,
  });
  const bmForm = ui.form([bmJsonInput], "settings_save_benchmark_models", {
    submitLabel: saveLabel,
  });
  const bmCard = ui.card([bmForm], {
    title: t("settings.sectionBenchmarkModels"),
    padding: 20,
  });

  // ---- MCP Section (JSON) ----
  const mcpJsonInput = ui.formInput("mcpJson", "textarea", {
    label: t("settings.mcpJson"),
    value: data.mcpJson,
  });
  const mcpForm = ui.form([mcpJsonInput], "settings_save_mcp", {
    submitLabel: saveLabel,
  });
  const mcpCard = ui.card([mcpForm], {
    title: t("settings.sectionMcp"),
    padding: 20,
  });

  // ---- Plugins Section (JSON) ----
  const pluginsJsonInput = ui.formInput("pluginsJson", "textarea", {
    label: t("settings.pluginsJson"),
    value: data.pluginsJson,
  });
  const pluginsForm = ui.form([pluginsJsonInput], "settings_save_plugins", {
    submitLabel: saveLabel,
  });
  const pluginsCard = ui.card([pluginsForm], {
    title: t("settings.sectionPlugins"),
    padding: 20,
  });

  const root = ui.column(
    [
      header,
      llmCard,
      gatewayCard,
      dsCard,
      tuiCard,
      embeddingCard,
      benchmarkCard,
      bmCard,
      mcpCard,
      pluginsCard,
    ],
    { gap: 16, padding: 24 }
  );

  // Add some bottom padding to avoid content being cut off
  const rootComp = ui["components"].get(root);
  if (rootComp) {
    rootComp["style"] = "padding-bottom: 40px;";
  }

  return ui.build(root);
}

// ============================================================================
// Benchmark Run Detail Modal
// ============================================================================

export function generateBenchmarkRunDetailModal(
  run: BenchmarkRunInfo,
  categoryScores: CategoryScoreInfo[],
  radarMode: "categories" | "criteria" = "categories"
): A2UIMessage {
  const ui = new A2UIGenerator("modal");

  const children: string[] = [];

  // Top: score gauge centered (0.xx scale)
  const overallNorm = run.overallScore <= 1.0 ? run.overallScore : run.overallScore / 100;
  const overallGauge = ui.scoreGauge(overallNorm, {
    label: t("evolution.totalScore"),
    max: 1.0,
    size: "lg",
  });
  children.push(ui.column([overallGauge], { align: "center" }));

  // Stat cards row
  const passedCard = ui.statCard({
    title: t("evolution.passed"),
    value: `${run.passedCount}/${run.totalTestCases}`,
    subtitle: t("evolution.passCriteria"),
    icon: "check",
    color: "#10b981",
  });
  const failedCard = ui.statCard({
    title: t("evolution.failed"),
    value: run.failedCount,
    icon: "x",
    color: "#ef4444",
  });
  const durationCard = ui.statCard({
    title: t("evolution.duration"),
    value: run.durationMs ? `${(run.durationMs / 1000).toFixed(1)}s` : "-",
    icon: "timer",
    color: "#667eea",
  });
  children.push(ui.grid([passedCard, failedCard, durationCard], { columns: 3, gap: 12 }));

  // Version / Model info row
  const infoItems: string[] = [];
  if (run.versionTag || run.metadata?.gitVersion) {
    infoItems.push(
      ui.text(
        `${t("evolution.versionTag")}: ${run.versionTag || run.metadata?.gitVersion || "-"}`,
        "caption"
      )
    );
  }
  if (run.metadata?.modelId) {
    infoItems.push(ui.text(`${t("evolution.model")}: ${run.metadata.modelId}`, "caption"));
  }
  if (run.metadata?.provider) {
    infoItems.push(ui.text(`Provider: ${run.metadata.provider}`, "caption"));
  }
  if (infoItems.length > 0) {
    children.push(ui.row(infoItems, { gap: 16 }));
  }

  // Plotly radar chart with mode toggle
  if (categoryScores.length > 0) {
    // Mode toggle
    const toggleId = `modal_toggle_${Date.now()}`;
    ui.addComponent(toggleId, {
      id: toggleId,
      type: "arena_mode_toggle",
      options: [
        { label: "5 Categories", value: "categories" },
        { label: "16 Criteria", value: "criteria" },
      ],
      active: radarMode,
      action: "set_modal_radar_mode",
    });
    children.push(ui.row([toggleId], { justify: "center" }));

    // Build Plotly radar with single run (map camelCase to snake_case for ComparisonRun)
    const comparisonRun: ComparisonRun = {
      id: run.id,
      label: run.versionTag || run.id.slice(0, 8),
      color: "rgb(99, 102, 241)",
      overallScore: overallNorm,
      categoryScores: categoryScores.map((cs) => ({
        category: cs.category,
        score: cs.score,
        test_count: cs.testCount,
        passed_count: cs.passedCount,
        subComponents: cs.subComponents,
      })),
    };
    const traces = buildPlotlyRadarTraces([comparisonRun], radarMode);
    const plotlyId = `modal_plotly_${Date.now()}`;
    ui.addComponent(plotlyId, {
      id: plotlyId,
      type: "plotly_radar",
      traces,
      layout: { ...PLOTLY_LAYOUT, showlegend: false },
      config: { responsive: true, displayModeBar: false },
    });
    children.push(plotlyId);

    // Category cards (arena_category_card style)
    const hasSubComponents = categoryScores.some(
      (cs) => cs.subComponents && cs.subComponents.length > 0
    );
    if (hasSubComponents) {
      const catCards: string[] = [];
      for (const cs of categoryScores) {
        const catColor = SHARP_CATEGORY_COLORS[cs.category] || "#818cf8";
        const avgScore = cs.score <= 1.0 ? cs.score : cs.score / 100;
        const criteria = (cs.subComponents || []).map((sub) => ({
          name: sub.name,
          scores: [{ value: sub.score <= 1 ? sub.score : sub.score / 100, color: catColor }],
        }));
        const catCardId = `modal_cat_${cs.category}_${Date.now()}`;
        ui.addComponent(catCardId, {
          id: catCardId,
          type: "arena_category_card",
          categoryName: getCategoryLabel(cs.category),
          categoryColor: catColor,
          categoryIcon: getCategoryIcon(cs.category),
          avgScore,
          criteria,
        });
        catCards.push(catCardId);
      }
      const catGrid = ui.column(catCards, {
        gap: 16,
        style: "display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));",
      } as any);
      children.push(catGrid);
    } else {
      // Fallback: simple category scores table
      const catLabel = ui.text(t("evolution.categoryScores"), "label");
      const catRows = categoryScores.map((cs) => ({
        category: getCategoryLabel(cs.category),
        score: (cs.score <= 1.0 ? cs.score : cs.score / 100).toFixed(2),
        passed: `${cs.passedCount}/${cs.testCount}`,
      }));
      const catTable = ui.dataTable(
        [
          { key: "category", label: t("evolution.category") },
          { key: "score", label: t("evolution.score") },
          { key: "passed", label: t("evolution.passed") },
        ],
        catRows
      );
      children.push(catLabel, catTable);
    }
  }

  // Delete button
  const deleteBtn = ui.button("Delete Run", "delete_benchmark_run", {
    variant: "outline",
    size: "sm",
    payload: { runId: run.id },
  });
  children.push(ui.row([deleteBtn], { justify: "end" }));

  const content = ui.column(children, { gap: 16, padding: 8 });
  const root = ui.modal(`Benchmark Run ${run.id.slice(0, 8)}`, [content], { size: "lg" });

  return ui.build(root);
}

// ============================================================================
// Benchmark Progress Generator
// ============================================================================

export function generateBenchmarkProgress(data: {
  current: number;
  total: number;
  category: string;
  profile: string;
}): A2UIMessage {
  const ui = new A2UIGenerator("progress");

  const title = ui.text(
    t("evolution.benchmarkProgress").replace("{profile}", data.profile),
    "label"
  );

  const pct = data.total > 0 ? Math.round((data.current / data.total) * 100) : 0;
  const pctText = ui.text(`${pct}%`, "h3");
  const countText = ui.text(`${data.current}/${data.total}`, "caption");

  const progressBar = ui.progress(data.current, {
    maxValue: data.total || 1,
    color: "#667eea",
  });

  const children: string[] = [];

  const topRow = ui.row([title, pctText, countText], {
    gap: 8,
    align: "center",
    justify: "between",
  });
  children.push(topRow, progressBar);

  if (data.category) {
    const categoryBadge = ui.badge(data.category, { variant: "info" });
    children.push(categoryBadge);
  }

  const root = ui.column(children, { gap: 8, padding: 16 });

  return ui.build(root);
}

export function generateBenchmarkProgressComplete(data: {
  score: number;
  passed: number;
  failed: number;
  total: number;
}): A2UIMessage {
  const ui = new A2UIGenerator("progress");

  const title = ui.text(t("evolution.benchmarkComplete"), "label");
  const scoreText = ui.text(`${Math.round(data.score)}%`, "h3");

  const progressBar = ui.progress(data.score, {
    maxValue: 100,
    color: data.score >= 70 ? "#10b981" : "#f59e0b",
  });

  const passedBadge = ui.badge(`${data.passed}/${data.total} ${t("evolution.passed")}`, {
    variant: "success",
  });
  const failedBadge = ui.badge(`${data.failed} ${t("evolution.failed")}`, {
    variant: data.failed > 0 ? "error" : "default",
  });

  const topRow = ui.row([title, scoreText], { gap: 8, align: "center", justify: "between" });
  const badgeRow = ui.row([passedBadge, failedBadge], { gap: 8 });

  const root = ui.column([topRow, progressBar, badgeRow], { gap: 8, padding: 16 });

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
    success: "check",
    error: "x",
    info: "info",
    warning: "alert-triangle",
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

export function generatePage(view: string, mainContent: A2UIMessage): PageMessage {
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

  const infoRow = ui.row(
    [
      ui.text(`Session: ${trace.sessionId.slice(0, 8)}`, "caption"),
      ui.text(`Duration: ${trace.durationMs || 0}ms`, "caption"),
      ui.text(new Date(trace.timestamp).toLocaleString(), "caption"),
    ],
    { gap: 16 }
  );

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
  scores: {
    accuracy: number;
    relevance: number;
    helpfulness: number;
    safety: number;
    completeness: number;
  };
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
    const issueRows = evaluation.issues.map((issue) => ({
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
    accuracy: "target",
    relevance: "link",
    helpfulness: "lightbulb",
    safety: "shield",
    completeness: "check",
  };
  return icons[key] || "bar-chart";
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
    const mentionBadges = testCase.expected.shouldMention.map((k) =>
      ui.badge(k, { variant: "success" })
    );
    const mentionRow = ui.row(mentionBadges, { gap: 8, wrap: true });
    children.push(mentionLabel, mentionRow);
  }

  if (testCase.expected.shouldNotMention && testCase.expected.shouldNotMention.length > 0) {
    const notMentionLabel = ui.text("Should NOT Mention", "label");
    const notMentionBadges = testCase.expected.shouldNotMention.map((k) =>
      ui.badge(k, { variant: "error" })
    );
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
  const runBtn = ui.button("Run Test", "run_test_case", {
    variant: "primary",
    payload: { id: testCase.id },
  });
  const deleteBtn = ui.button("Delete", "delete_test_case", {
    variant: "danger",
    payload: { id: testCase.id },
  });
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
    variant:
      suggestion.status === "applied"
        ? "success"
        : suggestion.status === "rejected"
          ? "error"
          : suggestion.status === "validated"
            ? "success"
            : "default",
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
    const beforeCard = ui.statCard({
      title: "Before",
      value: suggestion.validationResults.before,
      icon: "trending-down",
    });
    const afterCard = ui.statCard({
      title: "After",
      value: suggestion.validationResults.after,
      icon: "trending-up",
    });
    const improvementCard = ui.statCard({
      title: "Improvement",
      value: `+${suggestion.validationResults.improvement}%`,
      icon: "sparkles",
      color: "#10b981",
    });
    const validGrid = ui.grid([beforeCard, afterCard, improvementCard], { columns: 3, gap: 12 });
    children.push(validLabel, validGrid);
  }

  // Action buttons (only for pending/validated suggestions)
  if (suggestion.status === "pending" || suggestion.status === "validated") {
    const applyBtn = ui.button("Apply", "apply_suggestion", {
      variant: "primary",
      payload: { id: suggestion.id },
    });
    const rejectBtn = ui.button("Reject", "reject_suggestion", {
      variant: "danger",
      payload: { id: suggestion.id },
    });
    const testBtn = ui.button("Test", "test_suggestion", {
      variant: "outline",
      payload: { id: suggestion.id },
    });
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

export function generateBenchmarkModelSelectorModal(
  models: Array<{ name: string; label: string }>,
  _defaultProfile: "quick" | "full" = "quick"
): A2UIMessage {
  const ui = new A2UIGenerator("modal");

  const modelOptions = [
    { value: "__default__", label: t("evolution.defaultModel") },
    ...models.map((m) => ({ value: m.name, label: m.label })),
    ...(models.length > 1
      ? [{ value: "__all_models__", label: t("evolution.allModelsParallel") }]
      : []),
  ];

  const modelSelect = ui.formInput("modelPreset", "select", {
    label: t("evolution.selectModel"),
    required: true,
    options: modelOptions,
  });

  const profileSelect = ui.formInput("profile", "select", {
    label: t("evolution.profile"),
    required: true,
    options: [
      { value: "quick", label: t("evolution.quickProfile") },
      { value: "full", label: t("evolution.fullProfile") },
    ],
  });

  const form = ui.form([modelSelect, profileSelect], "submit_run_benchmark", {
    submitLabel: t("evolution.runBenchmark"),
    cancelLabel: t("common.cancel"),
    onCancel: "close_modal",
  });

  const root = ui.modal(t("evolution.runBenchmark"), [form], { size: "md" });

  return ui.build(root);
}

export function generatePromptRevertModal(
  promptName: string,
  commits: { hash: string; shortHash: string; message: string; date: string }[]
): A2UIMessage {
  const ui = new A2UIGenerator("modal");

  const info = ui.text("Select a commit to revert to:", "body");
  const commitList = ui.commitList(
    commits.map((c) => ({ ...c, author: "" })),
    { onSelect: "select_revert_commit" }
  );

  const content = ui.column([info, commitList], { gap: 12 });
  const root = ui.modal(`Revert ${promptName}`, [content], { size: "md" });

  return ui.build(root);
}

// ============================================================================
// Tool Card Generators — Inline cards for chat messages
// ============================================================================

interface ToolCardResult {
  components: unknown[];
  root_id: string;
}

/**
 * Dispatch tool results to the appropriate card generator.
 * Returns null if no card should be generated.
 *
 * `result` is an AgentToolResult: { content, details: { success, data } }
 */
export function generateToolCards(toolName: string, result: unknown): ToolCardResult | null {
  // AgentToolResult wraps data in details.data
  const details = (result as { details?: { data?: unknown } })?.details;
  const data = details?.data;
  if (!data) return null;

  switch (toolName) {
    case "get_health_data":
      return generateHealthDataCards(data);
    case "get_heart_rate":
      return generateHeartRateCards(data);
    case "get_sleep":
      return generateSleepCards(data);
    case "get_weekly_summary":
      return generateWeeklySummaryCards(data);
    case "get_workouts":
      return generateWorkoutsCards(data);
    default:
      return null;
  }
}

function generateHealthDataCards(data: unknown): ToolCardResult | null {
  const d = data as {
    steps?: number;
    calories?: number;
    activeMinutes?: number;
    distance?: number;
  };
  if (!d || d.steps === undefined) return null;

  const ui = new A2UIGenerator("ic-health");

  const stepsCard = ui.statCard({
    title: t("activity.steps"),
    value: (d.steps || 0).toLocaleString(),
    icon: "footprints",
    color: "#10b981",
  });

  const caloriesCard = ui.statCard({
    title: t("activity.calories"),
    value: (d.calories || 0).toLocaleString(),
    icon: "flame",
    color: "#f97316",
  });

  const activeCard = ui.statCard({
    title: t("activity.activeTime"),
    value: `${d.activeMinutes || 0}`,
    subtitle: t("sleep.minutes"),
    icon: "timer",
    color: "#3b82f6",
  });

  const statsGrid = ui.grid([stepsCard, caloriesCard, activeCard], { columns: 3, gap: 12 });

  const children: string[] = [statsGrid];

  // Steps progress bar (goal: 10000)
  const goal = 10000;
  const steps = d.steps || 0;
  const progressBar = ui.progress(Math.min(steps, goal), { maxValue: goal, color: "#10b981" });
  children.push(progressBar);

  // Quick action button
  const viewBtn = ui.button(t("activity.title"), "navigate:activity", {
    variant: "ghost",
    size: "sm",
  });
  children.push(viewBtn);

  const root = ui.column(children, { gap: 12 });
  return ui.build(root);
}

function generateHeartRateCards(data: unknown): ToolCardResult | null {
  const d = data as {
    restingAvg?: number;
    maxToday?: number;
    minToday?: number;
    readings?: { time: string; value: number }[];
  };
  if (!d) return null;

  const ui = new A2UIGenerator("ic-hr");

  const restingCard = ui.statCard({
    title: t("health.restingHR"),
    value: d.restingAvg ?? "--",
    subtitle: t("health.bpmUnit"),
    icon: "heart",
    color: "#ef4444",
  });

  const maxCard = ui.statCard({
    title: t("health.heartRate"),
    value: d.maxToday ?? "--",
    subtitle: `Max`,
    icon: "trending-up",
    color: "#f97316",
  });

  const minCard = ui.statCard({
    title: t("health.heartRate"),
    value: d.minToday ?? "--",
    subtitle: `Min`,
    icon: "trending-down",
    color: "#3b82f6",
  });

  const statsGrid = ui.grid([restingCard, maxCard, minCard], { columns: 3, gap: 12 });

  const children: string[] = [statsGrid];

  // Heart rate line chart (last 12 readings)
  if (d.readings && d.readings.length > 0) {
    const chartData = d.readings.slice(-12).map((r) => ({ label: r.time, value: r.value }));
    const chart = ui.chart({
      chartType: "line",
      data: chartData,
      xKey: "label",
      yKey: "value",
      height: 160,
      color: "#ef4444",
    });
    children.push(chart);
  }

  // Quick action button
  const viewBtn = ui.button(t("health.title"), "navigate:health", {
    variant: "ghost",
    size: "sm",
  });
  children.push(viewBtn);

  const root = ui.column(children, { gap: 12 });
  return ui.build(root);
}

function generateSleepCards(data: unknown): ToolCardResult | null {
  const d = data as {
    durationHours?: number;
    qualityScore?: number;
    bedTime?: string;
    wakeTime?: string;
    stages?: { deep?: number; light?: number; rem?: number; awake?: number };
  };
  if (!d) return null;

  const ui = new A2UIGenerator("ic-sleep");

  const durationCard = ui.statCard({
    title: t("sleep.duration"),
    value: d.durationHours != null ? `${d.durationHours}h` : "--",
    icon: "moon",
    color: "#8b5cf6",
  });

  const qualityCard = ui.statCard({
    title: t("sleep.quality"),
    value: d.qualityScore != null ? `${d.qualityScore}` : "--",
    subtitle: "/100",
    icon: "star",
    color: "#f59e0b",
  });

  const scheduleCard = ui.statCard({
    title: t("sleep.deepSleep"),
    value: d.bedTime && d.wakeTime ? `${d.bedTime}-${d.wakeTime}` : "--",
    icon: "bed",
    color: "#6366f1",
  });

  const statsGrid = ui.grid([durationCard, qualityCard, scheduleCard], { columns: 3, gap: 12 });

  const children: string[] = [statsGrid];

  // Sleep stages bar chart
  if (d.stages) {
    const stageData = [
      { label: "Deep", value: d.stages.deep || 0 },
      { label: "Light", value: d.stages.light || 0 },
      { label: "REM", value: d.stages.rem || 0 },
      { label: "Awake", value: d.stages.awake || 0 },
    ];
    const chart = ui.chart({
      chartType: "bar",
      data: stageData,
      xKey: "label",
      yKey: "value",
      height: 140,
      color: "#8b5cf6",
    });
    children.push(chart);
  }

  // Quick action button
  const viewBtn = ui.button(t("sleep.title"), "navigate:sleep", {
    variant: "ghost",
    size: "sm",
  });
  children.push(viewBtn);

  const root = ui.column(children, { gap: 12 });
  return ui.build(root);
}

function generateWeeklySummaryCards(data: unknown): ToolCardResult | null {
  const d = data as {
    steps?: { total?: number; average?: number; daily?: { date: string; steps: number }[] };
    sleep?: { averageHours?: number; daily?: { date: string; hours: number }[] };
  };
  if (!d) return null;

  const ui = new A2UIGenerator("ic-weekly");

  const totalStepsCard = ui.statCard({
    title: t("activity.steps"),
    value: (d.steps?.total || 0).toLocaleString(),
    subtitle: "7 days total",
    icon: "bar-chart",
    color: "#10b981",
  });

  const avgStepsCard = ui.statCard({
    title: t("activity.steps"),
    value: (d.steps?.average || 0).toLocaleString(),
    subtitle: "Avg/day",
    icon: "footprints",
    color: "#3b82f6",
  });

  const avgSleepCard = ui.statCard({
    title: t("sleep.duration"),
    value: d.sleep?.averageHours != null ? `${d.sleep.averageHours}h` : "--",
    subtitle: "Avg",
    icon: "moon",
    color: "#8b5cf6",
  });

  const statsGrid = ui.grid([totalStepsCard, avgStepsCard, avgSleepCard], { columns: 3, gap: 12 });

  const children: string[] = [statsGrid];

  // Steps bar chart (7 days)
  if (d.steps?.daily && d.steps.daily.length > 0) {
    const stepsChartData = d.steps.daily.map((day) => ({
      label: day.date.slice(-2),
      value: day.steps,
    }));
    const stepsChart = ui.chart({
      chartType: "bar",
      data: stepsChartData,
      xKey: "label",
      yKey: "value",
      height: 140,
      color: "#10b981",
    });
    children.push(stepsChart);
  }

  // Sleep bar chart (7 days)
  if (d.sleep?.daily && d.sleep.daily.length > 0) {
    const sleepChartData = d.sleep.daily.map((day) => ({
      label: day.date.slice(-2),
      value: day.hours,
    }));
    const sleepChart = ui.chart({
      chartType: "bar",
      data: sleepChartData,
      xKey: "label",
      yKey: "value",
      height: 140,
      color: "#8b5cf6",
    });
    children.push(sleepChart);
  }

  // Quick action button
  const viewBtn = ui.button(t("activity.title"), "navigate:activity", {
    variant: "ghost",
    size: "sm",
  });
  children.push(viewBtn);

  const root = ui.column(children, { gap: 12 });
  return ui.build(root);
}

function generateWorkoutsCards(data: unknown): ToolCardResult | null {
  const workouts = data as Array<{
    type?: string;
    durationMinutes?: number;
    caloriesBurned?: number;
    distanceKm?: number;
  }>;
  if (!Array.isArray(workouts) || workouts.length === 0) return null;

  const ui = new A2UIGenerator("ic-workout");

  const rows = workouts.map((w) => ({
    type: w.type || "-",
    duration: w.durationMinutes != null ? `${w.durationMinutes}min` : "-",
    calories: w.caloriesBurned != null ? `${w.caloriesBurned}` : "-",
    distance: w.distanceKm != null ? `${w.distanceKm}km` : "-",
  }));

  const table = ui.table(
    [
      { key: "type", label: "Type" },
      { key: "duration", label: "Duration" },
      { key: "calories", label: "Cal" },
      { key: "distance", label: "Distance" },
    ],
    rows
  );

  const tableCard = ui.card([table], { padding: 12 });

  const root = ui.column([tableCard], { gap: 12 });
  return ui.build(root);
}

/**
 * Merge multiple pending card sets into a single card set.
 */
export function mergePendingCards(
  cards: ToolCardResult[]
): { components: unknown[]; root_id: string } | null {
  if (cards.length === 0) return null;
  if (cards.length === 1) return cards[0];

  // Merge all components and create a column layout wrapping all roots
  const ui = new A2UIGenerator("ic-merge");
  const allComponents: unknown[] = [];
  const childRootIds: string[] = [];

  for (const card of cards) {
    allComponents.push(...card.components);
    childRootIds.push(card.root_id);
  }

  const root = ui.column(childRootIds, { gap: 16 });
  const built = ui.build(root);

  return {
    components: [...allComponents, ...built.components],
    root_id: built.root_id,
  };
}
