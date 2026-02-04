# PHA - Personal Health Agent

<div align="center">

**基于 AgentOS 架构的个人健康管理 AI 助手**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.0+-black.svg)](https://bun.sh/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

[English](#english) | [中文](#中文)

</div>

---

## 中文

### 简介

PHA (Personal Health Agent) 是一个基于 **AgentOS 架构** 的智能健康管理助手。它采用"UI 即服务"的设计理念，前端完全由 Agent 动态生成，实现真正的生成式 UI 体验。

### 核心特性

| 特性 | 描述 |
|------|------|
| **AgentOS 架构** | UI 完全由 Agent 生成，前端是纯渲染器，零业务逻辑 |
| **A2UI 协议** | 基于 JSONL 的生成式 UI 协议，支持实时推送 |
| **MCP 支持** | 完整实现模型上下文协议 (Model Context Protocol) |
| **自我进化** | 内置 LLM-as-Judge 评估和优化系统 |
| **多数据源** | 支持 Mock、华为健康、Apple HealthKit |
| **多前端** | Web UI、TUI 终端界面、REST API |

### 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                   Frontend (Web / TUI)                       │
│   • 纯渲染器，无业务逻辑                                      │
│   • 通过 WebSocket 接收 A2UI 组件并渲染                       │
└─────────────────────────┬───────────────────────────────────┘
                          │ WebSocket (A2UI Protocol)
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                     Gateway Server                           │
│   • Bun 原生 HTTP/WebSocket 服务                             │
│   • A2UI: 生成式 UI 组件推送                                 │
│   • MCP: 模型上下文协议端点                                   │
│   • REST: 健康数据 API                                       │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                      PHA Agent                               │
│   • 基于 pi-agent-core 构建                                  │
│   • 健康数据工具集成                                          │
│   • 可自定义系统提示词                                        │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    Data Sources                              │
│   • Mock (开发测试)                                          │
│   • Huawei Health Kit (鸿蒙/安卓)                            │
│   • Apple HealthKit (iOS/macOS)                              │
└─────────────────────────────────────────────────────────────┘
```

### 自我进化系统

PHA 内置了完整的自我进化系统，能够持续优化 Agent 的响应质量：

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Trace     │────▶│  Evaluator  │────▶│  Analyzer   │
│  Collector  │     │ (LLM Judge) │     │             │
└─────────────┘     └─────────────┘     └──────┬──────┘
      │                                        │
      │  记录交互                               │  分析弱点
      │                                        ▼
      │             ┌─────────────┐     ┌─────────────┐
      └────────────▶│   Applier   │◀────│  Optimizer  │
                    │             │     │             │
                    └─────────────┘     └─────────────┘
                          │                    │
                          │  应用改进            │  生成建议
                          ▼                    │
                    ┌─────────────┐            │
                    │  Improved   │◀───────────┘
                    │   Agent     │
                    └─────────────┘
```

### 安装

```bash
git clone https://github.com/ibytechaos/pha.git
cd pha
make install
```

安装完成后 `pha` 命令即可使用。

卸载：`make uninstall`

### 快速开始

```bash
# 1. 设置 API Key (任选一个)
export ANTHROPIC_API_KEY=sk-ant-xxx

# 2. 初始化
pha setup

# 3. 开始使用
pha tui --local     # 终端聊天
pha health          # 查看健康数据
pha gateway start   # 启动服务器
```

### CLI 命令参考

#### 配置管理

```bash
pha setup              # 初始化配置
pha onboard            # 交互式配置向导
pha config             # 查看当前配置
pha config get <path>  # 获取配置项
pha config set <k> <v> # 设置配置项
pha doctor             # 诊断问题
pha doctor --fix       # 自动修复问题
```

#### Gateway 管理

```bash
pha gateway start      # 启动服务器
pha gateway start -d   # 后台启动
pha gateway stop       # 停止服务器
pha gateway restart    # 重启服务器
pha gateway status     # 查看状态
pha gateway logs       # 查看日志
pha gateway logs -f    # 实时日志
pha gateway health     # 健康检查
```

#### 健康数据

```bash
pha health             # 今日健康摘要
pha health -d 2024-01-15  # 指定日期
pha health -w          # 周报
pha health --json      # JSON 输出
```

#### MCP 工具

```bash
pha tools              # 列出所有工具
pha tools list         # 同上
pha tools info <name>  # 工具详情
pha tools call <name> -a date=2024-01-15  # 调用工具
```

#### 交互界面

```bash
pha tui                # 连接 Gateway 的 TUI
pha tui --local        # 本地 TUI (不需要 Gateway)
pha tui --thinking     # 显示思考过程
pha chat -m "你好"     # 发送单条消息
```

#### 自我进化

```bash
pha eval traces        # 查看记录的交互
pha eval run           # 运行评估
pha eval optimize      # 生成优化建议
pha eval clear --force # 清除记录
pha eval export -o traces.json  # 导出
pha eval import traces.json     # 导入
```

#### 系统状态

```bash
pha status             # 系统状态总览
pha status --json      # JSON 输出
```

### API 端点

Gateway 启动后提供以下端点：

| 端点 | 方法 | 描述 |
|------|------|------|
| `/health` | GET | 服务健康检查 |
| `/api/health/summary` | GET | 每日健康摘要 |
| `/api/health/metrics` | GET | 健康指标数据 |
| `/api/health/heart-rate` | GET | 心率数据 |
| `/api/health/sleep` | GET | 睡眠数据 |
| `/api/health/workouts` | GET | 运动记录 |
| `/api/health/weekly` | GET | 周数据汇总 |
| `/mcp/tools/list` | POST | MCP 工具列表 |
| `/mcp/tools/call` | POST | 调用 MCP 工具 |
| `/ws` | WebSocket | A2UI 实时通信 |

### A2UI 协议

A2UI (Agent-to-UI) 是一个基于 JSONL 的生成式 UI 协议：

```typescript
interface A2UIMessage {
  type: "a2ui";
  surface_id: "main" | "sidebar" | "modal" | "toast";
  components: A2UIComponent[];
  root_id: string;
}
```

**支持的组件:**

| 类别 | 组件 |
|------|------|
| 布局 | `column`, `row`, `grid` |
| 内容 | `text`, `card`, `chart`, `metric`, `stat_card`, `table` |
| 交互 | `button`, `nav`, `tabs`, `progress`, `badge` |
| 加载 | `skeleton` |

### 项目结构

```
pha/
├── packages/
│   ├── core/                    # 核心库
│   │   └── src/
│   │       ├── agent/           # Agent 封装
│   │       ├── data-sources/    # 数据源接口
│   │       ├── gateway/         # Gateway 服务
│   │       ├── tools/           # MCP 工具
│   │       └── evolution/       # 自我进化系统
│   ├── cli/                     # CLI 工具
│   │   └── src/
│   │       ├── commands/        # 命令模块
│   │       └── utils/           # 工具函数
│   └── web/                     # Web UI
│       └── src/
│           └── main.ts          # Lit Element 渲染器
├── package.json                 # Monorepo 配置
├── CLAUDE.md                    # 开发指南
└── README.md
```

### 环境变量

| 变量 | 描述 | 必需 |
|------|------|------|
| `ANTHROPIC_API_KEY` | Anthropic API Key | 三选一 |
| `OPENAI_API_KEY` | OpenAI API Key | 三选一 |
| `GOOGLE_API_KEY` | Google AI API Key | 三选一 |

### 开发

```bash
# 开发模式 (监听变化)
cd packages/core && bun run dev
cd packages/cli && bun run dev
cd packages/web && bun run dev

# 类型检查
bun run check

# 清理构建
bun run clean
```

### 路线图

- [x] 核心架构 (Agent, Gateway, A2UI, MCP)
- [x] CLI 完整命令集
- [x] Web UI (Lit Element)
- [x] TUI 终端界面
- [x] 自我进化系统
- [ ] 华为 Health Kit 集成
- [ ] Apple HealthKit 集成
- [ ] 移动端适配

---

## English

### Introduction

PHA (Personal Health Agent) is an intelligent health management assistant built on the **AgentOS architecture**. It adopts a "UI as Service" design philosophy where the frontend is purely a renderer, with all UI generated dynamically by the Agent.

### Key Features

| Feature | Description |
|---------|-------------|
| **AgentOS Architecture** | UI entirely generated by Agent, frontend is pure renderer |
| **A2UI Protocol** | JSONL-based generative UI protocol with real-time push |
| **MCP Support** | Full Model Context Protocol implementation |
| **Self-Evolution** | Built-in LLM-as-Judge evaluation and optimization |
| **Multi-Source** | Mock, Huawei Health, Apple HealthKit support |
| **Multi-Frontend** | Web UI, TUI, REST API |

### Installation

```bash
git clone https://github.com/ibytechaos/pha.git
cd pha
make install
```

### Quick Start

```bash
export OPENROUTER_API_KEY=sk-or-xxx  # or ANTHROPIC_API_KEY
pha onboard
pha gateway start
pha tui
```

### CLI Commands

```bash
# Setup
pha setup              # Initialize config
pha onboard            # Interactive wizard
pha doctor             # Diagnose issues

# Gateway
pha gateway start      # Start server
pha gateway stop       # Stop server
pha gateway status     # Check status

# Health Data
pha health             # Today's summary
pha health -w          # Weekly report

# Interactive
pha tui                # Terminal UI
pha tui --local        # Local mode (no gateway)

# Tools
pha tools              # List MCP tools
pha tools call <name>  # Call a tool

# Evolution
pha eval traces        # View traces
pha eval run           # Run evaluation
```

---

## License

MIT License - see [LICENSE](LICENSE) for details.

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

## Acknowledgments

- [pi-agent](https://github.com/anthropics/pi-agent) - Agent framework
- [Bun](https://bun.sh/) - JavaScript runtime
- [Lit](https://lit.dev/) - Web components library
