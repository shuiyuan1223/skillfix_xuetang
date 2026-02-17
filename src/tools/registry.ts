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
import { createHealthTools } from "./health-data.js";
import { runWithUserUuid } from "../utils/config.js";

// Derive agent assignment from category
// PHA Agent: health/memory/profile/config/skill (面向用户的健康助手)
// System Agent: git/evolution/system/feedback/skill (面向开发者的系统进化)
const PHA_CATEGORIES = new Set<ToolCategory>([
  "health",
  "memory",
  "profile",
  "config",
  "skill",
  "presentation",
  "planning",
]);
const SA_CATEGORIES = new Set<ToolCategory>(["git", "evolution", "system", "feedback", "skill"]);

export function categoryToAgent(category: ToolCategory): string {
  const inPHA = PHA_CATEGORIES.has(category);
  const inSA = SA_CATEGORIES.has(category);
  if (inPHA && inSA) return "PHA / System";
  if (inPHA) return "PHA";
  if (inSA) return "System";
  return "PHA";
}

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

    return {
      name: tool.name,
      description: tool.description,
      label: tool.label || tool.displayName,
      parameters: schema,
      execute: async (
        _toolCallId: string,
        params: Record<string, unknown>
      ): Promise<AgentToolResult<unknown>> => {
        try {
          const result = await tool.execute(params as any);
          const text = JSON.stringify(result, null, 2);
          return {
            content: [{ type: "text" as const, text }],
            details: result,
          };
        } catch (error) {
          const text = `Error: ${error instanceof Error ? error.message : String(error)}`;
          return {
            content: [{ type: "text" as const, text }],
            details: text,
          };
        }
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
    agent: string;
    icon?: string;
    companionSkill?: string;
    inputSchema?: Record<string, unknown>;
  }> {
    return this.getAll().map((t) => ({
      name: t.name,
      displayName: t.displayName,
      description: t.description,
      category: t.category,
      agent: categoryToAgent(t.category),
      icon: t.icon,
      companionSkill: t.companionSkill,
      inputSchema: t.inputSchema,
    }));
  }

  // ===========================================================================
  // Per-session Data Source Binding
  // ===========================================================================

  withDataSource(dataSource: HealthDataSource): ToolRegistry {
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

  /**
   * Create a new registry where all tool executions run within a user UUID scope.
   * Tools calling getUserUuid() inside will get this UUID.
   */
  withUserUuid(uuid: string): ToolRegistry {
    const newRegistry = new ToolRegistry();
    for (const tool of this.getAll()) {
      newRegistry.register({
        ...tool,
        execute: (args: any) => runWithUserUuid(uuid, () => tool.execute(args)),
      });
    }
    return newRegistry;
  }
}
