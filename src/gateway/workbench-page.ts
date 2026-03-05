/**
 * Workbench Page Generator — three-column layout for Skill/Prompt debugging
 *
 * Col 1: Test data input
 * Col 2: Skills/Prompts editor (tabs)
 * Col 3: Results + status bar
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
  const exportBtn = ui.button(t('workbench.exportZip'), 'debug_export_zip', {
    variant: 'secondary',
    size: 'sm',
    icon: 'save',
  });
  const headerRow = ui.row([ui.column([title, subtitle], { gap: 4 }), exportBtn], {
    gap: 16,
    justify: 'space-between',
    align: 'center',
  });

  // ── Column 1: Test Data ─────────────────────────────────────
  const col1 = buildTestDataColumn(ui, state);

  // ── Column 2: Skills/Prompts Editor ─────────────────────────
  const col2 = buildEditorColumn(ui, state);

  // ── Column 3: Results + Status Bar ────────────────────────────
  const col3 = buildResultsColumn(ui, state);

  // ── Three-column grid ───────────────────────────────────────
  const grid = ui.grid([col1, col2, col3], { columns: '320px 1fr 1fr', gap: 16 });

  const root = ui.column([headerRow, grid], { gap: 16, padding: 24 });
  return ui.build(root);
}

// ── Column 1: Test Data ─────────────────────────────────────────

function buildTestDataColumn(ui: A2UIGenerator, state: WorkbenchState): string {
  const label = ui.text(t('workbench.testData'), 'h3');
  const charCount = ui.badge(`${state.testData.length} ${t('workbench.chars')}`, { variant: 'info' });
  const labelRow = ui.row([label, charCount], { gap: 8, justify: 'space-between', align: 'center' });

  const editBtn = ui.button('编辑', 'debug_toggle_testdata_preview', {
    variant: state.testDataPreviewMode ? 'ghost' : 'secondary',
    size: 'sm',
  });
  const previewBtn = ui.button('预览', 'debug_toggle_testdata_preview', {
    variant: state.testDataPreviewMode ? 'secondary' : 'ghost',
    size: 'sm',
  });
  const toggleRow = ui.row([editBtn, previewBtn], { gap: 4 });

  const clearBtn = ui.button(t('workbench.clearData'), 'debug_clear_data', {
    variant: 'ghost',
    size: 'sm',
    icon: 'x',
  });

  if (state.testDataPreviewMode) {
    const previewId = 'wb_testdata_preview';
    ui.addRaw(previewId, 'Text', {
      text: state.testData,
      markdown: true,
      style:
        'min-height:300px; overflow-y:auto; padding:16px; background:var(--color-surface-code); border:1px solid var(--color-border); border-radius:8px;',
    });
    return ui.column([labelRow, toggleRow, previewId, clearBtn], { gap: 8 });
  }

  const editorId = 'wb_testdata_editor';
  ui.addRaw(editorId, 'CodeEditor', {
    value: state.testData,
    language: 'json',
    onChange: 'debug_userdata_change',
    placeholder: t('workbench.testDataPlaceholder'),
    minHeight: 300,
  });

  return ui.column([labelRow, toggleRow, editorId, clearBtn], { gap: 8 });
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
  const rows = state.skills.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description || '-',
    status: s.enabled ? t('workbench.enabled') : t('workbench.disabled'),
    statusTooltip: s.name, // 技能名称作为 tooltip
    modified: s.dirty ? t('workbench.modified') : '',
  }));

  const enableAllBtn = ui.button(t('workbench.enableAll'), 'debug_enable_all_skills', {
    variant: 'ghost',
    size: 'sm',
    icon: 'check',
  });
  const disableAllBtn = ui.button(t('workbench.disableAll'), 'debug_disable_all_skills', {
    variant: 'ghost',
    size: 'sm',
    icon: 'x',
  });
  const toggleListBtn = ui.button(
    state.skillsListExpanded ? t('workbench.collapse') : t('workbench.expand'),
    'debug_toggle_skills_list',
    { variant: 'ghost', size: 'sm', icon: state.skillsListExpanded ? 'chevron-right' : 'chevron-right' }
  );
  const batchRow = ui.row([enableAllBtn, disableAllBtn, toggleListBtn], { gap: 8, justify: 'end' });

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

  // Wrap table in a collapsible container
  const tableContainer = state.skillsListExpanded
    ? ui.column([table], { gap: 0 })
    : ui.column([table], { gap: 0, style: 'max-height: 300px; overflow-y: scroll;', className: 'scrollbar-visible' });

  const parts: string[] = [batchRow, tableContainer];

  if (state.selectedSkillId) {
    const skill = state.skills.find((s) => s.id === state.selectedSkillId);
    const content = skill?.editedContent ?? readWorkbenchSkillContent(state.selectedSkillId);

    const skillLabel = ui.text(`${state.selectedSkillId} / SKILL.md`, 'h4');

    const editBtn = ui.button('编辑', 'debug_toggle_skill_preview', {
      variant: state.skillPreviewMode ? 'ghost' : 'secondary',
      size: 'sm',
    });
    const previewBtn = ui.button('预览', 'debug_toggle_skill_preview', {
      variant: state.skillPreviewMode ? 'secondary' : 'ghost',
      size: 'sm',
    });
    const toggleRow = ui.row([editBtn, previewBtn], { gap: 4 });

    if (state.skillPreviewMode) {
      const previewId = `wb_skill_preview_${state.selectedSkillId}`;
      ui.addRaw(previewId, 'Text', {
        text: content,
        markdown: true,
        style:
          'height:400px; overflow-y:auto; padding:16px; background:var(--color-surface-code); border:1px solid var(--color-border); border-radius:8px;',
      });
      parts.push(skillLabel, toggleRow, previewId);
    } else {
      const editorId = `wb_skill_editor_${state.selectedSkillId}`;
      ui.addRaw(editorId, 'CodeEditor', {
        value: content,
        language: 'markdown',
        onChange: 'debug_skill_change',
        lineNumbers: true,
        height: 400,
      });

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
      parts.push(skillLabel, toggleRow, editorId, btnRow);
    }
  } else {
    const hint = ui.text(t('workbench.selectSkillHint'), 'caption', { muted: true });
    parts.push(hint);
  }

  return ui.column(parts, { gap: 12 });
}

function buildPromptsTab(ui: A2UIGenerator, state: WorkbenchState): string {
  const rows = state.prompts.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description || '-',
    status: p.enabled ? t('workbench.enabled') : t('workbench.disabled'),
    modified: p.dirty ? t('workbench.modified') : '',
  }));

  const enableAllBtn = ui.button(t('workbench.enableAll'), 'debug_enable_all_prompts', {
    variant: 'ghost',
    size: 'sm',
    icon: 'check',
  });
  const disableAllBtn = ui.button(t('workbench.disableAll'), 'debug_disable_all_prompts', {
    variant: 'ghost',
    size: 'sm',
    icon: 'x',
  });
  const toggleListBtn = ui.button(
    state.promptsListExpanded ? t('workbench.collapse') : t('workbench.expand'),
    'debug_toggle_prompts_list',
    { variant: 'ghost', size: 'sm', icon: 'chevron-right' }
  );
  const batchRow = ui.row([enableAllBtn, disableAllBtn, toggleListBtn], { gap: 8, justify: 'end' });

  const table = ui.dataTable(
    [
      { key: 'name', label: t('workbench.promptsTitle'), sortable: true },
      { key: 'description', label: t('skills.description') },
      { key: 'status', label: t('skills.status'), render: 'badge', action: 'debug_toggle_prompt' },
      { key: 'modified', label: '' },
    ],
    rows,
    { onRowClick: 'debug_select_prompt' }
  );

  // Wrap table in a collapsible container
  const tableContainer = state.promptsListExpanded
    ? ui.column([table], { gap: 0 })
    : ui.column([table], { gap: 0, style: 'max-height: 300px; overflow-y: scroll;', className: 'scrollbar-visible' });

  const parts: string[] = [batchRow, tableContainer];

  if (state.selectedPromptId) {
    const prompt = state.prompts.find((p) => p.id === state.selectedPromptId);
    const content = prompt?.editedContent ?? readWorkbenchPromptContent(state.selectedPromptId);

    const promptLabel = ui.text(`${state.selectedPromptId}.md`, 'h4');

    const editBtn = ui.button('编辑', 'debug_toggle_prompt_preview', {
      variant: state.promptPreviewMode ? 'ghost' : 'secondary',
      size: 'sm',
    });
    const previewBtn = ui.button('预览', 'debug_toggle_prompt_preview', {
      variant: state.promptPreviewMode ? 'secondary' : 'ghost',
      size: 'sm',
    });
    const toggleRow = ui.row([editBtn, previewBtn], { gap: 4 });

    if (state.promptPreviewMode) {
      const previewId = `wb_prompt_preview_${state.selectedPromptId}`;
      ui.addRaw(previewId, 'Text', {
        text: content,
        markdown: true,
        style:
          'height:400px; overflow-y:auto; padding:16px; background:var(--color-surface-code); border:1px solid var(--color-border); border-radius:8px;',
      });
      parts.push(promptLabel, toggleRow, previewId);
    } else {
      const editorId = `wb_prompt_editor_${state.selectedPromptId}`;
      ui.addRaw(editorId, 'CodeEditor', {
        value: content,
        language: 'markdown',
        onChange: 'debug_prompt_change',
        lineNumbers: true,
        height: 400,
      });

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
      parts.push(promptLabel, toggleRow, editorId, btnRow);
    }
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

  // Copy messages button (when result with messages exists)
  const actionBtns: string[] = [runBtn];
  if (state.currentResult?.messages) {
    const copyBtn = ui.button(t('workbench.copyMessages'), 'debug_copy_messages', {
      variant: 'secondary',
      size: 'sm',
      icon: 'link',
      payload: { text: state.currentResult.messages },
    });
    actionBtns.push(copyBtn);
  }
  const actionRow = ui.row(actionBtns, { gap: 8, align: 'center' });

  const parts: string[] = [actionRow];

  if (state.runStatus === 'running') {
    const spinner = ui.badge(t('workbench.running'), { variant: 'warning', icon: 'loader' });
    parts.push(spinner);
  }

  if (state.currentResult?.text) {
    const resultMode = state.resultViewMode ?? 'rendered';
    const modeLabel = ui.text(t('workbench.currentResult'), 'h4');
    const renderedBtn = ui.button('渲染', 'debug_toggle_result_view', {
      variant: resultMode === 'rendered' ? 'secondary' : 'ghost',
      size: 'sm',
    });
    const sourceBtn = ui.button('源码', 'debug_toggle_result_view', {
      variant: resultMode === 'source' ? 'secondary' : 'ghost',
      size: 'sm',
    });
    const viewToggleRow = ui.row([modeLabel, renderedBtn, sourceBtn], {
      gap: 8,
      align: 'center',
      justify: 'space-between',
    });

    if (resultMode === 'source') {
      const currId = 'wb_result_curr';
      ui.addRaw(currId, 'CodeEditor', {
        value: state.currentResult.text,
        language: 'markdown',
        readonly: true,
        height: 400,
      });
      parts.push(viewToggleRow, currId);
    } else {
      const renderedId = 'wb_result_rendered';
      ui.addRaw(renderedId, 'Text', {
        text: state.currentResult.text,
        markdown: true,
        style:
          'height:400px; overflow-y:auto; padding:16px; background:var(--color-surface-code); border:1px solid var(--color-border); border-radius:8px;',
      });
      parts.push(viewToggleRow, renderedId);
    }
  } else if (state.runStatus !== 'running') {
    const hint = ui.text(t('workbench.noResult'), 'caption', { muted: true });
    parts.push(hint);
  }

  // ── Status bar (inside results column) ────────────────────────
  const statusBar = buildStatusBar(ui, state);
  parts.push(statusBar);

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

  // Enabled prompts count with tooltip
  const enabledPrompts = state.prompts.filter((p) => p.enabled);
  const enabledPromptCount = enabledPrompts.length;
  const enabledPromptNames = enabledPrompts.map((p) => p.name).join(', ');
  badges.push(
    ui.badge(`${enabledPromptCount}/${state.prompts.length} ${t('workbench.tabPrompts')}`, {
      variant: 'info',
      tooltip: enabledPromptNames || t('workbench.noPromptsEnabled'),
    })
  );

  // Enabled skills count with tooltip showing enabled skill names
  const enabledSkills = state.skills.filter((s) => s.enabled);
  const enabledCount = enabledSkills.length;
  const enabledSkillNames = enabledSkills.map((s) => s.name).join(', ');
  badges.push(
    ui.badge(`${enabledCount}/${state.skills.length} ${t('workbench.tabSkills')}`, {
      variant: 'info',
      tooltip: enabledSkillNames || t('workbench.noSkillsEnabled'),
    })
  );

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
