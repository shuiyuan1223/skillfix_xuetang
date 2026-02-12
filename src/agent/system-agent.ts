/**
 * System Agent
 *
 * Factory function for the SystemAgent — a second Agent instance dedicated
 * to evolution tasks. Uses git tools, benchmark/diagnose tools, and claude_code
 * instead of health data tools.
 */

import { createPHAAgent, type PHAAgent, type PHAAgentConfig } from "./pha-agent.js";
import { gitAgentTools } from "./git-agent-tools.js";
import { claudeCodeAgentTool } from "./claude-code-tool.js";
import { getSkillAgentTool } from "./tools.js";
import { MockDataSource } from "../data-sources/mock.js";

export interface SystemAgentConfig {
  apiKey?: string;
  provider?: PHAAgentConfig["provider"];
  modelId?: string;
  baseUrl?: string;
}

/**
 * Create a SystemAgent instance with evolution-specific tools.
 * Uses MockDataSource (no real health data needed) and includes
 * git tools, benchmark/diagnose, claude_code, and skill tools.
 */
export async function createSystemAgent(config: SystemAgentConfig): Promise<PHAAgent> {
  const tools = [
    ...gitAgentTools, // 12 git tools + run_benchmark + run_diagnose
    claudeCodeAgentTool, // claude_code
    getSkillAgentTool, // get_skill (for reading skill content)
  ];

  return createPHAAgent({
    ...config,
    dataSource: new MockDataSource(),
    tools,
  });
}
