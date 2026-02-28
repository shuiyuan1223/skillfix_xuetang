/**
 * Workbench Action Handlers — 15 actions for the Skill Debug Workbench
 */

import { createLogger } from '../utils/logger.js';
import { t } from '../locales/index.js';
import { generateToast } from './pages.js';
import { generateWorkbenchPage } from './workbench-page.js';
import {
  readWorkbenchSkillContent,
  readWorkbenchPromptContent,
  writeWorkbenchSkillContent,
  writeWorkbenchPromptContent,
  type WorkbenchState,
} from './workbench-init.js';
import type { GatewaySession, SendFn } from './server.js';
import type { A2UIMessage } from './a2ui.js';

const log = createLogger('Workbench');

type Payload = Record<string, unknown> | undefined;

// ── Action set ────────────────────────────────────────────────

export const WORKBENCH_ACTIONS = new Set([
  'debug_select_skill',
  'debug_toggle_skill',
  'debug_skill_change',
  'debug_save_skill',
  'debug_revert_skill',
  'debug_select_prompt',
  'debug_activate_prompt',
  'debug_prompt_change',
  'debug_save_prompt',
  'debug_revert_prompt',
  'debug_userdata_change',
  'debug_clear_data',
  'debug_run_interpret',
]);

// ── Helpers ───────────────────────────────────────────────────

function sendAll(send: SendFn, messages: A2UIMessage[]): void {
  for (const msg of messages) send(msg);
}

function rerender(session: GatewaySession, send: SendFn): void {
  const state = session.workbenchState;
  if (!state) return;
  sendAll(send, session.buildPage('workbench', generateWorkbenchPage(state)));
}

// ── Dispatcher ────────────────────────────────────────────────

export async function handleWorkbenchAction(
  session: GatewaySession,
  action: string,
  payload: Payload,
  send: SendFn
): Promise<void> {
  const state = session.workbenchState;
  if (!state) {
    log.warn('Workbench action without state', { action });
    return;
  }

  switch (action) {
    case 'debug_select_skill':
      handleSelectSkill(state, payload);
      break;
    case 'debug_toggle_skill':
      handleToggleSkill(state, payload);
      break;
    case 'debug_skill_change':
      handleSkillChange(state, payload);
      break;
    case 'debug_save_skill':
      handleSaveSkill(state, send);
      break;
    case 'debug_revert_skill':
      handleRevertSkill(state);
      break;
    case 'debug_select_prompt':
      handleSelectPrompt(state, payload);
      break;
    case 'debug_activate_prompt':
      handleActivatePrompt(state, payload);
      break;
    case 'debug_prompt_change':
      handlePromptChange(state, payload);
      break;
    case 'debug_save_prompt':
      handleSavePrompt(state, send);
      break;
    case 'debug_revert_prompt':
      handleRevertPrompt(state);
      break;
    case 'debug_userdata_change':
      handleUserdataChange(state, payload);
      break;
    case 'debug_clear_data':
      handleClearData(state);
      break;
    case 'debug_run_interpret':
      // Async — re-render happens inside
      await handleRunInterpret(session, send);
      return;
    default:
      log.warn('Unknown workbench action', { action });
      return;
  }

  rerender(session, send);
}

// ── Individual handlers ───────────────────────────────────────

function extractRowId(payload: Payload): string | undefined {
  // onRowClick sends { row: { id, name, ... } }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = payload?.row as any;
  return (row?.id ?? row?.name ?? payload?.id) as string | undefined;
}

function handleSelectSkill(state: WorkbenchState, payload: Payload): void {
  const id = extractRowId(payload);
  if (!id) return;
  state.selectedSkillId = id;
  // Lazy-load content if not already edited
  const skill = state.skills.find((s) => s.id === id);
  if (skill && !skill.editedContent) {
    skill.editedContent = readWorkbenchSkillContent(id);
  }
}

function handleToggleSkill(state: WorkbenchState, payload: Payload): void {
  // Column action sends { row: { id, ... }, value }
  const id = extractRowId(payload);
  if (!id) return;
  const skill = state.skills.find((s) => s.id === id);
  if (skill) skill.enabled = !skill.enabled;
}

function handleSkillChange(state: WorkbenchState, payload: Payload): void {
  if (!state.selectedSkillId) return;
  const skill = state.skills.find((s) => s.id === state.selectedSkillId);
  if (skill) {
    skill.editedContent = (payload?.value as string) ?? '';
    skill.dirty = true;
  }
}

function handleSaveSkill(state: WorkbenchState, send: SendFn): void {
  if (!state.selectedSkillId) return;
  const skill = state.skills.find((s) => s.id === state.selectedSkillId);
  if (skill?.editedContent != null) {
    writeWorkbenchSkillContent(skill.id, skill.editedContent);
    skill.dirty = false;
    sendAll(send, generateToast(t('workbench.saved'), 'success'));
  }
}

