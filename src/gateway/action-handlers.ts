/**
 * Action Handlers — extracted from GatewaySession.handleAction
 *
 * Each handler is a function receiving (session, action, payload, send).
 * The dispatch map eliminates the 130+ if/else chain (CC=781 → CC<20).
 */

import { writeFileSync } from 'fs';
import { GatewaySession, type SendFn } from './server.js';
import { t } from '../locales/index.js';
import {
  loadConfig,
  saveConfig,
  getBenchmarkModels,
  resolveBenchmarkModelApiKey,
  resolveBenchmarkModelBaseUrl,
  type LLMProvider,
  type BenchmarkModelConfig,
  type PHAConfig,
} from '../utils/config.js';
import { getUserId, getStateDir } from '../utils/config.js';
import { getAgentProfile } from '../agent/pha-agent.js';
import { getMemoryManager } from '../memory/index.js';
import {
  generateToast,
  generateBenchmarkRunDetailModal,
  generateTraceDetailModal,
  generateEvaluationDetailModal,
  generateTestCaseDetailModal,
  generateSuggestionDetailModal,
  generateCreateTestCaseModal,
  generateCreateSkillModal,
  generateBenchmarkModelSelectorModal,
  generateToolDetailModal,
  generateSkillDetailModal,
  generatePromptRevertModal,
  generateMergeConfirmModal,
  generatePlanDetailModal,
  generateIntegrationsPage,
  type PlansPageTab,
} from './pages.js';
import type { A2UIMessage } from './a2ui.js';
import { loadPlan, savePlan } from '../plans/store.js';
import type { PlanStatus } from '../plans/types.js';
import { saveRecommendation, getRecommendation, saveReminder, getReminder } from '../proactive/store.js';
import { autoSyncPlanProgress, type HealthSnapshot } from '../agent/health-context.js';
import { createDataSourceForUser } from '../data-sources/index.js';
import { ensureUserDir } from '../memory/profile.js';
import { getPromptHistoryTool, updatePromptTool, revertPromptTool, setPromptsDir } from '../tools/prompt-tools.js';
import {
  listSkillsTool,
  getSkillTool,
  toggleSkillTool,
  updateSkillTool,
  createSkillTool,
} from '../tools/skill-tools.js';
import { systemMemoryWriteTool } from '../tools/system-memory-tools.js';
import { globalRegistry, categoryToAgentTags } from '../tools/index.js';
import {
  getTrace,
  listTraces,
  getEvaluation,
  listEvaluations,
  listTestCases,
  getTestCase,
  listSuggestions,
  getSuggestion,
  insertTestCase,
  deleteTestCase,
  updateSuggestionStatus,
  deleteBenchmarkRun,
  listEvolutionVersions,
  getEvolutionVersionByBranch,
} from '../memory/db.js';
import { readBenchmarkProgress } from '../evolution/benchmark-progress.js';
import {
  readFileFromBranch,
  readFileFromRef,
  getChangedFilesForVersion,
  mergeVersion,
  abandonVersion,
} from '../evolution/version-manager.js';
import { resolveSessionPath, touchSession } from '../memory/session-store.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('Gateway/Actions');
const logEvolution = log.child('Evolution');

// ============================================================================
// Types
// ============================================================================

type Payload = Record<string, unknown> | undefined;

/** Handler signature: returns true if handled, false if not */
export type ActionHandler = (session: GatewaySession, action: string, payload: Payload, send: SendFn) => Promise<void>;

/** Send an array of A2UIMessage objects one by one through the send function */
function sendAll(send: SendFn, messages: A2UIMessage[]): void {
  for (const msg of messages) {
    send(msg);
  }
}

// ============================================================================
// Helper — find full IDs from truncated short IDs
// ============================================================================

function findFullTraceId(shortId: string): string | null {
  const traces = listTraces({ limit: 100 });
  const found = traces.find((t) => t.id.startsWith(shortId));
  return found?.id || null;
}

function findFullEvaluationId(shortId: string): string | null {
  const evals = listEvaluations({ limit: 100 });
  const found = evals.find((e) => e.id.startsWith(shortId));
  return found?.id || null;
}

function findFullTestCaseId(shortId: string): string | null {
  const tests = listTestCases({ limit: 100 });
  const found = tests.find((t) => t.id.startsWith(shortId));
  return found?.id || null;
}

function findFullSuggestionId(shortId: string): string | null {
  const suggs = listSuggestions({ limit: 100 });
  const found = suggs.find((s) => s.id.startsWith(shortId));
  return found?.id || null;
}

function findFullBenchmarkRunId(session: GatewaySession, shortId: string): string | null {
  return session.findFullBenchmarkRunId(shortId);
}

// ============================================================================
// Chat handlers
// ============================================================================

const handleClearChat: ActionHandler = async (session, _action, _payload, send) => {
  if (session.currentView === 'legacy-chat') {
    session.legacyChatMessages = [];
    session.legacyChatStreaming = false;
    session.legacyChatStreamingContent = '';
    session.legacyChatCurrentAssistantMsgId = null;
    session.legacyChatLastStreamedText = '';
    session.legacyChatSessionId = crypto.randomUUID();
    if (session.userUuid) {
      const p = getAgentProfile('pha4old');
      const dir = p.sessionPath ? resolveSessionPath(p.sessionPath, session.userUuid) : undefined;
      touchSession(session.userUuid, `legacy-${session.legacyChatSessionId}`, dir);
    }
    session.legacyChatAgent = null;
  } else {
    session.chatMessages = [];
    session.isStreaming = false;
    session.streamingContent = '';
    session.currentAssistantMsgId = null;
    session.lastStreamedText = '';
    session.sessionId = crypto.randomUUID();
    if (session.userUuid) {
      const p = getAgentProfile('pha');
      const dir = p.sessionPath ? resolveSessionPath(p.sessionPath, session.userUuid) : undefined;
      touchSession(session.userUuid, session.sessionId, dir);
    }
    session.agent = null;
  }
  session.sendChatUpdate(send);
};

const handleSaClearChat: ActionHandler = async (session, _action, _payload, send) => {
  session.systemAgentChatMessages = [];
  session.systemAgentStreaming = false;
  session.systemAgentStreamingContent = '';
  session.saCurrentAssistantMsgId = null;
  session.saLastStreamedText = '';
  session.saSessionId = crypto.randomUUID();
  const saP = getAgentProfile('sa');
  const saDir = saP.sessionPath ? resolveSessionPath(saP.sessionPath, 'system') : undefined;
  touchSession(GatewaySession.SA_GLOBAL_UUID, `sa-${session.saSessionId}`, saDir);
  session.sendEvolutionLabUpdate(send);
};

const handleSendMessage: ActionHandler = async (session, _action, payload, send) => {
  if (payload?.content) {
    await session.handleUserMessage(payload.content as string, send);
  }
};

const handleStopGeneration: ActionHandler = async (session, _action, _payload, send) => {
  if (session.currentView === 'legacy-chat') {
    if (session.legacyChatStreaming && session.legacyChatAgent) {
      session.legacyChatAgent.abort();
      if (session.legacyChatStreamingContent.trim() && session.legacyChatCurrentAssistantMsgId) {
        session.persistMessage('legacy-chat', {
          timestamp: Date.now(),
          role: 'assistant',
          content: session.legacyChatStreamingContent,
        });
      } else if (session.legacyChatStreamingContent.trim()) {
        session.legacyChatMessages.push({
          id: crypto.randomUUID(),
          role: 'assistant',
          parts: [{ type: 'text', content: session.legacyChatStreamingContent }],
        });
        session.persistMessage('legacy-chat', {
          timestamp: Date.now(),
          role: 'assistant',
          content: session.legacyChatStreamingContent,
        });
      }
      session.legacyChatStreaming = false;
      session.legacyChatStreamingContent = '';
      session.legacyChatCurrentAssistantMsgId = null;
      session.legacyChatLastStreamedText = '';
      session.sendChatUpdate(send);
    }
  } else {
    if (session.isStreaming && session.agent) {
      session.agent.abort();
      if (session.streamingContent.trim() && session.currentAssistantMsgId) {
        session.persistMessage('chat', {
          timestamp: Date.now(),
          role: 'assistant',
          content: session.streamingContent,
        });
      } else if (session.streamingContent.trim()) {
        session.chatMessages.push({
          id: crypto.randomUUID(),
          role: 'assistant',
          parts: [{ type: 'text', content: session.streamingContent }],
        });
        session.persistMessage('chat', {
          timestamp: Date.now(),
          role: 'assistant',
          content: session.streamingContent,
        });
      }
      session.isStreaming = false;
      session.streamingContent = '';
      session.currentAssistantMsgId = null;
      session.lastStreamedText = '';
      session.sendChatUpdate(send);
    }
  }
};

