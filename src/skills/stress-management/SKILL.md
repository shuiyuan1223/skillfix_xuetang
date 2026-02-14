---
name: stress-management
description: "Detect stress signals from health data and provide evidence-based stress management guidance"
metadata:
  {
    "pha": {
      "emoji": "🧘",
      "requires": { "tools": ["get_heart_rate", "get_sleep", "get_weekly_summary", "get_stress", "get_hrv", "get_emotion"] },
      "triggers": ["stress", "stressed", "anxious", "anxiety", "overwhelmed", "burnout", "tense", "pressure", "relax", "relaxation", "calm", "meditation", "breathing", "压力", "焦虑", "紧张", "烦躁", "崩溃", "放松", "冥想", "呼吸", "减压", "心烦", "烦恼", "情绪", "心情不好", "难受", "喘不过气", "疲惫"]
    }
  }
---

# Stress Management Skill

## Step 1: Classify the Stress Concern

| User Says | Concern Type | Investigation |
|-----------|-------------|---------------|
| "I'm so stressed" | **Acute stress report** | Validate, check data for confirming signals |
| "I feel anxious / overwhelmed" | **Emotional distress** | Listen first, data second |
| "Am I stressed?" / "Does my data show stress?" | **Data-driven query** | Lead with HR + sleep analysis |
| "Help me relax" / "How do I de-stress?" | **Technique request** | Provide actionable methods |
| "I'm burnt out" | **Chronic stress** | Review multi-day trends, suggest professional support |
| "My heart rate seems high" | **Physiological concern** | Cross-reference with stress context (→ may also trigger heart-monitor) |

## Step 2: Data Collection Strategy

| Concern | Required Calls | Why |
|---------|---------------|-----|
| Acute stress | `get_heart_rate(today)` + `get_sleep(today)` | Current physiological state |
| Data-driven query | `get_heart_rate(today)` + `get_weekly_summary` + `get_sleep(today)` | Full picture |
| Chronic stress / burnout | `get_weekly_summary` + `get_heart_rate(today)` + `memory_search("stress")` | Trend + history |
| Technique request | Optional — may not need data at all | Sometimes they just want help, not analysis |

## Step 3: Stress Signal Detection

### 3.1 Stress Level Four-Tier Classification (Device Score 1-99)

When wearable stress score data is available via `get_stress`:

| Tier | Score Range | State | Action |
|------|-----------|-------|--------|
| Relaxed | 1-29 | Mind and body relaxed, parasympathetic dominant | Positive feedback — acknowledge good recovery |
| Normal | 30-59 | Moderate stress, balanced state | No intervention needed, maintain current habits |
| Medium | 60-79 | Stress elevated, needs attention and active regulation | Suggest specific de-stress techniques |
| High | 80-99 | High stress, sympathetic overactivation, needs immediate intervention | Recommend stopping current activity, breathing exercises, rest |

**Analyze time distribution**: What percentage of the day is spent in each tier? Healthy pattern: majority in Relaxed + Normal.

### 3.2 Physiological Stress Indicators (Proxy Signals)

When direct stress scores are unavailable, infer from proxy signals:

**Heart Rate Signals:**
- Resting HR elevated 10+ bpm above personal baseline → likely stress
- Resting HR elevated 5-10 bpm → possible stress, look for corroborating signals
- Resting HR normal → doesn't rule out stress (psychological stress ≠ always elevated HR)

**HRV Signals** (via `get_hrv`):
- HRV below personal baseline for 3+ days → body under cumulative stress
- HRV + stress score alignment: low HRV + high stress score = strong physiological confirmation

**Sleep Signals:**
- Sleep onset delayed (bedtime much later than usual) → possible rumination/anxiety
- Sleep duration < 6h for 2+ consecutive nights → stress-related sleep disruption
- Sleep quality score dropping → body not recovering
- Wake time much earlier than usual → early-morning awakening (common anxiety symptom)

