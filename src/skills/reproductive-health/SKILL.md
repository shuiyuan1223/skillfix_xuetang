---
name: reproductive-health
description: "Analyze menstrual cycle data, track cycle regularity, and provide phase-specific health guidance for women"
metadata:
  {
    "pha": {
      "emoji": "🌸",
      "requires": { "tools": ["get_menstrual_cycle", "get_body_temperature", "get_emotion"] },
      "triggers": ["period", "menstrual", "menstruation", "cycle", "ovulation", "PMS", "cramps", "经期", "月经", "生理期", "大姨妈", "排卵", "排卵期", "痛经", "经前", "经量", "闭经", "周期", "姨妈", "例假"]
    }
  }
---

# Reproductive Health Skill (Female)

## Step 1: Classify the Question

| User Says | Question Type | What to Investigate |
|-----------|-------------|-------------------|
| "When is my next period?" | **Cycle prediction** | Calculate from recent cycle data |
| "Is my cycle regular?" | **Regularity assessment** | Analyze 3-6 months of cycle data |
| "I have cramps / PMS symptoms" | **Symptom management** | Current cycle phase + lifestyle factors |
| "Am I ovulating?" | **Ovulation tracking** | BBT pattern + cycle day |
| "My period is late / early" | **Irregularity concern** | Compare to personal pattern, check stressors |
| "How should I exercise during my period?" | **Phase-specific guidance** | Current cycle phase + activity recommendations |

## Step 2: Data Collection Strategy

| Question Type | Required Calls | Why |
|-----------|---------------|-----|
| Cycle prediction | `get_menstrual_cycle` | Recent cycle history for prediction |
| Regularity check | `get_menstrual_cycle` (3-6 months) | Statistical analysis of cycle length |
| Symptom management | `get_menstrual_cycle` + `get_emotion` + `get_sleep(today)` | Phase context + symptom correlation |
| Ovulation tracking | `get_menstrual_cycle` + `get_body_temperature(14d)` | BBT biphasic pattern confirmation |
| Phase-specific guidance | `get_menstrual_cycle` + `get_workouts(today)` | Current phase + activity level |

## Step 3: Expert Assessment Framework

### 3.1 Cycle Reference Standards

| Metric | Normal Range |
|--------|-------------|
| Cycle length | 22-35 days |
| Period duration | 3-7 days |
| Post-ovulation temperature rise | ≥ 0.3°C |
| Normal menstrual volume | 20-80 mL per cycle |
| Pre-menstrual weight fluctuation | +0.5-2 kg (water retention, normal) |

### 3.2 Menstrual Cycle Four Phases

| Phase | Timing (28-day cycle) | Hormone Profile | Body State |
|-------|----------------------|----------------|-----------|
| **Menstrual** | Day 1-5 | Estrogen & progesterone both low | Lower energy, possible cramps |
| **Follicular** | Day 6-13 | Estrogen gradually rising | Energy increasing, best time for high-intensity training |
| **Ovulation** | ~Day 14 | Estrogen peak + LH surge | Peak physical performance; slightly higher ligament laxity risk |
| **Luteal** | Day 15-28 | Progesterone rising | Fatigue-prone, mood fluctuations, temperature rises |

### 3.3 Regularity Assessment

Calculate from 3-6 months of data:
- **Average cycle length** and **standard deviation**
- Variation < 3 days: Very regular
- Variation 3-7 days: Moderately regular
- Variation > 7 days: Irregular — investigate causes

**Common causes of irregularity**: stress, significant weight change, excessive exercise, travel, illness, hormonal conditions

### 3.4 BBT (Basal Body Temperature) Analysis

- **Biphasic pattern** (lower pre-ovulation, higher post-ovulation): Indicates ovulation occurred
- **Monophasic pattern** (no clear shift): May indicate anovulatory cycle
- Temperature must be measured consistently (morning before rising) for accuracy
- Post-ovulation temperature sustained 11+ days followed by drop → period imminent

### 3.5 PMS Symptom Management

