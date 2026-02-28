/**
 * Navigation Handlers — extracted from GatewaySession.handleNavigate()
 *
 * Each handler corresponds to a `case` in the original switch statement.
 * The dispatch map replaces a CC=148, Lines=568 method.
 */

import { join } from 'path';
import { existsSync, readFileSync } from 'fs';
import { t } from '../locales/index.js';
import {
  loadConfig,
  saveConfig,
  getUserId,
  getStateDir,
  PROVIDER_CONFIGS,
  listAllModelRefs,
  stripLegacyFieldsForSave,
} from '../utils/config.js';
import { getAgentProfile, getAgentProfileIds } from '../agent/pha-agent.js';
import { getMemoryManager } from '../memory/index.js';
import { getRecentDailyLogs, getUserDir } from '../memory/profile.js';
import { listPlans } from '../plans/store.js';
import type { PlanStatus } from '../plans/types.js';
import { listRecommendations, listReminders as listRemindersStore, listCalendarEvents } from '../proactive/store.js';
import { listSkillsTool, getSkillTool, getSkillsDir } from '../tools/skill-tools.js';
import { globalRegistry } from '../tools/index.js';
import { systemMemoryReadTool } from '../tools/system-memory-tools.js';
import {
  generateChatPage,
  generateMemoryPage,
  generatePromptsPage,
  generateSkillsPage,
  generateToolsPage,
  generateIntegrationsPage,
  generateSystemAgentPage,
  generateLogsPage,
  generateSettingsPage,
  generatePlansPage,
  generateAuthRequiredPage,
  generateExperimentPage,
} from './pages.js';
import { generateEvolutionLab } from './evolution-lab.js';
import { generateWorkbenchPage } from './workbench-page.js';
import { initializeWorkbench } from './workbench-init.js';
import { discoverPlugins } from '../plugins/discovery.js';
import { loadPluginManifest } from '../plugins/manifest.js';
import { readLogFile, subscribeToLogs, type LogEntry, createLogger } from '../utils/logger.js';
import { basename } from 'path';
import type { GatewaySession } from './server.js';
import type { A2UIMessage } from './a2ui.js';

const log = createLogger('Gateway');
const logMemory = log.child('Memory');
const logEvolution = log.child('Evolution');

type SendFn = (msg: unknown) => void;

/** Send an array of A2UIMessage objects one by one through the send function */
function sendAll(send: SendFn, messages: A2UIMessage[]): void {
  for (const msg of messages) {
    send(msg);
  }
}

// ── View handlers ──────────────────────────────────────────────────

async function navigateChat(session: GatewaySession): Promise<A2UIMessage[] | null> {
  return generateChatPage({
    messages: session.chatMessages,
    streaming: session.isStreaming,
    streamingContent: session.streamingContent,
  });
}

async function navigateSystemAgent(session: GatewaySession): Promise<A2UIMessage[] | null> {
  return generateSystemAgentPage({
    chatMessages: session.systemAgentChatMessages,
    streaming: session.systemAgentStreaming,
    streamingContent: session.systemAgentStreamingContent,
  });
}

async function navigateLegacyChat(session: GatewaySession): Promise<A2UIMessage[] | null> {
  return generateChatPage({
    messages: session.legacyChatMessages,
    streaming: session.legacyChatStreaming,
    streamingContent: session.legacyChatStreamingContent,
    thinkingMode: true,
  });
}

