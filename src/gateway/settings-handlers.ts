/**
 * Settings Action Handlers — extracted from handleAction settings_* branches.
 *
 * Uses a dispatch map of config mutators: each action maps to a function
 * that receives (config, formData) and mutates the config in place.
 */

import type { GatewaySession, SendFn } from "./server.js";
import { t } from "../locales/index.js";
import {
  loadConfig,
  saveConfig,
  type LLMProvider,
  type BenchmarkModelConfig,
  type PHAConfig,
} from "../utils/config.js";
import { getAgentProfile } from "../agent/pha-agent.js";
import { generateToast } from "./pages.js";
import type { A2UIMessage } from "./a2ui.js";

type FormData = Record<string, unknown>;

/** Send an array of A2UIMessage objects one by one through the send function */
function sendAll(send: SendFn, messages: A2UIMessage[]): void {
  for (const msg of messages) send(msg);
}

// ============================================================================
// Embedding sync helper (moved from server.ts)
// ============================================================================

export function syncEmbeddingToNewFormat(config: PHAConfig, formData: FormData): void {
  const enabled = formData.embeddingEnabled === "true";
  const modelId = formData.embeddingModel ? String(formData.embeddingModel) : undefined;

  if (!enabled || !modelId) {
    if (!config.orchestrator) config.orchestrator = {};
    config.orchestrator.embedding = undefined;
    return;
  }

  if (!config.models) config.models = { providers: {} };

  let targetProvider: string | undefined;
  const phaRef = config.orchestrator?.pha;
  if (phaRef) {
    const slashIdx = phaRef.indexOf("/");
    if (slashIdx > 0) targetProvider = phaRef.substring(0, slashIdx);
  }
  if (!targetProvider) {
    targetProvider = Object.keys(config.models.providers)[0] || "openrouter";
  }
  if (!config.models.providers[targetProvider]) {
    config.models.providers[targetProvider] = { models: [] };
  }

  const parts = modelId.split("/");
  const embName = parts[parts.length - 1];

  const provModels = config.models.providers[targetProvider].models;
  if (!provModels.find((m) => m.model === modelId)) {
    provModels.push({ name: embName, model: modelId });
  }

  const existing = provModels.find((m) => m.model === modelId);
  if (!config.orchestrator) config.orchestrator = {};
  config.orchestrator.embedding = `${targetProvider}/${existing?.name || embName}`;
}

// ============================================================================
// Config mutator type
// ============================================================================

type ConfigMutator = (config: PHAConfig, formData: FormData, session: GatewaySession) => void;

// ============================================================================
// Individual settings mutators
// ============================================================================

const saveLlm: ConfigMutator = (config, formData) => {
  if (formData.provider) config.llm.provider = formData.provider as LLMProvider;
  if (formData.apiKey && formData.apiKey !== "••••••••")
    config.llm.apiKey = String(formData.apiKey);
  if (formData.modelId) config.llm.modelId = String(formData.modelId);
  if (formData.baseUrl !== undefined) config.llm.baseUrl = String(formData.baseUrl) || undefined;
};

const saveGateway: ConfigMutator = (config, formData) => {
  if (formData.port) config.gateway.port = Number(formData.port) || 8000;
  if (formData.autoStart !== undefined) config.gateway.autoStart = formData.autoStart === "true";
};

const saveDatasource: ConfigMutator = (config, formData) => {
  if (formData.dataSourceType)
    config.dataSources.type = formData.dataSourceType as "mock" | "huawei" | "apple";
  if (config.dataSources.type === "huawei") {
    if (!config.dataSources.huawei) config.dataSources.huawei = {};
    const hw = config.dataSources.huawei;
    if (formData.huaweiClientId !== undefined)
      hw.clientId = String(formData.huaweiClientId) || undefined;
    if (formData.huaweiClientSecret !== undefined)
      hw.clientSecret = String(formData.huaweiClientSecret) || undefined;
    if (formData.huaweiRedirectUri !== undefined)
      hw.redirectUri = String(formData.huaweiRedirectUri) || undefined;
    if (formData.huaweiAuthUrl !== undefined)
      hw.authUrl = String(formData.huaweiAuthUrl) || undefined;
    if (formData.huaweiTokenUrl !== undefined)
      hw.tokenUrl = String(formData.huaweiTokenUrl) || undefined;
    if (formData.huaweiApiBaseUrl !== undefined)
      hw.apiBaseUrl = String(formData.huaweiApiBaseUrl) || undefined;
  }
};

