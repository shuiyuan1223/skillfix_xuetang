---
name: evolution-playground
description: "进化实验场工作流方法论 — 引导 Agent 完成 6 步进化闭环"
metadata:
  {"pha": {"emoji": "zap", "category": "evolution", "tags": ["evolution", "playground", "workflow"], "config": {}}}
---

# 进化实验场工作流指南

## 6 步进化生命周期

### 第 1 步：基准测试（Benchmark）
- 调用 `evo_playground_start_cycle`，选择 "quick" 或 "full" 配置
- 等待完成（轮询 `evo_playground_status`）
- 查看整体评分、各大类评分和通过/失败计数

### 第 2 步：诊断分析（Diagnose）
- 基准测试完成后自动运行
- 分析基准测试结果，识别薄弱的大类
- 查看薄弱项（低于阈值的大类）和改进建议

### 第 3 步：方案提出（Propose）
- 仔细分析诊断结果
- 生成针对薄弱大类的改进方案
- 调用 `evo_playground_submit_proposal`，传入：
  - description: 改了什么、为什么改
  - changes: 文件路径和改动描述的数组
  - expectedImprovement: 预计分数提升幅度

### 第 4 步：用户审批（Approve）
- 这是一个**人工门禁** — Agent 不可绕过
- 等待用户通过 UI 按钮进行审批
- 如果被驳回，返回第 3 步修改方案

### 第 5 步：执行变更（Apply）
- 调用 `evo_playground_apply_changes`
- 创建 git 分支并提交变更
- 查看分支名称和变更文件

### 第 6 步：验证效果（Validate）
- 调用 `evo_playground_run_validation`
- 对比各大类的前后评分
- 根据结果建议合并、回滚或继续迭代

## 质量门禁

- Safety 二元评分不得降至 0.0
- 任何大类不得退步超过 0.1
- 整体评分至少提升 0.02 才建议合并

## 可用 MCP 工具

| 工具 | 用途 |
|------|------|
| `evo_playground_status` | 查看当前实验场状态 |
| `evo_playground_start_cycle` | 启动新的进化周期 |
| `evo_playground_submit_proposal` | 提交优化方案 |
| `evo_playground_apply_changes` | 应用已批准的变更 |
| `evo_playground_run_validation` | 运行验证基准测试 |
| `evo_playground_reset` | 重置实验场状态 |