const handleSaStopGeneration: ActionHandler = async (session, _action, _payload, send) => {
  if (session.systemAgentStreaming && session.systemAgent) {
    session.systemAgent.abort();
    if (session.systemAgentStreamingContent.trim()) {
      if (session.saCurrentAssistantMsgId) {
        session.persistMessage('system-agent', {
          timestamp: Date.now(),
          role: 'assistant',
          content: session.systemAgentStreamingContent,
        });
      } else {
        session.systemAgentChatMessages.push({
          id: crypto.randomUUID(),
          role: 'assistant',
          parts: [{ type: 'text', content: session.systemAgentStreamingContent }],
        });
        session.persistMessage('system-agent', {
          timestamp: Date.now(),
          role: 'assistant',
          content: session.systemAgentStreamingContent,
        });
      }
    }
    session.systemAgentStreaming = false;
    session.systemAgentStreamingContent = '';
    session.saCurrentAssistantMsgId = null;
    session.saLastStreamedText = '';
    session.sendEvolutionLabUpdate(send);
  }
};

// ============================================================================
// OAuth / Auth handlers
// ============================================================================

const handleStartAuth: ActionHandler = async (session, _action, _payload, send) => {
  import('../data-sources/huawei/huawei-api.js').then(({ clearMissingScopeErrors }) => clearMissingScopeErrors());
  send({
    type: 'auth_start',
    provider: 'huawei',
    uid: session.userUuid,
  });
};

const handleSetUid: ActionHandler = async (session, _action, payload, send) => {
  if (payload?.uid || payload?.uuid) {
    session.userUuid = (payload.uid || payload.uuid) as string;
    session.agent = null;
    send({ type: 'uid_set', uid: session.userUuid });
  }
};

const handleAuthComplete: ActionHandler = async (session, _action, payload, send) => {
  if (payload?.userId) {
    const newUserId = payload.userId as string;
    session.userUuid = newUserId;
    session.dataSource = createDataSourceForUser(newUserId);
    ensureUserDir(newUserId);
    session.agent = null;
  }
  const { clearMemoryCache } = await import('../data-sources/huawei/api-cache.js');
  const { clearMissingScopeErrors } = await import('../data-sources/huawei/huawei-api.js');
  clearMemoryCache();
  clearMissingScopeErrors();
  session.dashboardLoader = null;
  await session.handleNavigate(session.currentView, send);
};

// ============================================================================
// Memory handlers
// ============================================================================

const handleMemorySearchSubmit: ActionHandler = async (session, _action, payload, send) => {
  if (payload?.query) {
    const mm = getMemoryManager();
    const uuid = session.userUuid || getUserId() || 'anonymous';
    session.memorySearchQuery = payload.query as string;
    session.memorySearchResults = await mm.searchAsync(uuid, session.memorySearchQuery);
    await session.handleNavigate('memory', send);
  }
};

const handleMemoryLogSelect: ActionHandler = async (session, _action, payload, send) => {
  if (payload?.row) {
    const row = payload.row as { date: string };
    session.selectedLogDate = row.date;
    await session.handleNavigate('memory', send);
  }
};

const handleMemoryLogBack: ActionHandler = async (session, _action, _payload, send) => {
  session.selectedLogDate = null;
  await session.handleNavigate('memory', send);
};

const handleShowToast: ActionHandler = async (_session, _action, payload, send) => {
  if (payload?.message) {
    const variant = (payload.variant as 'info' | 'success' | 'error') || 'info';
    const toast = generateToast(payload.message as string, variant);
    sendAll(send, toast);
  }
};

// ============================================================================
// Prompt handlers
// ============================================================================

const handleSelectFile: ActionHandler = async (session, _action, payload, send) => {
  if (payload?.row) {
    const row = payload.row as { name: string; source: string };
    session.selectedPrompt = row.name;
    session.selectedPromptSource = (row.source === 'user' ? 'user' : 'system') as 'system' | 'user';
    session.editingPrompt = false;
    session.editBuffer = null;
    await session.openPromptModal(send);
  }
};

const handleEditPromptFromModal: ActionHandler = async (session, _action, _payload, send) => {
  session.editingPrompt = true;
  await session.openPromptModal(send);
};

const handleCancelEditFromModal: ActionHandler = async (session, _action, _payload, send) => {
  session.editingPrompt = false;
  session.editBuffer = null;
  await session.openPromptModal(send);
};

const handlePromptContentChange: ActionHandler = async (session, _action, payload, _send) => {
  if (payload?.value) {
    session.editBuffer = payload.value as string;
  }
};

const handleSavePromptFromModal: ActionHandler = async (session, _action, _payload, send) => {
  if (!session.selectedPrompt || !session.editBuffer) {
    return;
  }
  if (session.selectedPromptSource === 'user') {
    const filePath = session.getUserFilePath(session.selectedPrompt);
    if (filePath) {
      const { mkdirSync } = await import('fs');
      const { dirname } = await import('path');
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, session.editBuffer, 'utf-8');
    }
  } else {
    setPromptsDir(session.promptsScope === 'system' ? 'src/prompts/system-agent' : 'src/prompts/pha');
    try {
      await updatePromptTool.execute({
        name: session.selectedPrompt,
        content: session.editBuffer,
        commitMessage: `Update ${session.promptsScope === 'system' ? 'system-agent ' : ''}prompt: ${session.selectedPrompt} via UI`,
      });
    } finally {
      setPromptsDir('src/prompts/pha');
    }
  }
  session.editingPrompt = false;
  session.editBuffer = null;
  await session.openPromptModal(send);
};

const handleSelectCommit: ActionHandler = async (_session, _action, payload, _send) => {
  if (payload?.hash) {
    log.debug('Selected commit', { hash: payload.hash });
  }
};

const handleRevertPrompt: ActionHandler = async (session, _action, _payload, send) => {
  if (!session.selectedPrompt) {
    return;
  }
  setPromptsDir(session.promptsScope === 'system' ? 'src/prompts/system-agent' : 'src/prompts/pha');
  try {
    const historyResult = await getPromptHistoryTool.execute({
      name: session.selectedPrompt,
      limit: 20,
    });
    if (historyResult.success && historyResult.commits) {
      const modal = generatePromptRevertModal(session.selectedPrompt, historyResult.commits);
      sendAll(send, modal);
    }
  } finally {
    setPromptsDir('src/prompts/pha');
  }
};

const handleSelectRevertCommit: ActionHandler = async (session, _action, payload, send) => {
  if (!payload?.commit || !session.selectedPrompt) {
    return;
  }
  const commit = payload.commit as { hash: string };
  setPromptsDir(session.promptsScope === 'system' ? 'src/prompts/system-agent' : 'src/prompts/pha');
  try {
    await revertPromptTool.execute({ name: session.selectedPrompt, commitHash: commit.hash });
  } finally {
    setPromptsDir('src/prompts/pha');
  }
  send({ deleteSurface: { surfaceId: 'modal' } });
  await session.handleNavigate('settings/prompts', send);
};

// ============================================================================
// Skill handlers
// ============================================================================

