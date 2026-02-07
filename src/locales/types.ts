/**
 * i18n Type Definitions
 */

export interface LocaleMessages {
  // Navigation
  nav: {
    chat: string;
    dashboard: string;
    health: string;
    sleep: string;
    activity: string;
    memory: string;
    prompts: string;
    skills: string;
    evolution: string;
    integrations: string;
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
    restingHR: string;
    maxHR: string;
    minHR: string;
    heartRateTrend: string;
    bpmResting: string;
    bpmAvg: string;
    bpmMax: string;
    bpmMin: string;
    bpmUnit: string;
    spo2: string;
    oxygen: string;
    stress: string;
    stressLevel: string;
    high: string;
    low: string;
    veryLow: string;
    noData: string;
    bloodPressure: string;
    systolic: string;
    diastolic: string;
    bloodGlucose: string;
    bodyWeight: string;
    bodyTemperature: string;
    bmi: string;
    bodyFat: string;
    nutrition: string;
    menstrualCycle: string;
    ecg: string;
    arrhythmiaDetected: string;
    normalRhythm: string;
    latestEcgHr: string;
    recordTime: string;
    ecgResult: string;
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

  // Dashboard page (unified health dashboard)
  dashboard: {
    title: string;
    subtitle: string;
    // Tab names
    tabOverview: string;
    tabVitals: string;
    tabActivity: string;
    tabSleep: string;
    tabBody: string;
    tabHeart: string;
    tabTrends: string;
    // Health score
    healthScore: string;
    healthScoreLabel: string;
    // New data type labels
    vo2max: string;
    emotion: string;
    hrv: string;
    hrvLabel: string;
    pulse: string;
    activeHours: string;
    distance: string;
    // Loading states
    loadingData: string;
    loadingProgress: string;
    loadingComplete: string;
    // Anomaly / alerts
    anomalyAlert: string;
    noAnomalies: string;
    // Time range selectors (Trends tab)
    timeRange: string;
    oneWeek: string;
    oneMonth: string;
    threeMonths: string;
    sixMonths: string;
    oneYear: string;
    twoYears: string;
    // Metric selector (Trends tab)
    selectMetric: string;
    monthlySummary: string;
    weeklyAverage: string;
    days: string;
    noTrendsData: string;
    // Body tab
    height: string;
    protein: string;
    fat: string;
    carbs: string;
    water: string;
    nutritionSummary: string;
    // Heart tab
    ecgRecords: string;
    tachycardia: string;
    bradycardia: string;
    heartEvents: string;
    // Sleep tab extras
    sleepStages: string;
    sleepTrend: string;
    sleepBreathing: string;
    // Activity tab extras
    workouts: string;
    recentWorkouts: string;
    // Activity rings
    activityRings: string;
    yesterdayData: string;
    // Re-auth
    scopeErrorTitle: string;
    scopeErrorHint: string;
    reAuth: string;
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
    // Benchmark additions
    radarChart: string;
    benchmarkRuns: string;
    comparison: string;
    passed: string;
    failed: string;
    overall: string;
    profile: string;
    quickProfile: string;
    fullProfile: string;
    versionTag: string;
    runBenchmark: string;
    healthDataAnalysis: string;
    healthCoaching: string;
    safetyBoundaries: string;
    personalization: string;
    communicationQuality: string;
    autoLoop: string;
    autoLoopHint: string;
    regression: string;
    improvement: string;
    runs: string;
    runQuickBenchmark: string;
    runFullBenchmark: string;
    benchmarkRunning: string;
    noBenchmarkRuns: string;
    recentRuns: string;
    viewDetails: string;
    duration: string;
    totalScore: string;
    categoryScores: string;
    benchmarkProgress: string;
    benchmarkComplete: string;
    noEvaluationsHint: string;
    noTracesHint: string;
    noSuggestionsHint: string;
    noEvaluationsYet: string;
    model: string;
    latestChange: string;
    config: string;
    configDesc: string;
    passingScore: string;
    weakThreshold: string;
    weight: string;
    dimension: string;
    editConfigHint: string;
    noConfigFile: string;
  };

  // Memory page
  memory: {
    title: string;
    subtitle: string;
    completeness: string;
    totalChunks: string;
    missingFields: string;
    profile: string;
    field: string;
    value: string;
    memorySummary: string;
    recentLogs: string;
    searchPlaceholder: string;
    search: string;
    noResults: string;
    score: string;
    tabProfile: string;
    tabSummary: string;
    tabLogs: string;
    tabSearch: string;
  };

  // Integrations page
  integrations: {
    title: string;
    subtitle: string;
    tabOverview: string;
    tabIssues: string;
    tabPRs: string;
    tabBranches: string;
    repo: string;
    openIssues: string;
    openPRs: string;
    currentBranch: string;
    issueNumber: string;
    issueTitle: string;
    state: string;
    labels: string;
    author: string;
    created: string;
    prTitle: string;
    branch: string;
    baseBranch: string;
    draft: string;
    recentCommits: string;
    hash: string;
    message: string;
    date: string;
    refreshData: string;
    noGitHub: string;
    noGitHubHint: string;
    open: string;
    closed: string;
    merged: string;
    feedbackIssues: string;
  };

  // OAuth / Authorization
  auth: {
    required: string;
    requiredSubtitle: string;
    connectHuawei: string;
    success: string;
    successMessage: string;
    failed: string;
    closingWindow: string;
    closeWindow: string;
  };
}

export type LocaleKey = "zh-CN" | "en";
