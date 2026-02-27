/**
 * API Response Cache
 *
 * Caches API responses to per-user .pha/users/{uuid}/api-cache/ for debugging.
 * Also provides in-memory caching to reduce API calls.
 */

import * as fs from "fs";
import * as path from "path";
import { getStateDir } from "../../utils/config.js";
import { getUserId } from "../../utils/config.js";

// In-memory cache with TTL (5 minutes default)
const memoryCache = new Map<string, { data: unknown; timestamp: number }>();
const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get the cache directory for a user (per-user isolation)
 */
function getCacheDir(userUuid?: string): string {
  const uid = userUuid || getUserId();
  if (uid) {
    return path.join(getStateDir(), "users", uid, "api-cache");
  }
  // Anonymous user — no file cache
  return "";
}

/**
 * Ensure cache directory exists
 */
function ensureCacheDir(cacheDir: string): void {
  if (cacheDir && !fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true, mode: 0o750 });
  }
}

/**
 * Generate a cache key from endpoint and params
 */
function getCacheKey(endpoint: string, params: Record<string, unknown>): string {
  const paramStr = JSON.stringify(params, Object.keys(params).sort());
  // Use full base64 encoding to ensure unique keys for different params
  return `${endpoint}-${Buffer.from(paramStr).toString("base64")}`;
}

/**
 * Save API response to file cache for analysis
 */
export function saveToFileCache(
  endpoint: string,
  params: Record<string, unknown>,
  response: unknown,
  error?: string
): void {
  const cacheDir = getCacheDir();
  if (!cacheDir) return; // No file cache for anonymous users

  ensureCacheDir(cacheDir);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const endpointName = endpoint.replace(/[/:]/g, "_").slice(0, 50);
  const filename = `${timestamp}_${endpointName}.json`;
  const filepath = path.join(cacheDir, filename);

  const cacheData = {
    timestamp: new Date().toISOString(),
    endpoint,
    params,
    response,
    error,
  };

  fs.writeFileSync(filepath, JSON.stringify(cacheData, null, 2), { mode: 0o640 });
}

/**
 * Get from memory cache if valid
 */
export function getFromMemoryCache<T>(
  endpoint: string,
  params: Record<string, unknown>,
  ttl: number = DEFAULT_TTL
): T | null {
  const key = getCacheKey(endpoint, params);
  const cached = memoryCache.get(key);

  if (cached && Date.now() - cached.timestamp < ttl) {
    return cached.data as T;
  }

  return null;
}

/**
 * Save to memory cache
 */
export function saveToMemoryCache(
  endpoint: string,
  params: Record<string, unknown>,
  data: unknown
): void {
  const key = getCacheKey(endpoint, params);
  memoryCache.set(key, { data, timestamp: Date.now() });
}

/**
 * Clear memory cache
 */
export function clearMemoryCache(): void {
  memoryCache.clear();
}

/**
 * List all cached files for a user
 */
export function listCacheFiles(userUuid?: string): string[] {
  const cacheDir = getCacheDir(userUuid);
  if (!cacheDir || !fs.existsSync(cacheDir)) return [];
  return fs.readdirSync(cacheDir).filter((f) => f.endsWith(".json"));
}

/**
 * Read a cache file for a user
 */
export function readCacheFile(filename: string, userUuid?: string): unknown {
  const cacheDir = getCacheDir(userUuid);
  if (!cacheDir) return null;
  const filepath = path.join(cacheDir, filename);
  if (fs.existsSync(filepath)) {
    return JSON.parse(fs.readFileSync(filepath, "utf-8"));
  }
  return null;
}
