# PHA Memory System Design

基于 OpenClaw 架构，为 PHA 设计多租户健康记忆系统。

## 架构概览

```
┌─────────────────────────────────────────────────────────────────┐
│                        Memory Layer                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────┐    ┌──────────────────────────────────┐   │
│  │   SOUL.md        │    │   Per-User Memory (UUID-based)   │   │
│  │   (Agent 人设)    │    ├──────────────────────────────────┤   │
│  │                  │    │  PROFILE.md   - 健康档案          │   │
│  │  - 性格特点       │    │  MEMORY.md    - 长期记忆摘要      │   │
│  │  - 沟通风格       │    │  memory/      - 对话历史          │   │
│  │  - 健康专业知识   │    │    └── YYYY-MM-DD.md            │   │
│  └──────────────────┘    └──────────────────────────────────┘   │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│                     Vector Search (Vectra)                       │
│  .pha/vectors/{uuid}/                                            │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ - OpenRouter Embeddings (text-embedding-3-small)             ││
│  │ - Local file-based vector index (no server needed)           ││
│  │ - Semantic search with cosine similarity                     ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│                        SQLite Storage                            │
│  .pha/memory.db                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ Tables:                                                      ││
│  │ - users (uuid, profile_json, created_at, updated_at)         ││
│  │ - files (uuid, path, hash, mtime, size)                      ││
│  │ - chunks (id, uuid, path, start_line, end_line, text, ...)   ││
│  │ - embedding_cache (provider, model, hash, embedding, ...)    ││
│  │ - chunks_fts (FTS5 for keyword search)                       ││
│  │ - chunks_vec (sqlite-vec for vector search)                  ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

## 1. SOUL.md - Agent 人设

全局共享，定义 PHA 的性格和专业能力。

### 文件位置
```
.pha/SOUL.md
```

### 内容模板

```markdown
# PHA - 你的健康伙伴

你是 PHA (Personal Health Agent)，一位专业、温暖的健康管理助手。

## 核心身份

**专业但不冷漠** - 你有医学知识背景，但说话像朋友，不像医生。用通俗语言解释专业概念。

**关心但不焦虑** - 发现问题时温和提醒，不制造恐慌。数据异常不等于生病。

**主动但不打扰** - 在合适的时机提供建议，不要在用户忙碌时唠叨。

## 沟通风格

- 简洁：先给结论，需要时再展开
- 数据驱动：用数字说话，但解释其含义
- 鼓励为主：关注进步，不指责不足
- 个性化：记住用户的目标和偏好

## 专业边界

- 我可以：分析数据、解释趋势、提供生活建议
- 我不可以：诊断疾病、开药、替代医生
- 异常数据：建议咨询医生，不自行判断

## 记忆使用

每次对话开始，我会读取用户的 PROFILE.md 了解基本情况。
重要发现会记录到用户的 MEMORY.md。
这些文件就是我的记忆，帮助我提供连续、个性化的服务。
```

## 2. PROFILE.md - 用户健康档案

每用户独立，存储结构化的健康信息。

### 文件位置
```
.pha/users/{uuid}/PROFILE.md
```

### 内容结构

```markdown
# 健康档案

## 基本信息
- 昵称: {待收集}
- 性别: {待收集}
- 出生年份: {待收集}
- 身高: {待收集}
- 体重: {待收集}

## 健康状况
- 慢性病: {无 | 列表}
- 过敏史: {无 | 列表}
- 用药情况: {无 | 列表}

## 健康目标
- 主要目标: {待收集}
- 每日步数目标: 8000
- 睡眠时长目标: 7-8小时
- 运动频率目标: 每周3次

## 生活习惯
- 作息: {待收集}
- 运动偏好: {待收集}
- 饮食偏好: {待收集}

## 数据来源
- 华为健康: {已连接 | 未连接}
- 连接时间: {timestamp}

