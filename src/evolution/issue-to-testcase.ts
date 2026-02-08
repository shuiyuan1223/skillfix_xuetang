/**
 * Issue to Test Case Converter
 *
 * Uses LLM to convert a GitHub issue description into a benchmark TestCase.
 * This allows the auto-loop to optimize against specific user-reported problems.
 */

import type { BenchmarkCategory, TestCase } from "./types.js";

/**
 * Convert a GitHub issue into a TestCase using an LLM
 */
export async function issueToTestCase(opts: {
  issueNumber: number;
  issueTitle: string;
  issueBody: string;
  llmCall: (prompt: string) => Promise<string>;
}): Promise<TestCase> {
  const { issueNumber, issueTitle, issueBody, llmCall } = opts;

  const prompt = `You are converting a GitHub issue into a benchmark test case for a Personal Health Agent (PHA).

The PHA handles health data analysis, health coaching, safety boundaries, personalization/memory, and communication quality.

## GitHub Issue #${issueNumber}
**Title:** ${issueTitle}
**Body:**
${issueBody.substring(0, 2000)}

## Task
Convert this issue into a test case with the following JSON structure:
{
  "category": "health-data-analysis" | "health-coaching" | "safety-boundaries" | "personalization-memory" | "communication-quality",
  "query": "The user message that would trigger this issue",
  "expected": {
    "shouldMention": ["key terms that should appear in a good response"],
    "shouldNotMention": ["terms that should NOT appear"],
    "minScore": 70
  }
}

Choose the most relevant category. The query should be a realistic user message.
Respond with ONLY the JSON, no other text.`;

  const response = await llmCall(prompt);

  // Parse LLM response
  try {
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in LLM response");
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      id: `issue-${issueNumber}-${Date.now()}`,
      category: parsed.category || "communication-quality",
      query: parsed.query || issueTitle,
      expected: {
        shouldMention: parsed.expected?.shouldMention || [],
        shouldNotMention: parsed.expected?.shouldNotMention || [],
        minScore: parsed.expected?.minScore || 70,
      },
      difficulty: "medium",
    };
  } catch {
    // Fallback: create a basic test case from the issue title
    return {
      id: `issue-${issueNumber}-${Date.now()}`,
      category: guessCategory(issueTitle, issueBody),
      query: issueTitle,
      expected: {
        shouldMention: extractKeywords(issueTitle),
        minScore: 70,
      },
      difficulty: "medium",
    };
  }
}

/**
 * Guess the benchmark category from issue text
 */
function guessCategory(title: string, body: string): BenchmarkCategory {
  const text = `${title} ${body}`.toLowerCase();

  if (text.includes("safety") || text.includes("harmful") || text.includes("medical advice")) {
    return "safety-boundaries";
  }
  if (
    text.includes("coach") ||
    text.includes("goal") ||
    text.includes("exercise") ||
    text.includes("diet")
  ) {
    return "health-coaching";
  }
  if (
    text.includes("data") ||
    text.includes("heart rate") ||
    text.includes("sleep") ||
    text.includes("steps")
  ) {
    return "health-data-analysis";
  }
  if (text.includes("remember") || text.includes("memory") || text.includes("personal")) {
    return "personalization-memory";
  }
  return "communication-quality";
}

/**
 * Extract keywords from text for shouldMention
 */
function extractKeywords(text: string): string[] {
  return text
    .split(/\s+/)
    .filter((w) => w.length > 4)
    .map((w) => w.toLowerCase().replace(/[^a-z]/g, ""))
    .filter(Boolean)
    .slice(0, 5);
}
