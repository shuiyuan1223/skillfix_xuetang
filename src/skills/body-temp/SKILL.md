---
name: body-temp
description: "Analyze body temperature data, detect abnormal fluctuations, and provide personalized insights"
metadata:
  {
    "pha": {
      "emoji": "🌡️",
      "requires": { "tools": ["get_body_temperature", "get_menstrual_cycle"] },
      "triggers": ["body temperature", "temperature", "fever", "low-grade fever", "hypothermia", "体温", "发热", "发烧", "低热", "高热", "测温", "基础体温", "体温偏高", "体温偏低", "感冒", "着凉"]
    }
  }
---

# Body Temperature Monitor Skill

## Step 1: Classify the Question

| User Says | Question Type | What to Investigate |
|-----------|-------------|-------------------|
| "Is my temperature normal?" | **Baseline check** | Compare to personal baseline and population norms |
| "I think I have a fever" | **Acute elevation** | Context: illness? exercise? environment? |
| "My temperature has been high lately" | **Trend concern** | Pull multi-day data, check for persistent elevation |
| "How does my temperature change with my cycle?" | **Menstrual correlation** | Cross-reference with menstrual cycle phases |
| "My temperature seems low" | **Hypothermia concern** | Check for metabolic or circulation issues |

## Step 2: Data Collection Strategy

| Question Type | Required Calls | Why |
|-----------|---------------|-----|
| Single day check | `get_body_temperature(date)` | Current reading vs baseline |
| Menstrual correlation | `get_body_temperature(date_range)` + `get_menstrual_cycle` | BBT biphasic pattern analysis |
| Trend question | `get_body_temperature(30d range)` | Establish personal baseline and detect drift |
| Acute concern | `get_body_temperature(today)` + `get_sleep(today)` | Cross-check with recovery signals |

## Step 3: Expert Assessment Framework

### 3.1 Temperature Classification

**Always establish personal baseline first** — analyze the past 30 days to calculate the user's normal range.

Population reference (axillary measurement):

| Category | Range | Notes |
|----------|-------|-------|
| Hypothermia | < 36.0°C | Investigate metabolism, circulation, or hypothyroidism |
| Normal | 36.0-37.2°C | Healthy range |
| Low-grade fever | 37.3-38.0°C | Monitor; often transient from exercise, stress, dehydration |
| Moderate fever | 38.1-39.0°C | Likely illness; recommend rest and monitoring |
| High fever | > 39.0°C | Recommend medical evaluation |

**Wearable device note**: Wrist skin temperature differs from axillary/oral readings. Always mention this when interpreting data.

### 3.2 Female Menstrual Cycle Temperature Patterns

For female users, temperature has a biphasic pattern:

| Phase | Timing (28-day cycle) | Temperature Pattern |
|-------|----------------------|-------------------|
| Follicular phase | Day 1-14 (post-menstruation to ovulation) | Lower baseline (~36.2-36.5°C) |
| Post-ovulation / Luteal phase | Day 15-28 | Rises 0.3-0.5°C, sustained until next period |

**Key insight**: A post-ovulation temperature rise of ≥0.3°C confirms ovulation occurred. Absence of biphasic pattern may warrant further investigation.

### 3.3 Factors That Affect Body Temperature

- **Exercise**: Intense activity temporarily raises temperature — this is normal
- **Sleep deprivation**: Can elevate temperature slightly
- **Stress/high cortisol**: May cause mild elevation
- **Alcohol**: Causes vasodilation, can affect readings
- **Environment**: Ambient temperature, hot baths, etc.
- **Time of day**: Body temperature is naturally lower in early morning, higher in late afternoon
- **Dehydration**: Can cause mild elevation

## Step 4: Cross-Domain Analysis

**Temperature + Sleep:**
- Elevated temperature during sleep → body may be fighting infection or under stress
- Poor sleep + elevated temperature → investigate illness or overtraining

**Temperature + Menstrual Cycle:**
- Luteal phase temperature rise is normal and expected
- "My temperature is 36.9°C" during luteal phase → completely normal, reassure the user
- Sustained high temperature beyond expected period start → may need further investigation

**Temperature + Activity:**
- Post-exercise temperature elevation is transient and normal
- Consistently elevated temperature on rest days → investigate other causes

**Temperature + Stress:**
- Chronic stress can cause persistent low-grade temperature elevation
- Cross-check with sleep quality and HRV data

## Step 5: Personalized Communication

### Rule: Context Before Numbers

**BAD**: "Your temperature is 37.4°C, which is slightly above normal."

**GOOD**: "Your temperature today is 37.4°C — that's about 0.6°C above your personal baseline of 36.8°C, reaching low-grade fever level. I see you only slept 5 hours last night and your stress score was elevated. Rest and hydration should help — but if this persists beyond 24 hours or rises above 38°C, consider seeing a doctor."

### For Female Users (Cycle Context)

**GOOD**: "You're currently on day 20 of your cycle (luteal phase, day 6). Your temperature of 36.9°C is a normal luteal phase elevation — no cause for concern."

### Don't Over-React to Single Readings

- Daily temperature varies by 0.3-0.5°C naturally
- A single elevated reading doesn't indicate illness
- Look at the trend over multiple measurements
- Wearable readings have ±0.3°C accuracy margin

## Memory & Personalization

**When to search memory:**
- `memory_search("temperature baseline")` — Check for established personal baseline
- `memory_search("fever")` or `memory_search("illness")` — Check for recent illness history
- `memory_search("menstrual cycle")` — For female users, understand cycle context

**What to save:**
- `memory_save` — Record established baselines: "User's normal body temperature range is 36.4-36.8°C based on 30 days of data."
- `daily_log` — Note significant temperature events and context

## Red Lines — When to Escalate

| Signal | Action |
|--------|--------|
| Temperature > 38°C persisting > 2 days | "Persistent fever beyond 2 days warrants a doctor visit to rule out infection or other causes." |
| Temperature > 39°C at any point | "A temperature this high needs medical evaluation. Please see a doctor today, especially if accompanied by other symptoms." |
| Temperature consistently < 36.0°C | "Persistently low body temperature can indicate metabolic issues. Worth mentioning at your next checkup, especially if you're also feeling fatigued or cold." |
| Fever + severe headache, stiff neck, rash, or difficulty breathing | "These symptoms together need immediate medical attention. Please seek care right away." |
