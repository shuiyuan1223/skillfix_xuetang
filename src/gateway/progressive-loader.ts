/**
 * Progressive Dashboard Loader
 *
 * Loads health data in priority groups and incrementally updates the dashboard.
 * AgentOS: All UI updates are sent via A2UI messages through WebSocket.
 */

import type { HealthDataSource } from "../data-sources/interface.js";
import {
  generateDashboardPage,
  type DashboardData,
  type DashboardOptions,
  type TabId,
} from "./dashboard-pages.js";
import { generateSidebar } from "./pages.js";
import { t } from "../locales/index.js";
import { getMissingScopeErrors } from "../data-sources/huawei/huawei-api.js";

type SendFn = (msg: unknown) => void;

interface LoadGroup {
  label: string;
  fetchers: Array<() => Promise<Partial<DashboardData>>>;
}

/**
 * Send sidebar + main dashboard page (used once at start)
 */
function sendDashboardFull(
  send: SendFn,
  data: DashboardData,
  activeTab: TabId,
  loading: boolean,
  progress?: DashboardOptions["progress"]
): void {
  for (const msg of generateSidebar("dashboard")) send(msg);
  for (const msg of generateDashboardPage(data, activeTab, { loading, progress })) send(msg);
}

/**
 * Send only the main dashboard page (incremental updates, no sidebar)
 */
function sendDashboardMain(
  send: SendFn,
  data: DashboardData,
  activeTab: TabId,
  loading: boolean,
  progress?: DashboardOptions["progress"]
): void {
  for (const msg of generateDashboardPage(data, activeTab, { loading, progress })) send(msg);
}

/**
 * Define loading groups for each tab
 */
