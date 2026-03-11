/**
 * Workbench Action Handlers — actions for the Skill Debug Workbench
 */

import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
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
  type WorkbenchResult,
  type WorkbenchDiffResult,
  type WorkbenchInterpretResult,
  WORKBENCH_MODELS,
} from './workbench-init.js';
import type { GatewaySession, SendFn } from './server.js';
import type { A2UIMessage } from './a2ui.js';
import { getProjectRoot } from '../evolution/version-manager.js';

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
  'debug_toggle_prompt',
  'debug_prompt_change',
  'debug_save_prompt',
  'debug_revert_prompt',
  'debug_enable_all_prompts',
  'debug_disable_all_prompts',
  'debug_userdata_change',
  'debug_clear_data',
  'debug_run_interpret',
  'debug_run_diff_interpret',
  'debug_copy_messages',
  'debug_enable_all_skills',
  'debug_disable_all_skills',
  'debug_toggle_skills_list',
  'debug_toggle_prompts_list',
  'debug_toggle_skill_preview',
  'debug_toggle_prompt_preview',
  'debug_toggle_testdata_preview',
  'debug_toggle_result_view',
  'debug_select_model',
  'debug_export_zip',
  'workbench_get_export_data',
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

/**
 * Push a re-render via the live SSE connection (bypassing HTTP collector).
 */
function rerenderViaSSE(session: GatewaySession): void {
  const sseSend = session.getActiveSend();
  if (sseSend) {
    rerender(session, sseSend);
  }
}

/**
 * Send a lightweight delta update for a single result's text via SSE.
 * Patches only the text/value prop of the active result component (~100 bytes),
 * avoiding the full 100KB page rebuild that caused main-thread blocking.
 */
function sendResultTextViaSSE(session: GatewaySession, result: WorkbenchResult): void {
  const sseSend = session.getActiveSend();
  if (!sseSend) return;
  const state = session.workbenchState;
  if (!state) return;
  const viewMode = state.resultViewModes[result.id] ?? 'rendered';
  if (result.kind === 'diff' && viewMode === 'source') {
    return;
  }
  if (viewMode === 'source') {
    sseSend({
      dataModelUpdate: { surfaceId: 'main', path: `wb_result_${result.id}_src`, contents: { value: result.text } },
    });
  } else {
    sseSend({
      dataModelUpdate: {
        surfaceId: 'main',
        path: `wb_result_${result.id}_rendered`,
        contents: { text: result.text },
      },
    });
  }
}

// ── Dispatcher ────────────────────────────────────────────────

export async function handleWorkbenchAction(
  session: GatewaySession,
  action: string,
  payload: Payload,
  send: SendFn
): Promise<void> {
  // Auto-initialize workbench state if not present
  if (!session.workbenchState) {
    const { initializeWorkbench } = await import('./workbench-init.js');
    session.workbenchState = await initializeWorkbench();
  }

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
    case 'debug_toggle_prompt':
      handleTogglePrompt(state, payload);
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
    case 'debug_enable_all_skills':
      for (const s of state.skills) s.enabled = true;
      break;
    case 'debug_disable_all_skills':
      for (const s of state.skills) s.enabled = false;
      break;
    case 'debug_enable_all_prompts':
      for (const p of state.prompts) p.enabled = true;
      break;
    case 'debug_disable_all_prompts':
      for (const p of state.prompts) p.enabled = false;
      break;
    case 'debug_toggle_skills_list':
      state.skillsListExpanded = !state.skillsListExpanded;
      break;
    case 'debug_toggle_prompts_list':
      state.promptsListExpanded = !state.promptsListExpanded;
      break;
    case 'debug_toggle_skill_preview':
      state.skillPreviewMode = !state.skillPreviewMode;
      break;
    case 'debug_toggle_prompt_preview':
      state.promptPreviewMode = !state.promptPreviewMode;
      break;
    case 'debug_toggle_testdata_preview':
      state.testDataPreviewMode = !state.testDataPreviewMode;
      break;
    case 'debug_select_model':
      state.selectedModelId = (payload?.modelId as string) ?? state.selectedModelId;
      break;
    case 'debug_toggle_result_view': {
      const resultId = payload?.resultId as string;
      if (!resultId) break;
      const cur = state.resultViewModes[resultId] ?? 'rendered';
      state.resultViewModes[resultId] = cur === 'source' ? 'rendered' : 'source';
      break;
    }
    case 'debug_run_interpret':
      // Fire-and-forget: run in background so action lock is released
      // immediately and other actions (skill switching) remain responsive.
      if (state.diffMode) {
        runDiffInterpretInBackground(session);
      } else {
        runInterpretInBackground(session, send);
      }
      break;
    case 'debug_copy_messages':
      // Handled client-side in App.tsx — no server action needed
      return;
    case 'debug_run_diff_interpret':
      // Toggle diff mode on/off (does not run anything by itself)
      state.diffMode = !state.diffMode;
      break;
    case 'debug_export_zip':
      // Handled client-side in App.tsx — no server action needed
      return;
    case 'workbench_get_export_data':
      // Return all skills and prompts content for ZIP export
      handleGetExportData(state, send);
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
  state.skillPreviewMode = false;
  const skill = state.skills.find((s) => s.id === id);
  if (skill && !skill.dirty) {
    skill.editedContent = readWorkbenchSkillContent(id);
  }
}

