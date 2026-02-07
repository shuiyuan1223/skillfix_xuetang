/**
 * Health Context Pre-computation
 *
 * Fetches recent health data and generates a summary for injection
 * into the system prompt. This gives the agent immediate context
 * without needing tool calls in the first turn.
 */

import type { HealthDataSource } from "../data-sources/interface.js";
import { getDataSource } from "../tools/health-data.js";

/**
 * Pre-compute a 7-day health context summary for the system prompt.
 * Best-effort: returns empty string if data fetching fails.
 * @param dataSource - Optional user-specific data source; falls back to global.
 */
export async function preComputeHealthContext(dataSource?: HealthDataSource): Promise<string> {
  try {
    const source = dataSource || getDataSource();
    const today = new Date().toISOString().split("T")[0];

    // Fetch data in parallel (including stress, SpO2, and new health types if available)
    const [
      weeklySteps,
      weeklySleep,
      todayHR,
      todayWorkouts,
      todayStress,
      todaySpO2,
      todayBP,
      todayGlucose,
      todayTemp,
    ] = await Promise.all([
      source.getWeeklySteps(today).catch(() => []),
      source.getWeeklySleep(today).catch(() => []),
      source.getHeartRate(today).catch(() => null),
      source.getWorkouts(today).catch(() => []),
      source.getStress?.(today).catch(() => null) ?? Promise.resolve(null),
      source.getSpO2?.(today).catch(() => null) ?? Promise.resolve(null),
      source.getBloodPressure?.(today).catch(() => null) ?? Promise.resolve(null),
      source.getBloodGlucose?.(today).catch(() => null) ?? Promise.resolve(null),
      source.getBodyTemperature?.(today).catch(() => null) ?? Promise.resolve(null),
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

    return result;
  } catch (e) {
    console.warn("[Health Context] Pre-computation failed:", e);
    return "";
  }
}
