/**
 * Skills Management Tools
 *
 * MCP tools for managing SKILL.md files with YAML frontmatter.
 * Skills follow the OpenClaw pattern: each skill is a folder with SKILL.md.
 */

import {
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  mkdirSync,
  renameSync,
  statSync,
} from "fs";
import { join, basename, extname } from "path";
import { gitCommitFiles } from "../evolution/version-manager.js";
import type { PHATool } from "./types.js";

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
  // Normalize \r\n to \n for Windows compatibility
  const normalized = content.replace(/\r\n/g, "\n");
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
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
 * Discover all files in a skill directory (SKILL.md + reference/ + scripts/)
 */
function discoverSkillFiles(skillDir: string): string[] {
  const files: string[] = [];
  if (!existsSync(skillDir)) return files;

  const skillFile = join(skillDir, "SKILL.md");
  if (existsSync(skillFile)) {
    files.push("SKILL.md");
  }

  for (const subDir of ["reference", "scripts"]) {
    const subPath = join(skillDir, subDir);
    if (existsSync(subPath) && statSync(subPath).isDirectory()) {
      for (const entry of readdirSync(subPath)) {
        const fullPath = join(subPath, entry);
        if (statSync(fullPath).isFile()) {
          files.push(`${subDir}/${entry}`);
        }
      }
    }
  }

  return files;
}

/**
 * Get editor language from file extension
 */
function getLanguageFromFile(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  const langMap: Record<string, string> = {
    ".md": "markdown",
    ".json": "json",
    ".py": "python",
    ".ts": "typescript",
    ".js": "javascript",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".txt": "plaintext",
  };
  return langMap[ext] || "plaintext";
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
  structure: { files: string[]; hasReference: boolean; hasScripts: boolean };
} | null {
  const skillFile = join(skillDir, "SKILL.md");
  if (!existsSync(skillFile)) return null;

  const content = readFileSync(skillFile, "utf-8");
  const { frontmatter, body } = parseFrontmatter(content);

  // Check if disabled (by convention: _disabled suffix or enabled: false in frontmatter)
  const dirName = basename(skillDir);
  const enabled = !dirName.endsWith("_disabled") && frontmatter.enabled !== false;

  const files = discoverSkillFiles(skillDir);

  return {
    name: (frontmatter.name as string) || dirName,
    path: skillDir,
    enabled,
    frontmatter,
    body,
    structure: {
      files,
      hasReference: files.some((f) => f.startsWith("reference/")),
      hasScripts: files.some((f) => f.startsWith("scripts/")),
    },
  };
}

/**
 * List all skills
 */
export const listSkillsTool: PHATool<{ includeDisabled?: boolean }> = {
  name: "list_skills",
  description: "列出所有技能及其状态和元数据",
  displayName: "技能列表",
  category: "skill",
  icon: "puzzle",
  label: "List Skills",
  inputSchema: {
    type: "object",
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
      type?: string;
      category?: string;
      tags?: string[];
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
        type: (pha?.type as string) || "pha",
        category: pha?.category as string | undefined,
        tags: pha?.tags as string[] | undefined,
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
export const getSkillTool: PHATool<{ name: string; filePath?: string }> = {
  name: "get_skill",
  description: "获取特定技能的完整内容和元数据。支持通过 filePath 读取子文件。",
  displayName: "获取技能",
  category: "skill",
  icon: "puzzle",
  label: "Get Skill",
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Skill name (folder name)",
      },
      filePath: {
        type: "string",
        description:
          'Relative file path within skill directory (default: "SKILL.md"). E.g. "reference/sharp_rubrics.json"',
      },
    },
    required: ["name"],
  },
  execute: async (args: { name: string; filePath?: string }) => {
    let skillDir = join(getSkillsDir(), args.name);
    let info = getSkillInfo(skillDir);

    if (!info) {
      // Try with _disabled suffix
      const disabledDir = join(getSkillsDir(), `${args.name}_disabled`);
      info = getSkillInfo(disabledDir);
      if (info) {
        skillDir = disabledDir;
      } else {
        return {
          success: false,
          error: `Skill not found: ${args.name}`,
        };
      }
    }

    const targetFile = args.filePath || "SKILL.md";
    const fullPath = join(skillDir, targetFile);

    if (!existsSync(fullPath)) {
      return {
        success: false,
        error: `File not found: ${targetFile}`,
      };
    }

    const content = readFileSync(fullPath, "utf-8");
    const language = getLanguageFromFile(targetFile);

    // Skill gating: validate requires.tools against registry
    const metadata = info.frontmatter.metadata as Record<string, unknown> | undefined;
    const pha = metadata?.pha as Record<string, unknown> | undefined;
    const requires = pha?.requires as Record<string, unknown> | undefined;
    const requiredTools = requires?.tools as string[] | undefined;
    let missingTools: string[] | undefined;

    if (requiredTools && Array.isArray(requiredTools)) {
      // Lazy import to avoid circular dependency at module load time
      const { globalRegistry } = await import("./index.js");
      missingTools = requiredTools.filter((t) => !globalRegistry.has(t));
    }

    return {
      success: true,
      ...info,
      content,
      filePath: targetFile,
      language,
      ...(missingTools && missingTools.length > 0
        ? { warning: `Missing required tools: ${missingTools.join(", ")}`, missingTools }
        : {}),
    };
  },
};

