# PHA Development Guide

PHA (Personal Health Agent) - AI 驱动的健康管理助手，基于 AgentOS 架构。

## 快速开始

```bash
# 1. 克隆并安装
git clone https://github.com/ibytechaos/pha.git
cd pha
bun install

# 2. 首次配置（交互式引导，生成 .pha/config.json）
pha onboard

# 3. 构建运行
bun run build
pha start         # 启动服务 http://localhost:8000
pha tui           # 终端聊天界面
```

## 运行时配置 (.pha/)

所有运行时状态存放在项目根目录的 `.pha/` 目录下（已 gitignore）：

```
.pha/
├── config.json              # 全局配置（LLM provider、API Key、端口等）
├── gateway.pid              # Gateway 进程 PID
├── gateway.log              # Gateway 运行日志
│
├── db/                      # 所有 SQLite 数据库集中
│   ├── evolution.db         # Benchmark/Evolution 数据
│   └── oauth.db             # OAuth Token（多用户）
│
├── users/                   # 用户数据（统一入口）
│   ├── {userId}/            # 真实用户（华为 ID）
│   │   ├── USER.md
│   │   ├── MEMORY.md
│   │   ├── BOOTSTRAP.md
│   │   ├── SOUL.md          # 可选：per-user SOUL 覆盖（存在时优先于全局）
│   │   ├── memory/          # 每日记忆日志
│   │   ├── sessions/        # 会话记录
│   │   ├── memory-index.db  # 向量搜索索引
│   │   └── api-cache/       # 华为 API 响应缓存（per-user）
│   ├── benchmark-*/         # Benchmark 测试用户（运行时生成）
│   └── system/              # 系统 Agent
│       ├── USER.md
│       ├── MEMORY.md
│       └── BOOTSTRAP.md
│
├── benchmark/               # Benchmark 导出结果
│   └── runs/{run_id}/
│
└── llm-logs/                # LLM 调用日志（每日 JSONL，自动清理 30 天前）
    └── llm-YYYY-MM-DD.jsonl
```

### config.json 结构

```jsonc
{
  "gateway": { "port": 8000 },
  "llm": {
    "provider": "openrouter",     // 支持: anthropic, openrouter, openai
    "apiKey": "sk-or-v1-xxx",     // API Key（优先级高于环境变量）
    "baseUrl": "https://openrouter.ai/api/v1",
    "modelId": "anthropic/claude-opus-4.6"
  },
  "dataSources": { "type": "huawei" },
  "embedding": { "enabled": true, "model": "openai/text-embedding-3-small" },
  "agents": {                     // Agent 配置化（可选，有内置默认值）
    "pha": {                      // 主聊天 agent
      "tools": { "categories": ["health","memory","profile","config","skill","presentation","planning","proactive"] },
      "context": { "health": true, "weather": true, "bootstrap": true }
    },
    "pha4old": {                  // 边想边搜 agent
      "skills": { "excludeTypes": ["system"] },
      "skillHint": "legacy-streaming"
    }
  }
}
```

配置加载逻辑（`src/utils/config.ts`）：
1. `findProjectRoot()` — 沿目录树向上查找 `package.json` 定位项目根
2. 读取 `<projectRoot>/.pha/config.json`
3. 与 `DEFAULT_CONFIG` 浅合并
4. API Key 优先级：`config.llm.apiKey` > 环境变量（`ANTHROPIC_API_KEY` 等）

## PHA CLI 命令

```bash
# 服务管理
pha start           # 后台启动 Gateway（默认 http://localhost:8000）
pha start -f        # 前台启动（调试用，日志直接输出到终端）
pha stop            # 停止服务
pha restart         # 重启服务（开发完成后验证改动用）
pha status          # 查看服务状态
pha logs -f         # 实时查看日志

# 其他
pha tui             # 终端聊天界面
pha onboard         # 首次配置引导
```

### 开发调试流程

