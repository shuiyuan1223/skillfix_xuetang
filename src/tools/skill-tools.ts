/**
 * Skills Management Tools
 *
 * MCP tools for managing SKILL.md files with YAML frontmatter.
 * Skills follow the OpenClaw pattern: each skill is a folder with SKILL.md.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, renameSync } from "fs";
import { join, basename, dirname } from "path";
import { execSync } from "child_process";

// Default skills directory (relative to project root)
let skillsDir = "src/skills";

export function setSkillsDir(dir: string): void {
  skillsDir = dir;
}

export function getSkillsDir(): string {
  return skillsDir;
}

/**
 * Parse YAML frontmatter from SKILL.md
 */
function parseFrontmatter(content: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: content };
  }

  const [, yamlStr, body] = match;

  // Simple YAML parser for basic key-value pairs
  const frontmatter: Record<string, unknown> = {};
  let currentKey = "";
  let inMultiline = false;
  let multilineValue = "";

  for (const line of yamlStr.split("\n")) {
    if (inMultiline) {
      if (line.startsWith("  ") || line.trim() === "") {
        multilineValue += line + "\n";
        continue;
      } else {
        // Try to parse as JSON if it looks like JSON
        try {
          frontmatter[currentKey] = JSON.parse(multilineValue.trim());
        } catch {
          frontmatter[currentKey] = multilineValue.trim();
        }
        inMultiline = false;
      }
    }

    const keyMatch = line.match(/^(\w+):\s*(.*)$/);
    if (keyMatch) {
      const [, key, value] = keyMatch;
      currentKey = key;
      if (value === "" || value === "|" || value === ">") {
        inMultiline = true;
        multilineValue = "";
      } else if (value.startsWith('"') && value.endsWith('"')) {
        frontmatter[key] = value.slice(1, -1);
      } else if (value === "true") {
        frontmatter[key] = true;
      } else if (value === "false") {
        frontmatter[key] = false;
      } else if (!isNaN(Number(value))) {
        frontmatter[key] = Number(value);
      } else {
        // Check if it's inline JSON
        if (value.trim().startsWith("{") || value.trim().startsWith("[")) {
          try {
            frontmatter[key] = JSON.parse(value);
          } catch {
            frontmatter[key] = value;
          }
        } else {
          frontmatter[key] = value;
        }
      }
    }
  }

  if (inMultiline && currentKey) {
    try {
      frontmatter[currentKey] = JSON.parse(multilineValue.trim());
    } catch {
      frontmatter[currentKey] = multilineValue.trim();
    }
  }

  return { frontmatter, body: body.trim() };
}

/**
 * Serialize frontmatter to YAML string
 */
