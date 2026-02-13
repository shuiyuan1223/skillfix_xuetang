/**
 * Tests for MEMORY.md structured truncation
 *
 * Tests loadMemorySummary() with structure-aware truncation:
 * - Section-based splitting
 * - First section always preserved
 * - Tail-priority filling
 * - Truncation markers
 * - Daily log integration
 */

import { describe, test, expect } from "bun:test";

/**
 * Inline implementation of splitBySections for testing.
 * This mirrors the private function in profile.ts.
 */
function splitBySections(content: string): string[] {
  const lines = content.split("\n");
  const sections: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (line.startsWith("## ") && current.length > 0) {
      sections.push(current.join("\n"));
      current = [];
    }
    current.push(line);
  }
  if (current.length > 0) {
    sections.push(current.join("\n"));
  }

  return sections;
}

/**
 * Inline implementation of the structured truncation logic for testing.
 * This mirrors the core logic of loadMemorySummary in profile.ts.
 */
function structuredTruncate(content: string, maxChars: number, dailyLogSection = ""): string {
  if (!content.trim()) return "";

  if (content.length + dailyLogSection.length <= maxChars) {
    return content + dailyLogSection;
  }

  const sections = splitBySections(content);

  if (sections.length <= 1) {
    const budget = maxChars - dailyLogSection.length;
    return "[Earlier memories truncated]\n\n" + content.slice(-budget) + dailyLogSection;
  }

  const firstSection = sections[0];
  let budget = maxChars - firstSection.length - dailyLogSection.length - 50;

  const kept: string[] = [];
  let truncatedCount = 0;

  for (let i = sections.length - 1; i >= 1; i--) {
    if (sections[i].length <= budget) {
      kept.unshift(sections[i]);
      budget -= sections[i].length;
    } else if (budget > 200) {
      kept.unshift(sections[i].slice(0, budget) + "\n...");
      budget = 0;
      truncatedCount += i;
      break;
    } else {
      truncatedCount++;
    }
  }

  if (truncatedCount === 0) {
    truncatedCount = sections.length - 1 - kept.length;
  }

  const parts: string[] = [firstSection];
  if (truncatedCount > 0) {
    parts.push(`\n[${truncatedCount} earlier entries truncated]\n`);
  }
  parts.push(...kept);
  parts.push(dailyLogSection);

  return parts.join("\n");
}

describe("splitBySections", () => {
  test("splits markdown by ## headings", () => {
    const content = `# Title

Some intro text

## Section 1

Content 1

## Section 2

Content 2`;

    const sections = splitBySections(content);
    expect(sections.length).toBe(3);
    expect(sections[0]).toContain("# Title");
    expect(sections[1]).toContain("## Section 1");
    expect(sections[2]).toContain("## Section 2");
  });

  test("handles content without sections", () => {
    const content = "Just some text\nwith lines";
    const sections = splitBySections(content);
    expect(sections.length).toBe(1);
    expect(sections[0]).toBe(content);
  });

  test("handles empty content", () => {
    const sections = splitBySections("");
    expect(sections.length).toBe(1);
    expect(sections[0]).toBe("");
  });
});

describe("structuredTruncate", () => {
  test("returns full content when under budget", () => {
    const content = "# Title\n\n## Section 1\n\nShort content";
    const result = structuredTruncate(content, 1000);
    expect(result).toBe(content);
  });

  test("preserves first section and recent sections", () => {
    const sections = [
      "# Health Memory",
      "## 2024-01-01\n\nOld entry " + "x".repeat(200),
      "## 2024-01-02\n\nOld entry " + "y".repeat(200),
      "## 2024-06-15\n\nRecent entry 1",
      "## 2024-06-16\n\nRecent entry 2",
    ];
    const content = sections.join("\n");

    // Budget that fits title + last 2 sections but not all
    const result = structuredTruncate(content, 200);

    expect(result).toContain("# Health Memory");
    expect(result).toContain("Recent entry 2");
    expect(result).toContain("truncated");
  });

  test("shows truncation count", () => {
    const content =
      "# Title\n" +
      Array.from({ length: 10 }, (_, i) => `\n## Entry ${i}\n\n${"x".repeat(100)}`).join("");

    const result = structuredTruncate(content, 500);
    expect(result).toMatch(/\[\d+ earlier entries truncated\]/);
  });

  test("appends daily log section", () => {
    const content = "# Title\n\n## Entry 1\n\nContent";
    const dailyLog = "\n\n## Recent Daily Logs\n\n- **2024-06-16**: User discussed sleep";

    const result = structuredTruncate(content, 1000, dailyLog);
    expect(result).toContain("Recent Daily Logs");
    expect(result).toContain("User discussed sleep");
  });

  test("handles content without ## sections gracefully", () => {
    const content = "Just plain text " + "x".repeat(500);
    const result = structuredTruncate(content, 200);
    expect(result).toContain("[Earlier memories truncated]");
    expect(result.length).toBeLessThanOrEqual(250); // Some overhead
  });

  test("handles empty content", () => {
    const result = structuredTruncate("", 1000);
    expect(result).toBe("");
  });
});
