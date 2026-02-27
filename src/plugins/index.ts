/**
 * Plugin System — Barrel Exports
 */

export { loadPlugins } from './loader.js';
export {
  getGlobalHookRunner,
  getGlobalPluginRegistry,
  hasGlobalHooks,
  initializeGlobalHookRunner,
  resetGlobalHookRunner,
} from './hook-runner-global.js';
export { createHookRunner, type HookRunner } from './hooks.js';
export { createEmptyRegistry, type PluginRegistry, type PluginRecord } from './registry.js';
export type {
  PHAPluginApi,
  PHAPluginDefinition,
  PHAPluginModule,
  PluginHookName,
  PluginToolRegistration,
  PluginHookRegistration,
  AnyAgentTool,
  PluginLogger,
} from './types.js';
