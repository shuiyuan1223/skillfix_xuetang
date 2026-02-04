/**
 * Config utilities
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export interface PHAConfig {
  gateway: {
    port: number;
    autoStart: boolean;
  };
  llm: {
    provider: "anthropic" | "openai" | "google";
    modelId?: string;
    apiKey?: string;
  };
  dataSources: {
    type: "mock" | "huawei" | "apple";
    huawei?: {
      clientId?: string;
      clientSecret?: string;
    };
  };
  tui: {
    theme: "dark" | "light";
    showToolCalls: boolean;
  };
}

const DEFAULT_CONFIG: PHAConfig = {
  gateway: {
    port: 8000,
    autoStart: false,
  },
  llm: {
    provider: "anthropic",
  },
  dataSources: {
    type: "mock",
  },
  tui: {
    theme: "dark",
    showToolCalls: true,
  },
};

export function getConfigDir(): string {
  return path.join(os.homedir(), ".pha");
}

export function getConfigPath(): string {
  return path.join(getConfigDir(), "config.json");
}

export function ensureConfigDir(): void {
  const dir = getConfigDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function loadConfig(): PHAConfig {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const content = fs.readFileSync(configPath, "utf-8");
    const loaded = JSON.parse(content);
    return { ...DEFAULT_CONFIG, ...loaded };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config: PHAConfig): void {
  ensureConfigDir();
  const configPath = getConfigPath();
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

export function getConfigValue(path: string): unknown {
  const config = loadConfig();
  const parts = path.split(".");
  let current: any = config;

  for (const part of parts) {
    if (current === undefined || current === null) {
      return undefined;
    }
    current = current[part];
  }

  return current;
}

export function setConfigValue(path: string, value: unknown): void {
  const config = loadConfig();
  const parts = path.split(".");
  let current: any = config;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (current[part] === undefined) {
      current[part] = {};
    }
    current = current[part];
  }

  const lastPart = parts[parts.length - 1];

  // Parse value
  if (value === "true") value = true;
  else if (value === "false") value = false;
  else if (!isNaN(Number(value))) value = Number(value);

  current[lastPart] = value;
  saveConfig(config);
}

export function unsetConfigValue(path: string): void {
  const config = loadConfig();
  const parts = path.split(".");
  let current: any = config;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (current[part] === undefined) {
      return;
    }
    current = current[part];
  }

  delete current[parts[parts.length - 1]];
  saveConfig(config);
}

export function isConfigured(): boolean {
  return fs.existsSync(getConfigPath());
}
