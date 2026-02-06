---
name: heart-monitor
description: "Analyze heart rate data and provide cardiovascular health advice"
metadata:
  {
    "pha": {
      "emoji": "❤️",
      "requires": { "tools": ["get_heart_rate"] },
      "triggers": ["heart rate", "heartbeat", "pulse", "bpm", "resting heart rate", "cardio", "心率", "心跳", "脉搏", "心脏", "静息心率", "运动心率", "心血管", "心慌", "心悸", "房颤"]
    }
  }
---

# Heart Rate Monitor Skill

## Step 1: Classify the Question

| User Says | Question Type | What to Investigate |
|-----------|-------------|-------------------|
| "Is my heart rate normal?" | **Baseline check** | Compare resting HR to their history and population norms |
| "My heart rate is high/fast" | **Acute elevation** | Context: exercise? stress? illness? caffeine? |
| "Heart rate during exercise" | **Exercise HR** | Assess intensity zones, recovery rate |
| "Heart rate trend" / "How's my heart?" | **Trend analysis** | Pull weekly data, look for drift |
| "Heart rate while sleeping" | **Nocturnal HR** | Cross-reference with sleep quality |

## Step 2: Data Collection Strategy

| Question Type | Required Calls | Why |
|-----------|---------------|-----|
| Single day check | `get_heart_rate(date)` | Resting, min, max, hourly readings |
| Exercise context | `get_heart_rate(date)` + `get_workouts(date)` | Correlate HR with workout intensity |
| Sleep context | `get_heart_rate(date)` + `get_sleep(date)` | Night HR reveals sleep quality |
| Trend question | `get_weekly_summary` + `get_heart_rate(today)` | Week trend + today's detail |

## Step 3: Expert Assessment Framework

### 3.1 Resting Heart Rate

**Personal baseline is king.** A resting HR of 72 means nothing in isolation — it matters whether this person's baseline is 65 or 80.

Population reference:
| Category | Range | Notes |
|----------|-------|-------|
| Athletic | 40-55 bpm | Trained cardiovascular system |
| Good fitness | 55-65 bpm | Regular exercisers |
| Average | 65-75 bpm | Typical healthy adult |
| Above average | 75-85 bpm | May benefit from more cardio |
| Elevated | 85-100 bpm | Worth monitoring, investigate lifestyle factors |
| Tachycardic | > 100 bpm | Recommend medical evaluation if persistent |

**What drives resting HR changes:**
- Fitness improvement → gradual decline over weeks/months (positive)
- Stress, poor sleep, illness → acute increase (temporary)
- Overtraining → paradoxical increase despite exercise (warning sign)
- Caffeine, alcohol → temporary increase
- Dehydration → increase (often overlooked)
- Medication changes → consult doctor

### 3.2 Exercise Heart Rate Zones

Calculate using: Max HR ≈ 220 - age (if age available from profile)

| Zone | % Max HR | Purpose | Feel |
|------|----------|---------|------|
| Zone 1 | 50-60% | Recovery, warm-up | Easy, conversational |
| Zone 2 | 60-70% | Fat burning, base endurance | Comfortable, can talk |
| Zone 3 | 70-80% | Aerobic fitness | Moderate effort, short sentences |
| Zone 4 | 80-90% | Lactate threshold, speed | Hard, few words |
| Zone 5 | 90-100% | Max effort, VO2max | All-out, unsustainable |

**Practical guidance:**
- Most training time (80%) should be in Zone 1-2
- Only 20% should be high intensity (Zone 4-5)
- Common mistake: exercising too hard on easy days and too easy on hard days
- If workout avgHeartRate is consistently > 85% max HR, they may be overtraining

### 3.3 Recovery Heart Rate

How fast HR drops after exercise indicates cardiovascular fitness:
- Drop of 20+ bpm in 1 minute: Excellent recovery
- Drop of 12-20 bpm: Good
- Drop of < 12 bpm: Below average — may indicate need for more cardio base building

### 3.4 Heart Rate Variability (HRV) Context

HRV data may not be directly available, but resting HR trends serve as a proxy:
- Rising resting HR trend over days → body under stress (overtraining, illness, poor sleep)
- Stable or declining resting HR → good recovery, adaptation

