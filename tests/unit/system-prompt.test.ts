/**
 * Tests for System Prompt Builder
 *
 * Tests skill registry generation from SKILL.md files.
 * Registry uses OpenClaw-style: descriptions in prompt + LLM-driven get_skill loading.
 */

import { describe, test, expect } from "bun:test";
import { buildSkillRegistry } from "../../src/agent/system-prompt.js";

describe("buildSkillRegistry", () => {
  test("returns non-empty string when skills exist", () => {
    const registry = buildSkillRegistry();
    expect(registry.length).toBeGreaterThan(0);
  });

  test("contains Skills (mandatory) header", () => {
    const registry = buildSkillRegistry();
    expect(registry).toContain("## Skills (mandatory)");
  });

  test("contains available_skills XML tags", () => {
    const registry = buildSkillRegistry();
    expect(registry).toContain("<available_skills>");
    expect(registry).toContain("</available_skills>");
  });

  test("includes all 7 skills", () => {
    const registry = buildSkillRegistry();
    expect(registry).toContain("sleep-coach");
    expect(registry).toContain("heart-monitor");
    expect(registry).toContain("workout-tracker");
    expect(registry).toContain("health-overview");
    expect(registry).toContain("weekly-review");
    expect(registry).toContain("stress-management");
    expect(registry).toContain("goal-coach");
  });

  test("includes skill descriptions", () => {
    const registry = buildSkillRegistry();
    expect(registry).toContain("sleep");
    expect(registry).toContain("心率");
    expect(registry).toContain("运动");
    expect(registry).toContain("健康数据");
  });

  test("uses bold name + description list format", () => {
    const registry = buildSkillRegistry();
    // Each skill should be formatted as: - **name**: description
    expect(registry).toMatch(/- \*\*sleep-coach\*\*:/);
    expect(registry).toMatch(/- \*\*heart-monitor\*\*:/);
  });

  test("contains scan instructions", () => {
    const registry = buildSkillRegistry();
    expect(registry).toContain("scan the skill descriptions below");
    expect(registry).toContain("get_skill");
  });

  test("excludes disabled skills", () => {
    const registry = buildSkillRegistry();
    expect(registry).not.toContain("_disabled");
  });

  test("contains get_skill tool reference", () => {
    const registry = buildSkillRegistry();
    expect(registry).toContain("get_skill");
  });

  test("describes LLM-driven loading behavior", () => {
    const registry = buildSkillRegistry();
    expect(registry).toContain("call `get_skill(name)` to load its full guide");
  });
});
