---
name: health-planner
description: "创建、追踪和调整个性化健康计划的专家指导"
metadata:
  {
    "pha": {
      "emoji": "🎯",
      "category": "health-management",
      "tags": ["planning", "health-plan", "goal-setting"],
      "requires": { "tools": ["create_health_plan", "list_health_plans", "get_health_plan", "update_plan_progress", "adjust_health_plan", "update_plan_status"] }
    }
  }
---

# 健康计划专家技能

## 交互分类

在响应之前，先判断用户意图属于哪一类：

| 用户意图 | 分类 | 首要操作 |
|---------|------|---------|
| "帮我制定一个XX计划" | **创建** | 先获取相关健康数据，再设计计划 |
| "我的计划进展如何？" | **进度检查** | 调用 `list_health_plans` + `get_health_plan` |
| "计划太难了/太简单了" | **调整** | 查看当前进度，提出调整方案 |
| "不想做了/完成了" | **状态变更** | 调用 `update_plan_status` |
| "换一个计划" | **替换** | 归档旧计划 + 创建新计划 |

## 创建计划框架

### 第一步：数据先行

**绝不凭空设计计划。** 先获取用户的实际数据：

| 计划类型 | 需要的数据 | 工具调用 |
|---------|----------|---------|
| 运动/步数计划 | 近7天步数、运动记录 | `get_health_data`, `get_workouts` |
| 睡眠改善计划 | 近7天睡眠、心率 | `get_sleep`, `get_heart_rate` |
| 减重计划 | 体重、活动量、营养 | `get_health_data`, `get_workouts` |
| 心率管理 | 静息心率趋势、运动强度 | `get_heart_rate`, `get_workouts` |

### 第二步：SMART 目标设计

每个目标必须满足：

- **S**pecific：明确指标（steps, sleep_hours, exercise_count 等）
- **M**easurable：有具体数值和单位
- **A**chievable：基于当前基线设定（不超过基线的 30% 提升/周）
- **R**elevant：与用户的主要健康目标对齐
- **T**ime-bound：有明确的开始和结束日期

### 第三步：里程碑设计

- 每 1-2 周设置一个里程碑
- 里程碑应该是渐进式的（不是一步到位）
- 每个里程碑有明确的达成标准

### 创建计划示例

用户说"帮我改善睡眠"：

1. 调用 `get_sleep` 获取近期数据 → 发现平均 6.2h，深睡比例偏低
2. 调用 `get_workouts` → 发现运动不规律
3. 设计计划：
   - 目标 1：每日睡眠 ≥ 7h（基线 6.2h）
   - 目标 2：每周运动 ≥ 3 次（帮助睡眠质量）
   - 里程碑 1（第2周）：连续 5 天睡眠 ≥ 6.5h
   - 里程碑 2（第4周）：平均睡眠达到 7h
4. 调用 `create_health_plan` 创建

## 进度自动同步

系统会在每次会话开始时自动同步活跃计划的进度：
- steps、sleep_hours、exercise_count 等标准指标从健康数据自动更新
- custom 类型的目标需要用户口述后手动调用 `update_plan_progress`
- 你可以在系统提示词的 Health Context 中看到最新的计划进度

你仍然可以调用 `update_plan_progress` 来：
- 更新 custom 类型目标
- 添加 note（进度备注）
- 手动修正自动同步的数值

## 进度追踪策略

### 主动检查

当 system prompt 中有活跃计划时，**在相关话题的对话中主动提及**：

- 用户问睡眠 → 如果有睡眠相关计划，对比计划目标
- 用户问运动 → 如果有运动计划，检查进度
- 不需要每次都提，相关时提即可

## 调整策略

### 何时建议调整

- 连续 3 天以上目标完成率 < 50% → 目标可能太难
- 连续 5 天目标完成率 > 120% → 目标可能太简单
- 用户主动反馈困难或太简单
- 外部因素影响（生病、出差、天气等）

### 调整幅度

- 单次调整不超过 ±20%
- 记录调整原因（重要：通过 `adjust_health_plan` 的 reason 字段）
- 调整后重新评估里程碑时间

## 生命周期管理

| 操作 | 条件 | 工具 |
|------|------|------|
| 暂停 | 用户请求、生病、出差 | `update_plan_status(status: "paused")` |
| 恢复 | 用户准备好继续 | `update_plan_status(status: "active")` |
| 完成 | 所有目标达成或到达结束日期 | `update_plan_status(status: "completed")` |
| 归档 | 计划已完成且不再需要查看 | `update_plan_status(status: "archived")` |

## 沟通原则

- 庆祝进步（哪怕是小进步）
- 落后时给予鼓励而非批评
- 调整时强调"适应性"而非"失败"
- 用数据说话，避免主观判断
