/**
 * Health Context Pre-computation
 *
 * Fetches recent health data and generates a summary for injection
 * into the system prompt. This gives the agent immediate context
 * without needing tool calls in the first turn.
 */

import type {
  HealthDataSource,
  HealthMetrics,
  BodyCompositionData,
} from "../data-sources/interface.js";
import { getDataSource } from "../tools/health-data.js";
import { listPlans, savePlan } from "../plans/store.js";
import type { HealthPlan, GoalStatus } from "../plans/types.js";
import { listRecommendations, listReminders, listCalendarEvents } from "../proactive/store.js";
import { getUserUuid, loadConfig, type PHAConfig } from "../utils/config.js";
import { loadProfileFromFile } from "../memory/profile.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("Agent/HealthContext");

/**
 * @deprecated Health context is no longer injected into the system prompt.
 * The agent now uses health tools on demand. This function is kept for
 * backward compatibility (e.g., plan auto-sync) but should not be called
 * for system prompt construction.
 *
 * Pre-compute a 7-day health context summary.
 * Best-effort: returns empty string if data fetching fails.
 * @param dataSource - Optional user-specific data source; falls back to global.
 * @param userUuid - Optional user UUID for plan lookup; falls back to getUserUuid().
 */
/** Compute the Monday-based week start for a given date string */
function computeWeekStart(today: string): string {
  const todayDate = new Date(`${today}T00:00:00`);
  const dayOfWeek = todayDate.getDay();
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const weekStart = new Date(todayDate);
  weekStart.setDate(todayDate.getDate() - mondayOffset);
  return weekStart.toISOString().split("T")[0];
}

/** Fetch all health data in parallel */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAllHealthData(
  source: HealthDataSource,
  today: string,
  weekStartStr: string
): Promise<any[]> {
  return Promise.all([
    source.getWeeklySteps(today).catch(() => []),
    source.getWeeklySleep(today).catch(() => []),
    source.getHeartRate(today).catch(() => null),
    source.getWorkouts(today).catch(() => []),
    source.getWorkoutsRange?.(weekStartStr, today).catch(() => []) ?? Promise.resolve([]),
    source.getStress?.(today).catch(() => null) ?? Promise.resolve(null),
    source.getSpO2?.(today).catch(() => null) ?? Promise.resolve(null),
    source.getBloodPressure?.(today).catch(() => null) ?? Promise.resolve(null),
    source.getBloodGlucose?.(today).catch(() => null) ?? Promise.resolve(null),
    source.getBodyTemperature?.(today).catch(() => null) ?? Promise.resolve(null),
    source.getMetrics(today).catch(() => null),
    source.getBodyComposition?.(today).catch(() => null) ?? Promise.resolve(null),
  ]);
}

function buildActivitySection(weeklySteps: Array<{ date: string; steps: number }>): string | null {
  if (weeklySteps.length === 0) return null;

  const totalSteps = weeklySteps.reduce((sum, d) => sum + d.steps, 0);
  const avgSteps = Math.round(totalSteps / weeklySteps.length);
  const daysAbove8k = weeklySteps.filter((d) => d.steps >= 8000).length;

  let trend = "";
  if (weeklySteps.length >= 6) {
    const recentAvg = Math.round(weeklySteps.slice(-3).reduce((s, d) => s + d.steps, 0) / 3);
    const earlierAvg = Math.round(weeklySteps.slice(0, 3).reduce((s, d) => s + d.steps, 0) / 3);
    if (earlierAvg > 0) {
      const pct = Math.round(((recentAvg - earlierAvg) / earlierAvg) * 100);
      if (pct > 10) trend = ` (trending up ~${pct}%)`;
      else if (pct < -10) trend = ` (trending down ~${Math.abs(pct)}%)`;
      else trend = " (stable)";
    }
  }

  return `**Activity**: Avg ${avgSteps.toLocaleString()} steps/day, goal reached ${daysAbove8k}/${weeklySteps.length} days${trend}`;
}

