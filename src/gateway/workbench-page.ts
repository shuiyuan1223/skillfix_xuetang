/**
 * Workbench Page Generator — three-column layout for Skill/Prompt debugging
 *
 * Col 1: Test data input
 * Col 2: Skills/Prompts editor (tabs)
 * Col 3: Results (previous vs current)
 */

import { A2UIGenerator, type A2UIMessage } from './a2ui.js';
import { t } from '../locales/index.js';
import type { WorkbenchState } from './workbench-init.js';
import { readWorkbenchSkillContent, readWorkbenchPromptContent } from './workbench-init.js';

export function generateWorkbenchPage(state: WorkbenchState): A2UIMessage[] {
  const ui = new A2UIGenerator('main');

  // ── Header ──────────────────────────────────────────────────
  const title = ui.text(t('workbench.title'), 'h1');
  const subtitle = ui.text(t('workbench.subtitle'), 'caption', { muted: true });
  const header = ui.column([title, subtitle], { gap: 4 });

  // ── Column 1: Test Data ─────────────────────────────────────
  const col1 = buildTestDataColumn(ui, state);

  // ── Column 2: Skills/Prompts Editor ─────────────────────────
  const col2 = buildEditorColumn(ui, state);

  // ── Column 3: Results ───────────────────────────────────────
  const col3 = buildResultsColumn(ui, state);

  // ── Three-column grid ───────────────────────────────────────
  const grid = ui.grid([col1, col2, col3], { columns: '320px 1fr 1fr', gap: 16 });

  // ── Status bar ──────────────────────────────────────────────
  const statusBar = buildStatusBar(ui, state);

  const root = ui.column([header, grid, statusBar], { gap: 16, padding: 24 });
  return ui.build(root);
}

// ── Column 1: Test Data ─────────────────────────────────────────

function buildTestDataColumn(ui: A2UIGenerator, state: WorkbenchState): string {
  const label = ui.text(t('workbench.testData'), 'h3');
  const charCount = ui.badge(`${state.testData.length} ${t('workbench.chars')}`, { variant: 'info' });
  const labelRow = ui.row([label, charCount], { gap: 8, justify: 'space-between', align: 'center' });

  const editor = ui.codeEditor(state.testData, {
    language: 'json',
    onChange: 'debug_userdata_change',
    placeholder: t('workbench.testDataPlaceholder'),
    minHeight: 300,
  });

  const clearBtn = ui.button(t('workbench.clearData'), 'debug_clear_data', {
    variant: 'ghost',
    size: 'sm',
    icon: 'x',
  });

  return ui.column([labelRow, editor, clearBtn], { gap: 8 });
}

// ── Column 2: Editor ────────────────────────────────────────────

function buildEditorColumn(ui: A2UIGenerator, state: WorkbenchState): string {
  const skillsContent = buildSkillsTab(ui, state);
  const promptsContent = buildPromptsTab(ui, state);

  const tabs = ui.tabs(
    [
      { id: 'skills', label: t('workbench.tabSkills'), icon: 'puzzle' },
      { id: 'prompts', label: t('workbench.tabPrompts'), icon: 'file-text' },
    ],
    state.activeTab,
    { skills: skillsContent, prompts: promptsContent }
  );

  return tabs;
}

function buildSkillsTab(ui: A2UIGenerator, state: WorkbenchState): string {
  // Skill list — status column is clickable to toggle enable/disable
  const rows = state.skills.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description || '-',
    status: s.enabled ? 'success' : 'error',
    modified: s.dirty ? t('workbench.modified') : '',
  }));

  const table = ui.dataTable(
    [
      { key: 'name', label: t('workbench.skillsTitle'), sortable: true },
      { key: 'description', label: t('skills.description') },
      { key: 'status', label: t('skills.status'), render: 'badge', action: 'debug_toggle_skill' },
      { key: 'modified', label: '' },
    ],
    rows,
    { onRowClick: 'debug_select_skill' }
  );

  const parts: string[] = [table];

  if (state.selectedSkillId) {
    const skill = state.skills.find((s) => s.id === state.selectedSkillId);
    const content = skill?.editedContent ?? readWorkbenchSkillContent(state.selectedSkillId);

    const skillLabel = ui.text(`${state.selectedSkillId} / SKILL.md`, 'h4');
    parts.push(skillLabel);

    const editor = ui.codeEditor(content, {
      language: 'markdown',
      onChange: 'debug_skill_change',
      lineNumbers: true,
      height: 400,
    });
    parts.push(editor);

    // Save / Revert buttons
    const saveBtn = ui.button(t('common.save'), 'debug_save_skill', {
      variant: 'primary',
      size: 'sm',
      icon: 'save',
      disabled: !skill?.dirty,
    });
    const revertBtn = ui.button(t('common.revert'), 'debug_revert_skill', {
      variant: 'ghost',
      size: 'sm',
      icon: 'refresh-cw',
      disabled: !skill?.dirty,
    });
    const btnRow = ui.row([saveBtn, revertBtn], { gap: 8, justify: 'end' });
    parts.push(btnRow);
  } else {
    const hint = ui.text(t('workbench.selectSkillHint'), 'caption', { muted: true });
    parts.push(hint);
  }

  return ui.column(parts, { gap: 12 });
}