```bash
# 标准开发流程
bun run build       # 构建（TypeScript → dist/ + Vite → ui/dist/）
bun test            # 运行测试
pha restart         # 重启 Gateway 加载新代码
# 浏览器访问 http://localhost:8000 验证

# 查看运行日志排查问题
pha logs -f

# UI 热更新开发（可选，仅前端改动时用）
cd ui && bun run dev   # http://localhost:5173（连接同一个 Gateway）
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
│   │   ├── server.ts          # Bun HTTP+SSE server
│   │   ├── sse-manager.ts     # SSE 连接管理器
│   │   ├── mcp-server.ts      # MCP Streamable HTTP (JSON-RPC 2.0)
│   │   ├── a2a.ts             # A2A Agent Card + 任务管理
│   │   ├── pages.ts           # A2UI 页面生成器
│   │   ├── evolution-lab.ts   # Evolution Lab 5-Tab Dashboard
│   │   ├── tui-renderer.ts    # A2UI → TUI 文本渲染引擎
│   │   └── a2ui.ts            # A2UI 组件定义
│   ├── agent/                 # Agent 核心
│   │   ├── pha-agent.ts
│   │   ├── tools.ts           # AgentTool 适配器
│   │   ├── git-agent-tools.ts # Git 工具适配器
│   │   └── skill-trigger.ts   # Skill 自动触发
│   ├── tools/                 # MCP 工具
│   │   ├── health-data.ts     # 健康数据工具
│   │   ├── git-tools.ts       # Git 操作工具 (12个)
│   │   ├── prompt-tools.ts    # 提示词管理工具
│   │   ├── skill-tools.ts     # 技能管理工具
│   │   └── evolution-tools.ts # 进化系统工具
│   ├── evolution/             # 进化系统
│   │   ├── version-manager.ts # Git worktree + 分支管理
│   │   ├── benchmark-runner.ts
│   │   └── auto-loop.ts
│   ├── skills/                # Agent Skills (SKILL.md)
│   │   ├── evolution-driver/  # 自我进化方法论
│   │   ├── sleep-coach/       # 睡眠教练
│   │   └── ...
│   └── data-sources/          # 数据源
│       ├── interface.ts
│       └── mock.ts
├── ui/                        # Web UI (React)
│   └── src/
│       ├── App.tsx            # 主应用 (HTTP + SSE)
│       └── components/a2ui/
│           └── A2UIRenderer.tsx  # A2UI 组件渲染器
├── dist/                      # 构建输出
└── package.json
```

## 常用开发任务

| 任务 | 文件 |
|------|------|
| 添加新页面 | `src/gateway/pages.ts` → `server.ts` handleNavigate + generateSidebar |
| 添加 MCP 工具 | `src/tools/` → `src/agent/tools.ts` → `A2UIRenderer.tsx` TOOL_DISPLAY_NAMES |
| 添加 Agent Skill | `src/skills/*/SKILL.md` (YAML frontmatter + Markdown body) |
| 修改聊天流 | `server.ts` handleAgentEvent + `App.tsx` handleAGUIEvent |
| 修改 Web UI 组件 | `ui/src/components/a2ui/A2UIRenderer.tsx` + `ui/src/lib/icons.tsx` |
| 修改 TUI 渲染 | `src/gateway/tui-renderer.ts` |
| 修改 Evolution Lab | `src/gateway/evolution-lab.ts` |
| 修改 Agent 提示词 | `src/memory/soul.ts` DEFAULT_SOUL |

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
bun run test         # 运行测试
bun run build        # 完整构建
```

---

## 测试

### 测试命令

```bash
bun test              # 运行所有测试
bun test:watch        # 监听模式
bun test:coverage     # 覆盖率报告
bun test:unit         # 仅单元测试
bun test:integration  # 仅集成测试
```

### 测试结构

```
tests/
├── setup.ts              # 全局测试配置
├── unit/                 # 单元测试
│   ├── huawei-types.test.ts
│   ├── huawei-api-parsing.test.ts
│   ├── huawei-data-source.test.ts
│   ├── user-store.test.ts
│   ├── api-cache.test.ts
│   ├── config.test.ts
│   └── pages.test.ts
├── integration/          # 集成测试
│   └── oauth-flow.test.ts
└── fixtures/             # 测试数据
    └── huawei-api/
        ├── heart-rate-response.json
        ├── steps-response.json
        ├── sleep-response.json
        └── empty-response.json