function buildSleepSection(weeklySleep: Array<{ date: string; hours: number }>): string | null {
  const sleepDays = weeklySleep.filter((d) => d.hours > 0);
  if (sleepDays.length === 0) return null;

  const avgSleep =
    Math.round((sleepDays.reduce((s, d) => s + d.hours, 0) / sleepDays.length) * 10) / 10;
  const minSleep = Math.min(...sleepDays.map((d) => d.hours));
  const maxSleep = Math.max(...sleepDays.map((d) => d.hours));
  const spread = Math.round((maxSleep - minSleep) * 10) / 10;

  let consistency = "";
  if (spread <= 1) consistency = ", consistent";
  else if (spread <= 2) consistency = ", some variation";
  else consistency = `, inconsistent (${minSleep}h-${maxSleep}h range)`;

  return `**Sleep**: Avg ${avgSleep}h/night over ${sleepDays.length} days${consistency}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildVitalsSection(
  todayHR: any,
  todayStress: any,
  todaySpO2: any,
  todayBP: any,
  todayGlucose: any,
  todayTemp: any
): string[] {
  const sections: string[] = [];
  if (todayHR) {
    sections.push(
      `**Heart Rate (today)**: Resting avg ${todayHR.restingAvg} bpm, range ${todayHR.minToday}-${todayHR.maxToday} bpm`
    );
  }
  if (todayStress) {
    sections.push(
      `**Stress (today)**: Current ${todayStress.current}, avg ${todayStress.avg}, range ${todayStress.min}-${todayStress.max}`
    );
  }
  if (todaySpO2) {
    sections.push(
      `**SpO2 (today)**: Current ${todaySpO2.current}%, avg ${todaySpO2.avg}%, range ${todaySpO2.min}-${todaySpO2.max}%`
    );
  }
  if (todayBP) {
    sections.push(
      `**Blood Pressure (today)**: ${todayBP.latestSystolic}/${todayBP.latestDiastolic} mmHg`
    );
  }
  if (todayGlucose) {
    sections.push(`**Blood Glucose (today)**: ${todayGlucose.latest} mmol/L`);
  }
  if (todayTemp) {
    sections.push(`**Body Temperature (today)**: ${todayTemp.latest}\u00B0C`);
  }
  return sections;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildWorkoutSection(todayWorkouts: any[]): string {
  if (todayWorkouts.length > 0) {
    const descs = todayWorkouts.map((w) => {
      let desc = `${w.type} ${w.durationMinutes}min`;
      if (w.distanceKm) desc += ` ${w.distanceKm}km`;
      return desc;
    });
    return `**Workouts (today)**: ${descs.join(", ")}`;
  }
  return "**Workouts (today)**: None recorded";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function collectInsights(
  weeklySteps: any[],
  weeklySleep: any[],
  todayHR: any,
  todayStress: any,
  todaySpO2: any,
  todayBP: any,
  todayGlucose: any,
  todayTemp: any
): string[] {
  const insights: string[] = [];
  const sleepDays = weeklySleep.filter((d: { hours: number }) => d.hours > 0);

  if (sleepDays.length >= 5) {
    const avgSleep =
      sleepDays.reduce((s: number, d: { hours: number }) => s + d.hours, 0) / sleepDays.length;
    if (avgSleep < 6)
      insights.push("Sleep duration has been consistently below 6 hours — worth discussing.");
  }
  if (weeklySteps.length >= 5) {
    const last2 = weeklySteps.slice(-2);
    if (last2.filter((d: { steps: number }) => d.steps < 2000).length >= 2) {
      insights.push("Activity has been very low the past 2 days.");
    }
  }
  if (todayHR && todayHR.restingAvg > 90)
    insights.push("Today's resting heart rate is elevated (>90 bpm).");
  if (todayStress && todayStress.avg > 60)
    insights.push("Today's average stress level is high (>60).");
  if (todaySpO2 && todaySpO2.avg < 95)
    insights.push("Today's blood oxygen is below normal (<95%).");
  if (todayBP && (todayBP.latestSystolic > 140 || todayBP.latestDiastolic > 90)) {
    insights.push("Blood pressure is elevated (>140/90 mmHg).");
  }
  if (todayGlucose && todayGlucose.latest > 7.0)
    insights.push("Blood glucose is elevated (>7.0 mmol/L fasting).");
  if (todayTemp && todayTemp.latest > 37.5)
    insights.push("Body temperature is elevated (>37.5\u00B0C).");
  return insights;
}

function buildPlansSection(
  userUuid: string | undefined,
  today: string,
  data: HealthSnapshot
): string {
  try {
    const uuid = userUuid || getUserUuid();
    const activePlans = listPlans(uuid, "active");
    if (activePlans.length === 0) return "";

    autoSyncPlanProgress(activePlans, uuid, today, data);

    let result = "\n\n## Active Health Plans\n";
    for (const plan of activePlans) {
      const done = plan.goals.filter((g) => g.status === "completed").length;
      result += `\n- **${plan.name}** (${plan.startDate} ~ ${plan.endDate}): ${done}/${plan.goals.length} goals completed`;
      for (const goal of plan.goals) {
        const current = goal.currentValue;
        const pct = current != null ? Math.round((current / goal.targetValue) * 100) : 0;
        const arrowMap: Record<string, string> = {
          completed: "\u2191",
          ahead: "\u2191",
          behind: "\u2193",
        };
        const arrow = arrowMap[goal.status] ?? "\u2192";
        result += `\n  - ${goal.label}: target ${goal.targetValue}${goal.unit}, current ${current ?? "?"}${goal.unit} (${pct}%) \u2192 ${goal.status} ${arrow}`;
      }
    }
    result +=
      "\n\nWhen discussing health topics related to an active plan, mention the user's plan progress.";
    return result;
  } catch {
    return "";
  }
}

function buildProactiveSection(userUuid: string | undefined): string {
  try {
    const uuid = userUuid || getUserUuid();
    const activeRecs = listRecommendations(uuid, "active");
    const pendingReminders = listReminders(uuid, "pending");
    const now = new Date().toISOString();
    const weekLater = new Date(Date.now() + 7 * 86400000).toISOString();
    const upcomingEvents = listCalendarEvents(uuid, {
      from: now,
      to: weekLater,
      status: "scheduled",
    });

    if (activeRecs.length === 0 && pendingReminders.length === 0 && upcomingEvents.length === 0) {
      return "";
    }

    let result = "\n\n## Proactive Items\n";
    if (activeRecs.length > 0) {
      result += `\n**Recommendations** (${activeRecs.length} active):`;
      for (const rec of activeRecs.slice(0, 5))
        result += `\n- [${rec.priority}] ${rec.title}: ${rec.body}`;
    }
    if (pendingReminders.length > 0) {
      result += `\n**Reminders** (${pendingReminders.length} pending):`;
      for (const rem of pendingReminders.slice(0, 5)) {
        const time = rem.scheduledAt.split("T")[1]?.slice(0, 5) || rem.scheduledAt;
        result += `\n- ${rem.title} @ ${time} (${rem.repeatRule})`;
      }
    }
    if (upcomingEvents.length > 0) {
      result += `\n**Upcoming Events** (next 7 days):`;
      for (const evt of upcomingEvents.slice(0, 5)) {
        result += `\n- ${evt.title} \u2014 ${evt.startTime.split("T")[0]} ${evt.startTime.split("T")[1]?.slice(0, 5) || ""}`;
      }
    }
    result += "\n\nReference these proactive items when relevant to the conversation.";
    return result;
  } catch {
    return "";
  }
}

export async function preComputeHealthContext(
  dataSource?: HealthDataSource,
  userUuid?: string
): Promise<string> {
  try {
    const source = dataSource || getDataSource();
    const today = new Date().toISOString().split("T")[0];
    const weekStartStr = computeWeekStart(today);

    const [
      weeklySteps,
      weeklySleep,
      todayHR,
      todayWorkouts,
      weeklyWorkouts,
      todayStress,
      todaySpO2,
      todayBP,
      todayGlucose,
      todayTemp,
      todayMetrics,
      todayBodyComp,
    ] = await fetchAllHealthData(source, today, weekStartStr);

    const sections: string[] = [];
    const activity = buildActivitySection(weeklySteps);
    if (activity) sections.push(activity);
    const sleep = buildSleepSection(weeklySleep);
    if (sleep) sections.push(sleep);
    sections.push(
      ...buildVitalsSection(todayHR, todayStress, todaySpO2, todayBP, todayGlucose, todayTemp)
    );
    sections.push(buildWorkoutSection(todayWorkouts));

    if (sections.length === 0) return "";

    const insights = collectInsights(
      weeklySteps,
      weeklySleep,
      todayHR,
      todayStress,
      todaySpO2,
      todayBP,
      todayGlucose,
      todayTemp
    );
    const dateRange =
      weeklySteps.length > 0
        ? `${weeklySteps[0].date} to ${weeklySteps[weeklySteps.length - 1].date}`
        : `past 7 days`;

    let result = `\n## Recent Health Context (${dateRange})\n\n${sections.join("\n")}`;
    if (insights.length > 0) result += `\n\n**Insights**: ${insights.join(" ")}`;

    const snapshot: HealthSnapshot = {
      weeklySteps,
      weeklySleep,
      todayHR,
      todayWorkouts,
      weeklyWorkouts,
      todayMetrics,
      todayBodyComp,
    };
    result += buildPlansSection(userUuid, today, snapshot);
    result += buildProactiveSection(userUuid);

    return result;
  } catch (e) {
    log.warn("Pre-computation failed", { error: String(e) });
    return "";
  }
}

