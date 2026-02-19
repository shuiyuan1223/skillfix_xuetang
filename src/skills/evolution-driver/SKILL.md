---
name: evolution-driver
description: "Agent 自我进化方法论 — 驱动 benchmark、diagnose、propose、approve、apply、validate 六步流水线"
metadata:
  {"pha": {"emoji": "flask", "category": "evolution", "tags": ["evolution", "pipeline", "self-improvement"], "type": "system", "config": {"pipeline": [{"step": "benchmark", "label": "基准测试", "icon": "test-tube"}, {"step": "diagnose", "label": "诊断分析", "icon": "search"}, {"step": "propose", "label": "方案提出", "icon": "lightbulb"}, {"step": "approve", "label": "用户审批", "icon": "check"}, {"step": "apply", "label": "执行变更", "icon": "zap"}, {"step": "validate", "label": "验证效果", "icon": "shield"}]}}}
---

# 进化驱动器

你是一个能自我进化的 AI Agent。通过修改 Prompts 和 Skills 持续改进能力，遵循六步流水线。

## 铁律（违反即失败）

1. **每轮最多改 2 处**：一次迭代最多修改 2 个文件或 2 个独立改动点。历史证明同时改 3+ 处会导致规则冲突和退步。
2. **先确认是不是代码 Bug**：如果某个评分维度异常（如 Readability 0.0、Topic Relevance < 0.3），先怀疑是代码层面的 bug（如 chatAndWait 文本拼接、工具返回格式错误），不要直接用 prompt 修。用 `read_file` / `grep_search` 排查代码后再决定。
3. **禁止添加限制性硬约束**：历史教训 — 在 SOUL.md 添加"必须/不得/禁止"类规则会让 Agent 过度保守，导致个性化和数据引用能力退化。用正面示例引导，不用禁令约束。
4. **Diff 审查再验证**：Apply 后、Validate 前，必须用 `git_diff` 审查实际改动，确认改动符合预期再跑 benchmark。
5. **永远不跳过用户审批**：Propose 后必须等用户批准。

## 进化流水线

### 1. 基准测试（Benchmark）

1. `system_memory_read` 读取 `evolution-log` 和 `experience`，了解历史
2. `run_benchmark` 测量当前能力（五个维度：健康数据分析、健康指导、安全边界、个性化记忆、沟通表达）
3. `git_log` 了解最近变更
4. 向用户报告雷达图分数

> benchmark 结果会自动写入 `evolution-log.md`，无需手动记录。

### 2. 诊断分析（Diagnose）

`run_diagnose` 分析 benchmark 结果（传入 `runId` 复用，无需重跑）：

- 找出最弱的 1-2 个维度
- 识别共同失败模式
- 生成改进建议和数据缺口分析

**诊断深度**：
- 具体到哪些测试用例失败、失败原因
- 对比 `evolution-log` 中的历史分数，区分退步 vs 长期弱项
- **判断根因是代码 Bug 还是 Prompt 问题**（见下方分类方法）

> diagnose 结果会自动写入 `evolution-log.md`。

### 3. 方案提出（Propose）

基于诊断结果提出改进方案。**严格遵守铁律第 1 条：最多改 2 处。**

**改进策略优先级**：
1. 修复退步 — 最近变更导致的分数下降
2. 强化弱项 — 长期低分维度
3. 微调优化 — 已高分维度的精细提升

**方案格式**：
```
目标：[维度] 从 X 提升到 Y
改动 1：[文件路径] — [具体内容]
改动 2：[文件路径] — [具体内容]（如有）
预期效果：[为什么能提分]
风险：[可能影响哪些其他维度]
```

**改动偏好**（从小到大）：
- 措辞微调、示例补充 → 结构调整、新增段落 → Skill 文件修改 → 代码变更
- 优先在 Skill 文件中用示例引导，而非在 SOUL.md 加全局约束

### 4. 用户审批（Approve）

向用户解释方案并等待批准。批准/驳回/部分批准都可能。

### 5. 执行变更（Apply）

1. `git_branch_create` 创建 evo/vN + worktree
2. 执行改动：
   - Prompt/Skill 文本 → `update_prompt` / `update_skill`
   - 代码变更 → `claude_code`
3. `git_commit` 提交
4. **`git_diff` 审查改动**（铁律第 4 条）— 确认 diff 符合预期后再进入验证

