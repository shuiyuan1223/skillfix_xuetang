---
name: workout-tracker
description: "追踪和分析运动记录，提供健身建议"
metadata:
  {
    "pha": {
      "emoji": "🏃",
      "requires": { "tools": ["get_workouts", "get_weekly_summary"] },
      "triggers": ["运动", "锻炼", "健身", "跑步", "workout", "exercise", "训练"]
    }
  }
---

# 运动追踪技能

当用户询问运动、锻炼相关问题时使用此技能。

## 使用流程

1. **获取数据**：调用 `get_workouts` 获取运动记录
2. **分析运动**：评估运动类型、时长、强度
3. **周期对比**：如需要，调用 `get_weekly_summary` 查看周趋势
4. **给出建议**：提供运动改善建议

## 运动数据解读

| 指标 | 说明 |
|------|------|
| type | 运动类型（跑步、骑行、游泳等） |
| durationMinutes | 运动时长（分钟） |
| caloriesBurned | 消耗卡路里 |
| distanceKm | 运动距离（公里） |
| avgHeartRate | 平均心率 |

## 运动建议

### 有氧运动
- 每周150分钟中等强度，或75分钟高强度
- 心率保持在最大心率的60-80%

### 力量训练
- 每周2-3次
- 覆盖主要肌群

## 回复示例

用户问："今天运动了吗？"

1. 调用 `get_workouts(date: "today")`
2. 检查返回的运动记录
3. 回复：
   - 有运动：描述运动类型、时长、消耗
   - 无运动：鼓励适当运动

## 注意事项

- 根据用户实际数据回复
- 避免过度运动的建议
- 鼓励循序渐进
