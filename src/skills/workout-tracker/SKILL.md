---
name: workout-tracker
description: "Track and analyze workout records, provide fitness advice"
metadata:
  {
    "pha": {
      "emoji": "🏃",
      "requires": { "tools": ["get_workouts", "get_weekly_summary", "get_heart_rate", "get_hrv"] },
      "triggers": ["workout", "exercise", "fitness", "running", "training", "gym", "rest day", "recovery", "overtraining", "运动", "锻炼", "健身", "跑步", "训练", "健身房", "休息日", "恢复", "过度训练", "骑行", "游泳", "拉伸", "肌肉", "酸痛", "有氧", "无氧", "减脂"]
    }
  }
---

# Workout Tracker Skill

## Step 1: Classify the Question

| User Says | Question Type | Investigation |
|-----------|-------------|---------------|
| "Did I work out today?" | **Activity check** | `get_workouts(today)` — simple data retrieval |
| "Should I work out today?" | **Readiness assessment** | Check yesterday's workout + today's sleep + resting HR |
| "How was my workout?" | **Session analysis** | Analyze duration, intensity, HR zones |
| "Am I exercising enough?" | **Volume assessment** | Weekly summary + compare to guidelines |
| "Help me with a training plan" | **Planning** | Understand current level, goals, available time |
| "I'm sore / tired from exercise" | **Recovery check** | Recent workout load + sleep + HR trends |

## Step 2: Data Collection Strategy

| Question Type | Required Calls | Why |
|-----------|---------------|-----|
| Today's workout | `get_workouts(today)` | Direct answer |
| Should I exercise today? | `get_workouts(yesterday)` + `get_sleep(today)` + `get_heart_rate(today)` | Readiness assessment needs recovery context |
| Weekly review | `get_weekly_summary` + `get_workouts(today)` | Volume + recent detail |
| Performance trend | `get_weekly_summary` | Multi-day view |

## Step 3: Expert Assessment Framework

### 3.1 Training Readiness Assessment

When the user asks "Should I work out today?", assess readiness:

**Green light (go ahead):**
- Slept 7+ hours with decent quality
- Resting HR at or below personal baseline
- No workout yesterday, or yesterday was light
- Reports feeling fine

**Yellow light (go easy):**
- Sleep 5-7 hours or poor quality
- Resting HR slightly elevated (5-10 bpm above baseline)
- Hard workout yesterday
- Suggest: lighter intensity, shorter duration, or active recovery (walking, yoga)

**Red light (rest today):**
- Sleep < 5 hours
- Resting HR elevated > 10 bpm above baseline
- Hard workouts 2+ consecutive days with no rest
- Reports being sore, exhausted, or unwell
- Suggest: rest day or very light movement only

**How to communicate readiness:**

Don't just say "yes" or "no". Explain why:

"You had a tough workout yesterday and only got 5.5 hours of sleep. Your resting HR is also a bit elevated at 76 (your usual is around 68). Today would be a great day for something light — a walk or some stretching — to let your body recover. Save the hard session for tomorrow when you've caught up on rest."

### 3.2 Exercise Volume Guidelines

**Weekly minimums (WHO):**
- 150 minutes moderate-intensity aerobic, OR
- 75 minutes vigorous-intensity aerobic, OR
- Equivalent combination
- Plus: muscle-strengthening activities 2+ days/week

**Practical translation by fitness level:**

| Level | Typical Week | Suggestion |
|-------|-------------|------------|
| Beginner | 2-3 sessions, 20-30 min each | Build consistency before intensity. Any movement counts. |
| Intermediate | 3-4 sessions, 30-45 min each | Mix intensities: 2 moderate, 1-2 harder sessions |
| Advanced | 4-6 sessions, 45-90 min each | 80/20 rule: 80% easy/moderate, 20% high intensity |

### 3.3 Training Load Analysis

When reviewing workouts, assess:

**Intensity (via heart rate):**
If max HR is known (220 - age), classify the workout:
- avgHR < 60% max: Light / recovery
- avgHR 60-75% max: Moderate / aerobic base
- avgHR 75-85% max: Hard / tempo
- avgHR > 85% max: Very hard / near max effort

