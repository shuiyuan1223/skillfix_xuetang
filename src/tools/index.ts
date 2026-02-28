/**
 * Tool System — Single Source of Truth
 *
 * All PHA tools are registered in the globalRegistry.
 * Adding a new tool only requires defining it in src/tools/*.ts
 * and adding it to the registerAll() call below.
 */

import { ToolRegistry } from './registry.js';
import { healthTools } from './health-data.js';
import { gitTools } from './git-tools.js';
import { evolutionTools } from './evolution-tools.js';
import { configTools } from './config-tools.js';
import { memoryTools } from './memory-tools.js';
import { skillTools } from './skill-tools.js';
import { systemMemoryTools } from './system-memory-tools.js';
import { profileTools } from './profile-tools.js';
import { toolFeedbackTools } from './tool-feedback.js';
import { skillsHubTools } from './skillshub-tools.js';
import { presentationTools } from './presentation-tools.js';
import { planTools } from './plan-tools.js';
import { proactiveTools } from './proactive-tools.js';
import { weatherTools } from './weather-tool.js';
import { dashboardTools } from './dashboard-tools.js';
import { incidentTools } from './incident-tools.js';
import { llmLogTools } from './llm-log-tools.js';

// ===========================================================================
// Global Registry — single source of truth for all tools
// ===========================================================================

export const globalRegistry = new ToolRegistry();
globalRegistry.registerAll([
  ...healthTools,
  ...gitTools,
  ...evolutionTools,
  ...incidentTools,
  ...llmLogTools,
  ...configTools,
  ...memoryTools,
  ...skillTools,
  ...systemMemoryTools,
  ...profileTools,
  ...toolFeedbackTools,
  ...skillsHubTools,
  ...presentationTools,
  ...planTools,
  ...proactiveTools,
  ...weatherTools,
  ...dashboardTools,
]);

// ===========================================================================
// Re-exports for backward compatibility
// ===========================================================================

export * from './health-data.js';
export * from './prompt-tools.js';
export * from './skill-tools.js';
export * from './evolution-tools.js';
export * from './git-tools.js';
export * from './config-tools.js';
export * from './memory-tools.js';
export * from './system-memory-tools.js';
export * from './profile-tools.js';
export * from './tool-feedback.js';
export * from './skillshub-tools.js';
export * from './presentation-tools.js';
export * from './plan-tools.js';
export * from './proactive-tools.js';
export * from './weather-tool.js';
export * from './dashboard-tools.js';
export * from './dashboard-types.js';
export * from './incident-tools.js';
export * from './llm-log-tools.js';
export * from './types.js';
export { ToolRegistry, categoryToAgent, categoryToAgentTags } from './registry.js';
