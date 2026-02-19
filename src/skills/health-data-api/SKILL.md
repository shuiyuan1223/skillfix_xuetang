---
name: health-data-api
description: "内部健康数据周期统计 API 使用指南 — 运动统计、健康指标统计、群体基线对比"
metadata:
  {
    "pha": {
      "emoji": "🔌",
      "category": "health-management",
      "tags": ["pha", "api", "data-source", "integration"],
      "requires": { "tools": [] }
    }
  }
---

# 内部健康数据 API 使用指南

本 Skill 描述通过远程 MCP 服务接入的华为健康设备**周期统计接口**。所有接口返回的是日期范围内的**聚合统计值**（avg/max/min/sum/count），而非逐条原始数据。

配置位于 `.pha/config.json` 的 `mcp.remoteServers`，未配置时这些工具不可用。

---

## 通用约定

### 日期格式

所有日期参数为 **`yyyyMMdd` 整数**（非字符串）：

```
startDay: 20240101    ✅
startDay: "2024-01-01" ❌
```

### 通用参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `startDay` | int | ✅ | 起始日期，格式 `yyyyMMdd` |
| `endDay` | int | ✅ | 结束日期，格式 `yyyyMMdd` |
| `uid` | int | ✅ | 用户 ID |

### 通用响应结构

所有接口返回 `results[]` 数组，每项包含：

```json
{
  "fieldName": "字段名",
  "fieldFormat": "Integer",
  "unit": "单位",
  "startDay": 20240101,
  "endDay": 20250701,
  "statistics": {
    "avg": 42,
    "max": 78,
    "min": 15,
    "sum": 15330,
    "count": 365
  }
}
```

`statistics` 中**仅返回该字段支持的统计项**，不支持的不出现。

---

## 一、运动周期统计

### getExerciseStatistics

查询指定运动类型在日期范围内的统计数据。

**额外参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `activityType` | int | ✅ | 运动类型编码，见下表 |

#### activityType 映射表

| 编码 | 名称 | 类别 |
|:----:|------|------|
| 56 | 户外跑步 | 跑步 |
| 57 | 室内跑步 | 跑步 |
| 130 | 越野跑 | 跑步 |
| 13 | 户外骑行 | 骑行 |
| 97 | 室内骑行 | 骑行 |
| 110 | 动感单车 | 骑行 |
| 90 | 户外步行 | 步行 |
| 127 | 室内步行 | 步行 |
| 30 | 徒步 | 步行 |
| 129 | 登山 | 登山 |
| 37 | 跳绳 | 跳绳 |

#### 各类别返回字段

**跑步类 (56/57/130)**：totalDistance(m)、totalTime(ms)、totalCalories(cal)、totalSteps、avgPace(s/km)、bestPace(s/km)、avgStepRate(steps/min)、avgStride(cm)、avgHeartRate、maxHeartRate(bpm)、vo2max(mL/kg/min)、runningAbility、creepingWave(dm)、totalDescent(dm)、以及触地时间/垂直振幅/着地方式等跑姿指标、any(次数)

**骑行类 (13/97/110)**：totalDistance(m)、totalTime(s)、totalCalories(cal)、avgSpeed(km/h)、avgHeartRate(bpm)、maxHeartRate(bpm)、creepingWave(dm)、totalDescent(dm)、any(次数)

**步行类 (90/127/30) 和登山 (129)**：totalDistance(m)、totalTime(ms)、totalCalories(cal)、totalSteps、avgHeartRate(bpm)、maxHeartRate(bpm)、avgPace(s/km)、any(次数)

**跳绳 (37)**：totalTime(ms)、totalCalories(cal)、avgHeartRate(bpm)、maxHeartRate(bpm)、skipNum(个数)、skipSpeed(count/min)、maxSkipSpeed(count/min)、maxSkippingTimes(最多连跳)、interruptTimes(中断次数)、stumblingRope(绊绳次数)、any(次数)

---

## 二、健康周期统计

以下接口参数统一为 `startDay` + `endDay` + `uid`，无需额外参数。

### 2.1 getStressStatistics — 压力

| fieldName | 名称 | 统计项 |
|-----------|------|--------|
| `stressScore` | 压力得分 | MAX, MIN, AVG, COUNT |

### 2.2 getEmotionStatistics — 情绪

| fieldName | 名称 | 统计项 |
|-----------|------|--------|
| `happyCount` | 愉悦次数 | SUM |
| `peaceCount` | 平静次数 | SUM |
| `unHappyCount` | 不愉悦次数 | SUM |
| `allCount` | 检测总次数 | SUM |

### 2.3 getSleepStatistics — 睡眠

