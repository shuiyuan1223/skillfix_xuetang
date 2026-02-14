---
name: blood-pressure
description: "Analyze blood pressure data, assess cardiovascular risk levels, and provide lifestyle intervention guidance"
metadata:
  {
    "pha": {
      "emoji": "🩺",
      "requires": { "tools": ["get_blood_pressure", "get_heart_rate"] },
      "triggers": ["blood pressure", "BP", "hypertension", "hypotension", "systolic", "diastolic", "血压", "高血压", "低血压", "收缩压", "舒张压", "血压高", "血压低", "降压", "头晕", "脉压"]
    }
  }
---

# Blood Pressure Monitor Skill

## Step 1: Classify the Question

| User Says | Question Type | What to Investigate |
|-----------|-------------|-------------------|
| "Is my blood pressure normal?" | **Baseline check** | Compare to classification standards |
| "My blood pressure is high" | **Acute concern** | Check context: stress? white coat? measurement error? |
| "Blood pressure trend" | **Trend analysis** | Pull multi-day data, look for patterns |
| "How do I lower my blood pressure?" | **Intervention guidance** | Current level + lifestyle factors |
| "What does my pulse pressure mean?" | **Pulse pressure analysis** | Systolic - diastolic gap |

## Step 2: Data Collection Strategy

| Question Type | Required Calls | Why |
|-----------|---------------|-----|
| Baseline check | `get_blood_pressure(today)` | Current reading |
| Trend analysis | `get_blood_pressure(7-30d)` | Multi-day average (single readings unreliable) |
| Full assessment | `get_blood_pressure(7d)` + `get_heart_rate(today)` + `get_sleep(today)` | BP + HR + sleep context |
| Intervention tracking | `get_blood_pressure(30d)` + `get_workouts(week)` | Long-term trend + activity level |

## Step 3: Expert Assessment Framework

### 3.1 Blood Pressure Classification (Chinese Hypertension Guidelines)

**Always use the average of multiple measurements, not a single reading.**

| Category | Systolic (mmHg) | Diastolic (mmHg) |
|----------|----------------|-----------------|
| Ideal | < 120 | < 80 |
| Normal | 120-129 | 80-84 |
| High-normal | 130-139 | 85-89 |
| Grade 1 Hypertension (mild) | 140-159 | 90-99 |
| Grade 2 Hypertension (moderate) | 160-179 | 100-109 |
| Grade 3 Hypertension (severe) | ≥ 180 | ≥ 110 |

**Classification rule**: When systolic and diastolic fall into different categories, use the higher category.

### 3.2 Pulse Pressure Analysis

Pulse pressure = Systolic - Diastolic

| Range | Interpretation |
|-------|--------------|
| 30-60 mmHg | Normal |
| > 60 mmHg | May indicate arterial stiffness — more common with age |
| < 30 mmHg | May indicate reduced cardiac output — worth monitoring |

### 3.3 Blood Pressure Patterns

**Diurnal rhythm**: BP normally dips 10-20% during sleep (dipping pattern)
- **Non-dipping**: BP doesn't drop at night → higher cardiovascular risk
- **Morning surge**: BP spikes in early morning → highest stroke risk window

**White coat hypertension**: Elevated readings in clinical settings but normal at home — home monitoring is valuable for ruling this out.

**Masked hypertension**: Normal in clinic but elevated at home — this is the more dangerous pattern.

### 3.4 Lifestyle Impact Factors

| Factor | Effect on BP |
|--------|-------------|
| Salt intake > 6g/day | Significant increase |
| Each 5 kg of weight loss | ~5 mmHg reduction |
| Regular exercise (150 min/week moderate) | 5-8 mmHg reduction |
| Alcohol (> 2 drinks/day) | Elevates BP |
| Chronic stress / poor sleep | Sustained elevation |
| Caffeine | Temporary spike (1-3 hours) |
| Potassium-rich foods (bananas, spinach) | Helps counterbalance sodium |

## Step 4: Cross-Domain Analysis

**BP + Heart Rate:**
- Elevated BP + elevated resting HR → sympathetic nervous system overactivation (stress, deconditioning)
- Elevated BP + normal HR → may be volume-related or arterial stiffness

**BP + Sleep:**
- Sleep deprivation is an independent risk factor for hypertension
- Night shift workers have higher hypertension prevalence
- Check: Is BP elevated on days following poor sleep?

**BP + Exercise:**
- Regular moderate exercise is one of the strongest non-pharmacological interventions
- BP temporarily rises during exercise (normal) but resting BP decreases over time
- Avoid heavy weight lifting (Valsalva maneuver) if BP is consistently > 160/100

**BP + Weight:**
- Overweight/obesity is the strongest modifiable risk factor
- Even modest weight loss (5 kg) produces meaningful BP reduction
- Visceral fat is more strongly associated with hypertension than subcutaneous fat

**BP + Diet:**
- High sodium days often correlate with elevated BP next day
- DASH diet pattern (fruits, vegetables, low-fat dairy, reduced sodium) is most evidence-based

## Step 5: Personalized Communication

### Rule: Don't Alarm From Single Readings

**BAD**: "Your blood pressure is 142/91, you have hypertension."

**GOOD**: "Today's reading is 142/91, which is above the normal range. However, a single reading isn't enough to classify blood pressure — it can be affected by recent caffeine, stress, or even the time of day. Let's look at your trend over the past week... Your 7-day average is 135/87, which is in the high-normal range. This is actually the best window for lifestyle changes to prevent it from progressing."

### Measurement Guidance

When users seem to have erratic readings, offer measurement tips:
- Sit quietly for 5 minutes before measuring
- Same arm, same time of day for consistency
- Don't measure right after caffeine, exercise, or a meal
- Morning readings (before medication if applicable) are most informative

### Encourage, Don't Catastrophize

**High-normal range**: "Your blood pressure is in the high-normal zone — this is exactly where lifestyle changes are most powerful. Regular brisk walking, reducing salt, and managing stress can keep it from progressing."

## Memory & Personalization

**When to search memory:**
- `memory_search("blood pressure")` — Check for established BP baseline and history
- `memory_search("hypertension")` or `memory_search("medication")` — Check for known hypertension diagnosis or BP medications
- `memory_search("salt")` or `memory_search("diet")` — Dietary patterns that affect BP

**What to save:**
- `memory_save` — Record: BP baseline range, hypertension diagnosis status, medication use, effective interventions
- `daily_log` — Note significant BP readings and context

## Red Lines — When to Escalate

| Signal | Action |
|--------|--------|
| Systolic consistently > 160 mmHg on multiple readings | "Blood pressure consistently above 160 needs professional evaluation. Please schedule a doctor's visit for proper assessment and discussion of treatment options." |
| BP > 180/110 (hypertensive crisis range) | "This reading is in the hypertensive crisis range. If accompanied by symptoms (severe headache, chest pain, vision changes, shortness of breath), seek emergency medical care immediately." |
| User asking about adjusting or stopping BP medication | "Medication changes must always be decided with your doctor. Suddenly stopping BP medication can cause dangerous rebound hypertension." |
| Symptoms: severe headache, vision changes, chest pain with elevated BP | "These symptoms combined with elevated blood pressure require immediate medical attention. Please go to the emergency room or call emergency services." |
