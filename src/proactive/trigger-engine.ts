/**
 * Proactive Trigger Engine
 *
 * In-process setInterval engine that periodically checks:
 * 1. Reminder due dates → push toast + mark completed/reschedule
 * 2. Plan progress → create plan_reminder recommendations when behind
 * 3. Health alerts → create alert recommendations for abnormal vitals
 *
 * Uses SSEConnectionManager.broadcast() to push toast notifications.
 * No external cron dependencies — follows OpenClaw pattern.
 */

import { createLogger } from "../utils/logger.js";
import { getUserUuid } from "../utils/config.js";
import { listReminders, saveReminder } from "./store.js";
import { listRecommendations, saveRecommendation } from "./store.js";
import { listPlans } from "../plans/store.js";
import { autoSyncPlanProgress, type HealthSnapshot } from "../agent/health-context.js";
import { createDataSourceForUser } from "../data-sources/index.js";
import type { HealthDataSource } from "../data-sources/interface.js";
import { generateToast } from "../gateway/pages.js";
import type { SSEConnectionManager } from "../gateway/sse-manager.js";
import type { Recommendation } from "./types.js";

const log = createLogger("Proactive");

export class ProactiveTriggerEngine {
  private timer: ReturnType<typeof setInterval> | null = null;
  private sseManager: SSEConnectionManager;
  private intervalMs: number;
  private lastDailyCheck: string | null = null;

  constructor(sseManager: SSEConnectionManager, config?: { intervalMinutes?: number }) {
    this.sseManager = sseManager;
    this.intervalMs = (config?.intervalMinutes ?? 5) * 60_000;
  }

  /**
   * Create a user-specific data source for health data fetching.
   * Uses createDataSourceForUser(uuid) so the correct OAuth token (SQLite) is used.
   */
  private getDataSourceForUser(uuid: string): HealthDataSource {
    return createDataSourceForUser(uuid);
  }

  start(): void {
    if (this.timer) return;
    log.info("Proactive Trigger Engine started", {
      intervalMs: this.intervalMs,
    });
    // Run first tick after a short delay (let server finish startup)
    setTimeout(() => this.tick(), 5_000);
    this.timer = setInterval(() => this.tick(), this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      log.info("Proactive Trigger Engine stopped");
    }
  }

  private async tick(): Promise<void> {
    try {
      const uuid = getUserUuid();
      await this.checkReminders(uuid);
      await this.checkPlanProgress(uuid);
      await this.checkHealthAlerts(uuid);
    } catch (err) {
      log.warn("Proactive tick failed", { error: err });
    }
  }

  /**
   * Check for due reminders. For pending reminders where scheduledAt <= now:
   * - Push a toast notification
   * - Mark non-repeating as completed
   * - Reschedule repeating reminders to next occurrence
   */
  private async checkReminders(uuid: string): Promise<void> {
    const now = new Date();
    const pendingReminders = listReminders(uuid, "pending");

    for (const reminder of pendingReminders) {
      const scheduledTime = new Date(reminder.scheduledAt);
      if (scheduledTime > now) continue;

      // Push toast
      const icon = reminder.icon || "timer";
      this.pushToast(reminder.title, reminder.body || "", icon);
      log.info("Reminder fired", { id: reminder.id, title: reminder.title });

      if (reminder.repeatRule === "none") {
        reminder.status = "completed";
        reminder.completedAt = now.toISOString();
      } else {
        // Reschedule to next occurrence
        const next = this.computeNextOccurrence(scheduledTime, reminder.repeatRule);
        reminder.scheduledAt = next.toISOString();
      }

      saveReminder(uuid, reminder);
    }
  }