const saveTui: ConfigMutator = (config, formData) => {
  if (!config.tui) config.tui = { theme: "dark", showToolCalls: true };
  if (formData.tuiTheme) config.tui.theme = formData.tuiTheme as "dark" | "light";
  if (formData.tuiShowToolCalls !== undefined)
    config.tui.showToolCalls = formData.tuiShowToolCalls === "true";
};

const saveAdvanced: ConfigMutator = (config, formData) => {
  if (!config.embedding) config.embedding = {};
  if (formData.embeddingEnabled !== undefined)
    config.embedding.enabled = formData.embeddingEnabled === "true";
  if (formData.embeddingModel) config.embedding.model = String(formData.embeddingModel);
  if (formData.applyEngine)
    config.applyEngine = formData.applyEngine as "claude-code" | "pi-coding-agent";
  syncEmbeddingToNewFormat(config, formData);
};

const saveEmbedding: ConfigMutator = (config, formData) => {
  if (!config.embedding) config.embedding = {};
  if (formData.embeddingEnabled !== undefined)
    config.embedding.enabled = formData.embeddingEnabled === "true";
  if (formData.embeddingModel) config.embedding.model = String(formData.embeddingModel);
  syncEmbeddingToNewFormat(config, formData);
};

const saveBenchmark: ConfigMutator = (config, formData) => {
  if (!config.benchmark) config.benchmark = {};
  if (formData.benchmarkConcurrency !== undefined)
    config.benchmark.concurrency = Number(formData.benchmarkConcurrency) || 1;
  if (formData.applyEngine)
    config.applyEngine = formData.applyEngine as "claude-code" | "pi-coding-agent";
  if (!config.judgeModel || typeof config.judgeModel === "string")
    config.judgeModel = { provider: config.llm.provider, modelId: "" } as BenchmarkModelConfig;
  const jm = config.judgeModel as BenchmarkModelConfig;
  if (formData.judgeProvider) jm.provider = formData.judgeProvider as LLMProvider;
  if (formData.judgeModelId !== undefined) jm.modelId = String(formData.judgeModelId);
  if (formData.judgeLabel !== undefined) jm.label = String(formData.judgeLabel) || undefined;
  config.judgeModel = jm;
};

const saveBenchmarkV2: ConfigMutator = (config, formData) => {
  if (!config.benchmark) config.benchmark = {};
  if (formData.benchmarkConcurrency !== undefined)
    config.benchmark.concurrency = Number(formData.benchmarkConcurrency) || 1;
  if (formData.applyEngine)
    config.applyEngine = formData.applyEngine as "claude-code" | "pi-coding-agent";
};

const saveBenchmarkV3: ConfigMutator = (config, formData) => {
  if (!config.benchmark) config.benchmark = {};
  if (formData.benchmarkConcurrency !== undefined)
    config.benchmark.concurrency = Number(formData.benchmarkConcurrency) || 1;
  if (formData.applyEngine)
    config.applyEngine = formData.applyEngine as "claude-code" | "pi-coding-agent";
  const selectedRefs: string[] = [];
  for (const [k, v] of Object.entries(formData)) {
    if (k.startsWith("bm_ref__") && v === "true") {
      selectedRefs.push(k.replace("bm_ref__", ""));
    }
  }
  config.benchmark.models = selectedRefs;
};

const saveBenchmarkV4: ConfigMutator = (config, formData) => {
  if (!config.benchmark) config.benchmark = {};
  config.benchmark.concurrency = Number(formData.benchmarkConcurrency) || 1;
  if (formData.applyEngine)
    config.applyEngine = formData.applyEngine as "claude-code" | "pi-coding-agent";
  if (!config.orchestrator) config.orchestrator = {};
  config.orchestrator.judge = String(formData.benchmarkJudgeModel || "") || undefined;
};