function serializeFrontmatter(frontmatter: Record<string, unknown>): string {
  const lines: string[] = ["---"];

  for (const [key, value] of Object.entries(frontmatter)) {
    if (typeof value === "string") {
      if (value.includes("\n")) {
        lines.push(`${key}: |`);
        value.split("\n").forEach((l) => lines.push(`  ${l}`));
      } else if (value.includes('"') || value.includes(":")) {
        lines.push(`${key}: "${value.replace(/"/g, '\\"')}"`);
      } else {
        lines.push(`${key}: "${value}"`);
      }
    } else if (typeof value === "object") {
      lines.push(`${key}:`);
      lines.push(`  ${JSON.stringify(value)}`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }

  lines.push("---");
  return lines.join("\n");
}

/**
 * Get skill info from a skill directory
 */
function getSkillInfo(skillDir: string): {
  name: string;
  path: string;
  enabled: boolean;
  frontmatter: Record<string, unknown>;
  body: string;
} | null {
  const skillFile = join(skillDir, "SKILL.md");
  if (!existsSync(skillFile)) return null;

  const content = readFileSync(skillFile, "utf-8");
  const { frontmatter, body } = parseFrontmatter(content);

  // Check if disabled (by convention: _disabled suffix or enabled: false in frontmatter)
  const dirName = basename(skillDir);
  const enabled = !dirName.endsWith("_disabled") && frontmatter.enabled !== false;

  return {
    name: (frontmatter.name as string) || dirName,
    path: skillDir,
    enabled,
    frontmatter,
    body,
  };
}

/**
 * List all skills
 */
export const listSkillsTool = {
  name: "list_skills",
  description: "List all skills with their status and metadata",
  parameters: {
    type: "object" as const,
    properties: {
      includeDisabled: {
        type: "boolean",
        description: "Include disabled skills (default: true)",
      },
    },
  },
  execute: async (args?: { includeDisabled?: boolean }) => {
    const options = args || {};
    const dir = getSkillsDir();
    if (!existsSync(dir)) {
      return { success: true, skills: [], count: 0 };
    }

    const includeDisabled = options.includeDisabled !== false;
    const skills: Array<{
      name: string;
      description?: string;
      enabled: boolean;
      path: string;
      emoji?: string;
      triggers?: string[];
    }> = [];

    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const info = getSkillInfo(join(dir, entry.name));
      if (!info) continue;

      if (!includeDisabled && !info.enabled) continue;

      const metadata = info.frontmatter.metadata as Record<string, unknown> | undefined;
      const pha = metadata?.pha as Record<string, unknown> | undefined;

      skills.push({
        name: info.name,
        description: info.frontmatter.description as string | undefined,
        enabled: info.enabled,
        path: info.path,
        emoji: pha?.emoji as string | undefined,
        triggers: pha?.triggers as string[] | undefined,
      });
    }

    // Sort: enabled first, then alphabetically
    skills.sort((a, b) => {
      if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return {
      success: true,
      skills,
      count: skills.length,
      enabledCount: skills.filter((s) => s.enabled).length,
    };
  },
};

/**
 * Get skill content
 */
export const getSkillTool = {
  name: "get_skill",
  description: "Get the full content and metadata of a specific skill",
  parameters: {
    type: "object" as const,
    properties: {
      name: {
        type: "string",
        description: "Skill name (folder name)",
      },
    },
    required: ["name"],
  },
  execute: async (args: { name: string }) => {
    const skillDir = join(getSkillsDir(), args.name);
    const info = getSkillInfo(skillDir);

    if (!info) {
      // Try with _disabled suffix
      const disabledDir = join(getSkillsDir(), `${args.name}_disabled`);
      const disabledInfo = getSkillInfo(disabledDir);
      if (disabledInfo) {
        return {
          success: true,
          ...disabledInfo,
          content: readFileSync(join(disabledDir, "SKILL.md"), "utf-8"),
        };
      }

      return {
        success: false,
        error: `Skill not found: ${args.name}`,
      };
    }

    return {
      success: true,
      ...info,
      content: readFileSync(join(skillDir, "SKILL.md"), "utf-8"),
    };
  },
};

/**
 * Update skill content
 */
export const updateSkillTool = {
  name: "update_skill",
  description: "Update a skill's SKILL.md content",
  parameters: {
    type: "object" as const,
    properties: {
      name: {
        type: "string",
        description: "Skill name (folder name)",
      },
      content: {
        type: "string",
        description: "New SKILL.md content (including frontmatter)",
      },
    },
    required: ["name", "content"],
  },
  execute: async (args: { name: string; content: string }) => {
    let skillDir = join(getSkillsDir(), args.name);

    // Check for disabled version
    if (!existsSync(skillDir)) {
      const disabledDir = join(getSkillsDir(), `${args.name}_disabled`);
      if (existsSync(disabledDir)) {
        skillDir = disabledDir;
      } else {
        return {
          success: false,
          error: `Skill not found: ${args.name}`,
        };
      }
    }

    const skillFile = join(skillDir, "SKILL.md");
    const oldContent = readFileSync(skillFile, "utf-8");

    if (oldContent === args.content) {
      return {
        success: true,
        message: "No changes detected",
        changed: false,
      };
    }

    writeFileSync(skillFile, args.content, "utf-8");

    // Git commit
    try {
      execSync(`git add "${skillFile}" && git commit -m "Update skill: ${args.name}"`, {
        cwd: process.cwd(),
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch {
      // Ignore git errors
    }

    return {
      success: true,
      message: `Updated skill: ${args.name}`,
      changed: true,
    };
  },
};

/**
 * Create a new skill
 */
export const createSkillTool = {
  name: "create_skill",
  description: "Create a new skill with SKILL.md",
  parameters: {
    type: "object" as const,
    properties: {
      name: {
        type: "string",
        description: "Skill name (will be folder name, use kebab-case)",
      },
      description: {
        type: "string",
        description: "Brief description of the skill",
      },
      emoji: {
        type: "string",
        description: "Emoji icon for the skill",
      },
      triggers: {
        type: "array",
        items: { type: "string" },
        description: "Keywords that trigger this skill",
      },
      content: {
        type: "string",
        description: "Skill instructions (markdown body after frontmatter)",
      },
    },
    required: ["name", "description"],
  },
  execute: async (args: {
    name: string;
    description: string;
    emoji?: string;
    triggers?: string[];
    content?: string;
  }) => {
    const skillDir = join(getSkillsDir(), args.name);

    if (existsSync(skillDir)) {
      return {
        success: false,
        error: `Skill already exists: ${args.name}`,
      };
    }

    // Create directory
    mkdirSync(skillDir, { recursive: true });

    // Build frontmatter
    const frontmatter: Record<string, unknown> = {
      name: args.name,
      description: args.description,
    };

    if (args.emoji || args.triggers) {
      frontmatter.metadata = {
        pha: {
          ...(args.emoji && { emoji: args.emoji }),
          ...(args.triggers && { triggers: args.triggers }),
        },
      };
    }

    // Build content
    const skillContent = [
      serializeFrontmatter(frontmatter),
      "",
      `# ${args.name
        .split("-")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ")} Skill`,
      "",
      args.content || "<!-- Add skill instructions here -->",
      "",
    ].join("\n");

    const skillFile = join(skillDir, "SKILL.md");
    writeFileSync(skillFile, skillContent, "utf-8");

    // Git commit
    try {
      execSync(`git add "${skillDir}" && git commit -m "Create skill: ${args.name}"`, {
        cwd: process.cwd(),
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch {
      // Ignore git errors
    }

    return {
      success: true,
      message: `Created skill: ${args.name}`,
      path: skillDir,
    };
  },
};

/**
 * Toggle skill enabled/disabled status
 */
export const toggleSkillTool = {
  name: "toggle_skill",
  description: "Enable or disable a skill (renames folder with _disabled suffix)",
  parameters: {
    type: "object" as const,
    properties: {
      name: {
        type: "string",
        description: "Skill name",
      },
      enabled: {
        type: "boolean",
        description: "Whether to enable (true) or disable (false) the skill",
      },
    },
    required: ["name", "enabled"],
  },
  execute: async (args: { name: string; enabled: boolean }) => {
    const baseName = args.name.replace(/_disabled$/, "");
    const enabledDir = join(getSkillsDir(), baseName);
    const disabledDir = join(getSkillsDir(), `${baseName}_disabled`);

    const currentlyEnabled = existsSync(enabledDir);
    const currentlyDisabled = existsSync(disabledDir);

    if (!currentlyEnabled && !currentlyDisabled) {
      return {
        success: false,
        error: `Skill not found: ${args.name}`,
      };
    }

    if (args.enabled && currentlyEnabled) {
      return {
        success: true,
        message: "Skill is already enabled",
        changed: false,
      };
    }

    if (!args.enabled && currentlyDisabled) {
      return {
        success: true,
        message: "Skill is already disabled",
        changed: false,
      };
    }

    // Perform the toggle
    if (args.enabled) {
      // Enable: rename from _disabled
      renameSync(disabledDir, enabledDir);
    } else {
      // Disable: add _disabled suffix
      renameSync(enabledDir, disabledDir);
    }

    // Git commit
    try {
      execSync(
        `git add -A "${getSkillsDir()}" && git commit -m "${args.enabled ? "Enable" : "Disable"} skill: ${baseName}"`,
        {
          cwd: process.cwd(),
          stdio: ["pipe", "pipe", "pipe"],
        }
      );
    } catch {
      // Ignore git errors
    }

    return {
      success: true,
      message: `${args.enabled ? "Enabled" : "Disabled"} skill: ${baseName}`,
      changed: true,
      newPath: args.enabled ? enabledDir : disabledDir,
    };
  },
};

// Export all tools as array
export const skillTools = [
  listSkillsTool,
  getSkillTool,
  updateSkillTool,
  createSkillTool,
  toggleSkillTool,
];