---
最后更新: {timestamp}
```

### 必填字段 (用于主动询问)

```typescript
const REQUIRED_PROFILE_FIELDS = [
  { key: "gender", question: "为了更准确地分析您的健康数据，请问您的性别是？", options: ["男", "女"] },
  { key: "birthYear", question: "请问您的出生年份是？这会帮助我计算您的目标心率区间。" },
  { key: "height", question: "请问您的身高是多少厘米？" },
  { key: "weight", question: "请问您目前的体重是多少公斤？" },
] as const;
```

## 3. MEMORY.md - 长期记忆摘要

每用户独立，存储重要的长期记忆。

### 文件位置
```
.pha/users/{uuid}/MEMORY.md
```

### 内容示例

```markdown
# 健康记忆

## 用户偏好
- 喜欢早上运动，晚上不适合剧烈运动
- 不喜欢被提醒喝水
- 关心睡眠质量胜过睡眠时长

## 健康发现
- 2024-01 发现周末步数明显下降，用户说因为周末喜欢宅家
- 2024-02 用户提到最近工作压力大，睡眠质量下降
- 2024-03 用户开始跑步，目标是完成5公里

## 重要事件
- 2024-01-15: 用户首次连接华为健康
- 2024-02-20: 用户设定减重5kg目标

## 待跟进
- 每周问一次跑步进展
- 关注睡眠质量是否改善
```

## 4. 对话历史 - Daily Logs

### 文件位置
```
.pha/users/{uuid}/memory/YYYY-MM-DD.md
```

### 内容格式

```markdown
# 2024-03-15 对话记录

## 09:30 - 早间问候
用户: 早上好，昨晚睡得怎么样？
助手: 根据数据，您昨晚睡了7小时15分，深睡眠占比28%，比平时好一些。

## 18:45 - 运动咨询
用户: 今天走了多少步？
助手: 今天已走8,234步，完成了目标的103%！

## 发现和洞察
- 用户最近关心睡眠质量
- 步数目标完成率提高
```

## 5. SQLite Schema

### 多租户表结构

```sql
-- 用户表
CREATE TABLE IF NOT EXISTS users (
  uuid TEXT PRIMARY KEY,
  profile_json TEXT NOT NULL DEFAULT '{}',
  preferences_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 文件表 (加 uuid 隔离)
CREATE TABLE IF NOT EXISTS files (
  uuid TEXT NOT NULL,
  path TEXT NOT NULL,
  hash TEXT NOT NULL,
  mtime INTEGER NOT NULL,
  size INTEGER NOT NULL,
  PRIMARY KEY (uuid, path)
);

-- 分块表 (加 uuid 隔离)
CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY,
  uuid TEXT NOT NULL,
  path TEXT NOT NULL,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  hash TEXT NOT NULL,
  model TEXT NOT NULL,
  text TEXT NOT NULL,
  embedding TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_chunks_uuid ON chunks(uuid);
CREATE INDEX idx_chunks_path ON chunks(path);

-- FTS5 全文搜索
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
  text,
  id UNINDEXED,
  uuid UNINDEXED,
  path UNINDEXED,
  model UNINDEXED,
  start_line UNINDEXED,
  end_line UNINDEXED
);

-- Embedding 缓存 (全局共享)
CREATE TABLE IF NOT EXISTS embedding_cache (
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  hash TEXT NOT NULL,
  embedding TEXT NOT NULL,
  dims INTEGER,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (provider, model, hash)
);
```

## 6. 代码实现

### 文件结构

```
src/memory/
├── index.ts              # 导出
├── schema.ts             # SQLite schema
├── user-store.ts         # 用户存储 (profile, preferences)
├── memory-manager.ts     # 记忆管理器 (chunk, search)
├── profile.ts            # 健康档案解析/更新
├── soul.ts               # SOUL.md 加载
└── info-collector.ts     # 缺失信息收集器
```

### 核心接口

```typescript
// src/memory/index.ts

