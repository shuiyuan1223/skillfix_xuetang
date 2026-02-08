/**
 * Skill Auto-Trigger
 *
 * Matches user messages against skill triggers and injects
 * relevant skill content into the conversation context.
 * This eliminates the need for the agent to manually call get_skill.
 */

import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import { getSkillsDir } from "../tools/skill-tools.js";

interface SkillEntry {
  name: string;
  triggers: string[];
  body: string;
}

let skillCache: SkillEntry[] | null = null;

/**
 * Load all enabled skills into cache (lazy, once).
 */
function getSkillEntries(): SkillEntry[] {
  if (skillCache) return skillCache;

  const skillsDir = getSkillsDir();
  skillCache = [];

  if (!existsSync(skillsDir)) return skillCache;

  try {
    const entries = readdirSync(skillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.endsWith("_disabled")) continue;

      const skillFile = join(skillsDir, entry.name, "SKILL.md");
      if (!existsSync(skillFile)) continue;

      const content = readFileSync(skillFile, "utf-8");

      // Extract name
      const nameMatch = content.match(/^name:\s*(.+)$/m);
      const name = nameMatch?.[1]?.trim() || entry.name;

      // Extract triggers
      let triggers: string[] = [];
      const triggersMatch = content.match(/"triggers":\s*\[([^\]]+)\]/);
      if (triggersMatch) {
        triggers = triggersMatch[1]
          .split(",")
          .map((s) => s.trim().replace(/^"|"$/g, "").toLowerCase());
      }

      // Extract body (after frontmatter)
      const bodyMatch = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
      const body = bodyMatch ? bodyMatch[1].trim() : "";

      if (body && triggers.length > 0) {
        skillCache.push({ name, triggers, body });
      }
    }
  } catch (e) {
    console.warn("[Skill Trigger] Failed to load skills:", e);
  }

  return skillCache;
}

/**
 * Check if a trigger matches within a message.
 * - Chinese triggers: simple includes (Chinese chars are inherently word-boundary-safe)
 * - English triggers: word boundary check to avoid partial matches (e.g. "rest" in "restaurant")
 */
function triggerMatches(message: string, trigger: string): boolean {
  // Chinese: any CJK character present means it's a Chinese trigger
  const isChinese = /[\u4e00-\u9fff]/.test(trigger);
  if (isChinese) {
    return message.includes(trigger);
  }
  // English: word boundary match
  const escaped = trigger.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(message);
}

/**
 * Match a user message against skill triggers.
 * Returns the top 1-2 matching skills sorted by relevance.
 */
function matchSkills(message: string): SkillEntry[] {
  const skills = getSkillEntries();

  // Score each skill by number of trigger matches
  const scored = skills
    .map((skill) => {
      const matchCount = skill.triggers.filter((t) => triggerMatches(message, t)).length;
      return { skill, matchCount };
    })
    .filter((s) => s.matchCount > 0)
    .sort((a, b) => b.matchCount - a.matchCount);

  // Return top 2 max
  return scored.slice(0, 2).map((s) => s.skill);
}

/**
 * Enrich a user message with auto-triggered skill content.
 * If the message matches skill triggers, prepend skill guides.
 * Returns the original message if no skills match.
 */
export function enrichWithSkills(message: string): string {
  const matched = matchSkills(message);
  if (matched.length === 0) return message;

  const skillSections = matched
    .map((skill) => `<skill-guide name="${skill.name}">\n${skill.body}\n</skill-guide>`)
    .join("\n\n");

  return `The following professional skill guide(s) are relevant to this conversation. Follow the guidance within when responding.

${skillSections}

---

${message}`;
}

/**
 * Force-load a specific skill by name and inject it into the message.
 * Used by Evolution Lab to guarantee the evolution-driver skill is always present.
 * Falls back to enrichWithSkills if the skill is not found.
 */
export function enrichWithForcedSkill(message: string, skillName: string): string {
  const skills = getSkillEntries();
  const forcedSkill = skills.find((s) => s.name === skillName);

  if (!forcedSkill) {
    // Skill not found, fall back to normal enrichment
    return enrichWithSkills(message);
  }

  // Check if enrichWithSkills would already include it
  const matched = matchSkills(message);
  const alreadyIncluded = matched.some((s) => s.name === skillName);

  if (alreadyIncluded) {
    // Already matched by triggers, use normal flow
    return enrichWithSkills(message);
  }

  // Force inject the skill + any other trigger-matched skills
  const allSkills = [forcedSkill, ...matched.filter((s) => s.name !== skillName)];
  const skillSections = allSkills
    .map((skill) => `<skill-guide name="${skill.name}">\n${skill.body}\n</skill-guide>`)
    .join("\n\n");

  return `The following professional skill guide(s) are relevant to this conversation. Follow the guidance within when responding.

${skillSections}

---

${message}`;
}

/**
 * Reset the skill cache (useful for testing or after skill modifications).
 */
export function resetSkillCache(): void {
  skillCache = null;
}