// ============================================================================
// Weather Context (optional, best-effort)
// ============================================================================

/**
 * Fetch weather context from wttr.in (free, no API key).
 * Returns a formatted string like `- **天气**: 5°C，多云，湿度 65%`
 * or empty string on failure. 3 second timeout.
 */
export async function fetchWeatherContext(userUuid?: string): Promise<string> {
  try {
    // Resolve location: user profile → config → skip
    let location: string | undefined;

    if (userUuid) {
      try {
        const profile = loadProfileFromFile(userUuid);
        if (profile.location) location = profile.location;
      } catch {
        /* ignore */
      }
    }

    const config = loadConfig() as PHAConfig;
    const contextConfig = config.context;
    if (!location) location = contextConfig?.location;

    if (!location) return "";

    const weatherApiBase: string = contextConfig?.weatherApiBaseUrl ?? "https://wttr.in";
    const url = `${weatherApiBase}/${encodeURIComponent(location)}?format=j1`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!resp.ok) return "";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await resp.json()) as any;
    const current = data?.current_condition?.[0];
    if (!current) return "";

    const tempC = current.temp_C;
    const desc = current.lang_zh?.[0]?.value || current.weatherDesc?.[0]?.value || "";
    const humidity = current.humidity;

    return `- **天气**: ${tempC}°C，${desc}，湿度 ${humidity}%`;
  } catch {
    // Network error, timeout, parse error — all silently degrade
    return "";
  }
}