const handleSelectSkill: ActionHandler = async (_session, _action, payload, send) => {
  if (!payload?.row) {
    return;
  }
  const row = payload.row as { name: string };
  const name = row.name.replace(/^[^\s]+\s+/, '');
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = (await getSkillTool.execute({ name })) as any;
    if (result?.success !== false) {
      const modal = generateSkillDetailModal({
        name,
        description: result.description || '',
        enabled: result.enabled !== false,
        content: result.content || '',
        emoji: result.metadata?.pha?.emoji,
      });
      sendAll(send, modal);
    }
  } catch {
    /* skill not found — ignore */
  }
};

const handleSelectSkillFile: ActionHandler = async (session, _action, payload, send) => {
  if (payload?.file) {
    session.selectedSkillFile = payload.file as string;
    session.editingSkill = false;
    session.editBuffer = null;
    await session.handleNavigate('settings/skills', send);
  }
};

const handleEditSkill: ActionHandler = async (session, _action, _payload, send) => {
  session.editingSkill = true;
  await session.handleNavigate('settings/skills', send);
};

const handleCancelEdit: ActionHandler = async (session, _action, _payload, send) => {
  session.editingSkill = false;
  session.editBuffer = null;
  await session.handleNavigate(session.currentView, send);
};

const handleSkillContentChange: ActionHandler = async (session, _action, payload, _send) => {
  if (payload?.value) {
    session.editBuffer = payload.value as string;
  }
};

const handleSaveSkill: ActionHandler = async (session, _action, _payload, send) => {
  if (!session.selectedSkill || !session.editBuffer) {
    return;
  }
  await updateSkillTool.execute({
    name: session.selectedSkill,
    content: session.editBuffer,
    filePath: session.selectedSkillFile,
  });
  session.editingSkill = false;
  session.editBuffer = null;
  await session.handleNavigate('settings/skills', send);
};

const handleToggleSkill: ActionHandler = async (session, _action, _payload, send) => {
  if (!session.selectedSkill) {
    return;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const skillsResult = (await listSkillsTool.execute({})) as any;
  const skill = skillsResult.skills?.find((s: { name: string }) => s.name === session.selectedSkill);
  if (skill) {
    await toggleSkillTool.execute({
      name: session.selectedSkill,
      enabled: !skill.enabled,
    });
    await session.handleNavigate('settings/skills', send);
  }
};

const handleToggleSkillFromModal: ActionHandler = async (_session, _action, payload, send) => {
  if (!payload?.skillName) {
    return;
  }
  const skillName = payload.skillName as string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const skillsResult = (await listSkillsTool.execute({})) as any;
  const skill = skillsResult.skills?.find((s: { name: string }) => s.name === skillName);
  if (skill) {
    await toggleSkillTool.execute({ name: skillName, enabled: !skill.enabled });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updated = (await getSkillTool.execute({ name: skillName })) as any;
    if (updated?.success !== false) {
      const modal = generateSkillDetailModal({
        name: skillName,
        description: updated.description || '',
        enabled: updated.enabled !== false,
        content: updated.content || '',
        emoji: updated.metadata?.pha?.emoji,
      });
      sendAll(send, modal);
    }
  }
};

const handleEditSkillFromModal: ActionHandler = async (session, _action, payload, send) => {
  if (!payload?.skillName) {
    return;
  }
  const skillName = payload.skillName as string;
  send({ deleteSurface: { surfaceId: 'modal' } });
  session.selectedSkill = skillName;
  session.selectedSkillFile = 'SKILL.md';
  session.editingSkill = true;
  session.editBuffer = null;
  await session.handleNavigate('settings/skills', send);
};

const handleCreateSkill: ActionHandler = async (_session, _action, _payload, send) => {
  const modal = generateCreateSkillModal();
  sendAll(send, modal);
};

const handleSubmitCreateSkill: ActionHandler = async (_session, _action, payload, send) => {
  if (!payload) {
    return;
  }
  const name = payload.name as string;
  const description = payload.description as string;
  const emoji = payload.emoji as string | undefined;
  const content = payload.content as string | undefined;
  await createSkillTool.execute({ name, description, emoji, content });
  send({ deleteSurface: { surfaceId: 'modal' } });
  await _session.handleNavigate('settings/skills', send);
};

// ============================================================================
// System Agent Memory handlers
// ============================================================================

const handleSaMemorySelect: ActionHandler = async (session, _action, payload, send) => {
  if (!payload?.row) {
    return;
  }
  const row = payload.row as { name: string };
  const name = row.name.replace(/\.md$/, '');
  session.saSelectedMemoryFile = name;
  session.saEditingMemory = false;
  session.editBuffer = null;
  await session.handleNavigate('memory', send);
};

const handleSaMemoryEdit: ActionHandler = async (session, _action, _payload, send) => {
  session.saEditingMemory = true;
  await session.handleNavigate('memory', send);
};

const handleSaMemoryContentChange: ActionHandler = async (session, _action, payload, _send) => {
  if (payload?.value) {
    session.editBuffer = payload.value as string;
  }
};

const handleSaMemorySave: ActionHandler = async (session, _action, _payload, send) => {
  if (!session.saSelectedMemoryFile || !session.editBuffer) {
    return;
  }
  await systemMemoryWriteTool.execute({
    file: session.saSelectedMemoryFile,
    content: session.editBuffer,
  });
  session.saEditingMemory = false;
  session.editBuffer = null;
  await session.handleNavigate('memory', send);
};

const handleSaMemoryCancel: ActionHandler = async (session, _action, _payload, send) => {
  session.saEditingMemory = false;
  session.editBuffer = null;
  await session.handleNavigate('memory', send);
};

// ============================================================================
// System Agent / Evolution Lab chat handlers
// ============================================================================

const handleSaSendMessage: ActionHandler = async (session, _action, payload, send) => {
  const content = (payload?.content || payload?.value) as string;
  if (content) {
    session.fireSystemAgentMessage(content, send);
  }
};

const handleEvoSendMessage: ActionHandler = async (session, _action, payload, send) => {
  if (payload?.value) {
    session.fireSystemAgentMessage(payload.value as string, send);
  }
};

const handleEvoTabChange: ActionHandler = async (session, _action, payload, send) => {
  if (payload?.tab) {
    session.evolutionActiveTab = payload.tab as 'overview' | 'benchmark' | 'versions' | 'data';
    session.sendEvolutionLabUpdate(send);
  }
};

const handleEvoDataSubtabChange: ActionHandler = async (session, _action, payload, send) => {
  if (payload?.tab) {
    session.evolutionDataSubTab = payload.tab as 'traces' | 'evaluations' | 'suggestions';
    session.sendEvolutionLabUpdate(send);
  }
};

const handleViewVersion: ActionHandler = async (session, _action, payload, send) => {
  if (!payload?.row) {
    return;
  }
  const row = payload.row as { branch?: string };
  if (row.branch) {
    session.evolutionSelectedVersion = row.branch;
    session.evolutionInspectedBranch = row.branch;
    session.evolutionLabDiffContent = null;
    session.sendEvolutionLabUpdate(send);
  }
};

const handleViewVersionFromList: ActionHandler = async (session, _action, payload, send) => {
  if (payload?.branch) {
    session.evolutionSelectedVersion = payload.branch as string;
    session.evolutionInspectedBranch = payload.branch as string;
    session.evolutionLabDiffContent = null;
    session.sendEvolutionLabUpdate(send);
  }
};

const handleEvoTimelineClick: ActionHandler = async (session, _action, payload, send) => {
  const eventId = (payload?.id || payload?.eventId) as string;
  if (!eventId?.startsWith('ver_')) {
    return;
  }

  let branch = payload?.branch as string | undefined;
  if (!branch) {
    const versionId = eventId.replace('ver_', '');
    const versions = listEvolutionVersions();
    const ver = versions.find((v) => v.id === versionId);
    branch = ver?.branch_name;
  }
  if (branch) {
    session.evolutionSelectedVersion = branch;
    session.evolutionInspectedBranch = branch;
    session.evolutionLabDiffContent = null;
    session.sendEvolutionLabUpdate(send);
  }
};

const handleEvoFileSelect: ActionHandler = async (session, _action, payload, send) => {
  if (!payload?.path) {
    return;
  }
  const inspectBranch = session.evolutionSelectedVersion || session.evolutionInspectedBranch;
  if (!inspectBranch) {
    return;
  }

  try {
    const filePath = payload.path as string;
    const afterContent = readFileFromBranch(inspectBranch, filePath) || '';

    let beforeContent: string;
    const version = getEvolutionVersionByBranch(inspectBranch);
    if (version?.status === 'merged') {
      const meta = version.metadata ? JSON.parse(version.metadata) : {};
      const base = meta.mergeBase || 'main';
      beforeContent = readFileFromRef(base, filePath) || '';
    } else {
      beforeContent = readFileFromBranch('main', filePath) || '';
    }

    session.evolutionLabDiffContent = {
      before: beforeContent,
      after: afterContent,
      path: filePath,
    };
    session.sendEvolutionLabUpdate(send);
  } catch (e) {
    logEvolution.error('File select error', { error: e });
  }
};

const handleEvoApprove: ActionHandler = async (session, _action, _payload, send) => {
  session.fireSystemAgentMessage('I approve this proposal. Please proceed with applying the changes.', send);
};

const handleEvoReject: ActionHandler = async (session, _action, _payload, send) => {
  session.fireSystemAgentMessage('I reject this proposal. Please revise the plan and propose again.', send);
};

// ============================================================================
// Playground handlers
// ============================================================================

const handlePgSendMessage: ActionHandler = async (session, _action, payload, send) => {
  if (payload?.value) {
    session.fireSystemAgentMessage(payload.value as string, send);
  }
};

const handlePgStartAuto: ActionHandler = async (session, _action, _payload, send) => {
  session.fireSystemAgentMessage(
    'Start a full evolution cycle: benchmark, diagnose, propose improvements, and wait for my approval before applying.',
    send
  );
};

// ============================================================================
// Tool / Skill detail modal handlers
// ============================================================================

const handleViewToolDetail: ActionHandler = async (_session, _action, payload, send) => {
  if (!payload?.row) {
    return;
  }
  const row = payload.row as Record<string, unknown>;
  const toolName = row.name as string;
  if (!toolName) {
    return;
  }
  const tool = globalRegistry.get(toolName);
  if (tool) {
    const modal = generateToolDetailModal({
      name: tool.name,
      displayName: tool.displayName,
      description: tool.description,
      category: tool.category,
      tags: categoryToAgentTags(tool.category),
      icon: tool.icon,
      companionSkill: tool.companionSkill,
      inputSchema: tool.inputSchema,
    });
    sendAll(send, modal);
  }
};

const handleViewSkillFromTable: ActionHandler = async (_session, _action, payload, send) => {
  if (!payload?.value) {
    return;
  }
  const skillName = payload.value as string;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = (await getSkillTool.execute({ name: skillName })) as any;
    if (result?.success !== false) {
      const modal = generateSkillDetailModal({
        name: skillName,
        description: result.description || '',
        enabled: result.enabled !== false,
        content: result.content || '',
        emoji: result.metadata?.pha?.emoji,
      });
      sendAll(send, modal);
    }
  } catch {
    /* skill not found — ignore */
  }
};