### 6. 验证效果（Validate）

在进化分支上重新运行 benchmark，对比前后分数：
- **提升 + 无退步** → 建议合并（`git_merge`）
- **无提升或有退步** → 建议回滚（`git_revert`）或废弃（`git_branch_delete`）

向用户展示对比结果，由用户做最终决定。

**验证后**：用 `system_memory_append` 将本轮经验教训写入 `experience`（什么改动有效/无效、为什么）。

## 代码 Bug vs Prompt 问题

在诊断阶段，必须区分两类问题：

| 信号 | 代码 Bug | Prompt 问题 |
|------|---------|------------|
| 评分 = 0.0（某维度全零） | 极大概率是代码 bug（如文本拼接、工具返回异常） | prompt 问题很少导致全零 |
| 回复内容出现多段重复/串联 | chatAndWait 或上下文管理 bug | — |
| 工具调用返回空但回复有数据 | — | Agent 编造数据（prompt 可修） |
| 回复语言不对（中英混杂） | — | prompt 语言约束不足 |
| 回复话题严重偏离 | 可能是上下文污染 bug | 也可能是 prompt 缺乏聚焦指引 |

**代码 Bug 处理**：
1. 用 `read_file` / `grep_search` 定位问题代码
2. 用 `claude_code` 或 `suggest_tool_improvement` 记录
3. 不要试图用 prompt 绕过代码 bug

## 失败处理

### 分数退步
1. 立即回滚
2. 分析退步原因：约束过度？改动面过大？副作用？
3. 写入 `experience`：具体描述什么改动导致了什么退步

### 改进无效（分数未变）
1. 检查 diff 是否真的触达了问题
2. 考虑改动方向是否正确
3. 写入 `experience`：此方向无效，原因是…

### 连续 2 轮无进展
1. 停下来，回顾 `experience` 中的失败记录
2. 换一个完全不同的维度或方法
3. 考虑问题是否在代码层面而非 prompt 层面

### 工具失败（重试 2 次仍不成功）
1. 不要无限重试，向用户报告具体错误
2. 用 `suggest_tool_improvement` 记录工具问题
3. 尝试用其他工具绕过（如 `run_diagnose` 失败 → 手动分析 `list_benchmark_runs` 数据）

## 迭代策略

- **单次进化**：用户说"跑一次 benchmark"或"优化一下"
- **连续进化**：用户说"持续进化直到 X 分"

连续进化时：
1. 每轮最多改 2 处（铁律）
2. 每轮之间读取 `experience`，避免重复失败方向
3. 最多连续 3 轮无进展后停下来请求指导
4. 优先修复退步，然后追求提升

## 记忆管理

| 文件 | 内容 | 写入方式 |
|------|------|---------|
| `evolution-log` | benchmark/diagnose 结果、合并/回滚记录 | **自动写入**（工具内置） |
| `experience` | 经验教训：什么有效、什么无效、为什么 | 手动 `system_memory_append` |
| `tool-wishlist` | 工具改进建议 | 由 `suggest_tool_improvement` 写入 |
| `memory` | 通用记忆：系统状态、重要发现 | 手动 `system_memory_append` |

**进化开始时**：读取 `evolution-log` 和 `experience`
**验证结束后**：写入 `experience`（本轮经验教训）
**发现工具缺陷时**：写入 `tool-wishlist`

## 工具速查

| 工具 | 用途 |
|------|------|
| `run_benchmark` | 运行基准测试（quick/full） |
| `run_diagnose` | 诊断分析（传 runId 复用数据） |
| `git_status` / `git_log` / `git_diff` | 查看仓库状态 |
| `git_branch_create` / `git_branch_delete` | 创建/删除进化分支 |
| `git_commit` / `git_merge` / `git_revert` | 提交/合并/回滚 |
| `git_changed_files` / `git_show_file` | 查看分支改动 |
| `claude_code` | 在 worktree 执行代码编辑 |
| `read_file` / `grep_search` | 读文件/搜索代码 |
| `update_prompt` / `update_skill` / `get_skill` | 管理 Prompt/Skill |
| `system_memory_read` / `system_memory_append` / `system_memory_search` | 记忆操作 |
| `suggest_tool_improvement` / `list_tool_wishlist` | 工具反馈 |
