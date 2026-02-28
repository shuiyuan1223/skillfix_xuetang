/**
 * Tool Feedback Mechanism
 *
 * Allows SystemAgent to express opinions about missing tools,
 * desired improvements, and capability gaps.
 * Writes to .pha/system-agent/tool-wishlist.md
 */

import { existsSync, readFileSync, appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { findProjectRoot } from '../utils/config.js';
import type { PHATool } from './types.js';

function getWishlistPath(): string {
  const root = findProjectRoot();
  const dir = join(root, '.pha', 'users', 'system');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return join(dir, 'tool-wishlist.md');
}

export const suggestToolImprovementTool: PHATool<{
  toolName: string;
  category: string;
  description: string;
  useCase: string;
  priority?: string;
}> = {
  name: 'suggest_tool_improvement',
  description:
    '记录工具改进建议或缺失能力。当发现现有工具集存在不足、可以更好地完成任务时调用。建议保存到工具愿望清单供开发团队审阅。',
  displayName: '建议工具改进',
  category: 'feedback',
  icon: 'lightbulb',
  label: 'Suggest Tool Improvement',
  inputSchema: {
    type: 'object',
    properties: {
      toolName: {
        type: 'string',
        description:
          "Name of the tool to improve, or a suggested name for a new tool (e.g., 'read_file', 'new: code_review')",
      },
      category: {
        type: 'string',
        description:
          "Category: 'new_tool' (completely new), 'enhancement' (improve existing), 'bug' (tool doesn't work as expected), 'missing_param' (needs new parameter)",
      },
      description: {
        type: 'string',
        description: 'Detailed description of the improvement or new tool',
      },
      useCase: {
        type: 'string',
        description: 'Specific scenario where this tool/improvement would be needed',
      },
      priority: {
        type: 'string',
        description: "Priority: 'high' (blocks workflow), 'medium' (workaround exists), 'low' (nice to have)",
      },
    },
    required: ['toolName', 'category', 'description', 'useCase'],
  },
  execute: async (args: {
    toolName: string;
    category: string;
    description: string;
    useCase: string;
    priority?: string;
  }) => {
    const wishlistPath = getWishlistPath();
    const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const priority = args.priority || 'medium';

    const entry = `
## [${priority.toUpperCase()}] ${args.toolName} — ${args.category}

- **时间**: ${timestamp}
- **分类**: ${args.category}
- **优先级**: ${priority}
- **描述**: ${args.description}
- **使用场景**: ${args.useCase}
- **状态**: 待评审

---
`;

    // Initialize file if empty
    if (!existsSync(wishlistPath) || readFileSync(wishlistPath, 'utf-8').trim() === '') {
      appendFileSync(
        wishlistPath,
        '# 工具改进建议清单\n\n> SystemAgent 在使用过程中发现的工具缺口和改进建议。\n\n---\n',
        'utf-8'
      );
    }

    appendFileSync(wishlistPath, entry, 'utf-8');

    return {
      success: true,
      message: `已记录工具建议: ${args.toolName} (${args.category})`,
      toolName: args.toolName,
      category: args.category,
      priority,
      wishlistPath,
    };
  },
};

export const listToolWishlistTool: PHATool<Record<string, never>> = {
  name: 'list_tool_wishlist',
  description: '读取当前工具改进愿望清单，查看待处理的建议。',
  displayName: '工具建议清单',
  category: 'feedback',
  icon: 'lightbulb',
  label: 'List Tool Wishlist',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  execute: async () => {
    const wishlistPath = getWishlistPath();
    if (!existsSync(wishlistPath)) {
      return {
        success: true,
        content: '(empty — no suggestions yet)',
        count: 0,
      };
    }

    const content = readFileSync(wishlistPath, 'utf-8');
    const entries = content.split('---').filter((s) => s.includes('##')).length;

    return {
      success: true,
      content,
      count: entries,
    };
  },
};

export const toolFeedbackTools = [suggestToolImprovementTool, listToolWishlistTool];
