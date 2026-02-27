/**
 * Benchmark Progress File Manager
 *
 * Shared progress state between CLI and Gateway via .pha/benchmark-progress.json.
 * Allows the UI to show progress when benchmarks are started from CLI,
 * and prevents concurrent benchmark runs.
 */

import { existsSync, readFileSync, writeFileSync, unlinkSync, readdirSync } from "fs";
import { join } from "path";
import { getStateDir } from "../utils/config.js";

export interface BenchmarkProgressInfo {
  running: boolean;
  source: "cli" | "ui";
  profile: string;
  current: number;
  total: number;
  category: string;
  startedAt: number;
  modelId?: string;
  presetName?: string;
  trackingId?: string;
  pid: number;
}

function getProgressFilePath(): string {
  return join(getStateDir(), "benchmark-progress.json");
}

export function writeBenchmarkProgress(info: BenchmarkProgressInfo): void {
  try {
    writeFileSync(getProgressFilePath(), JSON.stringify(info, null, 2));
  } catch {
    /* ignore write errors */
  }
}

export function readBenchmarkProgress(): BenchmarkProgressInfo | null {
  const filePath = getProgressFilePath();
  if (!existsSync(filePath)) return null;
  try {
    const data = JSON.parse(readFileSync(filePath, "utf-8")) as BenchmarkProgressInfo;
    if (!data.running) {
      clearBenchmarkProgress();
      return null;
    }
    // Check if the process that started the benchmark is still alive
    if (data.pid && data.pid !== process.pid) {
      try {
        process.kill(data.pid, 0); // Signal 0 just checks if process exists
      } catch {
        // Process is dead, stale progress file
        clearBenchmarkProgress();
        return null;
      }
    }
    // Also check for stale progress (> 30 minutes old)
    if (Date.now() - data.startedAt > 30 * 60 * 1000) {
      clearBenchmarkProgress();
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function clearBenchmarkProgress(): void {
  try {
    const filePath = getProgressFilePath();
    if (existsSync(filePath)) unlinkSync(filePath);
  } catch {
    /* ignore */
  }
}

// ============================================================================
// Per-run progress files for concurrent UI benchmarks
// ============================================================================

function getRunProgressFilePath(trackingId: string): string {
  return join(getStateDir(), `benchmark-progress-${trackingId}.json`);
}

export function writeBenchmarkProgressForRun(
  trackingId: string,
  info: BenchmarkProgressInfo
): void {
  try {
    writeFileSync(getRunProgressFilePath(trackingId), JSON.stringify(info, null, 2));
  } catch {
    /* ignore write errors */
  }
}

export function clearBenchmarkProgressForRun(trackingId: string): void {
  try {
    const filePath = getRunProgressFilePath(trackingId);
    if (existsSync(filePath)) unlinkSync(filePath);
  } catch {
    /* ignore */
  }
}

export function clearAllUiBenchmarkProgress(): void {
  try {
    const stateDir = getStateDir();
    const files = readdirSync(stateDir);
    for (const file of files) {
      if (file.startsWith("benchmark-progress-") && file.endsWith(".json")) {
        try {
          unlinkSync(join(stateDir, file));
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    /* ignore */
  }
}

/**
 * Read all benchmark progress files (per-run + legacy single file).
 * Returns a map of trackingId → BenchmarkProgressInfo.
 * Legacy CLI file uses key "__cli__".
 * Stale / dead-process entries are automatically cleaned up.
 */
export function readAllBenchmarkProgress(): Record<string, BenchmarkProgressInfo> {
  const result: Record<string, BenchmarkProgressInfo> = {};

  // 1. Legacy single file (CLI)
  const legacy = readBenchmarkProgress();
  if (legacy) {
    result.__cli__ = legacy;
  }

  // 2. Per-run files
  try {
    const stateDir = getStateDir();
    const files = readdirSync(stateDir);
    for (const file of files) {
      if (!file.startsWith("benchmark-progress-") || !file.endsWith(".json")) continue;
      const trackingId = file.slice("benchmark-progress-".length, -".json".length);
      try {
        const filePath = join(stateDir, file);
        const data = JSON.parse(readFileSync(filePath, "utf-8")) as BenchmarkProgressInfo;
        if (!data.running) {
          try {
            unlinkSync(filePath);
          } catch {
            /* ignore */
          }
          continue;
        }
        // Check if process is still alive
        if (data.pid && data.pid !== process.pid) {
          try {
            process.kill(data.pid, 0);
          } catch {
            try {
              unlinkSync(filePath);
            } catch {
              /* ignore */
            }
            continue;
          }
        }
        // Stale check (> 30 minutes)
        if (Date.now() - data.startedAt > 30 * 60 * 1000) {
          try {
            unlinkSync(filePath);
          } catch {
            /* ignore */
          }
          continue;
        }
        result[trackingId] = data;
      } catch {
        // skip malformed files
      }
    }
  } catch {
    /* ignore */
  }

  return result;
}
