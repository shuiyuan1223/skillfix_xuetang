/**
 * Benchmark Progress File Manager
 *
 * Shared progress state between CLI and Gateway via .pha/benchmark-progress.json.
 * Allows the UI to show progress when benchmarks are started from CLI,
 * and prevents concurrent benchmark runs.
 */

import { existsSync, readFileSync, writeFileSync, unlinkSync } from "fs";
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
