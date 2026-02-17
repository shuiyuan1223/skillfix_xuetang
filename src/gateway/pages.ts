/**
 * Page Generators for A2UI
 *
 * Each function generates A2UI component trees for different views.
 * Agent calls these to render pages.
 */

import { A2UIGenerator, type A2UIMessage } from "./a2ui.js";
import { t } from "../locales/index.js";
import type { UserProfile, MemorySearchResult } from "../memory/types.js";
import type { HealthPlan, PlanStatus } from "../plans/types.js";
import type { Recommendation, Reminder, CalendarEvent } from "../proactive/types.js";
import {
  buildRadarChartData,
  SHARP_CATEGORY_COLORS,
  getCategoryLabel,
  getCategoryIcon,
  type ComparisonRun,
} from "./evolution-lab.js";

// Types for page data
interface Message {
  id?: string;
  role: "user" | "assistant";
  parts?: Array<{
    type: "text" | "tool_use" | "tool_result";
    content?: string;
    toolCallId?: string;
    toolName?: string;
    status?: string;
    cards?: { components: unknown[]; root_id: string };
  }>;
  // Backward compat
  content?: string;
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
      { id: "plans", label: t("nav.plans"), icon: "target" },
      { id: "proactive", label: t("nav.proactive"), icon: "sparkles" },
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
      { id: "settings/tools", label: t("nav.tools"), icon: "stethoscope" },
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

