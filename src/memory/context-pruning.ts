/**
 * Context Pruning — ported from OpenClaw (src/agents/pi-extensions/context-pruning/)
 *
 * Two-phase approach to trim tool results and prevent context window bloat:
 * - Phase 1 (softTrim): context > softTrimRatio → trim old toolResult (head + tail)
 * - Phase 2 (hardClear): context > hardClearRatio → replace old toolResult with placeholder
 *
 * Protected:
 * - Last N assistant turns (keepLastAssistants)
 * - Everything before first user message (bootstrap/identity context)
 * - ToolResults containing images
 *
 * Key differences from naive approach:
 * - Proper head/tail extraction across multi-block content
 * - Hard-clear only fires when prunable tool chars exceed minPrunableToolChars
 * - Hard-clear stops as soon as ratio drops below threshold (incremental)
 * - Soft-trim only applies to blocks exceeding softTrim.maxChars
 * - Image blocks are estimated at 8000 chars for accurate budget tracking
 */

import type { AgentMessage } from '@mariozechner/pi-agent-core';
import type { ImageContent, TextContent, ToolResultMessage } from '@mariozechner/pi-ai';

// ── Constants (from OpenClaw) ──────────────────────────────────────────

const CHARS_PER_TOKEN_ESTIMATE = 4;
const IMAGE_CHAR_ESTIMATE = 8_000;

// ── Settings (from OpenClaw settings.ts) ───────────────────────────────

export interface ContextPruningSettings {
  keepLastAssistants: number;
  softTrimRatio: number;
  hardClearRatio: number;
  minPrunableToolChars: number;
  softTrim: {
    maxChars: number;
    headChars: number;
    tailChars: number;
  };
  hardClear: {
    enabled: boolean;
    placeholder: string;
  };
}

export const DEFAULT_CONTEXT_PRUNING_SETTINGS: ContextPruningSettings = {
  keepLastAssistants: 3,
  softTrimRatio: 0.3,
  hardClearRatio: 0.5,
  minPrunableToolChars: 50_000,
  softTrim: {
    maxChars: 4_000,
    headChars: 1_500,
    tailChars: 1_500,
  },
  hardClear: {
    enabled: true,
    placeholder: '[Old tool result content cleared]',
  },
};

// ── PHA-simplified config (maps to full settings) ──────────────────────

export interface PruningConfig {
  contextWindow: number;
  softTrimThreshold?: number;
  hardClearThreshold?: number;
  softTrimChars?: number;
  protectedTurns?: number;
}

function configToSettings(config: PruningConfig): ContextPruningSettings {
  return {
    keepLastAssistants: config.protectedTurns ?? DEFAULT_CONTEXT_PRUNING_SETTINGS.keepLastAssistants,
    softTrimRatio: config.softTrimThreshold ?? DEFAULT_CONTEXT_PRUNING_SETTINGS.softTrimRatio,
    hardClearRatio: config.hardClearThreshold ?? DEFAULT_CONTEXT_PRUNING_SETTINGS.hardClearRatio,
    minPrunableToolChars: DEFAULT_CONTEXT_PRUNING_SETTINGS.minPrunableToolChars,
    softTrim: {
      maxChars: DEFAULT_CONTEXT_PRUNING_SETTINGS.softTrim.maxChars,
      headChars: config.softTrimChars ?? DEFAULT_CONTEXT_PRUNING_SETTINGS.softTrim.headChars,
      tailChars: config.softTrimChars ?? DEFAULT_CONTEXT_PRUNING_SETTINGS.softTrim.tailChars,
    },
    hardClear: DEFAULT_CONTEXT_PRUNING_SETTINGS.hardClear,
  };
}

// ── Helpers (ported 1:1 from OpenClaw pruner.ts) ───────────────────────

function asText(text: string): TextContent {
  return { type: 'text', text };
}

function collectTextSegments(content: ReadonlyArray<TextContent | ImageContent>): string[] {
  const parts: string[] = [];
  for (const block of content) {
    if (block.type === 'text') {
      parts.push(block.text);
    }
  }
  return parts;
}

function estimateJoinedTextLength(parts: string[]): number {
  if (parts.length === 0) {
    return 0;
  }
  let len = 0;
  for (const p of parts) {
    len += p.length;
  }
  len += Math.max(0, parts.length - 1);
  return len;
}