type ProviderEntry = {
  baseUrl?: string;
  apiKey?: string;
  models: Array<{ name: string; model: string; label?: string }>;
};

function parseProviderFormFields(
  formData: FormData,
  existingProviders: Record<string, ProviderEntry> | undefined
): Record<string, ProviderEntry> {
  const result: Record<string, ProviderEntry> = {};
  for (const [k, v] of Object.entries(formData)) {
    parseProviderField(k, v, result, existingProviders);
    parseModelField(k, v, result);
  }
  // Preserve providers not in form
  for (const [pk, pv] of Object.entries(existingProviders || {})) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!result[pk]) result[pk] = pv as any;
  }
  return result;
}

function parseProviderField(
  k: string,
  v: unknown,
  providers: Record<string, ProviderEntry>,
  existing: Record<string, ProviderEntry> | undefined
): void {
  const match = k.match(/^mp__(.+?)__(?:baseUrl|apiKey)$/);
  if (!match) return;
  const provKey = match[1];
  if (!providers[provKey]) providers[provKey] = { models: [] };
  if (k.endsWith("__baseUrl")) {
    providers[provKey].baseUrl = String(v) || undefined;
  } else if (k.endsWith("__apiKey")) {
    const val = String(v);
    if (val && val !== "••••••••") {
      providers[provKey].apiKey = val;
    } else if (existing?.[provKey]?.apiKey) {
      providers[provKey].apiKey = existing[provKey].apiKey;
    }
  }
}

function parseModelField(k: string, v: unknown, providers: Record<string, ProviderEntry>): void {
  const match = k.match(/^mp__(.+?)__m__(\d+)__(.+)$/);
  if (!match) return;
  const [, provKey, idxStr, field] = match;
  if (!providers[provKey]) providers[provKey] = { models: [] };
  const idx = parseInt(idxStr, 10);
  while (providers[provKey].models.length <= idx) {
    providers[provKey].models.push({ name: "", model: "" });
  }
  if (field === "name") providers[provKey].models[idx].name = String(v);
  else if (field === "model") providers[provKey].models[idx].model = String(v);
  else if (field === "label") providers[provKey].models[idx].label = String(v) || undefined;
}

function syncLlmFromOrchestrator(
  config: PHAConfig,
  newProviders: Record<string, ProviderEntry>
): void {
  const phaRef = config.orchestrator?.pha;
  if (!phaRef) return;
  const parts = phaRef.split("/");
  if (parts.length < 2) return;
  const agentProvider = parts[0];
  const agentProv = newProviders[agentProvider];
  if (agentProv) {
    config.llm.provider = agentProvider as LLMProvider;
    if (agentProv.apiKey) config.llm.apiKey = agentProv.apiKey;
    if (agentProv.baseUrl) config.llm.baseUrl = agentProv.baseUrl;
  }
}

const saveModelRepository: ConfigMutator = (config, formData) => {
  if (!config.models) config.models = { providers: {} };
  const newProviders = parseProviderFormFields(formData, config.models.providers);
  config.models.providers = newProviders;
  syncLlmFromOrchestrator(config, newProviders);
};

const saveModelAssignments: ConfigMutator = (config, formData) => {
  if (!config.orchestrator) config.orchestrator = {};
  if (formData.orchestratorPha !== undefined)
    config.orchestrator.pha = String(formData.orchestratorPha) || undefined;
  if (formData.orchestratorSa !== undefined)
    config.orchestrator.sa = String(formData.orchestratorSa) || undefined;
  if (formData.orchestratorJudge !== undefined)
    config.orchestrator.judge = String(formData.orchestratorJudge) || undefined;
  if (formData.orchestratorEmbedding !== undefined)
    config.orchestrator.embedding = String(formData.orchestratorEmbedding) || undefined;
  if (config.orchestrator.pha) {
    const parts = config.orchestrator.pha.split("/");
    if (parts.length >= 2 && config.models?.providers) {
      const agentProvider = parts[0];
      const agentName = parts.slice(1).join("/");
      const agentProv = config.models.providers[agentProvider];
      if (agentProv) {
        config.llm.provider = agentProvider as LLMProvider;
        if (agentProv.apiKey) config.llm.apiKey = agentProv.apiKey;
        if (agentProv.baseUrl) config.llm.baseUrl = agentProv.baseUrl;
        const model = agentProv.models?.find((m) => m.name === agentName);
        if (model) config.llm.modelId = model.model;
      }
    }
  }
};

