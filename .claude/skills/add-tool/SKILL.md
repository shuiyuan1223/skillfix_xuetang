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

- [ ] `src/agent/tools.ts` — Add TypeBox schema:
  ```typescript
  const MyToolSchema = Type.Object({
    param1: Type.String({ description: "..." }),
  });
  ```
- [ ] Create AgentTool wrapper (follow `healthDataAgentTool` pattern)
- [ ] Add to `healthAgentTools` array at bottom of file

### 3. Update SOUL.md

- [ ] `src/memory/soul.ts` — In `DEFAULT_SOUL`, under "工具使用" section, add:
  ```
  - tool_name: 工具的简短说明
  ```

### 4. Chat Event Labels (optional)

- [ ] `src/gateway/server.ts` — In `handleAgentEvent()`, add label to `memoryToolLabels` or similar:
  ```typescript
  tool_name: "icon 执行描述...",
  ```

### 5. Verify

```bash
bun run check && bun test && bun run build
```

## Key Patterns

- Tools get user UUID via `getUserUuid()` from `src/utils/config.ts`
- Memory operations via `getMemoryManager()` singleton
- Health data via `getDataSource()` singleton
- Tool `execute` must return JSON-serializable result
