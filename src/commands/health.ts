/**
 * Health command - View health data summary
 */

import type { Command } from "commander";
import { getDataSource } from "../tools/health-data.js";
import type { HealthDataSource, WorkoutData } from "../data-sources/interface.js";
import {
  printHeader,
  printSection,
  printKV,
  printDivider,
  printTable,
  c,
  icons,
  formatNumber,
  miniChart,
  progressBar,
  Spinner,
} from "../utils/cli-ui.js";

export function registerHealthCommand(program: Command): void {
  program
    .command("health")
    .description("View health data summary")
    .option("-d, --date <string>", "Date in YYYY-MM-DD format", "today")
    .option("--json", "Output as JSON")
    .option("-w, --weekly", "Show weekly summary")
    .action(async (options) => {
      const dataSource = getDataSource();

      const date = options.date === "today" ? new Date().toISOString().split("T")[0] : options.date;

      if (options.weekly) {
        await showWeeklySummary(dataSource, date, options.json);
      } else {
        await showDailySummary(dataSource, date, options.json);
      }
      process.exit(0);
    });
}

async function showDailySummary(
  dataSource: HealthDataSource,
  date: string,
  json: boolean
): Promise<void> {
  const spinner = new Spinner("Loading health data...");
  if (!json) spinner.start();

  const [metrics, heartRate, sleep, workouts] = await Promise.all([
    dataSource.getMetrics(date),
    dataSource.getHeartRate(date),
    dataSource.getSleep(date),
    dataSource.getWorkouts(date),
  ]);

  if (!json) spinner.stop("success");

  const data = {
    date,
    metrics,
    heartRate: {
      resting: heartRate.restingAvg,
      min: heartRate.minToday,
      max: heartRate.maxToday,
    },
    sleep: sleep
      ? {
          duration: sleep.durationHours,
          quality: sleep.qualityScore,
          bedTime: sleep.bedTime,
          wakeTime: sleep.wakeTime,
          stages: sleep.stages,
        }
      : null,
    workouts: workouts.map((w: WorkoutData) => ({
      type: w.type,
      duration: w.durationMinutes,
      calories: w.caloriesBurned,
    })),
  };

  if (json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  console.log("");
  printHeader(`${icons.health} Health Summary`, date);

  // Activity Section
  printSection("Activity", icons.activity);
  const stepsGoal = 10000;
  const _stepsPercent = Math.min(100, Math.round((metrics.steps / stepsGoal) * 100));
  printKV(
    "Steps",
    `${c.bold(formatNumber(metrics.steps))} ${c.dim(`/ ${formatNumber(stepsGoal)}`)} ${progressBar(metrics.steps, stepsGoal, 15)}`
  );
  printKV("Calories", `${c.bold(formatNumber(metrics.calories))} ${c.dim("kcal")}`);
  printKV("Active Time", `${c.bold(String(metrics.activeMinutes))} ${c.dim("min")}`);
  printKV("Distance", `${c.bold((metrics.distance / 1000).toFixed(2))} ${c.dim("km")}`);

  // Heart Rate Section
  printSection("Heart Rate", icons.heart);
  const hrData =
    heartRate.readings.map((r) => r.value) ||
    Array(24)
      .fill(0)
      .map((_, i) => 60 + Math.sin(i) * 10);
  printKV("Resting", `${c.bold(String(heartRate.restingAvg))} ${c.dim("bpm")}`);
  printKV(
    "Range",
    `${c.cyan(String(heartRate.minToday))} ${c.dim("-")} ${c.red(String(heartRate.maxToday))} ${c.dim("bpm")}`
  );
  printKV("Today", c.cyan(miniChart(hrData)));

  // Sleep Section
  printSection("Sleep", icons.sleep);
  if (sleep) {
    const sleepGoal = 8;
    printKV(
      "Duration",
      `${c.bold(String(sleep.durationHours))} ${c.dim("hours")} ${progressBar(sleep.durationHours, sleepGoal, 10)}`
    );
    printKV(
      "Quality",
      `${c.bold(String(sleep.qualityScore))}${c.dim("%")} ${getQualityLabel(sleep.qualityScore)}`
    );
    printKV("Time", `${c.dim(`${sleep.bedTime} → `)}${sleep.wakeTime}`);

    // Sleep stages breakdown
    const total =
      sleep.stages.deep + sleep.stages.light + sleep.stages.rem + (sleep.stages.awake || 0);
    const stageBar = (val: number, color: (s: string) => string) => {
      const width = Math.round((val / total) * 20);
      return color("█".repeat(width));
    };
    console.log("");
    printKV(
      "Stages",
      [
        stageBar(sleep.stages.deep, c.blue) + c.dim(` Deep ${sleep.stages.deep}m`),
        stageBar(sleep.stages.light, c.cyan) + c.dim(` Light ${sleep.stages.light}m`),
        stageBar(sleep.stages.rem, c.magenta) + c.dim(` REM ${sleep.stages.rem}m`),
      ].join("  ")
    );
  } else {
    console.log(`  ${c.dim("No sleep data recorded")}`);
  }

  // Workouts Section
  printSection("Workouts", "💪");
  if (workouts.length > 0) {
    printTable(
      ["Type", "Duration", "Calories"],
      workouts.map((w: WorkoutData) => [
        w.type,
        `${w.durationMinutes} min`,
        `${w.caloriesBurned} kcal`,
      ])
    );
  } else {
    console.log(`  ${c.dim("No workouts recorded today")}`);
  }

  console.log("");
  printDivider();
  console.log(`  ${c.dim("Tip: Use")} ${c.cyan("pha health -w")} ${c.dim("for weekly summary")}`);
  console.log("");
}

function getQualityLabel(score: number): string {
  if (score >= 85) return c.green("Excellent");
  if (score >= 70) return c.cyan("Good");
  if (score >= 50) return c.yellow("Fair");
  return c.red("Poor");
}

async function showWeeklySummary(
  dataSource: HealthDataSource,
  endDate: string,
  json: boolean
): Promise<void> {
  const spinner = new Spinner("Loading weekly data...");
  if (!json) spinner.start();

  const [weeklySteps, weeklySleep] = await Promise.all([
    dataSource.getWeeklySteps(endDate),
    dataSource.getWeeklySleep(endDate),
  ]);

  if (!json) spinner.stop("success");

  const totalSteps = weeklySteps.reduce(
    (sum: number, d: { date: string; steps: number }) => sum + d.steps,
    0
  );
  const avgSteps = Math.round(totalSteps / weeklySteps.length);
  const avgSleep =
    weeklySleep.reduce((sum: number, d: { date: string; hours: number }) => sum + d.hours, 0) /
    weeklySleep.length;

  const data = {
    period: {
      end: endDate,
      days: weeklySteps.length,
    },
    steps: {
      total: totalSteps,
      average: avgSteps,
      daily: weeklySteps,
    },
    sleep: {
      averageHours: Math.round(avgSleep * 10) / 10,
      daily: weeklySleep,
    },
  };

  if (json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  console.log("");
  printHeader(`${icons.health} Weekly Summary`, `Ending ${endDate}`);

  // Steps Section
  printSection("Steps", icons.steps);
  printKV("Total", `${c.bold(formatNumber(totalSteps))} ${c.dim("steps")}`);
  printKV("Daily Avg", `${c.bold(formatNumber(avgSteps))} ${c.dim("steps / day")}`);

  // Steps chart
  const maxSteps = Math.max(...weeklySteps.map((d: { date: string; steps: number }) => d.steps));
  console.log("");
  for (const d of weeklySteps) {
    const dayName = new Date(d.date).toLocaleDateString("en", { weekday: "short" });
    const barWidth = Math.round((d.steps / maxSteps) * 30);
    const bar = c.green("█".repeat(barWidth)) + c.dim("░".repeat(30 - barWidth));
    const stepsStr = formatNumber(d.steps).padStart(6);
    const highlight = d.steps >= 10000 ? c.green("✓") : " ";
    console.log(`  ${c.dim(dayName)} ${bar} ${stepsStr} ${highlight}`);
  }

  // Sleep Section
  printSection("Sleep", icons.sleep);
  printKV("Avg Duration", `${c.bold(avgSleep.toFixed(1))} ${c.dim("hours / night")}`);

  // Sleep chart
  const maxSleep = Math.max(...weeklySleep.map((d: { date: string; hours: number }) => d.hours));
  console.log("");
  for (const d of weeklySleep) {
    const dayName = new Date(d.date).toLocaleDateString("en", { weekday: "short" });
    const barWidth = Math.round((d.hours / maxSleep) * 30);
    const bar = c.blue("█".repeat(barWidth)) + c.dim("░".repeat(30 - barWidth));
    const hoursStr = `${d.hours}h`.padStart(5);
    const highlight = d.hours >= 7 ? c.green("✓") : d.hours < 6 ? c.yellow("!") : " ";
    console.log(`  ${c.dim(dayName)} ${bar} ${hoursStr} ${highlight}`);
  }

  console.log("");
  printDivider();
  console.log(
    `  ${c.dim("Legend:")} ${c.green("✓")} ${c.dim("Goal met")}  ${c.yellow("!")} ${c.dim("Below target")}`
  );
  console.log("");
}
