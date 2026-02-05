/**
 * API Response Cache
 *
 * Caches API responses to .pha/api-cache/ for debugging and analysis.
 * Also provides in-memory caching to reduce API calls.
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const CACHE_DIR = path.join(os.homedir(), ".pha", "api-cache");

// In-memory cache with TTL (5 minutes default)
const memoryCache = new Map<string, { data: unknown; timestamp: number }>();
const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Ensure cache directory exists
 */
function ensureCacheDir(): void {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

/**
 * Generate a cache key from endpoint and params
 */
function getCacheKey(endpoint: string, params: Record<string, unknown>): string {
  const paramStr = JSON.stringify(params, Object.keys(params).sort());
  return `${endpoint}-${Buffer.from(paramStr).toString("base64").slice(0, 20)}`;
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
  ensureCacheDir();

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const endpointName = endpoint.replace(/[/:]/g, "_").slice(0, 50);
  const filename = `${timestamp}_${endpointName}.json`;
  const filepath = path.join(CACHE_DIR, filename);

  const cacheData = {
    timestamp: new Date().toISOString(),
    endpoint,
    params,
    response,
    error,
  };

  fs.writeFileSync(filepath, JSON.stringify(cacheData, null, 2));
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
 * List all cached files
 */
export function listCacheFiles(): string[] {
  ensureCacheDir();
  return fs.readdirSync(CACHE_DIR).filter((f) => f.endsWith(".json"));
}

/**
 * Read a cache file
 */
export function readCacheFile(filename: string): unknown {
  const filepath = path.join(CACHE_DIR, filename);
  if (fs.existsSync(filepath)) {
    return JSON.parse(fs.readFileSync(filepath, "utf-8"));
  }
  return null;
}
