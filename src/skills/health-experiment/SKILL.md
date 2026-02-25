---
name: health-experiment
description: "识别用户的健康实验/自我追踪意图，获取基线数据，创建动态仪表盘可视化进度。当用户想追踪某个健康目标、做 N of 1 实验、测试某种干预措施的效果时使用。不适用于：一次性数据查询用对应专项技能，计划制定用 health-planner，目标心理用 goal-coach"
metadata:
  {
    "pha": {
      "emoji": "🔬",
      "category": "health-management",
      "tags": ["pha", "experiment", "tracking", "dashboard", "data-analysis"],
      "requires": { "tools": ["create_dashboard", "update_dashboard", "get_heart_rate", "get_health_trends", "get_sleep", "get_workouts", "get_hrv", "get_health_data", "memory_search", "memory_save"] }
    }
  }
---

# 健康实验技能

> **核心理念**：用户说一句话，我就能理解他想追踪什么、获取相关数据、创建一个定制的可视化面板。

## 第一步：识别实验意图

不是所有健康问题都是实验。区分：

| 用户说的话 | 类型 | 正确行为 |
|-----------|------|---------|
| "我的心率是多少？" | **一次性查询** | 用 heart-monitor 回答，不创建 dashboard |
| "帮我降低静息心率" | **目标/计划** | 用 health-planner + goal-coach |
| "我想用 8 周把 RHR 从 50 降到 45，每周 3 次 Zone 2 + 1 次 HIIT" | **实验** | 本技能 — 有假设、有方案、有时间线 |
| "帮我追踪睡眠改善实验" | **实验** | 本技能 |
| "我开始吃肌酸了，帮我看看效果" | **实验** | 本技能 — 干预 + 观测 |
| "create a dashboard to track my running progress" | **实验** | 本技能 — 明确要求追踪面板 |

**实验的三要素**：
1. **追踪目标**：要观测的指标（RHR、睡眠时长、步数...）
2. **干预方案**：用户打算做什么改变
3. **时间范围**：多长时间（即使模糊也行，"几周"也算）

缺少任何一个时，自然地询问补全，不要阻塞流程。

## 第二步：解析实验参数

从用户的描述中提取结构化信息：

```
实验名称: (从意图推断，简洁描述)
追踪指标:
  - 主指标: (一个核心指标，如 RHR)
  - 辅助指标: (支持判断的指标，如 HRV、运动量)
  - 依从性指标: (是否按计划执行，如每周 Zone 2 次数)
基线值: (从 HealthKit 获取)
目标值: (用户指定或帮助设定)
干预方案: (用户计划做什么)
时间线: (总周期 + 检查点)
```

**示例解析**：

用户："I want to lower my RHR from 50 → 45 over 8 weeks with Zone 2 + HIIT"

```
实验名称: 8 周心率下降实验
追踪指标:
  - 主指标: resting_heart_rate (目标 50→45)
  - 辅助指标: hrv, max_heart_rate
  - 依从性: weekly_zone2_minutes, weekly_hiit_count
基线值: 需要从 get_heart_rate 获取实际当前值
目标值: 45 bpm
干预: Zone 2 有氧 3x/周 + HIIT 1x/周
时间线: 8 周，每周检查
```

## 第三步：获取基线数据

**先拉数据，再创建 dashboard。** 基线数据是 dashboard 的内容来源。

根据实验类型选择工具组合：

| 实验类型 | 工具调用 | 要提取的基线值 |
|---------|---------|--------------|
| 心率相关 | `get_heart_rate` + `get_hrv` + `get_workouts` | RHR 7 天均值, HRV, 运动频率 |
| 睡眠改善 | `get_sleep` + `get_health_trends` | 平均睡眠时长, 深睡占比, 入睡时间 |
| 运动提升 | `get_workouts` + `get_health_data` + `get_health_trends` | 周运动次数, 步数趋势, 活动分钟 |
| 体重/体脂 | `get_body_composition` + `get_health_data` | 体重, 体脂率, 活动量 |
| 综合健康 | `get_health_trends` | 多维度 7 天趋势 |

**重要**：用实际数据替代用户的自报值。如果用户说"我的 RHR 是 50"但数据显示是 52，用 52。

## 第四步：创建实验 Dashboard

用 `create_dashboard` 工具创建可视化面板。Dashboard 结构应该直接反映实验的逻辑：

### 标准 Dashboard 结构

```
Section 1: "实验概览" (总是有)
  - stat_row: 核心指标当前值、目标值、进度百分比
  - progress_tracker: 总体进度条

Section 2: "趋势数据" (总是有)
  - line_chart 或 bar_chart: 主指标的历史趋势
  - 如有辅助指标，再加一个 chart

Section 3: "依从性" (如果有干预方案)
  - metric_grid 或 data_table: 本周执行情况
  - 如：Zone 2 完成次数、HIIT 完成次数

Section 4: "里程碑" (如果时间线 > 2 周)
  - milestone_timeline: 关键检查点和预期目标

Section 5: "洞察" (可选)
  - text_block: 基于数据的分析总结
```

### Widget 选择指南

| 要展示什么 | 用哪个 Widget | Config 要点 |
|-----------|-------------|------------|
| 单个关键数值 | `stat_row` | items 数组，每个有 label/value/unit/icon/trend |
| 时间序列趋势 | `line_chart` | data 是 [{label: "日期", value: 数值}] |
| 分类对比 | `bar_chart` | data 是 [{label: "类别", value: 数值}] |
| 目标完成度 | `progress_tracker` | current/target/unit |
| 结构化数据 | `data_table` | columns + rows |
| 纯文字说明 | `text_block` | content + variant(heading/body/caption) |
| 时间线/里程碑 | `milestone_timeline` | entries 数组 |
| 多个小指标 | `metric_grid` | metrics 数组 + columns |

