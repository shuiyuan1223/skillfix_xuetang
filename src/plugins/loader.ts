/**
 * Plugin Loader
 *
 * Orchestrates plugin discovery, manifest loading, module import,
 * and registration into the plugin registry.
 */

import path from 'node:path';
import { createSubsystemLogger } from '../memory/compat.js';
import { discoverPlugins, type PluginCandidate } from './discovery.js';
import { initializeGlobalHookRunner } from './hook-runner-global.js';
import { loadPluginManifest } from './manifest.js';
import { createEmptyRegistry, type PluginRecord, type PluginRegistry } from './registry.js';
import type {
  AnyAgentTool,
  PHAPluginApi,
  PHAPluginModule,
  PHAPluginToolFactory,
  PHAPluginToolOptions,
  PluginHookHandlerMap,
  PluginHookName,
  PluginHookRegistration,
  PluginLogger,
  PluginOrigin,
  PluginToolRegistration,
} from './types.js';

const log = createSubsystemLogger('plugins');

function isToolFactory(tool: AnyAgentTool | PHAPluginToolFactory): tool is PHAPluginToolFactory {
  return typeof tool === 'function' && !('name' in tool && 'description' in tool && 'execute' in tool);
}

function pushPluginRecord(
  registry: PluginRegistry,
  base: { id: string; name: string; source: string; origin: PluginOrigin },
  status: 'error' | 'disabled' | 'loaded',
  counts?: { toolCount: number; hookCount: number },
  error?: string
): void {
  registry.plugins.push({
    ...base,
    status,
    toolCount: counts?.toolCount ?? 0,
    hookCount: counts?.hookCount ?? 0,
    ...(error ? { error } : {}),
  });
}

function createPluginApi(
  pluginId: string,
  candidate: PluginCandidate,
  manifest: { name?: string; version?: string; description?: string },
  pluginEntry: { config?: unknown } | undefined,
  registry: PluginRegistry,
  toolRegs: PluginToolRegistration[],
  hookRegs: PluginHookRegistration[]
): PHAPluginApi {
  const pluginLogger: PluginLogger = {
    debug: (msg) => log.debug(`[${pluginId}] ${msg}`),
    info: (msg) => log.info(`[${pluginId}] ${msg}`),
    warn: (msg) => log.warn(`[${pluginId}] ${msg}`),
    error: (msg) => log.error(`[${pluginId}] ${msg}`),
  };

  return {
    id: pluginId,
    name: manifest.name || pluginId,
    version: manifest.version,
    description: manifest.description,
    source: candidate.source,
    logger: pluginLogger,
    pluginConfig: pluginEntry?.config as Record<string, unknown> | undefined,

    registerTool(tool: AnyAgentTool | PHAPluginToolFactory, opts?: PHAPluginToolOptions): void {
      if (isToolFactory(tool)) {
        const result = tool({});
        if (!result) {
          return;
        }
        const tools = Array.isArray(result) ? result : [result];
        for (const t of tools) {
          toolRegs.push({ pluginId, tool: t, source: candidate.source });
          registry.tools.push({ pluginId, tool: t, source: candidate.source });
        }
      } else {
        toolRegs.push({ pluginId, tool, source: candidate.source });
        registry.tools.push({ pluginId, tool, source: candidate.source });
      }
      const names = opts?.names || (opts?.name ? [opts.name] : toolRegs.map((r) => r.tool.name));
      pluginLogger.debug?.(`registered tool(s): ${names.join(', ')}`);
    },

    on<K extends PluginHookName>(hookName: K, handler: PluginHookHandlerMap[K], opts?: { priority?: number }): void {
      const reg: PluginHookRegistration<K> = {
        pluginId,
        hookName,
        handler,
        priority: opts?.priority,
        source: candidate.source,
      };
      hookRegs.push(reg as PluginHookRegistration);
      registry.hooks.push(reg as PluginHookRegistration);
      registry.typedHooks.push(reg as PluginHookRegistration);
      pluginLogger.debug?.(`registered hook: ${hookName}`);
    },
  };
}

async function loadSinglePlugin(
  candidate: PluginCandidate,
  registry: PluginRegistry,
  pluginConfigs?: Record<string, { enabled?: boolean; config?: unknown }>
): Promise<void> {
  const base = (id: string, name?: string): { id: string; name: string; source: string; origin: PluginOrigin } => ({
    id,
    name: name || id,
    source: candidate.source,
    origin: candidate.origin,
  });

  // 1. Load manifest
  const manifestResult = loadPluginManifest(candidate.dir);
  if (!manifestResult.ok) {
    log.warn(`skipping ${candidate.dir}: ${manifestResult.error}`);
    pushPluginRecord(registry, base(path.basename(candidate.dir)), 'error', undefined, manifestResult.error);
    return;
  }

  const manifest = manifestResult.manifest;
  const pluginId = manifest.id;

  // 2. Check enabled/disabled
  const pluginEntry = pluginConfigs?.[pluginId];
  if (pluginEntry?.enabled === false) {
    log.info(`plugin ${pluginId} is disabled`);
    pushPluginRecord(registry, base(pluginId, manifest.name || pluginId), 'disabled');
    return;
  }

  // 3. Import the module
  let mod: Record<string, unknown>;
  try {
    mod = await import(candidate.source);
  } catch (err) {
    const msg = `failed to import plugin ${pluginId}: ${String(err)}`;
    log.error(msg);
    pushPluginRecord(registry, base(pluginId, manifest.name || pluginId), 'error', undefined, msg);
    return;
  }

  // 4. Resolve plugin definition & create API
  const pluginDef: PHAPluginModule = (mod.default as PHAPluginModule) || (mod as unknown as PHAPluginModule);
  const toolRegs: PluginToolRegistration[] = [];
  const hookRegs: PluginHookRegistration[] = [];
  const api = createPluginApi(pluginId, candidate, manifest, pluginEntry, registry, toolRegs, hookRegs);

  // 5. Call register
  try {
    if (typeof pluginDef === 'function') {
      await pluginDef(api);
    } else if (pluginDef.register) {
      await pluginDef.register(api);
    }
  } catch (err) {
    const msg = `plugin ${pluginId} register() failed: ${String(err)}`;
    log.error(msg);
    pushPluginRecord(registry, base(pluginId, manifest.name || pluginId), 'error', undefined, msg);
    return;
  }

  // 6. Record success
  pushPluginRecord(registry, base(pluginId, manifest.name || pluginId), 'loaded', {
    toolCount: toolRegs.length,
    hookCount: hookRegs.length,
  });
  log.info(`loaded: ${pluginId} (${toolRegs.length} tools, ${hookRegs.length} hooks)`);
}

export async function loadPlugins(options: {
  workspaceDir: string;
  extraPaths?: string[];
  pluginConfigs?: Record<string, { enabled?: boolean; config?: unknown }>;
}): Promise<PluginRegistry> {
  const registry = createEmptyRegistry();

  // 1. Discover plugins
  const discovery = discoverPlugins({
    workspaceDir: options.workspaceDir,
    extraPaths: options.extraPaths,
  });

  for (const err of discovery.errors) {
    log.warn(err);
  }

  if (discovery.candidates.length === 0) {
    log.debug('no plugins found');
    initializeGlobalHookRunner(registry);
    return registry;
  }

  log.info(`found ${discovery.candidates.length} plugin(s), loading...`);

  // 2. Load each plugin
  for (const candidate of discovery.candidates) {
    await loadSinglePlugin(candidate, registry, options.pluginConfigs);
  }

  // 3. Initialize global hook runner
  initializeGlobalHookRunner(registry);

  return registry;
}