/**
 * Update skill content
 */
export const updateSkillTool: PHATool<{ name: string; content: string; filePath?: string }> = {
  name: "update_skill",
  description: "更新技能文件内容。支持通过 filePath 更新子文件。",
  displayName: "更新技能",
  category: "skill",
  icon: "puzzle",
  label: "Update Skill",
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Skill name (folder name)",
      },
      content: {
        type: "string",
        description: "New file content",
      },
      filePath: {
        type: "string",
        description:
          'Relative file path within skill directory (default: "SKILL.md"). E.g. "reference/sharp_rubrics.json"',
      },
    },
    required: ["name", "content"],
  },
  execute: async (args: { name: string; content: string; filePath?: string }) => {
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

    const targetFile = args.filePath || "SKILL.md";
    const fullPath = join(skillDir, targetFile);

    // Ensure parent directory exists for sub-files
    const parentDir = join(fullPath, "..");
    if (!existsSync(parentDir)) {
      mkdirSync(parentDir, { recursive: true });
    }

    if (existsSync(fullPath)) {
      const oldContent = readFileSync(fullPath, "utf-8");
      if (oldContent === args.content) {
        return {
          success: true,
          message: "No changes detected",
          changed: false,
        };
      }
    }

    writeFileSync(fullPath, args.content, "utf-8");

    // Git commit
    const commitMsg =
      targetFile === "SKILL.md"
        ? `Update skill: ${args.name}`
        : `Update skill: ${args.name}/${targetFile}`;
    gitCommitFiles(fullPath, commitMsg);

    return {
      success: true,
      message: `Updated ${args.name}/${targetFile}`,
      changed: true,
    };
  },
};

/**
 * Create a new skill
 */
export const createSkillTool: PHATool<{
  name: string;
  description: string;
  emoji?: string;
  content?: string;
}> = {
  name: "create_skill",
  description: "使用 SKILL.md 创建新技能",
  displayName: "创建技能",
  category: "skill",
  icon: "puzzle",
  label: "Create Skill",
  inputSchema: {
    type: "object",
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

    if (args.emoji) {
      frontmatter.metadata = {
        pha: {
          emoji: args.emoji,
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
    gitCommitFiles(skillFile, `Create skill: ${args.name}`);

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
export const toggleSkillTool: PHATool<{ name: string; enabled: boolean }> = {
  name: "toggle_skill",
  description: "启用或禁用技能（通过 _disabled 后缀重命名文件夹）",
  displayName: "切换技能状态",
  category: "skill",
  icon: "puzzle",
  label: "Toggle Skill",
  inputSchema: {
    type: "object",
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
    const targetDir = args.enabled ? enabledDir : disabledDir;
    gitCommitFiles(targetDir, `${args.enabled ? "Enable" : "Disable"} skill: ${baseName}`);

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
