# PHA-TS Development Guide

PHA (Personal Health Agent) TypeScript 重写版本，基于 AgentOS 架构，使用 Bun 运行时。

## 快速开始

```bash
# 安装依赖
bun install

# 构建所有包
cd packages/core && bun run build
cd packages/cli && bun run build
cd packages/web && bun run build

# 运行 CLI
bun packages/cli/dist/main.js --help

# 启动 Gateway 服务器
bun packages/cli/dist/main.js start

# 查看健康摘要 (使用 Mock 数据)
bun packages/cli/dist/main.js health

# 列出 MCP 工具
bun packages/cli/dist/main.js tools

# 启动 Web UI 开发服务器
cd packages/web && bun run dev
```

## 项目结构

```
pha-ts/
├── packages/
│   ├── core/                    # 核心库
│   │   └── src/
│   │       ├── agent/           # Agent 封装
│   │       │   ├── pha-agent.ts # PHA Agent 主类
│   │       │   ├── tools.ts     # pi-agent 工具适配器
│   │       │   └── system-prompt.ts
│   │       ├── data-sources/    # 数据源接口
│   │       │   ├── interface.ts # 健康数据源接口
│   │       │   └── mock.ts      # Mock 数据实现
│   │       ├── gateway/         # Gateway 服务
│   │       │   ├── server.ts    # Bun HTTP/WebSocket 服务器
│   │       │   ├── a2ui.ts      # A2UI 协议和组件
│   │       │   └── mcp.ts       # MCP 协议处理
│   │       ├── tools/           # 健康数据工具
│   │       │   └── health-data.ts
│   │       └── evolution/       # 自我进化系统
│   │           ├── trace-collector.ts
│   │           ├── evaluator.ts
│   │           ├── analyzer.ts
│   │           └── optimizer.ts
│   ├── cli/                     # CLI 工具
│   │   └── src/
│   │       └── main.ts          # CLI 入口
│   └── web/                     # Web UI
│       └── src/
│           └── main.ts          # Lit Element A2UI 渲染器
└── package.json                 # Monorepo 配置
```

## 架构

### AgentOS 架构

```
┌─────────────────────────────────────────────────────────┐
│                  Frontend (Web / TUI)                    │
│  - 纯渲染器，无业务逻辑                                   │
│  - 通过 WebSocket 接收 A2UI 组件                          │
└────────────────────────┬────────────────────────────────┘
                         │ WebSocket (A2UI Protocol)
                         ▼
┌─────────────────────────────────────────────────────────┐
│                    Gateway Server                        │
│  - Bun HTTP/WebSocket 服务                               │
│  - A2UI: 生成式 UI 渲染                                  │
│  - MCP: 模型上下文协议                                   │
│  - REST: 传统 API                                        │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│                    PHA Agent                             │
│  - 基于 pi-agent-core                                    │
│  - 健康数据工具集成                                       │
│  - 系统提示词配置                                         │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│                  Data Sources                            │
│  - Mock (开发测试)                                       │
│  - Huawei Health (TODO)                                  │
│  - Apple HealthKit (TODO)                                │
└─────────────────────────────────────────────────────────┘
```

### 自我进化系统

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Trace     │────▶│  Evaluator  │────▶│  Analyzer   │
│  Collector  │     │ (LLM Judge) │     │             │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
                                               ▼
                    ┌─────────────┐     ┌─────────────┐
                    │   Applier   │◀────│  Optimizer  │
                    │             │     │             │
                    └─────────────┘     └─────────────┘
```

### A2UI 协议

A2UI (Agent-to-UI) 是一个基于 JSONL 的生成式 UI 协议：

```typescript
interface A2UIMessage {
  type: "a2ui";
  surface_id: string;  // "main" | "sidebar" | "modal" | "toast"
  components: A2UIComponent[];
  root_id: string;
}
```

支持的组件：
- 布局: `column`, `row`, `grid`
- 内容: `text`, `card`, `chart`, `metric`, `stat_card`, `table`
- 交互: `button`, `nav`, `tabs`, `progress`, `badge`
- 加载: `skeleton`

## CLI 命令

```bash
# 服务器
bun packages/cli/dist/main.js start [--port 8000] [--provider anthropic]

# 健康数据
bun packages/cli/dist/main.js health [--date 2024-01-01]

# MCP 工具
bun packages/cli/dist/main.js tools

# 交互式聊天
bun packages/cli/dist/main.js chat [--provider anthropic]

# 自我进化
bun packages/cli/dist/main.js eval traces        # 查看记录的交互
bun packages/cli/dist/main.js eval run           # 运行评估
bun packages/cli/dist/main.js eval optimize      # 生成优化建议
```

## API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/health` | GET | 健康检查 |
| `/api/health/summary` | GET | 每日健康摘要 |
| `/api/health/metrics` | GET | 健康指标 |
| `/api/health/heart-rate` | GET | 心率数据 |
| `/api/health/sleep` | GET | 睡眠数据 |
| `/api/health/workouts` | GET | 运动数据 |
| `/api/health/weekly` | GET | 周数据 |
| `/mcp/tools/list` | POST | MCP 工具列表 |
| `/mcp/tools/call` | POST | MCP 工具调用 |
| `/ws` | WS | A2UI WebSocket |

## 环境变量

```bash
# LLM API Key (选一个)
ANTHROPIC_API_KEY=sk-ant-xxx
OPENAI_API_KEY=sk-xxx
GOOGLE_API_KEY=xxx
```

## 开发状态

### Phase 1: 基础设施 ✅
- [x] 项目结构和 monorepo 配置
- [x] 健康数据源接口和 Mock 实现
- [x] 健康数据工具
- [x] pi-agent 集成
- [x] Gateway 服务器 (Bun)
- [x] A2UI 协议和组件
- [x] MCP 端点
- [x] CLI 工具 (start, health, tools)

### Phase 2: WebSocket 和 Web UI ✅
- [x] Bun 原生 WebSocket 支持
- [x] A2UI WebSocket 推送
- [x] Web UI (Lit Element)
- [x] A2UI 组件渲染器

### Phase 3: 自我进化系统 ✅
- [x] Trace Collector
- [x] Evaluator (LLM-as-Judge)
- [x] Analyzer
- [x] Optimizer
- [x] CLI eval 命令

### Phase 4: 待完成
- [ ] TUI 集成 (pi-tui)
- [ ] 华为 Health Kit 集成
- [ ] Apple HealthKit 集成
- [ ] 图表渲染 (目前是占位符)
- [ ] 聊天界面完善

## 代码规范

- 使用严格 TypeScript
- 避免 `any` 类型
- 使用 Conventional Commits
- 保持代码简洁
- 使用 Bun 而非 Node.js
