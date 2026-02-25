---
name: dynamic-dashboard
description: "使用 create_dashboard / update_dashboard 工具为用户创建自定义可视化仪表盘。当用户需要追踪进度、对比数据、可视化趋势、创建 dashboard 时使用此技能。本技能定义了 11 种 widget 类型的具体配置格式和最佳实践。"
metadata:
  {
    "pha": {
      "emoji": "📊",
      "category": "health-management",
      "tags": ["pha", "dashboard", "visualization", "tracking", "data-analysis"],
      "requires": { "tools": ["create_dashboard", "update_dashboard"] }
    }
  }
---

# Dynamic Dashboard 技能

使用 `create_dashboard` 和 `update_dashboard` 工具，为用户创建自定义可视化页面。

## 何时创建 Dashboard

用户表达以下意图时，创建 dashboard：
- "帮我追踪 XX" / "track my XX"
- "创建一个仪表盘" / "create a dashboard"
- "我想可视化 XX 的进度"
- "帮我做一个 XX 实验" — 需要持续追踪的目标
- "对比一下我最近的 XX 数据"

**不需要** dashboard 的场景：一次性数据查询（"我的心率是多少"）、简单问答。这些用 `present_insight` 就够了。

## 流程

```
1. 理解用户要追踪什么
2. 用健康数据工具获取实际数据
   - 单日详情: get_heart_rate、get_sleep、get_activity
   - 多日趋势: get_health_trends (支持 7d/30d/90d，返回每日聚合)
3. 用数据填充 widget → 调用 create_dashboard
4. 用户点刷新或问进展 → 重新拉数据 → 调用 update_dashboard
```

**关键**：
- 先拉数据，再创建 dashboard。Dashboard 里的数值必须来自真实数据，不要编造。
- 需要多天趋势数据时，用 `get_health_trends` 而非多次调用单日接口。
- 图表 data 格式必须是 `{ label, value }` 数组（label=X轴，value=Y轴）。

## create_dashboard 参数

```
{
  "title": "仪表盘标题",
  "subtitle": "可选副标题",
  "icon": "heart",           // 可用: heart, activity, moon, brain, target, flame, footprints 等
  "sections": [
    {
      "title": "分区标题（可选）",
      "widgets": [
        { "type": "widget_type", "config": { ... } }
      ]
    }
  ]
}
```

## 11 种 Widget 及其 Config

### 1. stat_row — 指标卡片行

一行显示多个关键数值。**Dashboard 第一个 widget 通常是 stat_row。**

```json
{
  "type": "stat_row",
  "config": {
    "items": [
      {
        "label": "静息心率",
        "value": "52",
        "unit": "bpm",
        "icon": "heart",
        "color": "#ef4444",
        "trend": { "direction": "down", "value": "-2" }
      },
      {
        "label": "目标",
        "value": "45",
        "unit": "bpm",
        "icon": "target",
        "color": "#10b981"
      }
    ],
    "columns": 4
  }
}
```

- `items`: 数组，每个是一张卡片
- `columns`: 可选，默认等于 items 数量。建议 3-4 列
- `trend.direction`: "up" | "down" | "stable"
- `icon`: 可用图标见系统说明
- `color`: 十六进制颜色

### 2. line_chart — 折线图

展示时间序列趋势。

```json
{
  "type": "line_chart",
  "config": {
    "title": "静息心率趋势（近 7 天）",
    "data": [
      { "label": "2/19", "value": 53 },
      { "label": "2/20", "value": 51 },
      { "label": "2/21", "value": 52 },
      { "label": "2/22", "value": 50 }
    ],
    "yLabel": "bpm",
    "color": "#ef4444"
  }
}
```

- `data`: `{ label, value }` 数组，label 是 x 轴标签，value 是 y 轴数值
- `title`: 图表标题
- `color`: 线条颜色

### 3. bar_chart — 柱状图

展示分类对比。

```json
{
  "type": "bar_chart",
  "config": {
    "title": "本周运动时长",
    "data": [
      { "label": "Mon", "value": 45 },
      { "label": "Tue", "value": 0 },
      { "label": "Wed", "value": 30 },
      { "label": "Thu", "value": 60 }
    ],
    "yLabel": "min",
    "color": "#10b981"
  }
}
```

### 4. progress_tracker — 进度条

展示目标完成度。**下降目标必须设置 baseline！**

```json
{
  "type": "progress_tracker",
  "config": {
    "title": "RHR 下降进度",
    "baseline": 71,
    "current": 65,
    "target": 60,
    "unit": " bpm",
    "color": "#8b5cf6"
  }
}
```

- `baseline`: 起始值（**下降目标必填**）。如 RHR 从 71 降到 60，baseline=71
- `current`: 当前值
- `target`: 目标值
- 进度计算：有 baseline 时 = (baseline - current) / (baseline - target)；无 baseline 时 = current / target
- **重要**：当目标是降低某个指标时（如降心率），必须提供 baseline，否则进度会计算错误

### 5. data_table — 数据表格

展示结构化数据。

```json
{
  "type": "data_table",
  "config": {
    "columns": [
      { "key": "week", "label": "Week" },
      { "key": "rhr", "label": "RHR (bpm)" },
      { "key": "z2_min", "label": "Zone 2 (min)" },
      { "key": "hiit", "label": "HIIT" }
    ],
    "rows": [
      { "week": "Week 1", "rhr": "52", "z2_min": "90", "hiit": "1x" },
      { "week": "Week 2", "rhr": "50", "z2_min": "120", "hiit": "1x" }
    ]
  }
}
```

### 6. text_block — 文本块

展示分析总结或说明。