  // Chat messages component (stable ID to avoid DOM remount on re-render)
  const messagesId = "chat_msgs";
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
  const inputId = "chat_input";
  ui.addComponent(inputId, {
    id: inputId,
    type: "chat_input",
    action: "send_message",
    clearAction: "clear_chat",
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
  chatMessages: Array<{ role: string; content?: string; parts?: unknown[]; cards?: any }>;
  streaming: boolean;
  streamingContent: string;
  quickReplies?: QuickReply[];
}): A2UIMessage {
  const ui = new A2UIGenerator("main");
  const children: string[] = [];

  // Chat messages with System Agent welcome screen (stable ID)
  const msgsId = "sa_msgs";
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

  // Chat input (fixed at bottom via flexbox, stable ID)
  const inputId = "sa_input";
  ui.addComponent(inputId, {
    id: inputId,
    type: "chat_input",
    disabled: state.streaming,
    streaming: state.streaming,
    placeholder: t("systemAgent.placeholder"),
    action: "sa_send_message",
    clearAction: "sa_clear_chat",
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
  source: "system" | "user";
  exists: boolean;
}

interface CommitInfo {
  hash: string;
  shortHash: string;
  message: string;
  date: string;
  author: string;
}

export function generatePromptsPage(data: {
  files: PromptInfo[];
  loading?: boolean;
  scope?: "pha" | "system";
}): A2UIMessage {
  const ui = new A2UIGenerator("main");
  const scope = data.scope || "pha";

  // Header
  const title = ui.text(t("prompts.title"), "h2");
  const subtitle = ui.text(t("prompts.subtitle"), "caption");
  const header = ui.column([title, subtitle], { gap: 4, padding: 24 });

  // Loading skeleton
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

  // File list table
  const rows = data.files.map((p) => ({
    name: p.name,
    title: p.exists ? p.title : "—",
    lines: p.exists ? p.lines : 0,
    source: p.source,
    status: p.exists ? "View" : t("prompts.notCreated"),
  }));

  const filesTable = ui.dataTable(
    [
      { key: "name", label: t("prompts.name"), sortable: false },
      { key: "title", label: t("prompts.promptTitle") },
      { key: "lines", label: t("prompts.lines") },
      { key: "status", label: "", render: "badge" },
    ],
    rows,
    { onRowClick: "select_file" }
  );

  const filesCard = ui.card([filesTable], {
    title: t("prompts.cardTitle"),
    padding: 20,
  });

  // Wrap as tab content
  const scopeTabContentIds: Record<string, string> = {};
  scopeTabContentIds[scope] = ui.column([filesCard], { gap: 24, padding: 24 });
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

/** Prompt detail modal — view/edit content, version history, revert */
export function generatePromptDetailModal(data: {
  name: string;
  source: "system" | "user";
  content: string;
  editing: boolean;
  commits?: CommitInfo[];
}): A2UIMessage {
  const ui = new A2UIGenerator("modal");
  const children: string[] = [];

  // Source badge
  const sourceBadge = ui.text(
    data.source === "system" ? "System prompt" : "User override",
    "caption"
  );
  children.push(sourceBadge);

  // Code editor
  const editor = ui.codeEditor(data.content, {
    language: "markdown",
    readonly: !data.editing,
    lineNumbers: true,
    height: 400,
    onChange: "prompt_content_change",
  });
  children.push(editor);

  // Action buttons
  const btns: string[] = [];
  if (data.editing) {
    btns.push(ui.button(t("common.save"), "save_prompt_from_modal", { variant: "primary" }));
    btns.push(ui.button(t("common.cancel"), "cancel_edit_from_modal", { variant: "ghost" }));
  } else {
    btns.push(ui.button(t("common.edit"), "edit_prompt_from_modal", { variant: "outline" }));
    // Revert only for git-tracked system prompts with history
    if (data.source === "system" && data.commits && data.commits.length > 1) {
      btns.push(ui.button(t("common.revert"), "revert_prompt", { variant: "ghost" }));
    }
  }
  const btnRow = ui.row(btns, { gap: 8, justify: "end" });
  children.push(btnRow);

  // Version history (system prompts only)
  if (data.source === "system" && data.commits && data.commits.length > 0) {
    const historyTitle = ui.text(t("prompts.versionHistory"), "h3");
    children.push(historyTitle);
    const commitList = ui.commitList(data.commits, { onSelect: "select_commit" });
    children.push(commitList);
  }

  const body = ui.column(children, { gap: 12 });
  const root = ui.modal(`${data.name}.md`, [body], { size: "lg" });
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
    const createBtn = ui.button("", "create_skill", {
      variant: "primary",
      size: "sm",
      icon: "sparkles",
      tooltip: t("skills.newSkill"),
    } as any);
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
// Tools Page Generator
// ============================================================================

export interface ToolPageEntry {
  name: string;
  displayName: string;
  description: string;
  category: string;
  agent: string; // "PHA" | "System" | "PHA / System"
  icon?: string;
  companionSkill?: string;
  inputSchema?: Record<string, unknown>;
}

export function generateToolsPage(data: {
  tools: ToolPageEntry[];
  selectedCategory?: string;
}): A2UIMessage {
  const ui = new A2UIGenerator("main");

  // Header
  const title = ui.text(t("nav.tools"), "h2");
  const subtitle = ui.text(`${data.tools.length} tools registered`, "caption");
  const header = ui.column([title, subtitle], { gap: 4, padding: 24 });

  // Category tabs
  const categories = [...new Set(data.tools.map((t) => t.category))].sort();
  const activeCategory = data.selectedCategory || "all";

  const tabDefs = [
    { id: "all", label: `All (${data.tools.length})` },
    ...categories.map((c) => ({
      id: c,
      label: `${c} (${data.tools.filter((t) => t.category === c).length})`,
    })),
  ];

  const filteredTools =
    activeCategory === "all" ? data.tools : data.tools.filter((t) => t.category === activeCategory);

  // Tools table
  const rows = filteredTools.map((t) => ({
    name: t.name,
    displayName: t.displayName,
    description: t.description,
    category: t.category,
    agent: t.agent,
    skill: t.companionSkill || "-",
  }));

  const table = ui.dataTable(
    [
      { key: "name", label: "Tool Name", sortable: true },
      { key: "displayName", label: "Display Name", sortable: true },
      { key: "description", label: "Description" },
      { key: "category", label: "Category", render: "badge" },
      { key: "agent", label: "Agent", render: "badge" },
      { key: "skill", label: "Skill", render: "link" as const, action: "view_skill_from_table" },
    ],
    rows,
    { onRowClick: "view_tool_detail" }
  );

  const tableCard = ui.card([table], { padding: 20 });

  // Build tab content
  const tabContentIds: Record<string, string> = {};
  tabContentIds[activeCategory] = ui.column([tableCard], { gap: 16, padding: 24 });

  const tabs = ui.tabs(tabDefs, activeCategory, tabContentIds);

  const root = ui.column([header, tabs], { gap: 0 });
  return ui.build(root);
}

export function generateToolDetailModal(tool: ToolPageEntry): A2UIMessage {
  const ui = new A2UIGenerator("modal");

  const children: string[] = [];

  const nameBadge = ui.text(`${tool.name}`, "caption");
  children.push(nameBadge);

  // Description
  const descText = ui.text(tool.description, "body");
  children.push(descText);

  // Category + Agent + Skill
  const metaItems: string[] = [];
  const catLabel = ui.text(`Category: ${tool.category}`, "caption");
  metaItems.push(catLabel);
  const agentLabel = ui.text(`Agent: ${tool.agent}`, "caption");
  metaItems.push(agentLabel);
  if (tool.companionSkill) {
    const skillBtn = ui.button(`Companion Skill: ${tool.companionSkill}`, "view_skill_from_tool", {
      variant: "ghost",
      payload: { skillName: tool.companionSkill },
    });
    metaItems.push(skillBtn);
  }
  const metaRow = ui.column(metaItems, { gap: 4 });
  children.push(metaRow);

  // Parameters (inputSchema)
  if (tool.inputSchema) {
    const paramsTitle = ui.text("Parameters", "h3");
    children.push(paramsTitle);

    const props = (tool.inputSchema.properties || {}) as Record<string, Record<string, unknown>>;
    const required = (tool.inputSchema.required || []) as string[];

    if (Object.keys(props).length === 0) {
      const noParams = ui.text("No parameters required", "caption");
      children.push(noParams);
    } else {
      const paramRows = Object.entries(props).map(([key, schema]) => ({
        name: key,
        type: String(schema.type || "any"),
        required: required.includes(key) ? "yes" : "no",
        description: String(schema.description || "-"),
      }));

      const paramTable = ui.dataTable(
        [
          { key: "name", label: "Name" },
          { key: "type", label: "Type", render: "badge" as const },
          { key: "required", label: "Required", render: "badge" as const },
          { key: "description", label: "Description" },
        ],
        paramRows
      );
      children.push(paramTable);
    }
  }

  const body = ui.column(children, { gap: 12 });
  const root = ui.modal(tool.displayName, [body], { size: "lg" });
  return ui.build(root);
}

export function generateSkillDetailModal(skill: {
  name: string;
  description: string;
  enabled: boolean;
  content: string;
  triggers?: string[];
  emoji?: string;
}): A2UIMessage {
  const ui = new A2UIGenerator("modal");
  const children: string[] = [];

  // Status badge
  const status = ui.text(skill.enabled ? "Enabled" : "Disabled", "caption");
  children.push(status);

  // Description
  if (skill.description) {
    const desc = ui.text(skill.description, "body");
    children.push(desc);
  }

  // Triggers
  if (skill.triggers && skill.triggers.length > 0) {
    const trigTitle = ui.text("Triggers", "h3");
    children.push(trigTitle);
    const trigText = ui.text(skill.triggers.join(", "), "caption");
    children.push(trigText);
  }

  // Content preview (first ~2000 chars)
  if (skill.content) {
    const contentTitle = ui.text("SKILL.md", "h3");
    children.push(contentTitle);
    const preview =
      skill.content.length > 2000 ? skill.content.slice(0, 2000) + "\n..." : skill.content;
    const contentBlock = ui.codeEditor(preview, {
      language: "markdown",
      readOnly: true,
    });
    children.push(contentBlock);
  }

  // Action buttons
  const toggleBtn = ui.button(
    skill.enabled ? t("common.disable") : t("common.enable"),
    "toggle_skill_from_modal",
    {
      variant: skill.enabled ? "ghost" : "secondary",
      payload: { skillName: skill.name },
    }
  );
  const editBtn = ui.button(t("common.edit"), "edit_skill_from_modal", {
    variant: "outline",
    payload: { skillName: skill.name },
  });
  const actionRow = ui.row([toggleBtn, editBtn], { gap: 8, justify: "end" });
  children.push(actionRow);

  const body = ui.column(children, { gap: 12 });
  const prefix = skill.emoji ? `${skill.emoji} ` : "";
  const root = ui.modal(`${prefix}${skill.name}`, [body], { size: "lg" });
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
  const refreshBtn = ui.button("", "refresh_integrations", {
    variant: "outline",
    size: "sm",
    icon: "refresh-cw",
    tooltip: t("integrations.refreshData"),
  } as any);
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
  // Tab control
  activeTab: "system" | "llm";

  // System logs tab
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

  // LLM calls tab
  llmCalls: import("../utils/llm-logger.js").LLMCallPair[];
  llmProviders: string[];
  llmModels: string[];
  llmActiveProvider?: string;
  llmActiveModel?: string;
  llmPage: number;
  llmPageSize: number;
  llmTotal: number;
  llmSelectedId?: number;
}

export function generateLogsPage(data: LogsPageData): A2UIMessage {
  const ui = new A2UIGenerator("main");

  // Header
  const title = ui.text(t("logs.title"), "h1");
  const subtitle = ui.text(t("logs.subtitle"), "caption");
  const refreshBtn = ui.button("", "logs_refresh", {
    variant: "outline",
    size: "sm",
    icon: "refresh-cw",
    tooltip: t("logs.refresh"),
  } as any);
  const headerRow = ui.row([ui.column([title, subtitle], { gap: 4 }), refreshBtn], {
    justify: "between",
    align: "center",
  });

  // --- System Logs Tab Content ---
  const systemTabContent = buildSystemLogsTab(ui, data);

  // --- LLM Calls Tab Content ---
  const llmTabContent = buildLlmCallsTab(ui, data);

  // Tabs
  const tabsId = ui.tabs(
    [
      { id: "system", label: t("logs.tabSystem"), icon: "bar-chart" },
      { id: "llm", label: t("logs.tabLlm"), icon: "zap" },
    ],
    data.activeTab,
    { system: systemTabContent, llm: llmTabContent }
  );

  const root = ui.column([headerRow, tabsId], { gap: 16, padding: 24 });
  return ui.build(root);
}

function buildSystemLogsTab(ui: A2UIGenerator, data: LogsPageData): string {
  const children: string[] = [];

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
  children.push(ui.row([levelSelect, subsystemSelect], { gap: 12 }));

  if (data.entries.length === 0) {
    children.push(ui.text(t("logs.noLogs"), "caption"));
  } else {
    children.push(
      ui.logViewer(data.entries, {
        levels: data.levels,
        subsystems: data.subsystems,
        activeLevel: data.activeLevel,
        activeSubsystem: data.activeSubsystem,
      })
    );
  }

  return ui.column(children, { gap: 12 });
}

function buildLlmCallsTab(ui: A2UIGenerator, data: LogsPageData): string {
  const children: string[] = [];

  // Filter row: Provider + Model selects
  const providerOptions = [
    { value: "", label: t("logs.llmAllProviders") },
    ...data.llmProviders.map((p) => ({ value: p, label: p })),
  ];
  const modelOptions = [
    { value: "", label: t("logs.llmAllModels") },
    ...data.llmModels.map((m) => ({ value: m, label: m })),
  ];

  const providerSelect = ui.formInput("llm_provider", "select", {
    label: t("logs.llmProvider"),
    options: providerOptions,
    value: data.llmActiveProvider || "",
    onChange: "llm_filter_provider",
  });
  const modelSelect = ui.formInput("llm_model", "select", {
    label: t("logs.llmModel"),
    options: modelOptions,
    value: data.llmActiveModel || "",
    onChange: "llm_filter_model",
  });
  children.push(ui.row([providerSelect, modelSelect], { gap: 12 }));

  if (data.llmCalls.length === 0) {
    children.push(ui.text(t("logs.llmNoLogs"), "caption"));
    return ui.column(children, { gap: 12 });
  }

  // Data table
  const columns = [
    { key: "time", label: t("logs.time"), render: "text" as const },
    { key: "provider", label: t("logs.llmProvider"), render: "badge" as const },
    { key: "model", label: t("logs.llmModel"), render: "text" as const },
    { key: "tokens", label: t("logs.llmTokens"), render: "text" as const },
    { key: "latency", label: t("logs.llmLatency"), render: "text" as const },
    { key: "status", label: t("logs.llmStatus"), render: "badge" as const },
  ];

  const rows = data.llmCalls.map((call) => {
    const timeStr = call.timestamp
      ? new Date(call.timestamp).toLocaleTimeString("en-US", { hour12: false })
      : "-";
    const tokensStr =
      call.inputTokens != null && call.outputTokens != null
        ? `${call.inputTokens}/${call.outputTokens}`
        : call.totalTokens != null
          ? String(call.totalTokens)
          : "-";
    const latencyStr =
      call.latencyMs != null
        ? call.latencyMs >= 1000
          ? `${(call.latencyMs / 1000).toFixed(1)}s`
          : `${call.latencyMs}ms`
        : "-";
    const statusStr = call.status != null ? String(call.status) : "-";

    return {
      id: call.id,
      time: timeStr,
      provider: call.provider,
      model: call.model,
      tokens: tokensStr,
      latency: latencyStr,
      status: statusStr,
    };
  });

  const tableId = ui.dataTable(columns, rows, {
    pagination: {
      page: data.llmPage,
      pageSize: data.llmPageSize,
      total: data.llmTotal,
    },
    onRowClick: "llm_call_detail",
    onPageChange: "llm_page_change",
  });
  children.push(tableId);

  // Detail view for selected call
  if (data.llmSelectedId != null) {
    const selectedCall = data.llmCalls.find((c) => c.id === data.llmSelectedId);
    if (selectedCall) {
      const detailChildren: string[] = [];

      // Request collapsible
      const reqJson = JSON.stringify(selectedCall.requestData ?? {}, null, 2);
      const reqEditor = ui.codeEditor(reqJson, {
        language: "json",
        readonly: true,
        height: 300,
      });
      detailChildren.push(ui.collapsible(t("logs.llmRequest"), [reqEditor], { expanded: true }));

      // Response collapsible
      const resJson = JSON.stringify(selectedCall.responseData ?? {}, null, 2);
      const resEditor = ui.codeEditor(resJson, {
        language: "json",
        readonly: true,
        height: 300,
      });
      detailChildren.push(ui.collapsible(t("logs.llmResponse"), [resEditor], { expanded: true }));

      children.push(ui.column(detailChildren, { gap: 8 }));
    }
  }

  return ui.column(children, { gap: 12 });
}

// ============================================================================
// Settings (General) Page Generator
// ============================================================================

export interface SettingsPageData {
  // Legacy LLM (kept for backward compat)
  provider: string;
  providers: Array<{ value: string; label: string; hint?: string }>;
  apiKeySet: boolean;
  modelId: string;
  baseUrl: string;
  // Model Repository (new unified format)
  modelProviders: Array<{
    key: string;
    baseUrl: string;
    apiKeySet: boolean;
    models: Array<{ name: string; model: string; label: string }>;
  }>;
  allModelRefs: string[];
  orchestratorPha: string;
  orchestratorSa: string;
  orchestratorJudge: string;
  orchestratorEmbedding: string;
  benchmarkModelRefs: string[];
  // Gateway
  gatewayPort: number;
  gatewayAutoStart: boolean;
  // Data Source
  dataSourceType: string;
  // Embedding (legacy)
  embeddingEnabled: boolean;
  embeddingModel: string;
  // TUI
  tuiTheme: string;
  tuiShowToolCalls: boolean;
  // Huawei Health
  huaweiClientId: string;
  huaweiClientSecret: string;
  huaweiRedirectUri: string;
  huaweiAuthUrl: string;
  huaweiTokenUrl: string;
  huaweiApiBaseUrl: string;
  // Benchmark & Evolution
  applyEngine: string;
  benchmarkConcurrency: number;
  // Legacy judge/benchmark models (kept for backward compat)
  judgeProvider: string;
  judgeModelId: string;
  judgeLabel: string;
  benchmarkModels: Array<{ key: string; provider: string; modelId: string; label: string }>;
  // User UUID
  userUuid: string;
  huaweiScopes: string[];
  // MCP structured fields
  chromeMcpCommand: string;
  chromeMcpArgs: string;
  chromeMcpBrowserUrl: string;
  chromeMcpWsEndpoint: string;
  remoteServers: Array<{
    key: string;
    url: string;
    apiKey: string;
    name: string;
    enabled: boolean;
  }>;
  // Plugins structured fields
  pluginEnabled: boolean;
  pluginPaths: string;
  pluginEntries: Array<{ id: string; enabled: boolean; config: string }>;
  // Raw config
  rawConfigJson: string;
}

export function generateSettingsPage(data: SettingsPageData): A2UIMessage {
  const ui = new A2UIGenerator("main");
  const saveLabel = t("settings.saveButton");

  // Header
  const title = ui.text(t("settings.title"), "h2");
  const subtitle = ui.text(t("settings.subtitle"), "caption");
  const uuidText = ui.text(`${t("settings.userUuid")}: ${data.userUuid || "—"}`, "caption");
  const header = ui.column([title, subtitle, uuidText], { gap: 4 });

  // ---- Model Repository Section ----
  const repoChildren: string[] = [];
  for (const mp of data.modelProviders) {
    const mpBaseUrl = ui.formInput(`mp__${mp.key}__baseUrl`, "text", {
      label: t("settings.providerBaseUrl"),
      value: mp.baseUrl,
      placeholder: "https://...",
    });
    const mpApiKey = ui.formInput(`mp__${mp.key}__apiKey`, "text", {
      label: t("settings.providerApiKey"),
      placeholder: t("settings.apiKeyPlaceholder"),
      value: mp.apiKeySet ? "••••••••" : "",
    });
    const modelRows: string[] = [];
    mp.models.forEach((m, idx) => {
      const mName = ui.formInput(`mp__${mp.key}__m__${idx}__name`, "text", {
        label: t("settings.modelName"),
        value: m.name,
      });
      const mModel = ui.formInput(`mp__${mp.key}__m__${idx}__model`, "text", {
        label: t("settings.modelActualId"),
        value: m.model,
      });
      const mLabel = ui.formInput(`mp__${mp.key}__m__${idx}__label`, "text", {
        label: t("settings.modelLabel"),
        value: m.label,
      });
      const mDeleteBtn = ui.button(t("settings.deleteModel"), "settings_provider_model_delete", {
        variant: "danger",
        payload: { provider: mp.key, index: idx },
      });
      modelRows.push(ui.row([mName, mModel, mLabel, mDeleteBtn], { gap: 8, align: "end" }));
    });
    const addModelBtn = ui.button(t("settings.addModel"), "settings_provider_model_add", {
      payload: { provider: mp.key },
    });
    const deleteProviderBtn = ui.button(t("settings.deleteProvider"), "settings_provider_delete", {
      variant: "danger",
      payload: { provider: mp.key },
    });
    const providerContent = [
      mpBaseUrl,
      mpApiKey,
      ...modelRows,
      ui.row([addModelBtn, deleteProviderBtn], { gap: 8 }),
    ];
    repoChildren.push(ui.collapsible(mp.key, providerContent, { expanded: true }));
  }
  const repoForm = ui.form(repoChildren, "settings_save_model_repository", {
    submitLabel: t("settings.saveRepository"),
  });
  const addProviderBtn = ui.button(t("settings.addProvider"), "settings_provider_add");
  const repoCard = ui.card([repoForm, addProviderBtn], {
    title: t("settings.sectionModelRepository"),
    padding: 20,
  });

  // ---- Model Assignments Section ----
  const modelRefOptions = [
    { value: "", label: t("settings.noneSelected") },
    ...data.allModelRefs.map((ref) => ({ value: ref, label: ref })),
  ];
  const agentModelSelect = ui.formInput("orchestratorPha", "select", {
    label: t("settings.agentModelSelect"),
    options: modelRefOptions,
    value: data.orchestratorPha,
  });
  const systemAgentModelSelect = ui.formInput("orchestratorSa", "select", {
    label: t("settings.systemAgentModelSelect"),
    options: modelRefOptions,
    value: data.orchestratorSa,
  });
  const judgeModelSelect = ui.formInput("orchestratorJudge", "select", {
    label: t("settings.judgeModelSelect"),
    options: modelRefOptions,
    value: data.orchestratorJudge,
  });
  const embeddingModelSelect = ui.formInput("orchestratorEmbedding", "select", {
    label: t("settings.embeddingModelSelect"),
    options: modelRefOptions,
    value: data.orchestratorEmbedding,
  });
  const assignmentsForm = ui.form(
    [agentModelSelect, systemAgentModelSelect, judgeModelSelect, embeddingModelSelect],
    "settings_save_model_assignments",
    { submitLabel: t("settings.saveAssignments") }
  );
  const assignmentsCard = ui.card([assignmentsForm], {
    title: t("settings.sectionModelAssignments"),
    padding: 20,
  });

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
  }

  const dsForm = ui.form(dsInputs, "settings_save_datasource", { submitLabel: saveLabel });
  const dsCard = ui.card([dsForm], { title: t("settings.sectionData"), padding: 20 });

  // ---- OAuth Scopes Section (structured list, only when huawei) ----
  let scopesCard: string | null = null;
  if (data.dataSourceType === "huawei") {
    const scopeFormInputs: string[] = [];
    data.huaweiScopes.forEach((scope, idx) => {
      const scopeInput = ui.formInput(`scope__${idx}`, "text", {
        label: `Scope ${idx + 1}`,
        value: scope,
      });
      const scopeDeleteBtn = ui.button(t("settings.deleteScope"), "settings_scope_delete", {
        variant: "danger",
        payload: { index: idx },
      });
      scopeFormInputs.push(ui.row([scopeInput, scopeDeleteBtn], { gap: 8, align: "end" }));
    });
    const scopesForm = ui.form(scopeFormInputs, "settings_save_scopes", {
      submitLabel: t("settings.saveAll"),
    });
    const scopeAddBtn = ui.button(t("settings.addScope"), "settings_scope_add");
    scopesCard = ui.card([scopesForm, scopeAddBtn], {
      title: t("settings.scopesPerLine"),
      padding: 20,
    });
  }

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

  // ---- Benchmark & Evolution Section (concurrency + applyEngine + model selection) ----
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
  // Benchmark model checkboxes from model repository
  const bmCheckboxes: string[] = [];
  for (const ref of data.allModelRefs) {
    const isChecked = data.benchmarkModelRefs.includes(ref);
    bmCheckboxes.push(
      ui.formInput(`bm_ref__${ref}`, "select", {
        label: ref,
        options: [
          { value: "true", label: t("common.enable") },
          { value: "false", label: t("common.disable") },
        ],
        value: String(isChecked),
      })
    );
  }
  const bmSelectGroup =
    bmCheckboxes.length > 0
      ? [ui.text(t("settings.benchmarkModelsSelect"), "body"), ...bmCheckboxes]
      : [];
  const benchmarkForm = ui.form(
    [concurrencyInput, applyEngineSelect, ...bmSelectGroup],
    "settings_save_benchmark_v3",
    { submitLabel: saveLabel }
  );
  const benchmarkCard = ui.card([benchmarkForm], {
    title: t("settings.sectionBenchmark"),
    padding: 20,
  });

  // ---- MCP Section (structured) ----
  const mcpChildren: string[] = [];

  // Chrome DevTools MCP sub-form
  const chromeCmdInput = ui.formInput("chromeMcpCommand", "text", {
    label: t("settings.chromeMcpCommand"),
    value: data.chromeMcpCommand,
    placeholder: "npx",
  });
  const chromeArgsInput = ui.formInput("chromeMcpArgs", "text", {
    label: t("settings.chromeMcpArgs"),
    value: data.chromeMcpArgs,
    placeholder: "-y, chrome-devtools-mcp@latest, --isolated",
  });
  const chromeBrowserUrlInput = ui.formInput("chromeMcpBrowserUrl", "text", {
    label: t("settings.chromeMcpBrowserUrl"),
    value: data.chromeMcpBrowserUrl,
    placeholder: "http://127.0.0.1:9222",
  });
  const chromeWsInput = ui.formInput("chromeMcpWsEndpoint", "text", {
    label: t("settings.chromeMcpWsEndpoint"),
    value: data.chromeMcpWsEndpoint,
  });
  const chromeMcpForm = ui.form(
    [chromeCmdInput, chromeArgsInput, chromeBrowserUrlInput, chromeWsInput],
    "settings_save_mcp_chrome",
    { submitLabel: saveLabel }
  );
  mcpChildren.push(ui.collapsible("Chrome DevTools", [chromeMcpForm], { expanded: true }));

  // Remote MCP Servers
  const remoteFormInputs: string[] = [];
  for (const srv of data.remoteServers) {
    const sUrl = ui.formInput(`mcp_remote__${srv.key}__url`, "text", {
      label: "URL",
      value: srv.url,
      placeholder: "http://10.0.1.5:3000/mcp",
    });
    const sApiKey = ui.formInput(`mcp_remote__${srv.key}__apiKey`, "text", {
      label: "API Key",
      value: srv.apiKey,
    });
    const sName = ui.formInput(`mcp_remote__${srv.key}__name`, "text", {
      label: "Name",
      value: srv.name,
    });
    const sEnabled = ui.formInput(`mcp_remote__${srv.key}__enabled`, "select", {
      label: "Enabled",
      options: [
        { value: "true", label: t("common.enable") },
        { value: "false", label: t("common.disable") },
      ],
      value: String(srv.enabled),
    });
    const sDeleteBtn = ui.button(t("settings.deleteServer"), "settings_mcp_delete", {
      variant: "danger",
      payload: { key: srv.key },
    });
    remoteFormInputs.push(
      ui.collapsible(`${srv.key} — ${srv.name || srv.url}`, [
        sUrl,
        sApiKey,
        sName,
        sEnabled,
        sDeleteBtn,
      ])
    );
  }
  const mcpRemoteForm = ui.form(remoteFormInputs, "settings_save_mcp_remote", {
    submitLabel: t("settings.saveAll"),
  });
  const mcpRemoteAddBtn = ui.button(t("settings.addServer"), "settings_mcp_add");
  mcpChildren.push(ui.collapsible(t("settings.remoteServers"), [mcpRemoteForm, mcpRemoteAddBtn]));

  const mcpCard = ui.card(mcpChildren, {
    title: t("settings.sectionMcp"),
    padding: 20,
  });

  // ---- Plugins Section (structured) ----
  const pluginsChildren: string[] = [];
  const pluginEnabledSelect = ui.formInput("pluginEnabled", "select", {
    label: t("settings.pluginEnabled"),
    options: [
      { value: "true", label: t("common.enable") },
      { value: "false", label: t("common.disable") },
    ],
    value: String(data.pluginEnabled),
  });
  const pluginPathsInput = ui.formInput("pluginPaths", "text", {
    label: t("settings.pluginPaths"),
    value: data.pluginPaths,
  });
  const pluginsMainForm = ui.form(
    [pluginEnabledSelect, pluginPathsInput],
    "settings_save_plugins_v2",
    { submitLabel: saveLabel }
  );
  pluginsChildren.push(pluginsMainForm);

  // Per-plugin entries
  for (const entry of data.pluginEntries) {
    const peEnabled = ui.formInput(`plugin__${entry.id}__enabled`, "select", {
      label: "Enabled",
      options: [
        { value: "true", label: t("common.enable") },
        { value: "false", label: t("common.disable") },
      ],
      value: String(entry.enabled),
    });
    const peConfig = ui.formInput(`plugin__${entry.id}__config`, "textarea", {
      label: "Config",
      value: entry.config,
    });
    pluginsChildren.push(ui.collapsible(entry.id, [peEnabled, peConfig]));
  }
  const pluginsCard = ui.card(pluginsChildren, {
    title: t("settings.sectionPlugins"),
    padding: 20,
  });

  // ---- Raw Config Viewer ----
  const rawEditor = ui.codeEditor(data.rawConfigJson, {
    language: "json",
    readonly: true,
    height: 300,
  });
  const copyBtn = ui.button(t("settings.copyConfig"), "settings_copy_config", {
    icon: "save",
  });
  const downloadBtn = ui.button(t("settings.downloadConfig"), "settings_download_config", {
    icon: "file-text",
  });
  const rawActions = ui.row([copyBtn, downloadBtn], { gap: 8, style: "margin-top: 12px;" });
  const rawCard = ui.card([rawEditor, rawActions], {
    title: t("settings.rawConfig"),
    padding: 20,
  });

  const cards: string[] = [header, repoCard, assignmentsCard, gatewayCard, dsCard];
  if (scopesCard) cards.push(scopesCard);
  cards.push(tuiCard, embeddingCard, benchmarkCard, mcpCard, pluginsCard, rawCard);
  const root = ui.column(cards, { gap: 16, padding: 24 });

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
    const radarChartData = buildRadarChartData([comparisonRun], radarMode);
    const radarId = `modal_radar_${Date.now()}`;
    ui.addComponent(radarId, {
      id: radarId,
      type: "radar_chart",
      radarData: radarChartData.data,
      radarSeries: radarChartData.series,
      height: 300,
    });
    children.push(radarId);

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
// Plans Page Generator
// ============================================================================

const PLAN_STATUS_COLORS: Record<PlanStatus, string> = {
  active: "#10b981",
  paused: "#f59e0b",
  completed: "#3b82f6",
  archived: "#6b7280",
};

export function generatePlansPage(data: {
  activeTab: "active" | "completed" | "archived";
  plans: HealthPlan[];
  loading?: boolean;
}): A2UIMessage {
  const ui = new A2UIGenerator("main");

  // Header
  const title = ui.text(t("plans.title"), "h2");
  const subtitle = ui.text(t("plans.subtitle"), "caption");
  const header = ui.column([title, subtitle], { gap: 4, padding: 24 });

  // Loading skeleton
  if (data.loading) {
    const s1 = ui.skeleton({ variant: "rectangular", height: 120 });
    const s2 = ui.skeleton({ variant: "rectangular", height: 120 });
    const loadingContent = ui.column([s1, s2], { gap: 16, padding: 24 });
    const root = ui.column([header, loadingContent], { gap: 0 });
    return ui.build(root);
  }

  // Build tab content
  const tabChildren: string[] = [];

  if (data.plans.length === 0) {
    const emptyIcon = ui.text("target", "caption");
    const emptyText = ui.text(t("plans.noPlans"), "h3");
    const emptyHint = ui.text(t("plans.askAgentHint"), "caption");
    tabChildren.push(
      ui.column([emptyIcon, emptyText, emptyHint], { gap: 8, align: "center", padding: 48 })
    );
  } else {
    const cardIds: string[] = [];
    for (const plan of data.plans) {
      const goalsCompleted = plan.goals.filter((g) => g.status === "completed").length;
      const totalGoals = plan.goals.length;
      const progressPct = totalGoals > 0 ? Math.round((goalsCompleted / totalGoals) * 100) : 0;

      // Days remaining
      const now = new Date();
      const end = new Date(plan.endDate);
      const daysLeft = Math.max(
        0,
        Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      );

      // Status badge
      const statusLabel =
        plan.status === "active"
          ? t("plans.statusActive")
          : plan.status === "paused"
            ? t("plans.statusPaused")
            : plan.status === "completed"
              ? t("plans.statusCompleted")
              : t("plans.statusArchived");
      const badge = ui.badge(statusLabel, {
        color: PLAN_STATUS_COLORS[plan.status],
      });

      // Plan name + description
      const nameText = ui.text(plan.name, "h3");
      const descText = ui.text(plan.description, "caption");
      const headerRow = ui.row([nameText, badge], { justify: "between", align: "center" });

      // Progress bar
      const progressBar = ui.progress(progressPct, { maxValue: 100, color: "#10b981" });

      // Stats row
      const goalsLabel = ui.text(
        `${goalsCompleted}/${totalGoals} ${t("plans.goalsCompleted")}`,
        "caption"
      );
      const daysLabel =
        plan.status === "active"
          ? ui.text(`${daysLeft} ${t("plans.daysRemaining")}`, "caption")
          : ui.text(`${plan.startDate} ~ ${plan.endDate}`, "caption");
      const statsRow = ui.row([goalsLabel, daysLabel], { justify: "between" });

      // View button
      const viewBtn = ui.button(t("plans.viewDetails"), `view_plan:${plan.id}`, {
        variant: "outline",
        size: "sm",
        icon: "chevron-right",
      });

      const cardContent = ui.column([headerRow, descText, progressBar, statsRow, viewBtn], {
        gap: 8,
      });
      const card = ui.card([cardContent], { padding: 16 });
      cardIds.push(card);
    }
    tabChildren.push(ui.column(cardIds, { gap: 12, padding: 16 }));
  }

  const tabContentIds: Record<string, string> = {};
  tabContentIds[data.activeTab] = ui.column(tabChildren, { gap: 0, padding: 24 });

  // Tabs
  const tabs = ui.tabs(
    [
      { id: "active", label: t("plans.tabActive") },
      { id: "completed", label: t("plans.tabCompleted") },
      { id: "archived", label: t("plans.tabArchived") },
    ],
    data.activeTab,
    tabContentIds
  );

  const root = ui.column([header, tabs], { gap: 0 });
  return ui.build(root);
}

export function generatePlanDetailModal(plan: HealthPlan): A2UIMessage {
  const ui = new A2UIGenerator("modal");

  // Title
  const title = ui.text(plan.name, "h2");
  const desc = ui.text(plan.description, "caption");
  const headerSection = ui.column([title, desc], { gap: 4 });

  const sections: string[] = [headerSection];

  // Goals table
  const goalRows = plan.goals.map((g) => {
    const progress =
      g.currentValue !== undefined && g.targetValue > 0
        ? `${Math.round((g.currentValue / g.targetValue) * 100)}%`
        : "-";
    const statusLabel =
      g.status === "completed"
        ? "✓"
        : g.status === "ahead"
          ? "↑"
          : g.status === "behind"
            ? "↓"
            : g.status === "missed"
              ? "✗"
              : "→";
    return {
      label: g.label,
      target: `${g.targetValue} ${g.unit}`,
      current: g.currentValue !== undefined ? `${g.currentValue} ${g.unit}` : "-",
      progress,
      status: statusLabel,
    };
  });

  const goalsTable = ui.dataTable(
    [
      { key: "label", label: t("plans.goalLabel") },
      { key: "target", label: t("plans.target") },
      { key: "current", label: t("plans.current") },
      { key: "progress", label: t("plans.progress") },
      { key: "status", label: t("plans.status") },
    ],
    goalRows
  );
  const goalsCard = ui.card([goalsTable], { title: t("plans.goalLabel"), padding: 16 });
  sections.push(goalsCard);

  // Milestones (git_timeline)
  if (plan.milestones.length > 0) {
    const timelineEntries = plan.milestones.map((m) => ({
      id: m.id,
      type: "commit" as const,
      label: m.label,
      description: m.criteria,
      timestamp: new Date(m.targetDate).getTime(),
      status: m.completed ? ("success" as const) : ("pending" as const),
    }));
    const timeline = ui.gitTimeline(timelineEntries);
    const msCard = ui.card([timeline], { title: t("plans.milestones"), padding: 16 });
    sections.push(msCard);
  }

  // Adjustment history
  if (plan.adjustments.length > 0) {
    const adjRows = plan.adjustments.map((a) => ({
      date: a.date.split("T")[0],
      reason: a.reason,
      changes: a.changes,
    }));
    const adjTable = ui.dataTable(
      [
        { key: "date", label: t("plans.date") },
        { key: "reason", label: t("plans.reason") },
        { key: "changes", label: t("plans.changes") },
      ],
      adjRows
    );
    const adjCard = ui.card([adjTable], { title: t("plans.adjustmentHistory"), padding: 16 });
    sections.push(adjCard);
  }

  // Action buttons
  const buttons: string[] = [];
  if (plan.status === "active") {
    buttons.push(
      ui.button(t("plans.pause"), `update_plan_action:${plan.id}:paused`, {
        variant: "outline",
        size: "sm",
        icon: "pause",
      })
    );
    buttons.push(
      ui.button(t("plans.complete"), `update_plan_action:${plan.id}:completed`, {
        variant: "primary",
        size: "sm",
        icon: "check",
      })
    );
  } else if (plan.status === "paused") {
    buttons.push(
      ui.button(t("plans.resume"), `update_plan_action:${plan.id}:active`, {
        variant: "primary",
        size: "sm",
        icon: "play",
      })
    );
  }
  if (plan.status === "completed") {
    buttons.push(
      ui.button(t("plans.archive"), `update_plan_action:${plan.id}:archived`, {
        variant: "outline",
        size: "sm",
        icon: "save",
      })
    );
  }

  if (buttons.length > 0) {
    sections.push(ui.row(buttons, { gap: 8, justify: "end" }));
  }

  const root = ui.column(sections, { gap: 16, padding: 24 });
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
    case "get_hrv":
      return generateHrvCards(data);
    case "get_blood_pressure":
      return generateBloodPressureCards(data);
    case "get_stress":
      return generateStressCards(data);
    case "get_spo2":
      return generateSpo2Cards(data);
    case "get_body_composition":
      return generateBodyCompositionCards(data);
    case "get_blood_glucose":
      return generateBloodGlucoseCards(data);
    case "get_nutrition":
      return generateNutritionCards(data);
    case "present_insight":
      return generateInsightCards(data);
    case "create_health_plan":
      return generateCreatePlanCards(data);
    default:
      return generateGenericToolCards(data);
  }
}

function generateCreatePlanCards(data: unknown): ToolCardResult | null {
  const d = data as {
    success?: boolean;
    name?: string;
    goalsCount?: number;
    startDate?: string;
    endDate?: string;
  };
  if (!d?.success) return null;

  const ui = new A2UIGenerator("ic-plan");

  const nameCard = ui.statCard({
    title: t("plans.title"),
    value: d.name || "",
    icon: "target",
    color: "#10b981",
  });

  const goalsCard = ui.statCard({
    title: t("plans.goalLabel"),
    value: `${d.goalsCount || 0}`,
    icon: "bar-chart",
    color: "#3b82f6",
  });

  const dateCard = ui.statCard({
    title: t("plans.daysRemaining"),
    value: `${d.startDate} ~ ${d.endDate}`,
    icon: "calendar",
    color: "#8b5cf6",
  });

  const grid = ui.grid([nameCard, goalsCard, dateCard], { columns: 3, gap: 12 });

  const viewBtn = ui.button(t("plans.viewDetails"), "navigate:plans", {
    variant: "outline",
    size: "sm",
    icon: "chevron-right",
  });

  const root = ui.column([grid, viewBtn], { gap: 12 });
  return ui.build(root);
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
    variant: "outline",
    size: "sm",
    icon: "chevron-right",
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
    title: t("health.maxHR"),
    value: d.maxToday ?? "--",
    subtitle: t("health.bpmMax"),
    icon: "trending-up",
    color: "#f97316",
  });

  const minCard = ui.statCard({
    title: t("health.minHR"),
    value: d.minToday ?? "--",
    subtitle: t("health.bpmMin"),
    icon: "trending-down",
    color: "#3b82f6",
  });

  const statsGrid = ui.grid([restingCard, maxCard, minCard], { columns: 3, gap: 12 });

  const children: string[] = [statsGrid];

  // Heart rate line chart (last 12 readings) — wrapped in card
  if (d.readings && d.readings.length > 0) {
    const chartData = d.readings.slice(-12).map((r) => ({ label: r.time, value: r.value }));
    const chartLabel = ui.text(t("health.heartRateTrend"), "label");
    const chart = ui.chart({
      chartType: "line",
      data: chartData,
      xKey: "label",
      yKey: "value",
      height: 160,
      color: "#ef4444",
    });
    const chartCard = ui.card([chartLabel, chart], { padding: 12 });
    children.push(chartCard);
  }

  // Quick action button
  const viewBtn = ui.button(t("health.title"), "navigate:health", {
    variant: "outline",
    size: "sm",
    icon: "chevron-right",
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

  // Sleep stages bar chart — wrapped in card
  if (d.stages) {
    const stageData = [
      { label: "Deep", value: d.stages.deep || 0 },
      { label: "Light", value: d.stages.light || 0 },
      { label: "REM", value: d.stages.rem || 0 },
      { label: "Awake", value: d.stages.awake || 0 },
    ];
    const chartLabel = ui.text(t("dashboard.sleepTrend"), "label");
    const chart = ui.chart({
      chartType: "bar",
      data: stageData,
      xKey: "label",
      yKey: "value",
      height: 140,
      color: "#8b5cf6",
    });
    const chartCard = ui.card([chartLabel, chart], { padding: 12 });
    children.push(chartCard);
  }

  // Quick action button
  const viewBtn = ui.button(t("sleep.title"), "navigate:sleep", {
    variant: "outline",
    size: "sm",
    icon: "chevron-right",
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

  // Steps bar chart (7 days) — wrapped in card
  if (d.steps?.daily && d.steps.daily.length > 0) {
    const stepsChartData = d.steps.daily.map((day) => ({
      label: day.date.slice(-2),
      value: day.steps,
    }));
    const stepsLabel = ui.text(t("dashboard.stepsTrend"), "label");
    const stepsChart = ui.chart({
      chartType: "bar",
      data: stepsChartData,
      xKey: "label",
      yKey: "value",
      height: 140,
      color: "#10b981",
    });
    const stepsCard = ui.card([stepsLabel, stepsChart], { padding: 12 });
    children.push(stepsCard);
  }

  // Sleep bar chart (7 days) — wrapped in card
  if (d.sleep?.daily && d.sleep.daily.length > 0) {
    const sleepChartData = d.sleep.daily.map((day) => ({
      label: day.date.slice(-2),
      value: day.hours,
    }));
    const sleepLabel = ui.text(t("dashboard.sleepTrend"), "label");
    const sleepChart = ui.chart({
      chartType: "bar",
      data: sleepChartData,
      xKey: "label",
      yKey: "value",
      height: 140,
      color: "#8b5cf6",
    });
    const sleepCard = ui.card([sleepLabel, sleepChart], { padding: 12 });
    children.push(sleepCard);
  }

  // Quick action button
  const viewBtn = ui.button(t("activity.title"), "navigate:activity", {
    variant: "outline",
    size: "sm",
    icon: "chevron-right",
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

function generateHrvCards(data: unknown): ToolCardResult | null {
  const d = data as {
    rmssd?: number;
    average?: number;
    max?: number;
    min?: number;
    readings?: { time: string; value: number }[];
  };
  if (!d) return null;

  const ui = new A2UIGenerator("ic-hrv");

  const rmssdCard = ui.statCard({
    title: "RMSSD",
    value: d.rmssd ?? "--",
    subtitle: "ms",
    icon: "activity",
    color: "#8b5cf6",
  });

  const avgCard = ui.statCard({
    title: t("health.hrv"),
    value: d.average ?? "--",
    subtitle: "ms avg",
    icon: "heart-pulse",
    color: "#3b82f6",
  });

  const rangeCard = ui.statCard({
    title: "Range",
    value: d.min != null && d.max != null ? `${d.min}-${d.max}` : "--",
    subtitle: "ms",
    icon: "trending-up",
    color: "#10b981",
  });

  const statsGrid = ui.grid([rmssdCard, avgCard, rangeCard], { columns: 3, gap: 12 });
  const children: string[] = [statsGrid];

  if (d.readings && d.readings.length > 0) {
    const chartData = d.readings.slice(-12).map((r) => ({ label: r.time, value: r.value }));
    const chartLabel = ui.text(t("health.hrvLabel"), "label");
    const chart = ui.chart({
      chartType: "line",
      data: chartData,
      xKey: "label",
      yKey: "value",
      height: 160,
      color: "#8b5cf6",
    });
    const chartCard = ui.card([chartLabel, chart], { padding: 12 });
    children.push(chartCard);
  }

  const root = ui.column(children, { gap: 12 });
  return ui.build(root);
}

function generateBloodPressureCards(data: unknown): ToolCardResult | null {
  const d = data as {
    systolicAvg?: number;
    diastolicAvg?: number;
    systolicMax?: number;
    diastolicMax?: number;
    readings?: { time: string; systolic: number; diastolic: number }[];
  };
  if (!d) return null;

  const ui = new A2UIGenerator("ic-bp");

  const sysCard = ui.statCard({
    title: t("health.systolic"),
    value: d.systolicAvg ?? "--",
    subtitle: "mmHg",
    icon: "trending-up",
    color: "#ef4444",
  });

  const diaCard = ui.statCard({
    title: t("health.diastolic"),
    value: d.diastolicAvg ?? "--",
    subtitle: "mmHg",
    icon: "trending-down",
    color: "#3b82f6",
  });

  const maxCard = ui.statCard({
    title: "Peak",
    value: d.systolicMax != null ? `${d.systolicMax}/${d.diastolicMax ?? "--"}` : "--",
    subtitle: "mmHg",
    icon: "alert-triangle",
    color: "#f97316",
  });

  const statsGrid = ui.grid([sysCard, diaCard, maxCard], { columns: 3, gap: 12 });
  const root = ui.column([statsGrid], { gap: 12 });
  return ui.build(root);
}

function generateStressCards(data: unknown): ToolCardResult | null {
  const d = data as {
    current?: number;
    average?: number;
    max?: number;
    min?: number;
    readings?: { time: string; value: number }[];
  };
  if (!d) return null;

  const ui = new A2UIGenerator("ic-stress");

  const currentCard = ui.statCard({
    title: t("health.stress"),
    value: d.current ?? "--",
    subtitle: "/99",
    icon: "brain",
    color: d.current != null && d.current > 60 ? "#ef4444" : "#10b981",
  });

  const avgCard = ui.statCard({
    title: "Average",
    value: d.average ?? "--",
    subtitle: t("health.stressLevel"),
    icon: "activity",
    color: "#3b82f6",
  });

  const rangeCard = ui.statCard({
    title: "Range",
    value: d.min != null && d.max != null ? `${d.min}-${d.max}` : "--",
    icon: "bar-chart",
    color: "#8b5cf6",
  });

  const statsGrid = ui.grid([currentCard, avgCard, rangeCard], { columns: 3, gap: 12 });
  const children: string[] = [statsGrid];

  if (d.readings && d.readings.length > 0) {
    const chartData = d.readings.slice(-12).map((r) => ({ label: r.time, value: r.value }));
    const chartLabel = ui.text(t("health.stressLevel"), "label");
    const chart = ui.chart({
      chartType: "area",
      data: chartData,
      xKey: "label",
      yKey: "value",
      height: 140,
      color: "#8b5cf6",
    });
    const chartCard = ui.card([chartLabel, chart], { padding: 12 });
    children.push(chartCard);
  }

  const root = ui.column(children, { gap: 12 });
  return ui.build(root);
}

function generateSpo2Cards(data: unknown): ToolCardResult | null {
  const d = data as {
    current?: number;
    average?: number;
    max?: number;
    min?: number;
    readings?: { time: string; value: number }[];
  };
  if (!d) return null;

  const ui = new A2UIGenerator("ic-spo2");

  const currentCard = ui.statCard({
    title: t("health.spo2"),
    value: d.current != null ? `${d.current}%` : "--",
    icon: "wind",
    color: d.current != null && d.current < 95 ? "#ef4444" : "#10b981",
  });

  const avgCard = ui.statCard({
    title: "Average",
    value: d.average != null ? `${d.average}%` : "--",
    icon: "activity",
    color: "#3b82f6",
  });

  const minCard = ui.statCard({
    title: "Min",
    value: d.min != null ? `${d.min}%` : "--",
    icon: "trending-down",
    color: "#f97316",
  });

  const statsGrid = ui.grid([currentCard, avgCard, minCard], { columns: 3, gap: 12 });
  const root = ui.column([statsGrid], { gap: 12 });
  return ui.build(root);
}

function generateBodyCompositionCards(data: unknown): ToolCardResult | null {
  const d = data as {
    weight?: number;
    height?: number;
    bmi?: number;
    bodyFat?: number;
  };
  if (!d) return null;

  const ui = new A2UIGenerator("ic-body");

  const cards: string[] = [];

  if (d.weight != null) {
    cards.push(
      ui.statCard({
        title: t("health.bodyWeight"),
        value: `${d.weight}`,
        subtitle: "kg",
        icon: "user",
        color: "#3b82f6",
      })
    );
  }
  if (d.bmi != null) {
    const bmiColor = d.bmi < 18.5 || d.bmi >= 25 ? "#f97316" : "#10b981";
    cards.push(
      ui.statCard({
        title: t("health.bmi"),
        value: d.bmi.toFixed(1),
        icon: "target",
        color: bmiColor,
      })
    );
  }
  if (d.bodyFat != null) {
    cards.push(
      ui.statCard({
        title: t("health.bodyFat"),
        value: `${d.bodyFat}%`,
        icon: "activity",
        color: "#8b5cf6",
      })
    );
  }

  if (cards.length === 0) return null;

  const statsGrid = ui.grid(cards, { columns: Math.min(cards.length, 3), gap: 12 });
  const root = ui.column([statsGrid], { gap: 12 });
  return ui.build(root);
}

function generateBloodGlucoseCards(data: unknown): ToolCardResult | null {
  const d = data as {
    current?: number;
    average?: number;
    max?: number;
    min?: number;
    readings?: { time: string; value: number }[];
  };
  if (!d) return null;

  const ui = new A2UIGenerator("ic-glucose");

  const currentCard = ui.statCard({
    title: t("health.bloodGlucose"),
    value: d.current ?? "--",
    subtitle: "mmol/L",
    icon: "flame",
    color: d.current != null && (d.current < 3.9 || d.current > 7.8) ? "#ef4444" : "#10b981",
  });

  const avgCard = ui.statCard({
    title: "Average",
    value: d.average ?? "--",
    subtitle: "mmol/L",
    icon: "activity",
    color: "#3b82f6",
  });

  const rangeCard = ui.statCard({
    title: "Range",
    value: d.min != null && d.max != null ? `${d.min}-${d.max}` : "--",
    subtitle: "mmol/L",
    icon: "bar-chart",
    color: "#8b5cf6",
  });

  const statsGrid = ui.grid([currentCard, avgCard, rangeCard], { columns: 3, gap: 12 });
  const root = ui.column([statsGrid], { gap: 12 });
  return ui.build(root);
}

function generateNutritionCards(data: unknown): ToolCardResult | null {
  const d = data as {
    totalCalories?: number;
    protein?: number;
    fat?: number;
    carbs?: number;
    water?: number;
    meals?: Array<{ name?: string; calories?: number }>;
  };
  if (!d) return null;

  const ui = new A2UIGenerator("ic-nutrition");

  const calCard = ui.statCard({
    title: t("activity.calories"),
    value: d.totalCalories != null ? d.totalCalories.toLocaleString() : "--",
    subtitle: "kcal",
    icon: "flame",
    color: "#f97316",
  });

  const proteinCard = ui.statCard({
    title: "Protein",
    value: d.protein != null ? `${d.protein}g` : "--",
    icon: "zap",
    color: "#ef4444",
  });

  const carbsCard = ui.statCard({
    title: "Carbs",
    value: d.carbs != null ? `${d.carbs}g` : "--",
    icon: "activity",
    color: "#3b82f6",
  });

  const statsGrid = ui.grid([calCard, proteinCard, carbsCard], { columns: 3, gap: 12 });
  const children: string[] = [statsGrid];

  if (d.meals && d.meals.length > 0) {
    const rows = d.meals.map((m) => ({
      meal: m.name || "-",
      calories: m.calories != null ? `${m.calories}` : "-",
    }));
    const table = ui.table(
      [
        { key: "meal", label: "Meal" },
        { key: "calories", label: "Cal" },
      ],
      rows
    );
    const tableCard = ui.card([table], { padding: 12 });
    children.push(tableCard);
  }

  const root = ui.column(children, { gap: 12 });
  return ui.build(root);
}

/**
 * Insight card generator for present_insight tool.
 * Renders structured health analysis results as rich cards.
 */
function generateInsightCards(data: unknown): ToolCardResult | null {
  const d = data as {
    type?: string;
    title?: string;
    highlights?: Array<{ label: string; value: string; unit?: string; status?: string }>;
    insights?: string[];
    recommendations?: string[];
    next_steps?: Array<{ label: string; action?: string }>;
  };
  if (!d || !d.title) return null;

  const ui = new A2UIGenerator("ic-insight");
  const children: string[] = [];

  // Title with type-based icon
  const iconMap: Record<string, string> = {
    health_summary: "heart",
    recommendation: "lightbulb",
    comparison: "bar-chart",
    progress: "trending-up",
    alert: "alert-triangle",
  };
  const titleIcon = iconMap[d.type || "health_summary"] || "sparkles";
  const titleText = ui.text(`${d.title}`, "h3");
  children.push(titleText);

  // Highlights as stat cards in a grid
  if (d.highlights && d.highlights.length > 0) {
    const statusColorMap: Record<string, string> = {
      good: "#10b981",
      caution: "#f59e0b",
      attention: "#ef4444",
    };
    const statCards = d.highlights.map((h) => {
      const color = statusColorMap[h.status || "good"] || "#6366f1";
      return ui.statCard({
        title: h.label,
        value: h.value,
        subtitle: h.unit,
        icon: titleIcon,
        color,
      });
    });
    const cols = Math.min(statCards.length, 3);
    children.push(ui.grid(statCards, { columns: cols, gap: 12 }));
  }

  // Insights list
  if (d.insights && d.insights.length > 0) {
    children.push(ui.text("洞察", "label"));
    for (const insight of d.insights) {
      children.push(ui.text(`- ${insight}`, "body"));
    }
  }

  // Recommendations list
  if (d.recommendations && d.recommendations.length > 0) {
    children.push(ui.text("建议", "label"));
    for (const rec of d.recommendations) {
      children.push(ui.text(`- ${rec}`, "body"));
    }
  }

  // Next steps as buttons
  if (d.next_steps && d.next_steps.length > 0) {
    const buttons = d.next_steps.map((step) =>
      ui.button(step.label, step.action || "noop", {
        variant: "outline",
        size: "sm",
        icon: "chevron-right",
      })
    );
    children.push(ui.row(buttons, { gap: 8 }));
  }

  // Wrap everything in a card
  const cardContent = ui.column(children, { gap: 8 });
  const root = ui.card([cardContent], { padding: 16 });
  return ui.build(root);
}

/**
 * Generic fallback card generator for tools without specialized cards.
 * Intelligently renders objects as stat cards, arrays as tables, simple values as text.
 */
function generateGenericToolCards(data: unknown): ToolCardResult | null {
  if (data == null) return null;

  const ui = new A2UIGenerator("ic-generic");

  // Array → data_table
  if (Array.isArray(data)) {
    if (data.length === 0) return null;
    // Extract columns from first row keys
    const first = data[0];
    if (typeof first !== "object" || first === null) {
      // Simple value array → text
      const text = ui.text(data.map(String).join(", "), "body");
      const root = ui.column([text], { gap: 8 });
      return ui.build(root);
    }
    const keys = Object.keys(first).slice(0, 6); // Limit columns
    const columns = keys.map((k) => ({ key: k, label: k }));
    const rows = data.slice(0, 20).map((item) => {
      const row: Record<string, unknown> = {};
      for (const k of keys) {
        const v = (item as Record<string, unknown>)[k];
        row[k] = v != null ? String(v) : "-";
      }
      return row;
    });
    const table = ui.dataTable(columns, rows);
    const tableCard = ui.card([table], { padding: 12 });
    const root = ui.column([tableCard], { gap: 12 });
    return ui.build(root);
  }

  // Object → stat_card grid
  if (typeof data === "object") {
    const entries = Object.entries(data as Record<string, unknown>).filter(
      ([, v]) => v != null && typeof v !== "object"
    );
    if (entries.length === 0) return null;

    const cards: string[] = [];
    for (const [key, value] of entries.slice(0, 9)) {
      const isNum = typeof value === "number";
      cards.push(
        ui.statCard({
          title: key,
          value: isNum ? (value as number).toLocaleString() : String(value),
          icon: isNum ? "bar-chart" : "info",
          color: "#6366f1",
        })
      );
    }

    const cols = Math.min(cards.length, 3);
    const statsGrid = ui.grid(cards, { columns: cols, gap: 12 });
    const root = ui.column([statsGrid], { gap: 12 });
    return ui.build(root);
  }

  // Primitive → text
  const text = ui.text(String(data), "body");
  const root = ui.column([text], { gap: 8 });
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

// ============================================================================
// Proactive Health Page
// ============================================================================

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "#ef4444",
  high: "#f97316",
  medium: "#3b82f6",
  low: "#6b7280",
};

const CATEGORY_ICONS: Record<string, string> = {
  medication: "heart-pulse",
  exercise: "footprints",
  sleep: "moon",
  hydration: "wind",
  meal: "flame",
  checkup: "stethoscope",
  workout: "activity",
  custom: "star",
};

export function generateProactivePage(data: {
  activeTab: "recommendations" | "reminders" | "calendar";
  recommendations: Recommendation[];
  reminders: Reminder[];
  events: CalendarEvent[];
  loading?: boolean;
}): A2UIMessage {
  const ui = new A2UIGenerator("main");

  // Header
  const title = ui.text(t("proactive.title"), "h2");
  const subtitle = ui.text(t("proactive.subtitle"), "caption");
  const header = ui.column([title, subtitle], { gap: 4, padding: 24 });

  if (data.loading) {
    const s1 = ui.skeleton({ variant: "rectangular", height: 100 });
    const s2 = ui.skeleton({ variant: "rectangular", height: 100 });
    const loadingContent = ui.column([s1, s2], { gap: 16, padding: 24 });
    return ui.build(ui.column([header, loadingContent], { gap: 0 }));
  }

  const tabContentIds: Record<string, string> = {};

  // --- Recommendations Tab ---
  {
    const children: string[] = [];
    if (data.recommendations.length === 0) {
      const emptyText = ui.text(t("proactive.noRecommendations"), "h3");
      const hint = ui.text(t("proactive.askAgentHint"), "caption");
      children.push(ui.column([emptyText, hint], { gap: 8, align: "center", padding: 48 }));
    } else {
      const cards: string[] = [];
      for (const rec of data.recommendations) {
        const icon = rec.icon || "sparkles";
        const badge = ui.badge(rec.type, { color: PRIORITY_COLORS[rec.priority] || "#3b82f6" });
        const titleText = ui.text(rec.title, "h3");
        const headerRow = ui.row([titleText, badge], { justify: "between", align: "center" });
        const body = ui.text(rec.body, "body");

        const btnIds: string[] = [];
        btnIds.push(
          ui.button(t("proactive.acted"), `rec_act:${rec.id}`, {
            variant: "primary",
            size: "sm",
            icon: "check",
          })
        );
        btnIds.push(
          ui.button(t("proactive.dismiss"), `rec_dismiss:${rec.id}`, {
            variant: "outline",
            size: "sm",
            icon: "x",
          })
        );
        const btnRow = ui.row(btnIds, { gap: 8 });

        const cardContent = ui.column([headerRow, body, btnRow], { gap: 8 });
        cards.push(ui.card([cardContent], { padding: 16 }));
      }
      children.push(ui.column(cards, { gap: 12 }));
    }
    tabContentIds["recommendations"] = ui.column(children, { gap: 0, padding: 24 });
  }

  // --- Reminders Tab ---
  {
    const children: string[] = [];
    if (data.reminders.length === 0) {
      const emptyText = ui.text(t("proactive.noReminders"), "h3");
      const hint = ui.text(t("proactive.askAgentHint"), "caption");
      children.push(ui.column([emptyText, hint], { gap: 8, align: "center", padding: 48 }));
    } else {
      const cards: string[] = [];
      for (const rem of data.reminders) {
        const icon = CATEGORY_ICONS[rem.category] || "timer";
        const titleText = ui.text(rem.title, "h3");
        const time = rem.scheduledAt.split("T")[1]?.slice(0, 5) || rem.scheduledAt;
        const timeText = ui.text(time, "caption");
        const headerRow = ui.row([titleText, timeText], { justify: "between", align: "center" });

        const details: string[] = [];
        if (rem.body) details.push(ui.text(rem.body, "body"));
        if (rem.repeatRule !== "none") {
          details.push(
            ui.badge(`${t("proactive.repeats")}: ${rem.repeatRule}`, { color: "#8b5cf6" })
          );
        }
        const statusBadge = ui.badge(rem.status, {
          color:
            rem.status === "completed"
              ? "#10b981"
              : rem.status === "pending"
                ? "#3b82f6"
                : "#6b7280",
        });

        const btnIds: string[] = [];
        if (rem.status === "pending") {
          btnIds.push(
            ui.button(t("proactive.complete"), `rem_complete:${rem.id}`, {
              variant: "primary",
              size: "sm",
              icon: "check",
            })
          );
        }
        const infoRow = ui.row([statusBadge, ...btnIds], { gap: 8 });

        const cardContent = ui.column([headerRow, ...details, infoRow], { gap: 6 });
        cards.push(ui.card([cardContent], { padding: 16 }));
      }
      children.push(ui.column(cards, { gap: 12 }));
    }
    tabContentIds["reminders"] = ui.column(children, { gap: 0, padding: 24 });
  }

  // --- Calendar Tab ---
  {
    const children: string[] = [];
    if (data.events.length === 0) {
      const emptyText = ui.text(t("proactive.noEvents"), "h3");
      const hint = ui.text(t("proactive.askAgentHint"), "caption");
      children.push(ui.column([emptyText, hint], { gap: 8, align: "center", padding: 48 }));
    } else {
      const cards: string[] = [];
      for (const evt of data.events) {
        const titleText = ui.text(evt.title, "h3");
        const date = evt.startTime.split("T")[0];
        const time = evt.startTime.split("T")[1]?.slice(0, 5) || "";
        const dateText = ui.text(`${date} ${time}`, "caption");
        const headerRow = ui.row([titleText, dateText], { justify: "between", align: "center" });

        const details: string[] = [];
        if (evt.description) details.push(ui.text(evt.description, "body"));
        const catBadge = ui.badge(evt.category, {
          color: "#8b5cf6",
        });
        const statusBadge = ui.badge(evt.status, {
          color:
            evt.status === "completed"
              ? "#10b981"
              : evt.status === "cancelled"
                ? "#ef4444"
                : "#3b82f6",
        });
        const infoRow = ui.row([catBadge, statusBadge], { gap: 8 });

        const cardContent = ui.column([headerRow, ...details, infoRow], { gap: 6 });
        cards.push(ui.card([cardContent], { padding: 16 }));
      }
      children.push(ui.column(cards, { gap: 12 }));
    }
    tabContentIds["calendar"] = ui.column(children, { gap: 0, padding: 24 });
  }

  const tabs = ui.tabs(
    [
      { id: "recommendations", label: t("proactive.tabRecommendations") },
      { id: "reminders", label: t("proactive.tabReminders") },
      { id: "calendar", label: t("proactive.tabCalendar") },
    ],
    data.activeTab,
    tabContentIds
  );

  const root = ui.column([header, tabs], { gap: 0 });
  return ui.build(root);
}