export interface UserProfile {
  nickname?: string;
  gender?: "male" | "female";
  birthYear?: number;
  height?: number;  // cm
  weight?: number;  // kg
  conditions?: string[];
  allergies?: string[];
  medications?: string[];
  goals?: {
    primary?: string;
    dailySteps?: number;
    sleepHours?: number;
    exercisePerWeek?: number;
  };
  dataSources?: {
    huawei?: { connected: boolean; connectedAt?: number };
  };
}

export interface MemorySearchResult {
  path: string;
  startLine: number;
  endLine: number;
  score: number;
  snippet: string;
}

export interface MemoryManager {
  // 用户管理
  ensureUser(uuid: string): Promise<void>;
  getProfile(uuid: string): Promise<UserProfile>;
  updateProfile(uuid: string, updates: Partial<UserProfile>): Promise<void>;

  // 记忆搜索
  search(uuid: string, query: string, options?: {
    maxResults?: number;
    minScore?: number;
  }): Promise<MemorySearchResult[]>;

  // 记忆写入
  appendMemory(uuid: string, content: string): Promise<void>;
  appendDailyLog(uuid: string, content: string): Promise<void>;

  // SOUL
  getSoulPrompt(): string;

  // 信息收集
  getMissingRequiredInfo(uuid: string): Promise<{
    field: string;
    question: string;
    options?: string[];
  } | null>;
}
```

### Profile 管理器

```typescript
// src/memory/profile.ts

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { getStateDir } from "../utils/config.js";

const USERS_DIR = join(getStateDir(), "users");

export function ensureUserDir(uuid: string): string {
  const userDir = join(USERS_DIR, uuid);
  if (!existsSync(userDir)) {
    mkdirSync(userDir, { recursive: true });
    mkdirSync(join(userDir, "memory"), { recursive: true });
  }
  return userDir;
}

export function loadProfile(uuid: string): UserProfile {
  const profilePath = join(USERS_DIR, uuid, "PROFILE.md");
  if (!existsSync(profilePath)) {
    return {};
  }
  const content = readFileSync(profilePath, "utf-8");
  return parseProfileMd(content);
}

export function saveProfile(uuid: string, profile: UserProfile): void {
  const userDir = ensureUserDir(uuid);
  const profilePath = join(userDir, "PROFILE.md");
  const content = generateProfileMd(profile);
  writeFileSync(profilePath, content);
}

function parseProfileMd(content: string): UserProfile {
  // 解析 Markdown 格式的 profile
  const profile: UserProfile = {};

  const genderMatch = content.match(/性别:\s*(男|女)/);
  if (genderMatch) {
    profile.gender = genderMatch[1] === "男" ? "male" : "female";
  }

  const birthMatch = content.match(/出生年份:\s*(\d{4})/);
  if (birthMatch) {
    profile.birthYear = parseInt(birthMatch[1]);
  }

  // ... 解析其他字段

  return profile;
}

function generateProfileMd(profile: UserProfile): string {
  const lines = [
    "# 健康档案",
    "",
    "## 基本信息",
    `- 昵称: ${profile.nickname || "{待收集}"}`,
    `- 性别: ${profile.gender === "male" ? "男" : profile.gender === "female" ? "女" : "{待收集}"}`,
    `- 出生年份: ${profile.birthYear || "{待收集}"}`,
    `- 身高: ${profile.height ? `${profile.height}cm` : "{待收集}"}`,
    `- 体重: ${profile.weight ? `${profile.weight}kg` : "{待收集}"}`,
    "",
    // ... 其他字段
  ];
  return lines.join("\n");
}
```

### 信息收集器

```typescript
// src/memory/info-collector.ts

