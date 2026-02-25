---
name: coding-standards
description: Use when writing or reviewing code for the PHA project. Covers coding conventions, architecture rules, and common patterns.
---

# PHA Coding Standards

## Iron Rules (MUST follow)

### AgentOS 哲学
1. **Frontend = Pure Renderer** — `ui/src/` only renders A2UI JSON. No business logic, no API calls, no data processing.
2. **UI = Agent Output** — All pages generated in `src/gateway/pages.ts` via `A2UIGenerator`, not frontend.
3. **MCP is the only tool API** — Tools exposed via MCP protocol in `src/tools/`. Agent never calls internal functions directly.
4. **Tools = MCP, Knowledge = Skills** — Data operations → MCP Tool; Expert knowledge → Skill (`src/skills/*/SKILL.md`). Never use bare JSON config files as Skills.

### 生成式 UI 约束
5. **A2UI is the only UI protocol** — 4 Surfaces: `main`, `sidebar`, `modal`, `toast`. Each is a component tree `{ components[], root_id }`.
6. **Use A2UIGenerator** — `const ui = new A2UIGenerator("main")` → compose → `ui.build(rootId)`. Never hand-write JSON component trees.
7. **No Emoji Icons** — Use icon names (`"heart"`, `"brain"`) in `icon` properties, never emoji (`"❤️"`).
8. **i18n Sync** — Every user-facing string uses `t()`. Changes require updating `types.ts` + `zh-CN.ts` + `en.ts` simultaneously.
9. **Dual Frontend Sync** — Web (React `A2UIRenderer.tsx`) and TUI (`tui-renderer.ts`) consume same A2UI data. New component types need renderers in both.
10. **Tool Display Names** — New MCP tools must be added to `TOOL_DISPLAY_NAMES` in `ui/src/components/a2ui/A2UIRenderer.tsx` for Chinese display names.

### 通信协议约束
11. **Dual Channel** — Chat messages via SSE (`POST /api/ag-ui`), everything else via WebSocket (`/ws`). SSE sends AG-UI events (`RunStarted`/`TextMessageContent`/`ToolCallStart` etc.), WebSocket sends A2UI page updates.
12. **State Ownership** — Server (`GatewaySession`) is the single source of truth for chat history. Frontend maintains local chat state for SSE real-time rendering, but rebuilds from server A2UI on page refresh. Non-chat UI state is fully server-driven.
13. **Action Pattern** — User interactions: `{ type: "action", action: "handler_name", payload: {...} }`. Action strings must match `handleAction()` in `server.ts` exactly.
14. **Navigate Pattern** — Sidebar clicks: `{ type: "navigate", view: "view_id" }`. View IDs must match `handleNavigate()` cases exactly.

### 工程纪律
15. **Keep it Simple** — No premature abstractions. No over-engineering. Three similar lines > one premature abstraction.

## TypeScript Conventions

- **Runtime**: Bun
- **Build**: `tsc --outDir dist` (backend) + `vite build` (frontend)
- **Imports**: Use `.js` extension for local imports (ESM)
- **Type imports**: Use `import type` where possible
- **No `any`**: Except in `AgentTool<any>[]` array (variance workaround)
- **Formatting**: Prettier (auto via lint-staged)
- **Linting**: ESLint (auto via lint-staged)

## File Organization

| What | Where |
|------|-------|
| CLI commands | `src/commands/xxx.ts` |
| MCP tool definitions | `src/tools/xxx-tools.ts` |
| Git MCP tools | `src/tools/git-tools.ts` |
| AgentTool adapters | `src/agent/tools.ts`, `src/agent/git-agent-tools.ts` |
| A2UI page generators | `src/gateway/pages.ts`, `src/gateway/evolution-lab.ts` |
| Route/action handlers | `src/gateway/server.ts` |
| A2UI component types | `src/gateway/a2ui.ts` |
| Evolution system | `src/evolution/*.ts` |
| Agent Skills | `src/skills/*/SKILL.md` |
| Memory system | `src/memory/*.ts` |
| Translations | `src/locales/{types,zh-CN,en}.ts` |
| Frontend renderer | `ui/src/components/a2ui/A2UIRenderer.tsx` |
| Frontend icons | `ui/src/lib/icons.tsx` |
| Tests | `tests/unit/`, `tests/integration/` |
| Test fixtures | `tests/fixtures/` |

## Common Patterns

### Singleton Services

```typescript
import { getMemoryManager } from "../memory/index.js";
import { getDataSource } from "../tools/health-data.js";
import { getUserUuid } from "../utils/config.js";
```

### Git Operations

- **All git operations** should go through `src/evolution/version-manager.ts` or `src/tools/git-tools.ts`
- Use `gitCommitFiles(files, message)` for commits, not raw `execSync("git add && git commit")`
- Import from `"../evolution/version-manager.js"` for `gitCommitFiles`, `getProjectRoot`, etc.

### Error Handling

- Tools: Return `{ success: false, error: message }`, never throw
- Server: try/catch with `console.error`, send error to client
- Profile extraction: Best-effort, wrap in try/catch and ignore failures

### Session State in GatewaySession

- Add private fields to `GatewaySession` class for page-specific state
- Reset state when navigating away
- Pattern: `this.xxxField` for state, read in `handleNavigate`, write in `handleAction`
- SSE mode flags: `_sseMode` (chat active via SSE), `_chatLock` (prevents concurrent chat requests)

### SSE Chat Flow

```
Frontend POST /api/ag-ui → GatewaySession.handleChatSSE()
  → Agent processes message
  → SSE events stream back: RunStarted → TextMessageContent* → ToolCallStart/End → RunFinished
  → Frontend updates local chat state in real-time
```

## Commit Convention

```
feat: 新功能
fix: 修复
refactor: 重构
docs: 文档
chore: 杂项
```

## Pre-commit Checklist

```bash
bun run check        # TypeScript types
bun run lint         # ESLint
bun run format:check # Prettier
bun test             # Tests
bun run build        # Full build
```