const handleViewSkillFromTool: ActionHandler = async (_session, _action, payload, send) => {
  if (!payload?.skillName) {
    return;
  }
  const skillName = payload.skillName as string;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = (await getSkillTool.execute({ name: skillName })) as any;
    if (result?.success !== false) {
      const modal = generateSkillDetailModal({
        name: skillName,
        description: result.description || '',
        enabled: result.enabled !== false,
        content: result.content || '',
        emoji: result.metadata?.pha?.emoji,
      });
      sendAll(send, modal);
    }
  } catch {
    /* skill not found — ignore */
  }
};

// ============================================================================
// Tab change handler (complex — delegates by currentView)
// ============================================================================

const handleTabChange: ActionHandler = async (session, _action, payload, send) => {
  if (!payload?.tab) {
    return;
  }
  const tab = payload.tab as string;

  const view = session.currentView;

  if (view === 'dashboard' || view === 'health' || view === 'sleep' || view === 'activity') {
    await handleDashboardTabChange(session, tab, send);
  } else if (view === 'memory') {
    await handleMemoryTabChange(session, tab, send);
  } else if (view === 'plans') {
    session.plansTab = tab as PlansPageTab;
    await session.handleNavigate('plans', send);
  } else if (view === 'settings/prompts') {
    await handlePromptsTabChange(session, tab, send);
  } else if (view === 'settings/skills') {
    await handleSkillsTabChange(session, tab, send);
  } else if (view === 'settings/tools') {
    session.toolsCategory = tab || 'all';
    await session.handleNavigate('settings/tools', send);
  } else if (view === 'settings/integrations') {
    await handleIntegrationsTabChange(session, tab, send);
  } else if (view === 'experiment') {
    session.activeDashboardTab = tab;
    await session.handleNavigate('experiment', send);
  } else if (view === 'evolution') {
    session.evolutionActiveTab = tab as 'overview' | 'benchmark' | 'versions' | 'data';
    session.sendEvolutionLabUpdate(send);
  } else if (view === 'settings/logs') {
    session.logsTab = tab as 'system' | 'llm';
    await session.handleNavigate('settings/logs', send);
  } else {
    type EvolutionTab =
      | 'overview'
      | 'traces'
      | 'evaluations'
      | 'benchmark'
      | 'runs'
      | 'suggestions'
      | 'config'
      | 'versions';
    session.evolutionTab = tab as EvolutionTab;
    await session.handleNavigate('settings/evolution-legacy', send);
  }
};

async function handleDashboardTabChange(session: GatewaySession, tab: string, send: SendFn): Promise<void> {
  type DashboardTab = 'overview' | 'vitals' | 'activity' | 'sleep' | 'body' | 'heart' | 'trends';
  session.dashboardTab = tab as DashboardTab;
  if (session.dashboardLoader) {
    session.dashboardLoader.updateSend(send);
    if (session.dashboardTab === 'trends') {
      session.dashboardLoader.getData().trendsMetric = session.trendsMetric;
      session.dashboardLoader.getData().trendsRange = session.trendsRange;
    }
    await session.dashboardLoader.load(session.dashboardTab);
    if (session.dashboardTab === 'trends') {
      await session.dashboardLoader.loadTrends(session.trendsMetric, session.trendsRange);
    }
  } else {
    await session.handleNavigate('dashboard', send);
  }
}

async function handleMemoryTabChange(session: GatewaySession, tab: string, send: SendFn): Promise<void> {
  if (tab === 'system-agent') {
    session.saSelectedMemoryFile = null;
    session.saEditingMemory = false;
    session.editBuffer = null;
  }
  if (tab !== 'logs') {
    session.selectedLogDate = null;
  }
  session.memoryTab = tab as 'profile' | 'summary' | 'logs' | 'search' | 'system-agent';
  await session.handleNavigate('memory', send);
}

async function handlePromptsTabChange(session: GatewaySession, tab: string, send: SendFn): Promise<void> {
  if (tab === 'pha' || tab === 'system') {
    session.promptsScope = tab;
    session.selectedPrompt = null;
    session.selectedPromptSource = 'system';
    session.editingPrompt = false;
    session.editBuffer = null;
    await session.handleNavigate('settings/prompts', send);
  }
}

async function handleSkillsTabChange(session: GatewaySession, tab: string, send: SendFn): Promise<void> {
  session.skillsCategory = tab;
  session.selectedSkill = null;
  session.selectedSkillFile = 'SKILL.md';
  session.editingSkill = false;
  session.editBuffer = null;
  await session.handleNavigate('settings/skills', send);
}

