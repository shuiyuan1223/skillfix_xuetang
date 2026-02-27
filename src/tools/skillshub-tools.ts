/**
 * SkillsHub Integration Tools
 *
 * Install skills from SkillsHub, ClawHub, GitHub, or any compatible skill source.
 * Handles format adaptation: OpenClaw metadata.openclaw → PHA metadata.pha
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, basename } from 'path';
import { gitCommitFiles } from '../evolution/version-manager.js';
import { getSkillsDir } from './skill-tools.js';
import type { PHATool } from './types.js';

/**
 * Adapt OpenClaw skill metadata to PHA format.
 * Transforms metadata.openclaw → metadata.pha namespace.
 */
function adaptOpenClawMetadata(content: string): string {
  // Replace openclaw namespace with pha
  let adapted = content.replace(/"openclaw"/g, '"pha"');

  // Rename OpenClaw-specific subdirectory references
  // openclaw uses instructions/ → PHA uses reference/
  adapted = adapted.replace(/instructions\//g, 'reference/');

  return adapted;
}

/**
 * Fetch skill content from a URL.
 * Supports:
 * - SkillsHub / ClawHub skill page URL
 * - GitHub raw file URL
 * - Direct SKILL.md URL
 */
async function fetchSkillFromUrl(url: string): Promise<{
  content: string;
  name: string;
  source: string;
} | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: 'text/plain, text/markdown, */*' },
    });
    if (!res.ok) {
      return null;
    }
    const content = await res.text();
    // Extract name from URL slug
    const urlParts = new URL(url).pathname.split('/').filter(Boolean);
    const name = urlParts[urlParts.length - 1]?.replace(/\.md$/, '') || 'unknown';
    return { content, name, source: url };
  } catch {
    return null;
  }
}

/**
 * Fetch skill from a GitHub repository.
 * Accepts: github.com/<owner>/<repo>/tree/main/skills/<name>
 * Or: github.com/<owner>/<repo>/blob/main/skills/<name>/SKILL.md
 */
async function fetchSkillFromGitHub(url: string): Promise<{
  content: string;
  name: string;
  files: Map<string, string>;
  source: string;
} | null> {
  const ghMatch = url.match(/github\.com\/([^/]+)\/([^/]+)\/(tree|blob)\/([^/]+)\/(.+)/);
  if (!ghMatch) {
    return null;
  }

  const [, owner, repo, , branch, pathPart] = ghMatch;
  const skillPath = pathPart.replace(/\/SKILL\.md$/, '');
  const name = basename(skillPath);

  // Fetch SKILL.md via raw.githubusercontent.com
  const rawBase = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${skillPath}`;
  const skillMdUrl = `${rawBase}/SKILL.md`;

  const res = await fetch(skillMdUrl);
  if (!res.ok) {
    return null;
  }

  const content = await res.text();
  const files = new Map<string, string>();
  files.set('SKILL.md', content);

  return { content, name, files, source: url };
}

/**
 * Install a skill from SkillsHub, ClawHub, GitHub, or any URL.
 */
export const installSkillFromUrlTool: PHATool<{
  source: string;
  name?: string;
  force?: boolean;
}> = {
  name: 'install_skill_from_url',
  description:
    '从 SkillsHub、GitHub 或其他来源安装技能。支持 GitHub 仓库 URL、ClawHub URL、或直接 SKILL.md URL。自动适配 OpenClaw 格式。',
  displayName: '安装外部技能',
  category: 'skill',
  icon: 'link',
  label: 'Install Skill from URL',
  inputSchema: {
    type: 'object',
    properties: {
      source: {
        type: 'string',
        description:
          'Skill source URL. Supports: GitHub repo URL (github.com/.../skills/name), raw SKILL.md URL, or skill registry URL',
      },
      name: {
        type: 'string',
        description: 'Override skill folder name (default: derived from URL slug)',
      },
      force: {
        type: 'boolean',
        description: 'Overwrite existing skill if it exists (default: false)',
      },
    },
    required: ['source'],
  },
  execute: async (args: { source: string; name?: string; force?: boolean }) => {
    const skillsDir = getSkillsDir();
    if (!existsSync(skillsDir)) {
      mkdirSync(skillsDir, { recursive: true });
    }

    const url = args.source.trim();

    // Try GitHub fetch first
    let result: {
      content: string;
      name: string;
      files?: Map<string, string>;
      source: string;
    } | null = null;

    if (url.includes('github.com')) {
      result = await fetchSkillFromGitHub(url);
    }

    // Fallback to direct URL fetch
    if (!result) {
      // If it's a ClawHub URL, try to resolve to raw content
      if (url.includes('clawhub.ai/skills/')) {
        const slug = url.split('/skills/')[1]?.split(/[?#]/)[0];
        if (slug) {
          const apiUrls = [
            `https://clawhub.ai/api/skills/${slug}/raw`,
            `https://clawhub.ai/api/skills/${slug}/download`,
          ];
          for (const apiUrl of apiUrls) {
            result = await fetchSkillFromUrl(apiUrl);
            if (result) {
              break;
            }
          }
          if (!result) {
            result = await fetchSkillFromUrl(url);
          }
        }
      } else {
        result = await fetchSkillFromUrl(url);
      }
    }

    if (!result) {
      return {
        success: false,
        error: `Failed to fetch skill from: ${url}`,
        hint: 'Supported sources: GitHub repo URL, raw SKILL.md URL, or skill registry URL',
      };
    }

    // Adapt OpenClaw format to PHA
    const adaptedContent = adaptOpenClawMetadata(result.content);

    // Determine skill name
    const skillName = args.name || result.name.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
    const skillDir = join(skillsDir, skillName);

    // Check if already exists
    if (existsSync(skillDir) && !args.force) {
      return {
        success: false,
        error: `Skill already exists: ${skillName}. Use force: true to overwrite.`,
      };
    }

    // Create skill directory
    mkdirSync(skillDir, { recursive: true });

    // Write SKILL.md
    const skillFile = join(skillDir, 'SKILL.md');
    writeFileSync(skillFile, adaptedContent, 'utf-8');

    // Write additional files if available
    if (result.files) {
      for (const [filePath, fileContent] of result.files) {
        if (filePath === 'SKILL.md') {
          continue;
        }
        const fullPath = join(skillDir, filePath);
        const parentDir = join(fullPath, '..');
        if (!existsSync(parentDir)) {
          mkdirSync(parentDir, { recursive: true });
        }
        writeFileSync(fullPath, fileContent, 'utf-8');
      }
    }

    // Git commit
    gitCommitFiles(skillDir, `Install skill: ${skillName}`);

    return {
      success: true,
      message: `Installed skill: ${skillName}`,
      path: skillDir,
      source: result.source,
      adapted: adaptedContent !== result.content,
    };
  },
};

