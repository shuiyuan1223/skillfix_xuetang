/**
 * Tests for Skill Auto-Trigger
 *
 * Tests trigger matching logic, Chinese/English word boundaries,
 * skill scoring, and message enrichment.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { enrichWithSkills, resetSkillCache } from "../../src/agent/skill-trigger.js";

// Reset cache before each test so real skills are loaded fresh
beforeEach(() => {
  resetSkillCache();
});

describe("enrichWithSkills", () => {
  describe("English triggers", () => {
    test("matches English trigger with word boundary", () => {
      const result = enrichWithSkills("How was my sleep last night?");
      expect(result).toContain("<skill-guide");
      expect(result).toContain("sleep-coach");
    });

    test("matches case-insensitive English triggers", () => {
      const result = enrichWithSkills("I had INSOMNIA last night");
      expect(result).toContain("<skill-guide");
    });

    test("does not match partial English words", () => {
      // "rest" was removed as a trigger, but let's verify word boundary works
      // "activity" is a trigger — "radioactivity" should not match
      const result = enrichWithSkills("I studied radioactivity in physics class");
      // Should not trigger health-overview just because "activity" is embedded
      // Actually "activity" has word boundary, so "radioactivity" won't match
      expect(result).not.toContain("health-overview");
    });

    test("returns original message when no triggers match", () => {
      const message = "What's the weather like today?";
      const result = enrichWithSkills(message);
      expect(result).toBe(message);
    });

    test("matches workout trigger", () => {
      const result = enrichWithSkills("Did I workout today?");
      expect(result).toContain("<skill-guide");
      expect(result).toContain("workout-tracker");
    });

    test("matches heart rate trigger", () => {
      const result = enrichWithSkills("What's my heart rate?");
      expect(result).toContain("<skill-guide");
      expect(result).toContain("heart-monitor");
    });

    test("matches stress trigger", () => {
      const result = enrichWithSkills("I'm feeling really stressed today");
      expect(result).toContain("stress-management");
    });

    test("matches goal trigger", () => {
      const result = enrichWithSkills("Help me set a fitness goal");
      expect(result).toContain("goal-coach");
    });

    test("matches weekly review trigger", () => {
      const result = enrichWithSkills("Give me my weekly review");
      expect(result).toContain("weekly-review");
    });
  });

  describe("Chinese triggers", () => {
    test("matches Chinese sleep trigger", () => {
      const result = enrichWithSkills("我昨晚睡眠怎么样？");
      expect(result).toContain("<skill-guide");
      expect(result).toContain("sleep-coach");
    });

    test("matches Chinese heart rate trigger", () => {
      const result = enrichWithSkills("我的心率正常吗？");
      expect(result).toContain("<skill-guide");
      expect(result).toContain("heart-monitor");
    });

    test("matches Chinese workout trigger", () => {
      const result = enrichWithSkills("今天要不要去锻炼？");
      expect(result).toContain("<skill-guide");
      expect(result).toContain("workout-tracker");
    });

    test("matches Chinese step count trigger", () => {
      const result = enrichWithSkills("今天走了多少步？");
      // "步数" or "多少步" should trigger health-overview
      expect(result).toContain("<skill-guide");
    });

    test("matches Chinese insomnia trigger", () => {
      const result = enrichWithSkills("最近老是失眠怎么办？");
      expect(result).toContain("sleep-coach");
    });

    test("matches Chinese fatigue trigger", () => {
      const result = enrichWithSkills("我最近总是很疲劳");
      expect(result).toContain("<skill-guide");
    });

    test("matches Chinese stress trigger", () => {
      const result = enrichWithSkills("最近压力好大");
      expect(result).toContain("stress-management");
    });

    test("matches Chinese goal trigger", () => {
      // Use multiple goal-coach triggers to ensure it ranks high
      const result = enrichWithSkills("我想养成一个好习惯，帮我制定计划");
      expect(result).toContain("goal-coach");
    });

    test("matches Chinese weekly review trigger", () => {
      const result = enrichWithSkills("这周总结一下吧");
      expect(result).toContain("<skill-guide");
    });
  });

  describe("multi-skill matching", () => {
    test("matches multiple skills when triggers from different skills appear", () => {
      // "sleep" triggers sleep-coach, "heart rate" triggers heart-monitor
      const result = enrichWithSkills("How does my sleep affect my heart rate?");
      expect(result).toContain("sleep-coach");
      expect(result).toContain("heart-monitor");
    });

    test("returns at most 2 skill guides", () => {
      // Try to trigger many skills at once
      const result = enrichWithSkills(
        "Tell me about my sleep, heart rate, workout, and step count overview"
      );
      const matches = result.match(/<skill-guide/g);
      expect(matches).toBeTruthy();
      expect(matches!.length).toBeLessThanOrEqual(2);
    });
  });

  describe("message enrichment format", () => {
    test("prepends skill guide and preserves original message", () => {
      const message = "How was my sleep?";
      const result = enrichWithSkills(message);
      // Should end with the original message
      expect(result).toContain(message);
      // Should have the preamble
      expect(result).toContain("professional skill guide");
      // Should have separator
      expect(result).toContain("---");
    });

    test("wraps skill content in skill-guide tags with name attribute", () => {
      const result = enrichWithSkills("分析一下我的睡眠");
      expect(result).toMatch(/<skill-guide name="sleep-coach">/);
      expect(result).toMatch(/<\/skill-guide>/);
    });
  });

  describe("edge cases", () => {
    test("handles empty message", () => {
      const result = enrichWithSkills("");
      expect(result).toBe("");
    });

    test("handles message with only whitespace", () => {
      const result = enrichWithSkills("   ");
      expect(result).toBe("   ");
    });

    test("handles very long messages", () => {
      const longMessage = "Tell me about sleep. ".repeat(100);
      const result = enrichWithSkills(longMessage);
      expect(result).toContain("<skill-guide");
    });
  });
});