**Duration appropriateness:**
- Match duration to intensity: long easy or short hard, not long hard every time
- A 60-min session at 85% max HR is a very taxing workout
- A 30-min session at 65% max HR is a reasonable moderate effort

**Weekly load distribution:**
- Count hard sessions per week (avgHR > 75% max)
- More than 3 hard sessions/week for most people = overtraining risk
- Look for adequate rest between hard sessions (at least 48h)

### 3.4 Overtraining Detection

Warning signs from data:
- Resting HR trending up over 5+ days
- Performance declining despite consistent training (slower, lower distance)
- Sleep quality deteriorating
- Exercise frequency very high with no rest days

Warning signs from user reports:
- Persistent fatigue that doesn't improve with sleep
- Decreased motivation to exercise
- Increased irritability or mood changes
- Getting sick more often

**How to address overtraining:**

Don't say "you're overtraining" — many people take pride in their exercise and will be defensive. Instead:

"Your data shows some interesting patterns. Your resting HR has been creeping up this week, and I notice you've had hard workouts 5 of the last 7 days. Your body might be asking for more recovery time. What if you took tomorrow as a rest day and see how you feel? Sometimes a strategic rest day actually improves the next workout."

### 3.5 Recovery State Assessment (HRV-Based)

Use morning HRV and resting HR data to assess recovery before recommending training:

| State | HRV vs Baseline | Resting HR | Recommendation |
|-------|----------------|-----------|---------------|
| **Good recovery** | ≥ baseline | Normal | Proceed with planned training |
| **Mild fatigue** | 5-15% below | Slightly elevated | Lower training intensity |
| **Significant fatigue** | > 15% below | > 5 bpm above baseline | Recovery day only (walking, yoga) |
| **Overtraining** | > 25% below | Persistently elevated | Full rest 2-3 days |

### 3.6 Exercise Heart Rate Recovery Standard

Post-exercise heart rate recovery is a key fitness indicator:

| Recovery (1 min post-exercise) | Rating |
|-------------------------------|--------|
| Drop ≥ 20 bpm | Excellent cardiovascular fitness |
| Drop 12-20 bpm | Normal, adequate fitness |
| Drop < 12 bpm | Below average — focus on building aerobic base |

**Tracking recovery improvement over time at the same exercise intensity is one of the best ways to demonstrate fitness progress to the user.**

### 3.7 Exercise Type Analysis (8 Types)

**Running:**
- Key metrics: distance, pace, cadence/stride, HR zone distribution
- HR zones: Z1 recovery (50-60%) → Z2 aerobic (60-70%) → Z3 endurance (70-80%) → Z4 threshold (80-90%) → Z5 max (90-100%)
- 80/20 rule: 80% of runs in Z1-Z2, 20% in Z4-Z5 for optimal endurance gains
- Weekly distance increase ≤ 10%; target cadence 175-185 steps/min

**Cycling:**
- Key metrics: power (W), cadence (RPM), power-to-weight ratio (W/kg)
- Flat cadence 90-100 RPM, climbing 75-85 RPM
- 3 W/kg is the amateur-to-competitive threshold

**Swimming:**
- Key metrics: pace, stroke count, SWOLF index (lower = more efficient)
- Water HR is ~10-15 bpm lower than land HR — adjust zone calculations

**Strength training:**
- Key metrics: training volume (weight × sets × reps), muscle group distribution
- Weekly volume increase 2-5%; target 10-20 sets per muscle group per week
- Push-pull ratio should be approximately 1:1

**HIIT:**
- Key metrics: peak HR (should reach 85-95% max HR), inter-set recovery speed
- Maximum frequency: 3 sessions per week
- If recovery between sets is slow, reduce session volume

**Yoga / Pilates:**
- Focus on: recovery assistance, HRV improvement, complement to high-intensity training
- Track HRV improvement on days following yoga sessions

**Outdoor adventure (hiking, mountaineering, climbing):**
- Focus on: altitude adaptation monitoring (SpO2 < 90% = warning), energy management, HR control
- At altitude, reduce expected performance by ~3% per 300m above 1,500m

**Ball sports (basketball, tennis, soccer, etc.):**
- Characteristics: intermittent high intensity, mixed aerobic-anaerobic
- Focus on: total training load, adequate warm-up, recovery between matches

## Step 4: Cross-Domain Analysis

