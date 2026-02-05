# PHA Development Guide

PHA (Personal Health Agent) - AI 驱动的健康管理助手，基于 AgentOS 架构。

## 快速开始

```bash
# 1. 克隆并安装
git clone https://github.com/ibytechaos/pha.git
cd pha
bun install

# 2. 配置环境
cp .env.example .env
# 编辑 .env 填入 API Key

# 3. 构建运行
bun run build
pha start         # 启动服务 http://localhost:8000
pha tui           # 终端聊天界面
```

## 开发模式

```bash
# 终端 1: 启动 Gateway
pha start

# 终端 2: UI 热更新 (可选)
cd ui && bun run dev   # http://localhost:5173
```

## 项目结构

```
pha/
├── src/
│   ├── cli.ts                 # CLI 入口
│   ├── commands/              # CLI 命令
│   │   ├── start.ts           # pha start
│   │   ├── tui.ts             # pha tui (pi-tui)
│   │   └── ...
│   ├── gateway/               # Gateway 服务
│   │   ├── server.ts          # Bun HTTP/WebSocket
│   │   ├── pages.ts           # A2UI 页面生成器
│   │   └── a2ui.ts            # A2UI 组件定义
│   ├── agent/                 # Agent 核心
│   │   └── pha-agent.ts
│   ├── tools/                 # MCP 工具
│   │   └── health-data.ts
│   └── data-sources/          # 数据源
│       ├── interface.ts
│       └── mock.ts
├── ui/                        # Web UI (Lit Element)
│   └── src/main.ts            # A2UI 渲染器
├── dist/                      # 构建输出
└── package.json
```

## 常用开发任务

| 任务 | 文件 |
|------|------|
| 添加新页面 | `src/gateway/pages.ts` → `src/gateway/server.ts` |
| 添加 MCP 工具 | `src/tools/` |
| 修改 TUI | `src/commands/tui.ts` |
| 修改 Web UI 组件 | `ui/src/main.ts` |
| 修改 Agent 提示词 | `src/prompts/SOUL.md` |

## 多人协作 (Trunk Based)

### 工作流程

```
main ←── 直接推送小改动
     ←── PR (大功能/破坏性变更)
```

### 提交前检查 (自动)

```bash
# Husky 会在 commit 前自动运行:
bunx lint-staged  # ESLint + Prettier
```

### 手动检查

```bash
bun run check        # TypeScript 类型检查
bun run lint         # ESLint
bun run format:check # Prettier
bun run build        # 完整构建
```

### Commit 规范

```
feat: 新功能
fix: 修复
refactor: 重构
docs: 文档
chore: 杂项
```

### CI/CD

- 每次 push 到 main 自动运行: 类型检查 → Lint → 格式检查 → 构建
- PR 必须 CI 通过才能合并

---

## 架构原则

### AgentOS 核心理念

**前端是纯渲染器，所有 UI 由 Agent 通过 A2UI 协议生成。**

```
┌─────────────────────────────────────────────────────────┐
│                  Frontend (Web / TUI)                    │
│  - 纯渲染器，无业务逻辑                                   │
└────────────────────────┬────────────────────────────────┘
                         │ WebSocket (A2UI)
                         ▼
┌─────────────────────────────────────────────────────────┐
│                    Gateway Server                        │
│  - A2UI 页面生成                                         │
│  - WebSocket 会话管理                                    │
│  - MCP 工具调用                                          │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│                    PHA Agent                             │
│  - pi-agent-core                                         │
│  - 健康数据工具                                           │
└─────────────────────────────────────────────────────────┘
```

### A2UI 协议

```typescript
// 服务端生成
const page = generateChatPage({ messages });
send({ type: "page", surfaces: { sidebar, main: page } });

// 前端只渲染
handleMessage(msg) {
  if (msg.type === "page") {
    this.sidebarData = msg.surfaces.sidebar;
    this.mainData = msg.surfaces.main;
  }
}
```

### 新增页面流程

1. `src/gateway/pages.ts` - 添加 `generateXxxPage()`
2. `src/gateway/server.ts` - 在 `handleNavigate()` 添加 case
3. `src/gateway/pages.ts` - 在 `generateSidebar()` 添加导航项
4. **无需修改前端** (如果组件已支持)

---

## 军规 (Iron Rules)

1. **前端无业务逻辑** - 只接收 A2UI 消息并渲染
2. **UI 是 Agent 输出** - 不是前端产物
3. **MCP 是唯一 API** - 工具通过 MCP 暴露
4. **保持简单** - 避免过度设计

## API 端点

| 端点 | 说明 |
|------|------|
| `GET /health` | 健康检查 |
| `WS /ws` | A2UI WebSocket |
| `POST /mcp/tools/list` | 列出 MCP 工具 |
| `POST /mcp/tools/call` | 调用 MCP 工具 |
| `GET /api/health/*` | REST API (兼容) |

## 环境变量

```bash
# .env
ANTHROPIC_API_KEY=sk-ant-xxx  # 或其他 Provider
```
