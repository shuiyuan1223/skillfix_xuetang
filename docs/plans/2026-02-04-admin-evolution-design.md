# PHA 管理功能与自进化系统设计

## 概述

为 PHA Web UI 添加管理功能和完整的自进化系统，遵循 AgentOS 架构原则：
- **前端是纯渲染器** - 只接收 A2UI 消息并渲染
- **所有操作都通过 Agent** - MCP 是唯一 API
- **参考 OpenClaw** - 文件系统 + Git 版本管理

## 1. 功能范围

### Settings 入口（侧边栏底部）
- **Prompts** - 查看/编辑 SOUL.md，Git 版本历史，回滚
- **Skills** - 管理技能，启用/禁用，创建新 Skill
- **Evolution** - 自进化系统仪表盘

### Evolution 页面（Tabs）
- **Overview** - 汇总指标、趋势图
- **Traces** - 交互记录列表
- **Evaluations** - 评估结果、分数分布
- **Benchmark** - 测试用例管理
- **Suggestions** - 优化建议

## 2. 数据层架构

### SQLite Schema (`data/pha.db`)

```sql
-- 交互记录
CREATE TABLE traces (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  user_message TEXT NOT NULL,
  agent_response TEXT NOT NULL,
  tool_calls JSON,
  context JSON,
  duration_ms INTEGER,
  token_usage JSON
);

-- 评估结果
CREATE TABLE evaluations (
  id TEXT PRIMARY KEY,
  trace_id TEXT NOT NULL REFERENCES traces(id),
  timestamp INTEGER NOT NULL,
  scores JSON NOT NULL,
  overall_score INTEGER NOT NULL,
  feedback TEXT,
  issues JSON
);

-- Benchmark 测试用例
CREATE TABLE test_cases (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  query TEXT NOT NULL,
  context JSON,
  expected JSON NOT NULL,
  created_at INTEGER,
  updated_at INTEGER
);

-- 优化建议
CREATE TABLE suggestions (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  type TEXT NOT NULL,
  target TEXT NOT NULL,
  current_value TEXT,
  suggested_value TEXT NOT NULL,
  rationale TEXT,
  status TEXT DEFAULT 'pending',
  validation_results JSON
);

-- 索引
CREATE INDEX idx_traces_timestamp ON traces(timestamp);
CREATE INDEX idx_traces_session ON traces(session_id);
CREATE INDEX idx_evaluations_trace ON evaluations(trace_id);
CREATE INDEX idx_evaluations_score ON evaluations(overall_score);
```

### 文件结构

```
src/
├── prompts/
│   └── SOUL.md              # Agent 性格（Git 版本管理）
├── skills/
│   ├── sleep-coach/SKILL.md
│   ├── activity-coach/SKILL.md
│   └── health-advisor/SKILL.md

memory/                       # 运行时（gitignore）
├── YYYY-MM-DD.md            # 每日记忆
└── MEMORY.md                # 长期记忆

sessions/                     # 运行时（gitignore）
└── YYYY-MM-DD-<slug>.md     # 会话记录

data/
└── pha.db                   # SQLite 数据库
```

### 三层记忆系统（参考 OpenClaw）

1. **Ephemeral Memory** - `memory/YYYY-MM-DD.md`（每日日志）
2. **Durable Memory** - `memory/MEMORY.md`（长期重要信息）
3. **Session Transcripts** - `sessions/YYYY-MM-DD-<slug>.md`（会话记录）

## 3. MCP 工具层

### Prompts 管理工具

```typescript
const promptTools = [
  { name: "list_prompts", description: "列出所有 prompt 文件" },
  { name: "get_prompt", description: "获取 prompt 内容", params: { name } },
  { name: "update_prompt", description: "更新 prompt（自动 git commit）", params: { name, content, commitMessage } },
  { name: "get_prompt_history", description: "获取 prompt 的 git 版本历史", params: { name } },
  { name: "revert_prompt", description: "回滚 prompt 到指定版本", params: { name, commitHash } },
];
```

### Skills 管理工具

```typescript
const skillTools = [
  { name: "list_skills", description: "列出所有 skills" },
  { name: "get_skill", description: "获取 skill 内容", params: { name } },
  { name: "update_skill", description: "更新 skill", params: { name, content } },
  { name: "create_skill", description: "创建新 skill", params: { name, content } },
  { name: "toggle_skill", description: "启用/禁用 skill", params: { name, enabled } },
];
```

