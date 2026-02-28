/**
 * i18n - Internationalization utilities
 *
 * Simple i18n system for PHA. Supports Chinese and English.
 *
 * Usage:
 *   import { t, setLocale, getLocale } from './locales/index.js';
 *
 *   t('nav.chat')           // → "聊天" (if locale is zh-CN)
 *   t('health.title')       // → "健康概览"
 *
 *   setLocale('en');        // Switch to English
 *   t('nav.chat')           // → "Chat"
 */

import type { LocaleMessages, LocaleKey } from './types.js';
import { zhCN } from './zh-CN.js';
import { en } from './en.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('i18n');

// Available locales
const locales: Record<LocaleKey, LocaleMessages> = {
  'zh-CN': zhCN,
  en: en,
};

// Current locale (default to Chinese)
let currentLocale: LocaleKey = 'zh-CN';

/**
 * Set the current locale
 */
export function setLocale(locale: LocaleKey): void {
  if (locales[locale]) {
    currentLocale = locale;
  } else {
    log.warn(`Unknown locale: ${locale}, falling back to zh-CN`);
    currentLocale = 'zh-CN';
  }
}

/**
 * Get the current locale
 */
export function getLocale(): LocaleKey {
  return currentLocale;
}

/**
 * Get available locales
 */
export function getAvailableLocales(): LocaleKey[] {
  return Object.keys(locales) as LocaleKey[];
}

/**
 * Translate a key to the current locale
 *
 * @param key - Dot-notation key like 'nav.chat' or 'health.title'
 * @param params - Optional parameters for interpolation (future use)
 * @returns The translated string, or the key if not found
 *
 * @example
 * t('nav.chat')        // → "聊天"
 * t('health.title')    // → "健康概览"
 */
export function t(key: string, params?: Record<string, string | number>): string {
  const messages = locales[currentLocale];
  const keys = key.split('.');

  // Navigate to the value

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let value: any = messages;
  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = value[k];
    } else {
      log.warn(`Missing translation for key: ${key} in locale: ${currentLocale}`);
      return key;
    }
  }

  if (typeof value !== 'string') {
    log.warn(`Translation key ${key} is not a string`);
    return key;
  }

  // Simple parameter interpolation: {{param}}
  if (params) {
    return value.replace(/\{\{(\w+)\}\}/g, (_, name) => {
      return params[name]?.toString() ?? `{{${name}}}`;
    });
  }

  return value;
}

// Re-export types
export type { LocaleMessages, LocaleKey } from './types.js';