function getGroupsForTab(tab: TabId, ds: HealthDataSource, today: string): LoadGroup[] {
  const groups: LoadGroup[] = [];

  switch (tab) {
    case "overview": {
      const yesterday = getLocalDateString(
        (() => {
          const d = new Date();
          d.setDate(d.getDate() - 1);
          return d;
        })()
      );
      groups.push({
        label: t("activity.steps") + " & " + t("health.heartRate"),
        fetchers: [
          async () => {
            const metrics = await ds.getMetrics(today);
            // Fallback to yesterday if today has no data yet
            if (metrics.steps === 0 && metrics.calories === 0) {
              const yMetrics = await ds.getMetrics(yesterday);
              if (yMetrics.steps > 0 || yMetrics.calories > 0) {
                return { metrics: yMetrics, metricsIsYesterday: true };
              }
            }
            return { metrics };
          },
          async () => {
            const heartRate = await ds.getHeartRate(today);
            if (heartRate.restingAvg === 0 && heartRate.readings.length === 0) {
              const yHr = await ds.getHeartRate(yesterday);
              if (yHr.restingAvg > 0) {
                return { heartRate: yHr, heartRateIsYesterday: true };
              }
            }
            return { heartRate };
          },
        ],
      });
      groups.push({
        label: t("dashboard.tabVitals"),
        fetchers: [
          async () => ({ stress: (await ds.getStress?.(today)) ?? null }),
          async () => ({ spo2: (await ds.getSpO2?.(today)) ?? null }),
          async () => ({ bloodPressure: (await ds.getBloodPressure?.(today)) ?? null }),
          async () => ({ bloodGlucose: (await ds.getBloodGlucose?.(today)) ?? null }),
          async () => ({ bodyTemperature: (await ds.getBodyTemperature?.(today)) ?? null }),
        ],
      });
      groups.push({
        label: t("dashboard.tabSleep") + " & " + t("dashboard.tabBody"),
        fetchers: [
          async () => ({ sleep: await ds.getSleep(today) }),
          async () => ({ bodyComposition: (await ds.getBodyComposition?.(today)) ?? null }),
          async () => ({ nutrition: (await ds.getNutrition?.(today)) ?? null }),
        ],
      });
      groups.push({
        label: t("dashboard.tabHeart"),
        fetchers: [
          async () => ({ ecg: (await ds.getECG?.(today)) ?? null }),
          async () => ({ vo2max: (await ds.getVO2Max?.(today)) ?? null }),
          async () => ({ emotion: (await ds.getEmotion?.(today)) ?? null }),
        ],
      });
      groups.push({
        label: t("dashboard.tabTrends"),
        fetchers: [
          async () => ({ weeklySteps: await ds.getWeeklySteps(today) }),
          async () => ({ weeklySleep: await ds.getWeeklySleep(today) }),
        ],
      });
      break;
    }

    case "vitals":
      groups.push({
        label: t("health.heartRate"),
        fetchers: [
          async () => ({ heartRate: await ds.getHeartRate(today) }),
          async () => ({ hrv: (await ds.getHRV?.(today)) ?? null }),
        ],
      });
      groups.push({
        label: t("dashboard.tabVitals"),
        fetchers: [
          async () => ({ stress: (await ds.getStress?.(today)) ?? null }),
          async () => ({ spo2: (await ds.getSpO2?.(today)) ?? null }),
          async () => ({ bloodPressure: (await ds.getBloodPressure?.(today)) ?? null }),
          async () => ({ bloodGlucose: (await ds.getBloodGlucose?.(today)) ?? null }),
          async () => ({ bodyTemperature: (await ds.getBodyTemperature?.(today)) ?? null }),
        ],
      });
      break;

    case "activity":
      groups.push({
        label: t("activity.steps"),
        fetchers: [
          async () => ({ metrics: await ds.getMetrics(today) }),
          async () => ({ vo2max: (await ds.getVO2Max?.(today)) ?? null }),
        ],
      });
      groups.push({
        label: t("dashboard.tabTrends"),
        fetchers: [
          async () => ({ weeklySteps: await ds.getWeeklySteps(today) }),
          async () => ({ workouts: await ds.getWorkouts(today) }),
        ],
      });
      break;

    case "sleep":
      groups.push({
        label: t("sleep.duration"),
        fetchers: [async () => ({ sleep: await ds.getSleep(today) })],
      });
      groups.push({
        label: t("dashboard.sleepTrend"),
        fetchers: [async () => ({ weeklySleep: await ds.getWeeklySleep(today) })],
      });
      break;

    case "body":
      groups.push({
        label: t("dashboard.tabBody"),
        fetchers: [
          async () => ({ bodyComposition: (await ds.getBodyComposition?.(today)) ?? null }),
          async () => ({ nutrition: (await ds.getNutrition?.(today)) ?? null }),
        ],
      });
      break;

    case "heart":
      groups.push({
        label: t("health.heartRate"),
        fetchers: [
          async () => ({ heartRate: await ds.getHeartRate(today) }),
          async () => ({ hrv: (await ds.getHRV?.(today)) ?? null }),
        ],
      });
      groups.push({
        label: t("dashboard.ecgRecords"),
        fetchers: [async () => ({ ecg: (await ds.getECG?.(today)) ?? null })],
      });
      groups.push({
        label: t("dashboard.tabTrends"),
        fetchers: [
          async () => ({
            weeklyHeartRate: await (async () => {
              if (ds.getHeartRateRange) {
                const end = today;
                const start = new Date(today);
                start.setDate(start.getDate() - 7);
                const data = await ds.getHeartRateRange(start.toISOString().split("T")[0], end);
                return data.map((d) => ({ date: d.date, avg: d.avg }));
              }
              return undefined;
            })(),
          }),
        ],
      });
      break;

    case "trends":
      // Trends tab loads data via separate action (time_range_change)
      // Initial load just shows the selector UI
      groups.push({
        label: t("dashboard.tabTrends"),
        fetchers: [async () => ({ weeklySteps: await ds.getWeeklySteps(today) })],
      });
      break;

    default:
      // Fallback: load overview
      return getGroupsForTab("overview", ds, today);
  }

  return groups;
}

/**
 * ProgressiveDashboardLoader
 *
 * Incrementally loads health data and updates the dashboard via WebSocket.
 */
export class ProgressiveDashboardLoader {
  private data: DashboardData = {};
  private dataSource: HealthDataSource;
  private send: SendFn;

  constructor(dataSource: HealthDataSource, send: SendFn) {
    this.dataSource = dataSource;
    this.send = send;
  }

  /**
   * Update the send function (must be called before load on reconnect/new message)
   */
  updateSend(send: SendFn): void {
    this.send = send;
  }

  /**
   * Get accumulated data (for external reference)
   */
  getData(): DashboardData {
    return this.data;
  }

  /**
   * Set accumulated data (e.g., when switching tabs to reuse existing data)
   */
  setData(data: DashboardData): void {
    this.data = data;
  }