/**
 * Search for skills on SkillsHub / ClawHub.
 */
export const searchSkillsHubTool: PHATool<{
  query: string;
  limit?: number;
}> = {
  name: 'search_skillshub',
  description: '在 SkillsHub 搜索社区技能。返回匹配的技能列表。',
  displayName: '搜索 SkillsHub',
  category: 'skill',
  icon: 'search',
  label: 'Search SkillsHub',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query (natural language or keywords)',
      },
      limit: {
        type: 'number',
        description: 'Maximum results to return (default: 10)',
      },
    },
    required: ['query'],
  },
  execute: async (args: { query: string; limit?: number }) => {
    const limit = args.limit || 10;

    // Try ClawHub API search (SkillsHub backend)
    const searchUrls = [
      `https://clawhub.ai/api/skills/search?q=${encodeURIComponent(args.query)}&limit=${limit}`,
      `https://clawhub.ai/api/search?q=${encodeURIComponent(args.query)}&limit=${limit}`,
    ];

    for (const searchUrl of searchUrls) {
      try {
        const res = await fetch(searchUrl, {
          headers: { Accept: 'application/json' },
        });
        if (res.ok) {
          const data = await res.json();
          const skills = Array.isArray(data)
            ? data
            : (data as Record<string, unknown>).skills || (data as Record<string, unknown>).results || [];
          return {
            success: true,
            skills: (skills as Array<Record<string, unknown>>).slice(0, limit).map((s) => ({
              name: s.name || s.slug || s.title,
              description: s.description || s.summary,
              url: s.url || `https://clawhub.ai/skills/${s.slug || s.name}`,
              author: s.author,
              version: s.version,
              tags: s.tags,
            })),
            count: (skills as unknown[]).length,
            source: 'skillshub',
          };
        }
      } catch {
        continue;
      }
    }

    // API not available — return guidance
    return {
      success: false,
      error: 'SkillsHub search is currently unavailable',
      hint: `Browse skills at https://clawhub.ai and use install_skill_from_url to install. Search query: "${args.query}"`,
      browseUrl: `https://clawhub.ai/?q=${encodeURIComponent(args.query)}`,
    };
  },
};

// Export all tools as array
export const skillsHubTools = [installSkillFromUrlTool, searchSkillsHubTool];
