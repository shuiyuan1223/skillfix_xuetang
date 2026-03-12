/**
 * Workbench Page Generator — three-column layout for Skill/Prompt debugging
 *
 * Col 1: Test data input
 * Col 2: Skills/Prompts editor (tabs)
 * Col 3: Results + status bar
 */

import { A2UIGenerator, type A2UIMessage } from './a2ui.js';
import { t } from '../locales/index.js';
import type { WorkbenchState, WorkbenchResult } from './workbench-init.js';
import { readWorkbenchSkillContent, readWorkbenchPromptContent, WORKBENCH_MODELS } from './workbench-init.js';

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
        'min-height:600px; overflow-y:auto; padding:16px; background:var(--color-surface-code); border:1px solid var(--color-border); border-radius:8px;',
    });
    return ui.column([labelRow, toggleRow, previewId, clearBtn], { gap: 8 });
  }

  const editorId = 'wb_testdata_editor';
  ui.addRaw(editorId, 'CodeEditor', {
    value: state.testData,
    language: 'json',
    onChange: 'debug_userdata_change',
    placeholder: t('workbench.testDataPlaceholder'),
    height: 600,
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
    : ui.column([table], { gap: 0, style: 'max-height: 160px; overflow-y: scroll;', className: 'scrollbar-visible' });

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
          'height:500px; overflow-y:auto; padding:16px; background:var(--color-surface-code); border:1px solid var(--color-border); border-radius:8px;',
      });
      parts.push(skillLabel, toggleRow, previewId);
    } else {
      const editorId = `wb_skill_editor_${state.selectedSkillId}`;
      ui.addRaw(editorId, 'CodeEditor', {
        value: content,
        language: 'markdown',
        onChange: 'debug_skill_change',
        lineNumbers: true,
        height: 500,
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
    : ui.column([table], { gap: 0, style: 'max-height: 160px; overflow-y: scroll;', className: 'scrollbar-visible' });

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
          'height:500px; overflow-y:auto; padding:16px; background:var(--color-surface-code); border:1px solid var(--color-border); border-radius:8px;',
      });
      parts.push(promptLabel, toggleRow, previewId);
    } else {
      const editorId = `wb_prompt_editor_${state.selectedPromptId}`;
      ui.addRaw(editorId, 'CodeEditor', {
        value: content,
        language: 'markdown',
        onChange: 'debug_prompt_change',
        lineNumbers: true,
        height: 500,
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
  // Model selector toggle buttons
  const modelBtns = WORKBENCH_MODELS.map((m) =>
    ui.button(m.label, 'debug_select_model', {
      variant: state.selectedModelId === m.id ? 'secondary' : 'ghost',
      size: 'sm',
      payload: { modelId: m.id },
    })
  );
  const modelRow = ui.row(modelBtns, { gap: 4 });

  const diffToggleBtn = ui.button(t('workbench.runDiff'), 'debug_run_diff_interpret', {
    variant: state.diffMode ? 'secondary' : 'ghost',
    size: 'sm',
    icon: 'git-branch',
  });
  const runBtn = ui.button(state.diffMode ? '运行对比' : t('workbench.runInterpret'), 'debug_run_interpret', {
    variant: state.diffMode ? 'accent' : 'primary',
    icon: state.diffMode ? 'git-merge' : 'play',
  });
  const runRow = ui.row([diffToggleBtn, runBtn], { gap: 8, align: 'center' });
  const actionRow = ui.row([modelRow, runRow], { gap: 8, align: 'center', justify: 'space-between' });

  const parts: string[] = [actionRow];

  for (const result of state.results.slice(0, 3)) {
    parts.push(buildResultCard(ui, state, result));
  }

  if (state.results.length === 0) {
    const hint = ui.text(t('workbench.noResult'), 'caption', { muted: true });
    parts.push(hint);
  }

  // ── Status bar (inside results column) ────────────────────────
  const statusBar = buildStatusBar(ui, state);
  parts.push(statusBar);

  return ui.column(parts, { gap: 12 });
}

function buildResultCard(ui: A2UIGenerator, state: WorkbenchState, result: WorkbenchResult): string {
  const viewMode = state.resultViewModes[result.id] ?? 'rendered';
  const isStreaming = result.status === 'running';

  // Header: timestamp + run stats badges
  const ts = new Date(result.timestamp).toLocaleTimeString();
  const headerItems: string[] = [ui.text(ts, 'caption', { muted: true })];
  if (result.modelLabel) {
    headerItems.push(ui.badge(result.modelLabel, { variant: 'info' }));
  }
  if (result.enabledPromptCount !== undefined && result.totalPromptCount !== undefined) {
    headerItems.push(
      ui.badge(`${result.enabledPromptCount}/${result.totalPromptCount} ${t('workbench.tabPrompts')}`, {
        variant: 'info',
        tooltip: result.enabledPromptNames || t('workbench.noPromptsEnabled'),
      })
    );
  }
  if (result.enabledSkillCount !== undefined && result.totalSkillCount !== undefined) {
    headerItems.push(
      ui.badge(`${result.enabledSkillCount}/${result.totalSkillCount} ${t('workbench.tabSkills')}`, {
        variant: 'info',
        tooltip: result.enabledSkillNames || t('workbench.noSkillsEnabled'),
      })
    );
  }
  if (result.tokens) {
    headerItems.push(ui.badge(`${result.tokens} ${t('workbench.tokens')}`, { variant: 'info' }));
  }
  if (result.durationMs) {
    headerItems.push(ui.badge(`${(result.durationMs / 1000).toFixed(1)}s`, { variant: 'info' }));
  }
  if (isStreaming) {
    headerItems.push(ui.badge(t('workbench.running'), { variant: 'warning', icon: 'loader' }));
  }
  if (result.status === 'error') {
    headerItems.push(ui.badge(result.errorMessage ?? t('workbench.error'), { variant: 'error' }));
  }
  const headerRow = ui.row(headerItems, { gap: 8, align: 'center' });

  // Controls: [渲染] [源码] + copy button
  const renderedBtn = ui.button('渲染', 'debug_toggle_result_view', {
    variant: viewMode === 'rendered' ? 'secondary' : 'ghost',
    size: 'sm',
    payload: { resultId: result.id },
  });
  const sourceBtn = ui.button('源码', 'debug_toggle_result_view', {
    variant: viewMode === 'source' ? 'secondary' : 'ghost',
    size: 'sm',
    payload: { resultId: result.id },
  });
  const controlItems: string[] = [renderedBtn, sourceBtn];
  if (result.kind === 'interpret' && result.messages) {
    controlItems.push(
      ui.button(t('workbench.copyMessages'), 'debug_copy_messages', {
        variant: 'ghost',
        size: 'sm',
        icon: 'link',
        payload: { text: result.messages },
      })
    );
  }
  if (result.kind === 'diff') {
    if (result.status === 'done') {
      controlItems.push(
        ui.button('展开对比', 'debug_open_diff_modal', {
          variant: 'secondary',
          size: 'sm',
          icon: 'git-branch',
          payload: { resultId: result.id },
        })
      );
    }
    if (result.beforeMessages) {
      controlItems.push(
        ui.button('复制旧 Messages', 'debug_copy_messages', {
          variant: 'ghost',
          size: 'sm',
          icon: 'link',
          payload: { text: result.beforeMessages },
        })
      );
    }
    if (result.afterMessages) {
      controlItems.push(
        ui.button('复制新 Messages', 'debug_copy_messages', {
          variant: 'ghost',
          size: 'sm',
          icon: 'link',
          payload: { text: result.afterMessages },
        })
      );
    }
  }
  const controlRow = ui.row(controlItems, { gap: 4, justify: 'end' });

  // Content
  let contentId: string;
  if (viewMode === 'source') {
    contentId = `wb_result_${result.id}_src`;
    ui.addRaw(contentId, 'CodeEditor', {
      value:
        result.kind === 'diff'
          ? JSON.stringify(
              {
                kind: result.kind,
                status: result.status,
                errorMessage: result.errorMessage,
                beforeOutput: result.beforeOutput,
                afterOutput: result.afterOutput,
                analysisText: result.analysisText,
                skillDiffs: result.skillDiffs?.map((d) => ({ id: d.id, enabled: d.enabled })),
                promptDiffs: result.promptDiffs?.map((d) => ({ id: d.id, enabled: d.enabled })),
              },
              null,
              2
            )
          : result.text,
      language: result.kind === 'diff' ? 'json' : 'markdown',
      readonly: true,
      height: 600,
    });
  } else {
    if (result.kind === 'diff' && result.status === 'done') {
      const parts: string[] = [];

      // 1. 变更摘要
      if (result.analysisText) {
        const analysisId = `wb_result_${result.id}_analysis`;
        ui.addRaw(analysisId, 'Text', {
          text: result.analysisText,
          markdown: true,
          style:
            'min-height:40px; max-height:200px; overflow-y:auto; padding:12px; background:var(--color-surface-code); border:1px solid var(--color-border); border-radius:8px;',
        });
        parts.push(analysisId);
      }

      // 2. Before / After 全文展示（高亮标注受影响句子）
      //    annotatedBefore/annotatedAfter = 原文完整复制 + **受影响句** 包裹
      //    若 LLM 未输出则 fallback 到原始 beforeOutput/afterOutput
      const beforeText = result.annotatedBefore ?? result.beforeOutput;
      const afterText = result.annotatedAfter ?? result.afterOutput;
      if (beforeText != null) {
        const beforeLabel = ui.text('修改前解读', 'h3');
        const beforeId = `wb_result_${result.id}_annotated_before`;
        ui.addRaw(beforeId, 'Text', {
          text: beforeText,
          markdown: true,
          className: result.annotatedBefore != null ? 'semantic-annotation' : '',
          style:
            'padding:12px; background:var(--color-surface-code); border:1px solid var(--color-border); border-radius:8px; overflow-y:auto; max-height:500px;',
        });
        parts.push(beforeLabel, beforeId);
      }
      if (afterText != null) {
        const afterLabel = ui.text('修改后解读', 'h3');
        const afterId = `wb_result_${result.id}_annotated_after`;
        ui.addRaw(afterId, 'Text', {
          text: afterText,
          markdown: true,
          className: result.annotatedAfter != null ? 'semantic-annotation' : '',
          style:
            'padding:12px; background:var(--color-surface-code); border:1px solid var(--color-border); border-radius:8px; overflow-y:auto; max-height:500px;',
        });
        parts.push(afterLabel, afterId);
      }

      // 3. Skill/Prompt 变更 Diff（折叠，按需展开）
      if (result.skillDiffs?.length || result.promptDiffs?.length) {
        const diffChildren: string[] = [];
        for (const d of result.promptDiffs ?? []) {
          diffChildren.push(
            ui.diffView(d.before, d.after, {
              title: `${d.enabled ? '[启用] ' : ''}${d.id}.md`,
              unifiedDiff: d.unifiedDiff,
            })
          );
        }
        for (const d of result.skillDiffs ?? []) {
          diffChildren.push(
            ui.diffView(d.before, d.after, {
              title: `${d.enabled ? '[启用] ' : ''}${d.id} / SKILL.md`,
              unifiedDiff: d.unifiedDiff,
            })
          );
        }
        if (diffChildren.length) {
          parts.push(ui.collapsible('Skill/Prompt 变更 Diff', diffChildren, { expanded: false }));
        }
      }

      contentId = ui.column(parts, { gap: 12 });
    } else {
      contentId = `wb_result_${result.id}_rendered`;
      ui.addRaw(contentId, 'Text', {
        text: result.text,
        markdown: true,
        style:
          'min-height:60px; max-height:600px; overflow-y:auto; padding:16px; background:var(--color-surface-code); border:1px solid var(--color-border); border-radius:8px;',
      });
    }
  }

  const cardContent = ui.column([headerRow, controlRow, contentId], { gap: 8 });
  return ui.card([cardContent], { padding: 12 });
}

// ── Status Bar ──────────────────────────────────────────────────

function buildStatusBar(ui: A2UIGenerator, state: WorkbenchState): string {
  const badges: string[] = [];

  const runningCount = state.results.filter((r) => r.status === 'running').length;
  if (runningCount > 0) {
    badges.push(ui.badge(`${runningCount} ${t('workbench.running')}`, { variant: 'warning', icon: 'loader' }));
  } else if (state.results.length === 0) {
    badges.push(ui.badge(t('workbench.ready'), { variant: 'info' }));
  } else {
    badges.push(ui.badge(t('workbench.done'), { variant: 'success' }));
  }

  return ui.row(badges, { gap: 8, align: 'center' });
}