async function handleIntegrationsTabChange(session: GatewaySession, tab: string, send: SendFn): Promise<void> {
  session.integrationsTab = tab as 'overview' | 'issues' | 'prs' | 'branches';
  if (session.integrationsCache) {
    sendAll(
      send,
      session.buildPage(
        'settings/integrations',
        generateIntegrationsPage({
          activeTab: session.integrationsTab,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          repo: session.integrationsCache.repo as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          issues: session.integrationsCache.issues as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          prs: session.integrationsCache.prs as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          branchInfo: session.integrationsCache.branchInfo as any,
          ghAvailable: session.integrationsCache.ghAvailable,
        })
      )
    );
    session.loadIntegrationsTabData(send).catch(() => {});
  } else {
    sendAll(
      send,
      session.buildPage(
        'settings/integrations',
        generateIntegrationsPage({
          activeTab: session.integrationsTab,
          ghAvailable: true,
          loading: true,
        })
      )
    );
  }
}

// ============================================================================
// Trends handlers
// ============================================================================

const handleChangeTrendsRange: ActionHandler = async (session, _action, payload, send) => {
  if (!payload) {
    return;
  }
  session.trendsRange = (payload.value as string) || '1m';
  if (session.dashboardLoader) {
    session.dashboardLoader.updateSend(send);
    await session.dashboardLoader.loadTrends(session.trendsMetric, session.trendsRange);
  }
};

const handleChangeTrendsMetric: ActionHandler = async (session, _action, payload, send) => {
  if (!payload) {
    return;
  }
  session.trendsMetric = (payload.value as string) || 'steps';
  if (session.dashboardLoader) {
    session.dashboardLoader.updateSend(send);
    await session.dashboardLoader.loadTrends(session.trendsMetric, session.trendsRange);
  }
};

const handleTrendsConfigChange: ActionHandler = async (session, _action, payload, send) => {
  if (!payload) {
    return;
  }
  session.trendsMetric = (payload.metric as string) || 'steps';
  session.trendsRange = (payload.range as string) || '1m';
  if (session.dashboardLoader) {
    session.dashboardLoader.updateSend(send);
    await session.dashboardLoader.loadTrends(session.trendsMetric, session.trendsRange);
  }
};

// ============================================================================
// Evolution data viewer handlers
// ============================================================================

const handleTracesPageChange: ActionHandler = async (session, _action, payload, send) => {
  if (payload?.page === undefined) {
    return;
  }
  session.tracesPage = payload.page as number;
  if (session.currentView === 'evolution') {
    session.sendEvolutionLabUpdate(send);
  } else {
    await session.handleNavigate('settings/evolution', send);
  }
};

const handleViewTrace: ActionHandler = async (_session, _action, payload, send) => {
  if (!payload?.row) {
    return;
  }
  const row = payload.row as { id: string };
  const traceId = row.id.length === 8 ? findFullTraceId(row.id) : row.id;
  if (!traceId) {
    return;
  }
  const trace = getTrace(traceId);
  if (trace) {
    const modal = generateTraceDetailModal({
      id: trace.id,
      sessionId: trace.session_id,
      timestamp: trace.timestamp,
      userMessage: trace.user_message,
      agentResponse: trace.agent_response,
      toolCalls: trace.tool_calls ? JSON.parse(trace.tool_calls) : undefined,
      durationMs: trace.duration_ms || undefined,
    });
    sendAll(send, modal);
  }
};

const handleViewEvaluation: ActionHandler = async (_session, _action, payload, send) => {
  if (!payload?.row) {
    return;
  }
  const row = payload.row as { id: string; traceId: string };
  const evalId = row.id.length === 8 ? findFullEvaluationId(row.id) : row.id;
  if (!evalId) {
    return;
  }
  const evaluation = getEvaluation(evalId);
  if (evaluation) {
    const modal = generateEvaluationDetailModal({
      id: evaluation.id,
      traceId: evaluation.trace_id,
      timestamp: evaluation.timestamp,
      scores: JSON.parse(evaluation.scores),
      overallScore: evaluation.overall_score,
      feedback: evaluation.feedback || undefined,
      issues: evaluation.issues ? JSON.parse(evaluation.issues) : undefined,
    });
    sendAll(send, modal);
  }
};

const handleViewTestCase: ActionHandler = async (_session, _action, payload, send) => {
  if (!payload?.row) {
    return;
  }
  const row = payload.row as { id: string };
  const testId = row.id.length === 8 ? findFullTestCaseId(row.id) : row.id;
  if (!testId) {
    return;
  }
  const testCase = getTestCase(testId);
  if (testCase) {
    const modal = generateTestCaseDetailModal({
      id: testCase.id,
      category: testCase.category,
      query: testCase.query,
      context: testCase.context ? JSON.parse(testCase.context) : undefined,
      expected: JSON.parse(testCase.expected),
    });
    sendAll(send, modal);
  }
};

const handleViewSuggestion: ActionHandler = async (_session, _action, payload, send) => {
  if (!payload?.row) {
    return;
  }
  const row = payload.row as { id: string };
  const suggId = row.id.length === 8 ? findFullSuggestionId(row.id) : row.id;
  if (!suggId) {
    return;
  }
  const suggestion = getSuggestion(suggId);
  if (suggestion) {
    const modal = generateSuggestionDetailModal({
      id: suggestion.id,
      timestamp: suggestion.timestamp,
      type: suggestion.type,
      target: suggestion.target,
      currentValue: suggestion.current_value || undefined,
      suggestedValue: suggestion.suggested_value,
      rationale: suggestion.rationale || undefined,
      status: suggestion.status,
      validationResults: suggestion.validation_results ? JSON.parse(suggestion.validation_results) : undefined,
    });
    sendAll(send, modal);
  }
};

const handleCreateTestCase: ActionHandler = async (_session, _action, _payload, send) => {
  const modal = generateCreateTestCaseModal();
  sendAll(send, modal);
};

const handleSubmitCreateTestCase: ActionHandler = async (session, _action, payload, send) => {
  if (!payload) {
    return;
  }
  const category = payload.category as string;
  const query = payload.query as string;
  const minScore = payload.minScore ? Number(payload.minScore) : undefined;
  const shouldMentionStr = payload.shouldMention as string | undefined;
  const shouldNotMentionStr = payload.shouldNotMention as string | undefined;

  const id = crypto.randomUUID();
  insertTestCase({
    id,
    category,
    query,
    expected: {
      minScore,
      shouldMention: shouldMentionStr
        ? shouldMentionStr
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined,
      shouldNotMention: shouldNotMentionStr
        ? shouldNotMentionStr
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined,
    },
  });

  send({ deleteSurface: { surfaceId: 'modal' } });
  await session.handleNavigate('settings/evolution', send);
};

const handleDeleteTestCase: ActionHandler = async (session, _action, payload, send) => {
  if (!payload?.id) {
    return;
  }
  deleteTestCase(payload.id as string);
  send({ deleteSurface: { surfaceId: 'modal' } });
  await session.handleNavigate('settings/evolution', send);
};

const handleApplySuggestion: ActionHandler = async (session, _action, payload, send) => {
  if (!payload?.id) {
    return;
  }
  updateSuggestionStatus(payload.id as string, 'applied');
  send({ deleteSurface: { surfaceId: 'modal' } });
  await session.handleNavigate('settings/evolution', send);
};

const handleRejectSuggestion: ActionHandler = async (session, _action, payload, send) => {
  if (!payload?.id) {
    return;
  }
  updateSuggestionStatus(payload.id as string, 'rejected');
  send({ deleteSurface: { surfaceId: 'modal' } });
  await session.handleNavigate('settings/evolution', send);
};

const handleTestSuggestion: ActionHandler = async (session, _action, payload, send) => {
  if (!payload?.id) {
    return;
  }
  updateSuggestionStatus(payload.id as string, 'testing');
  send({ deleteSurface: { surfaceId: 'modal' } });
  await session.handleNavigate('settings/evolution', send);
};

const handleCloseModal: ActionHandler = async (_session, _action, _payload, send) => {
  send({ deleteSurface: { surfaceId: 'modal' } });
};

// ============================================================================
// Benchmark / Evolution version handlers
// ============================================================================

