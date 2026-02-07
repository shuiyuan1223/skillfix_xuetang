/**
 * Slack Webhook Handler
 *
 * Receives team feedback from Slack, classifies it by benchmark category,
 * and creates GitHub issues for tracking.
 */

import type { BenchmarkCategory } from "../evolution/types.js";
import { CATEGORY_LABELS } from "../evolution/benchmark-seed.js";

export interface SlackWebhookPayload {
  token?: string;
  team_id?: string;
  team_domain?: string;
  channel_id?: string;
  channel_name?: string;
  user_id?: string;
  user_name?: string;
  text: string;
  timestamp?: string;
  trigger_word?: string;
}

export interface FeedbackClassification {
  category: BenchmarkCategory | "general";
  severity: "low" | "medium" | "high";
  summary: string;
  originalText: string;
  userName: string;
  timestamp: string;
}

// Keyword-based category classification
const CATEGORY_KEYWORDS: Record<BenchmarkCategory, string[]> = {
  "health-data-analysis": [
    "data",
    "sleep",
    "heart rate",
    "steps",
    "calories",
    "workout",
    "activity",
    "metrics",
    "numbers",
    "incorrect data",
    "wrong data",
  ],
  "health-coaching": [
    "goal",
    "motivation",
    "habit",
    "progress",
    "coaching",
    "encourage",
    "advice",
    "recommendation",
    "plan",
  ],
  "safety-boundaries": [
    "unsafe",
    "dangerous",
    "diagnosis",
    "diagnose",
    "medical",
    "emergency",
    "prescribe",
    "medication",
    "treatment",
    "fabricated",
    "made up",
    "hallucinated",
  ],
  "personalization-memory": [
    "remember",
    "forgot",
    "context",
    "profile",
    "personal",
    "previous conversation",
    "last time",
    "my preference",
  ],
  "communication-quality": [
    "confusing",
    "unclear",
    "verbose",
    "too long",
    "tone",
    "sensitive",
    "insensitive",
    "vague",
    "not specific",
    "generic",
    "not actionable",
  ],
};

const SEVERITY_KEYWORDS: Record<string, string[]> = {
  high: ["urgent", "critical", "dangerous", "emergency", "broken", "crash", "wrong medical"],
  medium: ["incorrect", "missing", "confusing", "not working", "bug", "issue"],
  low: ["suggestion", "nice to have", "minor", "small", "typo", "wording"],
};

/**
 * Classify feedback text into a benchmark category
 */
export function classifyFeedback(payload: SlackWebhookPayload): FeedbackClassification {
  const text = payload.text.toLowerCase();

  // Classify category
  let bestCategory: BenchmarkCategory | "general" = "general";
  let bestScore = 0;

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0;
    for (const keyword of keywords) {
      if (text.includes(keyword.toLowerCase())) {
        score++;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category as BenchmarkCategory;
    }
  }

  // Classify severity
  let severity: "low" | "medium" | "high" = "medium";
  for (const [sev, keywords] of Object.entries(SEVERITY_KEYWORDS)) {
    for (const keyword of keywords) {
      if (text.includes(keyword.toLowerCase())) {
        severity = sev as "low" | "medium" | "high";
        break;
      }
    }
  }

  // Generate summary
  const summary = payload.text.length > 100 ? payload.text.substring(0, 100) + "..." : payload.text;

  return {
    category: bestCategory,
    severity,
    summary,
    originalText: payload.text,
    userName: payload.user_name || "unknown",
    timestamp: payload.timestamp || new Date().toISOString(),
  };
}

/**
 * Build a GitHub issue body from classified feedback
 */
export function buildIssueBody(classification: FeedbackClassification): {
  title: string;
  body: string;
  labels: string[];
} {
  const categoryLabel =
    classification.category === "general" ? "General" : CATEGORY_LABELS[classification.category];

  const title = `[Feedback] ${categoryLabel}: ${classification.summary}`;

  const body = `## Team Feedback

**From:** ${classification.userName}
**Category:** ${categoryLabel}
**Severity:** ${classification.severity}
**Timestamp:** ${classification.timestamp}

## Original Feedback

> ${classification.originalText}

## Classification

- **Benchmark Category:** ${classification.category}
- **Severity:** ${classification.severity}

## Action Items

- [ ] Review feedback and determine if this is a valid issue
- [ ] Add as benchmark test case if applicable
- [ ] Run \`pha eval auto-loop\` if quality improvement is needed
- [ ] Update prompts/skills if necessary

---
*Auto-created from Slack feedback via PHA webhook*`;

  const labels = [
    "feedback",
    `severity:${classification.severity}`,
    `category:${classification.category}`,
  ];

  return { title, body, labels };
}

/**
 * Handle incoming Slack webhook
 */
export async function handleSlackWebhook(payload: SlackWebhookPayload): Promise<{
  classification: FeedbackClassification;
  issueUrl?: string;
  error?: string;
}> {
  const classification = classifyFeedback(payload);

  // Try to create GitHub issue
  try {
    const issue = buildIssueBody(classification);
    const issueUrl = await createGitHubIssue(issue.title, issue.body, issue.labels);
    return { classification, issueUrl };
  } catch (error) {
    return {
      classification,
      error: `Failed to create GitHub issue: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Create a GitHub issue using the gh CLI
 */
async function createGitHubIssue(title: string, body: string, labels: string[]): Promise<string> {
  const { execSync } = await import("child_process");

  const labelArgs = labels.map((l) => `-l "${l}"`).join(" ");

  try {
    const result = execSync(
      `gh issue create --title "${title.replace(/"/g, '\\"')}" --body "${body.replace(/"/g, '\\"')}" ${labelArgs}`,
      { encoding: "utf-8", timeout: 15000 }
    );
    return result.trim();
  } catch (error) {
    throw new Error(`gh CLI failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