```

### 测试策略

| 测试类型 | 覆盖范围 | 文件位置 |
|---------|---------|---------|
| 单元测试 | 纯函数、数据转换 | `tests/unit/` |
| 集成测试 | 模块协作、Token 流程 | `tests/integration/` |
| 契约测试 | API 响应结构 | fixtures + 解析测试 |

### 添加新测试

1. **单元测试**: 测试纯函数和数据转换
   ```typescript
   // tests/unit/xxx.test.ts
   import { describe, test, expect } from "bun:test";

   describe("functionName", () => {
     test("describes behavior", () => {
       expect(actual).toBe(expected);
     });
   });
   ```

2. **使用 fixture**: 从 `.pha/api-cache/` 提取真实响应
   ```typescript
   import response from "../fixtures/huawei-api/xxx.json";
   ```

3. **隔离测试**: 使用内存数据库
   ```typescript
   const store = new UserStore(":memory:");
   ```

### 测试覆盖优先级

1. **必须测试**: 数据转换、Token 逻辑、API 解析
2. **建议测试**: 页面生成器、配置管理
3. **可选测试**: CLI 命令、UI 渲染

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

**一切工具 MCP 化，一切能力 Skills 化。**

#### MCP 与 Skills 的关系

| | MCP Tools | Skills |
|---|-----------|--------|
| **定位** | 服务端工具 | 客户端能力接入 |
| **作用** | 数据获取、操作执行 | 专家知识、评估框架、行为指导 |
| **存储** | `src/tools/` (代码) | `src/skills/*/SKILL.md` (文件系统) |
| **管理** | 代码级别修改 | UI 可视化编辑 (Settings > Skills) |
| **协议** | JSON-RPC (MCP 标准) | YAML frontmatter + Markdown |
| **示例** | `get_heart_rate`, `get_sleep` | `sleep-coach`, `benchmark-evaluator` |

**设计原则**: MCP 是底层原子能力（获取数据、执行操作），Skills 是上层组合能力（如何解读数据、如何评估质量）。任何接入 PHA 系统的新能力，都应该先确认是 MCP Tool 还是 Skill：

- **需要调用 API / 读写数据？** → MCP Tool (`src/tools/`)
- **需要专家判断 / 评分框架 / 行为指导？** → Skill (`src/skills/`)
- **两者都需要？** → MCP Tool 提供数据，Skill 提供解读框架

```
┌─────────────────────────────────────────────────────────┐
│                  Frontend (Web / TUI)                    │
│  - 纯渲染器，无业务逻辑                                   │
│  - Web: React A2UIRenderer / TUI: tui-renderer           │
└────────────┬───────────────────────┬────────────────────┘
             │ HTTP+SSE /api/a2ui/*   │ POST /api/ag-ui (SSE)
             │ (A2UI 页面/导航/弹窗)    │ (AG-UI 聊天事件流)
             ▼                        ▼
┌─────────────────────────────────────────────────────────┐
│                    Gateway Server                        │
│  - A2UI 页面生成 (pages.ts)                              │
│  - HTTP+SSE 统一传输 (无 WebSocket)                      │
│  - MCP JSON-RPC + A2A 协议                               │
│  - GatewaySession 管理聊天状态                            │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│                    PHA Agent                             │
│  - pi-agent-core                                         │
│  - MCP Tools = 手 (做事)    Skills = 脑 (判断)            │
└─────────────────────────────────────────────────────────┘
```

#### Skills 系统

Skills 存放在 `src/skills/<name>/SKILL.md`，遵循 OpenClaw 格式：

```yaml
---
name: skill-name
description: "..."
metadata:
  { "pha": { "emoji": "...", "triggers": [...], "config": {...} } }
---
# Skill Body (Markdown)
```

- **自动触发**: 用户消息匹配 triggers 后自动注入 skill guide
- **手动加载**: Agent 通过 `get_skill` 工具按需获取
- **UI 管理**: Settings > Skills 页面可编辑、启用/禁用
- **Git 追踪**: 每次修改自动 git commit

**重要**: 新增系统能力时，优先考虑 Skills 化。例如：
- 评测框架 → `benchmark-evaluator` Skill（非 JSON 配置文件）
- 健康解读 → `sleep-coach`, `heart-monitor` 等 Skills
- 未来: 通知策略、数据异常检测规则等都应该是 Skills

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

### 双形态架构 (Web + TUI)

PHA 支持两种前端形态，共享同一个 Gateway 和 A2UI 协议：

| | Web UI | TUI |
|---|--------|-----|
| 框架 | React | pi-tui |
| 入口 | `ui/src/App.tsx` | `src/commands/tui.ts` |
| 渲染器 | `A2UIRenderer.tsx` | `tui-renderer.ts` |
| 连接 | HTTP+SSE `/api/a2ui/*` + SSE `/api/ag-ui` | HTTP+SSE `/api/a2ui/*` |
| 导航 | 侧边栏点击 | 斜杠命令 (`/dashboard`, `/health` 等) |
| 交互 | 按钮点击 → action 消息 | 编号选择 → action 消息 |

核心文件：
- `ui/src/components/a2ui/A2UIRenderer.tsx` — A2UI → React 组件渲染器
- `src/commands/tui.ts` — TUI 入口和主循环
- `src/gateway/tui-renderer.ts` — A2UI → pi-tui 组件转换层

新增页面时 **无需额外 TUI 代码** — 只要 A2UI 组件已有 TUI 映射，TUI 自动获得新页面。

### 新增页面流程

1. `src/gateway/pages.ts` - 添加 `generateXxxPage()`
2. `src/gateway/server.ts` - 在 `handleNavigate()` 添加 case
3. `src/gateway/pages.ts` - 在 `generateSidebar()` 添加导航项
4. **无需修改前端** (如果组件已支持)

---

## 军规 (Iron Rules)

### A. AgentOS 哲学 (规则 1-4)

1. **前端无业务逻辑** — Web UI 和 TUI 只接收 A2UI 消息并渲染。禁止在 `ui/` 目录中添加数据获取、状态计算、API 调用等业务代码
2. **UI 是 Agent 输出** — 所有页面由 `src/gateway/pages.ts` 通过 `A2UIGenerator` 生成，不是前端产物。前端代码只做组件→DOM 的映射
3. **MCP 是唯一工具 API** — Agent 的所有能力通过 MCP Tools 暴露（`src/tools/`）。禁止 Agent 直接调用内部函数或 REST API
4. **一切工具 MCP 化，一切能力 Skills 化** — 数据操作 → MCP Tool；专家知识/评估框架/行为指导 → Skill（`src/skills/*/SKILL.md`）。**禁止**用裸 JSON 配置文件替代 Skill

### B. 生成式 UI 约束 (规则 5-10)

5. **A2UI 是唯一 UI 协议** — 所有 UI 通过 4 个 Surface 传递：`main`（主内容）、`sidebar`（侧边栏）、`modal`（弹窗）、`toast`（通知）。每个 Surface 是一棵组件树 `{ components[], root_id }`
6. **组件树模式** — 页面生成器必须使用 `A2UIGenerator` 构建组件树：`const ui = new A2UIGenerator("main")` → 组合子组件 → `ui.build(rootId)` 返回 `A2UISurfaceData`。禁止手写 JSON 组件树
7. **禁止 Emoji 做图标** — A2UI `icon` 属性必须使用 icon name（如 `"heart"`, `"brain"`），**禁止**使用 emoji。可用图标见下方列表。如需新图标，在 `ui/src/lib/icons.tsx` 的 `ICONS` 中添加 Lucide 风格 SVG
8. **i18n 必须同步** — 所有用户可见文案必须使用 `t("key")` 函数。新增文案必须同时更新 `src/locales/types.ts`、`zh-CN.ts`、`en.ts` 三个文件，否则 TypeScript 编译失败
9. **双形态同步 (Web + TUI)** — PHA 有 Web UI（React）和 TUI（pi-tui）两种前端。两者消费同一套 A2UI 数据，新增页面**无需额外 TUI 代码**（前提：使用已有 A2UI 组件）。如需新组件类型，必须同时在 `A2UIRenderer.tsx` 和 `tui-renderer.ts` 实现渲染
10. **工具名中文映射** — 前端 `A2UIRenderer.tsx` 的 `TOOL_DISPLAY_NAMES` 维护工具调用时的中文显示名。新增 MCP 工具后必须同步添加映射

### C. 通信协议约束 (规则 11-14)

11. **HTTP+SSE 统一传输** — 聊天消息走 AG-UI SSE（`POST /api/ag-ui`），页面/导航/动作走 A2UI HTTP+SSE（`POST /api/a2ui/action` + `GET /api/a2ui/events`）。MCP 走 JSON-RPC 2.0（`POST /api/mcp`），A2A 走标准 Agent 协议（`POST /api/a2a`）。**无 WebSocket**
12. **状态归属** — 服务端（`GatewaySession`）是聊天历史的唯一数据源。SSE 模式下前端维护本地 chat state 用于实时渲染，但页面刷新后从服务端 A2UI 重建。非聊天页面的 UI state 完全由服务端驱动
13. **Action 模式** — 用户交互统一走 `{ type: "action", action: "handler_name", payload: {...} }` 格式。按钮的 `action` 字符串必须与 `server.ts` 的 `handleAction()` 中的 handler 精确匹配
14. **导航模式** — 侧边栏点击走 `{ type: "navigate", view: "view_id" }` 格式。`view_id` 必须与 `server.ts` 的 `handleNavigate()` 中的 case 精确匹配

### D. 工程纪律 (规则 15-18)

15. **开发完成后重启服务** — 完成 `bun run build` + `bun test` 后，执行 `pha restart` 重启 Gateway 验证改动
16. **自动提交并推送** — 功能开发完成、测试通过后，自动 commit 并 push 代码到远程仓库
17. **保持简单** — 避免过度设计、超前抽象。不添加未被要求的功能、文档、类型注解。三行重复代码优于过早抽象
18. **遵循 AgentOS 设计** — 架构设计参考 OpenClaw 项目，特别是 Skills 系统、文件系统 Git-backed 状态管理、Agent 自我进化模式

### 可用 Icon 名称

```
chat, heart, moon, activity, brain, file-text, puzzle, flask,
user, bot, send, heart-pulse, stethoscope, wind, flame, timer,
footprints, bed, star, zap, bar-chart, calendar, search, save,
test-tube, lightbulb, target, link, shield, trending-up,
trending-down, sparkles, info, settings, hospital, loader,
check, x, alert-triangle, chevron-left, chevron-right,
git-branch, git-merge, git-commit, menu, play, pause,
skip-forward, refresh-cw, square, sun
```

### Evolution Lab 架构

Evolution Lab 是顶级导航页面，采用 5-Tab Dashboard 布局：

```
┌─────────────────────────────────────────────────────────┐
│                   Evolution Lab                          │
│  ┌─────────────────────────────────────────────────────┐│
│  │  [Overview] [Benchmark] [Versions] [Data] [Agent]   ││
│  ├─────────────────────────────────────────────────────┤│
│  │                                                     ││
│  │  Tab Content Area                                   ││
│  │  - Overview: score_gauge + radar_chart + timeline   ││
│  │  - Benchmark: data_table + run controls             ││
│  │  - Versions: git_timeline + file_tree + diff_view   ││
│  │  - Data: traces / test cases / suggestions          ││
│  │  - Agent: step_indicator + chat + chat_input        ││
│  │                                                     ││
│  └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