| fieldName | 名称 | unit | 统计项 | 备注 |
|-----------|------|------|--------|------|
| `avgHeartrate` | 睡眠平均心率 | — | MAX, MIN, AVG | |
| `avgSpO2` | 睡眠平均血氧 | % | MAX, MIN, AVG | |
| `avgHrv` | 睡眠 HRV | — | MAX, MIN, AVG | |
| `avgBreathrate` | 睡眠呼吸率 | — | MAX, MIN, AVG | |
| `sleepScore` | 睡眠得分 | — | MAX, MIN, AVG | |
| `duration` | 睡眠时长 | s | MAX, MIN, AVG, SUM | |
| `fallAsleepOffset` | 入睡时间 | s | MAX, MIN, AVG | 相对 0 点偏移，负=0 点前，正=0 点后 |
| `wakeupOffset` | 起床时间 | s | MAX, MIN, AVG | 同上 |
| `deepDuration` | 深睡时长 | s | MAX, MIN, AVG, SUM | |
| `shallowDuration` | 浅睡时长 | s | MAX, MIN, AVG, SUM | |
| `dreamDuration` | REM 时长 | s | MAX, MIN, AVG, SUM | |
| `wakeCount` | 清醒次数 | count | MAX, MIN, AVG, SUM | |
| `respiratoryQualityScore` | 睡眠呼吸质量分 | — | MAX, MIN, AVG | |
| `effectiveSleepDuration` | 有效睡眠时长 | s | MAX, MIN, AVG | |
| `deepSleepContinuity` | 深睡连续性 | — | MAX, MIN, AVG | |
| `wakeDuration` | 清醒时长 | s | MAX, MIN, AVG, SUM | |

### 2.4 getNapSleepStatistics — 零星小睡

| fieldName | 名称 | unit | 统计项 |
|-----------|------|------|--------|
| `noonDuration` | 小睡时长 | s | MAX, MIN, AVG, COUNT, SUM |

### 2.5 getBloodPressureStatistics — 血压

| fieldName | 名称 | unit | 统计项 |
|-----------|------|------|--------|
| `systolicBp` | 收缩压 | mmHg | MAX, MIN, AVG |
| `diastolicBp` | 舒张压 | mmHg | MAX, MIN, AVG |
| `sphygmus` | 脉搏 | bpm | MAX, MIN, AVG |

### 2.6 getDynamicBloodPressureReport — 动态血压报告

| fieldName | 名称 | unit | 统计项 |
|-----------|------|------|--------|
| `avgSystolicBpAll` | 24h 收缩压均值 | mmHg | AVG |
| `avgDiastolicBpAll` | 24h 舒张压均值 | mmHg | AVG |
| `avgSystolicBpWake` | 清醒时段收缩压均值 | mmHg | AVG |
| `avgDiastolicBpWake` | 清醒时段舒张压均值 | mmHg | AVG |
| `avgSystolicBpSleep` | 睡眠时段收缩压均值 | mmHg | AVG |
| `avgDiastolicBpSleep` | 睡眠时段舒张压均值 | mmHg | AVG |
| `avgSystolicBpWakeTwo` | 起床后 2h 收缩压均值 | mmHg | AVG |
| `avgDiastolicBpWakeTwo` | 起床后 2h 舒张压均值 | mmHg | AVG |

### 2.7 getSpO2Statistics — 血氧饱和度

| fieldName | 名称 | unit | 统计项 |
|-----------|------|------|--------|
| `spO2` | 血氧饱和度 | % | AVG |

### 2.8 getLowSpO2AlertStatistics — 血氧偏低预警

| fieldName | 名称 | unit | 统计项 |
|-----------|------|------|--------|
| `any` | 预警次数 | count | COUNT |

### 2.9 getBodyWeightStatistics — 身体测量

| fieldName | 名称 | unit | 统计项 |
|-----------|------|------|--------|
| `bodyWeight` | 体重 | kg | AVG, MAX, MIN |
| `bmi` | BMI | — | AVG, MAX, MIN |
| `muscleMass` | 肌肉量 | kg | AVG, MAX, MIN |
| `bodyScore` | 身体得分 | — | AVG, MAX, MIN |
| `skeletalMusclelMass` | 骨骼肌 | kg | AVG, MAX, MIN |
| `visceralFatLevel` | 内脏脂肪等级 | — | AVG, MAX, MIN |
| `bodyFatRate` | 体脂率 | % | AVG, MAX, MIN |
| `basalMetabolism` | 基础代谢 | kcal/day | AVG, MAX, MIN |
| `moistureRate` | 水分率 | % | AVG, MAX, MIN |
| `boneSalt` | 骨盐量 | kg | AVG, MAX, MIN |
| `proteinRate` | 蛋白质 | % | AVG, MAX, MIN |
| `bodyAge` | 身体年龄 | — | AVG, MAX, MIN |

### 2.10 getTachycardiaAlertStatistics — 心率过高预警

| fieldName | 名称 | unit | 统计项 |
|-----------|------|------|--------|
| `any` | 预警次数 | count | COUNT |

### 2.11 getBradycardiaAlertStatistics — 心率过低预警

| fieldName | 名称 | unit | 统计项 |
|-----------|------|------|--------|
| `any` | 预警次数 | count | COUNT |

### 2.12 getArrhythmiaStatistics — 心律失常分析