const saveAgents: ConfigMutator = (config, formData) => {
  if (!config.agents) config.agents = {};
  const agentIds = new Set<string>();
  for (const key of Object.keys(formData)) {
    const m = key.match(/^ap__(.+?)__/);
    if (m) agentIds.add(m[1]);
  }
  for (const agentId of agentIds) {
    if (!config.agents[agentId]) config.agents[agentId] = {};
    const ap = config.agents[agentId];
    const pfx = `ap__${agentId}__`;
    const modelRef = String(formData[`${pfx}model`] || "") || undefined;
    if (modelRef) ap.model = modelRef;
    else delete ap.model;
    const workspace = String(formData[`${pfx}workspace`] || "").trim() || undefined;
    if (workspace) ap.workspace = workspace;
    else delete ap.workspace;
    const sessionPath = String(formData[`${pfx}sessionPath`] || "").trim() || undefined;
    if (sessionPath) ap.sessionPath = sessionPath;
    else delete ap.sessionPath;
  }
};

const saveContext: ConfigMutator = (config, formData) => {
  if (!config.context) config.context = {};
  config.context.location = String(formData.contextLocation || "").trim() || undefined;
  config.context.hemisphere = formData.contextHemisphere === "south" ? "south" : "north";
  if (!config.proactive) config.proactive = {};
  config.proactive.enabled =
    formData.proactiveEnabled === "true" || formData.proactiveEnabled === true;
  config.proactive.checkIntervalMinutes =
    parseInt(String(formData.proactiveCheckInterval), 10) || 5;
};

const saveInfraModels: ConfigMutator = (config, formData) => {
  if (!config.orchestrator) config.orchestrator = {};
  config.orchestrator.sa = String(formData.orchestratorSa || "") || undefined;
  config.orchestrator.judge = String(formData.orchestratorJudge || "") || undefined;
  config.orchestrator.embedding = String(formData.orchestratorEmbedding || "") || undefined;
};

const providerAdd: ConfigMutator = (config) => {
  if (!config.models) config.models = { providers: {} };
  const newKey = `provider-${Date.now()}`;
  config.models.providers[newKey] = { models: [] };
};

const providerDelete: ConfigMutator = (config, formData) => {
  const key = formData?.provider as string;
  if (key && config.models?.providers) {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete (config.models.providers as Record<string, unknown>)[key];
  }
};

const providerModelAdd: ConfigMutator = (config, formData) => {
  const provKey = formData?.provider as string;
  if (provKey && config.models?.providers?.[provKey]) {
    config.models.providers[provKey].models.push({ name: "", model: "" });
  }
};

const providerModelDelete: ConfigMutator = (config, formData) => {
  const provKey = formData?.provider as string;
  const idx = Number(formData?.index ?? -1);
  if (provKey && idx >= 0 && config.models?.providers?.[provKey]) {
    config.models.providers[provKey].models.splice(idx, 1);
  }
};

const saveJudge: ConfigMutator = (config, formData) => {
  if (!config.judgeModel || typeof config.judgeModel === "string")
    config.judgeModel = { provider: config.llm.provider, modelId: "" } as BenchmarkModelConfig;
  const jm = config.judgeModel as BenchmarkModelConfig;
  if (formData.judgeProvider) jm.provider = formData.judgeProvider as LLMProvider;
  if (formData.judgeModelId !== undefined) jm.modelId = String(formData.judgeModelId);
  if (formData.judgeLabel !== undefined) jm.label = String(formData.judgeLabel) || undefined;
  config.judgeModel = jm;
};

