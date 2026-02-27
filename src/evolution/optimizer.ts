/**
 * Optimizer
 *
 * Generates and applies prompt/tool improvements based on analysis.
 */

import type { AnalysisResult, OptimizationSuggestion } from './types.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('Optimizer');

const OPTIMIZATION_PROMPT = `You are an AI system improvement specialist. Based on the analysis of a health assistant's performance, suggest specific improvements.

## Analysis Results
{analysis}

## Current System Prompt
{currentPrompt}

## Task
Suggest concrete improvements to the system prompt that would address the identified weaknesses.

## Output Format
Respond with a JSON object:
{
  "suggestions": [
    {
      "type": "prompt",
      "target": "<which part of prompt to modify>",
      "currentValue": "<current text if applicable>",
      "suggestedValue": "<new text>",
      "rationale": "<why this change helps>",
      "expectedImprovement": "<what metric should improve>"
    }
  ]
}

Focus on the most impactful changes. Limit to 3 suggestions maximum.`;

export interface OptimizerConfig {
  llmCall: (prompt: string) => Promise<string>;
  currentSystemPrompt: string;
}

export class Optimizer {
  private llmCall: (prompt: string) => Promise<string>;
  private currentSystemPrompt: string;
  private suggestions: Map<string, OptimizationSuggestion> = new Map();

  constructor(config: OptimizerConfig) {
    this.llmCall = config.llmCall;
    this.currentSystemPrompt = config.currentSystemPrompt;
  }

  /**
   * Update the current system prompt
   */
  setCurrentPrompt(prompt: string): void {
    this.currentSystemPrompt = prompt;
  }

  /**
   * Generate optimization suggestions from analysis
   */
  async generateSuggestions(analysis: AnalysisResult): Promise<OptimizationSuggestion[]> {
    // Skip if no significant weaknesses
    if (analysis.weaknesses.length === 0 && analysis.patterns.length === 0) {
      return [];
    }

    const prompt = OPTIMIZATION_PROMPT.replace('{analysis}', JSON.stringify(analysis, null, 2)).replace(
      '{currentPrompt}',
      this.currentSystemPrompt
    );

    const response = await this.llmCall(prompt);

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const suggestions: OptimizationSuggestion[] = [];

      for (const suggestion of parsed.suggestions || []) {
        const id = crypto.randomUUID();
        const opt: OptimizationSuggestion = {
          id,
          timestamp: Date.now(),
          type: suggestion.type || 'prompt',
          target: suggestion.target,
          currentValue: suggestion.currentValue,
          suggestedValue: suggestion.suggestedValue,
          rationale: suggestion.rationale,
          expectedImprovement: suggestion.expectedImprovement,
          status: 'pending',
        };

        suggestions.push(opt);
        this.suggestions.set(id, opt);
      }

      return suggestions;
    } catch (error) {
      log.error('Failed to parse optimization suggestions:', error);
      return [];
    }
  }

  /**
   * Get all suggestions
   */
  getSuggestions(): OptimizationSuggestion[] {
    return Array.from(this.suggestions.values());
  }

  /**
   * Get a suggestion by ID
   */
  getSuggestion(id: string): OptimizationSuggestion | undefined {
    return this.suggestions.get(id);
  }

  /**
   * Update suggestion status
   */
  updateSuggestionStatus(
    id: string,
    status: OptimizationSuggestion['status'],
    validationResults?: OptimizationSuggestion['validationResults']
  ): void {
    const suggestion = this.suggestions.get(id);
    if (suggestion) {
      suggestion.status = status;
      if (validationResults) {
        suggestion.validationResults = validationResults;
      }
    }
  }

  /**
   * Apply a suggestion to the system prompt
   */
  applySuggestion(id: string): string | null {
    const suggestion = this.suggestions.get(id);
    if (!suggestion || suggestion.type !== 'prompt') {
      return null;
    }

    let newPrompt = this.currentSystemPrompt;

    if (suggestion.currentValue) {
      // Replace existing text
      newPrompt = newPrompt.replace(suggestion.currentValue, suggestion.suggestedValue);
    } else {
      // Append new text
      newPrompt += `\n\n${suggestion.suggestedValue}`;
    }

    suggestion.status = 'applied';
    this.currentSystemPrompt = newPrompt;

    return newPrompt;
  }

  /**
   * Export suggestions as JSON
   */
  exportSuggestions(): string {
    return JSON.stringify(this.getSuggestions(), null, 2);
  }

  /**
   * Import suggestions from JSON
   */
  importSuggestions(json: string): void {
    const suggestions: OptimizationSuggestion[] = JSON.parse(json);
    for (const suggestion of suggestions) {
      this.suggestions.set(suggestion.id, suggestion);
    }
  }
}
