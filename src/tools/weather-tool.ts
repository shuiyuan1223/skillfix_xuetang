/**
 * Weather MCP Tool
 *
 * Provides weather information as an on-demand tool instead of
 * pre-computing it into the system prompt.
 */

import { getUserId, loadConfig } from '../utils/config.js';
import { loadProfileFromFile } from '../memory/profile.js';
import type { PHATool } from './types.js';

function resolveLocation(explicit?: string): string | undefined {
  if (explicit) {
    return explicit;
  }

  const uid = getUserId();
  if (uid) {
    try {
      const profile = loadProfileFromFile(uid);
      if (profile.location) {
        return profile.location;
      }
    } catch {
      /* ignore */
    }
  }

  const config = loadConfig();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (config as any).context?.location;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseWeatherResponse(location: string, current: any): Record<string, string> {
  const tempC = current.temp_C;
  const feelsLikeC = current.FeelsLikeC;
  const desc = current.lang_zh?.[0]?.value || current.weatherDesc?.[0]?.value || '';
  const humidity = current.humidity;
  const windSpeed = current.windspeedKmph;
  const visibility = current.visibility;

  return {
    location,
    temperature: `${tempC}°C`,
    feelsLike: `${feelsLikeC}°C`,
    description: desc,
    humidity: `${humidity}%`,
    windSpeed: `${windSpeed} km/h`,
    visibility: `${visibility} km`,
    summary: `${location}: ${tempC}°C，${desc}，湿度 ${humidity}%`,
  };
}

async function fetchWeather(location: string): Promise<Record<string, string> | { error: string }> {
  const url = `https://wttr.in/${encodeURIComponent(location)}?format=j1`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  const resp = await fetch(url, { signal: controller.signal });
  clearTimeout(timeout);

  if (!resp.ok) {
    return { error: `天气服务请求失败 (HTTP ${resp.status})` };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await resp.json()) as any;
  const current = data?.current_condition?.[0];
  if (!current) {
    return { error: '无法解析天气数据' };
  }

  return parseWeatherResponse(location, current);
}

export const getWeatherTool: PHATool<{ location?: string }> = {
  name: 'get_weather',
  description: '获取指定城市的当前天气信息（温度、天气状况、湿度）。默认使用用户档案中的城市。',
  displayName: '天气查询',
  category: 'health',
  icon: 'wind',
  inputSchema: {
    type: 'object',
    properties: {
      location: {
        type: 'string',
        description: "城市名称（如 '北京', 'Shanghai'）。不传则使用用户档案/配置中的默认城市。",
      },
    },
  },
  execute: async (args: { location?: string }) => {
    const location = resolveLocation(args.location);
    if (!location) {
      return { error: '未配置城市。请在参数中指定 location，或在用户档案/设置中配置默认城市。' };
    }

    try {
      return await fetchWeather(location);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('abort')) {
        return { error: '天气服务请求超时' };
      }
      return { error: `天气查询失败: ${msg}` };
    }
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const weatherTools: PHATool<any>[] = [getWeatherTool];