function handleToggleSkill(state: WorkbenchState, payload: Payload): void {
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
    log.info('Skill reverted', { skillId: skill.id });
  }
}

function handleSelectPrompt(state: WorkbenchState, payload: Payload): void {
  const id = extractRowId(payload);
  if (!id) return;
  state.selectedPromptId = id;
  state.promptPreviewMode = false;
  const prompt = state.prompts.find((p) => p.id === id);
  if (prompt && !prompt.dirty) {
    prompt.editedContent = readWorkbenchPromptContent(id);
  }
}

function handleTogglePrompt(state: WorkbenchState, payload: Payload): void {
  const id = extractRowId(payload);
  if (!id) return;
  const prompt = state.prompts.find((p) => p.id === id);
  if (prompt) prompt.enabled = !prompt.enabled;
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
    log.info('Prompt reverted', { promptId: prompt.id });
  }
}

function handleUserdataChange(state: WorkbenchState, payload: Payload): void {
  state.testData = (payload?.value as string) ?? '';
}

function handleClearData(state: WorkbenchState): void {
  state.testData = '';
  log.info('Test data cleared');
}

function handleGetExportData(state: WorkbenchState, send: SendFn): void {
  // Read all skills and prompts content from disk
  const skills = state.skills.map((s) => ({
    id: s.id,
    name: s.name,
    content: s.editedContent ?? readWorkbenchSkillContent(s.id),
  }));

  const prompts = state.prompts.map((p) => ({
    id: p.id,
    name: p.name,
    content: p.editedContent ?? readWorkbenchPromptContent(p.id),
  }));

  // Send data response (will be collected by HTTP collector)
  send({
    type: 'workbench_export_data',
    data: { skills, prompts },
  });
}

// ── Run Interpretation (background) ──────────────────────────

/** Extract text content from pi-agent message content blocks */
function extractTextFromContent(content: unknown[]): string {
  return content
    .map((block) => {
      if (typeof block === 'string') return block;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b = block as any;
      if (b?.type === 'text') return b.text as string;
      return '';
    })
    .join('');
}