function handleRevertSkill(state: WorkbenchState): void {
  if (!state.selectedSkillId) return;
  const skill = state.skills.find((s) => s.id === state.selectedSkillId);
  if (skill) {
    skill.editedContent = readWorkbenchSkillContent(skill.id);
    skill.dirty = false;
  }
}

function handleSelectPrompt(state: WorkbenchState, payload: Payload): void {
  const id = extractRowId(payload);
  if (!id) return;
  state.selectedPromptId = id;
  const prompt = state.prompts.find((p) => p.id === id);
  if (prompt && !prompt.editedContent) {
    prompt.editedContent = readWorkbenchPromptContent(id);
  }
}

function handleActivatePrompt(state: WorkbenchState, payload: Payload): void {
  // Column action sends { row: { id, ... }, value }
  const id = extractRowId(payload);
  if (id) {
    state.activePromptId = id;
  }
}

function handlePromptChange(state: WorkbenchState, payload: Payload): void {
  if (!state.selectedPromptId) return;
  const prompt = state.prompts.find((p) => p.id === state.selectedPromptId);
  if (prompt) {
    prompt.editedContent = (payload?.value as string) ?? '';
    prompt.dirty = true;
  }
}

function handleSavePrompt(state: WorkbenchState, send: SendFn): void {
  if (!state.selectedPromptId) return;
  const prompt = state.prompts.find((p) => p.id === state.selectedPromptId);
  if (prompt?.editedContent != null) {
    writeWorkbenchPromptContent(prompt.id, prompt.editedContent);
    prompt.dirty = false;
    sendAll(send, generateToast(t('workbench.saved'), 'success'));
  }
}

function handleRevertPrompt(state: WorkbenchState): void {
  if (!state.selectedPromptId) return;
  const prompt = state.prompts.find((p) => p.id === state.selectedPromptId);
  if (prompt) {
    prompt.editedContent = readWorkbenchPromptContent(prompt.id);
    prompt.dirty = false;
  }
}

function handleUserdataChange(state: WorkbenchState, payload: Payload): void {
  state.testData = (payload?.value as string) ?? '';
}

function handleClearData(state: WorkbenchState): void {
  state.testData = '';
}

// ── Run Interpretation ────────────────────────────────────────

async function handleRunInterpret(session: GatewaySession, send: SendFn): Promise<void> {
  const state = session.workbenchState;
  if (!state) return;

  // Move current → previous
  if (state.currentResult) {
    state.previousResult = state.currentResult;
    state.currentResult = null;
  }

  state.runStatus = 'running';
  state.errorMessage = undefined;
  rerender(session, send);

  const startTime = Date.now();

  try {
    // Build the composite prompt
    const promptContent = state.activePromptId
      ? (state.prompts.find((p) => p.id === state.activePromptId)?.editedContent ??
        readWorkbenchPromptContent(state.activePromptId))
      : '';

    // Collect enabled skill guides
    const skillGuides = state.skills
      .filter((s) => s.enabled)
      .map((s) => {
        const content = s.editedContent ?? readWorkbenchSkillContent(s.id);
        return `<skill name="${s.id}">\n${content}\n</skill>`;
      })
      .join('\n\n');

    const systemInstruction = '直接根据提供的健康数据进行分析和解读，输出完整的健康报告。不要反问用户，不要询问更多信息，不要使用任何工具，直接基于现有数据给出分析结果。';

    const finalMessage = [
      systemInstruction,
      promptContent,
      skillGuides ? `<skill_guides>\n${skillGuides}\n</skill_guides>` : '',
      state.testData ? `<user_health_data>\n${state.testData}\n</user_health_data>` : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    if (!state.testData?.trim() && !promptContent?.trim()) {
      state.runStatus = 'error';
      state.errorMessage = 'No prompt or test data provided';
      rerender(session, send);
      return;
    }

    // Create isolated agent (same pattern as Slack webhook judge)
    const { createPHAAgent, resolveAgentProfileModel } = await import('../agent/pha-agent.js');
    const { MockDataSource } = await import('../data-sources/mock.js');
    const model = resolveAgentProfileModel('pha');

    const agent = await createPHAAgent({
      apiKey: model.apiKey,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
      provider: model.provider as any,
      modelId: model.modelId,
      baseUrl: model.baseUrl,
      dataSource: new MockDataSource(),
    });

    const resultText = await agent.chatAndWait(finalMessage);
    const durationMs = Date.now() - startTime;

    state.currentResult = {
      text: resultText,
      timestamp: Date.now(),
      durationMs,
    };
    state.runStatus = 'done';
  } catch (err) {
    log.error('Workbench interpretation failed', { error: err });
    state.runStatus = 'error';
    state.errorMessage = err instanceof Error ? err.message : String(err);
  }

  rerender(session, send);
}