const REQUIRED_FIELDS = [
  {
    key: "gender",
    question: "为了更准确地分析您的健康数据，请问您的性别是？",
    options: ["男", "女"],
    parse: (answer: string) => answer === "男" ? "male" : "female",
  },
  {
    key: "birthYear",
    question: "请问您的出生年份是？这会帮助我计算您的目标心率区间。",
    validate: (answer: string) => {
      const year = parseInt(answer);
      return year > 1900 && year < new Date().getFullYear();
    },
    parse: (answer: string) => parseInt(answer),
  },
  {
    key: "height",
    question: "请问您的身高是多少厘米？",
    validate: (answer: string) => {
      const h = parseFloat(answer);
      return h > 100 && h < 250;
    },
    parse: (answer: string) => parseFloat(answer),
  },
  {
    key: "weight",
    question: "请问您目前的体重是多少公斤？",
    validate: (answer: string) => {
      const w = parseFloat(answer);
      return w > 20 && w < 300;
    },
    parse: (answer: string) => parseFloat(answer),
  },
] as const;

export function getNextMissingField(profile: UserProfile): typeof REQUIRED_FIELDS[number] | null {
  for (const field of REQUIRED_FIELDS) {
    if (profile[field.key as keyof UserProfile] === undefined) {
      return field;
    }
  }
  return null;
}

export function shouldAskForInfo(profile: UserProfile, context: {
  messageCount: number;
  lastAskedAt?: number;
}): boolean {
  // 不要在第一条消息就问
  if (context.messageCount < 2) return false;

  // 每次对话最多问一个问题
  if (context.lastAskedAt && Date.now() - context.lastAskedAt < 60000) return false;

  // 有缺失字段才问
  return getNextMissingField(profile) !== null;
}
```

## 7. 集成到 Agent

### System Prompt 构建

```typescript
// src/agent/prompt-builder.ts

export function buildSystemPrompt(uuid: string): string {
  const soul = loadSoulPrompt();
  const profile = loadProfile(uuid);
  const memory = loadMemorySummary(uuid);

  return `
${soul}

---

## 当前用户信息

${formatProfile(profile)}

## 用户记忆

${memory || "暂无历史记忆"}

---

请基于以上信息，为用户提供个性化的健康服务。
`;
}

function formatProfile(profile: UserProfile): string {
  if (!profile.gender && !profile.birthYear) {
    return "用户基本信息尚未收集，请在适当时机询问。";
  }

  const lines = [];
  if (profile.nickname) lines.push(`- 昵称: ${profile.nickname}`);
  if (profile.gender) lines.push(`- 性别: ${profile.gender === "male" ? "男" : "女"}`);
  if (profile.birthYear) {
    const age = new Date().getFullYear() - profile.birthYear;
    lines.push(`- 年龄: ${age}岁`);
  }
  if (profile.height) lines.push(`- 身高: ${profile.height}cm`);
  if (profile.weight) lines.push(`- 体重: ${profile.weight}kg`);

  return lines.join("\n");
}
```

### 记忆搜索工具

```typescript
// src/tools/memory-search.ts

