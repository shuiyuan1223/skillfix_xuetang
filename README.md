# PHA - Personal Health Agent

基于 AgentOS 架构的个人健康管理 AI 助手，使用 TypeScript 和 Bun 构建。

## 特性

- **AgentOS 架构** - UI 完全由 Agent 生成，前端是纯渲染器
- **A2UI 协议** - 生成式 UI 的 JSONL 协议
- **MCP 支持** - 标准的模型上下文协议
- **自我进化** - 内置评估和优化系统
- **Mock 数据** - 开箱即用的模拟健康数据

## 快速开始

```bash
# 安装依赖
bun install

# 构建
cd packages/core && bun run build
cd packages/cli && bun run build

# 运行
bun packages/cli/dist/main.js health
```

## 命令

```bash
# 启动 Gateway 服务器
bun packages/cli/dist/main.js start

# 查看健康摘要
bun packages/cli/dist/main.js health

# 列出 MCP 工具
bun packages/cli/dist/main.js tools

# 交互式聊天 (需要 API Key)
ANTHROPIC_API_KEY=xxx bun packages/cli/dist/main.js chat
```

## 架构

```
Frontend (Web/TUI) ──WebSocket──▶ Gateway ──▶ Agent ──▶ Data Sources
                     (A2UI)       (MCP)      (Tools)    (Mock/Huawei)
```

## License

MIT
