---
name: incident-triager
description: "Incident 分诊专家 — 系统化处理 pending incidents：搜索日志定位根因、分类确认、决定后续动作（GitHub Issue / TestCase / 关闭）"
metadata:
  {"pha": {"emoji": "alert-triangle", "category": "evolution", "tags": ["sa", "incident", "triage"], "type": "system", "requires": {"tools": ["list_incidents", "get_incident", "search_llm_logs", "update_incident_status", "update_incident_type", "update_incident_trace", "create_github_issue_for_incident", "convert_incident_to_test_case"]}}}
---

# Incident 分诊专家

这是一个**系统技能**，定义了 SA 如何系统化处理 pending incidents，包括：搜索 LLM 日志定位根因、分类确认、决定后续动作。

---

## 分诊工作流（5步）

### Step 1 — List：获取待处理 incidents

```
list_incidents(status="pending")
```

- 若无 pending incidents，报告 "当前没有待分诊的 incidents" 并结束
- 按 priority 排序处理（high → medium → low）

### Step 2 — Get Detail：获取 incident 完整信息

```
get_incident(id=<incidentId>)
```

关注字段：
- `rawText`：原始描述（用户原话）
- `timestamp`：发生时间（用于日志搜索）
- `traceId`：已有 trace 关联（有则直接跳到 Step 4）
- `classificationConfidence`：AI 分类置信度
- `type`：当前类型（`unclassified` 则需要分类）

### Step 3 — Search Logs：搜索 LLM 日志定位根因

当 `traceId` 为空时，通过时间窗口搜索日志：

```
search_llm_logs(incidentId=<id>, windowMinutes=60)
```

分析返回的 `entries`：
- `userMessage`：用户说了什么
- `assistantResponse`：助手回复了什么
- `toolCalls`：调用了哪些工具

**判断根因**：
- 工具返回了错误数据 → `bug`
- 助手理解正确但回复质量差 → `effect`
- 日志窗口内找不到相关对话 → 尝试扩大 `windowMinutes=180`
- 仍找不到 → `unclassified`，记录 notes 说明

**关联 trace**（找到相关日志后）：

```
update_incident_trace(id=<incidentId>, traceId=<requestTime>, notes="根因分析：...")
```

### Step 4 — Classify：分类确认

根据根因分析结果更新类型：

```
update_incident_type(id=<incidentId>, type=<"bug"|"effect"|"unclassified">, priority=<"high"|"medium"|"low">, notes="...")
```

**分类规则**：

| 场景 | 类型 | Priority |
|------|------|----------|
| 工具/数据错误（功能性 bug） | `bug` | high |
| 助手逻辑错误、越界建议、遗漏关键信息 | `bug` | medium |
| 回复质量差但无错误（措辞、结构、深度） | `effect` | medium/low |
| 用户误操作、重复反馈已知问题 | `effect` | low |
| 信息不足，无法判断 | `unclassified` | low |

### Step 5 — Action：决定后续动作

#### Bug 类

```
# 1. 确认状态
update_incident_status(id=<id>, status="confirmed", notes="确认为 bug：...")

# 2. 创建 GitHub Issue
create_github_issue_for_incident(id=<id>, additionalContext="根因：...\n重现步骤：...")
```

#### Effect 类（算法/质量问题）

```
# 1. 确认状态
update_incident_status(id=<id>, status="confirmed")

# 2. 判断是否需要创建 GitHub Issue
# - 高优先级 effect / 影响范围广 → create_github_issue_for_incident
# - 低优先级 / 已有同类 issue → 跳过，直接记录 notes

# 3. 判断是否转为 TestCase（仅在 effect 类且有可复现 query 时）
convert_incident_to_test_case(
  id=<id>,
  category=<"health-data-analysis"|"health-coaching"|"safety-boundaries"|"personalization-memory"|"communication-quality">,
  query="...",
  shouldMention=["..."],
  shouldNotMention=["..."],
  minScore=70
)
```

#### Unclassified 类

```
update_incident_status(id=<id>, status="suspended", notes="信息不足，挂起等待更多上下文")
```

---

## 决策框架

### 何时创建 GitHub Issue

- **Bug（功能性错误）**：必须创建
- **Effect（高优先级）**：建议创建，标注 `priority:high`
- **Effect（低优先级）**：若已有类似 issue，跳过

### 何时 convert TestCase

- `type === "effect"` 且 `status === "confirmed"`
- 有可复现的用户 query
- 问题具有代表性（不是一次性偶发）

### 何时 suspend

- 信息不足、日志找不到、上下文模糊
- 疑似用户误操作但需要确认

### 何时 close（不处理）

- 重复 incident（已有相同 GitHub Issue）
- 低优先级 effect，且不值得创建 TestCase

---

## 输出格式（分诊报告）

完成分诊后，输出 Markdown 报告：

```markdown
## Incident 分诊报告

**时间**：YYYY-MM-DD HH:mm
**处理数量**：N 个 incidents

### 分诊结果

| Incident ID | 类型 | 优先级 | 根因摘要 | 动作 |
|-------------|------|--------|---------|------|
| inc-xxx     | bug  | high   | 工具返回错误数据 | 创建 GitHub Issue #42 |
| inc-yyy     | effect | medium | 回复措辞模糊 | 转为 TestCase |
| inc-zzz     | unclassified | low | 日志中找不到对应记录 | 挂起 |

### 需要关注的高优先级 Bug

- **inc-xxx**：[简要描述根因和影响]

### 建议下一步

- [ ] 修复 GitHub Issue #42（工具数据错误）
- [ ] 在下次 Benchmark 运行后评估 effect 类改进
```

---

## 注意事项

1. **时间窗口**：`windowMinutes=60` 是默认值。若用户反馈在下班后/夜间，考虑扩大到 180 分钟
2. **日志搜索失败**：search_llm_logs 无结果时，查看 `.pha/llm-logs/` 目录是否有对应日期的文件
3. **批量分诊**：一次处理多个 incidents 时，每个 incident 独立走完 5 步流程
4. **trace_id 格式**：使用 `search_llm_logs` 返回的 `requestTime`（ISO 8601）作为 traceId