// ============================================================================
// Auto-sync plan progress with latest health data
// ============================================================================

export interface HealthSnapshot {
  weeklySteps: Array<{ date: string; steps: number }>;
  weeklySleep: Array<{ date: string; hours: number }>;
  todayHR: { restingAvg: number } | null;
  todayWorkouts: Array<{ durationMinutes: number }>;
  weeklyWorkouts: Array<{ durationMinutes: number }>;
  todayMetrics: HealthMetrics | null;
  todayBodyComp: BodyCompositionData | null;
}

export function autoSyncPlanProgress(
  plans: HealthPlan[],
  uuid: string,
  today: string,
  data: HealthSnapshot
): void {
  for (const plan of plans) {
    let changed = false;

    for (const goal of plan.goals) {
      // Skip custom metrics — need manual update
      if (goal.metric === "custom") continue;

      // Skip if today already has a progress entry for this goal
      const alreadySynced = plan.progress.some((p) => p.goalId === goal.id && p.date === today);
      if (alreadySynced) continue;

      const value = resolveMetricValue(goal.metric, goal.frequency, data);
      if (value == null) continue;

      // Add progress entry
      plan.progress.push({
        date: today,
        goalId: goal.id,
        actualValue: value,
        targetValue: goal.targetValue,
        note: "auto-sync",
      });

      // Update current value and status
      goal.currentValue = value;
      goal.status = computeGoalStatus(value, goal.targetValue);
      changed = true;
    }

    if (changed) {
      savePlan(uuid, plan);
    }
  }
}

function resolveSteps(frequency: "daily" | "weekly", data: HealthSnapshot): number | null {
  if (data.weeklySteps.length === 0) return null;
  if (frequency === "weekly") {
    return Math.round(data.weeklySteps.reduce((s, d) => s + d.steps, 0) / data.weeklySteps.length);
  }
  return data.weeklySteps[data.weeklySteps.length - 1].steps;
}

function resolveSleepHours(frequency: "daily" | "weekly", data: HealthSnapshot): number | null {
  const sleepDays = data.weeklySleep.filter((d) => d.hours > 0);
  if (sleepDays.length === 0) return null;
  if (frequency === "weekly") {
    return Math.round((sleepDays.reduce((s, d) => s + d.hours, 0) / sleepDays.length) * 10) / 10;
  }
  return sleepDays[sleepDays.length - 1].hours;
}

function resolveMetricValue(
  metric: string,
  frequency: "daily" | "weekly",
  data: HealthSnapshot
): number | null {
  switch (metric) {
    case "steps":
      return resolveSteps(frequency, data);
    case "sleep_hours":
      return resolveSleepHours(frequency, data);
    case "exercise_count":
      return frequency === "weekly" ? data.weeklyWorkouts.length : data.todayWorkouts.length;
    case "heart_rate_resting":
      return data.todayHR?.restingAvg ?? null;
    case "weight":
      return data.todayBodyComp?.weight ?? null;
    case "calories":
      return data.todayMetrics?.calories ?? null;
    case "active_minutes":
      return data.todayMetrics?.activeMinutes ?? null;
    default:
      return null;
  }
}

function computeGoalStatus(currentValue: number, targetValue: number): GoalStatus {
  const ratio = currentValue / targetValue;
  if (ratio >= 1) return "completed";
  if (ratio >= 0.9) return "ahead";
  if (ratio >= 0.6) return "on_track";
  return "behind";
}
