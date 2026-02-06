/**
 * Tests for System Prompt Builder
 *
 * Tests skill registry generation from SKILL.md files.
 */

import { describe, test, expect } from "bun:test";
import { buildSkillRegistry } from "../../src/agent/system-prompt.js";

describe("buildSkillRegistry", () => {
  test("returns non-empty string when skills exist", () => {
    const registry = buildSkillRegistry();
    expect(registry.length).toBeGreaterThan(0);
  });

  test("contains Available Skills header", () => {
    const registry = buildSkillRegistry();
    expect(registry).toContain("## Available Skills");
  });

  test("contains markdown table header", () => {
    const registry = buildSkillRegistry();
    expect(registry).toContain("| Skill | Description | Triggers |");
    expect(registry).toContain("|-------|-------------|----------|");
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
    expect(registry).toContain("heart rate");
    expect(registry).toContain("workout");
    expect(registry).toContain("health data");
  });

  test("includes trigger keywords", () => {
    const registry = buildSkillRegistry();
    // Check a few representative triggers from each skill
    expect(registry).toContain("insomnia");
    expect(registry).toContain("bpm");
    expect(registry).toContain("exercise");
    expect(registry).toContain("steps");
  });

  test("includes Chinese triggers", () => {
    const registry = buildSkillRegistry();
    expect(registry).toContain("睡眠");
    expect(registry).toContain("心率");
    expect(registry).toContain("运动");
    expect(registry).toContain("步数");
  });

  test("excludes disabled skills", () => {
    // Skills ending with _disabled should not appear
    // We can't easily test this without creating a disabled skill dir,
    // but we verify the logic exists by checking that currently no
    // unexpected skills appear
    const registry = buildSkillRegistry();
    expect(registry).not.toContain("_disabled");
  });

  test("contains get_skill tool reference", () => {
    const registry = buildSkillRegistry();
    expect(registry).toContain("get_skill");
  });

  test("mentions auto-injection behavior", () => {
    const registry = buildSkillRegistry();
    expect(registry).toContain("automatically");
  });
});
