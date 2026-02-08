/**
 * Page Generators for A2UI
 *
 * Each function generates A2UI component trees for different views.
 * Agent calls these to render pages.
 */

import { A2UIGenerator, type A2UIMessage } from "./a2ui.js";
import { t } from "../locales/index.js";
import type { UserProfile, MemorySearchResult } from "../memory/types.js";

// Types for page data
interface Message {
  role: "user" | "assistant" | "tool";
  content: string;
  cards?: {
    components: unknown[];
    root_id: string;
  };
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
      { id: "chat", label: t("nav.chat"), icon: "chat" },
      { id: "dashboard", label: t("nav.dashboard"), icon: "activity" },
      { id: "memory", label: t("nav.memory"), icon: "brain" },
      { id: "evolution", label: t("nav.evolution"), icon: "flask" },
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
  activeTab: "profile" | "summary" | "logs" | "search";
  profileCompleteness: number;
  profile: UserProfile;
  missingFields: string[];
  memoryStats: { totalChunks: number; lastUpdated: number };
  memorySummary: string;
  dailyLogs: Array<{ date: string; preview: string }>;
  searchQuery?: string;
  searchResults?: MemorySearchResult[];
  loading?: boolean;
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

    const chunksCard = ui.statCard({
      title: t("memory.totalChunks"),
      value: data.memoryStats.totalChunks,
      icon: "brain",
      color: "#8b5cf6",
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

    const statsGrid = ui.grid([completenessCard, chunksCard, missingCard], { columns: 3, gap: 16 });

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

  // Assemble tabs
  const tabs = ui.tabs(
    [
      { id: "profile", label: t("memory.tabProfile"), icon: "user" },
      { id: "summary", label: t("memory.tabSummary"), icon: "brain" },
      { id: "logs", label: t("memory.tabLogs"), icon: "calendar" },
      { id: "search", label: t("memory.tabSearch"), icon: "search" },
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
}): A2UIMessage {
  const ui = new A2UIGenerator("main");

  // Header
  const title = ui.text(t("prompts.title"), "h2");
  const subtitle = ui.text(t("prompts.subtitle"), "caption");
  const header = ui.column([title, subtitle], { gap: 4, padding: 24 });

  // Loading skeleton
  if (data.loading) {
    const s1 = ui.skeleton({ variant: "rectangular", height: 200 });
    const loadingContent = ui.column([s1], { gap: 16, padding: 24 });
    const root = ui.column([header, loadingContent], { gap: 0 });
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
  loading?: boolean;
}): A2UIMessage {
  const ui = new A2UIGenerator("main");

  // Header
  const title = ui.text(t("skills.title"), "h2");
  const subtitle = ui.text(t("skills.subtitle"), "caption");

  const createBtn = ui.button(t("skills.newSkill"), "create_skill", {
    variant: "primary",
    size: "sm",
  });
  const headerRow = ui.row([ui.column([title, subtitle], { gap: 4 }), createBtn], {
    justify: "between",
    align: "start",
  });
  const header = ui.column([headerRow], { padding: 24 });

  // Loading skeleton
  if (data.loading) {
    const s1 = ui.skeleton({ variant: "rectangular", height: 200 });
    const loadingContent = ui.column([s1], { gap: 16, padding: 24 });
    const root = ui.column([header, loadingContent], { gap: 0 });
    return ui.build(root);
  }

  // Skills list
  const skillRows = data.skills.map((s) => ({
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

  const skillsCard = ui.card([skillsTable], { title: t("skills.cardTitle"), padding: 20 });

  const children: string[] = [skillsCard];

  // If a skill is selected, show editor
  if (data.selectedSkill && data.content !== undefined) {
    const selectedInfo = data.skills.find((s) => s.name === data.selectedSkill);

    // Editor
    const editor = ui.codeEditor(data.content, {
      language: "markdown",
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

    const editorCard = ui.card([editorHeader, editor], {
      title: `${data.selectedSkill}/SKILL.md`,
      padding: 20,
    });

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
}

export function generateEvolutionPage(data: {
  activeTab:
    | "overview"
    | "traces"
    | "evaluations"
    | "benchmark"
    | "runs"
    | "suggestions"
    | "config"
    | "versions";
  stats?: EvaluationStats;
  traces?: TraceInfo[];
  tracesPage?: number;
  tracesTotal?: number;
  evaluations?: EvaluationInfo[];
  testCases?: TestCaseInfo[];
  suggestions?: SuggestionInfo[];
  benchmarkRuns?: BenchmarkRunInfo[];
  latestCategoryScores?: CategoryScoreInfo[];
  externalProgress?: {
    current: number;
    total: number;
    category: string;
    profile: string;
    modelId?: string;
  };
  categoriesConfig?: {
    categories: Array<{
      id: string;
      label: string;
      labelZh: string;
      weight: number;
      description: string;
      dimensionWeights: Record<string, number>;
    }>;
    dimensions: Array<{ id: string; label: string; labelZh: string }>;
    passingScore: number;
    weakCategoryThreshold: number;
  } | null;
  versions?: Array<{
    id: string;
    branchName: string;
    status: string;
    triggerMode: string;
    triggerRef: string;
    scoreDelta: number | null;
    filesChanged: string[];
    createdAt: number;
  }>;
  activeVersionBranch?: string | null;
  loading?: boolean;
}): A2UIMessage {
  const ui = new A2UIGenerator("main");

  // Header
  const title = ui.text(t("evolution.title"), "h2");
  const subtitle = ui.text(t("evolution.subtitle"), "caption");
  const header = ui.column([title, subtitle], { gap: 4, padding: 24 });

  // Loading skeleton
  if (data.loading) {
    const s1 = ui.skeleton({ variant: "rectangular", height: 80 });
    const s2 = ui.skeleton({ variant: "rectangular", height: 80 });
    const s3 = ui.skeleton({ variant: "rectangular", height: 80 });
    const statsRow = ui.grid([s1, s2, s3], { columns: 3, gap: 16 });
    const s4 = ui.skeleton({ variant: "rectangular", height: 250 });
    const loadingContent = ui.column([statsRow, s4], { gap: 16, padding: 24 });
    const root = ui.column([header, loadingContent], { gap: 0 });
    return ui.build(root);
  }

  // Tabs
  const tabContentIds: Record<string, string> = {};

  // Overview tab content
  if (data.activeTab === "overview") {
    const overviewChildren: string[] = [];

    // Show external benchmark progress indicator (e.g., from CLI)
    if (data.externalProgress) {
      const ep = data.externalProgress;
      const pct = ep.total > 0 ? Math.round((ep.current / ep.total) * 100) : 0;
      const progressLabel = ui.text(
        `${t("evolution.externalBenchmarkRunning")}${ep.modelId ? ` (${ep.modelId})` : ""} — ${ep.current}/${ep.total} (${pct}%)`,
        "caption"
      );
      const progressBar = ui.progress(ep.current, { maxValue: ep.total || 1, color: "#f59e0b" });
      const categoryBadge = ep.category ? ui.badge(ep.category, { variant: "info" }) : null;
      const progressItems = [progressLabel, progressBar];
      if (categoryBadge) progressItems.push(categoryBadge);
      const progressCard = ui.card(progressItems, { padding: 12 });
      overviewChildren.push(progressCard);
    }

    // Row 1: Radar chart + stat cards
    const rightCards: string[] = [];

    if (data.stats) {
      if (data.stats.totalCount > 0) {
        const avgScoreGauge = ui.scoreGauge(data.stats.averageScore, {
          label: t("evolution.avgScore"),
          max: 100,
          size: "lg",
        });
        rightCards.push(avgScoreGauge);
      } else {
        // No evaluations yet - show a hint instead of "0"
        const noEvalCard = ui.statCard({
          title: t("evolution.avgScore"),
          value: "-",
          subtitle: t("evolution.noEvaluationsYet"),
          icon: "star",
          color: "#94a3b8",
        });
        rightCards.push(noEvalCard);
      }

      const totalTraces = ui.statCard({
        title: t("evolution.totalTraces"),
        value: data.stats.totalCount,
        icon: "bar-chart",
        color: "#667eea",
      });
      rightCards.push(totalTraces);

      if (data.benchmarkRuns && data.benchmarkRuns.length > 0) {
        const latestRun = data.benchmarkRuns[0];
        const latestScore = ui.statCard({
          title: t("evolution.runBenchmark"),
          value: Math.round(latestRun.overallScore),
          subtitle: t("evolution.outOf100"),
          icon: "test-tube",
          color: "#10b981",
        });
        rightCards.push(latestScore);
      }
    }

    // Radar chart from best category scores across all runs
    if (data.latestCategoryScores && data.latestCategoryScores.length > 0) {
      const labelMap: Record<string, string> = {
        "health-data-analysis": t("evolution.healthDataAnalysis"),
        "health-coaching": t("evolution.healthCoaching"),
        "safety-boundaries": t("evolution.safetyBoundaries"),
        "personalization-memory": t("evolution.personalization"),
        "communication-quality": t("evolution.communicationQuality"),
      };
      const radarData = data.latestCategoryScores.map((cs) => ({
        label: labelMap[cs.category] || cs.category,
        value: cs.score,
        maxValue: 100,
      }));

      const radarLabel = ui.text(t("evolution.bestScore"), "caption");
      const radar = ui.radarChart(radarData, { size: 280, color: "#667eea" });
      const radarCol = ui.column([radarLabel, radar], { gap: 4, align: "center" });
      const statsCol = ui.column(rightCards, { gap: 12 });
      const topRow = ui.row([radarCol, statsCol], { gap: 24, align: "start" });
      overviewChildren.push(topRow);
    } else if (rightCards.length > 0) {
      const overviewGrid = ui.grid(rightCards, { columns: 3, gap: 16 });
      overviewChildren.push(overviewGrid);
    }

    // Row 2: Recent benchmark runs table
    if (data.benchmarkRuns && data.benchmarkRuns.length > 0) {
      const runsLabel = ui.text(t("evolution.recentRuns"), "label");

      // Score delta vs previous run
      if (data.benchmarkRuns.length >= 2) {
        const latest = data.benchmarkRuns[0].overallScore;
        const prev = data.benchmarkRuns[1].overallScore;
        const delta = latest - prev;
        const sign = delta > 0 ? "+" : "";
        const deltaColor = delta > 0 ? "#10b981" : delta < 0 ? "#ef4444" : "#94a3b8";
        const deltaText = ui.text(
          `${t("evolution.latestChange")}: ${sign}${delta.toFixed(1)} (${Math.round(prev)} -> ${Math.round(latest)})`,
          "caption"
        );
        overviewChildren.push(ui.row([runsLabel, deltaText], { gap: 12, align: "center" }));
      } else {
        overviewChildren.push(runsLabel);
      }

      const runRows = data.benchmarkRuns.slice(0, 5).map((r) => ({
        id: r.id.slice(0, 8),
        time: new Date(r.timestamp).toLocaleString(),
        version: r.versionTag || r.metadata?.gitVersion || "-",
        model: r.metadata?.modelId || "-",
        profile: r.profile,
        score: Math.round(r.overallScore),
        passed: `${r.passedCount}/${r.totalTestCases}`,
        duration: r.durationMs ? `${(r.durationMs / 1000).toFixed(1)}s` : "-",
      }));

      const runsTable = ui.dataTable(
        [
          { key: "time", label: t("evolution.time"), sortable: true },
          { key: "version", label: t("evolution.versionTag") },
          { key: "model", label: t("evolution.model") },
          { key: "profile", label: t("evolution.profile"), render: "badge" },
          { key: "score", label: t("evolution.score"), render: "progress" },
          { key: "passed", label: t("evolution.passed") },
          { key: "duration", label: t("evolution.duration") },
        ],
        runRows,
        { onRowClick: "view_benchmark_run" }
      );

      const rerunQuickBtn = ui.button(t("evolution.runQuickBenchmark"), "run_benchmark", {
        variant: "secondary",
        size: "sm",
        payload: { profile: "quick" },
      });
      const rerunFullBtn = ui.button(t("evolution.runFullBenchmark"), "run_benchmark", {
        variant: "secondary",
        size: "sm",
        payload: { profile: "full" },
      });
      const rerunRow = ui.row([rerunQuickBtn, rerunFullBtn], { gap: 8, justify: "end" });

      overviewChildren.push(runsLabel, runsTable, rerunRow);
    } else {
      // Empty state
      const emptyText = ui.text(t("evolution.noBenchmarkRuns"), "caption");
      const runBtn = ui.button(t("evolution.runQuickBenchmark"), "run_benchmark", {
        variant: "primary",
        size: "sm",
        payload: { profile: "quick" },
      });
      const emptyCol = ui.column([emptyText, runBtn], { gap: 12, align: "center", padding: 24 });
      overviewChildren.push(emptyCol);
    }

    // Row 3: Diagnose + Auto-Evolve action cards
    const diagnoseBtn = ui.button(t("evolution.runDiagnose"), "run_diagnose", {
      variant: "secondary",
      size: "sm",
      icon: "search",
    });
    const diagnoseDesc = ui.text(t("evolution.diagnoseDesc"), "caption");
    const diagnoseCard = ui.card([diagnoseDesc, diagnoseBtn], { padding: 12 });

    const autoEvolveDesc = ui.text(t("evolution.autoEvolveDesc"), "caption");
    const autoEvolveHint = ui.text(t("evolution.autoLoopHint"), "caption");
    const autoEvolveCard = ui.card([autoEvolveDesc, autoEvolveHint], { padding: 12 });

    const actionRow = ui.grid([diagnoseCard, autoEvolveCard], { columns: 2, gap: 16 });
    overviewChildren.push(actionRow);

    // Active version indicator
    if (data.activeVersionBranch) {
      const versionBadge = ui.badge(data.activeVersionBranch, { variant: "info" });
      const versionLabel = ui.text(t("evolution.activeVersion"), "caption");
      const resetBtn = ui.button(t("evolution.resetToMain"), "switch_version", {
        variant: "outline",
        size: "sm",
        payload: { branch: null },
      });
      const versionRow = ui.row([versionLabel, versionBadge, resetBtn], {
        gap: 8,
        align: "center",
      });
      overviewChildren.unshift(ui.card([versionRow], { padding: 8 }));
    }

    tabContentIds["overview"] = ui.column(overviewChildren, { gap: 16, padding: 16 });
  }

  // Traces tab content
  if (data.activeTab === "traces") {
    if (data.traces && data.traces.length > 0) {
      const traceRows = data.traces.map((t) => ({
        id: t.id.slice(0, 8),
        time: new Date(t.timestamp).toLocaleString(),
        message: t.userMessage.slice(0, 50) + (t.userMessage.length > 50 ? "..." : ""),
        score: t.score ?? "-",
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

      tabContentIds["traces"] = ui.column([tracesTable], { padding: 16 });
    } else {
      const emptyText = ui.text(t("evolution.noTracesHint"), "caption");
      tabContentIds["traces"] = ui.column([emptyText], { gap: 12, align: "center", padding: 24 });
    }
  }

  // Evaluations tab content
  if (data.activeTab === "evaluations") {
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

      tabContentIds["evaluations"] = ui.column([evalsTable], { padding: 16 });
    } else {
      const emptyText = ui.text(t("evolution.noEvaluationsHint"), "caption");
      tabContentIds["evaluations"] = ui.column([emptyText], {
        gap: 12,
        align: "center",
        padding: 24,
      });
    }
  }

  // Benchmark tab content
  if (data.activeTab === "benchmark" && data.testCases) {
    const testRows = data.testCases.map((tc) => ({
      id: tc.id.slice(0, 8),
      category: tc.category,
      query: tc.query.slice(0, 50) + (tc.query.length > 50 ? "..." : ""),
      minScore: tc.expected.minScore ?? "-",
      keywords: tc.expected.shouldMention?.length || 0,
    }));

    const testsTable = ui.dataTable(
      [
        { key: "id", label: "ID" },
        { key: "category", label: t("evolution.category"), render: "badge" },
        { key: "query", label: t("evolution.query") },
        { key: "minScore", label: t("evolution.minScore") },
        { key: "keywords", label: t("evolution.keywords") },
      ],
      testRows,
      { onRowClick: "view_test_case" }
    );

    const runQuickBtn = ui.button(t("evolution.runQuickBenchmark"), "run_benchmark", {
      variant: "secondary",
      size: "sm",
      payload: { profile: "quick" },
    });
    const runFullBtn = ui.button(t("evolution.runFullBenchmark"), "run_benchmark", {
      variant: "secondary",
      size: "sm",
      payload: { profile: "full" },
    });
    const autoLoopBtn = ui.button(t("evolution.autoLoop"), "run_auto_loop", {
      variant: "outline",
      size: "sm",
    });
    const addTestBtn = ui.button(t("evolution.addTestCase"), "create_test_case", {
      variant: "primary",
      size: "sm",
    });
    const btnRow = ui.row([runQuickBtn, runFullBtn, autoLoopBtn, addTestBtn], {
      gap: 8,
      justify: "end",
      padding: 8,
    });

    tabContentIds["benchmark"] = ui.column([btnRow, testsTable], { padding: 16 });
  }

  // Runs tab content
  if (data.activeTab === "runs") {
    if (data.benchmarkRuns && data.benchmarkRuns.length > 0) {
      const runRows = data.benchmarkRuns.map((r) => ({
        id: r.id.slice(0, 8),
        time: new Date(r.timestamp).toLocaleString(),
        version: r.versionTag || r.metadata?.gitVersion || "-",
        model: r.metadata?.modelId || "-",
        profile: r.profile,
        score: Math.round(r.overallScore),
        passed: `${r.passedCount}/${r.totalTestCases}`,
        duration: r.durationMs ? `${(r.durationMs / 1000).toFixed(1)}s` : "-",
      }));

      const runsTable = ui.dataTable(
        [
          { key: "id", label: "ID" },
          { key: "time", label: t("evolution.time"), sortable: true },
          { key: "version", label: t("evolution.versionTag") },
          { key: "model", label: t("evolution.model") },
          { key: "profile", label: t("evolution.profile"), render: "badge" },
          { key: "score", label: t("evolution.score"), render: "progress" },
          { key: "passed", label: t("evolution.passed") },
          { key: "duration", label: t("evolution.duration") },
        ],
        runRows,
        { onRowClick: "view_benchmark_run" }
      );

      tabContentIds["runs"] = ui.column([runsTable], { padding: 16 });
    } else {
      const emptyText = ui.text(t("evolution.noBenchmarkRuns"), "caption");
      tabContentIds["runs"] = ui.column([emptyText], { gap: 12, align: "center", padding: 24 });
    }
  }

  // Suggestions tab content
  if (data.activeTab === "suggestions") {
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

      tabContentIds["suggestions"] = ui.column([suggsTable], { padding: 16 });
    } else {
      const emptyText = ui.text(t("evolution.noSuggestionsHint"), "caption");
      tabContentIds["suggestions"] = ui.column([emptyText], {
        gap: 12,
        align: "center",
        padding: 24,
      });
    }
  }

  // Config tab content — scoring categories & weights
  if (data.activeTab === "config") {
    const configChildren: string[] = [];

    const configDesc = ui.text(t("evolution.configDesc"), "caption");
    const filePath = ui.text("Skill: src/skills/benchmark-evaluator/SKILL.md", "caption");
    configChildren.push(configDesc, filePath);

    if (data.categoriesConfig) {
      const cfg = data.categoriesConfig;

      // Scoring thresholds
      const thresholdRow = ui.row(
        [
          ui.statCard({
            title: t("evolution.passingScore"),
            value: cfg.passingScore,
            icon: "target",
            color: "#10b981",
          }),
          ui.statCard({
            title: t("evolution.weakThreshold"),
            value: cfg.weakCategoryThreshold,
            icon: "alert-triangle",
            color: "#f59e0b",
          }),
        ],
        { gap: 16 }
      );
      configChildren.push(thresholdRow);

      // Category cards
      for (const cat of cfg.categories) {
        const catTitle = ui.text(`${cat.label} (${cat.labelZh})`, "label");
        const catWeight = ui.text(
          `${t("evolution.weight")}: ${(cat.weight * 100).toFixed(0)}%`,
          "caption"
        );
        const catDesc = ui.text(cat.description, "body");

        // Dimension weights table
        const dimRows = Object.entries(cat.dimensionWeights).map(([dim, w]) => ({
          dimension: dim,
          weight: `${((w as number) * 100).toFixed(0)}%`,
        }));
        const dimTable = ui.table(
          [
            { key: "dimension", label: t("evolution.dimension") },
            { key: "weight", label: t("evolution.weight") },
          ],
          dimRows
        );

        configChildren.push(ui.card([catTitle, catWeight, catDesc, dimTable], { padding: 16 }));
      }

      // Edit hint
      const editHint = ui.text(t("evolution.editConfigHint"), "caption");
      configChildren.push(editHint);
    } else {
      const noConfig = ui.text(t("evolution.noConfigFile"), "caption");
      configChildren.push(noConfig);
    }

    tabContentIds["config"] = ui.column(configChildren, { gap: 16, padding: 16 });
  }

  // Versions tab content
  if (data.activeTab === "versions") {
    const versionsChildren: string[] = [];

    const versionsDesc = ui.text(t("evolution.versionsDesc"), "caption");
    versionsChildren.push(versionsDesc);

    // Active version indicator
    if (data.activeVersionBranch) {
      const activeBadge = ui.badge(data.activeVersionBranch, { variant: "info" });
      const activeLabel = ui.text(t("evolution.activeVersion"), "label");
      const resetBtn = ui.button(t("evolution.resetToMain"), "switch_version", {
        variant: "outline",
        size: "sm",
        payload: { branch: null },
      });
      versionsChildren.push(
        ui.row([activeLabel, activeBadge, resetBtn], { gap: 8, align: "center" })
      );
    }

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
      versionsChildren.push(versionsTable);
    } else {
      const emptyText = ui.text(t("evolution.noVersions"), "caption");
      versionsChildren.push(emptyText);
    }

    tabContentIds["versions"] = ui.column(versionsChildren, { gap: 16, padding: 16 });
  }

  const tabs = ui.tabs(
    [
      { id: "overview", label: t("evolution.overview"), icon: "bar-chart" },
      { id: "traces", label: t("evolution.traces"), icon: "file-text" },
      { id: "evaluations", label: t("evolution.evaluations"), icon: "star" },
      { id: "benchmark", label: t("evolution.benchmark"), icon: "test-tube" },
      { id: "runs", label: t("evolution.runs"), icon: "activity" },
      { id: "suggestions", label: t("evolution.suggestions"), icon: "lightbulb" },
      { id: "versions", label: t("evolution.versions"), icon: "sparkles" },
      { id: "config", label: t("evolution.config"), icon: "settings" },
    ],
    data.activeTab,
    tabContentIds
  );

  // Content container - tabs directly without card wrapper to avoid double glass effect
  const content = ui.column([tabs], { gap: 24, padding: 24 });
  const root = ui.column([header, content], { gap: 0 });

  return ui.build(root);
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
    const noGhCard = ui.card([noGhTitle, noGhHint], { padding: 24 });
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
// Benchmark Run Detail Modal
// ============================================================================

export function generateBenchmarkRunDetailModal(
  run: BenchmarkRunInfo,
  categoryScores: CategoryScoreInfo[]
): A2UIMessage {
  const ui = new A2UIGenerator("modal");

  const children: string[] = [];

  // Top: score gauge centered
  const overallGauge = ui.scoreGauge(run.overallScore, {
    label: t("evolution.totalScore"),
    max: 100,
    size: "lg",
  });
  children.push(ui.column([overallGauge], { align: "center" }));

  // Stat cards row (3 columns)
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

  // Radar chart of category scores
  if (categoryScores.length > 0) {
    const labelMap: Record<string, string> = {
      "health-data-analysis": t("evolution.healthDataAnalysis"),
      "health-coaching": t("evolution.healthCoaching"),
      "safety-boundaries": t("evolution.safetyBoundaries"),
      "personalization-memory": t("evolution.personalization"),
      "communication-quality": t("evolution.communicationQuality"),
    };

    const radarData = categoryScores.map((cs) => ({
      label: labelMap[cs.category] || cs.category,
      value: cs.score,
      maxValue: 100,
    }));

    const radar = ui.radarChart(radarData, { size: 280, color: "#667eea" });
    children.push(ui.column([radar], { align: "center" }));

    // Category scores table
    const catLabel = ui.text(t("evolution.categoryScores"), "label");
    const catRows = categoryScores.map((cs) => ({
      category: labelMap[cs.category] || cs.category,
      score: Math.round(cs.score),
      passed: `${cs.passedCount}/${cs.testCount}`,
    }));

    const catTable = ui.dataTable(
      [
        { key: "category", label: t("evolution.category") },
        { key: "score", label: t("evolution.score"), render: "progress" },
        { key: "passed", label: t("evolution.passed") },
      ],
      catRows
    );
    children.push(catLabel, catTable);
  }

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
  defaultProfile: "quick" | "full" = "quick"
): A2UIMessage {
  const ui = new A2UIGenerator("modal");

  const modelOptions = [
    { value: "__default__", label: t("evolution.defaultModel") },
    ...models.map((m) => ({ value: m.name, label: m.label })),
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

  const root = ui.modal(t("evolution.runBenchmark"), [form], { size: "sm" });

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