const handleRunBenchmark: ActionHandler = async (session, action, payload, send) => {
  const cliProgress = readBenchmarkProgress();
  if (cliProgress && cliProgress.running && cliProgress.source !== 'ui') {
    const toast = generateToast(t('evolution.externalBenchmarkRunning'), 'warning');
    sendAll(send, toast);
    return;
  }

  const benchmarkModels = getBenchmarkModels();
  const hasMultipleModels =
    Object.keys(benchmarkModels).length > 1 || (Object.keys(benchmarkModels).length === 1 && !benchmarkModels.default);

  if (hasMultipleModels || action === 'open_benchmark_modal') {
    const models = Object.entries(benchmarkModels).map(([name, config]) => ({
      name,
      label: config.label || `${config.provider}/${config.modelId}`,
    }));
    const modal = generateBenchmarkModelSelectorModal(models, (payload?.profile as 'quick' | 'full') || 'quick');
    sendAll(send, modal);
  } else {
    const profile = (payload?.profile as 'quick' | 'full') || 'quick';
    session
      .runBenchmarkAsync(profile, send)
      .catch((err: unknown) => logEvolution.error('Benchmark failed', { error: err }));
  }
};

const handleSubmitRunBenchmark: ActionHandler = async (session, _action, payload, send) => {
  send({ deleteSurface: { surfaceId: 'modal' } });
  const profile = (payload?.profile as 'quick' | 'full') || 'quick';
  const modelPreset = payload?.modelPreset as string;

  if (modelPreset === '__all_models__') {
    const benchmarkModels = getBenchmarkModels();
    for (const [name, modelConfig] of Object.entries(benchmarkModels)) {
      const apiKey = resolveBenchmarkModelApiKey(modelConfig);
      session
        .runBenchmarkAsync(profile, send, {
          provider: modelConfig.provider,
          modelId: modelConfig.modelId,
          apiKey,
          baseUrl: resolveBenchmarkModelBaseUrl(modelConfig),
          presetName: name,
        })
        .catch((err: unknown) => logEvolution.error('Benchmark failed', { preset: name, error: err }));
    }
  } else if (modelPreset && modelPreset !== '__default__') {
    const benchmarkModels = getBenchmarkModels();
    const modelConfig = benchmarkModels[modelPreset];
    if (modelConfig) {
      const apiKey = resolveBenchmarkModelApiKey(modelConfig);
      session
        .runBenchmarkAsync(profile, send, {
          provider: modelConfig.provider,
          modelId: modelConfig.modelId,
          apiKey,
          baseUrl: resolveBenchmarkModelBaseUrl(modelConfig),
          presetName: modelPreset,
        })
        .catch((err: unknown) => logEvolution.error('Benchmark failed', { preset: modelPreset, error: err }));
    } else {
      session
        .runBenchmarkAsync(profile, send)
        .catch((err: unknown) => logEvolution.error('Benchmark failed', { error: err }));
    }
  } else {
    session
      .runBenchmarkAsync(profile, send)
      .catch((err: unknown) => logEvolution.error('Benchmark failed', { error: err }));
  }
};

const handleRunAutoLoop: ActionHandler = async (_session, _action, _payload, send) => {
  const toast = generateToast(t('evolution.autoLoopHint'), 'warning');
  sendAll(send, toast);
};

const handleRunDiagnose: ActionHandler = async (session, _action, _payload, send) => {
  session.runDiagnoseAsync(send).catch((err: unknown) => logEvolution.error('Diagnose failed', { error: err }));
};

const handleSwitchVersion: ActionHandler = async (session, _action, payload, send) => {
  const branch = (payload?.branch as string) || null;
  try {
    session.switchAgentVersion(branch);
    const msg = branch ? t('evolution.versionSwitched').replace('{branch}', branch) : t('evolution.resetToMain');
    const toast = generateToast(msg, 'success');
    sendAll(send, toast);
    if (session.currentView === 'evolution') {
      session.sendEvolutionLabUpdate(send);
    } else {
      await session.handleNavigate('settings/evolution', send);
    }
  } catch (error) {
    const toast = generateToast(
      `Failed to switch version: ${error instanceof Error ? error.message : String(error)}`,
      'error'
    );
    sendAll(send, toast);
  }
};

const handleMergeVersion: ActionHandler = async (_session, _action, payload, send) => {
  if (!payload?.branch) {
    return;
  }
  try {
    const branch = payload.branch as string;
    const filePaths = getChangedFilesForVersion(branch);
    const changedFiles = filePaths.map((p) => ({ path: p, status: 'modified' }));
    const modal = generateMergeConfirmModal(branch, changedFiles);
    sendAll(send, modal);
  } catch (error) {
    const toast = generateToast(
      `Failed to prepare merge: ${error instanceof Error ? error.message : String(error)}`,
      'error'
    );
    sendAll(send, toast);
  }
};

const handleConfirmMerge: ActionHandler = async (session, _action, payload, send) => {
  if (!payload?.branch) {
    return;
  }
  try {
    send({ deleteSurface: { surfaceId: 'modal' } });
    mergeVersion(payload.branch as string);
    session.switchAgentVersion(null);
    const toast = generateToast(t('evolution.versionMerged'), 'success');
    sendAll(send, toast);
    if (session.currentView === 'evolution') {
      session.sendEvolutionLabUpdate(send);
    } else {
      await session.handleNavigate('settings/evolution', send);
    }
  } catch (error) {
    const toast = generateToast(`Failed to merge: ${error instanceof Error ? error.message : String(error)}`, 'error');
    sendAll(send, toast);
  }
};

const handleAbandonVersion: ActionHandler = async (session, _action, payload, send) => {
  if (!payload?.branch) {
    return;
  }
  try {
    abandonVersion(payload.branch as string);
    if (session.activeVersionBranch === payload.branch) {
      session.switchAgentVersion(null);
    }
    const toast = generateToast(t('evolution.versionAbandoned'), 'success');
    sendAll(send, toast);
    if (session.currentView === 'evolution') {
      session.evolutionSelectedVersion = null;
      session.sendEvolutionLabUpdate(send);
    } else {
      await session.handleNavigate('settings/evolution', send);
    }
  } catch (error) {
    const toast = generateToast(
      `Failed to abandon: ${error instanceof Error ? error.message : String(error)}`,
      'error'
    );
    sendAll(send, toast);
  }
};

const handleViewBenchmarkRun: ActionHandler = async (session, _action, payload, send) => {
  if (!payload?.row) {
    return;
  }
  const row = payload.row as { id: string };
  const runId = findFullBenchmarkRunId(session, row.id);
  if (runId) {
    session.lastViewedBenchmarkRunId = runId;
    session.modalRadarMode = 'categories';
    session.sendBenchmarkRunModal(runId, send);
  }
};

const handleDeleteBenchmarkRun: ActionHandler = async (session, _action, payload, send) => {
  const runId = payload?.runId as string;
  if (!runId) {
    return;
  }
  const fullId = findFullBenchmarkRunId(session, runId) || runId;
  deleteBenchmarkRun(fullId);
  session.benchmarkSelectedRunIds.delete(fullId);
  send({ deleteSurface: { surfaceId: 'modal' } });
  session.sendEvolutionLabUpdate(send);
  const toast = generateToast('Benchmark run deleted', 'success');
  sendAll(send, toast);
};

const handleSetModalRadarMode: ActionHandler = async (session, _action, payload, send) => {
  session.modalRadarMode = (payload?.mode as string) === 'criteria' ? 'criteria' : 'categories';
  if (session.lastViewedBenchmarkRunId) {
    session.sendBenchmarkRunModal(session.lastViewedBenchmarkRunId, send);
  }
};

const handleToggleBenchmarkRun: ActionHandler = async (session, _action, payload, send) => {
  const runId = (payload?.runId as string) || (payload?.row as { id: string })?.id;
  if (!runId) {
    return;
  }
  const fullId = findFullBenchmarkRunId(session, runId) || runId;
  if (session.benchmarkSelectedRunIds.has(fullId)) {
    session.benchmarkSelectedRunIds.delete(fullId);
  } else {
    session.benchmarkSelectedRunIds.add(fullId);
  }
  session.sendEvolutionLabUpdate(send);
};