### Evolution 工具

```typescript
const evolutionTools = [
  { name: "list_traces", description: "获取交互记录", params: { limit?, offset?, filter? } },
  { name: "get_trace", description: "获取单个 trace 详情", params: { id } },
  { name: "run_evaluation", description: "对 traces 运行评估", params: { traceIds? } },
  { name: "get_evaluation_stats", description: "获取评估统计数据" },
  { name: "list_test_cases", description: "获取 benchmark 测试用例" },
  { name: "run_benchmark", description: "运行 benchmark 测试", params: { testIds? } },
  { name: "generate_suggestions", description: "基于评估结果生成优化建议" },
  { name: "apply_suggestion", description: "应用优化建议", params: { id } },
];
```

### Memory 工具

```typescript
const memoryTools = [
  { name: "search_memory", description: "搜索记忆（混合检索）", params: { query, limit? } },
  { name: "save_to_memory", description: "保存重要信息到长期记忆", params: { content } },
  { name: "get_daily_memory", description: "获取每日记忆", params: { date } },
];
```

## 4. A2UI 组件

### 新增组件

```typescript
// 代码编辑器
{ type: "code_editor", id, language: "markdown", value, readonly? }

// 版本历史列表
{ type: "commit_list", id, commits: [{ hash, message, date, author }] }

// Diff 视图
{ type: "diff_view", id, before, after }

// 数据表格
{ type: "data_table", id, columns, rows, pagination?, sortable?, filterable? }

// 分数仪表盘
{ type: "score_gauge", id, value, max: 100, label, color? }

// 状态标签
{ type: "status_badge", id, status: "pending"|"running"|"success"|"failed", label }

// 可折叠面板
{ type: "collapsible", id, title, expanded?, children }
```

### 侧边栏导航

```
💬 Chat
❤️ Health
🌙 Sleep
🏃 Activity
─────────
⚙️ Settings
   ├── 📝 Prompts
   ├── 🧩 Skills
   └── 🔬 Evolution
```

## 5. 实现文件清单

### 需要新建

```
src/
├── memory/
│   ├── index.ts           # 导出
│   ├── daily.ts           # 每日记忆管理
│   ├── durable.ts         # 长期记忆管理
│   ├── sessions.ts        # 会话记录管理
│   ├── search.ts          # 混合搜索
│   └── db.ts              # SQLite 连接
│
├── tools/
│   ├── prompt-tools.ts    # Prompts MCP 工具
│   ├── skill-tools.ts     # Skills MCP 工具
│   ├── evolution-tools.ts # Evolution MCP 工具
│   └── memory-tools.ts    # Memory MCP 工具
│
├── skills/
│   ├── activity-coach/SKILL.md
│   └── health-advisor/SKILL.md
```

### 需要修改

```
src/
├── gateway/
│   ├── server.ts          # 添加新导航处理
│   ├── a2ui.ts            # 添加新组件类型
│   ├── mcp.ts             # 注册新工具
│   └── pages.ts           # 新增页面生成器
│
├── agent/
│   └── system-prompt.ts   # 加载 SOUL.md + Skills
│
└── index.ts               # 导出新模块

ui/
└── src/main.ts            # 添加新组件渲染器
```

## 6. 实施阶段

### Phase 1: 基础设施
- SQLite 数据库初始化 (`src/memory/db.ts`)
- Memory 系统核心框架
- 新 A2UI 组件渲染器

### Phase 2: Prompts & Skills
- MCP 工具实现
- 页面生成器
- Git 集成（版本历史、回滚）

### Phase 3: Evolution
- Traces 持久化（SQLite 替换内存存储）
- Evaluations 存储和统计
- Benchmark 系统
- Suggestions 生成和应用

### Phase 4: Memory 搜索
- 向量嵌入（支持 local/OpenAI/Gemini）
- BM25 全文索引
- 混合检索融合

## 7. 交互流程示例

```
用户点击 "Settings > Prompts"
    ↓
前端发送: { type: "navigate", view: "settings/prompts" }
    ↓
Agent 收到导航请求
    ↓
Agent 调用 MCP 工具: list_prompts()
    ↓
Agent 生成 A2UI 组件树
    ↓
前端渲染页面
```
