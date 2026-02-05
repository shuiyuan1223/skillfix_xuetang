/**
 * i18n Type Definitions
 */

export interface LocaleMessages {
  // Navigation
  nav: {
    chat: string;
    health: string;
    sleep: string;
    activity: string;
    prompts: string;
    skills: string;
    evolution: string;
  };

  // Common
  common: {
    connected: string;
    reconnecting: string;
    switchToLight: string;
    switchToDark: string;
    collapseSidebar: string;
    save: string;
    edit: string;
    cancel: string;
    delete: string;
    revert: string;
    enable: string;
    disable: string;
    create: string;
    normal: string;
  };

  // Chat page
  chat: {
    title: string;
    subtitle: string;
    placeholder: string;
    sleepAnalysis: string;
    activitySummary: string;
    heartRate: string;
    sleepQuestion: string;
    activityQuestion: string;
    heartRateQuestion: string;
  };

  // Health page
  health: {
    title: string;
    subtitle: string;
    heartRate: string;
    maxHR: string;
    minHR: string;
    heartRateTrend: string;
    bpmResting: string;
    bpmMax: string;
    bpmMin: string;
    bpmUnit: string;
  };

  // Sleep page
  sleep: {
    title: string;
    subtitle: string;
    duration: string;
    quality: string;
    deepSleep: string;
    chartTitle: string;
    hours: string;
    minutes: string;
  };

  // Activity page
  activity: {
    title: string;
    subtitle: string;
    steps: string;
    calories: string;
    activeTime: string;
    chartTitle: string;
    stepsToday: string;
    kcalBurned: string;
    aboveAvg: string;
    belowAvg: string;
  };

  // Prompts page
  prompts: {
    title: string;
    subtitle: string;
    cardTitle: string;
    name: string;
    promptTitle: string;
    lines: string;
    versionHistory: string;
  };

  // Skills page
  skills: {
    title: string;
    subtitle: string;
    cardTitle: string;
    newSkill: string;
    skill: string;
    description: string;
    status: string;
    triggers: string;
  };

  // Evolution page
  evolution: {
    title: string;
    subtitle: string;
    overview: string;
    traces: string;
    evaluations: string;
    benchmark: string;
    suggestions: string;
    avgScore: string;
    totalTraces: string;
    averageScore: string;
    outOf100: string;
    time: string;
    message: string;
    score: string;
    trace: string;
    feedback: string;
    category: string;
    query: string;
    minScore: string;
    keywords: string;
    runAllTests: string;
    addTestCase: string;
    type: string;
    target: string;
    rationale: string;
  };
}

export type LocaleKey = "zh-CN" | "en";
