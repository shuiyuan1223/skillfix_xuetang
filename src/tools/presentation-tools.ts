/**
 * Presentation Tools
 *
 * Tools for the agent to present structured health insights as rich cards.
 * The tool only passes data through — card rendering is handled by generateToolCards().
 */

import type { PHATool } from './types.js';

interface InsightHighlight {
  label: string;
  value: string;
  unit?: string;
  status?: 'good' | 'caution' | 'attention';
}

interface InsightNextStep {
  label: string;
  action?: string;
}

interface PresentInsightArgs {
  type: 'health_summary' | 'recommendation' | 'comparison' | 'progress' | 'alert';
  title: string;
  highlights?: InsightHighlight[];
  insights?: string[];
  recommendations?: string[];
  next_steps?: InsightNextStep[];
}

export const presentInsightTool: PHATool<PresentInsightArgs> = {
  name: 'present_insight',
  description:
    '以结构化富卡片展示健康分析结论。在用健康数据工具获取数据并完成分析后调用，用于呈现关键指标、洞察发现和行动建议。卡片类型：health_summary（健康概览）、recommendation（建议）、comparison（对比）、progress（进展）、alert（警示）。',
  displayName: '健康洞察',
  category: 'presentation',
  icon: 'sparkles',
  label: 'Present Insight',
  inputSchema: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        description:
          'Card type: health_summary (overview), recommendation (suggestions), comparison (before/after), progress (goal tracking), alert (warning)',
      },
      title: {
        type: 'string',
        description: "Card title, e.g. '本周睡眠分析' or '心率异常提醒'",
      },
      highlights: {
        type: 'array',
        description:
          'Key metrics to highlight. Each has label, value, optional unit, optional status (good/caution/attention)',
      },
      insights: {
        type: 'array',
        description: 'List of insight strings derived from data analysis',
      },
      recommendations: {
        type: 'array',
        description: 'List of actionable recommendation strings',
      },
      next_steps: {
        type: 'array',
        description: 'Next step buttons. Each has label, optional action (e.g. navigate:health)',
      },
    },
    required: ['type', 'title'],
  },
  execute: async (args: PresentInsightArgs) => {
    // Pass-through: the card rendering is handled by generateToolCards() in pages.ts
    return {
      success: true,
      data: {
        type: args.type,
        title: args.title,
        highlights: args.highlights || [],
        insights: args.insights || [],
        recommendations: args.recommendations || [],
        next_steps: args.next_steps || [],
      },
    };
  },
};

export const presentationTools = [presentInsightTool];
