/**
 * Evolution Playground MCP Tools
 *
 * 6 tools for driving the Playground evolution lifecycle:
 * status, start_cycle, submit_proposal, apply_changes, run_validation, reset
 */

import type { PlaygroundState } from "../gateway/evolution-lab.js";

// ============================================================================
// Runtime callbacks (injected by server.ts)
// ============================================================================

export interface PlaygroundCallbacks {
  getState: () => PlaygroundState;
  startCycle: (profile: string) => Promise<void>;
  submitProposal: (proposal: {
    description: string;
    changes: Array<{ path: string; description: string }>;
    expectedImprovement: string;
  }) => void;
  applyChanges: (opts: { branch?: string; commitMessage?: string }) => Promise<{
    branch: string;
    commits: string[];
    filesChanged: Array<{ path: string; status: string }>;
  }>;
  runValidation: (profile?: string) => Promise<void>;
  reset: () => void;
}

let _callbacks: PlaygroundCallbacks | null = null;

export function setPlaygroundCallbacks(callbacks: PlaygroundCallbacks): void {
  _callbacks = callbacks;
}

function getCallbacks(): PlaygroundCallbacks {
  if (!_callbacks) {
    throw new Error("Playground not configured. Start the server first.");
  }
  return _callbacks;
}

// ============================================================================
// Tools
// ============================================================================

export const playgroundStatusTool = {
  name: "evo_playground_status",
  description: "Get the current Evolution Playground state including step, results, and log",
  parameters: {
    type: "object" as const,
    properties: {},
  },
  execute: async () => {
    const state = getCallbacks().getState();
    return {
      success: true,
      cycleId: state.cycleId,
      step: state.step,
      startedAt: state.startedAt,
      hasBenchmarkResult: !!state.benchmarkResult,
      hasDiagnoseResult: !!state.diagnoseResult,
      hasProposal: !!state.proposal,
      hasApproval: !!state.approval,
      hasApplyResult: !!state.applyResult,
      hasValidateResult: !!state.validateResult,
      logCount: state.log.length,
    };
  },
};

export const playgroundStartCycleTool = {
  name: "evo_playground_start_cycle",
  description: "Start a new evolution cycle in the Playground. Runs benchmark first.",
  parameters: {
    type: "object" as const,
    properties: {
      profile: {
        type: "string",
        description:
          "Benchmark profile: 'quick' (fast) or 'full' (comprehensive). Default: 'quick'",
      },
    },
  },
  execute: async (args?: { profile?: string }) => {
    const profile = args?.profile || "quick";
    await getCallbacks().startCycle(profile);
    return {
      success: true,
      message: `Evolution cycle started with profile: ${profile}`,
    };
  },
};

export const playgroundSubmitProposalTool = {
  name: "evo_playground_submit_proposal",
  description: "Submit an optimization proposal for the current evolution cycle",
  parameters: {
    type: "object" as const,
    properties: {
      description: {
        type: "string",
        description: "Description of what changes and why",
      },
      changes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            path: { type: "string", description: "File path to change" },
            description: {
              type: "string",
              description: "Description of the change",
            },
          },
          required: ["path", "description"],
        },
        description: "Array of file changes",
      },
      expectedImprovement: {
        type: "string",
        description: "Expected score improvement description",
      },
    },
    required: ["description", "changes", "expectedImprovement"],
  },
  execute: async (args: {
    description: string;
    changes: Array<{ path: string; description: string }>;
    expectedImprovement: string;
  }) => {
    getCallbacks().submitProposal(args);
    return {
      success: true,
      message: "Proposal submitted. Waiting for human approval.",
    };
  },
};

export const playgroundApplyChangesTool = {
  name: "evo_playground_apply_changes",
  description: "Apply the approved proposal changes. Creates a git branch and commits.",
  parameters: {
    type: "object" as const,
    properties: {
      branch: {
        type: "string",
        description: "Optional branch name. Auto-generated if not provided.",
      },
      commitMessage: {
        type: "string",
        description: "Optional commit message.",
      },
    },
  },
  execute: async (args?: { branch?: string; commitMessage?: string }) => {
    const result = await getCallbacks().applyChanges(args || {});
    return {
      success: true,
      branch: result.branch,
      commits: result.commits,
      filesChanged: result.filesChanged.length,
    };
  },
};

export const playgroundRunValidationTool = {
  name: "evo_playground_run_validation",
  description: "Run a validation benchmark to compare before/after scores",
  parameters: {
    type: "object" as const,
    properties: {
      profile: {
        type: "string",
        description: "Benchmark profile for validation. Default: same as initial run.",
      },
    },
  },
  execute: async (args?: { profile?: string }) => {
    await getCallbacks().runValidation(args?.profile);
    return {
      success: true,
      message: "Validation benchmark started.",
    };
  },
};

export const playgroundResetTool = {
  name: "evo_playground_reset",
  description: "Reset the Playground state to idle",
  parameters: {
    type: "object" as const,
    properties: {},
  },
  execute: async () => {
    getCallbacks().reset();
    return {
      success: true,
      message: "Playground reset to idle.",
    };
  },
};

// Export all tools as array
export const playgroundTools = [
  playgroundStatusTool,
  playgroundStartCycleTool,
  playgroundSubmitProposalTool,
  playgroundApplyChangesTool,
  playgroundRunValidationTool,
  playgroundResetTool,
];
