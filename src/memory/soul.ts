/**
 * SOUL - Multi-file Prompt Loader
 *
 * Loads all prompt files from src/prompts/ directory and concatenates them.
 * Order: SOUL.md -> AGENTS.md -> TOOLS.md -> any other .md files.
 *
 * Supports per-user SOUL override: if users/{uuid}/SOUL.md exists, it takes priority.
 *
 * TOOLS.md is local environment notes (OpenClaw pattern), NOT auto-generated.
 */

import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { getPromptsDir } from '../tools/prompt-tools.js';
import { getStateDir } from '../utils/config.js';

/**
 * Load all prompt files from src/prompts/ and concatenate in order.
 * Priority order: SOUL.md, AGENTS.md, TOOLS.md, then alphabetical.
 */
export function loadAllPrompts(): string {
  const dir = getPromptsDir();

  if (!existsSync(dir)) {
    return '';
  }

  const ordered = ['SOUL.md', 'AGENTS.md', 'TOOLS.md'];
  const files = readdirSync(dir).filter((f) => f.endsWith('.md'));

  const sections: string[] = [];

  // Load priority files first
  for (const name of ordered) {
    if (files.includes(name)) {
      const content = readFileSync(join(dir, name), 'utf-8').trim();
      if (content) {
        sections.push(content);
      }
    }
  }

  // Load remaining files alphabetically
  for (const file of files.sort()) {
    if (!ordered.includes(file)) {
      const content = readFileSync(join(dir, file), 'utf-8').trim();
      if (content) {
        sections.push(content);
      }
    }
  }

  return sections.join('\n\n---\n\n');
}

/**
 * Load SOUL prompt with optional per-user override.
 * If userUuid is provided and users/{uuid}/SOUL.md exists, use that instead.
 */
export function loadSoul(userUuid?: string): string {
  // Check per-user SOUL override
  if (userUuid) {
    const userSoulPath = join(getStateDir(), 'users', userUuid, 'SOUL.md');
    if (existsSync(userSoulPath)) {
      const content = readFileSync(userSoulPath, 'utf-8').trim();
      if (content) {
        return content;
      }
    }
  }

  // Fallback to global prompts
  return loadAllPrompts();
}