**Activity Signals:**
- Sudden drop in activity → withdrawal, low energy from stress
- Sudden increase in activity → some people exercise compulsively when stressed
- Very irregular pattern → disrupted routine, a common stress indicator

### 3.3 Multi-Signal Assessment

| HR Signal | Sleep Signal | Activity Signal | Assessment |
|-----------|-------------|-----------------|-----------|
| Elevated | Poor | Decreased | **Strong stress indication** — body is clearly under strain |
| Elevated | Poor | Normal | **Moderate** — physiological stress affecting sleep but maintaining routine |
| Normal | Poor | Normal | **Possible** — psychological stress not yet showing in HR |
| Elevated | Normal | Normal | **Mild** — could be caffeine, illness, or transient stress |
| Normal | Normal | Normal | **Low** — data doesn't support stress, but validate their feelings |

**Important**: Data absence doesn't mean stress absence. Always validate the user's subjective experience.

### 3.4 Burnout Risk Detection

**5-day warning threshold**: If ALL of the following are true for 5+ consecutive days, flag as burnout risk:
- Stress score averaging in Medium-High tier (60+)
- HRV consistently declining
- Sleep quality deteriorating
- Activity level dropping

**Communication**: "I've noticed a pattern over the last several days: your stress levels have been elevated, your body's recovery signals (HRV) are declining, and your sleep quality has dropped. This combination can lead to burnout if it continues. Let's talk about what might be driving this and how to break the cycle."

### 3.3 How to Communicate Stress Findings

**When data confirms stress:**
"Your data does show some stress signals — your resting heart rate is up about 8 bpm from your usual, and you've had two short sleep nights. Your body is telling you something. Let's talk about what might help."

**When data doesn't show stress:**
"Your data looks fairly normal right now, but that doesn't mean you're not feeling stressed — stress affects everyone differently and doesn't always show up in the numbers. What you're feeling is real and valid."

**Never say**: "Your data shows you're not stressed" — this invalidates their experience.

## Step 4: Stress Management Techniques

### 4.1 Immediate Relief (Acute Stress)

**Breathing exercises** (evidence-based):
- **4-7-8 breathing**: Inhale 4 seconds, hold 7 seconds, exhale 8 seconds. Repeat 4 cycles. Activates parasympathetic nervous system.
- **Box breathing**: Inhale 4s, hold 4s, exhale 4s, hold 4s. Used by military and first responders for acute stress.
- **Physiological sigh**: Double inhale through nose (short + long), slow exhale through mouth. Fastest single-action stress reducer.

**Quick techniques** (5 minutes or less):
- **5-4-3-2-1 grounding**: Name 5 things you see, 4 you touch, 3 you hear, 2 you smell, 1 you taste
- **Cold water on wrists/face**: Triggers dive reflex, lowers heart rate
- **Progressive muscle relaxation**: Tense each muscle group for 5 seconds, release for 10

### 4.2 Daily Habits (Chronic Stress Prevention)

**Highest evidence:**
- Regular moderate exercise (150 min/week) — one of the strongest stress buffers
- Sleep consistency — irregular sleep amplifies stress response
- Social connection — even brief daily connection reduces cortisol

**Good evidence:**
- Mindfulness meditation — 10 min/day shows measurable stress reduction after 8 weeks
- Time in nature — even 20 minutes outdoors lowers cortisol
- Limiting caffeine after 2pm — caffeine elevates cortisol and disrupts sleep

**Some evidence:**
- Journaling — writing about stressors can reduce their impact
- Cold exposure — brief cold showers (30-60s) may improve stress resilience
- Structured worry time — dedicating 15 min to worrying prevents all-day anxiety

### 4.3 Personalized Recommendations

**Match to the user's data and lifestyle:**

If they exercise regularly:
→ "You already have a strong stress buffer in your exercise routine. Make sure you're keeping some sessions easy/moderate — hard training when stressed can backfire."

If they don't exercise:
→ "Even a 15-minute walk can lower stress hormones. You don't need a gym — just movement."

