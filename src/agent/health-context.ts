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
export async function preComputeHealthContext(
  dataSource?: HealthDataSource,
  userUuid?: string
): Promise<string> {
  try {
    const source = dataSource || getDataSource();
    const today = new Date().toISOString().split("T")[0];

    // Compute week start (Monday) for weekly workout range
    const todayDate = new Date(`${today}T00:00:00`);
    const dayOfWeek = todayDate.getDay(); // 0=Sun, 1=Mon, ...
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const weekStart = new Date(todayDate);
    weekStart.setDate(todayDate.getDate() - mondayOffset);
    const weekStartStr = weekStart.toISOString().split("T")[0];

    // Fetch data in parallel (including stress, SpO2, and new health types if available)
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
    ] = await Promise.all([
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

    const sections: string[] = [];

    // --- Activity Summary ---
    if (weeklySteps.length > 0) {
      const totalSteps = weeklySteps.reduce((sum, d) => sum + d.steps, 0);
      const avgSteps = Math.round(totalSteps / weeklySteps.length);
      const daysAbove8k = weeklySteps.filter((d) => d.steps >= 8000).length;

      // Trend: compare last 3 days to first 3 days
      const recentAvg =
        weeklySteps.length >= 6
          ? Math.round(weeklySteps.slice(-3).reduce((s, d) => s + d.steps, 0) / 3)
          : null;
      const earlierAvg =
        weeklySteps.length >= 6
          ? Math.round(weeklySteps.slice(0, 3).reduce((s, d) => s + d.steps, 0) / 3)
          : null;

      let trend = "";
      if (recentAvg && earlierAvg && earlierAvg > 0) {
        const pctChange = Math.round(((recentAvg - earlierAvg) / earlierAvg) * 100);
        if (pctChange > 10) trend = ` (trending up ~${pctChange}%)`;
        else if (pctChange < -10) trend = ` (trending down ~${Math.abs(pctChange)}%)`;
        else trend = " (stable)";
      }

      sections.push(
        `**Activity**: Avg ${avgSteps.toLocaleString()} steps/day, goal reached ${daysAbove8k}/${weeklySteps.length} days${trend}`
      );
    }

    // --- Sleep Summary ---
    const sleepDays = weeklySleep.filter((d) => d.hours > 0);
    if (sleepDays.length > 0) {
      const avgSleep =
        Math.round((sleepDays.reduce((s, d) => s + d.hours, 0) / sleepDays.length) * 10) / 10;
      const minSleep = Math.min(...sleepDays.map((d) => d.hours));
      const maxSleep = Math.max(...sleepDays.map((d) => d.hours));
      const spread = Math.round((maxSleep - minSleep) * 10) / 10;

      let consistency = "";
      if (spread <= 1) consistency = ", consistent";
      else if (spread <= 2) consistency = ", some variation";
      else consistency = `, inconsistent (${minSleep}h-${maxSleep}h range)`;

      sections.push(
        `**Sleep**: Avg ${avgSleep}h/night over ${sleepDays.length} days${consistency}`
      );
    }

    // --- Heart Rate ---
    if (todayHR) {
      sections.push(
        `**Heart Rate (today)**: Resting avg ${todayHR.restingAvg} bpm, range ${todayHR.minToday}-${todayHR.maxToday} bpm`
      );
    }

    // --- Stress ---
    if (todayStress) {
      sections.push(
        `**Stress (today)**: Current ${todayStress.current}, avg ${todayStress.avg}, range ${todayStress.min}-${todayStress.max}`
      );
    }

    // --- SpO2 ---
    if (todaySpO2) {
      sections.push(
        `**SpO2 (today)**: Current ${todaySpO2.current}%, avg ${todaySpO2.avg}%, range ${todaySpO2.min}-${todaySpO2.max}%`
      );
    }

    // --- Blood Pressure ---
    if (todayBP) {
      sections.push(
        `**Blood Pressure (today)**: ${todayBP.latestSystolic}/${todayBP.latestDiastolic} mmHg`
      );
    }

    // --- Blood Glucose ---
    if (todayGlucose) {
      sections.push(`**Blood Glucose (today)**: ${todayGlucose.latest} mmol/L`);
    }

    // --- Body Temperature ---
    if (todayTemp) {
      sections.push(`**Body Temperature (today)**: ${todayTemp.latest}\u00B0C`);
    }

    // --- Today's Workouts ---
    if (todayWorkouts.length > 0) {
      const workoutDescs = todayWorkouts.map((w) => {
        let desc = `${w.type} ${w.durationMinutes}min`;
        if (w.distanceKm) desc += ` ${w.distanceKm}km`;
        return desc;
      });
      sections.push(`**Workouts (today)**: ${workoutDescs.join(", ")}`);
    } else {
      sections.push("**Workouts (today)**: None recorded");
    }

    if (sections.length === 0) {
      return "";
    }

    // --- Insights ---
    const insights: string[] = [];

    // Insight: sleep consistency
    if (sleepDays.length >= 5) {
      const avgSleep = sleepDays.reduce((s, d) => s + d.hours, 0) / sleepDays.length;
      if (avgSleep < 6) {
        insights.push("Sleep duration has been consistently below 6 hours — worth discussing.");
      }
    }

    // Insight: activity drop
    if (weeklySteps.length >= 5) {
      const last2 = weeklySteps.slice(-2);
      const zeroOrVeryLow = last2.filter((d) => d.steps < 2000);
      if (zeroOrVeryLow.length >= 2) {
        insights.push("Activity has been very low the past 2 days.");
      }
    }

    // Insight: elevated HR
    if (todayHR && todayHR.restingAvg > 90) {
      insights.push("Today's resting heart rate is elevated (>90 bpm).");
    }

    // Insight: high stress
    if (todayStress && todayStress.avg > 60) {
      insights.push("Today's average stress level is high (>60).");
    }

    // Insight: low SpO2
    if (todaySpO2 && todaySpO2.avg < 95) {
      insights.push("Today's blood oxygen is below normal (<95%).");
    }

    // Insight: elevated blood pressure
    if (todayBP && (todayBP.latestSystolic > 140 || todayBP.latestDiastolic > 90)) {
      insights.push("Blood pressure is elevated (>140/90 mmHg).");
    }

    // Insight: elevated blood glucose
    if (todayGlucose && todayGlucose.latest > 7.0) {
      insights.push("Blood glucose is elevated (>7.0 mmol/L fasting).");
    }

    // Insight: elevated body temperature
    if (todayTemp && todayTemp.latest > 37.5) {
      insights.push("Body temperature is elevated (>37.5\u00B0C).");
    }

    const dateRange =
      weeklySteps.length > 0
        ? `${weeklySteps[0].date} to ${weeklySteps[weeklySteps.length - 1].date}`
        : `past 7 days`;

    let result = `\n## Recent Health Context (${dateRange})\n\n${sections.join("\n")}`;

    if (insights.length > 0) {
      result += `\n\n**Insights**: ${insights.join(" ")}`;
    }

    // --- Active Health Plans (auto-sync + enhanced display) ---
    try {
      const uuid = userUuid || getUserUuid();
      const activePlans = listPlans(uuid, "active");

      // Auto-sync plan progress with latest health data
      if (activePlans.length > 0) {
        autoSyncPlanProgress(activePlans, uuid, today, {
          weeklySteps,
          weeklySleep,
          todayHR,
          todayWorkouts,
          weeklyWorkouts,
          todayMetrics,
          todayBodyComp,
        });
      }

      if (activePlans.length > 0) {
        result += "\n\n## Active Health Plans\n";
        for (const plan of activePlans) {
          const done = plan.goals.filter((g) => g.status === "completed").length;
          result += `\n- **${plan.name}** (${plan.startDate} ~ ${plan.endDate}): ${done}/${plan.goals.length} goals completed`;
          for (const goal of plan.goals) {
            const current = goal.currentValue;
            const pct = current != null ? Math.round((current / goal.targetValue) * 100) : 0;
            const arrowMap: Record<string, string> = { completed: "↑", ahead: "↑", behind: "↓" };
            const arrow = arrowMap[goal.status] ?? "→";
            result += `\n  - ${goal.label}: target ${goal.targetValue}${goal.unit}, current ${current ?? "?"}${goal.unit} (${pct}%) → ${goal.status} ${arrow}`;
          }
        }
        result +=
          "\n\nWhen discussing health topics related to an active plan, mention the user's plan progress.";
      }
    } catch {
      // Plans not available — ignore
    }

    // --- Proactive Items (recommendations, reminders, calendar) ---
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

      if (activeRecs.length > 0 || pendingReminders.length > 0 || upcomingEvents.length > 0) {
        result += "\n\n## Proactive Items\n";

        if (activeRecs.length > 0) {
          result += `\n**Recommendations** (${activeRecs.length} active):`;
          for (const rec of activeRecs.slice(0, 5)) {
            result += `\n- [${rec.priority}] ${rec.title}: ${rec.body}`;
          }
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
            const date = evt.startTime.split("T")[0];
            const time = evt.startTime.split("T")[1]?.slice(0, 5) || "";
            result += `\n- ${evt.title} — ${date} ${time}`;
          }
        }

        result += "\n\nReference these proactive items when relevant to the conversation.";
      }
    } catch {
      // Proactive items not available — ignore
    }

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

function resolveMetricValue(
  metric: string,
  frequency: "daily" | "weekly",
  data: HealthSnapshot
): number | null {
  switch (metric) {
    case "steps": {
      if (data.weeklySteps.length === 0) return null;
      if (frequency === "weekly") {
        const total = data.weeklySteps.reduce((s, d) => s + d.steps, 0);
        return Math.round(total / data.weeklySteps.length);
      }
      // daily: last entry (today or most recent)
      return data.weeklySteps[data.weeklySteps.length - 1].steps;
    }
    case "sleep_hours": {
      const sleepDays = data.weeklySleep.filter((d) => d.hours > 0);
      if (sleepDays.length === 0) return null;
      if (frequency === "weekly") {
        return (
          Math.round((sleepDays.reduce((s, d) => s + d.hours, 0) / sleepDays.length) * 10) / 10
        );
      }
      return sleepDays[sleepDays.length - 1].hours;
    }
    case "exercise_count": {
      if (frequency === "weekly") {
        // Count workout sessions across the entire week
        return data.weeklyWorkouts.length;
      }
      return data.todayWorkouts.length;
    }
    case "heart_rate_resting":
      return data.todayHR?.restingAvg ?? null;
    case "weight":
      return data.todayBodyComp?.weight ?? null;
    case "calories":
      if (!data.todayMetrics) return null;
      if (frequency === "weekly") return data.todayMetrics.calories; // best available
      return data.todayMetrics.calories;
    case "active_minutes":
      if (!data.todayMetrics) return null;
      if (frequency === "weekly") return data.todayMetrics.activeMinutes;
      return data.todayMetrics.activeMinutes;
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
