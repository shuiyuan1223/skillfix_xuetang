# PHA - Personal Health Agent

<div align="center">

**基于 AgentOS 架构的个人健康管理 AI 助手**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.0+-black.svg)](https://bun.sh/)
[![CI](https://github.com/ibytechaos/pha/actions/workflows/ci.yml/badge.svg)](https://github.com/ibytechaos/pha/actions)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

</div>

---

## 简介

PHA (Personal Health Agent) 是一个基于 **AgentOS 架构** 的智能健康管理助手。采用"UI 即服务"设计，前端完全由 Agent 动态生成，实现真正的生成式 UI 体验。

### 支持的数据源

- **华为健康** - 完整支持，包括 Web OAuth 授权
- **Mock 数据** - 开发测试用

## 安装

### 前置要求

- [Bun](https://bun.sh) - JavaScript 运行时

```bash
# 安装 Bun (如果尚未安装)
curl -fsSL https://bun.sh/install | bash
```

### 快速安装

```bash
# 克隆项目
git clone https://github.com/ibytechaos/pha.git
cd pha

# 安装并配置
make install

# 或手动安装
bun install
bun run build
```

### 首次配置

```bash
# 方式一：交互式配置向导（推荐）
pha onboard

# 方式二：手动配置
mkdir -p .pha
cp config.json.example .pha/config.json
# 编辑 .pha/config.json 填入 API Key
```

## 快速开始

```bash
# 启动服务 (打开浏览器 http://localhost:8000)
pha start

# 终端聊天界面
pha tui

# 查看健康摘要
pha health
```

## 核心特性

| 特性 | 描述 |
|------|------|
| **AgentOS 架构** | UI 完全由 Agent 生成，前端是纯渲染器 |
| **A2UI 协议** | 基于 JSONL 的生成式 UI 协议 |
| **华为健康集成** | OAuth 授权 + 完整数据读取 |
| **多用户支持** | SQLite Token 存储，支持多用户隔离 |
| **MCP 支持** | 完整实现模型上下文协议 |
| **自我进化** | Evolution Lab — Agent 驱动的自我进化实验室 |
| **多前端** | Web UI + TUI 终端界面 |

## 架构

```
┌─────────────────────────────────────────────────────────┐
│                  Frontend (Web / TUI)                    │
│  • 纯渲染器，无业务逻辑                                   │
│  • WebSocket 接收 A2UI 组件                              │
└────────────────────────┬────────────────────────────────┘
                         │ WebSocket (A2UI)
                         ▼
┌─────────────────────────────────────────────────────────┐
│                    Gateway Server                        │
│  • A2UI 页面生成  • OAuth 授权  • MCP 工具调用           │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│                      PHA Agent                           │
│  • pi-agent-core  • 健康数据工具  • Git 工具  • Skills    │
└─────────────────────────────────────────────────────────┘
```

## 项目结构

```
pha/
├── src/
│   ├── cli.ts              # CLI 入口
│   ├── commands/           # CLI 命令
│   ├── gateway/            # Gateway 服务
│   │   ├── server.ts       # HTTP/WebSocket 服务
│   │   ├── pages.ts        # A2UI 页面生成器
│   │   ├── evolution-lab.ts # Evolution Lab 页面
│   │   └── a2ui.ts         # A2UI 组件定义
│   ├── agent/              # Agent 核心
│   │   ├── pha-agent.ts    # Agent 主类
│   │   └── tools.ts        # AgentTool 适配器
│   ├── tools/              # MCP 工具
│   │   ├── health-data.ts  # 健康数据
│   │   └── git-tools.ts    # Git 操作 (12个)
│   ├── evolution/          # 进化系统
│   │   └── version-manager.ts # Git worktree 管理
│   ├── skills/             # Agent Skills
│   │   └── evolution-driver/ # 自我进化方法论
│   ├── data-sources/       # 数据源
│   │   └── huawei/         # 华为健康 API
│   └── services/           # 服务层
├── tests/                  # 测试
│   ├── unit/               # 单元测试
│   ├── integration/        # 集成测试
│   └── fixtures/           # 测试数据
├── ui/                     # Web UI (Lit Element)
├── dist/                   # 构建输出
└── .pha/                   # 运行时数据 (gitignored)
    ├── config.json         # 配置
    ├── users.db            # 用户 Token (SQLite)
    └── api-cache/          # API 缓存
```

## CLI 命令

```bash
# 服务管理
pha start              # 启动服务 (带 Web UI)
pha stop               # 停止服务
pha restart            # 重启服务
pha status             # 查看状态

# 交互界面
pha tui                # 终端聊天 (pi-tui)
pha chat -m "你好"      # 单条消息

# 健康数据
pha health             # 今日摘要
pha health -w          # 周报

# 华为健康
pha huawei setup       # 配置 API 凭证
pha huawei auth        # CLI 授权
pha huawei status      # 查看状态
pha huawei debug       # API 调试

# MCP 工具
pha tools              # 列出工具
pha tools call <name>  # 调用工具

# 自我进化
pha eval traces        # 查看交互记录
pha eval run           # 运行评估

# 进化实验室 (Web UI)
# 导航到 Evolution Lab，Agent 驱动进化流程
```

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
| `POST /api/legacy-chat` | 边想边搜 SSE（需已完成 OAuth） |
| `POST /api/query` | 边想边搜 SSE（传入 refresh_token，无需预登录） |
| `POST /mcp/tools/list` | 列出 MCP 工具 (legacy) |
| `POST /mcp/tools/call` | 调用 MCP 工具 (legacy) |
| `GET /api/health/*` | 健康数据 REST API |

### POST /api/legacy-chat

内部查询接口（边想边搜），要求调用方已提前完成 OAuth 登录、token 已存入数据库。

```http
POST /api/legacy-chat
Content-Type: application/json

{
  "message": "我今天睡眠怎么样？",  // 用户问题（必填）
  "user_id": "huawei-uid-xxx",     // 用户 ID（可选，优先于 session_id）
  "session_id": "sess-xxx"         // 会话 ID（可选，user_id 缺失时使用）
}
```

`user_id` / `session_id` 均缺失时，自动生成随机 UUID 作为会话 key。响应格式同 `/api/query`。

## 开发

```bash
# 开发模式
pha start              # 终端 1: Gateway
cd ui && bun run dev   # 终端 2: UI 热更新 (可选)

# 测试
bun test               # 运行所有测试
bun test:watch         # 监听模式
bun test:unit          # 仅单元测试
bun test:integration   # 仅集成测试

# 代码检查
bun run check          # TypeScript 类型检查
bun run lint           # ESLint
bun run format         # Prettier

# 构建
bun run build
```

## 协作开发

项目使用 **Trunk Based** 开发模式：

- 小改动直接推 `main`
- 大功能/破坏性变更走 PR
- 提交前自动运行 lint-staged
- CI 自动检查: 类型 → Lint → 格式 → 测试 → 构建

```bash
# 提交自动检查
git commit -m "feat: xxx"  # husky 自动运行 lint-staged
```

## 环境变量

```bash
# .env
ANTHROPIC_API_KEY=sk-ant-xxx  # 或其他 LLM Provider
```

## 部署更新

```bash
cd pha
git pull
bun install
bun run build
pha restart
```

## License

MIT