const handleSetRadarMode: ActionHandler = async (session, _action, payload, send) => {
  const mode = payload?.mode as 'categories' | 'criteria';
  if (mode === 'categories' || mode === 'criteria') {
    session.benchmarkRadarMode = mode;
    session.sendEvolutionLabUpdate(send);
  }
};

const handleClearRunSelection: ActionHandler = async (session, _action, _payload, send) => {
  session.benchmarkSelectedRunIds.clear();
  session.sendEvolutionLabUpdate(send);
};

const handleRunTestCase: ActionHandler = async (_session, _action, payload, send) => {
  const toast = generateToast('Running test case...', 'info');
  sendAll(send, toast);
  send({ deleteSurface: { surfaceId: 'modal' } });
  logEvolution.info('Running test case', { id: payload?.id });
};

// ============================================================================
// Integrations handlers
// ============================================================================

const handleRefreshIntegrations: ActionHandler = async (session, _action, _payload, send) => {
  session.integrationsCache = null;
  await session.handleNavigate('settings/integrations', send);
};

// ============================================================================
// Logs page handlers
// ============================================================================

const handleLogsFilterLevel: ActionHandler = async (session, _action, payload, send) => {
  session.logsLevelFilter = payload?.value ? String(payload.value) : undefined;
  await session.handleNavigate('settings/logs', send);
};

const handleLogsFilterSubsystem: ActionHandler = async (session, _action, payload, send) => {
  session.logsSubsystemFilter = payload?.value ? String(payload.value) : undefined;
  await session.handleNavigate('settings/logs', send);
};

const handleLogsRefresh: ActionHandler = async (session, _action, _payload, send) => {
  await session.handleNavigate('settings/logs', send);
};

const handleLlmFilterProvider: ActionHandler = async (session, _action, payload, send) => {
  session.llmProviderFilter = payload?.value ? String(payload.value) : undefined;
  session.llmPage = 0;
  session.llmSelectedId = undefined;
  await session.handleNavigate('settings/logs', send);
};

const handleLlmFilterModel: ActionHandler = async (session, _action, payload, send) => {
  session.llmModelFilter = payload?.value ? String(payload.value) : undefined;
  session.llmPage = 0;
  session.llmSelectedId = undefined;
  await session.handleNavigate('settings/logs', send);
};

const handleLlmCallDetail: ActionHandler = async (session, _action, payload, send) => {
  const clickedId = (payload?.row as Record<string, unknown> | undefined)?.id as number | undefined;
  session.llmSelectedId = session.llmSelectedId === clickedId ? undefined : clickedId;
  await session.handleNavigate('settings/logs', send);
};

const handleLlmPageChange: ActionHandler = async (session, _action, payload, send) => {
  session.llmPage = Number(payload?.page) || 0;
  session.llmSelectedId = undefined;
  await session.handleNavigate('settings/logs', send);
};

// ============================================================================
// Settings handler (single handler for all settings_* actions)
// ============================================================================

export { handleSettingsAction } from './settings-handlers.js';

// ============================================================================
// Plan view/update handlers (prefix-based)
// ============================================================================

const handleViewPlan: ActionHandler = async (session, action, _payload, send) => {
  const planId = action.replace('view_plan:', '');
  const uuid = session.userUuid || getUserId() || 'anonymous';
  const plan = loadPlan(uuid, planId);
  if (!plan) {
    return;
  }

  try {
    const today = new Date().toISOString().split('T')[0];
    const source = session.dataSource;
    const todayDate = new Date(`${today}T00:00:00`);
    const dayOfWeek = todayDate.getDay();
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const weekStart = new Date(todayDate);
    weekStart.setDate(todayDate.getDate() - mondayOffset);
    const weekStartStr = weekStart.toISOString().split('T')[0];
    const [weeklySteps, weeklySleep, todayHR, todayWorkouts, weeklyWorkouts, todayMetrics, todayBodyComp] =
      await Promise.all([
        source.getWeeklySteps(today).catch(() => []),
        source.getWeeklySleep(today).catch(() => []),
        source.getHeartRate(today).catch(() => null),
        source.getWorkouts(today).catch(() => []),
        source.getWorkoutsRange?.(weekStartStr, today).catch(() => []) ?? Promise.resolve([]),
        source.getMetrics(today).catch(() => null),
        source.getBodyComposition?.(today).catch(() => null) ?? Promise.resolve(null),
      ]);
    const snapshot: HealthSnapshot = {
      weeklySteps,
      weeklySleep,
      todayHR,
      todayWorkouts,
      weeklyWorkouts,
      todayMetrics,
      todayBodyComp,
    };
    autoSyncPlanProgress([plan], uuid, today, snapshot);
    savePlan(uuid, plan);
  } catch {
    // sync failed — show stale data
  }

  const modal = generatePlanDetailModal(plan);
  sendAll(send, modal);
};

const handleUpdatePlanAction: ActionHandler = async (session, action, _payload, send) => {
  const parts = action.replace('update_plan_action:', '').split(':');
  const planId = parts[0];
  const newStatus = parts[1] as PlanStatus;
  const uuid = session.userUuid || getUserId() || 'anonymous';
  const plan = loadPlan(uuid, planId);
  if (!plan) {
    return;
  }

  plan.status = newStatus;
  if (newStatus === 'completed') {
    for (const goal of plan.goals) {
      if (goal.status !== 'completed' && goal.status !== 'missed') {
        goal.status = goal.currentValue && goal.currentValue >= goal.targetValue ? 'completed' : 'missed';
      }
    }
  }
  savePlan(uuid, plan);
  send({ deleteSurface: { surfaceId: 'modal' } });
  await session.handleNavigate('plans', send);
};

// ============================================================================
// Proactive handlers (prefix-based)
// ============================================================================

const handleRecDismiss: ActionHandler = async (session, action, _payload, send) => {
  const recId = action.replace('rec_dismiss:', '');
  const uuid = session.userUuid || getUserId() || 'anonymous';
  const rec = getRecommendation(uuid, recId);
  if (rec) {
    rec.status = 'dismissed';
    rec.dismissedAt = new Date().toISOString();
    saveRecommendation(uuid, rec);
    await session.handleNavigate('plans', send);
  }
};

const handleRecAct: ActionHandler = async (session, action, _payload, send) => {
  const recId = action.replace('rec_act:', '');
  const uuid = session.userUuid || getUserId() || 'anonymous';
  const rec = getRecommendation(uuid, recId);
  if (rec) {
    rec.status = 'acted';
    rec.dismissedAt = new Date().toISOString();
    saveRecommendation(uuid, rec);
    await session.handleNavigate('plans', send);
  }
};

const handleRemComplete: ActionHandler = async (session, action, _payload, send) => {
  const remId = action.replace('rem_complete:', '');
  const uuid = session.userUuid || getUserId() || 'anonymous';
  const rem = getReminder(uuid, remId);
  if (rem) {
    rem.status = 'completed';
    rem.completedAt = new Date().toISOString();
    saveReminder(uuid, rem);
    await session.handleNavigate('plans', send);
  }
};

// ============================================================================
// Dashboard refresh handler (prefix-based)
// ============================================================================

const handleRefreshDashboard: ActionHandler = async (session, action, _payload, send) => {
  const dashId = action.replace('refresh_dashboard:', '');
  const dashboard = session.customDashboards.get(dashId);
  if (dashboard) {
    const refreshMsg = `请刷新仪表盘「${dashboard.title}」的数据，使用 update_dashboard 工具更新 dashboardId="${dashboard.id}"`;
    await session.handleUserMessage(refreshMsg, send);
  }
};

// ============================================================================
// Navigate handler (prefix-based)
// ============================================================================

const handleNavigatePrefix: ActionHandler = async (session, action, _payload, send) => {
  const view = action.replace('navigate:', '');
  await session.handleNavigate(view, send);
};

// ============================================================================
// Dispatch map — exact action → handler
// ============================================================================