async function navigateDashboard(
  session: GatewaySession,
  view: string,
  send: SendFn,
  signal?: AbortSignal
): Promise<'early-return'> {
  // Map legacy views to dashboard tabs
  if (view === 'health') {
    session.dashboardTab = 'vitals';
  } else if (view === 'sleep') {
    session.dashboardTab = 'sleep';
  } else if (view === 'activity') {
    session.dashboardTab = 'activity';
  }

  // Use progressive loader for dashboard
  if (!(session as unknown as { dashboardLoader: unknown }).dashboardLoader) {
    const { ProgressiveDashboardLoader } = await import('./progressive-loader.js');
    (session as unknown as { dashboardLoader: unknown }).dashboardLoader = new ProgressiveDashboardLoader(
      session.dataSource,
      send
    );
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (session as any).dashboardLoader.updateSend(send);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const loader = (session as any).dashboardLoader;
  loader.whitelisted = session.isWhitelisted();
  await loader.load(session.dashboardTab, signal);
  return 'early-return';
}

async function navigatePlans(session: GatewaySession): Promise<A2UIMessage[] | null> {
  const uuid = session.userUuid || getUserId() || 'anonymous';
  const tab = session.plansTab;
  const planStatusMap: Record<string, PlanStatus> = {
    active: 'active',
    completed: 'completed',
    archived: 'archived',
  };
  const filterStatus = planStatusMap[tab];
  const plans = filterStatus ? listPlans(uuid, filterStatus) : [];
  return generatePlansPage({
    activeTab: tab,
    plans,
    recommendations: tab === 'recommendations' ? listRecommendations(uuid, 'active') : undefined,
    reminders: tab === 'reminders' ? listRemindersStore(uuid) : undefined,
    events: tab === 'calendar' ? listCalendarEvents(uuid) : undefined,
  });
}

async function navigateMemory(session: GatewaySession, send: SendFn): Promise<'early-return'> {
  // Send loading page immediately
  sendAll(
    send,
    session.buildPage(
      'memory',
      generateMemoryPage({
        activeTab: session.memoryTab,
        profileCompleteness: 0,
        profile: {} as never,
        missingFields: [],
        memorySummary: '',
        dailyLogs: [],
        loading: true,
      })
    )
  );

  const mm = getMemoryManager();
  const uuid = session.userUuid || getUserId() || 'anonymous';
  try {
    const saMemoryData = await loadSAMemoryData(session);
    const selectedLogContent = loadSelectedLogContent(session, uuid);

    const memoryPage = generateMemoryPage({
      activeTab: session.memoryTab,
      profileCompleteness: mm.getProfileCompleteness(uuid),
      profile: mm.getProfile(uuid),
      missingFields: mm.getAllMissingProfileKeys(uuid),
      memorySummary: readMemorySummary(uuid),
      dailyLogs: getRecentDailyLogs(uuid, 7),
      searchQuery: session.memorySearchQuery,
      searchResults: session.memorySearchResults,
      selectedLogDate: session.selectedLogDate || undefined,
      selectedLogContent,
      ...saMemoryData,
    });
    sendAll(send, session.buildPage('memory', memoryPage));
  } catch (e) {
    logMemory.error('Load error', { error: e });
  }
  return 'early-return';
}

async function navigatePrompts(session: GatewaySession, send: SendFn): Promise<'early-return'> {
  sendAll(
    send,
    session.buildPage(
      'settings/prompts',
      generatePromptsPage({
        files: [],
        loading: true,
        scope: session.promptsScope,
      })
    )
  );

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const files = (session as any).buildOpenClaw8Files();
    sendAll(
      send,
      session.buildPage(
        'settings/prompts',
        generatePromptsPage({
          files,
          scope: session.promptsScope,
        })
      )
    );
  } catch (e) {
    log.error('Prompts load error', { error: e });
  }
  return 'early-return';
}

async function navigateSkills(session: GatewaySession, send: SendFn): Promise<'early-return'> {
  sendAll(
    send,
    session.buildPage(
      'settings/skills',
      generateSkillsPage({
        skills: [],
        editing: false,
        loading: true,
        category: session.skillsCategory,
      })
    )
  );

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const skillsResult = (await listSkillsTool.execute({})) as any;
    let content: string | undefined;
    let language: string | undefined;

    if (session.selectedSkill) {
      const skillResult = (await getSkillTool.execute({
        name: session.selectedSkill,
        filePath: session.selectedSkillFile,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      })) as any;
      if (skillResult.success && 'content' in skillResult) {
        content = session.editBuffer ?? skillResult.content;
        language = skillResult.language as string | undefined;
      }
    }

    const enrichedSkills = await Promise.all(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (skillsResult.skills || []).map(async (s: any) => {
        if (s.name === session.selectedSkill) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const info = (await getSkillTool.execute({ name: s.name })) as any;
          return { ...s, structure: info.success ? info.structure : undefined };
        }
        return s;
      })
    );

    sendAll(
      send,
      session.buildPage(
        'settings/skills',
        generateSkillsPage({
          skills: enrichedSkills,
          selectedSkill: session.selectedSkill || undefined,
          selectedSkillFile: session.selectedSkillFile,
          content,
          language,
          editing: session.editingSkill,
          category: session.skillsCategory,
        })
      )
    );
  } catch (e) {
    log.error('Skills load error', { error: e });
  }
  return 'early-return';
}

