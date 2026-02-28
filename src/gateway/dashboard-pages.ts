/**
 * Dashboard Page Generators
 *
 * Unified health dashboard with 7 tabs: Overview, Vitals, Activity, Sleep, Body, Heart, Trends.
 * All UI is generated server-side via A2UI protocol.
 */

import { A2UIGenerator, type A2UIMessage } from './a2ui.js';
import { t } from '../locales/index.js';
import type {
  HealthMetrics,
  HeartRateData,
  StressData,
  SpO2Data,
  BloodPressureData,
  BloodGlucoseData,
  BodyTemperatureData,
  SleepData,
  BodyCompositionData,
  NutritionData,
  ECGData,
  VO2MaxData,
  EmotionData,
  HRVData,
  WorkoutData,
} from '../data-sources/interface.js';

// ============================================================================
// Dashboard Data Interface
// ============================================================================

export interface DashboardData {
  // Core (always available first)
  metrics?: HealthMetrics;
  metricsIsYesterday?: boolean;
  heartRate?: HeartRateData;
  heartRateIsYesterday?: boolean;
  // Group 2
  stress?: StressData | null;
  spo2?: SpO2Data | null;
  bloodPressure?: BloodPressureData | null;
  bloodGlucose?: BloodGlucoseData | null;
  bodyTemperature?: BodyTemperatureData | null;
  // Group 3
  sleep?: SleepData | null;
  bodyComposition?: BodyCompositionData | null;
  nutrition?: NutritionData | null;
  // Group 4
  ecg?: ECGData | null;
  vo2max?: VO2MaxData | null;
  emotion?: EmotionData | null;
  hrv?: HRVData | null;
  // Group 5 - trends
  weeklySteps?: Array<{ date: string; steps: number }>;
  weeklySleep?: Array<{ date: string; hours: number }>;
  weeklyHeartRate?: Array<{ date: string; avg: number }>;
  workouts?: WorkoutData[];
  // Trends tab data
  trendsData?: Array<{ date: string; value: number }>;
  trendsMetric?: string;
  trendsRange?: string;
  // Scope errors
  scopeErrors?: string[];
}

export interface DashboardOptions {
  loading?: boolean; // Show skeletons for missing data
}

export type TabId = 'overview' | 'vitals' | 'activity' | 'sleep' | 'body' | 'heart' | 'trends';

// ============================================================================
// Health Score Calculation
// ============================================================================

