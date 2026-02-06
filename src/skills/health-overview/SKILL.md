---
name: health-overview
description: "View daily health data overview including steps, calories, active minutes"
metadata:
  {
    "pha": {
      "emoji": "📊",
      "requires": { "tools": ["get_health_data", "get_weekly_summary"] },
      "triggers": ["steps", "calories", "activity", "overview", "summary", "progress", "步数", "步行", "走路", "卡路里", "热量", "活动", "运动量", "怎么样", "概览", "总结", "进度", "目标", "今天", "多少步", "消耗"]
    }
  }
---

# Health Overview Skill

## Step 1: Determine Scope

| User Says | Scope | Data Strategy |
|-----------|-------|---------------|
| "How am I doing?" / "My health overview" | **Full overview** | `get_health_data(today)` + `get_weekly_summary` |
| "How many steps today?" | **Single metric, today** | `get_health_data(today)` |
| "How was my week?" | **Weekly trend** | `get_weekly_summary` |
| "Am I on track?" / "How's my progress?" | **Goal tracking** | `get_weekly_summary` + check profile goals |
| "Compare this week to last week" | **Period comparison** | `get_weekly_summary` (contains 7-day data) |

## Step 2: Assessment Framework

### 2.1 Daily Activity

**Steps — Context Matters More Than The Number:**

Population benchmarks:
- < 4,000: Sedentary
- 4,000-7,999: Low active
- 8,000-9,999: Somewhat active
- 10,000-12,499: Active
- > 12,500: Highly active

**But always compare to the user's own goal and history first.**

- If their goal is 8,000 and they hit 7,200 → "You're at 90% of your daily goal — solid day"
- If their average is 5,000 and today is 8,000 → "Great day! 60% above your usual"
- If they usually hit 12,000 and today is 6,000 → "Lighter day for you. Rest days are fine."

**Active Minutes — The Underrated Metric:**

WHO recommends 150 min/week of moderate activity or 75 min/week of vigorous activity. That breaks down to:
- ~21 min/day moderate, or
- ~11 min/day vigorous

Active minutes often tells a more meaningful story than steps:
- 10,000 steps from slow walking ≠ 6,000 steps including a 30-min jog
- Highlight active minutes when the user has them — it's a quality signal

**Calories — Handle With Care:**

- Calorie numbers from wearables are estimates with significant error margins (±20-30%)
- Don't over-emphasize exact calorie numbers
- Better to discuss relative changes: "You burned about 15% more than your daily average"
- Never use calorie data to prescribe eating behavior

### 2.2 Weekly Patterns

When analyzing a week of data, look for:

**Consistency patterns:**
- Are they active most days or just 1-2 big days?
- "You hit your step goal 5 of 7 days this week" is more meaningful than total steps
- Weekend vs weekday pattern: Many people are sedentary on weekends

**Trend direction:**
- Improving week over week → celebrate and reinforce
- Declining → investigate gently: "Your steps were down a bit this week compared to last. Anything going on?"
- Stable → either maintaining well (positive) or plateaued (depends on goals)

**Red flag patterns:**
- Sudden drop from active to sedentary for multiple days → could be illness, injury, or motivation loss
- Consistently well below goals for 2+ weeks → time for a goal adjustment conversation

### 2.3 Goal Progress Assessment

**How to frame progress:**

| Progress | Tone | Example |
|----------|------|---------|
| > 100% of goal | Celebrate | "You exceeded your step goal by 20% today! Consistent effort is paying off." |
| 80-100% | Encourage | "7,800 of your 8,000 goal — almost there. A short evening walk would get you there." |
| 50-80% | Neutral + suggest | "You're at about 60% of your step goal with the evening still ahead. How about a walk after dinner?" |
| < 50% | Empathetic | "Quieter day today — that's OK. Any particular reason, or just how it worked out?" |

**Goal adjustment signals:**
- Consistently exceeding goal by > 30% for 2+ weeks → suggest raising the bar
- Consistently below 60% for 2+ weeks → either life circumstances changed or goal needs to be more realistic
- Ask, don't assume: "You've been averaging 12,000 steps when your goal is 8,000. Want to bump the goal up?"

## Step 3: Cross-Domain Connections

The overview is where you can surface cross-domain insights:

| Observation | Connection | How to Surface |
|-------------|-----------|---------------|
| Low steps + poor sleep last night | Sleep affects motivation | "Your sleep was only 5.5h last night, which might explain the quieter day. Rest and recovery count too." |
| High steps + workout + good sleep | Virtuous cycle | "Active day, good workout, and solid sleep — that's the trifecta." |
| High steps but no workout logged | Incidental activity | "8,500 steps from daily activity alone — that's great baseline movement." |
| Low steps for multiple days | May need investigation | Check: illness? weather? travel? Don't assume laziness. |

## Step 4: Communication Guidelines

### Lead With What Matters Most

For a general "how am I doing?" response, prioritize:
1. **Goal progress** — Are they on track for what they care about?
2. **Standout metric** — Anything notably good or concerning?
3. **Trend** — How does today/this week compare to their norm?
4. **One actionable suggestion** — Not a lecture, just one thing

### Avoid Data Dumps

**BAD**: "Today: 6,230 steps, 1,847 calories burned, 22 active minutes, 4.2 km distance. Your weekly average is 7,100 steps, average calories 1,920, average active minutes 18."

**GOOD**: "You're at 6,230 steps so far today — about 78% of your goal. Your active minutes (22 min) are actually above your daily average, which is great. One more short walk would put you over your step target."

### Match Response Length to Question

- "How many steps?" → One sentence with the number + context
- "How am I doing?" → 2-3 sentences covering the highlights
- "How was my week?" → Brief summary with 1-2 standout observations
- Only go detailed if the user asks follow-up questions

## Memory & Personalization

**Profile fields to use:**
- **Goals** (dailySteps, sleepHours, exercisePerWeek): Always assess against the user's own goals first, population benchmarks second.
- **Nickname**: Use their name naturally — "Looking good today, [name]" feels more personal than "Your metrics are normal."

**When to search memory:**
- `memory_search("weekly review")` — Recall last week's assessment for comparison: "Last week you averaged 7,200 steps. This week you're at 8,100 — nice improvement."
- `memory_search("goal")` — Check if goals were recently adjusted.

**What to save:**
- `memory_save` — Record significant milestone changes: "User consistently exceeding step goal for 3 weeks — suggested raising from 8,000 to 10,000."
- `daily_log` — Summarize the health overview discussed.

**Personalization examples:**
- "Your goal is 8,000 steps and you're at 7,500 — a quick 10-minute walk after dinner would put you over."
- "Compared to last week, your activity is up 15% and sleep consistency improved. The changes you made are working."

## Red Lines

| Signal | Action |
|--------|--------|
| Sudden multi-day drop to near-zero activity | Don't lecture. Gently check in: "I notice your activity has been really low the last few days. Everything OK?" |
| User is clearly sick/injured but still asking about goals | Prioritize recovery: "Your body needs rest right now. The goals will be there when you're feeling better." |
| User obsessing over daily numbers | Redirect to trends: "Day-to-day fluctuations are totally normal. The weekly trend is what really matters, and yours looks good." |
