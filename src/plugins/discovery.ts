/**
 * Plugin Discovery
 *
 * Scans two locations for plugins:
 * 1. .pha/plugins/ (workspace plugins)
 * 2. config.plugins.paths[] (config-specified paths)
 */

import fs from "node:fs";
import path from "node:path";
import { resolvePluginManifestPath } from "./manifest.js";
import type { PluginOrigin } from "./types.js";

export type PluginCandidate = {
  /** Resolved directory of the plugin */
  dir: string;
  /** Resolved entry file path */
  source: string;
  /** Where the plugin was discovered */
  origin: PluginOrigin;
};

export type PluginDiscoveryResult = {
  candidates: PluginCandidate[];
  errors: string[];
};

const ENTRY_EXTENSIONS = [".ts", ".js", ".mjs", ".cjs"];

function resolveEntry(dir: string): string | null {
  // Check package.json main/module
  const pkgPath = path.join(dir, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      const main = pkg.main || pkg.module;
      if (typeof main === "string") {
        const resolved = path.resolve(dir, main);
        if (fs.existsSync(resolved)) return resolved;
      }
    } catch {
      // ignore
    }
  }

  // Check index files
  for (const ext of ENTRY_EXTENSIONS) {
    const candidate = path.join(dir, `index${ext}`);
    if (fs.existsSync(candidate)) return candidate;
  }

  return null;
}

function scanDirectory(
  baseDir: string,
  origin: PluginOrigin
): {
  candidates: PluginCandidate[];
  errors: string[];
} {
  const candidates: PluginCandidate[] = [];
  const errors: string[] = [];

  if (!fs.existsSync(baseDir)) return { candidates, errors };

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(baseDir, { withFileTypes: true });
  } catch {
    return { candidates, errors };
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".")) continue;

    const dir = path.join(baseDir, entry.name);
    const manifestPath = resolvePluginManifestPath(dir);
    if (!manifestPath) continue;

    const source = resolveEntry(dir);
    if (!source) {
      errors.push(`plugin ${entry.name}: found manifest but no entry file in ${dir}`);
      continue;
    }

    candidates.push({ dir, source, origin });
  }

  return { candidates, errors };
}

export function discoverPlugins(options: {
  workspaceDir: string;
  extraPaths?: string[];
}): PluginDiscoveryResult {
  const allCandidates: PluginCandidate[] = [];
  const allErrors: string[] = [];
  const seen = new Set<string>();

  // 1. Workspace plugins: .pha/plugins/
  const workspacePluginsDir = path.join(options.workspaceDir, "plugins");
  const workspace = scanDirectory(workspacePluginsDir, "workspace");
  for (const c of workspace.candidates) {
    const key = fs.realpathSync(c.dir);
    if (!seen.has(key)) {
      seen.add(key);
      allCandidates.push(c);
    }
  }
  allErrors.push(...workspace.errors);

  // 2. Config-specified paths
  if (options.extraPaths) {
    for (const p of options.extraPaths) {
      const resolved = path.resolve(p);
      if (!fs.existsSync(resolved)) {
        allErrors.push(`configured plugin path does not exist: ${p}`);
        continue;
      }

      const stat = fs.statSync(resolved);
      if (stat.isDirectory()) {
        // Check if the path itself is a plugin (has manifest)
        const manifestPath = resolvePluginManifestPath(resolved);
        if (manifestPath) {
          const source = resolveEntry(resolved);
          if (source) {
            const key = fs.realpathSync(resolved);
            if (!seen.has(key)) {
              seen.add(key);
              allCandidates.push({ dir: resolved, source, origin: "config" });
            }
          } else {
            allErrors.push(`configured plugin ${resolved}: has manifest but no entry file`);
          }
        } else {
          // Treat as a directory containing multiple plugins
          const config = scanDirectory(resolved, "config");
          for (const c of config.candidates) {
            const key = fs.realpathSync(c.dir);
            if (!seen.has(key)) {
              seen.add(key);
              allCandidates.push(c);
            }
          }
          allErrors.push(...config.errors);
        }
      }
    }
  }

  return { candidates: allCandidates, errors: allErrors };
}