const saveBenchmarkModels: ConfigMutator = (config, formData) => {
  try {
    const parsed = JSON.parse(String(formData.benchmarkModelsJson || "{}"));
    config.benchmarkModels = parsed;
  } catch {
    // Invalid JSON — keep existing
  }
};

const saveBenchmarkModelsV2: ConfigMutator = (config, formData) => {
  const models: Record<string, { provider: string; modelId: string; label?: string }> = {};
  for (const [k, v] of Object.entries(formData)) {
    const match = k.match(/^bm__(.+?)__(.+)$/);
    if (match) {
      const [, modelKey, field] = match;
      if (!models[modelKey]) models[modelKey] = { provider: "", modelId: "" };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (models[modelKey] as any)[field] = String(v);
    }
  }
  if (Object.keys(models).length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    config.benchmarkModels = models as any;
  }
};

const bmAdd: ConfigMutator = (config) => {
  if (!config.benchmarkModels) config.benchmarkModels = {};
  const newKey = `model-${Date.now()}`;
  config.benchmarkModels[newKey] = {
    provider: config.llm.provider,
    modelId: "",
    label: "New Model",
  };
};

const bmDelete: ConfigMutator = (config, formData) => {
  const key = formData?.key as string;
  if (key && config.benchmarkModels) {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete (config.benchmarkModels as Record<string, unknown>)[key];
  }
};

const saveMcp: ConfigMutator = (config, formData) => {
  try {
    const parsed = JSON.parse(String(formData.mcpJson || "{}"));
    config.mcp = parsed;
  } catch {
    // Invalid JSON — keep existing
  }
};

const saveMcpChrome: ConfigMutator = (config, formData) => {
  if (!config.mcp) config.mcp = {};
  if (!config.mcp.chromeMcp) config.mcp.chromeMcp = {};
  if (formData.chromeMcpCommand !== undefined)
    config.mcp.chromeMcp.command = String(formData.chromeMcpCommand) || undefined;
  if (formData.chromeMcpArgs !== undefined) {
    const argsStr = String(formData.chromeMcpArgs || "");
    config.mcp.chromeMcp.args = argsStr
      ? argsStr
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;
  }
  if (formData.chromeMcpBrowserUrl !== undefined)
    config.mcp.chromeMcp.browserUrl = String(formData.chromeMcpBrowserUrl) || undefined;
  if (formData.chromeMcpWsEndpoint !== undefined)
    config.mcp.chromeMcp.wsEndpoint = String(formData.chromeMcpWsEndpoint) || undefined;
};

const saveMcpRemote: ConfigMutator = (config, formData) => {
  const servers: Record<
    string,
    { url: string; apiKey?: string; name?: string; enabled?: boolean }
  > = {};
  for (const [k, v] of Object.entries(formData)) {
    const match = k.match(/^mcp_remote__(.+?)__(.+)$/);
    if (match) {
      const [, srvKey, field] = match;
      if (!servers[srvKey]) servers[srvKey] = { url: "" };
      if (field === "enabled") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (servers[srvKey] as any)[field] = v === "true";
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (servers[srvKey] as any)[field] = String(v);
      }
    }
  }
  if (!config.mcp) config.mcp = {};
  if (Object.keys(servers).length > 0) {
    config.mcp.remoteServers = servers;
  }
};

const mcpAdd: ConfigMutator = (config) => {
  if (!config.mcp) config.mcp = {};
  if (!config.mcp.remoteServers) config.mcp.remoteServers = {};
  const newKey = `server-${Date.now()}`;
  config.mcp.remoteServers[newKey] = {
    url: "",
    name: "New Server",
    enabled: true,
  };
};

const mcpDelete: ConfigMutator = (config, formData) => {
  const key = formData?.key as string;
  if (key && config.mcp?.remoteServers) {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete (config.mcp.remoteServers as Record<string, unknown>)[key];
  }
};

const savePlugins: ConfigMutator = (config, formData) => {
  try {
    const parsed = JSON.parse(String(formData.pluginsJson || "{}"));
    config.plugins = parsed;
  } catch {
    // Invalid JSON — keep existing
  }
};

