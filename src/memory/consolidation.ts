/**
 * Memory Consolidation — Daily Log → MEMORY.md automatic extraction
 *
 * Every N exchanges, reads today's daily log and uses LLM to extract
 * noteworthy facts, then appends them to MEMORY.md (long-term memory).
 * Runs fire-and-forget; failures are silently logged.
 */

import { readFileSync, existsSync } from 'fs';
import { getDailyLogPath, getMemoryPath } from './profile.js';
import type { MemoryManager } from './memory-manager.js';
import type { LLMSummarizationConfig } from './compaction.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('Memory/Consolidation');

const CONSOLIDATION_PROMPT = `你是一个记忆提炼助手。从以下对话日志中提取值得长期记住的关键事实。

规则：
- 只提取 **事实性信息**：用户的健康目标、偏好、习惯、重要健康事件、关键数据发现
- 不要提取闲聊、问候、Agent 的通用建议
- 每条事实一行，用 "- " 开头
- 如果没有值得记住的新信息，回复 "NONE"
- 排除 "已有记忆" 中已经记录的内容（避免重复）

已有记忆：
{existingMemory}

今日对话日志：
{dailyLog}`;

/**
 * Consolidate today's daily log into MEMORY.md via LLM extraction.
 * Fire-and-forget — all errors are caught and logged silently.
 */
export async function consolidateMemory(
  uuid: string,
  llmConfig: LLMSummarizationConfig,
  memoryManager: MemoryManager
): Promise<void> {
  // 1. Read today's daily log
  const dailyLogPath = getDailyLogPath(uuid);
  if (!existsSync(dailyLogPath)) {
    log.info('Consolidation skipped: no daily log for today');
    return;
  }
  const dailyLog = readFileSync(dailyLogPath, 'utf-8').trim();
  if (!dailyLog || dailyLog.length < 100) {
    log.info('Consolidation skipped: daily log too short');
    return;
  }

  // 2. Read existing MEMORY.md
  const memoryPath = getMemoryPath(uuid);
  let existingMemory = '';
  if (existsSync(memoryPath)) {
    existingMemory = readFileSync(memoryPath, 'utf-8').trim();
  }

  // 3. Build prompt
  const prompt = CONSOLIDATION_PROMPT.replace('{existingMemory}', existingMemory || '(空)').replace(
    '{dailyLog}',
    dailyLog
  );

  // 4. Call LLM to extract facts
  const extracted = await callLLMForExtraction(prompt, llmConfig);
  if (!extracted || extracted === 'NONE' || extracted.trim() === 'NONE') {
    log.info('Consolidation: no new facts to extract');
    return;
  }

  // 5. Append to MEMORY.md
  const date = new Date().toISOString().split('T')[0];
  const section = `\n## ${date} 自动提炼\n\n${extracted.trim()}\n`;
  memoryManager.appendMemory(uuid, section);
  log.info(`Consolidation: appended new facts to MEMORY.md (${extracted.trim().split('\n').length} lines)`);
}

/**
 * Call LLM to extract facts from daily log.
 * Mirrors the HTTP call pattern from compaction.ts callLLMForSummary.
 */
async function callLLMForExtraction(prompt: string, config: LLMSummarizationConfig): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    let response: Response;

    if (config.api === 'anthropic-messages') {
      const url = config.baseUrl ? `${config.baseUrl}/v1/messages` : 'https://api.anthropic.com/v1/messages';

      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: config.modelId,
          max_tokens: 512,
          system: 'You are a memory extraction assistant. Extract key facts from conversation logs.',
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        log.warn(`Consolidation LLM error (Anthropic): ${response.status}`);
        return null;
      }

      const data = (await response.json()) as {
        content: Array<{ type: string; text?: string }>;
      };
      return (
        data.content
          ?.filter((b) => b.type === 'text')
          .map((b) => b.text)
          .join('\n') || null
      );
    } else {
      const url = config.baseUrl
        ? `${config.baseUrl}/v1/chat/completions`
        : 'https://api.openai.com/v1/chat/completions';

      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.modelId,
          max_tokens: 512,
          messages: [
            {
              role: 'system',
              content: 'You are a memory extraction assistant. Extract key facts from conversation logs.',
            },
            { role: 'user', content: prompt },
          ],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        log.warn(`Consolidation LLM error (OpenAI): ${response.status}`);
        return null;
      }

      const data = (await response.json()) as {
        choices: Array<{ message: { content: string } }>;
      };
      return data.choices?.[0]?.message?.content || null;
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      log.warn('Consolidation LLM timed out (30s)');
    } else {
      log.warn('Consolidation LLM failed', err);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