- **Dashboard 驱动**: 5 个 Tab 各司其职，Overview 展示全局，Agent Tab 提供对话式进化
- **Git 操作 MCP 化**: 12 个 git 工具（`git_status`, `git_log`, `git_diff` 等）Agent 可直接调用
- **流水线步骤追踪**: 6 步进化流程（Benchmark → Diagnose → Propose → Approve → Apply → Validate）
- **Agent 模式**: Agent Tab 中用户对话驱动，Agent 通过 `evolution-driver` Skill 理解进化方法论

关键文件：
- `src/gateway/evolution-lab.ts` — 5-Tab Dashboard 页面生成器
- `src/tools/git-tools.ts` — 12 个 Git MCP 工具
- `src/agent/git-agent-tools.ts` — Git AgentTool 适配器
- `src/skills/evolution-driver/SKILL.md` — 进化方法论 Skill

## API 端点

| 端点 | 说明 |
|------|------|
| `GET /health` | 健康检查 |
| `POST /api/a2ui/init` | A2UI 创建/恢复会话 |
| `POST /api/a2ui/action` | A2UI 用户动作 + 导航 |
| `GET /api/a2ui/events` | A2UI SSE 推送（页面更新/toast/modal） |
| `POST /api/ag-ui` | AG-UI SSE 聊天事件流 |
| `POST /api/mcp` | MCP JSON-RPC 2.0（Streamable HTTP） |
| `GET /.well-known/agent.json` | A2A Agent Card 发现 |
| `POST /api/a2a` | A2A JSON-RPC 2.0 任务管理 |
| `POST /mcp/tools/list` | 列出 MCP 工具 (legacy) |
| `POST /mcp/tools/call` | 调用 MCP 工具 (legacy) |
| `GET /api/health/*` | REST API (兼容) |

## 环境变量

环境变量仅作为 `.pha/config.json` 的备选，**优先使用 config.json 中的配置**：

```bash
# 仅在 config.json 未配置 apiKey 时才读取
ANTHROPIC_API_KEY=sk-ant-xxx     # provider=anthropic 时
OPENAI_API_KEY=sk-xxx            # provider=openai 时
OPENROUTER_API_KEY=sk-or-xxx     # provider=openrouter 时

# 可选覆盖
PHA_STATE_DIR=/path/to/.pha      # 覆盖 .pha 目录位置
PHA_CONFIG_PATH=/path/to/config  # 覆盖 config.json 路径
```