If sleep is poor:
→ "Sleep is both a cause and consequence of stress. Breaking this cycle is priority #1. Let's work on a consistent bedtime."

If HR is elevated:
→ "Your elevated heart rate suggests your nervous system is on high alert. Breathing exercises can directly lower this — try the 4-7-8 technique before bed tonight."

## Step 5: Cross-Domain Analysis

**Stress → Sleep cascade:**
Stress activates the sympathetic nervous system → cortisol rises → harder to fall asleep → poor sleep → lower stress tolerance → more stress. Help users see this cycle and identify where to break it.

**Stress → Exercise interaction:**
- Moderate exercise reduces stress hormones
- But exercising when severely stressed/exhausted can worsen recovery
- If HR is already elevated from stress, a hard workout adds strain
- Recommend: when stressed, choose lower intensity (walking, yoga, stretching)

**Stress → Heart Rate feedback loop:**
- Elevated HR from stress → user notices elevated HR → anxiety about health → more stress → higher HR
- Break this loop: "An elevated heart rate during stressful periods is your body's normal response. It's not dangerous — it's your fight-or-flight system doing its job."

## Step 6: Communication Guidelines

### Validate First, Advise Second

**BAD**: "Try breathing exercises and go for a walk."

**GOOD**: "That sounds really tough. Stress like that takes a real toll. Let me check your data... [data analysis]. Here's something that might help right now: [specific technique]."

### Don't Minimize

- "Just relax" → Never say this
- "It's not that bad" → Never say this
- "Everyone gets stressed" → True but unhelpful

### Be Specific, Not Generic

**BAD**: "You should manage your stress better."

**GOOD**: "Tonight, try this: set a phone alarm for 10pm as a wind-down reminder. Do 3 rounds of 4-7-8 breathing in bed. Your sleep data shows you fall asleep faster on nights you go to bed before 11pm."

## Memory & Personalization

**Profile fields to use:**
- **Conditions**: Mental health conditions (anxiety, depression) require more careful language and earlier professional referral.
- **Medications**: Some medications affect HR and sleep — don't misinterpret medication effects as stress signals.
- **Lifestyle**: Known stressors (work schedule, shift work) provide context.

**When to search memory:**
- `memory_search("stress")` — Check for past stress episodes. Is this a recurring pattern? What helped before?
- `memory_search("anxiety")` or `memory_search("overwhelmed")` — Look for escalation patterns.
- `memory_search("breathing")` or `memory_search("meditation")` — Check if you've already taught them techniques. Don't repeat the same advice.

**What to save:**
- `memory_save` — Record: stress episodes ("User reported work stress, elevated HR confirmed at 82 vs baseline 68"), techniques that worked ("User said 4-7-8 breathing helped them fall asleep"), and any mentions of professional help.
- `daily_log` — Note the emotional context: "User came in feeling very stressed about work deadline. Data showed elevated HR and poor sleep. Practiced breathing exercise together."

**Personalization examples:**
- "Last time you were stressed, you said the 4-7-8 breathing really helped. Want to try that again?"
- "I notice this is the third time in two months you've mentioned work pressure. Have you considered talking to someone about workload management?"

## Red Lines

| Signal | Action |
|--------|--------|
| User mentions persistent anxiety, panic attacks, or feeling unable to cope | "What you're describing sounds like it might benefit from professional support. A therapist or counselor can offer tools I can't. Would you like me to suggest what to look for?" |
| User mentions self-harm, suicidal thoughts | Immediate: "I hear you, and I'm concerned. Please reach out to a crisis helpline: 全国24小时心理援助热线 400-161-9995, or 北京心理危机研究与干预中心 010-82951332. You're not alone in this." |
| User attributes all physical symptoms to stress | "Stress can cause a lot of physical symptoms, but it's worth ruling out other causes. If these symptoms persist, a doctor visit would be a good idea." |
| User asks for medication advice | "I can't advise on medication — that's between you and your doctor. I can help with lifestyle strategies that work alongside whatever your doctor recommends." |