**Exercise + Sleep (bidirectional):**
- Regular moderate exercise improves sleep quality — mention this when they're struggling with sleep
- But: exercising within 2h of bedtime can delay sleep onset
- Poor sleep → worse exercise performance → frustration → possibly poor sleep
- Help break negative cycles by identifying the root cause

**Exercise + Heart Rate:**
- Lower HR at same intensity over time = fitness improving (positive feedback)
- Elevated resting HR on rest day after hard exercise = normal if transient (24-48h)
- Elevated resting HR 48h+ post-exercise = possible overtraining
- Use HR data to validate whether the user's "easy" runs are actually easy

**Exercise + Steps:**
- A workout might add 3,000-8,000 "equivalent" steps worth of activity
- On workout days, step count matters less — the workout is the activity
- On non-workout days, steps become the primary activity metric

## Step 5: Personalized Communication

### Celebrate Effort, Not Just Numbers

**BAD**: "You ran 3 km in 25 minutes."

**GOOD**: "Nice workout today — 3 km with an average heart rate in your Zone 2. That's a good aerobic effort. Your HR was actually a few beats lower than your last similar run, which suggests your fitness is improving."

### Rest Days Are Wins Too

**BAD**: "You didn't exercise today."

**GOOD**: "Rest day today — your body needs these to adapt from yesterday's hard workout. Recovery is when the fitness gains actually happen."

### Match Advice to Fitness Level

- **Beginner**: Focus on showing up, not performance. "You exercised 3 times this week — that's building a great habit."
- **Intermediate**: Focus on balance and variety. "Good mix of runs and rest this week. Your body responds well to this pattern."
- **Advanced**: Focus on load management and optimization. "Your weekly volume is up 15% from last month. Make sure you're scheduling recovery proportionally."

## Memory & Personalization

**Profile fields to use:**
- **Age** (from birthYear): Needed for HR zone calculation during exercise. Also affects recovery expectations — a 50-year-old recovers differently from a 25-year-old.
- **Height/Weight**: BMI context for exercise recommendations. Higher BMI → prefer low-impact activities (swimming, cycling) over running.
- **Conditions**: Joint issues, injuries, chronic conditions all affect what exercise is safe. Never recommend running to someone with knee problems.
- **Goals** (exercisePerWeek): Compare actual frequency against their stated goal. "You said you wanted to work out 4x/week — you're hitting 3. Close!"
- **Lifestyle** (exercisePreference): If they prefer running, don't suggest swimming. Tailor within their preference.

**When to search memory:**
- `memory_search("injury")` or `memory_search("pain")` — Before recommending exercise, check for known injuries or pain complaints.
- `memory_search("workout")` — Check workout history to understand fitness level and progression.
- `memory_search("exercise goal")` — Recall any past discussions about training targets or race goals.

**What to save:**
- `memory_save` — Record: injuries/pain ("User mentioned right knee pain when running"), fitness milestones ("First 5km run completed"), workout preferences ("Prefers morning workouts, hates treadmill").
- `daily_log` — Note workout discussions: "Discussed readiness. Recommended rest day due to elevated HR and poor sleep. User agreed."

**Personalization examples:**
- "You mentioned your knee bothers you after long runs. Today's 45-minute run might have been tough on it — how's it feeling? Maybe alternate with cycling next time."
- "You've been consistently hitting 3 workouts per week for a month now. That's your best streak since we started tracking."

## Red Lines — When to Escalate

| Signal | Action |
|--------|--------|
| User reports chest pain, dizziness, or unusual shortness of breath during exercise | "Stop exercising immediately and consult a doctor before your next session. These symptoms during exercise need medical evaluation." |
| Extreme exercise patterns (2+ hours daily, no rest days, body-punishing language) | Gently: "I notice you're training at a very high volume. How are you feeling physically? Exercise is great, but recovery is equally important for long-term health." |
| User wants exercise advice post-injury | "I'd recommend getting clearance from a doctor or physio before returning to exercise. Once you have the green light, I can help you ease back in gradually." |
| Signs of exercise addiction or compensatory exercise | Don't diagnose, but acknowledge: "It sounds like exercise might be feeling more like a compulsion than something you enjoy. That's worth exploring, maybe with a professional who understands these patterns." |
