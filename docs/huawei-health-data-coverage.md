# 华为运动健康 REST API 数据接入覆盖表

> 基于官方文档：[数据开放总览](https://developer.huawei.com/consumer/cn/doc/HMSCore-Guides/data_description-0000001467889369)
>
> 文档更新时间：2025-09-23 | PHA 整理时间：2026-02-07

---

## 云侧开放数据类型（REST API）

PHA 使用云侧 REST API，以下为完整覆盖情况。

### 接入状态图例

| 标记 | 含义 |
|------|------|
| ✅ | 已接入 |
| ⚠️ | 部分接入 |
| ❌ | 未接入 |

---

### 一、日常活动

| 数据子类 | 数据项 | 及时性 | 读/写 | PHA 状态 | 备注 |
|----------|--------|--------|-------|----------|------|
| [步数](https://developer.huawei.com/consumer/cn/doc/HMSCore-Guides/steps-0000001177343435) | 步数采样明细、日总步数 | 小时级 | R/W | ✅ | `getMetrics()` polymerize + `getWeeklySteps()` |
| [热量](https://developer.huawei.com/consumer/cn/doc/HMSCore-Guides/calories-0000001177343441) | 卡路里采样明细、日总消耗卡路里 | 小时级 | R/W | ✅ | `getMetrics()` polymerize |
| [距离](https://developer.huawei.com/consumer/cn/doc/HMSCore-Guides/distance-0000001131264000) | 距离采样明细、日总距离 | 小时级 | R/W | ✅ | `getMetrics()` polymerize |
| [海拔](https://developer.huawei.com/consumer/cn/doc/HMSCore-Guides/altitude-0000001177343443) | 海拔高度采样明细、日海拔高度统计 | 小时级 | R/W | ❌ | |
| [中高强度](https://developer.huawei.com/consumer/cn/doc/HMSCore-Guides/middle-high-intensity-0000001131264002) | 步行/跑步/骑行/训练等中高强度时长 | 小时级 | R/W | ✅ | `getMetrics()` → `activeMinutes` |
| [活动小时数](https://developer.huawei.com/consumer/cn/doc/HMSCore-Guides/activehours-0000001521403798) | 活动小时数 | 小时级 | R/W | ❌ | |
| [日常活动数据](https://developer.huawei.com/consumer/cn/doc/HMSCore-Guides/dailyactivitysummary-0000001572243693) | 步数/热量/中高强度/活动小时数 目标与日统计 | 小时级 | R | ✅ | `getDailyActivitySummary()` 作为 fallback |
| [运动目标](https://developer.huawei.com/consumer/cn/doc/HMSCore-Guides/sport-goal-0000001656873341) | 步数/活动热量/锻炼时长/活动小时数 目标值 | 小时级 | R | ❌ | |

**小计**: 5/8 已接入

---

### 二、健康数据

| 数据子类 | 数据项 | 及时性 | 读/写 | PHA 状态 | 备注 |
|----------|--------|--------|-------|----------|------|
| [身高](https://developer.huawei.com/consumer/cn/doc/HMSCore-Guides/height-0000001131263998) | 身高 | 分钟级 | R/W | ✅ | `getBodyComposition()` 内，API 返回米，已做 →cm 转换 |
| [体重](https://developer.huawei.com/consumer/cn/doc/HMSCore-Guides/weight-0000001131423772) | 体重、体脂、BMI 等 | 分钟级 | R/W | ✅ | `getBodyComposition()` 按 fieldName 提取 body_weight/bmi/body_fat_rate |
| [心率](https://developer.huawei.com/consumer/cn/doc/HMSCore-Guides/heart-rate-0000001131423780) | 动态心率、静息心率、心率变异性 | 小时级 | R/W | ⚠️ | 动态心率 ✅、静息心率 ✅、**心率变异性 ❌** |
| [压力](https://developer.huawei.com/consumer/cn/doc/HMSCore-Guides/stress-0000001177423529) | 压力得分、压力等级 | 小时级 | R/W | ✅ | `getStress()` polymerize |
| [睡眠](https://developer.huawei.com/consumer/cn/doc/HMSCore-Guides/sleep-0000001131264006) | 睡眠分期采样、睡眠记录、睡眠日统计 | 分钟级 | R/W | ✅ | healthRecords + 周级汇总 |
| [血糖](https://developer.huawei.com/consumer/cn/doc/HMSCore-Guides/blood-glucose-0000001177423531) | 血糖、连续血糖 | 分钟级 | R/W | ⚠️ | 瞬时血糖 ✅、**连续血糖 ❌** |
| [血压](https://developer.huawei.com/consumer/cn/doc/HMSCore-Guides/blood-pressure-0000001177343449) | 收缩压、舒张压、脉搏 | 分钟级 | R/W | ⚠️ | 收缩压/舒张压 ✅、**脉搏(sphygmus) ❌** |
| [血氧](https://developer.huawei.com/consumer/cn/doc/HMSCore-Guides/blood-oxygen-0000001131264010) | 瞬时血氧饱和度 | 小时级 | R/W | ✅ | `getSpO2()` polymerize |
| [体温](https://developer.huawei.com/consumer/cn/doc/HMSCore-Guides/body-temperature-0000001177423533) | 体温、皮肤体温 | 分钟级 | R/W | ⚠️ | 体温 ✅、**皮肤体温 ❌** (需要确认是否是同一 dataType 不同 fieldName) |

**小计**: 9/9 已接入（其中 4 项部分接入）

---

### 三、心脏健康

| 数据子类 | 数据项 | 及时性 | 读/写 | PHA 状态 | 备注 |
|----------|--------|--------|-------|----------|------|
| [ECG心电测量记录](https://developer.huawei.com/consumer/cn/doc/HMSCore-Guides/ecg-measurement-record-0000001131831084) | ECG 记录 | 分钟级 | R/W | ✅ | healthRecords 端点 |
| [心电测量明细](https://developer.huawei.com/consumer/cn/doc/HMSCore-Guides/ecg-measurement-details-0000001131423786) | ECG 波形数据 | 分钟级 | R/W | ❌ | 原始波形数据，暂未需求 |
| [心率过速](https://developer.huawei.com/consumer/cn/doc/HMSCore-Guides/tachycardia-0000001131990854) | 心率过速事件 | 分钟级 | R/W | ❌ | |
| [心率过缓](https://developer.huawei.com/consumer/cn/doc/HMSCore-Guides/bradycardia-0000001177910585) | 心率过缓事件 | 分钟级 | R/W | ❌ | |

**小计**: 1/4 已接入

---

### 四、肺功能

| 数据子类 | 数据项 | 及时性 | 读/写 | PHA 状态 | 备注 |
|----------|--------|--------|-------|----------|------|
| [最大摄氧量](https://developer.huawei.com/consumer/cn/doc/HMSCore-Guides/vo2max-0000001279093573) | VO2Max | 分钟级 | R | ❌ | dataType: `com.huawei.vo2max`，已有 scope `pulmonary.read` |
| [睡眠呼吸记录](https://developer.huawei.com/consumer/cn/doc/HMSCore-Guides/sleep-breathing-record-0000001399223505) | 睡眠呼吸暂停事件 | 分钟级 | R | ❌ | |

**小计**: 0/2 已接入

---

### 五、生殖健康

| 数据子类 | 数据项 | 及时性 | 读/写 | PHA 状态 | 备注 |
|----------|--------|--------|-------|----------|------|
| [生殖健康](https://developer.huawei.com/consumer/cn/doc/HMSCore-Guides/menstrual-cycle-0000001207140290) | 宫颈粘液、宫颈状态、月经量、排卵检测结果、阴道斑点 | 小时级 | R/W | ⚠️ | 月经量(menstrual_flow) ✅ 、痛经(dysmenorrhoea) ✅、**宫颈粘液/宫颈状态/排卵检测/阴道斑点 ❌** |

**小计**: 1/1 已接入（部分字段）

---

### 六、情绪

| 数据子类 | 数据项 | 及时性 | 读/写 | PHA 状态 | 备注 |
|----------|--------|--------|-------|----------|------|
| [情绪](https://developer.huawei.com/consumer/cn/doc/HMSCore-Guides/emotion-0000002049029132) | 情绪状态 (1=消极, 2=平静, 3=积极) | 小时级 | R/W | ❌ | dataType: `com.huawei.emotion` |

**小计**: 0/1 已接入

---

### 七、饮食记录

| 数据子类 | 数据项 | 及时性 | 读/写 | PHA 状态 | 备注 |
|----------|--------|--------|-------|----------|------|
| [饮食记录](https://developer.huawei.com/consumer/cn/doc/HMSCore-Guides/health-diet-record-0000002260907965) | 饮食数据 | 分钟级 | R/W | ✅ | healthRecords 端点，`com.huawei.health.record.nutrition_record` |

**小计**: 1/1 已接入

---

### 八、锻炼记录

| 数据子类 | 数据项 | 及时性 | 读/写 | PHA 状态 | 备注 |
|----------|--------|--------|-------|----------|------|
| [锻炼记录概要数据](https://developer.huawei.com/consumer/cn/doc/HMSCore-Guides/introduction-fitness-record-data-0000001131831088) | 100+运动类型概要 | 分钟级 | R/W | ✅ | `getActivityRecords()` |
| [锻炼记录详情数据](https://developer.huawei.com/consumer/cn/doc/HMSCore-Guides/introduction-0000001326553313) | 运动心率、速度、步频、海拔等采样详情 | 分钟级 | R/W | ❌ | |
| [锻炼记录位置详情数据](https://developer.huawei.com/consumer/cn/doc/HMSCore-Guides/location-0000001177423525) | 经度、纬度、坐标系 | 分钟级 | R/W | ❌ | |

**小计**: 1/3 已接入

---

### 九、历史数据

| 数据子类 | 数据项 | 及时性 | 读/写 | PHA 状态 | 备注 |
|----------|--------|--------|-------|----------|------|
| [历史数据](https://developer.huawei.com/consumer/cn/doc/HMSCore-Guides/historydata-open-0000001209921350) | 一周/一月/一年统计 | NA | R | ❌ | PHA 自行通过 weekly 函数实现部分能力 |

**小计**: 0/1 已接入

---

## 总览统计

| 分类 | 总数据项 | 已接入 | 部分接入 | 未接入 | 覆盖率 |
|------|----------|--------|----------|--------|--------|
| 日常活动 | 8 | 5 | 0 | 3 | 62.5% |
| 健康数据 | 9 | 5 | 4 | 0 | **100%** |
| 心脏健康 | 4 | 1 | 0 | 3 | 25% |
| 肺功能 | 2 | 0 | 0 | 2 | 0% |
| 生殖健康 | 1 | 0 | 1 | 0 | 100% |
| 情绪 | 1 | 0 | 0 | 1 | 0% |
| 饮食记录 | 1 | 1 | 0 | 0 | **100%** |
| 锻炼记录 | 3 | 1 | 0 | 2 | 33% |
| 历史数据 | 1 | 0 | 0 | 1 | 0% |
| **合计** | **30** | **13** | **5** | **12** | **60%** |

---

## 未接入数据 — 优先级建议

### P0 — 高价值，易实现

| 数据类型 | 理由 | 预估工作量 |
|----------|------|-----------|
| VO2Max (最大摄氧量) | 已有 scope(`pulmonary.read`)，polymerize 单值，健康洞察价值高 | 小 |
| 情绪 | 已有 scope 位置(`emotion.read` 需新增)，polymerize 单值，与压力组合分析价值高 | 小 |
| 心率过速/心率过缓 | 与 ECG 同属心脏健康，安全预警价值极高 | 中 |

### P1 — 有价值，需要一定工作

| 数据类型 | 理由 | 预估工作量 |
|----------|------|-----------|
| 海拔 | polymerize 标准模式，对户外运动用户有价值 | 小 |
| 活动小时数 | polymerize 标准模式，久坐提醒场景 | 小 |
| 运动目标 | 目标 vs 实际对比，激励场景 | 小 |
| 睡眠呼吸记录 | 健康预警（呼吸暂停），与睡眠数据组合 | 中 |
| 心率变异性 (HRV) | 已有心率 scope，需确认是否在同一 dataType 内 | 小 |
| 连续血糖 | 已有血糖接入，需确认 dataTypeName | 小 |
| 脉搏 (sphygmus) | 已有血压接入，仅需在 BP 解析中多取一个 field | 极小 |

### P2 — 低优先级

| 数据类型 | 理由 |
|----------|------|
| 锻炼记录详情数据 | 需求场景较少，数据量大 |
| 锻炼记录位置数据 | 涉及隐私（GPS），需求场景有限 |
| ECG 波形明细 | 原始波形数据，普通用户无法解读 |
| 历史数据 (一周/月/年) | PHA 已通过 weekly 函数自行实现 |
| 生殖健康完整字段 | 宫颈粘液等字段使用率低 |
| 皮肤体温 | 需确认是否同一 dataType 不同字段 |

---

## OAuth Scope 对照

| Scope | 覆盖数据 | PHA 已配置 |
|-------|----------|-----------|
| `step.read` | 步数 | ✅ |
| `calories.read` | 热量 | ✅ |
| `distance.read` | 距离 | ✅ |
| `heartrate.read` | 心率、静息心率、HRV | ✅ |
| `sleep.read` | 睡眠 | ✅ |
| `activity.read` | 中高强度、活动小时数 | ✅ |
| `activityrecord.read` | 锻炼记录(概要/详情/位置) | ✅ |
| `stress.read` | 压力 | ✅ |
| `oxygensaturation.read` | 血氧 | ✅ |
| `hearthealth.read` | ECG、心率过速/过缓 | ✅ |
| `bloodpressure.read` | 血压 | ✅ |
| `bloodglucose.read` | 血糖 | ✅ |
| `heightweight.read` | 身高、体重 | ✅ |
| `bodytemperature.read` | 体温 | ✅ |
| `nutrition.read` | 饮食记录 | ✅ |
| `reproductive.read` | 生殖健康 | ✅ |
| `pulmonary.read` | VO2Max、睡眠呼吸 | ✅ |
| `emotion.read` | 情绪 | ❌ 未配置 |
| `extend/healthbehavior.read` | 扩展健康行为 | ❌ 未配置 |
| `goals.read` | 运动目标 | ❌ 未配置 |
| `activehours.read` | 活动小时数 | ❌ 未配置 |
