/**
 * Plugin Registry
 *
 * Central store for all loaded plugins, their tools, and hooks.
 * Structure is compatible with OpenClaw's PluginRegistry (keeps typedHooks field name).
 */

import type { PluginHookRegistration, PluginToolRegistration, PluginOrigin } from "./types.js";

export type PluginRecord = {
  id: string;
  name: string;
  source: string;
  origin: PluginOrigin;
  status: "loaded" | "disabled" | "error";
  error?: string;
  toolCount: number;
  hookCount: number;
};

export type PluginRegistry = {
  plugins: PluginRecord[];
  tools: PluginToolRegistration[];
  hooks: PluginHookRegistration[];
  /** OpenClaw compatibility — hooks.ts reads from this field */
  typedHooks: PluginHookRegistration[];
};

export function createEmptyRegistry(): PluginRegistry {
  return {
    plugins: [],
    tools: [],
    hooks: [],
    typedHooks: [],
  };
}