export const memorySearchTool = {
  name: "search_memory",
  description: "搜索用户的健康记忆，了解过去的对话和发现",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "搜索关键词，如 '睡眠问题' 或 '运动目标'",
      },
    },
    required: ["query"],
  },
  handler: async (args: { query: string }, context: { uuid: string }) => {
    const results = await memoryManager.search(context.uuid, args.query, {
      maxResults: 5,
      minScore: 0.3,
    });

    if (results.length === 0) {
      return "未找到相关记忆";
    }

    return results.map(r => `[${r.path}] ${r.snippet}`).join("\n\n");
  },
};
```

## 8. 实施计划

### Phase 1: 基础存储 (Day 1-2)
- [ ] 创建 `src/memory/` 目录结构
- [ ] 实现 SQLite schema
- [ ] 实现 UserStore (CRUD)
- [ ] 实现 SOUL.md 加载

### Phase 2: Profile 管理 (Day 2-3)
- [ ] 实现 PROFILE.md 解析/生成
- [ ] 实现 info-collector
- [ ] 集成到 Agent 对话流程

### Phase 3: 记忆搜索 (Day 3-5)
- [ ] 实现 chunking 逻辑
- [ ] 集成 FTS5 关键词搜索
- [ ] (可选) 集成 embedding 向量搜索
- [ ] 实现 hybrid search

### Phase 4: 记忆写入 (Day 5-6)
- [ ] 实现 daily log 自动记录
- [ ] 实现 MEMORY.md 自动更新
- [ ] 定期总结/压缩旧记忆

### Phase 5: 多租户集成 (Day 6-7)
- [ ] 与 user-store (OAuth) 集成
- [ ] UUID 在 WebSocket 会话中传递
- [ ] 测试多用户隔离

## 9. 健康特定考虑

### 为什么需要 Profile？

健康数据的解读**高度依赖个人信息**：

| 数据 | 无 Profile | 有 Profile |
|------|-----------|-----------|
| 心率 60 | "正常" | "您是运动员体质，60是很好的静息心率" |
| 睡眠 6h | "有点少" | "考虑到您55岁，6小时其实可以接受" |
| 步数 5000 | "未达标" | "您膝盖不好，5000步已经很棒了" |

### 敏感信息处理

- 健康数据仅存储在本地 `.pha/` 目录
- 不上传到云端
- UUID 是唯一的用户标识，不关联真实身份
- 用户可随时删除自己的数据

### 隐私提示

在 SOUL.md 中包含：
```
## 隐私承诺
- 所有健康数据仅存储在您的设备上
- 我不会主动询问敏感医疗信息
- 您可以随时删除您的所有数据
```

## 10. Hybrid Search (向量 + 关键词)

基于 OpenClaw 的混合搜索实现，同时使用向量搜索和关键词搜索，加权合并结果。

### 工作原理

```
查询 "睡眠质量不好"
         │
         ▼
    ┌────┴────┐
    │         │
    ▼         ▼
 向量搜索   关键词搜索
 (Vectra)   (FTS5)
    │         │
    ▼         ▼
 语义相似    精确匹配
 的结果      的结果
    │         │
    └────┬────┘
         │
         ▼
   合并 + 加权打分
   score = 0.7 * vectorScore + 0.3 * textScore
         │
         ▼
   按分数排序返回
```

### 配置

```typescript
import { MemoryManager } from "./memory/index.js";

const memory = new MemoryManager({
  enableVectorSearch: true,
  vectorConfig: {
    embedding: {
      apiKey: process.env.OPENROUTER_API_KEY,
      model: "openai/text-embedding-3-small",
    },
  },
  hybridConfig: {
    vectorWeight: 0.7,        // 向量搜索权重
    textWeight: 0.3,          // 关键词搜索权重
    candidateMultiplier: 3,   // 候选数量倍数
  },
});

// Hybrid 搜索 (推荐)
const results = await memory.searchAsync("user-123", "睡眠质量");
```

### 打分机制

| 来源 | 分数计算 | 权重 |
|------|----------|------|
| 向量搜索 | cosine similarity (0-1) | 0.7 |
| 关键词搜索 | BM25 rank → 1/(1+rank) | 0.3 |

**最终分数** = vectorWeight × vectorScore + textWeight × textScore

### 合并逻辑

1. 分别执行向量搜索和关键词搜索
2. 按 chunk ID 合并结果
3. 如果同一 chunk 同时命中两种搜索，分数会更高
4. 按加权分数排序

### 存储结构

```
.pha/
├── vectors/
│   └── {uuid}/           # Vectra 向量索引
│       └── index.json
├── memory.db             # SQLite
│   ├── chunks            # 文本分块
│   └── chunks_fts        # FTS5 索引
└── users/
    └── {uuid}/
        ├── PROFILE.md    # 用户档案
        └── MEMORY.md     # 长期记忆
```

### 降级策略

| 条件 | 行为 |
|------|------|
| 有 API Key | Hybrid (向量 + FTS5) |
| 无 API Key | 仅 FTS5 关键词搜索 |
| FTS5 不可用 | 简单文本匹配 |
