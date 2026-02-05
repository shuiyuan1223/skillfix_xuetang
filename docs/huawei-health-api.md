# 华为 Health Kit REST API 参考

## API 端点

| 端点 | 方法 | 说明 | 时间戳 |
|------|------|------|--------|
| `/healthkit/v2/sampleSet:polymerize` | POST | 聚合查询 | 毫秒 |
| `/healthkit/v2/sampleSet:dailyPolymerize` | POST | 按日聚合 | 毫秒 |
| `/healthkit/v2/healthRecords` | GET | 健康记录 | 纳秒 |
| `/healthkit/v2/activityRecords` | GET | 运动记录 | 毫秒 |
| `/healthkit/v2/dataCollectors` | POST | 数据收集器 | - |

## 数据类型 (dataTypeName)

### 日常活动
| dataTypeName | 说明 | 文档 |
|--------------|------|------|
| `com.huawei.continuous.steps.delta` | 步数增量 | [链接](https://developer.huawei.com/consumer/cn/doc/HMSCore-Guides/steps-0000001177343435) |
| `com.huawei.continuous.distance.delta` | 距离增量 | [链接](https://developer.huawei.com/consumer/cn/doc/HMSCore-Guides/distance-0000001131264000) |
| `com.huawei.continuous.calories.burnt` | 活动热量 | [链接](https://developer.huawei.com/consumer/cn/doc/HMSCore-Guides/calories-0000001177343441) |
| `com.huawei.continuous.exercise_intensity.v2` | 中高强度 | [链接](https://developer.huawei.com/consumer/cn/doc/HMSCore-Guides/middle-high-intensity-0000001131264002) |
| `com.huawei.active_hours` | 活动小时 | [链接](https://developer.huawei.com/consumer/cn/doc/HMSCore-Guides/activehours-0000001521403798) |
| `com.huawei.daily_activity_summary` | 日活动汇总 | [链接](https://developer.huawei.com/consumer/cn/doc/HMSCore-Guides/dailyactivitysummary-0000001572243693) |

### 健康采样
| dataTypeName | 说明 | 文档 |
|--------------|------|------|
| `com.huawei.instantaneous.heart_rate` | 心率 | [链接](https://developer.huawei.com/consumer/cn/doc/HMSCore-Guides/heart-rate-0000001131423780) |
| `com.huawei.instantaneous.resting_heart_rate` | 静息心率 | [链接](https://developer.huawei.com/consumer/cn/doc/HMSCore-Guides/heart-rate-0000001131423780) |
| `com.huawei.instantaneous.spo2` | 血氧饱和度 | [链接](https://developer.huawei.com/consumer/cn/doc/HMSCore-Guides/blood-oxygen-0000001131264010) |
| `com.huawei.instantaneous.stress` | 压力指数 | [链接](https://developer.huawei.com/consumer/cn/doc/HMSCore-Guides/stress-0000001177423529) |
| `com.huawei.instantaneous.blood_glucose` | 血糖 | [链接](https://developer.huawei.com/consumer/cn/doc/HMSCore-Guides/blood-glucose-0000001177423531) |
| `com.huawei.instantaneous.blood_pressure` | 血压 | [链接](https://developer.huawei.com/consumer/cn/doc/HMSCore-Guides/blood-pressure-0000001177343449) |
| `com.huawei.instantaneous.body_weight` | 体重 | [链接](https://developer.huawei.com/consumer/cn/doc/HMSCore-Guides/weight-0000001131423772) |
| `com.huawei.instantaneous.body.temperature` | 体温 | [链接](https://developer.huawei.com/consumer/cn/doc/HMSCore-Guides/body-temperature-0000001177423533) |

### 健康记录
| dataTypeName | 说明 | 文档 |
|--------------|------|------|
| `com.huawei.health.record.sleep` | 睡眠记录 | [链接](https://developer.huawei.com/consumer/cn/doc/HMSCore-Guides/sleep-record-scene-0000001055511884) |
| `com.huawei.continuous.sleep.fragment` | 睡眠片段 | 作为 subDataType |
| `com.huawei.continuous.ecg_record` | ECG记录 | [链接](https://developer.huawei.com/consumer/cn/doc/HMSCore-Guides/ecg-data-scene-0000001097873776) |

## 请求示例

### polymerize (聚合查询)
```json
POST /healthkit/v2/sampleSet:polymerize
{
  "polymerizeWith": [
    { "dataTypeName": "com.huawei.instantaneous.heart_rate" }
  ],
  "startTime": 1704067200000,
  "endTime": 1704153599999
}
```

### healthRecords (健康记录)
```
GET /healthkit/v2/healthRecords?startTime={纳秒}&endTime={纳秒}&dataType=com.huawei.health.record.sleep&subDataType=com.huawei.continuous.sleep.fragment
```

## 响应格式

### polymerize 响应
```json
{
  "group": [{
    "sampleSet": [{
      "samplePoints": [{
        "startTime": 1704067200000,
        "endTime": 1704070800000,
        "value": [{ "floatValue": 72.0 }]
      }]
    }]
  }]
}
```

### healthRecords 响应
```json
{
  "healthRecords": [{
    "startTime": 1704045600000000000,
    "endTime": 1704074400000000000,
    "value": [
      { "fieldName": "sleep_score", "integerValue": 85 },
      { "fieldName": "all_sleep_time", "integerValue": 480 }
    ],
    "subData": {
      "com.huawei.continuous.sleep.fragment": {
        "samplePoints": [...]
      }
    }
  }]
}
```

## 睡眠状态码 (sleep_state)
| 值 | 说明 |
|----|------|
| 1 | 浅睡 |
| 2 | REM (快速眼动) |
| 3 | 深睡 |
| 4 | 清醒 |
| 5 | 零星小睡 |

## 权限 Scope
| Scope | 说明 |
|-------|------|
| `https://www.huawei.com/healthkit/step.read` | 步数 |
| `https://www.huawei.com/healthkit/distance.read` | 距离 |
| `https://www.huawei.com/healthkit/calories.read` | 卡路里 |
| `https://www.huawei.com/healthkit/heartrate.read` | 心率 |
| `https://www.huawei.com/healthkit/sleep.read` | 睡眠 |
| `https://www.huawei.com/healthkit/activity.read` | 运动记录 |
| `https://www.huawei.com/healthkit/oxygen.read` | 血氧 |
| `https://www.huawei.com/healthkit/stress.read` | 压力 |

## 官方文档
- [场景示例总览](https://developer.huawei.com/consumer/cn/doc/hmscore-guides/scene-example-0000001050819089)
- [数据类型说明](https://developer.huawei.com/consumer/cn/doc/HMSCore-Guides/health-sampling-data-0000001131423778)