  /**
   * Load data for a specific tab with progressive rendering
   */
  async load(activeTab: TabId): Promise<void> {
    const today = getLocalDateString(new Date());
    const groups = getGroupsForTab(activeTab, this.dataSource, today);

    // 1. Send skeleton page with sidebar (full)
    sendDashboardFull(this.send, this.data, activeTab, true);

    // 2. Load groups sequentially, rendering after each group (main only)
    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      const results = await Promise.allSettled(group.fetchers.map((f) => f()));

      // Merge successful results into data
      for (const result of results) {
        if (result.status === "fulfilled" && result.value) {
          Object.assign(this.data, result.value);
        }
      }

      // Re-render with accumulated data + inline progress
      const isLastGroup = i === groups.length - 1;
      const progress = !isLastGroup
        ? { current: i + 1, total: groups.length, label: group.label }
        : undefined;
      sendDashboardMain(this.send, this.data, activeTab, !isLastGroup, progress);
    }

    // 3. Check for scope errors after all groups loaded
    const scopeErrors = getMissingScopeErrors();
    if (scopeErrors.length > 0) {
      this.data.scopeErrors = scopeErrors;
      // Re-send final page with scope error banner
      sendDashboardMain(this.send, this.data, activeTab, false);
    }
  }

  /**
   * Load trend data for a specific metric and time range
   */
  async loadTrends(metric: string, range: string): Promise<void> {
    const today = new Date();
    const days = parseDays(range);
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - days);

    const startStr = getLocalDateString(startDate);
    const endStr = getLocalDateString(today);

    this.data.trendsMetric = metric;
    this.data.trendsRange = range;

    // Show loading state (main only, sidebar already present)
    sendDashboardMain(this.send, this.data, "trends", true);

    try {
      const trendPoints = await this.fetchTrendData(metric, startStr, endStr);
      // Filter out zero/missing data points so charts aren't distorted by incomplete days
      this.data.trendsData = trendPoints.filter((p) => p.value > 0);
    } catch {
      this.data.trendsData = [];
    }

    sendDashboardMain(this.send, this.data, "trends", false);
  }

  private async fetchTrendData(
    metric: string,
    startDate: string,
    endDate: string
  ): Promise<Array<{ date: string; value: number }>> {
    const ds = this.dataSource;

    switch (metric) {
      case "steps":
        if (ds.getMetricsRange) {
          const data = await ds.getMetricsRange(startDate, endDate);
          return data.map((d) => ({ date: d.date, value: d.steps }));
        }
        break;
      case "heart_rate":
        if (ds.getHeartRateRange) {
          const data = await ds.getHeartRateRange(startDate, endDate);
          return data.map((d) => ({ date: d.date, value: d.avg }));
        }
        break;
      case "sleep":
        if (ds.getSleepRange) {
          const data = await ds.getSleepRange(startDate, endDate);
          return data.map((d) => ({ date: d.date, value: d.hours }));
        }
        break;
      case "weight":
        if (ds.getBodyCompositionRange) {
          const data = await ds.getBodyCompositionRange(startDate, endDate);
          return data
            .filter((d) => d.weight != null)
            .map((d) => ({ date: d.date, value: d.weight! }));
        }
        break;
      case "blood_pressure":
        if (ds.getBloodPressureRange) {
          const data = await ds.getBloodPressureRange(startDate, endDate);
          return data.map((d) => ({ date: d.date, value: d.avgSystolic }));
        }
        break;
      case "stress":
        if (ds.getStressRange) {
          const data = await ds.getStressRange(startDate, endDate);
          return data.map((d) => ({ date: d.date, value: d.avg }));
        }
        break;
      case "spo2":
        if (ds.getSpO2Range) {
          const data = await ds.getSpO2Range(startDate, endDate);
          return data.map((d) => ({ date: d.date, value: d.avg }));
        }
        break;
    }

    return [];
  }
}

/**
 * Get date string in local timezone (YYYY-MM-DD)
 * Avoids UTC-based toISOString() which can return wrong date near midnight
 */
function getLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDays(range: string): number {
  const match = range.match(/^(\d+)([dwmy])$/);
  if (!match) return 30;
  const [, numStr, unit] = match;
  const num = parseInt(numStr);
  switch (unit) {
    case "d":
      return num;
    case "w":
      return num * 7;
    case "m":
      return num * 30;
    case "y":
      return num * 365;
    default:
      return 30;
  }
}