function buildPromptsTab(ui: A2UIGenerator, state: WorkbenchState): string {
  // Prompt list — active column is clickable to set active prompt (radio-like)
  const rows = state.prompts.map((p) => ({
    id: p.id,
    name: p.name,
    active: p.id === state.activePromptId ? 'selected' : 'view',
    modified: p.dirty ? t('workbench.modified') : '',
  }));

  const table = ui.dataTable(
    [
      { key: 'active', label: '', width: '60px', render: 'badge', action: 'debug_activate_prompt' },
      { key: 'name', label: t('workbench.promptsTitle'), sortable: true },
      { key: 'modified', label: '' },
    ],
    rows,
    { onRowClick: 'debug_select_prompt' }
  );

  const parts: string[] = [table];

  if (state.selectedPromptId) {
    const prompt = state.prompts.find((p) => p.id === state.selectedPromptId);

    const promptLabel = ui.text(state.selectedPromptId + '.md', 'h4');
    parts.push(promptLabel);

    const content = prompt?.editedContent ?? readWorkbenchPromptContent(state.selectedPromptId);
    const editor = ui.codeEditor(content, {
      language: 'markdown',
      onChange: 'debug_prompt_change',
      lineNumbers: true,
      height: 400,
    });
    parts.push(editor);

    const saveBtn = ui.button(t('common.save'), 'debug_save_prompt', {
      variant: 'primary',
      size: 'sm',
      icon: 'save',
      disabled: !prompt?.dirty,
    });
    const revertBtn = ui.button(t('common.revert'), 'debug_revert_prompt', {
      variant: 'ghost',
      size: 'sm',
      icon: 'refresh-cw',
      disabled: !prompt?.dirty,
    });
    const btnRow = ui.row([saveBtn, revertBtn], { gap: 8, justify: 'end' });
    parts.push(btnRow);
  } else {
    const hint = ui.text(t('workbench.selectPromptHint'), 'caption', { muted: true });
    parts.push(hint);
  }

  return ui.column(parts, { gap: 12 });
}

// ── Column 3: Results ───────────────────────────────────────────

function buildResultsColumn(ui: A2UIGenerator, state: WorkbenchState): string {
  const runBtn = ui.button(t('workbench.runInterpret'), 'debug_run_interpret', {
    variant: 'primary',
    icon: 'play',
    disabled: state.runStatus === 'running',
  });

  const parts: string[] = [runBtn];

  if (state.runStatus === 'running') {
    const spinner = ui.badge(t('workbench.running'), { variant: 'warning', icon: 'loader' });
    parts.push(spinner);
  }

  if (state.previousResult && state.currentResult) {
    // Side-by-side comparison
    const prevLabel = ui.text(t('workbench.previousResult'), 'h4', { muted: true });
    const prevContent = ui.codeEditor(state.previousResult.text, {
      language: 'markdown',
      readOnly: true,
      minHeight: 200,
    });
    const prevCol = ui.column([prevLabel, prevContent], { gap: 4 });

    const currLabel = ui.text(t('workbench.currentResult'), 'h4');
    const currContent = ui.codeEditor(state.currentResult.text, {
      language: 'markdown',
      readOnly: true,
      minHeight: 200,
    });
    const currCol = ui.column([currLabel, currContent], { gap: 4 });

    const comparison = ui.grid([prevCol, currCol], { columns: '1fr 1fr', gap: 12 });
    parts.push(comparison);
  } else if (state.currentResult) {
    const currLabel = ui.text(t('workbench.currentResult'), 'h4');
    const currContent = ui.codeEditor(state.currentResult.text, {
      language: 'markdown',
      readOnly: true,
      minHeight: 300,
    });
    parts.push(currLabel, currContent);
  } else {
    const hint = ui.text(t('workbench.noResult'), 'caption', { muted: true });
    parts.push(hint);
  }

  return ui.column(parts, { gap: 12 });
}

// ── Status Bar ──────────────────────────────────────────────────

function buildStatusBar(ui: A2UIGenerator, state: WorkbenchState): string {
  const badges: string[] = [];

  // Run status
  const statusVariant = {
    ready: 'info',
    running: 'warning',
    done: 'success',
    error: 'error',
  }[state.runStatus] as string;
  badges.push(ui.badge(t(`workbench.${state.runStatus}`), { variant: statusVariant }));

  // Active prompt
  if (state.activePromptId) {
    badges.push(ui.badge(state.activePromptId, { variant: 'info' }));
  }

  // Enabled skills count
  const enabledCount = state.skills.filter((s) => s.enabled).length;
  badges.push(ui.badge(`${enabledCount}/${state.skills.length} ${t('workbench.tabSkills')}`, {
    variant: 'info',
  }));

  // Tokens (if result exists)
  if (state.currentResult?.tokens) {
    badges.push(ui.badge(`${state.currentResult.tokens} ${t('workbench.tokens')}`, { variant: 'info' }));
  }

  // Duration
  if (state.currentResult?.durationMs) {
    const secs = (state.currentResult.durationMs / 1000).toFixed(1);
    badges.push(ui.badge(`${secs}s`, { variant: 'info' }));
  }

  // Error message
  if (state.runStatus === 'error' && state.errorMessage) {
    badges.push(ui.badge(state.errorMessage, { variant: 'error' }));
  }

  return ui.row(badges, { gap: 8, align: 'center' });
}