  /**
   * Once per day, sync plan progress with health data.
   * If any goal is behind, create a plan_reminder recommendation.
   */
  private async checkPlanProgress(uuid: string): Promise<void> {
    const today = new Date().toISOString().split("T")[0];

    // Only run once per day
    if (this.lastDailyCheck === today) return;
    this.lastDailyCheck = today;

    const activePlans = listPlans(uuid, "active");
    if (activePlans.length === 0) return;

    // Fetch health data for auto-sync
    try {
      const source = this.getDataSourceForUser(uuid);
      const todayDate = new Date(today + "T00:00:00");
      const dayOfWeek = todayDate.getDay();
      const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const weekStart = new Date(todayDate);
      weekStart.setDate(todayDate.getDate() - mondayOffset);
      const weekStartStr = weekStart.toISOString().split("T")[0];
      const [weeklySteps, weeklySleep, todayHR, todayWorkouts, weeklyWorkouts, todayMetrics, todayBodyComp] =
        await Promise.all([
          source.getWeeklySteps(today).catch(() => []),
          source.getWeeklySleep(today).catch(() => []),
          source.getHeartRate(today).catch(() => null),
          source.getWorkouts(today).catch(() => []),
          source.getWorkoutsRange?.(weekStartStr, today).catch(() => []) ?? Promise.resolve([]),
          source.getMetrics(today).catch(() => null),
          source.getBodyComposition?.(today).catch(() => null) ?? Promise.resolve(null),
        ]);

      const snapshot: HealthSnapshot = {
        weeklySteps,
        weeklySleep,
        todayHR,
        todayWorkouts,
        weeklyWorkouts,
        todayMetrics,
        todayBodyComp,
      };

      autoSyncPlanProgress(activePlans, uuid, today, snapshot);

      // Check for behind goals and create recommendations
      for (const plan of activePlans) {
        const behindGoals = plan.goals.filter((g) => g.status === "behind");
        if (behindGoals.length === 0) continue;

        // Avoid duplicate recommendations for the same plan today
        const existing = listRecommendations(uuid, "active");
        const alreadyNotified = existing.some(
          (r) =>
            r.type === "plan_reminder" &&
            r.relatedPlanId === plan.id &&
            r.createdAt.startsWith(today)
        );
        if (alreadyNotified) continue;

        const goalNames = behindGoals.map((g) => g.label).join(", ");
        const rec: Recommendation = {
          id: `rec_plan_${plan.id}_${Date.now()}`,
          type: "plan_reminder",
          title: `${plan.name}: 目标进度落后`,
          body: `以下目标需要关注: ${goalNames}`,
          priority: "medium",
          icon: "target",
          relatedPlanId: plan.id,
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 24 * 3600000).toISOString(),
          status: "active",
        };

        saveRecommendation(uuid, rec);
        this.pushToast(rec.title, rec.body, "target");
        log.info("Plan progress alert created", {
          planId: plan.id,
          behindGoals: behindGoals.length,
        });
      }
    } catch (err) {
      log.warn("Plan progress check failed", { error: err });
    }
  }

  /**
   * Check today's health data for anomalies and create alert recommendations.
   */
  private async checkHealthAlerts(uuid: string): Promise<void> {
    const today = new Date().toISOString().split("T")[0];

    try {
      const source = this.getDataSourceForUser(uuid);
      const [todayHR, todaySpO2, todayBP] = await Promise.all([
        source.getHeartRate(today).catch(() => null),
        source.getSpO2?.(today).catch(() => null) ?? Promise.resolve(null),
        source.getBloodPressure?.(today).catch(() => null) ?? Promise.resolve(null),
      ]);

      const alerts: Array<{ title: string; body: string; icon: string; metric: string }> = [];

      // Elevated resting heart rate
      if (todayHR && todayHR.restingAvg > 100) {
        alerts.push({
          title: "静息心率偏高",
          body: `今日静息心率 ${todayHR.restingAvg} bpm，超过 100 bpm 阈值`,
          icon: "heart-pulse",
          metric: "heart_rate",
        });
      }

      // Low SpO2
      if (todaySpO2 && todaySpO2.avg < 95) {
        alerts.push({
          title: "血氧饱和度偏低",
          body: `今日平均血氧 ${todaySpO2.avg}%，低于 95% 阈值`,
          icon: "wind",
          metric: "spo2",
        });
      }

      // Elevated blood pressure
      if (todayBP && (todayBP.latestSystolic > 140 || todayBP.latestDiastolic > 90)) {
        alerts.push({
          title: "血压偏高",
          body: `今日血压 ${todayBP.latestSystolic}/${todayBP.latestDiastolic} mmHg`,
          icon: "activity",
          metric: "blood_pressure",
        });
      }

      if (alerts.length === 0) return;

      // Deduplicate: skip if same metric alert already exists today
      const existing = listRecommendations(uuid, "active");

      for (const alert of alerts) {
        const alreadyExists = existing.some(
          (r) =>
            r.type === "alert" && r.relatedMetric === alert.metric && r.createdAt.startsWith(today)
        );
        if (alreadyExists) continue;

        const rec: Recommendation = {
          id: `rec_alert_${alert.metric}_${Date.now()}`,
          type: "alert",
          title: alert.title,
          body: alert.body,
          priority: "high",
          icon: alert.icon,
          relatedMetric: alert.metric,
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 24 * 3600000).toISOString(),
          status: "active",
        };

        saveRecommendation(uuid, rec);
        this.pushToast(rec.title, rec.body, alert.icon);
        log.info("Health alert created", { metric: alert.metric });
      }
    } catch (err) {
      log.warn("Health alert check failed", { error: err });
    }
  }

  private pushToast(title: string, body: string, _icon?: string): void {
    const message = body ? `${title}: ${body}` : title;
    const toast = generateToast(message, "info");
    this.sseManager.broadcast(toast);
  }

  private computeNextOccurrence(current: Date, rule: string): Date {
    const next = new Date(current);
    switch (rule) {
      case "daily":
        next.setDate(next.getDate() + 1);
        break;
      case "weekly":
        next.setDate(next.getDate() + 7);
        break;
      case "weekdays": {
        do {
          next.setDate(next.getDate() + 1);
        } while (next.getDay() === 0 || next.getDay() === 6);
        break;
      }
      default:
        next.setDate(next.getDate() + 1);
    }
    return next;
  }
}