```json
{
  "type": "text_block",
  "config": {
    "content": "RHR 已从基线 52 下降到 50，降幅 3.8%。趋势符合预期，继续当前方案。",
    "variant": "body"
  }
}
```

- `variant`: "heading" | "subheading" | "body" | "caption"

### 7. milestone_timeline — 里程碑时间线

展示阶段计划和进度。

```json
{
  "type": "milestone_timeline",
  "config": {
    "entries": [
      {
        "date": "Week 1-2",
        "title": "适应期",
        "description": "建立 Zone 2 训练习惯",
        "status": "completed"
      },
      {
        "date": "Week 3-4",
        "title": "提升期",
        "description": "增加训练量，目标 RHR 50",
        "status": "current"
      },
      {
        "date": "Week 5-8",
        "title": "强化期",
        "description": "加入 HIIT，目标 RHR 45",
        "status": "upcoming"
      }
    ]
  }
}
```

- `status`: "completed" | "current" | "upcoming"

### 8. metric_grid — 指标网格

展示多个小指标，比 stat_row 更紧凑。

```json
{
  "type": "metric_grid",
  "config": {
    "metrics": [
      { "label": "Zone 2", "value": "2/3", "icon": "activity", "color": "#10b981" },
      { "label": "HIIT", "value": "1/1", "icon": "zap", "color": "#f97316" },
      { "label": "总时长", "value": "135", "unit": "min", "icon": "timer", "color": "#3b82f6" }
    ],
    "columns": 3
  }
}
```

### 9. score_gauge — 环形评分

圆环仪表盘，适合展示评分、完成率。颜色随阈值自动变化（红→黄→绿）。

```json
{
  "type": "score_gauge",
  "config": {
    "label": "睡眠评分",
    "value": 81,
    "max": 100,
    "size": "lg"
  }
}
```

- `value`: 当前得分
- `max`: 满分（默认 100）
- `size`: "sm" | "md" | "lg"
- `thresholds`: 可选，自定义颜色阈值。默认 `[{value:30, color:"#ef4444"}, {value:60, color:"#f59e0b"}, {value:100, color:"#10b981"}]`

### 10. activity_rings — 活动环

Apple Watch 风格同心环，适合同时展示多个目标完成度。

```json
{
  "type": "activity_rings",
  "config": {
    "rings": [
      { "label": "步数", "value": 8500, "max": 10000, "color": "#ef4444" },
      { "label": "运动", "value": 25, "max": 30, "color": "#10b981" },
      { "label": "站立", "value": 10, "max": 12, "color": "#3b82f6" }
    ]
  }
}
```

- `rings`: 数组，从外到内。建议 2-4 环
- 每环：label（图例文字）、value（当前值）、max（目标值）、color（环颜色）

### 11. radar_chart — 雷达图

多维度对比，适合能力画像、健康维度评估。

```json
{
  "type": "radar_chart",
  "config": {
    "title": "健康维度评估",
    "data": [
      { "subject": "心肺", "score": 0.8 },
      { "subject": "睡眠", "score": 0.7 },
      { "subject": "活动", "score": 0.6 },
      { "subject": "压力", "score": 0.5 },
      { "subject": "恢复", "score": 0.75 }
    ],
    "series": [
      { "key": "score", "name": "当前", "color": "#3b82f6" }
    ]
  }
}
```

- `data`: 数组，每项必须有 `subject`（维度名）和各 series 的 key
- `series`: 定义有几条线（可以多条对比，如"本周" vs "上周"）
- 数值范围建议 0-1（会自动显示为百分比）

## Dashboard 结构最佳实践

一个好的 dashboard 从上到下的信息密度递减：

```
Section 1: 核心状态（stat_row / score_gauge / activity_rings）
Section 2: 趋势（line_chart / bar_chart / radar_chart）
Section 3: 目标（progress_tracker — 有下降目标必须设 baseline）
Section 4: 详情（data_table / metric_grid）
Section 5: 计划（milestone_timeline）
Section 6: 总结（text_block — 文字分析，可选）
```

**选型建议**：
- 单个评分 → `score_gauge`（如睡眠评分 81/100）
- 多个目标同时展示 → `activity_rings`（如步数+运动+站立）
- 多维度对比 → `radar_chart`（如心肺/睡眠/活动/压力/恢复）
- 下降型目标 → `progress_tracker` + `baseline`（如 RHR 71→60）
- 时间序列 → `line_chart`（趋势）或 `bar_chart`（分类对比）

不是每个 dashboard 都需要全部 section，根据用户需求选择。简单追踪可能只需要 stat_row + line_chart。

## update_dashboard 参数

刷新时重新拉取数据后调用：

```
{
  "dashboardId": "创建时返回的 ID",
  "title": "可选更新标题",
  "subtitle": "可选更新副标题",
  "sections": [ ... ]          // 完整替换所有 section
}
```

**刷新流程**：
1. 用户点刷新 / 问进展
2. 重新调用健康数据工具获取最新值
3. 用新数据重建所有 widget
4. 调用 `update_dashboard`，传入完整的 sections

## 颜色参考

| 用途 | 颜色 | Hex |
|------|------|-----|
| 心率/警示 | 红 | #ef4444 |
| 达标/正面 | 绿 | #10b981 |
| 信息/中性 | 蓝 | #3b82f6 |
| 进度/紫 | 紫 | #8b5cf6 |
| 运动/能量 | 橙 | #f97316 |
| 睡眠 | 靛 | #6366f1 |

## 限制

- 每个会话最多 5 个 dashboard
- Dashboard 不持久化（刷新页面后会丢失）
- 创建后侧边栏自动出现入口
