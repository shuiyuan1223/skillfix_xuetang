/**
 * Incident Classifier
 *
 * LLM-based classifier for incidents collected via Slack or manually.
 * Replaces keyword-based classification with structured LLM reasoning.
 *
 * Types:
 *   bug      — reproducible code/logic error, agent crashes, wrong data, broken tool
 *   effect   — quality/effectiveness issue: vague response, wrong tone, missed context
 *   unclassified — not enough info to determine
 */

import type { IncidentType, IncidentPriority } from '../memory/db.js';

export interface ClassificationResult {
  type: IncidentType;
  priority: IncidentPriority;
  confidence: number; // 0.0 - 1.0
  reason: string;
  suggestedTitle?: string; // For GitHub Issue title if bug type
}

const CLASSIFICATION_PROMPT = `You are a quality engineer for PHA (Personal Health Agent), an AI health assistant.

A team member has reported a bad interaction. Classify it:

## Incident Description
{RAW_TEXT}

{TRACE_CONTEXT}

## Classification Task

Determine:

1. **type**: Choose exactly one:
   - "bug": A clear code/logic error. Signs: crash, exception, wrong data displayed, tool call failure, feature completely broken, agent gives factually impossible answer.
   - "effect": A quality/effectiveness issue. Signs: response too vague, wrong tone, ignored user context, missed opportunity, suboptimal advice, communication quality issue.
   - "unclassified": Description too vague to determine. Ask for more details.

2. **priority**: Choose exactly one:
   - "high": Safety concern, data corruption, core feature broken, user trust damaged
   - "medium": Feature degraded but workaround exists, noticeable quality issue
   - "low": Minor polish, edge case, nice-to-have improvement
   - "ignore": Noise, user misunderstanding, working as intended

3. **confidence**: Float 0.0-1.0. How confident are you in this classification?

4. **reason**: 1-2 sentences explaining your classification. Be specific about what signals led to your decision.

5. **suggestedTitle**: Only for "bug" type — a concise GitHub Issue title (max 80 chars) starting with the affected area. Example: "[HealthData] Heart rate tool returns null when date range > 30 days"

Respond with ONLY valid JSON, no markdown, no explanation outside JSON:
{
  "type": "bug" | "effect" | "unclassified",
  "priority": "high" | "medium" | "low" | "ignore",
  "confidence": 0.0-1.0,
  "reason": "...",
  "suggestedTitle": "..." | null
}`;

/**
 * Classify an incident using LLM
 */
export async function classifyIncident(opts: {
  rawText: string;
  traceContext?: {
    userMessage?: string;
    agentResponse?: string;
    toolCalls?: string;
  };
  llmCall: (prompt: string) => Promise<string>;
}): Promise<ClassificationResult> {
  const { rawText, traceContext, llmCall } = opts;

  const traceSection = traceContext
    ? `## Linked Trace Context
User Message: ${traceContext.userMessage ?? '(unknown)'}
Agent Response: ${traceContext.agentResponse?.slice(0, 500) ?? '(unknown)'}${
        traceContext.toolCalls ? `\nTool Calls: ${traceContext.toolCalls.slice(0, 300)}` : ''
      }`
    : '';

  const prompt = CLASSIFICATION_PROMPT.replace('{RAW_TEXT}', rawText).replace('{TRACE_CONTEXT}', traceSection);

  try {
    const response = await llmCall(prompt);
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in LLM response');

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const parsed: {
      type?: string;
      priority?: string;
      confidence?: number;
      reason?: string;
      suggestedTitle?: string | null;
    } = JSON.parse(jsonMatch[0]);

    return {
      type: (['bug', 'effect', 'unclassified'].includes(parsed.type ?? '')
        ? parsed.type
        : 'unclassified') as IncidentType,
      priority: (['high', 'medium', 'low', 'ignore'].includes(parsed.priority ?? '')
        ? parsed.priority
        : 'medium') as IncidentPriority,
      confidence: typeof parsed.confidence === 'number' ? Math.min(1, Math.max(0, parsed.confidence)) : 0.5,
      reason: parsed.reason ?? 'LLM classification',
      suggestedTitle: parsed.suggestedTitle ?? undefined,
    };
  } catch {
    // Fallback: return unclassified with low confidence
    return {
      type: 'unclassified',
      priority: 'medium',
      confidence: 0.1,
      reason: 'Classification failed — LLM response could not be parsed. Manual review needed.',
    };
  }
}