function calculateHealthScore(data: DashboardData): number {
  let stepsScore = 0;
  let sleepScore = 0;
  let hrScore = 0;
  let spo2Score = 0;

  // Steps: 10000 = 100
  if (data.metrics) {
    stepsScore = Math.min(100, Math.round((data.metrics.steps / 10000) * 100));
  }

  // Sleep: 8h = 100
  if (data.sleep) {
    sleepScore = Math.min(100, Math.round((data.sleep.durationHours / 8) * 100));
  }

  // Heart rate: resting 50-80 is good
  if (data.heartRate) {
    const resting = data.heartRate.restingAvg;
    if (resting >= 50 && resting <= 80) {
      hrScore = 100;
    } else if (resting < 50) {
      hrScore = Math.max(0, 100 - (50 - resting) * 5);
    } else {
      hrScore = Math.max(0, 100 - (resting - 80) * 5);
    }
  }

  // SpO2: 95-100 is normal
  if (data.spo2) {
    const spo2Val = data.spo2.current;
    if (spo2Val >= 95) {
      spo2Score = 100;
    } else {
      spo2Score = Math.max(0, (spo2Val - 85) * 10);
    }
  }

  // Average only scored components that have data
  const scores = [
    data.metrics ? stepsScore : null,
    data.sleep ? sleepScore : null,
    data.heartRate ? hrScore : null,
    data.spo2 ? spo2Score : null,
  ].filter((s): s is number => s !== null);

  if (scores.length === 0) {
    return 0;
  }
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

// ============================================================================
// Anomaly Detection
// ============================================================================

interface Anomaly {
  label: string;
  value: string;
  severity: 'warning' | 'error';
}

function detectAnomalies(data: DashboardData): Anomaly[] {
  const anomalies: Anomaly[] = [];

  if (data.bloodPressure && data.bloodPressure.latestSystolic > 140) {
    anomalies.push({
      label: t('health.bloodPressure'),
      value: `${data.bloodPressure.latestSystolic}/${data.bloodPressure.latestDiastolic} mmHg`,
      severity: 'warning',
    });
  }
  if (data.bloodPressure && data.bloodPressure.latestDiastolic > 90) {
    if (!anomalies.find((a) => a.label === t('health.bloodPressure'))) {
      anomalies.push({
        label: t('health.bloodPressure'),
        value: `${data.bloodPressure.latestSystolic}/${data.bloodPressure.latestDiastolic} mmHg`,
        severity: 'warning',
      });
    }
  }

  if (data.spo2 && data.spo2.current < 95) {
    anomalies.push({
      label: t('health.spo2'),
      value: `${data.spo2.current}%`,
      severity: data.spo2.current < 90 ? 'error' : 'warning',
    });
  }

  if (data.heartRate && data.heartRate.restingAvg > 100) {
    anomalies.push({
      label: t('health.heartRate'),
      value: `${data.heartRate.restingAvg} ${t('health.bpmUnit')}`,
      severity: 'warning',
    });
  }

  if (data.stress && data.stress.current > 70) {
    anomalies.push({
      label: t('health.stress'),
      value: `${data.stress.current}`,
      severity: 'warning',
    });
  }

  if (data.bloodGlucose && data.bloodGlucose.latest > 7.0) {
    anomalies.push({
      label: t('health.bloodGlucose'),
      value: `${data.bloodGlucose.latest} mmol/L`,
      severity: 'warning',
    });
  }

  return anomalies;
}

// ============================================================================
// Helper: stat card or skeleton
// ============================================================================

function statOrSkeleton(
  ui: A2UIGenerator,
  available: boolean,
  loading: boolean,
  opts: { title: string; value: string; subtitle?: string; icon: string; color: string }
): string {
  if (!available && loading) {
    return ui.skeleton({ variant: 'card' });
  }
  return ui.statCard({
    title: opts.title,
    value: available ? opts.value : '--',
    subtitle: opts.subtitle,
    icon: opts.icon,
    color: available ? opts.color : undefined,
  });
}

// ============================================================================
// Tab: Overview — section builders
// ============================================================================

function buildScopeErrorBanner(ui: A2UIGenerator, scopeErrors: string[]): string {
  const warnIcon = ui.text('!', 'h2');
  const reAuthTitle = ui.text(t('dashboard.scopeErrorTitle'), 'body');
  const reAuthHint = ui.text(t('dashboard.scopeErrorHint'), 'caption');
  const reAuthBtn = ui.button(t('dashboard.reAuth'), 'start_huawei_auth', {
    variant: 'accent',
    size: 'sm',
  });
  const reAuthContent = ui.row([warnIcon, ui.column([reAuthTitle, reAuthHint], { gap: 4 }), reAuthBtn], {
    justify: 'between',
    align: 'center',
    gap: 12,
  });
  return ui.card([reAuthContent], {
    padding: 16,
    className: 'border-l-4 border-l-warning',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

function buildHeroSection(ui: A2UIGenerator, data: DashboardData): string {
  const stepsGoal = 8000;
  const activeHoursGoal = 12;
  const caloriesGoal = 500;
  const currentSteps = data.metrics?.steps ?? 0;
  const currentActiveHours = Math.round((data.metrics?.activeMinutes ?? 0) / 60);
  const currentCalories = data.metrics?.calories ?? 0;

  const rings = ui.activityRings(
    [
      { value: currentSteps, max: stepsGoal, label: t('activity.steps'), color: '#FA114F' },
      {
        value: currentActiveHours,
        max: activeHoursGoal,
        label: t('activity.activeTime'),
        color: '#92E82A',
      },
      {
        value: currentCalories,
        max: caloriesGoal,
        label: t('activity.calories'),
        color: '#00CEFF',
      },
    ],
    { size: 180 }
  );

  const score = calculateHealthScore(data);
  const gauge = ui.scoreGauge(score, {
    max: 100,
    label: t('dashboard.healthScoreLabel'),
    showValue: true,
    size: 'md',
    thresholds: [
      { value: 40, color: '#ef4444' },
      { value: 70, color: '#f59e0b' },
      { value: 100, color: '#10b981' },
    ],
  });

  const quickStatsChildren: string[] = [gauge];
  if (data.metricsIsYesterday) {
    quickStatsChildren.push(ui.badge(t('dashboard.yesterdayData'), { variant: 'info' }));
  }
  const quickStatsCol = ui.column(quickStatsChildren, { gap: 8, align: 'center' });

  const heroRow = ui.row([rings, quickStatsCol], { gap: 32, justify: 'center', align: 'center' });
  return ui.card([heroRow], { padding: 28 });
}

function buildVitalSignsRow(ui: A2UIGenerator, data: DashboardData, loading: boolean): string {
  const hrSubtitle = data.heartRateIsYesterday ? t('dashboard.yesterdayData') : t('health.bpmResting');
  const vitalCards = [
    statOrSkeleton(ui, !!data.heartRate, loading, {
      title: t('health.heartRate'),
      value: data.heartRate ? `${data.heartRate.restingAvg}` : '--',
      subtitle: hrSubtitle,
      icon: 'heart',
      color: '#ef4444',
    }),
    statOrSkeleton(ui, !!data.spo2, loading, {
      title: t('health.spo2'),
      value: data.spo2 ? `${data.spo2.current}%` : '--',
      subtitle: t('health.oxygen'),
      icon: 'wind',
      color: '#10b981',
    }),
    statOrSkeleton(ui, !!data.stress, loading, {
      title: t('health.stress'),
      value: data.stress ? `${data.stress.current}` : '--',
      subtitle: t('health.stressLevel'),
      icon: 'brain',
      color: '#8b5cf6',
    }),
    statOrSkeleton(ui, !!data.sleep, loading, {
      title: t('sleep.duration'),
      value: data.sleep ? `${data.sleep.durationHours.toFixed(1)}h` : '--',
      subtitle: t('sleep.hours'),
      icon: 'moon',
      color: '#6366f1',
    }),
  ];
  return ui.grid(vitalCards, { columns: 4, gap: 12 });
}

function buildSecondaryStatsRow(ui: A2UIGenerator, data: DashboardData, loading: boolean): string {
  const secondaryCards = [
    statOrSkeleton(ui, !!data.bodyComposition, loading, {
      title: t('health.bodyWeight'),
      value: data.bodyComposition?.weight ? `${data.bodyComposition.weight} kg` : '--',
      icon: 'activity',
      color: '#0ea5e9',
    }),
    statOrSkeleton(ui, !!data.bodyTemperature, loading, {
      title: t('health.bodyTemperature'),
      value: data.bodyTemperature ? `${data.bodyTemperature.latest}°C` : '--',
      icon: 'flame',
      color: '#f59e0b',
    }),
    statOrSkeleton(ui, !!data.bloodPressure, loading, {
      title: t('health.bloodPressure'),
      value: data.bloodPressure ? `${data.bloodPressure.latestSystolic}/${data.bloodPressure.latestDiastolic}` : '--',
      subtitle: 'mmHg',
      icon: 'stethoscope',
      color: '#f97316',
    }),
    statOrSkeleton(ui, !!data.emotion, loading, {
      title: t('dashboard.emotion'),
      value: data.emotion ? data.emotion.current : '--',
      subtitle: data.emotion ? `${data.emotion.score}/100` : undefined,
      icon: 'star',
      color: '#ec4899',
    }),
  ];
  return ui.grid(secondaryCards, { columns: 4, gap: 12 });
}

function buildOverviewCharts(ui: A2UIGenerator, data: DashboardData): string[] {
  const chartChildren: string[] = [];

  if (data.weeklySteps && data.weeklySteps.length > 0) {
    const stepsChartTitle = ui.text(t('activity.chartTitle'), 'h3');
    const stepsChart = ui.chart({
      chartType: 'bar',
      data: data.weeklySteps.map((d) => ({ label: d.date.slice(5), value: d.steps })),
      xKey: 'label',
      yKey: 'value',
      height: 200,
      color: '#10b981',
    });
    chartChildren.push(ui.card([stepsChartTitle, stepsChart], { padding: 20 }));
  }

  if (data.heartRate && data.heartRate.readings.length > 0) {
    const hrChartTitle = ui.text(t('health.heartRateTrend'), 'h3');
    const hrChart = ui.chart({
      chartType: 'line',
      data: data.heartRate.readings.map((r) => ({ label: r.time, value: r.value })),
      xKey: 'label',
      yKey: 'value',
      height: 200,
      color: '#ef4444',
    });
    chartChildren.push(ui.card([hrChartTitle, hrChart], { padding: 20 }));
  }

  const result: string[] = [];
  if (chartChildren.length === 1) {
    result.push(chartChildren[0]);
  } else if (chartChildren.length > 1) {
    result.push(ui.grid(chartChildren, { columns: 2, gap: 16 }));
  }

  if (data.weeklySleep && data.weeklySleep.length > 0) {
    const sleepChartTitle = ui.text(t('dashboard.sleepTrend'), 'h3');
    const sleepChart = ui.chart({
      chartType: 'bar',
      data: data.weeklySleep.map((d) => ({ label: d.date.slice(5), value: d.hours })),
      xKey: 'label',
      yKey: 'value',
      height: 160,
      color: '#8b5cf6',
    });
    result.push(ui.card([sleepChartTitle, sleepChart], { padding: 20 }));
  }

  return result;
}

function buildOverviewTab(ui: A2UIGenerator, data: DashboardData, loading: boolean): string {
  const children: string[] = [];

  if (data.scopeErrors && data.scopeErrors.length > 0) {
    children.push(buildScopeErrorBanner(ui, data.scopeErrors));
  }

  children.push(buildHeroSection(ui, data));
  children.push(buildVitalSignsRow(ui, data, loading));
  children.push(buildSecondaryStatsRow(ui, data, loading));

  const anomalies = detectAnomalies(data);
  if (anomalies.length > 0) {
    const alertBadges = anomalies.map((a) =>
      ui.badge(`${a.label}: ${a.value}`, { variant: a.severity === 'error' ? 'error' : 'warning' })
    );
    const alertRow = ui.row(alertBadges, { gap: 8, wrap: true });
    children.push(ui.card([alertRow], { padding: 16 }));
  }

  children.push(...buildOverviewCharts(ui, data));

  return ui.column(children, { gap: 16 });
}

// ============================================================================
// Tab: Vitals
// ============================================================================

function buildVitalsStatCards(ui: A2UIGenerator, data: DashboardData, loading: boolean): string {
  const cards = [
    statOrSkeleton(ui, !!data.heartRate, loading, {
      title: t('health.heartRate'),
      value: data.heartRate ? `${data.heartRate.restingAvg}` : '--',
      subtitle: t('health.bpmResting'),
      icon: 'heart',
      color: '#ef4444',
    }),
    statOrSkeleton(ui, !!data.heartRate, loading, {
      title: t('health.restingHR'),
      value: data.heartRate ? `${data.heartRate.restingAvg}` : '--',
      subtitle: t('health.bpmUnit'),
      icon: 'heart-pulse',
      color: '#f97316',
    }),
    statOrSkeleton(ui, !!data.hrv, loading, {
      title: t('dashboard.hrv'),
      value: data.hrv ? `${data.hrv.rmssd}` : '--',
      subtitle: 'ms',
      icon: 'activity',
      color: '#6366f1',
    }),
    statOrSkeleton(ui, !!data.spo2, loading, {
      title: t('health.spo2'),
      value: data.spo2 ? `${data.spo2.current}%` : '--',
      subtitle: t('health.oxygen'),
      icon: 'wind',
      color: '#10b981',
    }),
    statOrSkeleton(ui, !!data.stress, loading, {
      title: t('health.stress'),
      value: data.stress ? `${data.stress.current}` : '--',
      subtitle: t('health.stressLevel'),
      icon: 'brain',
      color: '#8b5cf6',
    }),
    statOrSkeleton(ui, !!data.bloodPressure, loading, {
      title: t('health.bloodPressure'),
      value: data.bloodPressure ? `${data.bloodPressure.latestSystolic}/${data.bloodPressure.latestDiastolic}` : '--',
      subtitle: 'mmHg',
      icon: 'stethoscope',
      color: '#f97316',
    }),
    statOrSkeleton(ui, !!data.bloodGlucose, loading, {
      title: t('health.bloodGlucose'),
      value: data.bloodGlucose ? `${data.bloodGlucose.latest}` : '--',
      subtitle: 'mmol/L',
      icon: 'zap',
      color: '#3b82f6',
    }),
    statOrSkeleton(ui, !!data.bodyTemperature, loading, {
      title: t('health.bodyTemperature'),
      value: data.bodyTemperature ? `${data.bodyTemperature.latest}` : '--',
      subtitle: 'C',
      icon: 'flame',
      color: '#f59e0b',
    }),
  ];
  return ui.grid(cards, { columns: 4, gap: 16 });
}

function buildVitalsCharts(ui: A2UIGenerator, data: DashboardData): string[] {
  const result: string[] = [];

  if (data.heartRate && data.heartRate.readings.length > 0) {
    const hrChartTitle = ui.text(t('health.heartRateTrend'), 'h3');
    const hrChart = ui.chart({
      chartType: 'line',
      data: data.heartRate.readings.map((r) => ({ label: r.time, value: r.value })),
      xKey: 'label',
      yKey: 'value',
      height: 200,
      color: '#ef4444',
    });
    result.push(ui.card([hrChartTitle, hrChart], { padding: 20 }));
  }

  if (data.stress && data.stress.readings.length > 0) {
    const stressChartTitle = ui.text(t('health.stress'), 'h3');
    const stressChart = ui.chart({
      chartType: 'line',
      data: data.stress.readings.map((r) => ({ label: r.time, value: r.value })),
      xKey: 'label',
      yKey: 'value',
      height: 200,
      color: '#8b5cf6',
    });
    result.push(ui.card([stressChartTitle, stressChart], { padding: 20 }));
  }

  if (data.bloodPressure && data.bloodPressure.readings.length > 0) {
    const bpTitle = ui.text(t('health.bloodPressure'), 'h3');
    const bpTable = ui.table(
      [
        { key: 'time', label: t('health.recordTime') },
        { key: 'systolic', label: t('health.systolic') },
        { key: 'diastolic', label: t('health.diastolic') },
      ],
      data.bloodPressure.readings.map((r) => ({
        time: r.time,
        systolic: `${r.systolic} mmHg`,
        diastolic: `${r.diastolic} mmHg`,
      }))
    );
    result.push(ui.card([bpTitle, bpTable], { padding: 20 }));
  }

  if (data.bloodGlucose && data.bloodGlucose.readings.length > 0) {
    const bgTitle = ui.text(t('health.bloodGlucose'), 'h3');
    const bgTable = ui.table(
      [
        { key: 'time', label: t('health.recordTime') },
        { key: 'value', label: t('health.bloodGlucose') },
      ],
      data.bloodGlucose.readings.map((r) => ({
        time: r.time,
        value: `${r.value} mmol/L`,
      }))
    );
    result.push(ui.card([bgTitle, bgTable], { padding: 20 }));
  }

  return result;
}

function buildVitalsTab(ui: A2UIGenerator, data: DashboardData, loading: boolean): string {
  const children: string[] = [];
  children.push(buildVitalsStatCards(ui, data, loading));
  children.push(...buildVitalsCharts(ui, data));
  return ui.column(children, { gap: 24 });
}

// ============================================================================
// Tab: Activity
// ============================================================================

function buildActivityTab(ui: A2UIGenerator, data: DashboardData, loading: boolean): string {
  const children: string[] = [];

  // Stat cards
  const cards: string[] = [];

  cards.push(
    statOrSkeleton(ui, !!data.metrics, loading, {
      title: t('activity.steps'),
      value: data.metrics ? `${data.metrics.steps.toLocaleString()}` : '--',
      subtitle: t('activity.stepsToday'),
      icon: 'footprints',
      color: '#10b981',
    })
  );

  cards.push(
    statOrSkeleton(ui, !!data.metrics, loading, {
      title: t('activity.calories'),
      value: data.metrics ? `${data.metrics.calories}` : '--',
      subtitle: t('activity.kcalBurned'),
      icon: 'flame',
      color: '#f97316',
    })
  );

  cards.push(
    statOrSkeleton(ui, !!data.metrics, loading, {
      title: t('dashboard.distance'),
      value: data.metrics ? `${(data.metrics.distance / 1000).toFixed(1)}` : '--',
      subtitle: 'km',
      icon: 'activity',
      color: '#3b82f6',
    })
  );

  cards.push(
    statOrSkeleton(ui, !!data.metrics, loading, {
      title: t('activity.activeTime'),
      value: data.metrics ? `${Math.round((data.metrics.activeMinutes || 0) / 60)}h` : '--',
      subtitle: t('sleep.hours'),
      icon: 'timer',
      color: '#8b5cf6',
    })
  );

  cards.push(
    statOrSkeleton(ui, !!data.vo2max, loading, {
      title: t('dashboard.vo2max'),
      value: data.vo2max ? `${data.vo2max.value}` : '--',
      subtitle: data.vo2max ? data.vo2max.level : 'mL/kg/min',
      icon: 'trending-up',
      color: '#10b981',
    })
  );

  children.push(ui.grid(cards, { columns: 5, gap: 16 }));

  // 7-day steps chart
  if (data.weeklySteps && data.weeklySteps.length > 0) {
    const chartTitle = ui.text(t('activity.chartTitle'), 'h3');
    const chart = ui.chart({
      chartType: 'bar',
      data: data.weeklySteps.map((d) => ({ label: d.date, value: d.steps })),
      xKey: 'label',
      yKey: 'value',
      height: 200,
      color: '#10b981',
    });
    children.push(ui.card([chartTitle, chart], { padding: 20 }));
  }

  // Recent workouts table
  if (data.workouts && data.workouts.length > 0) {
    const workoutTitle = ui.text(t('dashboard.recentWorkouts'), 'h3');
    const workoutTable = ui.table(
      [
        { key: 'type', label: t('evolution.type') },
        { key: 'duration', label: t('evolution.duration') },
        { key: 'calories', label: t('activity.calories') },
        { key: 'distance', label: t('dashboard.distance') },
        { key: 'avgHR', label: t('health.heartRate') },
      ],
      data.workouts.map((w) => ({
        type: w.type,
        duration: `${w.durationMinutes} ${t('sleep.minutes')}`,
        calories: `${w.caloriesBurned} kcal`,
        distance: w.distanceKm ? `${w.distanceKm.toFixed(1)} km` : '--',
        avgHR: w.avgHeartRate ? `${w.avgHeartRate} ${t('health.bpmUnit')}` : '--',
      }))
    );
    children.push(ui.card([workoutTitle, workoutTable], { padding: 20 }));
  }

  return ui.column(children, { gap: 24 });
}

// ============================================================================
// Tab: Sleep
// ============================================================================

function buildSleepTab(ui: A2UIGenerator, data: DashboardData, loading: boolean): string {
  const children: string[] = [];

  // Stat cards
  const cards: string[] = [];

  cards.push(
    statOrSkeleton(ui, !!data.sleep, loading, {
      title: t('sleep.duration'),
      value: data.sleep ? `${data.sleep.durationHours.toFixed(1)}` : '--',
      subtitle: t('sleep.hours'),
      icon: 'moon',
      color: '#8b5cf6',
    })
  );

  cards.push(
    statOrSkeleton(ui, !!data.sleep, loading, {
      title: t('sleep.quality'),
      value: data.sleep ? `${data.sleep.qualityScore}` : '--',
      subtitle: '/100',
      icon: 'star',
      color: '#f59e0b',
    })
  );

  cards.push(
    statOrSkeleton(ui, !!data.sleep, loading, {
      title: t('sleep.deepSleep'),
      value: data.sleep ? `${data.sleep.stages.deep}` : '--',
      subtitle: t('sleep.minutes'),
      icon: 'bed',
      color: '#6366f1',
    })
  );

  children.push(ui.grid(cards, { columns: 3, gap: 16 }));

  // Sleep stages chart
  if (data.sleep) {
    const stagesTitle = ui.text(t('dashboard.sleepStages'), 'h3');
    const stagesChart = ui.chart({
      chartType: 'bar',
      data: [
        { label: t('sleep.deepSleep'), value: data.sleep.stages.deep },
        { label: 'Light', value: data.sleep.stages.light },
        { label: 'REM', value: data.sleep.stages.rem },
        { label: 'Awake', value: data.sleep.stages.awake },
      ],
      xKey: 'label',
      yKey: 'value',
      height: 200,
      color: '#8b5cf6',
    });
    children.push(ui.card([stagesTitle, stagesChart], { padding: 20 }));
  }

  // 7-day sleep duration chart
  if (data.weeklySleep && data.weeklySleep.length > 0) {
    const trendTitle = ui.text(t('dashboard.sleepTrend'), 'h3');
    const trendChart = ui.chart({
      chartType: 'bar',
      data: data.weeklySleep.map((d) => ({ label: d.date, value: d.hours })),
      xKey: 'label',
      yKey: 'value',
      height: 200,
      color: '#8b5cf6',
    });
    children.push(ui.card([trendTitle, trendChart], { padding: 20 }));
  }

  // Sleep breathing collapsible
  const breathingText = ui.text(t('dashboard.loadingData'), 'caption');
  const breathingCollapsible = ui.collapsible(t('dashboard.sleepBreathing'), [breathingText], {
    icon: 'wind',
  });
  children.push(breathingCollapsible);

  return ui.column(children, { gap: 24 });
}

// ============================================================================
// Tab: Body
// ============================================================================

function buildBodyStatCards(ui: A2UIGenerator, data: DashboardData, loading: boolean): string {
  const cards = [
    statOrSkeleton(ui, !!data.bodyComposition?.weight, loading, {
      title: t('health.bodyWeight'),
      value: data.bodyComposition?.weight ? `${data.bodyComposition.weight}` : '--',
      subtitle: 'kg',
      icon: 'activity',
      color: '#6366f1',
    }),
    statOrSkeleton(ui, !!data.bodyComposition?.bmi, loading, {
      title: t('health.bmi'),
      value: data.bodyComposition?.bmi ? `${data.bodyComposition.bmi.toFixed(1)}` : '--',
      icon: 'bar-chart',
      color: '#3b82f6',
    }),
    statOrSkeleton(ui, !!data.bodyComposition?.bodyFatRate, loading, {
      title: t('health.bodyFat'),
      value: data.bodyComposition?.bodyFatRate ? `${data.bodyComposition.bodyFatRate.toFixed(1)}%` : '--',
      icon: 'trending-up',
      color: '#f97316',
    }),
    statOrSkeleton(ui, !!data.bodyComposition?.height, loading, {
      title: t('dashboard.height'),
      value: data.bodyComposition?.height ? `${data.bodyComposition.height}` : '--',
      subtitle: 'cm',
      icon: 'activity',
      color: '#10b981',
    }),
  ];
  return ui.grid(cards, { columns: 4, gap: 16 });
}

function buildNutritionCard(ui: A2UIGenerator, nutrition: NutritionData): string {
  const nutritionTitle = ui.text(t('dashboard.nutritionSummary'), 'h3');
  const nutritionItems: string[] = [];

  nutritionItems.push(
    ui.statCard({
      title: t('activity.calories'),
      value: `${nutrition.totalCalories}`,
      subtitle: 'kcal',
      icon: 'flame',
      color: '#f97316',
    })
  );

  const macros: Array<{ key: keyof NutritionData; label: string; color: string }> = [
    { key: 'protein', label: 'dashboard.protein', color: '#ef4444' },
    { key: 'fat', label: 'dashboard.fat', color: '#f59e0b' },
    { key: 'carbs', label: 'dashboard.carbs', color: '#3b82f6' },
    { key: 'water', label: 'dashboard.water', color: '#10b981' },
  ];
  for (const m of macros) {
    const val = nutrition[m.key];
    if (val !== undefined) {
      nutritionItems.push(
        ui.statCard({
          title: t(m.label as Parameters<typeof t>[0]),
          value: `${val}`,
          subtitle: m.key === 'water' ? 'mL' : 'g',
          icon: 'zap',
          color: m.color,
        })
      );
    }
  }

  const nutritionGrid = ui.grid(nutritionItems, { columns: nutritionItems.length, gap: 12 });
  return ui.card([nutritionTitle, nutritionGrid], { padding: 20 });
}

function buildBodyTab(ui: A2UIGenerator, data: DashboardData, loading: boolean): string {
  const children: string[] = [];

  children.push(buildBodyStatCards(ui, data, loading));

  if (data.nutrition) {
    children.push(buildNutritionCard(ui, data.nutrition));
  }

  const menstrualText = ui.text(t('dashboard.loadingData'), 'caption');
  const menstrualCollapsible = ui.collapsible(t('health.menstrualCycle'), [menstrualText], {
    icon: 'heart',
  });
  children.push(menstrualCollapsible);

  return ui.column(children, { gap: 24 });
}

// ============================================================================
// Tab: Heart
// ============================================================================

function buildHeartTab(ui: A2UIGenerator, data: DashboardData, loading: boolean): string {
  const children: string[] = [];

  // Stat cards
  const cards: string[] = [];

  cards.push(
    statOrSkeleton(ui, !!data.heartRate, loading, {
      title: t('health.heartRate'),
      value: data.heartRate ? `${data.heartRate.restingAvg}` : '--',
      subtitle: t('health.bpmResting'),
      icon: 'heart',
      color: '#ef4444',
    })
  );

  cards.push(
    statOrSkeleton(ui, !!data.heartRate, loading, {
      title: t('health.restingHR'),
      value: data.heartRate ? `${data.heartRate.restingAvg}` : '--',
      subtitle: t('health.bpmUnit'),
      icon: 'heart-pulse',
      color: '#f97316',
    })
  );

  cards.push(
    statOrSkeleton(ui, !!data.hrv, loading, {
      title: t('dashboard.hrv'),
      value: data.hrv ? `${data.hrv.rmssd}` : '--',
      subtitle: 'ms',
      icon: 'activity',
      color: '#6366f1',
    })
  );

  children.push(ui.grid(cards, { columns: 3, gap: 16 }));

  // Heart rate trend chart
  if (data.heartRate && data.heartRate.readings.length > 0) {
    const hrChartTitle = ui.text(t('health.heartRateTrend'), 'h3');
    const hrChart = ui.chart({
      chartType: 'line',
      data: data.heartRate.readings.map((r) => ({ label: r.time, value: r.value })),
      xKey: 'label',
      yKey: 'value',
      height: 200,
      color: '#ef4444',
    });
    children.push(ui.card([hrChartTitle, hrChart], { padding: 20 }));
  }

  // ECG records table
  if (data.ecg && data.ecg.records.length > 0) {
    const ecgTitle = ui.text(t('dashboard.ecgRecords'), 'h3');
    const ecgTable = ui.table(
      [
        { key: 'time', label: t('health.recordTime') },
        { key: 'avgHeartRate', label: t('health.heartRate') },
        { key: 'result', label: t('health.ecgResult') },
      ],
      data.ecg.records.map((r) => ({
        time: r.time,
        avgHeartRate: `${r.avgHeartRate} ${t('health.bpmUnit')}`,
        result: r.arrhythmiaLabel,
      }))
    );
    children.push(ui.card([ecgTitle, ecgTable], { padding: 20 }));
  }

  // Heart events card (placeholder)
  const heartEventsTitle = ui.text(t('dashboard.heartEvents'), 'h3');
  const heartEventsText = ui.text(`${t('dashboard.tachycardia')} / ${t('dashboard.bradycardia')}`, 'caption');
  children.push(ui.card([heartEventsTitle, heartEventsText], { padding: 20 }));

  return ui.column(children, { gap: 24 });
}

// ============================================================================
// Tab: Trends (helpers)
// ============================================================================

function buildTrendsSelectorRow(ui: A2UIGenerator, data: DashboardData): string {
  const rangeSelect = ui.formInput('trends_range', 'select', {
    label: t('dashboard.timeRange'),
    value: data.trendsRange || '1w',
    options: [
      { value: '1w', label: t('dashboard.oneWeek') },
      { value: '1m', label: t('dashboard.oneMonth') },
      { value: '3m', label: t('dashboard.threeMonths') },
      { value: '6m', label: t('dashboard.sixMonths') },
      { value: '1y', label: t('dashboard.oneYear') },
      { value: '2y', label: t('dashboard.twoYears') },
    ],
    onChange: 'change_trends_range',
  });

  const metricSelect = ui.formInput('trends_metric', 'select', {
    label: t('dashboard.selectMetric'),
    value: data.trendsMetric || 'steps',
    options: [
      { value: 'steps', label: t('activity.steps') },
      { value: 'heart_rate', label: t('health.heartRate') },
      { value: 'sleep', label: t('sleep.duration') },
      { value: 'weight', label: t('health.bodyWeight') },
      { value: 'blood_pressure', label: t('health.bloodPressure') },
      { value: 'spo2', label: t('health.spo2') },
    ],
    onChange: 'change_trends_metric',
  });

  return ui.row([rangeSelect, metricSelect], { gap: 16 });
}

function buildTrendsChart(
  ui: A2UIGenerator,
  trendsData: Array<{ date: string; value: number }>,
  metricLabel: string
): string {
  const chartTitle = ui.text(metricLabel, 'h3');
  const chart = ui.chart({
    chartType: 'line',
    data: trendsData.map((d) => ({
      label: d.date.slice(5), // MM-DD format
      value: d.value,
    })),
    xKey: 'label',
    yKey: 'value',
    height: 300,
    color: '#3b82f6',
  });
  return ui.card([chartTitle, chart], { padding: 20 });
}

function buildMonthlySummarySection(
  ui: A2UIGenerator,
  trendsData: Array<{ date: string; value: number }>,
  metricUnit: string
): string {
  const summaryTitle = ui.text(t('dashboard.monthlySummary'), 'h3');
  const monthMap = new Map<string, number[]>();
  for (const pt of trendsData) {
    const monthKey = pt.date.slice(0, 7); // YYYY-MM
    if (!monthMap.has(monthKey)) {
      monthMap.set(monthKey, []);
    }
    monthMap.get(monthKey)!.push(pt.value);
  }
  const summaryRows = Array.from(monthMap.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([month, values]) => {
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      const max = Math.max(...values);
      const min = Math.min(...values);
      return {
        period: month,
        average: `${Math.round(avg)}${metricUnit}`,
        max: `${Math.round(max)}${metricUnit}`,
        min: `${Math.round(min)}${metricUnit}`,
        days: String(values.length),
      };
    });
  const summaryTable = ui.table(
    [
      { key: 'period', label: t('dashboard.timeRange') },
      { key: 'average', label: t('dashboard.weeklyAverage') },
      { key: 'max', label: 'Max' },
      { key: 'min', label: 'Min' },
      { key: 'days', label: t('dashboard.days') },
    ],
    summaryRows
  );
  return ui.card([summaryTitle, summaryTable], { padding: 20 });
}

// ============================================================================
// Tab: Trends
// ============================================================================

function buildTrendsTab(ui: A2UIGenerator, data: DashboardData): string {
  const children: string[] = [];

  children.push(buildTrendsSelectorRow(ui, data));

  if (data.trendsData && data.trendsData.length > 0) {
    const metricLabels: Record<string, string> = {
      steps: t('activity.steps'),
      heart_rate: t('health.heartRate'),
      sleep: t('sleep.duration'),
      weight: t('health.bodyWeight'),
      blood_pressure: t('health.bloodPressure'),
      spo2: t('health.spo2'),
    };
    const metricUnits: Record<string, string> = {
      steps: '',
      heart_rate: t('health.bpmUnit'),
      sleep: 'h',
      weight: 'kg',
      blood_pressure: 'mmHg',
      spo2: '%',
    };
    const metricLabel = metricLabels[data.trendsMetric || 'steps'] || '';
    const metricUnit = metricUnits[data.trendsMetric || 'steps'] || '';

    children.push(buildTrendsChart(ui, data.trendsData, metricLabel));
    children.push(buildMonthlySummarySection(ui, data.trendsData, metricUnit));
  } else if (data.trendsData && data.trendsData.length === 0) {
    const emptyText = ui.text(t('dashboard.noTrendsData'), 'caption');
    children.push(ui.card([emptyText], { padding: 20, align: 'center' }));
  }

  return ui.column(children, { gap: 24 });
}

// ============================================================================
// Main Dashboard Page Generator
// ============================================================================

export function generateDashboardPage(
  data: DashboardData,
  activeTab: TabId = 'overview',
  options?: DashboardOptions
): A2UIMessage[] {
  const ui = new A2UIGenerator('main');
  const loading = options?.loading ?? false;

  // Header
  const title = ui.text(t('dashboard.title'), 'h2');
  const subtitle = ui.text(t('dashboard.subtitle'), 'caption');
  const header = ui.column([title, subtitle], { gap: 4, padding: 24 });

  // Build all tab contents
  const overviewContent = buildOverviewTab(ui, data, loading);
  const vitalsContent = buildVitalsTab(ui, data, loading);
  const activityContent = buildActivityTab(ui, data, loading);
  const sleepContent = buildSleepTab(ui, data, loading);
  const bodyContent = buildBodyTab(ui, data, loading);
  const heartContent = buildHeartTab(ui, data, loading);
  const trendsContent = buildTrendsTab(ui, data);

  // Tabs component
  const tabsDef = [
    { id: 'overview', label: t('dashboard.tabOverview'), icon: 'bar-chart' },
    { id: 'vitals', label: t('dashboard.tabVitals'), icon: 'heart-pulse' },
    { id: 'activity', label: t('dashboard.tabActivity'), icon: 'footprints' },
    { id: 'sleep', label: t('dashboard.tabSleep'), icon: 'moon' },
    { id: 'body', label: t('dashboard.tabBody'), icon: 'activity' },
    { id: 'heart', label: t('dashboard.tabHeart'), icon: 'heart' },
    { id: 'trends', label: t('dashboard.tabTrends'), icon: 'trending-up' },
  ];

  const contentIds: Record<string, string> = {
    overview: overviewContent,
    vitals: vitalsContent,
    activity: activityContent,
    sleep: sleepContent,
    body: bodyContent,
    heart: heartContent,
    trends: trendsContent,
  };

  const tabsComponent = ui.tabs(tabsDef, activeTab, contentIds);

  // Re-auth action (accent glow, right-aligned above tabs)
  const reAuthBtn = ui.button(t('dashboard.reAuth'), 'start_huawei_auth', {
    variant: 'accent',
    size: 'sm',
  });
  const toolbar = ui.row([reAuthBtn], { justify: 'end' });

  // Content container
  const content = ui.column([toolbar, tabsComponent], { gap: 8, padding: 24 });

  const root = ui.column([header, content], { gap: 0 });

  return ui.build(root);
}
