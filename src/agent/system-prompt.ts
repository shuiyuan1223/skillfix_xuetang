/**
 * System Prompt for PHA Agent
 *
 * Provides skill registry for on-demand skill loading (Claude Code pattern).
 * Skills are NOT loaded into the system prompt in full — instead, the agent
 * gets a registry of available skills and uses the `get_skill` tool to load
 * the full content when needed.
 */

import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";

/**
 * Build a skill registry section for the system prompt.
 * Lists available skills with name, description, and triggers — not full content.
 * The agent uses the `get_skill` tool to load full skill content on demand.
 */
export function buildSkillRegistry(): string {
  const skillsDir = "src/skills";
  if (!existsSync(skillsDir)) {
    return "";
  }

  const skills: Array<{ name: string; description: string; triggers: string[] }> = [];

  try {
    const entries = readdirSync(skillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.endsWith("_disabled")) continue;

      const skillFile = join(skillsDir, entry.name, "SKILL.md");
      if (!existsSync(skillFile)) continue;

      const content = readFileSync(skillFile, "utf-8");

      // Extract frontmatter fields
      const nameMatch = content.match(/^name:\s*(.+)$/m);
      const descMatch = content.match(/^description:\s*"?([^"]+)"?$/m);

      // Extract triggers from metadata JSON
      let triggers: string[] = [];
      const triggersMatch = content.match(/"triggers":\s*\[([^\]]+)\]/);
      if (triggersMatch) {
        triggers = triggersMatch[1].split(",").map((s) => s.trim().replace(/^"|"$/g, ""));
      }

      skills.push({
        name: nameMatch?.[1]?.trim() || entry.name,
        description: descMatch?.[1]?.trim() || "",
        triggers,
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
    "## Available Skills",
    "",
    "You have professional skill guides. Relevant guides are automatically injected when the user's message matches a skill topic. If you need a guide that wasn't auto-loaded, use the `get_skill` tool. When a skill guide is present, follow its assessment framework and recommendations.",
    "",
    "| Skill | Description | Triggers |",
    "|-------|-------------|----------|",
  ];

  for (const skill of skills) {
    const triggerStr = skill.triggers.length > 0 ? skill.triggers.join(", ") : "-";
    lines.push(`| ${skill.name} | ${skill.description} | ${triggerStr} |`);
  }

  lines.push("");

  return lines.join("\n");
}