## Step 4: Cross-Domain Analysis

**HR + Sleep:**
- Night resting HR elevated above baseline → poor sleep quality even if duration looks OK
- HR not dropping in first 2 hours of sleep → body didn't enter recovery mode
- Pattern: bad sleep night → elevated next-day resting HR → feels worse → sleeps badly → cycle

**HR + Exercise:**
- Check if avgHeartRate during workout matches the intended intensity
- Resting HR elevated the day after intense exercise → normal if returns to baseline in 24-48h
- Resting HR elevated 48h+ post-exercise → possible overtraining

**HR + Activity:**
- Sedentary day with elevated HR → stress, illness, or caffeine
- Active day with normal HR → healthy response
- Progressively lower HR at same exercise intensity over weeks → fitness improving

## Step 5: Personalized Communication

### Rule: Context Before Numbers

**BAD**: "Your resting heart rate is 78 bpm, which is in the normal range."

**GOOD**: "Your resting HR today is 78 bpm — that's about 6 bpm higher than your usual ~72. This kind of bump often shows up after a hard workout or a short night's sleep. I see you only got 5.5h of sleep last night, which is likely the cause. It should settle back down once you catch up on rest."

### Don't Alarm Unnecessarily

- Normal daily HR variation is 5-10 bpm — don't flag every fluctuation
- A single high reading doesn't mean anything — look at the trend
- Post-exercise elevation is completely normal and expected
- Caffeine, stress, even excitement causes temporary increases

### Do Flag Meaningful Changes

- Resting HR trending upward over 5+ days without obvious cause
- Resting HR consistently 15+ bpm above established baseline
- HR not recovering to baseline within 48h after exercise
- Any sudden change accompanied by symptoms the user reports

## Memory & Personalization

**Profile fields to use:**
- **Age** (from birthYear): Essential for max HR calculation (220 - age). Without age, you can't classify HR zones — ask for it or caveat your analysis.
- **Conditions**: Heart-related conditions (hypertension, arrhythmia) change how you interpret HR data. Be more cautious and recommend medical consultation more readily.
- **Medications**: Beta-blockers, stimulants, and other medications significantly affect heart rate. If user takes beta-blockers, a resting HR of 55 may be medication-induced, not athletic fitness.

**When to search memory:**
- `memory_search("heart rate baseline")` — Check if a personal baseline has been established in past conversations.
- `memory_search("palpitations")` or `memory_search("chest")` — Before interpreting elevated HR, check if user has reported cardiac symptoms before.
- `memory_search("caffeine")` or `memory_search("coffee")` — Caffeine habits affect HR interpretation.

**What to save:**
- `memory_save` — Record established baselines: "User's typical resting HR is 68-72 bpm based on 2 weeks of data." Record any cardiac symptoms reported.
- `daily_log` — Note significant HR events: "Resting HR elevated to 85 bpm, likely due to poor sleep (5h). User was reassured this is transient."

**Personalization examples:**
- "Your resting HR today is 78 — about 8 bpm above the baseline we established last month (~70). You mentioned having a stressful week, which likely explains it."
- "Since you're on beta-blockers, your heart rate zones are shifted lower than the standard formula suggests. Your 'moderate effort' zone is probably around 100-115 bpm rather than 120-140."

## Red Lines — When to Escalate

| Signal | Action |
|--------|--------|
| Resting HR consistently > 100 bpm | "A resting heart rate consistently above 100 warrants a check-in with your doctor, especially if you're not feeling unwell otherwise." |
| Resting HR < 50 bpm (non-athlete) | "A very low resting heart rate in someone who isn't a trained athlete can sometimes need evaluation. Worth mentioning at your next checkup." |
| User reports palpitations, chest pain, dizziness with HR data | "Those symptoms combined with your heart rate data should definitely be discussed with a doctor. I can share a summary of your recent HR data if that would help." |
| Sudden large HR change with no lifestyle explanation | Acknowledge, don't diagnose. "This is an unusual shift. If it persists for another day or two, I'd suggest checking in with your doctor." |
