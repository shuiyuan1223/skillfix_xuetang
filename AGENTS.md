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

外部查询接口（边想边搜），支持两种鉴权模式，响应均为 SSE 流。

**Request — grant_type=refresh_token（默认，用户级 AT）**

```http
POST /api/query
Content-Type: application/json

{
  "grant_type": "refresh_token",  // 可省略，默认值
  "Authorization": "xxxxxx",      // 华为 OAuth refresh token（必填）
  "query": "我今天睡眠怎么样？",   // 用户问题（必填）
  "sn": "req-20260225-001"        // 请求序列号，用于日志追踪（可选）
}
```

**Request — grant_type=client_credentials（app-level AT，走内部接口）**

```http
POST /api/query
Content-Type: application/json

{
  "grant_type": "client_credentials",  // 必填
  "Authorization": "app-at-xxxxxx",    // App 级别 Access Token（必填）
  "uid": "100xxxxxx",                  // 华为用户 ID（必填）
  "client_id": "your-client-id",       // Client ID，用于 x-client-id 请求头（必填）
  "query": "我今天睡眠怎么样？",        // 用户问题（必填）
  "sn": "req-20260225-001"             // 请求序列号，用于日志追踪（可选）
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
data: {"event":"error","content":"Missing required fields: Authorization, query"}

data: {"event":"finish"}
```

**认证流程 — refresh_token 模式**

1. 用 `Authorization`（refresh token）调用华为 token refresh API，换取 `access_token`
2. 通过 `access_token` 调用 `getTokenInfo` 解析 Huawei userId
3. 将新 token 存入 UserStore，并确保用户数据目录存在
4. 复用或新建该用户的 `GatewaySession`，走边想边搜（`handleLegacyChatSSE`）流程
5. `x-client-id` 使用 `config.dataSources.huawei.clientId`

**认证流程 — client_credentials 模式**

1. `Authorization` 直接作为 app-level AT，`uid` 为华为用户 ID
2. 创建 inner API 模式的 `HuaweiHealthApi`：
   - 域名：`config.dataSources.huawei.innerApiBaseUrl`
   - 路径：`/healthkit-inner`（替换 `/healthkit`）
   - 请求头：`x-huid: {uid}`，`x-client-id: {client_id}`（来自请求体）
3. 确保用户数据目录存在，创建临时 `GatewaySession`（不缓存到 sessions map）

**实现位置**

- 路由：`src/gateway/server.ts` — `/api/query` handler
- 认证辅助：`src/data-sources/huawei/huawei-auth.ts` — `HuaweiAuth.refreshTokenAndGetUserId()`
- Inner API 工厂：`src/data-sources/huawei/huawei-api.ts` — `createInnerHuaweiHealthApiForUser()`
- Inner 数据源工厂：`src/data-sources/index.ts` — `createInnerDataSourceForUser()`