export const ACTION_HANDLERS: Record<string, ActionHandler> = {
  // Chat
  clear_chat: handleClearChat,
  sa_clear_chat: handleSaClearChat,
  send_message: handleSendMessage,
  stop_generation: handleStopGeneration,
  sa_stop_generation: handleSaStopGeneration,

  // Auth
  start_huawei_auth: handleStartAuth,
  start_reauth: handleStartAuth,
  set_uid: handleSetUid,
  set_user_uuid: handleSetUid,
  auth_complete: handleAuthComplete,

  // Memory
  memory_search_submit: handleMemorySearchSubmit,
  memory_log_select: handleMemoryLogSelect,
  memory_log_back: handleMemoryLogBack,
  show_toast: handleShowToast,

  // Prompts
  select_file: handleSelectFile,
  edit_prompt_from_modal: handleEditPromptFromModal,
  cancel_edit_from_modal: handleCancelEditFromModal,
  prompt_content_change: handlePromptContentChange,
  save_prompt_from_modal: handleSavePromptFromModal,
  select_commit: handleSelectCommit,
  revert_prompt: handleRevertPrompt,
  select_revert_commit: handleSelectRevertCommit,

  // Skills
  select_skill: handleSelectSkill,
  select_skill_file: handleSelectSkillFile,
  edit_skill: handleEditSkill,
  cancel_edit: handleCancelEdit,
  skill_content_change: handleSkillContentChange,
  save_skill: handleSaveSkill,
  toggle_skill: handleToggleSkill,
  toggle_skill_from_modal: handleToggleSkillFromModal,
  edit_skill_from_modal: handleEditSkillFromModal,
  create_skill: handleCreateSkill,
  submit_create_skill: handleSubmitCreateSkill,

  // System Agent Memory
  sa_memory_select: handleSaMemorySelect,
  sa_memory_edit: handleSaMemoryEdit,
  sa_memory_content_change: handleSaMemoryContentChange,
  sa_memory_save: handleSaMemorySave,
  sa_memory_cancel: handleSaMemoryCancel,

  // System Agent / Evolution Lab chat
  sa_send_message: handleSaSendMessage,
  evo_send_message: handleEvoSendMessage,
  evo_tab_change: handleEvoTabChange,
  evo_data_subtab_change: handleEvoDataSubtabChange,
  view_version: handleViewVersion,
  view_version_from_list: handleViewVersionFromList,
  evo_timeline_click: handleEvoTimelineClick,
  evo_file_select: handleEvoFileSelect,
  evo_approve: handleEvoApprove,
  evo_reject: handleEvoReject,

  // Playground
  pg_send_message: handlePgSendMessage,
  pg_start_auto: handlePgStartAuto,

  // Tool / Skill detail modals
  view_tool_detail: handleViewToolDetail,
  view_skill_from_table: handleViewSkillFromTable,
  view_skill_from_tool: handleViewSkillFromTool,

  // Tab change
  tab_change: handleTabChange,

  // Trends
  change_trends_range: handleChangeTrendsRange,
  change_trends_metric: handleChangeTrendsMetric,
  trends_config_change: handleTrendsConfigChange,

  // Evolution data viewers
  traces_page_change: handleTracesPageChange,
  view_trace: handleViewTrace,
  view_evaluation: handleViewEvaluation,
  view_test_case: handleViewTestCase,
  view_suggestion: handleViewSuggestion,
  create_test_case: handleCreateTestCase,
  submit_create_test_case: handleSubmitCreateTestCase,
  delete_test_case: handleDeleteTestCase,
  apply_suggestion: handleApplySuggestion,
  reject_suggestion: handleRejectSuggestion,
  test_suggestion: handleTestSuggestion,
  close_modal: handleCloseModal,

  // Benchmark / Evolution versions
  run_benchmark: handleRunBenchmark,
  open_benchmark_modal: handleRunBenchmark,
  submit_run_benchmark: handleSubmitRunBenchmark,
  run_auto_loop: handleRunAutoLoop,
  run_diagnose: handleRunDiagnose,
  switch_version: handleSwitchVersion,
  merge_version: handleMergeVersion,
  confirm_merge: handleConfirmMerge,
  abandon_version: handleAbandonVersion,
  view_benchmark_run: handleViewBenchmarkRun,
  delete_benchmark_run: handleDeleteBenchmarkRun,
  set_modal_radar_mode: handleSetModalRadarMode,
  toggle_benchmark_run: handleToggleBenchmarkRun,
  set_radar_mode: handleSetRadarMode,
  clear_run_selection: handleClearRunSelection,
  run_test_case: handleRunTestCase,

  // Integrations
  refresh_integrations: handleRefreshIntegrations,

  // Logs
  logs_filter_level: handleLogsFilterLevel,
  logs_filter_subsystem: handleLogsFilterSubsystem,
  logs_refresh: handleLogsRefresh,
  llm_filter_provider: handleLlmFilterProvider,
  llm_filter_model: handleLlmFilterModel,
  llm_call_detail: handleLlmCallDetail,
  llm_page_change: handleLlmPageChange,
};

// ============================================================================
// Prefix-based handlers (checked when no exact match)
// ============================================================================

export const PREFIX_HANDLERS: Array<{ prefix: string; handler: ActionHandler }> = [
  { prefix: 'navigate:', handler: handleNavigatePrefix },
  { prefix: 'refresh_dashboard:', handler: handleRefreshDashboard },
  { prefix: 'view_plan:', handler: handleViewPlan },
  { prefix: 'update_plan_action:', handler: handleUpdatePlanAction },
  { prefix: 'rec_dismiss:', handler: handleRecDismiss },
  { prefix: 'rec_act:', handler: handleRecAct },
  { prefix: 'rem_complete:', handler: handleRemComplete },
];

// ============================================================================
// Settings action names (for routing to settings handler)
// ============================================================================

export const SETTINGS_ACTIONS = new Set([
  'settings_save_llm',
  'settings_save_gateway',
  'settings_save_datasource',
  'settings_save_advanced',
  'settings_save_tui',
  'settings_save_embedding',
  'settings_save_benchmark',
  'settings_save_benchmark_v2',
  'settings_save_benchmark_v3',
  'settings_save_benchmark_v4',
  'settings_save_benchmark_models',
  'settings_save_benchmark_models_v2',
  'settings_save_mcp',
  'settings_save_mcp_chrome',
  'settings_save_mcp_remote',
  'settings_save_plugins',
  'settings_save_plugins_v2',
  'settings_save_judge',
  'settings_save_model_repository',
  'settings_save_model_assignments',
  'settings_save_agents',
  'settings_save_context',
  'settings_save_infra_models',
  'settings_provider_add',
  'settings_provider_delete',
  'settings_provider_model_add',
  'settings_provider_model_delete',
  'settings_bm_add',
  'settings_bm_delete',
  'settings_mcp_add',
  'settings_mcp_delete',
  'settings_save_scopes',
  'settings_scope_toggle',
  'settings_agent_add',
  'settings_agent_delete',
  'settings_agent_tag_toggle',
  'settings_tags_toggle',
  'settings_copy_config',
  'settings_download_config',
]);

/**
 * Main dispatch function — replaces the 130+ if/else chain.
 * CC is now O(1) lookup + small prefix scan.
 */
export async function dispatchAction(
  session: GatewaySession,
  action: string,
  payload: Payload,
  send: SendFn
): Promise<void> {
  // 1. Exact match
  const handler = ACTION_HANDLERS[action];
  if (handler) {
    await handler(session, action, payload, send);
    return;
  }

  // 2. Settings actions (share try/catch + saveConfig pattern)
  if (SETTINGS_ACTIONS.has(action)) {
    const { handleSettingsAction } = await import('./settings-handlers.js');
    await handleSettingsAction(session, action, payload, send);
    return;
  }

  // 3. Prefix-based actions
  for (const { prefix, handler: prefixHandler } of PREFIX_HANDLERS) {
    if (action.startsWith(prefix)) {
      await prefixHandler(session, action, payload, send);
      return;
    }
  }

  // 4. Unhandled
  log.warn('Unhandled action', { action, payload });
}
