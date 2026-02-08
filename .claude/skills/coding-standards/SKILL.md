---
name: coding-standards
description: Use when writing or reviewing code for the PHA project. Covers coding conventions, architecture rules, and common patterns.
---

# PHA Coding Standards

## Iron Rules (MUST follow)

1. **Frontend = Pure Renderer** — `ui/src/main.ts` only renders A2UI JSON. No business logic, no API calls, no data processing.
2. **UI = Agent Output** — All pages generated in `src/gateway/pages.ts`, not frontend.
3. **MCP is the only API** — Tools exposed via MCP protocol in `src/tools/`.
4. **No Emoji Icons** — Use icon names (`"heart"`, `"brain"`) in `icon` properties, never emoji (`"❤️"`).
5. **i18n Sync** — Every user-facing string uses `t()`. Changes require updating `types.ts` + `zh-CN.ts` + `en.ts`.
6. **Keep it Simple** — No premature abstractions. No over-engineering.

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
| Frontend renderer | `ui/src/main.ts` |
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
