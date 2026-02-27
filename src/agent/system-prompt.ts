/**
 * System Prompt — Skill Registry (OpenClaw pattern)
 *
 * Lists available skills with name + description in the system prompt.
 * The agent scans descriptions, decides relevance, and uses `get_skill`
 * to lazy-load full content on demand. No trigger words or regex matching.
 *
 * Skills are filtered via include/exclude (by name, category, or tag)
 * and grouped by category in the output.
 */

import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { getSkillsDir } from '../tools/skill-tools.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('Agent/SystemPrompt');

interface SkillEntry {
  name: string;
  description: string;
  category?: string;
  tags?: string[];
}

/** Category display order and labels */
const CATEGORY_LABELS: Record<string, string> = {
  'health-coaching': '健康教练',
  'health-management': '健康管理',
  evolution: '进化系统',
  development: '开发工具',
  utility: '工具',
};

const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS);

/**
 * Parse metadata from SKILL.md content.
 * Extracts category, tags, and type from the JSON metadata block.
 */
function parseSkillMetadata(content: string): {
  category?: string;
  tags?: string[];
  type?: string;
} {
  const metadataMatch = content.match(/metadata:\s*\n\s*(\{.+\})/s);
  if (!metadataMatch) {
    return {};
  }

  try {
    const meta = JSON.parse(metadataMatch[1]);
    const pha = meta?.pha;
    if (!pha) {
      return {};
    }
    return {
      category: pha.category,
      tags: pha.tags,
      type: pha.type,
    };
  } catch {
    // Fallback: regex for individual fields
    const categoryMatch = content.match(/"category"\s*:\s*"([^"]+)"/);
    const typeMatch = content.match(/"type"\s*:\s*"([^"]+)"/);
    return {
      category: categoryMatch?.[1],
      type: typeMatch?.[1],
    };
  }
}

/**
 * Check if a skill matches include/exclude filters.
 * Matches against: skill name, category, tags.
 */
function matchesFilter(skill: SkillEntry, filters: string[]): boolean {
  for (const filter of filters) {
    if (skill.name === filter) {
      return true;
    }
    if (skill.category === filter) {
      return true;
    }
    if (skill.tags?.includes(filter)) {
      return true;
    }
  }
  return false;
}

function passesFilters(
  skill: SkillEntry,
  metadata: { tags?: string[]; type?: string },
  options?: {
    tags?: string[];
    include?: string[];
    exclude?: string[];
    excludeTypes?: string[];
  }
): boolean {
  if (options?.excludeTypes?.length) {
    if (metadata.type && options.excludeTypes.includes(metadata.type)) {
      return false;
    }
  }
  if (options?.tags?.length) {
    if (!metadata.tags?.some((t) => options.tags!.includes(t))) {
      return false;
    }
  }
  if (options?.include?.length) {
    if (!matchesFilter(skill, options.include)) {
      return false;
    }
  }
  if (options?.exclude?.length) {
    if (matchesFilter(skill, options.exclude)) {
      return false;
    }
  }
  return true;
}

function loadFilteredSkills(
  skillsDir: string,
  options?: {
    tags?: string[];
    include?: string[];
    exclude?: string[];
    excludeTypes?: string[];
  }
): SkillEntry[] {
  const skills: SkillEntry[] = [];
  try {
    const entries = readdirSync(skillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      if (entry.name.endsWith('_disabled')) {
        continue;
      }

      const skillFile = join(skillsDir, entry.name, 'SKILL.md');
      if (!existsSync(skillFile)) {
        continue;
      }

      const content = readFileSync(skillFile, 'utf-8');
      const metadata = parseSkillMetadata(content);
      const nameMatch = content.match(/^name:\s*(.+)$/m);
      const descMatch = content.match(/^description:\s*"?([^"]+)"?$/m);

      const skill: SkillEntry = {
        name: nameMatch?.[1]?.trim() || entry.name,
        description: descMatch?.[1]?.trim() || '',
        category: metadata.category,
        tags: metadata.tags,
      };

      if (passesFilters(skill, metadata, options)) {
        skills.push(skill);
      }
    }
  } catch (e) {
    log.warn('Failed to load skill registry', { error: String(e) });
  }
  return skills;
}

function formatSkillRegistryText(skills: SkillEntry[]): string {
  const grouped = new Map<string, SkillEntry[]>();
  for (const skill of skills) {
    const cat = skill.category || 'utility';
    if (!grouped.has(cat)) {
      grouped.set(cat, []);
    }
    grouped.get(cat)!.push(skill);
  }

  const lines = [
    '',
    '## Skills (mandatory)',
    '',
    'Before replying, scan the skill descriptions below.',
    "- If exactly one skill clearly applies to the user's question: call `get_skill(name)` to load its full guide, then follow it.",
    '- If multiple could apply: choose the most specific one, load it, then follow it.',
    '- If none clearly apply: do not load any skill.',
    '- Never load more than one skill upfront.',
    '',
    '<available_skills>',
  ];

  const orderedCategories = [...CATEGORY_ORDER.filter((c) => grouped.has(c))];
  for (const cat of grouped.keys()) {
    if (!orderedCategories.includes(cat)) {
      orderedCategories.push(cat);
    }
  }

  for (const cat of orderedCategories) {
    const catSkills = grouped.get(cat);
    if (!catSkills?.length) {
      continue;
    }

    const label = CATEGORY_LABELS[cat] || cat;
    lines.push(`\n### ${label}`);
    for (const skill of catSkills) {
      lines.push(`- **${skill.name}**: ${skill.description}`);
    }
  }

  lines.push('</available_skills>');
  lines.push('');
  return lines.join('\n');
}

/**
 * Build a skill registry section for the system prompt.
 * Agent scans descriptions and calls `get_skill` when relevant.
 *
 * Supports filtering via include/exclude (skill name, category, or tag).
 * Output is grouped by category.
 */
export function buildSkillRegistry(options?: {
  tags?: string[];
  include?: string[];
  exclude?: string[];
  /** @deprecated Use exclude instead */
  excludeTypes?: string[];
}): string {
  const skillsDir = getSkillsDir();
  if (!existsSync(skillsDir)) {
    return '';
  }

  const skills = loadFilteredSkills(skillsDir, options);
  if (skills.length === 0) {
    return '';
  }

  return formatSkillRegistryText(skills);
}