const savePluginsV2: ConfigMutator = (config, formData) => {
  if (!config.plugins) config.plugins = {};
  if (formData.pluginEnabled !== undefined)
    config.plugins.enabled = formData.pluginEnabled === "true";
  if (formData.pluginPaths !== undefined) {
    const pathsStr = String(formData.pluginPaths || "");
    config.plugins.paths = pathsStr
      ? pathsStr
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
  }
};

const saveScopes: ConfigMutator = (config, formData) => {
  if (!config.dataSources.huawei) config.dataSources.huawei = {};
  const scopes: string[] = [];
  const scopeKeys = Object.keys(formData)
    .filter((k) => k.startsWith("scope__"))
    .sort((a, b) => {
      const ai = parseInt(a.split("__")[1], 10);
      const bi = parseInt(b.split("__")[1], 10);
      return ai - bi;
    });
  for (const k of scopeKeys) {
    const v = String(formData[k] || "").trim();
    if (v) scopes.push(v);
  }
  config.dataSources.huawei.scopes = scopes;
};

const scopeToggle: ConfigMutator = (config, formData) => {
  const scope = String(formData?.tag || "").trim();
  const scopeAction = String(formData?.action || "");
  if (scope) {
    if (!config.dataSources.huawei) config.dataSources.huawei = {};
    if (!config.dataSources.huawei.scopes) config.dataSources.huawei.scopes = [];
    const scopes = config.dataSources.huawei.scopes;
    if (scopeAction === "add" && !scopes.includes(scope)) {
      scopes.push(scope);
    } else if (scopeAction === "remove") {
      const idx = scopes.indexOf(scope);
      if (idx >= 0) scopes.splice(idx, 1);
    }
  }
};

const agentAdd: ConfigMutator = (config) => {
  if (!config.agents) config.agents = {};
  const newId = `agent-${Date.now()}`;
  config.agents[newId] = {
    tools: { categories: ["health", "memory", "profile"], tags: [] },
    skills: { tags: [] },
  };
};

const agentDelete: ConfigMutator = (config, formData) => {
  const agentId = String(formData?.agentId || "");
  if (agentId && config.agents) {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete (config.agents as Record<string, unknown>)[agentId];
  }
};

function applyTagAction(tags: string[], tag: string, action: string): string[] {
  const result = [...tags];
  if (action === "add" && !result.includes(tag)) {
    result.push(tag);
  } else if (action === "remove") {
    const idx = result.indexOf(tag);
    if (idx >= 0) result.splice(idx, 1);
  }
  return result;
}

const agentTagToggle: ConfigMutator = (config, formData, session) => {
  const agentId = String(formData?.agentId || "");
  const tag = String(formData?.tag || "");
  const kind = String(formData?.kind || "");
  const tagAction = String(formData?.action || "");
  if (!agentId || !tag) return;

  if (!config.agents) config.agents = {};
  if (!config.agents[agentId]) config.agents[agentId] = {};
  const ap = config.agents[agentId];
  const merged = getAgentProfile(agentId);

  if (kind === "tool") {
    ap.tools = { ...ap.tools, tags: applyTagAction(merged.tools.tags || [], tag, tagAction) };
  } else if (kind === "skill") {
    ap.skills = { ...ap.skills, tags: applyTagAction(merged.skills?.tags || [], tag, tagAction) };
  }
  session._settingsExpandedAgent = agentId;
};

const tagsToggle: ConfigMutator = (config, formData) => {
  const tag = String(formData?.tag || "").trim();
  const tagAction = String(formData?.action || "");
  if (tag) {
    if (!config.tags) config.tags = [];
    if (tagAction === "add" && !config.tags.includes(tag)) {
      config.tags.push(tag);
    } else if (tagAction === "remove") {
      const idx = config.tags.indexOf(tag);
      if (idx >= 0) config.tags.splice(idx, 1);
    }
  }
};

// ============================================================================
// Dispatch map
// ============================================================================