function takeHeadFromJoinedText(parts: string[], maxChars: number): string {
  if (maxChars <= 0 || parts.length === 0) {
    return '';
  }
  let remaining = maxChars;
  let out = '';
  for (let i = 0; i < parts.length && remaining > 0; i++) {
    if (i > 0) {
      out += '\n';
      remaining -= 1;
      if (remaining <= 0) {
        break;
      }
    }
    const p = parts[i];
    if (p.length <= remaining) {
      out += p;
      remaining -= p.length;
    } else {
      out += p.slice(0, remaining);
      remaining = 0;
    }
  }
  return out;
}

function takeTailFromJoinedText(parts: string[], maxChars: number): string {
  if (maxChars <= 0 || parts.length === 0) {
    return '';
  }
  let remaining = maxChars;
  const out: string[] = [];
  for (let i = parts.length - 1; i >= 0 && remaining > 0; i--) {
    const p = parts[i];
    if (p.length <= remaining) {
      out.push(p);
      remaining -= p.length;
    } else {
      out.push(p.slice(p.length - remaining));
      remaining = 0;
      break;
    }
    if (remaining > 0 && i > 0) {
      out.push('\n');
      remaining -= 1;
    }
  }
  out.reverse();
  return out.join('');
}

function hasImageBlocks(content: ReadonlyArray<TextContent | ImageContent>): boolean {
  for (const block of content) {
    if (block.type === 'image') {
      return true;
    }
  }
  return false;
}

function estimateMessageChars(message: AgentMessage): number {
  if (message.role === 'user') {
    const content = message.content;
    if (typeof content === 'string') {
      return content.length;
    }
    let chars = 0;
    for (const b of content) {
      if (b.type === 'text') {
        chars += b.text.length;
      }
      if (b.type === 'image') {
        chars += IMAGE_CHAR_ESTIMATE;
      }
    }
    return chars;
  }

  if (message.role === 'assistant') {
    let chars = 0;
    for (const b of message.content) {
      if (b.type === 'text') {
        chars += b.text.length;
      }
      if (b.type === 'thinking') {
        chars += (b as { thinking: string }).thinking.length;
      }
      if (b.type === 'toolCall') {
        try {
          chars += JSON.stringify((b as { arguments?: unknown }).arguments ?? {}).length;
        } catch {
          chars += 128;
        }
      }
    }
    return chars;
  }

  if (message.role === 'toolResult') {
    let chars = 0;
    for (const b of message.content) {
      if (b.type === 'text') {
        chars += (b as TextContent).text.length;
      }
      if (b.type === 'image') {
        chars += IMAGE_CHAR_ESTIMATE;
      }
    }
    return chars;
  }

  return 256;
}

function estimateContextChars(messages: AgentMessage[]): number {
  return messages.reduce((sum, m) => sum + estimateMessageChars(m), 0);
}

function findAssistantCutoffIndex(messages: AgentMessage[], keepLastAssistants: number): number | null {
  if (keepLastAssistants <= 0) {
    return messages.length;
  }

  let remaining = keepLastAssistants;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role !== 'assistant') {
      continue;
    }
    remaining--;
    if (remaining === 0) {
      return i;
    }
  }
  return null;
}

function findFirstUserIndex(messages: AgentMessage[]): number | null {
  for (let i = 0; i < messages.length; i++) {
    if (messages[i]?.role === 'user') {
      return i;
    }
  }
  return null;
}

function softTrimToolResultMessage(msg: ToolResultMessage, settings: ContextPruningSettings): ToolResultMessage | null {
  if (hasImageBlocks(msg.content as ReadonlyArray<TextContent | ImageContent>)) {
    return null;
  }

  const parts = collectTextSegments(msg.content as ReadonlyArray<TextContent | ImageContent>);
  const rawLen = estimateJoinedTextLength(parts);
  if (rawLen <= settings.softTrim.maxChars) {
    return null;
  }

  const headChars = Math.max(0, settings.softTrim.headChars);
  const tailChars = Math.max(0, settings.softTrim.tailChars);
  if (headChars + tailChars >= rawLen) {
    return null;
  }

  const head = takeHeadFromJoinedText(parts, headChars);
  const tail = takeTailFromJoinedText(parts, tailChars);
  const trimmed = `${head}\n...\n${tail}`;
  const note = `\n\n[Tool result trimmed: kept first ${headChars} chars and last ${tailChars} chars of ${rawLen} chars.]`;

  return { ...msg, content: [asText(trimmed + note)] };
}

// ── Main pruning function (ported 1:1 from OpenClaw pruner.ts) ─────────