async function navigateTools(session: GatewaySession, send: SendFn): Promise<'early-return'> {
  const toolsData = globalRegistry.getToolsPageData();
  sendAll(
    send,
    session.buildPage(
      'settings/tools',
      generateToolsPage({
        tools: toolsData,
        selectedCategory: session.toolsCategory,
      })
    )
  );
  return 'early-return';
}

async function navigateEvolution(session: GatewaySession, send: SendFn): Promise<'early-return'> {
  session.currentView = 'evolution';
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const labData = (session as any).buildEvolutionLabData();
    const labPage = generateEvolutionLab(labData);
    sendAll(send, session.buildPage('evolution', labPage));
  } catch (e) {
    logEvolution.error('Lab load error', { error: e });
  }
  return 'early-return';
}

async function navigateIntegrations(session: GatewaySession, send: SendFn): Promise<'early-return'> {
  sendAll(
    send,
    session.buildPage(
      'settings/integrations',
      generateIntegrationsPage({
        activeTab: session.integrationsTab,
        ghAvailable: true,
        loading: true,
      })
    )
  );

  session.loadIntegrationsAsync(send).catch((e: unknown) => {
    log.error('Integrations load error', { error: e });
  });
  return 'early-return';
}

async function navigateLogs(session: GatewaySession, send: SendFn): Promise<A2UIMessage[] | null> {
  // Unsubscribe from previous log subscription
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = session as any;
  if (s.logsUnsubscribe) {
    s.logsUnsubscribe();
    s.logsUnsubscribe = null;
  }

  // Read today's system logs with filters applied
  const allEntries = readLogFile(undefined, 500);
  let filteredEntries = allEntries;
  if (session.logsLevelFilter) {
    filteredEntries = filteredEntries.filter((e) => e.level === session.logsLevelFilter);
  }
  if (session.logsSubsystemFilter) {
    filteredEntries = filteredEntries.filter((e) => e.subsystem === session.logsSubsystemFilter);
  }

  const levels = [...new Set(allEntries.map((e) => e.level))].sort();
  const subsystems = [...new Set(allEntries.map((e) => e.subsystem))].sort();

  // Read LLM call logs
  const { readLlmLogFile, getLlmProviders, getLlmModels } = await import('../utils/llm-logger.js');
  let allLlmCalls = readLlmLogFile(undefined, 1000);
  const llmProviders = getLlmProviders();
  const llmModels = getLlmModels();
  if (session.llmProviderFilter) {
    allLlmCalls = allLlmCalls.filter((c) => c.provider === session.llmProviderFilter);
  }
  if (session.llmModelFilter) {
    allLlmCalls = allLlmCalls.filter((c) => c.model === session.llmModelFilter);
  }
  const llmTotal = allLlmCalls.length;
  const llmPageSize = 20;
  const pagedCalls = allLlmCalls.slice(session.llmPage * llmPageSize, (session.llmPage + 1) * llmPageSize);

  const mainPage = generateLogsPage({
    activeTab: session.logsTab,
    entries: filteredEntries.map((e) => ({
      time: e.time,
      level: e.level,
      subsystem: e.subsystem,
      message: e.message,
      data: e.data,
    })),
    levels,
    subsystems,
    activeLevel: session.logsLevelFilter,
    activeSubsystem: session.logsSubsystemFilter,
    llmCalls: pagedCalls,
    llmProviders,
    llmModels,
    llmActiveProvider: session.llmProviderFilter,
    llmActiveModel: session.llmModelFilter,
    llmPage: session.llmPage,
    llmPageSize,
    llmTotal,
    llmSelectedId: session.llmSelectedId,
  });

  // Subscribe to real-time log entries (system logs)
  s.logsUnsubscribe = subscribeToLogs((entry: LogEntry) => {
    if (session.logsLevelFilter && entry.level !== session.logsLevelFilter) {
      return;
    }
    if (session.logsSubsystemFilter && entry.subsystem !== session.logsSubsystemFilter) {
      return;
    }
    send({
      type: 'log_entry',
      entry: {
        time: entry.time,
        level: entry.level,
        subsystem: entry.subsystem,
        message: entry.message,
        data: entry.data,
      },
    });
  });

  // Subscribe to real-time LLM call pairs
  if (s.llmLogsUnsubscribe) {
    s.llmLogsUnsubscribe();
    s.llmLogsUnsubscribe = null;
  }
  const { subscribeToLlmLogs } = await import('../utils/llm-logger.js');
  s.llmLogsUnsubscribe = subscribeToLlmLogs(() => {
    if (session.logsTab === 'llm' && session.currentView === 'settings/logs') {
      session.handleNavigate('settings/logs', send).catch(() => {});
    }
  });

  return mainPage;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractLlmSettings(config: any): Record<string, unknown> {
  return {
    provider: config.llm.provider,
    apiKeySet: !!config.llm.apiKey,
    modelId: config.llm.modelId || PROVIDER_CONFIGS[config.llm.provider]?.defaultModel || '',
    baseUrl: config.llm.baseUrl || PROVIDER_CONFIGS[config.llm.provider]?.baseUrl || '',
    orchestratorPha: config.orchestrator?.pha || '',
    orchestratorSa: config.orchestrator?.sa || '',
    orchestratorJudge: config.orchestrator?.judge || '',
    orchestratorEmbedding: config.orchestrator?.embedding || '',
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractHuaweiSettings(huawei: any): Record<string, unknown> {
  return {
    huaweiClientId: huawei.clientId || '',
    huaweiClientSecret: huawei.clientSecret || '',
    huaweiRedirectUri: huawei.redirectUri || '',
    huaweiAuthUrl: huawei.authUrl || '',
    huaweiTokenUrl: huawei.tokenUrl || '',
    huaweiApiBaseUrl: huawei.apiBaseUrl || '',
    huaweiScopes: huawei.scopes || [],
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractChromeAndPlugins(chromeMcp: any, pluginsConfig: any): Record<string, unknown> {
  return {
    chromeMcpCommand: chromeMcp.command || 'npx',
    chromeMcpArgs: (chromeMcp.args || []).join(', '),
    chromeMcpBrowserUrl: chromeMcp.browserUrl || '',
    chromeMcpWsEndpoint: chromeMcp.wsEndpoint || '',
    pluginEnabled: pluginsConfig.enabled ?? true,
    pluginPaths: (pluginsConfig.paths || []).join(', '),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractGatewayAndDataSettings(config: any): Record<string, unknown> {
  return {
    gatewayPort: config.gateway?.port || 8000,
    gatewayAutoStart: config.gateway?.autoStart ?? false,
    dataSourceType: config.dataSources?.type || 'mock',
    embeddingEnabled: config.embedding?.enabled ?? false,
    embeddingModel: config.embedding?.model || 'openai/text-embedding-3-small',
    tuiTheme: config.tui?.theme || 'dark',
    tuiShowToolCalls: config.tui?.showToolCalls ?? true,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractContextAndProactive(config: any): Record<string, unknown> {
  return {
    applyEngine: config.applyEngine || 'claude-code',
    benchmarkConcurrency: config.benchmark?.concurrency || 1,
    benchmarkModelRefs: config.benchmark?.models || [],
    contextLocation: config.context?.location || '',
    contextHemisphere: config.context?.hemisphere || 'north',
    proactiveEnabled: config.proactive?.enabled !== false,
    proactiveCheckInterval: config.proactive?.checkIntervalMinutes ?? 5,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractInfraSettings(config: any): Record<string, unknown> {
  return {
    ...extractGatewayAndDataSettings(config),
    ...extractHuaweiSettings(config.dataSources?.huawei || {}),
    ...extractChromeAndPlugins(config.mcp?.chromeMcp || {}, config.plugins || {}),
    ...extractContextAndProactive(config),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractBenchmarkAndJudge(config: any): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const judge: { provider?: any; modelId?: any; label?: any } =
    typeof config.judgeModel === 'object' && config.judgeModel ? config.judgeModel : {};
  const bmRecord = config.benchmarkModels || {};
  return {
    judgeProvider: judge.provider || config.llm.provider,
    judgeModelId: judge.modelId || '',
    judgeLabel: judge.label || '',
    benchmarkModels: Object.entries(bmRecord).map(([key, val]) => {
      const m = val as { provider?: string; modelId?: string; label?: string };
      return {
        key,
        provider: m.provider || config.llm.provider,
        modelId: m.modelId || '',
        label: m.label || '',
      };
    }),
  };
}

function extractRemoteServers(
  config: any
): Array<{ key: string; url: string; apiKey: string; name: string; enabled: boolean }> {
  const record = config.mcp?.remoteServers || {};
  return Object.entries(record).map(([key, val]) => {
    const s = val as { url?: string; apiKey?: string; name?: string; enabled?: boolean };
    return {
      key,
      url: s.url || '',
      apiKey: s.apiKey || '',
      name: s.name || '',
      enabled: s.enabled ?? true,
    };
  });
}

async function navigateGeneral(session: GatewaySession): Promise<A2UIMessage[] | null> {
  const config = loadConfig();
  const providers = Object.entries(PROVIDER_CONFIGS).map(([key, cfg]) => ({
    value: key,
    label: cfg.name,
    hint: cfg.hint,
  }));
  const pluginsConfig = config.plugins || {};
  const { agentProfiles, configTags } = await buildAgentProfilesAndTags(config, session._settingsExpandedAgent);

  return generateSettingsPage({
    providers,
    ...extractLlmSettings(config),
    modelProviders: buildModelProviders(config),
    allModelRefs: listAllModelRefs(config),
    agentProfiles,
    configTags,
    expandedAgentId: session._settingsExpandedAgent,
    ...extractInfraSettings(config),
    ...extractBenchmarkAndJudge(config),
    userId: session.userUuid || config.uid || '',
    remoteServers: extractRemoteServers(config),
    pluginEntries: buildPluginEntries(pluginsConfig),
    rawConfigJson: JSON.stringify(stripLegacyFieldsForSave(config), null, 2),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

async function navigateExperiment(session: GatewaySession): Promise<A2UIMessage[] | null> {
  return generateExperimentPage(session.customDashboards, session.activeDashboardTab);
}

// ── Helpers ──────────────────────────────────────────────────────

function readMemorySummary(uuid: string): string {
  const memPath = join(getUserDir(uuid), 'MEMORY.md');
  try {
    return existsSync(memPath) ? readFileSync(memPath, 'utf-8') : '';
  } catch {
    return '';
  }
}

async function loadSAMemoryData(session: GatewaySession): Promise<{
  saMemoryFiles?: Array<{ name: string; displayName: string; lines: number; preview: string }>;
  saSelectedMemoryFile?: string;
  saMemoryContent?: string;
  saEditingMemory?: boolean;
}> {
  if (session.memoryTab !== 'system-agent') {
    return {
      saSelectedMemoryFile: session.saSelectedMemoryFile || undefined,
      saEditingMemory: session.saEditingMemory,
    };
  }

  const SA_MEMORY_FILES = [
    { name: 'memory', displayName: 'memory.md' },
    { name: 'evolution-log', displayName: 'evolution-log.md' },
    { name: 'tool-wishlist', displayName: 'tool-wishlist.md' },
    { name: 'experience', displayName: 'experience.md' },
  ];

  const saMemoryFiles = await Promise.all(
    SA_MEMORY_FILES.map(async (f) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (await systemMemoryReadTool.execute({ file: f.name })) as any;
      const fileContent = result.content === '(empty)' ? '' : result.content;
      return {
        name: f.name,
        displayName: f.displayName,
        lines: result.lines || 0,
        preview: fileContent ? fileContent.split('\n').slice(0, 2).join(' ').slice(0, 80) : '',
      };
    })
  );

  let saMemoryContent: string | undefined;
  if (session.saSelectedMemoryFile) {
    const result = (await systemMemoryReadTool.execute({
      file: session.saSelectedMemoryFile,
    })) as any;
    const raw = result.content === '(empty)' ? '' : result.content;
    saMemoryContent = session.editBuffer ?? raw;
  }

  return {
    saMemoryFiles,
    saSelectedMemoryFile: session.saSelectedMemoryFile || undefined,
    saMemoryContent,
    saEditingMemory: session.saEditingMemory,
  };
}

function loadSelectedLogContent(session: GatewaySession, uuid: string): string | undefined {
  if (session.memoryTab !== 'logs' || !session.selectedLogDate) {
    return undefined;
  }
  const logPath = join(getUserDir(uuid), 'memory', `${session.selectedLogDate}.md`);
  try {
    return readFileSync(logPath, 'utf-8');
  } catch {
    return '';
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildModelProviders(config: any): Array<{
  key: string;
  baseUrl: string;
  apiKeySet: boolean;
  models: Array<{ name: string; model: string; label: string }>;
}> {
  const result: Array<{
    key: string;
    baseUrl: string;
    apiKeySet: boolean;
    models: Array<{ name: string; model: string; label: string }>;
  }> = [];
  if (config.models?.providers) {
    for (const [key, providerCfg] of Object.entries(config.models.providers)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = providerCfg as any;
      result.push({
        key,
        baseUrl: p.baseUrl || '',
        apiKeySet: !!p.apiKey,
        models: (p.models || []).map((m: { name: string; model: string; label?: string }) => ({
          name: m.name,
          model: m.model,
          label: m.label || '',
        })),
      });
    }
  }
  return result;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildPluginEntries(pluginsConfig: any): Array<{
  id: string;
  name: string;
  description: string;
  version: string;
  origin: string;
  enabled: boolean;
  config: string;
}> {
  const discovered = discoverPlugins({
    workspaceDir: getStateDir(),
    extraPaths: pluginsConfig.paths,
  });
  return discovered.candidates.map((c) => {
    const manifest = loadPluginManifest(c.dir);
    const id = manifest.ok ? manifest.manifest.id : basename(c.dir);
    const cfgEntry = (pluginsConfig.entries || {})[id];
    return {
      id,
      name: manifest.ok ? manifest.manifest.name || id : id,
      description: manifest.ok ? manifest.manifest.description || '' : '',
      version: manifest.ok ? manifest.manifest.version || '' : '',
      origin: c.origin,
      enabled: cfgEntry?.enabled ?? true,
      config: cfgEntry?.config ? JSON.stringify(cfgEntry.config, null, 2) : '{}',
    };
  });
}

async function buildAgentProfilesAndTags(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config: any,
  expandedAgent?: string
): Promise<{
  agentProfiles: Array<{
    id: string;
    label: string;
    model: string;
    workspace: string;
    sessionPath: string;
    toolTags: string[];
    skillTags: string[];
  }>;
  configTags: string[];
}> {
  const profileIds = getAgentProfileIds();
  const agentProfiles = profileIds.map((id) => {
    const p = getAgentProfile(id);
    return {
      id,
      label: id,
      model: p.model || '',
      workspace: p.workspace || '',
      sessionPath: p.sessionPath || '',
      toolTags: p.tools.tags || [],
      skillTags: p.skills?.tags || [],
    };
  });

  let configTags = config.tags || [];
  if (configTags.length === 0) {
    const tagSet = new Set<string>();
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const skillsResult = (await listSkillsTool.execute({})) as any;
      for (const s of skillsResult.skills || []) {
        for (const tag of s.tags || []) {
          tagSet.add(tag);
        }
      }
    } catch {
      tagSet.add('pha');
      tagSet.add('sa');
    }
    for (const ap of agentProfiles) {
      for (const t2 of ap.toolTags) {
        tagSet.add(t2);
      }
      for (const t2 of ap.skillTags) {
        tagSet.add(t2);
      }
    }
    configTags = [...tagSet].sort();
    config.tags = configTags;
    saveConfig(config);
  }

  return { agentProfiles, configTags };
}

// ── Dispatch map ────────────────────────────────────────────────

type NavResult = A2UIMessage[] | null | 'early-return';
type NavHandler = (session: GatewaySession, view: string, send: SendFn, signal?: AbortSignal) => Promise<NavResult>;

const NAV_HANDLERS: Record<string, NavHandler> = {
  chat: async (s) => navigateChat(s),
  'system-agent': async (s) => navigateSystemAgent(s),
  'legacy-chat': async (s) => navigateLegacyChat(s),
  dashboard: async (s, v, send, signal) => navigateDashboard(s, v, send, signal),
  health: async (s, v, send, signal) => navigateDashboard(s, v, send, signal),
  sleep: async (s, v, send, signal) => navigateDashboard(s, v, send, signal),
  activity: async (s, v, send, signal) => navigateDashboard(s, v, send, signal),
  plans: async (s) => navigatePlans(s),
  memory: async (s, _v, send) => navigateMemory(s, send),
  'settings/prompts': async (s, _v, send) => navigatePrompts(s, send),
  'settings/skills': async (s, _v, send) => navigateSkills(s, send),
  'settings/tools': async (s, _v, send) => navigateTools(s, send),
  'settings/system-agent': async (s, _v, send) => {
    s.promptsScope = 'system';
    s.currentView = 'settings/prompts';
    await s.handleNavigate('settings/prompts', send);
    return 'early-return';
  },
  evolution: async (s, _v, send) => navigateEvolution(s, send),
  'settings/evolution': async (s, _v, send) => {
    s.currentView = 'evolution';
    await s.handleNavigate('evolution', send);
    return 'early-return';
  },
  'settings/evolution-legacy': async (s, _v, send) => {
    s.currentView = 'evolution';
    await s.handleNavigate('evolution', send);
    return 'early-return';
  },
  'settings/integrations': async (s, _v, send) => navigateIntegrations(s, send),
  'settings/logs': async (s, _v, send) => navigateLogs(s, send),
  'settings/general': async (s) => navigateGeneral(s),
  experiment: async (s) => navigateExperiment(s),
  workbench: async (s) => {
    if (!s.workbenchState) s.workbenchState = await initializeWorkbench();
    return generateWorkbenchPage(s.workbenchState);
  },
};

/**
 * Dispatch navigation to the appropriate handler.
 * Returns the page data to be wrapped in buildPage, or null if the handler already sent.
 */
export async function dispatchNavigation(
  session: GatewaySession,
  view: string,
  send: SendFn,
  signal?: AbortSignal
): Promise<void> {
  // Unsubscribe from logs when navigating away
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = session as any;
  if (session.currentView === 'settings/logs' && view !== 'settings/logs') {
    if (s.logsUnsubscribe) {
      s.logsUnsubscribe();
      s.logsUnsubscribe = null;
    }
    if (s.llmLogsUnsubscribe) {
      s.llmLogsUnsubscribe();
      s.llmLogsUnsubscribe = null;
    }
  }

  session.currentView = view;

  // Auth check (all views except settings/*)
  const authExemptViews = [
    'settings/general',
    'settings/integrations',
    'settings/prompts',
    'settings/skills',
    'settings/tools',
    'settings/logs',
    'settings/evolution',
    'settings/evolution-legacy',
  ];
  const authConfig = loadConfig();
  if (authConfig.dataSources.type === 'huawei' && !session.isUserAuthenticated()) {
    if (!authExemptViews.some((v) => view.startsWith(v))) {
      const mainPage = generateAuthRequiredPage();
      sendAll(send, session.buildPage('auth', mainPage));
      return;
    }
  }

  // Whitelist check: non-whitelisted users can only access chat + dashboard
  const WHITELIST_ALLOWED_VIEWS = ['chat', 'dashboard'];
  if (!session.isWhitelisted() && !WHITELIST_ALLOWED_VIEWS.includes(view)) {
    session.currentView = 'chat';
    await dispatchNavigation(session, 'chat', send);
    return;
  }

  const handler = NAV_HANDLERS[view];
  if (handler) {
    const result = await handler(session, view, send, signal);
    if (result === 'early-return' || result === null) {
      return;
    }
    // result is A2UIMessage[]
    sendAll(send, session.buildPage(view, result));
  } else {
    // Default: chat page
    const mainPage = generateChatPage({
      messages: session.chatMessages,
      streaming: session.isStreaming,
      streamingContent: session.streamingContent,
    });
    sendAll(send, session.buildPage(view, mainPage));
  }
}
