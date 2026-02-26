/**
 * A2A (Agent-to-Agent) Protocol
 *
 * Implements Google's A2A protocol for agent discovery and task management.
 * - GET /.well-known/agent.json → Agent Card
 * - POST /api/a2a → JSON-RPC 2.0 task management
 */

import { createLogger } from "../utils/logger.js";

const log = createLogger("A2A");

// ---------------------------------------------------------------------------
// Agent Card
// ---------------------------------------------------------------------------

export interface AgentCard {
  name: string;
  description: string;
  url: string;
  version: string;
  capabilities: {
    streaming: boolean;
    pushNotifications: boolean;
    stateTransitionHistory: boolean;
  };
  defaultInputModes: string[];
  defaultOutputModes: string[];
  skills: Array<{
    id: string;
    name: string;
    description: string;
    inputModes: string[];
    outputModes: string[];
  }>;
}

export function generateAgentCard(port: number, basePath = ""): AgentCard {
  return {
    name: "PHA - Personal Health Agent",
    description:
      "AI-driven personal health management assistant. Analyzes health data (steps, heart rate, sleep, workouts) and provides evidence-based coaching.",
    url: `http://localhost:${port}${basePath}`,
    version: "1.0.0",
    capabilities: {
      streaming: true,
      pushNotifications: false,
      stateTransitionHistory: true,
    },
    defaultInputModes: ["text/plain"],
    defaultOutputModes: ["text/plain"],
    skills: [
      {
        id: "health-analysis",
        name: "Health Data Analysis",
        description:
          "Analyze health metrics including steps, heart rate, sleep quality, and workout data",
        inputModes: ["text/plain"],
        outputModes: ["text/plain"],
      },
      {
        id: "sleep-coaching",
        name: "Sleep Coaching",
        description: "Provide personalized sleep improvement recommendations based on sleep data",
        inputModes: ["text/plain"],
        outputModes: ["text/plain"],
      },
      {
        id: "fitness-guidance",
        name: "Fitness Guidance",
        description: "Provide exercise and activity recommendations based on current fitness data",
        inputModes: ["text/plain"],
        outputModes: ["text/plain"],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Task Management
// ---------------------------------------------------------------------------

export type TaskState =
  | "submitted"
  | "working"
  | "input-required"
  | "completed"
  | "canceled"
  | "failed";

export interface A2ATask {
  id: string;
  state: TaskState;
  messages: Array<{
    role: "user" | "agent";
    parts: Array<{ type: "text"; text: string }>;
  }>;
  createdAt: number;
  updatedAt: number;
}

interface A2ATaskManager {
  tasks: Map<string, A2ATask>;
  abortControllers: Map<string, AbortController>;
}

const manager: A2ATaskManager = {
  tasks: new Map(),
  abortControllers: new Map(),
};

// JSON-RPC 2.0 types
interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

type TaskExecutor = (taskId: string, message: string) => Promise<string>;

function makeRpcError(id: string | number | null, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function makeRpcResult(id: string | number | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

function taskResult(task: A2ATask): {
  id: string;
  state: TaskState;
  messages: A2ATask["messages"];
} {
  return { id: task.id, state: task.state, messages: task.messages };
}

function findTask(
  id: string | number | null,
  taskId: string | undefined
): JsonRpcResponse | A2ATask {
  if (!taskId) {
    return makeRpcError(id, -32602, "Missing task id");
  }
  const task = manager.tasks.get(taskId);
  if (!task) {
    return makeRpcError(id, -32602, `Task not found: ${taskId}`);
  }
  return task;
}

async function handleTasksSend(
  id: string | number | null,
  params: Record<string, unknown> | undefined,
  executeTask: TaskExecutor
): Promise<JsonRpcResponse> {
  const p = params as
    | { id?: string; message?: { role: string; parts: Array<{ type: string; text?: string }> } }
    | undefined;

  if (!p?.message?.parts?.length) {
    return makeRpcError(id, -32602, "Missing message");
  }

  const taskId = p.id || crypto.randomUUID();
  const textPart = p.message.parts.find((pt) => pt.type === "text");
  const userMessage = textPart?.text || "";

  if (!userMessage) {
    return makeRpcError(id, -32602, "Empty message text");
  }

  let task = manager.tasks.get(taskId);
  if (!task) {
    task = {
      id: taskId,
      state: "submitted",
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    manager.tasks.set(taskId, task);
  }

  task.messages.push({ role: "user", parts: [{ type: "text", text: userMessage }] });
  task.state = "working";
  task.updatedAt = Date.now();

  try {
    const response = await executeTask(taskId, userMessage);
    task.messages.push({ role: "agent", parts: [{ type: "text", text: response }] });
    task.state = "completed";
  } catch (error) {
    task.state = "failed";
    task.messages.push({
      role: "agent",
      parts: [
        { type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` },
      ],
    });
  }
  task.updatedAt = Date.now();

  return makeRpcResult(id, taskResult(task));
}

function handleTasksGet(
  id: string | number | null,
  params: Record<string, unknown> | undefined
): JsonRpcResponse {
  const p = params as { id?: string } | undefined;
  const result = findTask(id, p?.id);
  if ("jsonrpc" in result) {
    return result;
  }
  return makeRpcResult(id, taskResult(result));
}

function handleTasksCancel(
  id: string | number | null,
  params: Record<string, unknown> | undefined
): JsonRpcResponse {
  const p = params as { id?: string } | undefined;
  const result = findTask(id, p?.id);
  if ("jsonrpc" in result) {
    return result;
  }

  const controller = manager.abortControllers.get(result.id);
  if (controller) {
    controller.abort();
    manager.abortControllers.delete(result.id);
  }

  result.state = "canceled";
  result.updatedAt = Date.now();

  return makeRpcResult(id, taskResult(result));
}

/**
 * Handle A2A JSON-RPC 2.0 request.
 *
 * @param body - The parsed JSON-RPC request
 * @param executeTask - Callback to execute a task (runs agent chat).
 *   Receives (taskId, userMessage) and should return the agent's response text.
 */
export async function handleA2ARequest(
  body: unknown,
  executeTask: TaskExecutor
): Promise<JsonRpcResponse> {
  const req = body as JsonRpcRequest;

  if (!req.jsonrpc || req.jsonrpc !== "2.0" || !req.method) {
    return makeRpcError(req?.id ?? null, -32600, "Invalid Request");
  }

  const id = req.id ?? null;

  try {
    switch (req.method) {
      case "tasks/send":
        return await handleTasksSend(id, req.params, executeTask);
      case "tasks/get":
        return handleTasksGet(id, req.params);
      case "tasks/cancel":
        return handleTasksCancel(id, req.params);
      default:
        return makeRpcError(id, -32601, `Method not found: ${req.method}`);
    }
  } catch (error) {
    log.error("A2A request failed", { method: req.method, error });
    return makeRpcError(id, -32603, error instanceof Error ? error.message : String(error));
  }
}
