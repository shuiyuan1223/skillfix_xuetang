---
name: add-tool
description: Use when adding a new MCP tool that the Agent can call. Covers tool definition, AgentTool adapter, and SOUL.md registration.
---

# Add New MCP Tool to PHA

## Checklist

### 1. Define Tool

- [ ] Create or edit file in `src/tools/xxx-tools.ts`
- [ ] Follow the pattern from `src/tools/health-data.ts`:

```typescript
export const myTool = {
  name: "tool_name",
  description: "中文描述：工具做什么、什么时候调用。",
  parameters: {
    type: "object" as const,
    properties: {
      param1: { type: "string", description: "参数说明" },
    },
    required: ["param1"],
  },
  execute: async (args: { param1: string }) => {
    // Implementation
    return { success: true, data: result };
  },
};
```

### 2. Create AgentTool Adapter

- [ ] For health/memory tools: `src/agent/tools.ts`
- [ ] For git tools: `src/agent/git-agent-tools.ts`
- [ ] Add TypeBox schema:
  ```typescript
  const MyToolSchema = Type.Object({
    param1: Type.String({ description: "..." }),
  });
  ```
- [ ] Create AgentTool wrapper (follow `healthDataAgentTool` pattern)
- [ ] Add to `healthAgentTools` array (in `tools.ts`) or `gitAgentTools` array (in `git-agent-tools.ts`)

### 3. Update SOUL.md

- [ ] `src/memory/soul.ts` — In `DEFAULT_SOUL`, under "工具使用" section, add:
  ```
  - tool_name: 工具的简短说明
  ```

### 4. Frontend Tool Display Name

- [ ] `ui/src/components/a2ui/A2UIRenderer.tsx` — In `TOOL_DISPLAY_NAMES`, add Chinese name:
  ```typescript
  const TOOL_DISPLAY_NAMES: Record<string, string> = {
    // ... existing tools
    tool_name: "工具中文名",
  };
  ```
  This label is shown in the chat UI when the Agent calls the tool during SSE streaming.

### 5. Chat Event Labels (optional)

- [ ] `src/gateway/server.ts` — In `handleAgentEvent()`, add label to `memoryToolLabels` or similar:
  ```typescript
  tool_name: "icon 执行描述...",
  ```

### 6. Verify

```bash
bun run check && bun test && bun run build
```

## SSE Tool Call Event Flow

When the Agent calls a tool during chat, the SSE stream sends these events in order:

```
ToolCallStart   → { toolCallId, toolCallName, ... }
                   Frontend shows "正在调用 [TOOL_DISPLAY_NAMES[name]]..."
ToolCallEnd     → { toolCallId }
ToolCallResult  → { toolCallId, result }
                   Frontend hides loading indicator
```

The frontend renders tool calls inline in the chat message using `TOOL_DISPLAY_NAMES` for user-friendly labels. Tools not in the mapping show the raw tool name.

## Key Patterns

- Tools get user UUID via `getUserUuid()` from `src/utils/config.ts`
- Memory operations via `getMemoryManager()` singleton
- Health data via `getDataSource()` singleton
- Tool `execute` must return JSON-serializable result
- Tool errors: Return `{ success: false, error: message }`, never throw
