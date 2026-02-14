---
name: health-data-api
description: "Guide for using the internal health data MCP tools (query_activity, query_heart, query_sleep, etc.)"
metadata:
  {
    "pha": {
      "emoji": "🔌",
      "requires": { "tools": [] },
      "triggers": []
    }
  }
---

# Internal Health Data API Guide

This skill documents the 12 internal health data MCP tools provided by the remote health data service. These tools query device-level health data and are available when a remote MCP server is configured in `.pha/config.json` under `mcp.remoteServers`.

## Available Tools

| Tool | Description | Key Metrics |
|------|------------|-------------|
| `query_activity` | Daily activity summary | steps, calories, distance, active minutes |
| `query_workout` | Workout/exercise sessions | type, duration, calories, heart rate zones |
| `query_heart` | Heart rate data | resting HR, avg HR, max HR, HR zones |
| `query_sleep` | Sleep analysis | duration, stages (deep/light/REM/awake), efficiency |
| `query_blood_oxygen` | Blood oxygen (SpO2) | SpO2 %, measurement time |
| `query_stress` | Stress levels | stress score, distribution |
| `query_blood_pressure` | Blood pressure readings | systolic, diastolic, pulse |
| `query_blood_glucose` | Blood glucose readings | glucose level, measurement context |
| `query_body_composition` | Body metrics | weight, BMI, body fat %, muscle mass |
| `query_body_temperature` | Body temperature | temperature, measurement site |
| `query_hrv` | Heart rate variability | RMSSD, SDNN |
| `query_menstrual_cycle` | Menstrual cycle tracking | cycle phase, period days |

## Common Parameters

All query tools share these parameters:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `startDate` | string | Yes | Start date in `YYYY-MM-DD` format |
| `endDate` | string | Yes | End date in `YYYY-MM-DD` format |
| `metrics` | string[] | No | Specific sub-metrics to return (tool-dependent) |

### Date Range Guidelines

- **Single day**: set `startDate` = `endDate`
- **Recent week**: last 7 days from today
- **Monthly view**: last 30 days
- **Long-term trends (>30 days)**: the service may automatically switch to **Statistics** mode (aggregated daily/weekly summaries instead of raw data points)

## Usage Patterns

### Pattern 1: Single-Day Deep Dive

When the user asks about "today" or a specific date, query multiple tools for that single day:

```
query_heart(startDate: "2025-01-15", endDate: "2025-01-15")
query_sleep(startDate: "2025-01-15", endDate: "2025-01-15")
query_activity(startDate: "2025-01-15", endDate: "2025-01-15")
```

### Pattern 2: Trend Analysis

For trend questions ("how has my sleep been this month?"), use a date range:

```
query_sleep(startDate: "2024-12-15", endDate: "2025-01-15")
```

### Pattern 3: Cross-Metric Correlation

For holistic health questions, combine multiple tools over the same period:

```
query_sleep(startDate: ..., endDate: ...)
query_heart(startDate: ..., endDate: ...)
query_stress(startDate: ..., endDate: ...)
query_activity(startDate: ..., endDate: ...)
```

Then correlate: e.g., poor sleep nights vs. high stress days vs. low activity days.

## Sleep-Specific Rules

- **Sleep date convention**: Sleep data for a given night is typically recorded under the **end date** (wake-up date). To get last night's sleep, query today's date.
- **Nap detection**: Short sleep sessions during daytime hours may be classified as naps vs. main sleep.

## Metrics Sub-Selection

Some tools support a `metrics` parameter to return only specific sub-metrics. Use this to reduce response size when you only need specific data:

- `query_heart` metrics: `["resting_hr", "avg_hr", "max_hr", "hr_zones"]`
- `query_activity` metrics: `["steps", "calories", "distance", "active_minutes"]`
- `query_sleep` metrics: `["duration", "stages", "efficiency", "score"]`

When the user's question is specific (e.g., "what was my resting heart rate?"), select only the relevant metrics.

## Data Correlation Strategy

When analyzing health holistically:

1. **Sleep + Heart Rate**: Check resting HR trends vs. sleep quality — elevated resting HR often correlates with poor sleep
2. **Activity + Sleep**: High activity days often lead to better deep sleep
3. **Stress + HRV**: High stress and low HRV are correlated — suggest recovery activities
4. **Blood Oxygen + Sleep**: Low SpO2 during sleep may indicate sleep apnea
5. **Weight + Activity**: Track body composition changes alongside activity trends

## Error Handling

- If a tool returns empty data, inform the user that no data was recorded for that period
- If a tool is unavailable (remote server not configured), fall back to the local health data tools (get_heart_rate, get_sleep, etc.)
- Never guess or fabricate health data — always report what the tools return