| fieldName | 名称 | unit | 统计项 |
|-----------|------|------|--------|
| `suspectedFibCount` | 疑似房颤次数 | count | SUM |
| `suspectedPrematureBeatsCount` | 疑似早搏次数 | count | SUM |
| `noAbnormalitiesCount` | 无异常次数 | count | SUM |

### 2.13 getRestingHeartRateStatistics — 静息心率

| fieldName | 名称 | unit | 统计项 |
|-----------|------|------|--------|
| `restBpm` | 静息心率 | — | MAX, MIN, AVG |

---

## 三、运动群体基线

### getExerciseBaselineComparison

查询指定运动类型的群体百分位分布（5~95，步长 5），用于判断用户在同类人群中的水平。

**参数**：`activityType` + `uid`（无需日期）

**响应**包含每个字段的 `avg`（群体均值）、`sd`（标准差）、`valid`（是否有效）、`percentiles`（5~95 百分位值）。

**支持的运动 + 字段**：

| activityType | 对比字段 |
|:------------:|----------|
| 56/57/130（跑步）| totalDistance(m)、vo2max(mL/kg/min) |
| 13/97/110（骑行）| totalDistance(m) |

---

## 调用策略

### 场景 → 接口选择

| 用户意图 | 应调用的接口 |
|---------|-------------|
| "我最近睡眠怎么样" | `getSleepStatistics` |
| "我这个月跑步数据" | `getExerciseStatistics(activityType=56)` |
| "我的体重变化趋势" | `getBodyWeightStatistics` |
| "我的血压正常吗" | `getBloodPressureStatistics` + `getDynamicBloodPressureReport` |
| "压力大不大" | `getStressStatistics` + `getEmotionStatistics` |
| "心脏有没有问题" | `getRestingHeartRateStatistics` + `getTachycardiaAlertStatistics` + `getBradycardiaAlertStatistics` + `getArrhythmiaStatistics` |
| "我的血氧情况" | `getSpO2Statistics` + `getLowSpO2AlertStatistics` |
| "我跑步在人群中什么水平" | `getExerciseBaselineComparison(activityType=56)` |
| "全面健康报告" | 组合调用：睡眠 + 静息心率 + 压力 + 血氧 + 体重 + 运动 |

### 日期范围选择

- **单日查询**：`startDay` = `endDay`（如查今天：`20250214`）
- **近一周**：往前推 7 天
- **近一月**：往前推 30 天
- **长周期趋势**：按需拉长范围，统计值自动聚合

### 睡眠特殊规则

- `fallAsleepOffset` 和 `wakeupOffset` 是**相对 0 点的秒数偏移**：负数=0 点之前入睡（如 -3600 = 23:00），正数=0 点之后
- 小睡数据在 `getNapSleepStatistics`，与主睡眠 `getSleepStatistics` 分开

### 单位换算注意

- 时长字段部分为 `ms`（跑步/步行/跳绳），部分为 `s`（骑行/睡眠），使用前注意 `unit` 字段
- 距离 `totalDistance` 单位为 `m`，配速 `avgPace` 单位为 `s/km`
- 爬升/下降 `creepingWave`/`totalDescent` 单位为 `dm`（分米）
- 热量 `totalCalories` 单位为 `cal`（非 kcal）

### 数据关联分析

1. **睡眠质量 + 静息心率**：`getSleepStatistics` 的 `sleepScore` + `getRestingHeartRateStatistics` 的 `restBpm`，静息心率升高常伴随睡眠质量下降
2. **运动量 + 深睡**：`getExerciseStatistics` 的 `totalCalories` + `getSleepStatistics` 的 `deepDuration`，充足运动促进深睡
3. **压力 + 睡眠 HRV**：`getStressStatistics` 的 `stressScore` + `getSleepStatistics` 的 `avgHrv`，高压力低 HRV 提示需要恢复
4. **血氧 + 睡眠呼吸**：`getSpO2Statistics` + `getLowSpO2AlertStatistics` + `getSleepStatistics` 的 `respiratoryQualityScore`，低血氧预警多可能提示睡眠呼吸问题
5. **体重 + 运动**：`getBodyWeightStatistics` 的 `bodyFatRate`/`muscleMass` + `getExerciseStatistics`，追踪身体成分变化与运动量的关系
6. **心脏综合评估**：`getRestingHeartRateStatistics` + `getTachycardiaAlertStatistics` + `getBradycardiaAlertStatistics` + `getArrhythmiaStatistics`，全面评估心脏健康风险

### 群体对比解读

调用 `getExerciseBaselineComparison` 后，将用户的 `getExerciseStatistics` 平均值对照 percentiles：
- < P25：低于多数人，建议提升
- P25–P75：正常范围
- \> P75：优于多数人

---

## 错误处理

- 接口返回空 `results`：该时间段无数据记录，如实告知用户
- 远程服务不可用：降级使用 PHA 本地健康工具（`get_heart_rate`、`get_sleep` 等）
- 禁止编造数据，只报告接口实际返回的内容