Common PMS symptoms (luteal phase, day 21-28):
- **Mood changes**: Irritability, anxiety, sadness — linked to progesterone fluctuations
- **Physical**: Bloating, breast tenderness, headaches, fatigue
- **Cravings**: Increased appetite, carb cravings — hormonal, not lack of willpower

**Evidence-based relief:**
- Reduce sodium and caffeine intake 5-7 days before expected period
- Regular moderate exercise throughout the cycle reduces PMS severity
- Magnesium-rich foods (dark chocolate, nuts, leafy greens) may help
- Adequate sleep is especially important during luteal phase

## Step 4: Cross-Domain Analysis

**Cycle + Exercise:**
- Follicular phase: Best time for high-intensity training, strength PRs
- Ovulation: Peak performance, but slightly higher injury risk (ligament laxity)
- Luteal phase: Reduce intensity, focus on moderate activity
- Menstrual phase: Listen to your body — light exercise is fine if it feels OK

**Cycle + Sleep:**
- Luteal phase often brings sleep disruption (progesterone effect)
- Pre-menstrual insomnia is common and temporary
- If sleep worsens dramatically every luteal phase, worth tracking and addressing

**Cycle + Mood/Stress:**
- Mood dips in late luteal phase are hormonal and expected
- Cross-reference with stress data: is the mood pattern cyclical?
- Validate feelings while providing context: "This is real and it has a hormonal basis"

**Cycle + Weight:**
- Pre-menstrual weight gain is water retention, NOT fat
- Compare weight at same cycle phase for accurate trend tracking
- Weight typically returns to baseline after period starts

## Step 5: Personalized Communication

### Rule: Respectful and Warm Tone

Reproductive health is deeply personal. Always maintain a respectful, warm, non-judgmental tone.

**BAD**: "Your cycle is irregular, which could indicate a problem."

**GOOD**: "Your cycle has varied between 25 and 33 days over the last 4 months. Some variation is normal, but since the range is wider than typical, it might be worth mentioning at your next gynecologist visit — especially if you've noticed other changes."

### Cycle Phase Context

**GOOD**: "You're on day 8 of your cycle (follicular phase) — estrogen is rising, and this is typically when energy and motivation are highest. Great time for that strength workout you've been planning!"

### Weight Fluctuation Reassurance

**GOOD**: "Your weight is up 1.2 kg from last week, but you're 3 days before your expected period. Pre-menstrual water retention of 0.5-2 kg is completely normal and will resolve after your period starts. This has nothing to do with your fat loss progress."

## Memory & Personalization

**When to search memory:**
- `memory_search("menstrual cycle")` or `memory_search("period")` — Check cycle history and patterns
- `memory_search("PMS")` or `memory_search("cramps")` — Past symptoms and what helped
- `memory_search("cycle irregularity")` — Previous discussions about irregular cycles

**What to save:**
- `memory_save` — Record: average cycle length, regularity pattern, known PMS symptoms, effective remedies
- `daily_log` — Note cycle-related discussions and symptom reports

## Red Lines — When to Escalate

| Signal | Action |
|--------|--------|
| Cycle consistently < 22 days or > 35 days | "A cycle consistently outside the 22-35 day range is worth discussing with your gynecologist to rule out hormonal issues." |
| Period lasting > 7 days or very heavy bleeding | "Prolonged or very heavy periods should be evaluated by a doctor. This is common and very treatable." |
| Amenorrhea (missed period 3+ months, not pregnant) | "Missing periods for 3+ months can have various causes. Please consult your gynecologist for evaluation." |
| Severe cramping that interferes with daily life | "Pain that prevents normal activities deserves medical attention. There are effective treatments available." |
| User asks about fertility or pregnancy planning | "I can share general cycle data, but fertility and pregnancy planning decisions should involve your gynecologist. I can't serve as a substitute for fertility assessment." |
| Abnormal bleeding (between periods, post-menopausal) | "Unexpected bleeding outside your normal period should be evaluated by a doctor promptly." |
