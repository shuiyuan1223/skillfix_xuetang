/**
 * Tool Registry
 *
 * Central registry for all PHA tools. Single source of truth.
 * Provides MCP dispatch, AgentTool derivation, display names, and prompt generation.
 */

import { Type } from "@sinclair/typebox";
import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import type { PHATool, ToolCategory, MCPToolResult } from "./types.js";
import type { HealthDataSource } from "../data-sources/interface.js";

export class ToolRegistry {
  private tools = new Map<string, PHATool<any>>();

  register(tool: PHATool<any>): void {
    this.tools.set(tool.name, tool);
  }

  registerAll(tools: PHATool<any>[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  get(name: string): PHATool<any> | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  getAll(): PHATool<any>[] {
    return Array.from(this.tools.values());
  }

  getByCategory(category: ToolCategory): PHATool<any>[] {
    return this.getAll().filter((t) => t.category === category);
  }

  // ===========================================================================
  // MCP Protocol Dispatch
  // ===========================================================================

  async callTool(name: string, args: Record<string, unknown>): Promise<MCPToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
        isError: true,
      };
    }

    try {
      const result = await tool.execute(args as any);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }

  listTools(): Array<{ name: string; description: string; inputSchema: unknown }> {
    return this.getAll().map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: {
        type: "object" as const,
        properties: tool.inputSchema.properties,
        required: tool.inputSchema.required,
      },
    }));
  }

  // ===========================================================================
  // Agent Integration (auto-derive AgentTools via Type.Unsafe)
  // ===========================================================================

  toAgentTools(): AgentTool<any>[] {
    return this.getAll().map((tool) => this.toAgentTool(tool));
  }

  toAgentToolsByCategories(categories: ToolCategory[]): AgentTool<any>[] {
    const set = new Set(categories);
    return this.getAll()
      .filter((t) => set.has(t.category))
      .map((t) => this.toAgentTool(t));
  }

  private toAgentTool(tool: PHATool<any>): AgentTool<any> {
    const schema = Type.Unsafe<Record<string, unknown>>(tool.inputSchema as any);
    const registry = this;

    return {
      name: tool.name,
      description: tool.description,
      label: tool.label || tool.displayName,
      parameters: schema,
      execute: async (
        _toolCallId: string,
        params: Record<string, unknown>
      ): Promise<AgentToolResult<unknown>> => {
        const result = await registry.callTool(tool.name, params);
        const text = result.content[0]?.text || "{}";
        let details: unknown;
        try {
          details = JSON.parse(text);
        } catch {
          details = text;
        }
        return {
          content: result.content.map((c) => ({ type: "text" as const, text: c.text })),
          details,
        };
      },
    };
  }

  // ===========================================================================
  // UI / Display
  // ===========================================================================

  getDisplayNames(): Record<string, string> {
    const map: Record<string, string> = {};
    for (const tool of this.getAll()) {
      map[tool.name] = tool.displayName;
    }
    return map;
  }

  getToolsPageData(): Array<{
    name: string;
    displayName: string;
    description: string;
    category: ToolCategory;
    icon?: string;
    companionSkill?: string;
  }> {
    return this.getAll().map((t) => ({
      name: t.name,
      displayName: t.displayName,
      description: t.description,
      category: t.category,
      icon: t.icon,
      companionSkill: t.companionSkill,
    }));
  }

  // ===========================================================================
  // System Prompt Generation (replaces hand-maintained TOOLS.md)
  // ===========================================================================

  generateToolsPrompt(categories?: ToolCategory[]): string {
    const tools = categories
      ? this.getAll().filter((t) => categories.includes(t.category))
      : this.getAll();

    // Group by category
    const grouped = new Map<ToolCategory, PHATool<any>[]>();
    for (const tool of tools) {
      const list = grouped.get(tool.category) || [];
      list.push(tool);
      grouped.set(tool.category, list);
    }

    const categoryLabels: Record<ToolCategory, string> = {
      health: "健康数据工具",
      memory: "记忆工具",
      skill: "技能工具",
      config: "配置工具",
      profile: "用户档案工具",
      git: "Git 工具",
      evolution: "进化系统工具",
      system: "系统记忆工具",
      feedback: "工具反馈",
    };

    const sections: string[] = ["# 工具清单\n"];

    for (const [category, categoryTools] of grouped) {
      sections.push(`## ${categoryLabels[category] || category}\n`);
      sections.push("| 工具 | 说明 |");
      sections.push("|---|---|");
      for (const tool of categoryTools) {
        // Use first sentence of description for the table
        const desc = tool.description.split(/\.\s/)[0].replace(/\.$/, "");
        sections.push(`| \`${tool.name}\` | ${desc} |`);
      }
      sections.push("");
    }

    return sections.join("\n");
  }

  // ===========================================================================
  // Per-session Data Source Binding
  // ===========================================================================

  withDataSource(dataSource: HealthDataSource): ToolRegistry {
    // Import createHealthTools lazily to avoid circular deps
    const { createHealthTools } = require("./health-data.js") as typeof import("./health-data.js");
    const boundTools = createHealthTools(dataSource);

    const newRegistry = new ToolRegistry();

    // Copy all tools, replacing sessionBound health tools with bound versions
    const boundToolMap = new Map<string, { execute: (args: any) => Promise<unknown> }>();
    for (const t of Object.values(boundTools)) {
      boundToolMap.set((t as any).name, t as any);
    }

    for (const tool of this.getAll()) {
      if (tool.sessionBound && boundToolMap.has(tool.name)) {
        const bound = boundToolMap.get(tool.name)!;
        newRegistry.register({ ...tool, execute: bound.execute });
      } else {
        newRegistry.register(tool);
      }
    }

    return newRegistry;
  }
}
