---
name: blood-oxygen
description: "Monitor blood oxygen saturation (SpO2), screen for respiratory issues, and provide altitude safety guidance"
metadata:
  {
    "pha": {
      "emoji": "💨",
      "requires": { "tools": ["get_spo2", "get_sleep"] },
      "triggers": ["blood oxygen", "SpO2", "oxygen saturation", "oxygen level", "hypoxia", "breathing", "respiratory", "血氧", "血氧饱和度", "缺氧", "呼吸", "喘", "憋气", "高原", "高海拔", "打鼾", "呼吸暂停", "胸闷"]
    }
  }
---

# Blood Oxygen Monitor Skill

## Step 1: Classify the Question

| User Says | Question Type | What to Investigate |
|-----------|-------------|-------------------|
| "Is my blood oxygen normal?" | **Baseline check** | Compare SpO2 to standards |
| "My oxygen was low last night" | **Nocturnal concern** | Night SpO2 + sleep quality |
| "I'm going to high altitude" | **Altitude preparation** | Current baseline + altitude safety guidance |
| "I feel short of breath" | **Symptom + data** | SpO2 + HR + activity context |
| "Do I have sleep apnea?" | **Sleep breathing screen** | Night SpO2 dip events + snoring data |

## Step 2: Data Collection Strategy

| Question Type | Required Calls | Why |
|-----------|---------------|-----|
| Baseline check | `get_spo2(today)` | Current daytime SpO2 |
| Night concern | `get_spo2(date)` + `get_sleep(date)` | Night SpO2 events + sleep quality |
| Trend analysis | `get_spo2(7d)` | Weekly SpO2 pattern |
| Sleep apnea screen | `get_spo2(7d)` + `get_sleep(7d)` | Night desaturation events + sleep disruption |

## Step 3: Expert Assessment Framework

### 3.1 SpO2 Classification

| SpO2 Level | Status | Action |
|-----------|--------|--------|
| 97-100% | Excellent | Healthy respiratory function |
| 95-96% | Normal low | Monitor, investigate if persistent |
| 90-94% | Mild hypoxemia | Rest, seek medical evaluation |
| 85-89% | Moderate hypoxemia | Immediate intervention needed |
| < 85% | Severe hypoxemia | Emergency medical care |

**Key principle**: SpO2 should remain ≥ 95% at rest at sea level. Consistently below 95% without altitude explanation warrants medical evaluation.

### 3.2 Nocturnal SpO2 Standards

For healthy adults at sea level:
- Night SpO2 should remain ≥ 95% continuously
- SpO2 dropping below 90% for ≥ 10 seconds suggests possible obstructive sleep apnea (OSA)
- Count of desaturation events (drops ≥ 4% from baseline) per hour correlates with AHI (apnea-hypopnea index)

**OSA screening indicators from wearable data:**
- Frequent SpO2 dips below 95% during sleep
- Cyclic desaturation-recovery pattern (classic sawtooth pattern)
- Snoring data (if available from device)
- User reports: loud snoring, witnessed apneas, excessive daytime sleepiness

### 3.3 High Altitude Reference

| Altitude (m) | Expected SpO2 | Guidance |
|--------------|--------------|---------|
| 0-1,500 | 95-100% | Normal activity |
| 1,500-3,000 | 92-96% | Monitor changes, reduce intense activity |
| 3,000-4,500 | 85-92% | Close monitoring, descend if symptomatic |
| > 4,500 | < 85% risk increases | Carry supplemental oxygen, mandatory acclimatization |

**Altitude acclimatization rules:**
- Ascend no more than 300-500m per day above 3,000m
- Day 1 at new altitude: light activity only
- SpO2 < 85% or symptoms (headache, nausea, confusion) → descend immediately
- Lake Louise AMS score > 3 → stop ascending

### 3.4 Exercise and SpO2

- Mild SpO2 drop (92-95%) during very high-intensity exercise is normal
- SpO2 should recover to ≥ 96% within 5 minutes post-exercise
- Persistent low SpO2 during moderate exercise → investigate respiratory function
- At altitude: reduce exercise intensity proportionally to SpO2 reduction

### 3.5 Factors Affecting Wearable SpO2 Accuracy

- **Cold extremities / poor perfusion**: Readings may be falsely low
- **Dark skin pigmentation**: Some devices have ±2-3% additional error
- **Motion artifacts**: Readings during movement are unreliable
- **Nail polish / wet skin**: Can interfere with optical sensors
- **Device accuracy**: Wearable SpO2 is ±2-3% vs medical pulse oximeters

## Step 4: Cross-Domain Analysis

**SpO2 + Sleep:**
- Night SpO2 dips correlating with frequent awakenings → strong OSA indicator
- Low SpO2 + poor deep sleep → respiratory issue likely disrupting sleep architecture
- Snoring + SpO2 dips + daytime fatigue → classic OSA triad, recommend sleep study

**SpO2 + Heart Rate:**
- SpO2 dropping + HR rising → body compensating for low oxygen (normal acute response)
- If SpO2 dips and HR doesn't respond → concerning, may indicate autonomic issue

**SpO2 + Activity:**
- At high altitude: monitor SpO2 before, during, and after exercise
- Post-exercise SpO2 recovery time is a fitness indicator

## Step 5: Personalized Communication

### Rule: Reassure When Normal, Act When Not

**BAD**: "Your SpO2 dropped to 93% last night, which indicates hypoxemia."

**GOOD**: "I noticed your SpO2 dipped to 93% briefly during sleep last night, with 2 other dips below 95%. This doesn't necessarily mean there's a problem — wearable readings can fluctuate, especially during deep sleep. But since I've seen this pattern on 3 nights this week, it would be worth discussing with your doctor. A sleep study can give definitive answers about whether there's a breathing issue during sleep."

### Altitude Context

**GOOD**: "At 3,200m elevation, your SpO2 of 91% is within the expected range. Your body is adapting. Keep today's activity light, stay hydrated, and monitor for any headache or nausea. If SpO2 drops below 85% or you feel unwell, it's time to descend."

## Memory & Personalization

**When to search memory:**
- `memory_search("blood oxygen")` or `memory_search("SpO2")` — Check baseline SpO2 level
- `memory_search("snoring")` or `memory_search("sleep apnea")` — Prior discussions about sleep breathing
- `memory_search("altitude")` — Past altitude experiences and tolerance

**What to save:**
- `memory_save` — Record: normal SpO2 baseline, any OSA concerns discussed, altitude tolerance
- `daily_log` — Note significant SpO2 events and context

## Red Lines — When to Escalate

| Signal | Action |
|--------|--------|
| Resting SpO2 consistently < 95% at sea level | "Resting blood oxygen consistently below 95% at sea level should be evaluated by a doctor. This could indicate a respiratory or cardiovascular issue." |
| SpO2 < 90% at any time (non-altitude) | "A reading below 90% is concerning and warrants prompt medical attention, especially if you're experiencing shortness of breath." |
| Recurrent night SpO2 dips + snoring + daytime sleepiness | "This pattern is consistent with sleep apnea, which is very common and very treatable. I'd strongly recommend a sleep study — it can change your quality of life significantly." |
| SpO2 < 85% at altitude + symptoms | "At this oxygen level with symptoms, you need to descend immediately and consider supplemental oxygen. Altitude sickness can progress rapidly." |
| User asks if SpO2 data rules out asthma/COPD | "Wearable SpO2 data can't diagnose respiratory conditions. If you have concerns, pulmonary function tests from your doctor are the proper diagnostic tool." |
