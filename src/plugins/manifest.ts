/**
 * Plugin Manifest
 *
 * Loads pha.plugin.json (or openclaw.plugin.json for compatibility).
 * Adapted from OpenClaw manifest.ts.
 */

import fs from 'node:fs';
import path from 'node:path';

export const PHA_MANIFEST_FILENAME = 'pha.plugin.json';
export const OPENCLAW_MANIFEST_FILENAME = 'openclaw.plugin.json';
export const PLUGIN_MANIFEST_FILENAMES = [PHA_MANIFEST_FILENAME, OPENCLAW_MANIFEST_FILENAME] as const;

export type PluginManifest = {
  id: string;
  configSchema?: Record<string, unknown>;
  name?: string;
  description?: string;
  version?: string;
};

export type PluginManifestLoadResult =
  | { ok: true; manifest: PluginManifest; manifestPath: string }
  | { ok: false; error: string; manifestPath: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function resolvePluginManifestPath(rootDir: string): string | null {
  for (const filename of PLUGIN_MANIFEST_FILENAMES) {
    const candidate = path.join(rootDir, filename);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function loadPluginManifest(rootDir: string): PluginManifestLoadResult {
  const manifestPath = resolvePluginManifestPath(rootDir);
  if (!manifestPath) {
    return {
      ok: false,
      error: `plugin manifest not found in ${rootDir}`,
      manifestPath: path.join(rootDir, PHA_MANIFEST_FILENAME),
    };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as unknown;
  } catch (err) {
    return {
      ok: false,
      error: `failed to parse plugin manifest: ${String(err)}`,
      manifestPath,
    };
  }

  if (!isRecord(raw)) {
    return { ok: false, error: 'plugin manifest must be an object', manifestPath };
  }

  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  if (!id) {
    return { ok: false, error: 'plugin manifest requires id', manifestPath };
  }

  const configSchema = isRecord(raw.configSchema) ? raw.configSchema : undefined;
  const name = typeof raw.name === 'string' ? raw.name.trim() : undefined;
  const description = typeof raw.description === 'string' ? raw.description.trim() : undefined;
  const version = typeof raw.version === 'string' ? raw.version.trim() : undefined;

  return {
    ok: true,
    manifest: { id, configSchema, name, description, version },
    manifestPath,
  };
}