/**
 * Prune context messages to prevent tool result bloat.
 * Ported from OpenClaw pruneContextMessages.
 *
 * Accepts either full ContextPruningSettings or simplified PruningConfig.
 */
function softTrimPhase(
  messages: AgentMessage[],
  settings: ContextPruningSettings,
  pruneStartIndex: number,
  cutoffIndex: number,
  totalChars: number
): { next: AgentMessage[] | null; prunableToolIndexes: number[]; totalChars: number } {
  const prunableToolIndexes: number[] = [];
  let next: AgentMessage[] | null = null;
  let chars = totalChars;

  for (let i = pruneStartIndex; i < cutoffIndex; i++) {
    const msg = messages[i];
    if (!msg || msg.role !== 'toolResult') {
      continue;
    }
    if (hasImageBlocks(msg.content as ReadonlyArray<TextContent | ImageContent>)) {
      continue;
    }

    prunableToolIndexes.push(i);

    const updated = softTrimToolResultMessage(msg as unknown as ToolResultMessage, settings);
    if (!updated) {
      continue;
    }

    const beforeChars = estimateMessageChars(msg);
    const afterChars = estimateMessageChars(updated as unknown as AgentMessage);
    chars += afterChars - beforeChars;
    if (!next) {
      next = messages.slice();
    }
    next[i] = updated as unknown as AgentMessage;
  }

  return { next, prunableToolIndexes, totalChars: chars };
}

function hardClearPhase(
  messages: AgentMessage[],
  settings: ContextPruningSettings,
  prunableToolIndexes: number[],
  existingNext: AgentMessage[] | null,
  totalChars: number,
  charWindow: number
): AgentMessage[] | null {
  const outputAfterSoftTrim = existingNext ?? messages;
  let prunableToolChars = 0;
  for (const i of prunableToolIndexes) {
    const msg = outputAfterSoftTrim[i];
    if (!msg || msg.role !== 'toolResult') {
      continue;
    }
    prunableToolChars += estimateMessageChars(msg);
  }
  if (prunableToolChars < settings.minPrunableToolChars) {
    return existingNext;
  }

  let next = existingNext;
  let chars = totalChars;
  let ratio = chars / charWindow;

  for (const i of prunableToolIndexes) {
    if (ratio < settings.hardClearRatio) {
      break;
    }

    const msg = (next ?? messages)[i];
    if (!msg || msg.role !== 'toolResult') {
      continue;
    }

    const beforeChars = estimateMessageChars(msg);
    const cleared: ToolResultMessage = {
      ...msg,
      content: [asText(settings.hardClear.placeholder)],
    };
    if (!next) {
      next = messages.slice();
    }
    next[i] = cleared as unknown as AgentMessage;
    const afterChars = estimateMessageChars(cleared as unknown as AgentMessage);
    chars += afterChars - beforeChars;
    ratio = chars / charWindow;
  }

  return next;
}

export function pruneContextMessages(
  messages: AgentMessage[],
  config: PruningConfig,
  settingsOverride?: ContextPruningSettings
): AgentMessage[] {
  const settings = settingsOverride ?? configToSettings(config);
  const contextWindowTokens = config.contextWindow;

  if (!contextWindowTokens || contextWindowTokens <= 0) {
    return messages;
  }

  const charWindow = contextWindowTokens * CHARS_PER_TOKEN_ESTIMATE;
  if (charWindow <= 0) {
    return messages;
  }

  const cutoffIndex = findAssistantCutoffIndex(messages, settings.keepLastAssistants);
  if (cutoffIndex === null) {
    return messages;
  }

  const firstUserIndex = findFirstUserIndex(messages);
  const pruneStartIndex = firstUserIndex === null ? messages.length : firstUserIndex;

  let totalChars = estimateContextChars(messages);
  let ratio = totalChars / charWindow;
  if (ratio < settings.softTrimRatio) {
    return messages;
  }

  // Phase 1: Soft-trim
  const phase1 = softTrimPhase(messages, settings, pruneStartIndex, cutoffIndex, totalChars);
  totalChars = phase1.totalChars;

  const outputAfterSoftTrim = phase1.next ?? messages;
  ratio = totalChars / charWindow;
  if (ratio < settings.hardClearRatio || !settings.hardClear.enabled) {
    return outputAfterSoftTrim;
  }

  // Phase 2: Hard-clear
  const result = hardClearPhase(messages, settings, phase1.prunableToolIndexes, phase1.next, totalChars, charWindow);
  return result ?? messages;
}