const SETTINGS_MUTATORS: Record<string, ConfigMutator> = {
  settings_save_llm: saveLlm,
  settings_save_gateway: saveGateway,
  settings_save_datasource: saveDatasource,
  settings_save_tui: saveTui,
  settings_save_advanced: saveAdvanced,
  settings_save_embedding: saveEmbedding,
  settings_save_benchmark: saveBenchmark,
  settings_save_benchmark_v2: saveBenchmarkV2,
  settings_save_benchmark_v3: saveBenchmarkV3,
  settings_save_benchmark_v4: saveBenchmarkV4,
  settings_save_model_repository: saveModelRepository,
  settings_save_model_assignments: saveModelAssignments,
  settings_save_agents: saveAgents,
  settings_save_context: saveContext,
  settings_save_infra_models: saveInfraModels,
  settings_provider_add: providerAdd,
  settings_provider_delete: providerDelete,
  settings_provider_model_add: providerModelAdd,
  settings_provider_model_delete: providerModelDelete,
  settings_save_judge: saveJudge,
  settings_save_benchmark_models: saveBenchmarkModels,
  settings_save_benchmark_models_v2: saveBenchmarkModelsV2,
  settings_bm_add: bmAdd,
  settings_bm_delete: bmDelete,
  settings_save_mcp: saveMcp,
  settings_save_mcp_chrome: saveMcpChrome,
  settings_save_mcp_remote: saveMcpRemote,
  settings_mcp_add: mcpAdd,
  settings_mcp_delete: mcpDelete,
  settings_save_plugins: savePlugins,
  settings_save_plugins_v2: savePluginsV2,
  settings_save_scopes: saveScopes,
  settings_scope_toggle: scopeToggle,
  settings_agent_add: agentAdd,
  settings_agent_delete: agentDelete,
  settings_agent_tag_toggle: agentTagToggle,
  settings_tags_toggle: tagsToggle,
};

// ============================================================================
// Main settings handler
// ============================================================================

const TAG_OPS = new Set([
  "settings_agent_tag_toggle",
  "settings_tags_toggle",
  "settings_scope_toggle",
]);

const COPY_OPS = new Set(["settings_copy_config", "settings_download_config"]);
const CLEANUP_OPS = new Set([
  "settings_cleanup_sessions",
  "settings_cleanup_memory_logs",
  "settings_cleanup_llm_logs",
]);

export async function handleSettingsAction(
  session: GatewaySession,
  action: string,
  payload: Record<string, unknown> | undefined,
  send: SendFn
): Promise<void> {
  // Copy/download — frontend handles, just toast
  if (COPY_OPS.has(action)) {
    sendAll(send, generateToast(t("settings.saved"), "success"));
    return;
  }

  // Cleanup ops — call respective cleanup function, then toast
  if (CLEANUP_OPS.has(action)) {
    try {
      if (action === "settings_cleanup_sessions") {
        const { cleanupOldSessions } = await import("../memory/session-store.js");
        cleanupOldSessions();
      } else if (action === "settings_cleanup_memory_logs") {
        const { cleanupOldMemoryLogs } = await import("../memory/session-store.js");
        cleanupOldMemoryLogs();
      } else if (action === "settings_cleanup_llm_logs") {
        const { cleanupOldLlmLogs } = await import("../utils/llm-logger.js");
        cleanupOldLlmLogs();
      }
      sendAll(send, generateToast(t("settings.cleanupDone"), "success"));
    } catch {
      sendAll(send, generateToast(t("settings.saveError"), "error"));
    }
    return;
  }

  try {
    const config = loadConfig();
    const formData = (payload || {}) as FormData;

    const mutator = SETTINGS_MUTATORS[action];
    if (mutator) {
      mutator(config, formData, session);
    }

    saveConfig(config);

    if (!TAG_OPS.has(action)) {
      sendAll(send, generateToast(t("settings.saved"), "success"));
    }
    await session.handleNavigate("settings/general", send);
    session._settingsExpandedAgent = undefined;
  } catch {
    sendAll(send, generateToast(t("settings.saveError"), "error"));
  }
}
