/**
 * System Prompt — Skill Registry (OpenClaw pattern)
 *
 * Lists available skills with name + description in the system prompt.
 * The agent scans descriptions, decides relevance, and uses `get_skill`
 * to lazy-load full content on demand. No trigger words or regex matching.
 */

import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import { getSkillsDir } from "../tools/skill-tools.js";

/**
 * Build a skill registry section for the system prompt.
 * Agent scans descriptions and calls `get_skill` when relevant.
 */
export function buildSkillRegistry(options?: { excludeTypes?: string[] }): string {
  const skillsDir = getSkillsDir();
  if (!existsSync(skillsDir)) {
    return "";
  }

  const skills: Array<{ name: string; description: string }> = [];

  try {
    const entries = readdirSync(skillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.endsWith("_disabled")) continue;

      const skillFile = join(skillsDir, entry.name, "SKILL.md");
      if (!existsSync(skillFile)) continue;

      const content = readFileSync(skillFile, "utf-8");

      // Filter by type if excludeTypes specified
      if (options?.excludeTypes?.length) {
        const typeMatch = content.match(/"type"\s*:\s*"([^"]+)"/);
        const skillType = typeMatch?.[1];
        if (skillType && options.excludeTypes.includes(skillType)) continue;
      }

      const nameMatch = content.match(/^name:\s*(.+)$/m);
      const descMatch = content.match(/^description:\s*"?([^"]+)"?$/m);

      skills.push({
        name: nameMatch?.[1]?.trim() || entry.name,
        description: descMatch?.[1]?.trim() || "",
      });
    }
  } catch (e) {
    console.warn("Failed to load skill registry:", e);
  }

  if (skills.length === 0) {
    return "";
  }

  const lines = [
    "",
    "## Skills (mandatory)",
    "",
    "Before replying, scan the skill descriptions below.",
    "- If exactly one skill clearly applies to the user's question: call `get_skill(name)` to load its full guide, then follow it.",
    "- If multiple could apply: choose the most specific one, load it, then follow it.",
    "- If none clearly apply: do not load any skill.",
    "- Never load more than one skill upfront.",
    "",
    "<available_skills>",
  ];

  for (const skill of skills) {
    lines.push(`- **${skill.name}**: ${skill.description}`);
  }

  lines.push("</available_skills>");
  lines.push("");

  return lines.join("\n");
}
