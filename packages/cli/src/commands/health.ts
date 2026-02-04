/**
 * Health command - View health data summary
 */

import type { Command } from "commander";
import { getDataSource } from "@pha/core";

export function registerHealthCommand(program: Command): void {
  program
    .command("health")
    .description("View health data summary")
    .option("-d, --date <string>", "Date in YYYY-MM-DD format", "today")
    .option("--json", "Output as JSON")
    .option("-w, --weekly", "Show weekly summary")
    .action(async (options) => {
      const dataSource = getDataSource();

      const date = options.date === "today"
        ? new Date().toISOString().split("T")[0]
        : options.date;

      if (options.weekly) {
        await showWeeklySummary(dataSource, date, options.json);
      } else {
        await showDailySummary(dataSource, date, options.json);
      }
    });
}

async function showDailySummary(dataSource: any, date: string, json: boolean): Promise<void> {
  const [metrics, heartRate, sleep, workouts] = await Promise.all([
    dataSource.getMetrics(date),
    dataSource.getHeartRate(date),
    dataSource.getSleep(date),
    dataSource.getWorkouts(date),
  ]);

  const data = {
    date,
    metrics,
    heartRate: {
      resting: heartRate.restingAvg,
      min: heartRate.minToday,
      max: heartRate.maxToday,
    },
    sleep: sleep ? {
      duration: sleep.durationHours,
      quality: sleep.qualityScore,
      bedTime: sleep.bedTime,
      wakeTime: sleep.wakeTime,
      stages: sleep.stages,
    } : null,
    workouts: workouts.map((w: any) => ({
      type: w.type,
      duration: w.durationMinutes,
      calories: w.caloriesBurned,
    })),
  };

  if (json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  console.log(`\n🏥 Health Summary for ${date}\n`);
  console.log("━".repeat(50));

  console.log("\n📊 Activity");
  console.log(`   Steps:     ${metrics.steps.toLocaleString()}`);
  console.log(`   Calories:  ${metrics.calories.toLocaleString()} kcal`);
  console.log(`   Active:    ${metrics.activeMinutes} min`);
  console.log(`   Distance:  ${(metrics.distance / 1000).toFixed(2)} km`);

  console.log("\n❤️  Heart Rate");
  console.log(`   Resting:   ${heartRate.restingAvg} bpm`);
  console.log(`   Range:     ${heartRate.minToday} - ${heartRate.maxToday} bpm`);

  if (sleep) {
    console.log("\n🌙 Sleep");
    console.log(`   Duration:  ${sleep.durationHours} hours`);
    console.log(`   Quality:   ${sleep.qualityScore}%`);
    console.log(`   Time:      ${sleep.bedTime} - ${sleep.wakeTime}`);
    console.log(`   Stages:    Deep ${sleep.stages.deep}min | Light ${sleep.stages.light}min | REM ${sleep.stages.rem}min`);
  } else {
    console.log("\n🌙 Sleep: No data available");
  }

  if (workouts.length > 0) {
    console.log("\n🏃 Workouts");
    for (const w of workouts) {
      console.log(`   • ${w.type}: ${w.durationMinutes} min, ${w.caloriesBurned} kcal`);
    }
  } else {
    console.log("\n🏃 Workouts: None recorded");
  }

  console.log("\n" + "━".repeat(50) + "\n");
}

async function showWeeklySummary(dataSource: any, endDate: string, json: boolean): Promise<void> {
  const [weeklySteps, weeklySleep] = await Promise.all([
    dataSource.getWeeklySteps(endDate),
    dataSource.getWeeklySleep(endDate),
  ]);

  const totalSteps = weeklySteps.reduce((sum: number, d: any) => sum + d.steps, 0);
  const avgSteps = Math.round(totalSteps / weeklySteps.length);
  const avgSleep = weeklySleep.reduce((sum: number, d: any) => sum + d.hours, 0) / weeklySleep.length;

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

  console.log(`\n🏥 Weekly Health Summary (ending ${endDate})\n`);
  console.log("━".repeat(50));

  console.log("\n📊 Steps");
  console.log(`   Total:     ${totalSteps.toLocaleString()}`);
  console.log(`   Average:   ${avgSteps.toLocaleString()} / day`);
  console.log("\n   Daily breakdown:");
  for (const d of weeklySteps) {
    const bar = "█".repeat(Math.round(d.steps / 1000));
    console.log(`   ${d.date}: ${bar} ${d.steps.toLocaleString()}`);
  }

  console.log("\n🌙 Sleep");
  console.log(`   Average:   ${avgSleep.toFixed(1)} hours / night`);
  console.log("\n   Daily breakdown:");
  for (const d of weeklySleep) {
    const bar = "█".repeat(Math.round(d.hours));
    console.log(`   ${d.date}: ${bar} ${d.hours}h`);
  }

  console.log("\n" + "━".repeat(50) + "\n");
}