### 实际示例：心率下降实验

```json
{
  "title": "8-Week RHR Reduction Experiment",
  "subtitle": "Goal: 52 → 45 bpm via Zone 2 + HIIT",
  "icon": "heart",
  "sections": [
    {
      "title": "Current Status",
      "widgets": [
        {
          "type": "stat_row",
          "config": {
            "items": [
              {"label": "Current RHR", "value": "52", "unit": "bpm", "icon": "heart", "color": "#ef4444"},
              {"label": "Target", "value": "45", "unit": "bpm", "icon": "target", "color": "#10b981"},
              {"label": "Week", "value": "1/8", "icon": "calendar", "color": "#3b82f6"},
              {"label": "HRV", "value": "42", "unit": "ms", "icon": "activity", "color": "#8b5cf6"}
            ]
          }
        },
        {
          "type": "progress_tracker",
          "config": {"title": "RHR Progress", "current": 52, "target": 45, "unit": " bpm", "color": "#ef4444"}
        }
      ]
    },
    {
      "title": "RHR Trend",
      "widgets": [
        {
          "type": "line_chart",
          "config": {
            "title": "Resting Heart Rate (7 days)",
            "data": [
              {"label": "Mon", "value": 53},
              {"label": "Tue", "value": 51},
              {"label": "Wed", "value": 52}
            ],
            "yLabel": "bpm",
            "color": "#ef4444"
          }
        }
      ]
    },
    {
      "title": "This Week's Compliance",
      "widgets": [
        {
          "type": "metric_grid",
          "config": {
            "metrics": [
              {"label": "Zone 2 Sessions", "value": "2/3", "icon": "activity", "color": "#10b981"},
              {"label": "HIIT Sessions", "value": "0/1", "icon": "zap", "color": "#f97316"},
              {"label": "Total Training Min", "value": "95", "unit": "min", "icon": "timer", "color": "#3b82f6"}
            ],
            "columns": 3
          }
        }
      ]
    },
    {
      "title": "Milestones",
      "widgets": [
        {
          "type": "milestone_timeline",
          "config": {
            "entries": [
              {"date": "Week 1-2", "title": "Adaptation", "description": "Establish Zone 2 routine, baseline HRV", "status": "current"},
              {"date": "Week 3-4", "title": "Building", "description": "Target RHR ~50, increase Z2 duration", "status": "upcoming"},
              {"date": "Week 5-6", "title": "Intensify", "description": "Add HIIT intensity, target RHR ~48", "status": "upcoming"},
              {"date": "Week 7-8", "title": "Peak & Assess", "description": "Target RHR 45, full assessment", "status": "upcoming"}
            ]
          }
        }
      ]
    }
  ]
}
```

## 第五步：刷新与持续追踪

当用户再次访问 dashboard 并点击"刷新"，或者询问实验进展时：

1. **重新获取最新数据**（同第三步的工具调用）
2. **计算变化**：对比基线值和当前值
3. **调用 `update_dashboard`**：用新数据更新所有 widget
4. **提供文字洞察**：在 text_block 中写明：
   - 主指标变化方向和幅度
   - 依从性评估（是否按计划执行）
   - 是否需要调整方案

**刷新时的 update_dashboard 调用**：
- `dashboardId`：使用创建时返回的 ID
- `sections`：完整替换所有 section（用最新数据）
- 可选更新 `title`/`subtitle`（如进入新阶段）

## 第六步：实验感知的对话

建立实验后，在相关对话中保持实验意识：

**用户问心率**（有活跃的心率实验）：
→ 回答心率数据后，关联到实验："顺便说，你的心率下降实验目前 RHR 从 52 降到了 50，比计划的第 2 周目标提前了。"

**用户问运动**（有活跃的心率实验）：
→ 评估运动后，检查依从性："这周你完成了 2 次 Zone 2 训练，还差 1 次就达到本周目标了。"

## 记忆与个性化

**创建实验时必须保存：**
- `memory_save`："实验开始：8 周 RHR 下降实验。基线 RHR=52, HRV=42。目标 45 bpm。方案：Zone 2 x3/周 + HIIT x1/周。Dashboard ID: dash_xxx"

**刷新时保存关键节点：**
- `daily_log`："RHR 实验 Week 2：RHR 从 52 降到 50 (-2)，HRV 从 42 升到 45 (+3)。Zone 2 依从性 100%，HIIT 依从性 75%。"

**搜索记忆：**
- `memory_search("experiment")` — 创建新实验前，检查是否有活跃实验
- `memory_search("dashboard")` — 检查已有的 dashboard ID，用于 update

## 红线

| 情况 | 处理 |
|------|------|
| 用户设定不切实际的实验目标（如 1 周降 RHR 10 bpm） | "RHR 的生理适应需要时间。根据运动科学研究，8-12 周通过规律有氧训练可以降低 3-8 bpm。我建议把目标调到更现实的范围。" |
| 用户想同时追踪太多实验 | "每个实验都需要注意力才能有效。我建议先聚焦 1-2 个核心实验，其他的可以作为观察指标而非主动追踪。" |
| 实验涉及停药或改变医疗方案 | "这涉及医疗决策，我无法给出建议。请与你的医生讨论。我可以帮你追踪健康指标的变化，但方案调整需要医生指导。" |
| 数据长期无变化但用户坚持原方案 | "已经 3 周没有明显变化了。这可能说明当前方案的刺激不够。我们需要考虑：(1) 增加训练量/强度 (2) 改变训练类型 (3) 检查恢复是否充足。" |
