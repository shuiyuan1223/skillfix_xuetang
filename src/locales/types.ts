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
    plans: string;
    memory: string;
    prompts: string;
    skills: string;
    tools: string;
    evolution: string;
    integrations: string;
    systemAgent: string;
    logs: string;
    settings: string;
  };

  // System Agent
  systemAgent: {
    title: string;
    subtitle: string;
    placeholder: string;
    runBenchmark: string;
    startEvolution: string;
    gitStatus: string;
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
    close: string;
    newChat: string;
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
    stopGeneration: string;
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
    stepsTrend: string;
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
    notCreated: string;
    tabPha: string;
    tabSystem: string;
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
    phaSkills: string;
    systemSkills: string;
    tabPha: string;
    tabSystem: string;
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
    progress: string;
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
    selectModel: string;
    defaultModel: string;
    modelComparison: string;
    runWith: string;
    bestScore: string;
    passCriteria: string;
    externalBenchmarkRunning: string;
    testCases: string;
    // Diagnose
    diagnose: string;
    diagnoseDesc: string;
    runDiagnose: string;
    createIssues: string;
    issuesCreated: string;
    weakCategories: string;
    diagnosing: string;
    diagnoseComplete: string;
    noWeaknesses: string;
    diagnosePipelineHint: string;
    diagnosePipelineSteps: string;
    diagnoseInitializing: string;
    diagnosePatterns: string;
    diagnoseFailingTests: string;
    diagnoseSuggestionImprove: string;
    diagnoseSuggestionSkill: string;
    weakSubComponents: string;
    diagnoseUsingExisting: string;
    diagnoseFoundWeak: string;
    diagnoseGenerated: string;
    diagnoseAnalyzing: string;
    retry: string;
    retryStep: string;
    rerunQuick: string;
    rerunFull: string;
    // Auto-evolve
    autoEvolve: string;
    autoEvolveDesc: string;
    targetScore: string;
    maxIterations: string;
    startAutoEvolve: string;
    autoEvolving: string;
    // Versions
    versions: string;
    versionsDesc: string;
    versionBranch: string;
    versionStatus: string;
    versionTrigger: string;
    scoreDelta: string;
    filesChanged: string;
    priority: string;
    switchVersion: string;
    mergeVersion: string;
    abandonVersion: string;
    compareVersions: string;
    activeVersion: string;
    noVersions: string;
    versionSwitched: string;
    versionMerged: string;
    versionAbandoned: string;
    resetToMain: string;
    // Evolution Lab
    lab: string;
    labSubtitle: string;
    contextPanel: string;
    timeline: string;
    benchmarks: string;
    inspector: string;
    pipelineBenchmark: string;
    pipelineDiagnose: string;
    pipelinePropose: string;
    pipelineApprove: string;
    pipelineApply: string;
    pipelineValidate: string;
    pipelineAnalyse: string;
    analysing: string;
    analyseComplete: string;
    analyseReport: string;
    keyFindings: string;
    analyseConfidence: string;
    evoChatPlaceholder: string;
    branchCreated: string;
    branchMerged: string;
    branchAbandoned: string;
    commitMade: string;
    benchmarkRan: string;
    selectFileToView: string;
    noChanges: string;
    approveProposal: string;
    rejectProposal: string;
    // Dashboard tabs
    tabOverview: string;
    tabBenchmark: string;
    tabVersions: string;
    tabData: string;
    tabAgent: string;
    startEvolutionCycle: string;
    // Overview
    currentVersion: string;
    scoreTrend: string;
    // Agent tab
    agentSubtitle: string;

    startEvolution: string;
    // Version detail
    versionDetail: string;
    commitDetail: string;
    commitAuthor: string;
    viewDiff: string;
    cherryPick: string;
    revertCommit: string;
    selectCommitToView: string;
    timeAgo: string;
    // Data labels
    latestRun: string;
    bestScoresAllTime: string;
    bestPerVersion: string;
    // SHARP 2.0
    sharpSafety: string;
    sharpUsefulness: string;
    sharpAccuracy: string;
    sharpRelevance: string;
    sharpPersonalization: string;
    scorePerfect: string;
    scoreAcceptable: string;
    scoreFail: string;
    criticalFailure: string;
    subComponents: string;
    allModelsParallel: string;
    modelAlreadyRunning: string;
    // Arena dashboard
    selectRunsForComparison: string;
    categoriesMode: string;
    criteriaMode: string;
    overallScores: string;
    categoryBreakdown: string;
    clearSelection: string;
    noRunsSelected: string;
    criteria: string;
    scoringType: string;
    // Playground
    tabPlayground: string;
    playgroundWelcome: string;
    playgroundWelcomeDesc: string;
    playgroundLog: string;
    playgroundChatPlaceholder: string;
    startQuickCycle: string;
    startFullCycle: string;
    startNewCycle: string;
    pauseCycle: string;
    continueCycle: string;
    continueToDiagnose: string;
    continueToPropose: string;
    submitForApproval: string;
    continueToValidate: string;
    humanReviewRequired: string;
    applying: string;
    validating: string;
    cycleComplete: string;
    proposalHint: string;
    proposeGenerating: string;
    expectedImprovement: string;
    proposalOverview: string;
    changeDescription: string;
    agentDriven: string;
    evolutionConsole: string;
    taskFlowControl: string;
    iterateCycle: string;
    improvementPlan: string;
    iterationHistory: string;
    cycleSummary: string;
    noDetailData: string;
  };

  // Memory page
  memory: {
    title: string;
    subtitle: string;
    completeness: string;
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
    tabSystemAgent: string;
    memoryFileName: string;
    memoryFileLines: string;
    memoryFilePreview: string;
    memoryEmptyFile: string;
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

  // Logs page
  logs: {
    title: string;
    subtitle: string;
    level: string;
    subsystem: string;
    message: string;
    time: string;
    allLevels: string;
    allSubsystems: string;
    noLogs: string;
    refresh: string;
    tabSystem: string;
    tabLlm: string;
    llmProvider: string;
    llmModel: string;
    llmTokens: string;
    llmLatency: string;
    llmStatus: string;
    llmAllProviders: string;
    llmAllModels: string;
    llmNoLogs: string;
    llmRequest: string;
    llmResponse: string;
  };

  // Settings / General page
  settings: {
    title: string;
    subtitle: string;
    llmProvider: string;
    llmProviderDesc: string;
    apiKey: string;
    apiKeyDesc: string;
    apiKeyPlaceholder: string;
    apiKeySet: string;
    apiKeyNotSet: string;
    modelId: string;
    modelIdDesc: string;
    baseUrl: string;
    baseUrlDesc: string;
    baseUrlPlaceholder: string;
    gatewayPort: string;
    gatewayPortDesc: string;
    dataSource: string;
    dataSourceDesc: string;
    embedding: string;
    embeddingDesc: string;
    embeddingModel: string;
    saved: string;
    saveError: string;
    saveButton: string;
    sectionLlm: string;
    sectionModelRepository: string;
    sectionModelAssignments: string;
    sectionGateway: string;
    sectionData: string;
    sectionAdvanced: string;
    sectionTui: string;
    sectionHuawei: string;
    gatewayAutoStart: string;
    gatewayAutoStartDesc: string;
    tuiTheme: string;
    tuiShowToolCalls: string;
    huaweiClientId: string;
    huaweiClientSecret: string;
    huaweiRedirectUri: string;
    huaweiAuthUrl: string;
    huaweiTokenUrl: string;
    huaweiApiBaseUrl: string;
    applyEngine: string;
    applyEngineDesc: string;
    sectionEmbedding: string;
    sectionBenchmark: string;
    sectionJudgeModel: string;
    sectionBenchmarkModels: string;
    benchmarkConcurrency: string;
    benchmarkConcurrencyDesc: string;
    judgeProvider: string;
    judgeModelId: string;
    judgeLabel: string;
    benchmarkModelsJson: string;
    benchmarkModelsJsonDesc: string;
    userUuid: string;
    huaweiScopes: string;
    huaweiScopesDesc: string;
    scopesPerLine: string;
    addScope: string;
    deleteScope: string;
    sectionMcp: string;
    mcpJson: string;
    mcpJsonDesc: string;
    chromeMcpCommand: string;
    chromeMcpArgs: string;
    chromeMcpBrowserUrl: string;
    chromeMcpWsEndpoint: string;
    remoteServers: string;
    addServer: string;
    deleteServer: string;
    sectionPlugins: string;
    pluginsJson: string;
    pluginsJsonDesc: string;
    pluginEnabled: string;
    pluginPaths: string;
    addModel: string;
    deleteModel: string;
    addProvider: string;
    deleteProvider: string;
    providerBaseUrl: string;
    providerApiKey: string;
    modelName: string;
    modelActualId: string;
    modelLabel: string;
    agentModelSelect: string;
    systemAgentModelSelect: string;
    judgeModelSelect: string;
    embeddingModelSelect: string;
    benchmarkModelsSelect: string;
    saveRepository: string;
    saveAssignments: string;
    noneSelected: string;
    saveAll: string;
    rawConfig: string;
    copyConfig: string;
    downloadConfig: string;
  };

  // Plans page
  plans: {
    title: string;
    subtitle: string;
    tabActive: string;
    tabCompleted: string;
    tabArchived: string;
    statusActive: string;
    statusPaused: string;
    statusCompleted: string;
    statusArchived: string;
    goalsCompleted: string;
    daysRemaining: string;
    viewDetails: string;
    noPlans: string;
    askAgentHint: string;
    goalLabel: string;
    target: string;
    current: string;
    progress: string;
    status: string;
    milestones: string;
    adjustmentHistory: string;
    date: string;
    reason: string;
    changes: string;
    pause: string;
    resume: string;
    complete: string;
    archive: string;
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
