export * from "./interface.js";
export * from "./mock.js";
export * from "./huawei/index.js";

import type { HealthDataSource } from "./interface.js";
import { MockDataSource } from "./mock.js";
import { HuaweiHealthDataSource, createInnerHuaweiHealthApiForUser } from "./huawei/index.js";
import { loadConfig } from "../utils/config.js";

/**
 * Create a data source based on configuration
 * @param userUuid - Optional user UUID for multi-user mode (web users)
 */
export function createDataSource(userUuid?: string): HealthDataSource {
  const config = loadConfig();
  const type = config.dataSources.type;

  switch (type) {
    case "huawei":
      return new HuaweiHealthDataSource(userUuid);
    case "apple":
      // Apple Health not implemented yet, fallback to mock
      console.warn("Apple Health not implemented, using mock data");
      return new MockDataSource();
    case "mock":
    default:
      return new MockDataSource();
  }
}

/**
 * Create a data source for a specific user (multi-user mode)
 */
export function createDataSourceForUser(userUuid: string): HealthDataSource {
  return createDataSource(userUuid);
}

/**
 * Create a data source using inner Huawei API (client_credentials grant).
 * Uses an app-level access token; routes to the inner HealthKit API with x-huid header.
 */
export function createInnerDataSourceForUser(
  userUuid: string,
  appLevelAt: string,
  userHuid: string
): HealthDataSource {
  const api = createInnerHuaweiHealthApiForUser(userUuid, appLevelAt, userHuid);
  return new HuaweiHealthDataSource(userUuid, api);
}

// Default data source based on config
let _dataSource: HealthDataSource | null = null;

/**
 * Get the configured data source (singleton)
 */
export function getConfiguredDataSource(): HealthDataSource {
  if (!_dataSource) {
    _dataSource = createDataSource();
  }
  return _dataSource;
}

/**
 * Reset the cached data source (useful after config changes)
 */
export function resetCachedDataSource(): void {
  _dataSource = null;
}
