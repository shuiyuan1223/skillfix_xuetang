# PHA Development Rules

## Project Overview

PHA (Personal Health Agent) is an AgentOS-based health management platform built with TypeScript.

## Architecture

- **Gateway**: Exposes A2UI, MCP, A2A protocols
- **Agent Core**: Built on pi-agent-core + pi-ai
- **Health Tools**: Domain-specific tools for health data
- **Data Sources**: Pluggable (Mock, Huawei Health, Apple HealthKit)

## Code Quality

- No `any` types unless absolutely necessary
- Use strict TypeScript
- All new code must have proper types

## Commands

- `npm run build` - Build all packages
- `npm run dev` - Start development mode
- `npm run check` - Lint and type check

## Packages

- `@pha/core` - Core library (agent, gateway, tools, evolution)
- `@pha/cli` - CLI + TUI interface
- `@pha/web` - Web UI

## Style

- Keep code concise
- No emojis in code or commits
- Use conventional commits (feat:, fix:, docs:, etc.)

## API Endpoints

### POST /api/query

外部查询接口（边想边搜），调用方直接传入 `refresh_token`，无需预先完成 OAuth 登录。

**Request**

```http
POST /api/query
Content-Type: application/json

{
  "refresh_token": "xxxxxx",   // 华为 OAuth refresh token（必填）
  "query": "我今天睡眠怎么样？",  // 用户问题（必填）
  "sn": "req-20260225-001"     // 请求序列号，用于日志追踪（可选）
}
```

**Response** — `text/event-stream` SSE 流

```
data: {"event":"search_mode","content":"search_with_think"}

data: {"event":"rag_status","content":"start_search"}

data: {"event":"data","content":"正在思考...","content_type":"reasoning"}

data: {"event":"data","content":"\n[searching: get_sleep]\n","content_type":"reasoning"}

data: {"event":"rag_status","content":"start_search"}

data: {"event":"data","content":"你今天的睡眠时长为7小时..."}

data: {"event":"finish"}
```

**Error Response** — 参数缺失或 token 无效时，同样以 SSE 流返回：

```
data: {"event":"error","content":"Missing required fields: refresh_token, query"}

data: {"event":"finish"}
```

**认证流程**

1. 用 `refresh_token` 调用华为 token refresh API，换取 `access_token`
2. 通过 `access_token` 调用 `getTokenInfo` 解析 Huawei userId
3. 将新 token 存入 UserStore，并确保用户数据目录存在
4. 复用或新建该用户的 `GatewaySession`，走边想边搜（`handleLegacyChatSSE`）流程

**实现位置**

- 路由：`src/gateway/server.ts` — `/api/query` handler
- 认证辅助：`src/data-sources/huawei/huawei-auth.ts` — `HuaweiAuth.refreshTokenAndGetUserId()`