function buildWorkbenchCompositeMessage(args: {
  promptContent: string;
  skillGuides: string;
  testData: string;
}): string {
  let systemInstruction =
    '鐩存帴鏍规嵁鎻愪緵鐨勫仴搴锋暟鎹繘琛屽垎鏋愬拰瑙ｈ锛岃緭鍑哄畬鏁寸殑鍋ュ悍鎶ュ憡銆備笉瑕佸弽闂敤鎴凤紝涓嶈璇㈤棶鏇村淇℃伅锛屼笉瑕佷娇鐢ㄤ换浣曞伐鍏凤紝鐩存帵鍩轰簬鐜版湁鏁版嵁缁欏嚭鍒嗘瀽缁撴灉銆?';

  systemInstruction =
    '直接根据提供的健康数据进行分析和解读，输出完整的健康报告。不要反问用户，不要询问更多信息，不要使用任何工具，直接基于现有数据给出分析结果。';

  return [
    systemInstruction,
    args.promptContent,
    args.skillGuides ? `<skill_guides>\n${args.skillGuides}\n</skill_guides>` : '',
    args.testData ? `<user_health_data>\n${args.testData}\n</user_health_data>` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Launch interpretation in the background so the action lock is released
 * immediately. All UI updates are pushed via SSE.
 */
function runInterpretInBackground(session: GatewaySession, _send: SendFn): void {
  const state = session.workbenchState;
  if (!state) return;

  const newResult: WorkbenchInterpretResult = {
    kind: 'interpret',
    id: `r_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
    text: '',
    timestamp: Date.now(),
    status: 'running',
    enabledPromptCount: state.prompts.filter((p) => p.enabled).length,
    totalPromptCount: state.prompts.length,
    enabledPromptNames: state.prompts
      .filter((p) => p.enabled)
      .map((p) => p.name)
      .join(', '),
    enabledSkillCount: state.skills.filter((s) => s.enabled).length,
    totalSkillCount: state.skills.length,
    enabledSkillNames: state.skills
      .filter((s) => s.enabled)
      .map((s) => s.name)
      .join(', '),
    modelId: state.selectedModelId,
    modelLabel: WORKBENCH_MODELS.find((m) => m.id === state.selectedModelId)?.label,
  };
  state.results.unshift(newResult);
  state.currentResult = newResult;

  // Fire-and-forget — errors are caught inside
  void doRunInterpret(session, newResult).catch((err) => {
    log.error('Workbench background interpret failed', { error: err });
  });
}

async function doRunInterpret(session: GatewaySession, result: WorkbenchInterpretResult): Promise<void> {
  const state = session.workbenchState;
  if (!state) return;

  const startTime = Date.now();

  try {
    const promptContent = state.prompts
      .filter((p) => p.enabled)
      .map((p) => p.editedContent ?? readWorkbenchPromptContent(p.id))
      .join('\n\n');

    const skillGuides = state.skills
      .filter((s) => s.enabled)
      .map((s) => {
        const content = s.editedContent ?? readWorkbenchSkillContent(s.id);
        return `<skill name="${s.id}">\n${content}\n</skill>`;
      })
      .join('\n\n');

    const finalMessage = buildWorkbenchCompositeMessage({
      promptContent,
      skillGuides,
      testData: state.testData,
    });

    if (!state.testData?.trim() && !promptContent?.trim()) {
      result.status = 'error';
      result.errorMessage = 'No prompt or test data provided';
      rerenderViaSSE(session);
      return;
    }

    const { createPHAAgent, resolveAgentProfileModel } = await import('../agent/pha-agent.js');
    const { MockDataSource } = await import('../data-sources/mock.js');
    const model = resolveAgentProfileModel('pha');

    const agent = await createPHAAgent({
      apiKey: model.apiKey,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
      provider: model.provider as any,
      modelId: result.modelId || model.modelId,
      baseUrl: model.baseUrl,
      dataSource: new MockDataSource(),
    });

    let accumulatedText = '';
    let lastRenderTime = 0;
    const RENDER_INTERVAL_MS = 500;

    result.messages = finalMessage;

    const unsubscribe = agent.subscribe((event) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ev = event as any;
      if (ev.type === 'message_start' || ev.type === 'message_update') {
        if (ev.message?.role === 'assistant' && ev.message?.content) {
          accumulatedText = extractTextFromContent(ev.message.content as unknown[]);
          result.text = accumulatedText;

          const now = Date.now();
          if (now - lastRenderTime >= RENDER_INTERVAL_MS) {
            lastRenderTime = now;
            sendResultTextViaSSE(session, result);
          }
        }
      } else if (ev.type === 'error') {
        log.error('Workbench agent error event', { error: ev.error });
        result.status = 'error';
        result.errorMessage = ev.error?.message || 'Agent error';
        rerenderViaSSE(session);
      }
    });

    try {
      await agent.chat(finalMessage);
      await agent.getAgent().waitForIdle();
    } finally {
      unsubscribe();
    }

    result.text = accumulatedText;
    result.durationMs = Date.now() - startTime;
    result.status = 'done';
  } catch (err) {
    log.error('Workbench interpretation failed', { error: err });
    result.status = 'error';
    result.errorMessage = err instanceof Error ? err.message : String(err);
  }

  rerenderViaSSE(session);
}

// ─────────────────────────────────────────────────────────────────────────────
// Diff interpretation (baseline vs current) + GLM-5 impact analysis
// ─────────────────────────────────────────────────────────────────────────────

function getUnifiedDiff(before: string, after: string): string | undefined {
  if (before === after) return undefined;

  const root = getProjectRoot();
  const tmpRoot = join(root, '.pha', 'workbench', 'tmp');
  if (!existsSync(tmpRoot)) {
    mkdirSync(tmpRoot, { recursive: true });
  }

  const dir = mkdtempSync(join(tmpRoot, 'diff-'));
  const beforePath = join(dir, 'before.txt');
  const afterPath = join(dir, 'after.txt');

  try {
    writeFileSync(beforePath, before, 'utf-8');
    writeFileSync(afterPath, after, 'utf-8');

    // Use spawnSync to avoid throwing on exit code 1 (which git diff uses to indicate "has differences").
    // windowsHide prevents CMD window flash on Windows.
    const result = spawnSync('git', ['diff', '--no-index', '--unified=3', '--', beforePath, afterPath], {
      cwd: root,
      encoding: 'utf-8',
      timeout: 15000,
      windowsHide: true,
    });
    // git diff: exit 0 = identical, exit 1 = has differences (normal), exit >1 = error
    if (result.status !== null && result.status > 1) {
      log.warn('git diff returned error status', { status: result.status, stderr: result.stderr });
      return undefined;
    }
    return result.stdout?.trim() ? result.stdout : undefined;
  } catch (err) {
    log.warn('Failed to compute unified diff, falling back to before/after view', { error: err });
    return undefined;
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

function truncateForPrompt(s: string, maxChars: number): string {
  if (s.length <= maxChars) return s;
  const head = s.slice(0, Math.floor(maxChars * 0.7));
  const tail = s.slice(-Math.floor(maxChars * 0.3));
  return `${head}\n\n...(truncated ${s.length - maxChars} chars)...\n\n${tail}`;
}

async function runOneLLMCall(args: { modelId: string; input: string }): Promise<{ text: string }> {
  const { createPHAAgent, resolveAgentProfileModel } = await import('../agent/pha-agent.js');
  const { MockDataSource } = await import('../data-sources/mock.js');
  const model = resolveAgentProfileModel('pha');

  const agent = await createPHAAgent({
    apiKey: model.apiKey,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
    provider: model.provider as any,
    modelId: args.modelId,
    baseUrl: model.baseUrl,
    dataSource: new MockDataSource(),
  });

  let accumulatedText = '';
  const unsubscribe = agent.subscribe((event) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ev = event as any;
    if (ev.type === 'message_start' || ev.type === 'message_update') {
      if (ev.message?.role === 'assistant' && ev.message?.content) {
        accumulatedText = extractTextFromContent(ev.message.content as unknown[]);
      }
    }
  });

  try {
    await agent.chat(args.input);
    await agent.getAgent().waitForIdle();
  } finally {
    unsubscribe();
  }

  return { text: accumulatedText };
}

function runDiffInterpretInBackground(session: GatewaySession): void {
  const state = session.workbenchState;
  if (!state) return;

  const newResult: WorkbenchDiffResult = {
    kind: 'diff',
    id: `d_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
    text: '准备对比...',
    timestamp: Date.now(),
    status: 'running',
    enabledPromptCount: state.prompts.filter((p) => p.enabled).length,
    totalPromptCount: state.prompts.length,
    enabledPromptNames: state.prompts
      .filter((p) => p.enabled)
      .map((p) => p.name)
      .join(', '),
    enabledSkillCount: state.skills.filter((s) => s.enabled).length,
    totalSkillCount: state.skills.length,
    enabledSkillNames: state.skills
      .filter((s) => s.enabled)
      .map((s) => s.name)
      .join(', '),
    // Diff mode is fixed to GLM-5 per requirements.
    modelId: 'z-ai/glm-5',
    modelLabel: 'GLM-5',
  };

  state.results.unshift(newResult);
  state.currentResult = newResult;
  rerenderViaSSE(session);

  void doRunDiffInterpret(session, newResult).catch((err) => {
    log.error('Workbench diff interpret failed', { error: err });
    newResult.status = 'error';
    newResult.errorMessage = err instanceof Error ? err.message : String(err);
    newResult.text = newResult.errorMessage;
    rerenderViaSSE(session);
  });
}

async function doRunDiffInterpret(session: GatewaySession, result: WorkbenchDiffResult): Promise<void> {
  const state = session.workbenchState;
  if (!state) return;

  const startTime = Date.now();

  const prompts = state.prompts.map((p) => ({
    id: p.id,
    enabled: p.enabled,
    before: p.baselineContent ?? readWorkbenchPromptContent(p.id),
    after: p.editedContent ?? readWorkbenchPromptContent(p.id),
  }));
  const skills = state.skills.map((s) => ({
    id: s.id,
    enabled: s.enabled,
    before: s.baselineContent ?? readWorkbenchSkillContent(s.id),
    after: s.editedContent ?? readWorkbenchSkillContent(s.id),
  }));

  const promptDiffs = prompts
    .filter((p) => p.before !== p.after)
    .map((p) => ({ ...p, unifiedDiff: getUnifiedDiff(p.before, p.after) }));
  const skillDiffs = skills
    .filter((s) => s.before !== s.after)
    .map((s) => ({ ...s, unifiedDiff: getUnifiedDiff(s.before, s.after) }));

  if (promptDiffs.length === 0 && skillDiffs.length === 0) {
    result.status = 'error';
    result.errorMessage = '未检测到 skill/prompt 的修改（相对本次工作台初始化基线）。';
    result.text = result.errorMessage;
    rerenderViaSSE(session);
    return;
  }

  const enabledChanged =
    promptDiffs.filter((d) => d.enabled).length > 0 || skillDiffs.filter((d) => d.enabled).length > 0;
  if (!enabledChanged) {
    result.status = 'error';
    result.errorMessage = '检测到修改，但这些 skill/prompt 目前未启用。请先启用后再对比输出差异。';
    result.text = result.errorMessage;
    rerenderViaSSE(session);
    return;
  }

  const promptContentBefore = prompts
    .filter((p) => p.enabled)
    .map((p) => p.before)
    .join('\n\n');
  const promptContentAfter = prompts
    .filter((p) => p.enabled)
    .map((p) => p.after)
    .join('\n\n');

  const skillGuidesBefore = skills
    .filter((s) => s.enabled)
    .map((s) => `<skill name="${s.id}">\n${s.before}\n</skill>`)
    .join('\n\n');
  const skillGuidesAfter = skills
    .filter((s) => s.enabled)
    .map((s) => `<skill name="${s.id}">\n${s.after}\n</skill>`)
    .join('\n\n');

  const beforeMessage = buildWorkbenchCompositeMessage({
    promptContent: promptContentBefore,
    skillGuides: skillGuidesBefore,
    testData: state.testData,
  });
  const afterMessage = buildWorkbenchCompositeMessage({
    promptContent: promptContentAfter,
    skillGuides: skillGuidesAfter,
    testData: state.testData,
  });

  if (!state.testData?.trim() && !promptContentAfter?.trim()) {
    result.status = 'error';
    result.errorMessage = 'No prompt or test data provided';
    result.text = result.errorMessage;
    rerenderViaSSE(session);
    return;
  }

  result.text = '1/3 生成基线解读（Before）...';
  sendResultTextViaSSE(session, result);
  const before = await runOneLLMCall({ modelId: 'z-ai/glm-5', input: beforeMessage });

  result.text = '2/3 生成当前解读（After）...';
  sendResultTextViaSSE(session, result);
  const after = await runOneLLMCall({ modelId: 'z-ai/glm-5', input: afterMessage });

  const outputUnifiedDiff = getUnifiedDiff(before.text, after.text);

  result.text = '3/3 语义分析：标注变更影响段落...';
  sendResultTextViaSSE(session, result);

  const diffSummaryInput = [
    '你是”Skill/Prompt 变更语义影响分析器”。请基于 Skill/Prompt 的修改内容，理解语义上改变了什么规则或行为，然后在 Before/After 输出中用 **粗体** 标注受影响的关键句子或段落。',
    '',
    '要求：',
    '- 严格按照下面的输出格式，不要在格式标记之外输出任何额外文字',
    '- 用 **粗体** 标注 Before 输出中体现”旧行为/被修改规则”的关键句子或段落',
    '- 用 **粗体** 标注 After 输出中体现”新行为/变更影响”的关键句子或段落',
    '- 保留原文其他内容（不要改写）',
    '- 如果变更对某段输出没有可辨识的影响，则不标注',
    '',
    '【变更 Diff（仅启用项）】',
    ...promptDiffs
      .filter((d) => d.enabled)
      .map((d) => `### Prompt: ${d.id}.md\n\n${truncateForPrompt(d.unifiedDiff ?? '（无法获取 diff）', 8000)}`),
    ...skillDiffs
      .filter((d) => d.enabled)
      .map((d) => `### Skill: ${d.id}/SKILL.md\n\n${truncateForPrompt(d.unifiedDiff ?? '（无法获取 diff）', 8000)}`),
    '',
    '【Before 输出（修改前的解读）】',
    truncateForPrompt(before.text, 15000),
    '',
    '【After 输出（修改后的解读）】',
    truncateForPrompt(after.text, 15000),
    '',
    '输出格式（严格按此格式，三条分隔线必须独占完整一行）：',
    '<<<SUMMARY>>>',
    '（2-3句话总结：Skill/Prompt 语义上改变了什么规则，对输出产生了什么影响）',
    '<<<ANNOTATED_BEFORE>>>',
    '（Before 输出原文，将体现旧行为的关键句用 **...** 包裹，其余原样保留）',
    '<<<ANNOTATED_AFTER>>>',
    '（After 输出原文，将体现新行为/变更影响的关键句用 **...** 包裹，其余原样保留）',
  ].join('\n');

  const analysis = await runOneLLMCall({ modelId: 'z-ai/glm-5', input: diffSummaryInput });

  // Parse structured sections from LLM response
  const summaryMatch = analysis.text.match(/<<<SUMMARY>>>\n([\s\S]*?)(?=<<<ANNOTATED_BEFORE>>>|$)/);
  const beforeMatch = analysis.text.match(/<<<ANNOTATED_BEFORE>>>\n([\s\S]*?)(?=<<<ANNOTATED_AFTER>>>|$)/);
  const afterMatch = analysis.text.match(/<<<ANNOTATED_AFTER>>>\n([\s\S]*?)$/);
  const analysisText = summaryMatch?.[1]?.trim() ?? analysis.text;
  const annotatedBefore = beforeMatch?.[1]?.trim() ?? before.text;
  const annotatedAfter = afterMatch?.[1]?.trim() ?? after.text;

  result.beforeMessages = beforeMessage;
  result.afterMessages = afterMessage;
  result.beforeOutput = before.text;
  result.afterOutput = after.text;
  result.outputUnifiedDiff = outputUnifiedDiff;
  result.promptDiffs = promptDiffs.map((d) => ({
    id: d.id,
    enabled: d.enabled,
    before: d.before,
    after: d.after,
    unifiedDiff: d.unifiedDiff,
  }));
  result.skillDiffs = skillDiffs.map((d) => ({
    id: d.id,
    enabled: d.enabled,
    before: d.before,
    after: d.after,
    unifiedDiff: d.unifiedDiff,
  }));
  result.analysisText = analysisText;
  result.annotatedBefore = annotatedBefore;
  result.annotatedAfter = annotatedAfter;
  result.durationMs = Date.now() - startTime;
  result.status = 'done';
  result.text = analysisText || '完成';

  rerenderViaSSE(session);
}
