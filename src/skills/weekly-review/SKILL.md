---
name: weekly-review
description: "Generate comprehensive weekly health reports with trend analysis and actionable insights"
metadata:
  {
    "pha": {
      "emoji": "📅",
      "requires": { "tools": ["get_weekly_summary", "get_health_data", "get_sleep", "get_heart_rate"] },
      "triggers": ["weekly", "week", "this week", "last week", "weekly review", "weekly report", "7 days", "week summary", "这周", "本周", "上周", "一周", "周报", "这一周", "七天", "周总结", "回顾", "复盘"]
    }
  }
---

# Weekly Review Skill

## Step 1: Classify the Review Type

| User Says | Review Type | Data Strategy |
|-----------|-----------|---------------|
| "How was my week?" | **General review** | `get_weekly_summary` — full multi-dimension overview |
| "Compare this week to last" | **Period comparison** | `get_weekly_summary` (contains 7 days), compare halves or reference memory |
| "Am I improving?" | **Progress check** | `get_weekly_summary` + `memory_search("weekly review")` for past data |
| "What should I focus on next week?" | **Forward planning** | Full review + identify weakest dimension |
| "Give me my weekly report" | **Formal report** | All available data, structured output |

## Step 2: Data Collection

**Always call `get_weekly_summary` first** — it provides the foundation.

For a comprehensive review, supplement with:
- `get_heart_rate(today)` — adds cardiovascular context
- `get_sleep(today)` — adds last night's detail
- `memory_search("weekly review")` — recalls previous week's assessment for comparison

## Step 3: Multi-Dimension Analysis Framework

### 3.1 Activity Dimension

**Metrics to assess:**
- Total steps and daily average
- Days meeting step goal (8,000+ default)
- Active vs sedentary days distribution

**Assessment:**

| Pattern | Rating | Commentary |
|---------|--------|-----------|
| Goal met 6-7/7 days | Excellent | "Outstanding consistency — you hit your step goal nearly every day." |
| Goal met 4-5/7 days | Good | "Solid week. The off days might be worth looking at — were they intentional rest?" |
| Goal met 2-3/7 days | Needs attention | "Activity was lower this week. Let's see what's going on and adjust." |
| Goal met 0-1/7 days | Concern | "Very quiet week activity-wise. Everything OK? Sometimes life gets in the way." |

**Trend commentary:**
- Compare first half (Mon-Wed) vs second half (Thu-Sun) for within-week momentum
- Note weekend vs weekday patterns — many people drop off on weekends
- Highlight best day and acknowledge the effort

### 3.2 Sleep Dimension

**Metrics to assess:**
- Average sleep duration
- Consistency (spread between shortest and longest night)
- Nights below 6 hours (red flag count)

**Assessment:**

| Average | Consistency | Verdict |
|---------|------------|---------|
| 7-8h | Low spread (< 1h) | "Sleep is your strong suit this week — consistent and adequate." |
| 7-8h | High spread (> 2h) | "Your average looks fine, but the inconsistency might be affecting quality." |
| 6-7h | Any | "Slightly below optimal. Even 30 more minutes could make a noticeable difference." |
| < 6h | Any | "Sleep was significantly under target. This affects everything — energy, recovery, mood." |

### 3.3 Heart Rate Dimension

**If HR data available:**
- Current resting HR vs expected baseline
- Any concerning trends (upward drift = stress/overtraining)

### 3.4 Cross-Dimension Synthesis

This is the core value of a weekly review — connecting the dots:

**Pattern: High activity + Poor sleep**
→ "You were very active this week but sleep suffered. Check if late workouts are the cause — try finishing exercise 3+ hours before bed."

**Pattern: Low activity + Good sleep**
→ "Sleep was solid but activity was low. Sometimes the energy from good sleep isn't being channeled into movement."

**Pattern: Declining activity through the week**
→ "You started the week strong but tapered off. This could be fatigue accumulation or just a busy schedule."

**Pattern: Weekend drop-off**
→ "Your weekday activity is great, but weekends see a big drop. Even a weekend walk can maintain the habit."

**Pattern: Everything improving**
→ "This is a genuinely strong week across the board. You should feel good about this trajectory."

## Step 4: Report Structure

### For a "How was my week?" (casual)

Keep it to 3-4 sentences:
1. Overall verdict (one sentence)
2. Strongest dimension
3. Area for improvement
4. One specific suggestion

Example: "Solid week overall. Your activity was consistent with 5 days above your step goal. Sleep could use attention — you averaged 6.3h which is below your usual. Try setting a consistent bedtime this coming week."

### For a "Give me my weekly report" (formal)

Structured format:

```
This Week's Health Summary (Mon-Sun)

Activity: [rating] — Avg X steps/day, goal met X/7 days
Sleep: [rating] — Avg Xh/night, consistency [good/mixed/poor]
Heart Rate: Resting avg X bpm [normal/elevated/low]

Highlights:
- [Best achievement this week]
- [Notable pattern or correlation]

Area to Watch:
- [Weakest dimension + specific concern]

Suggestion for Next Week:
- [One concrete, actionable recommendation]
```

### For a "Am I improving?" (progress)

Compare to previous data:
- Reference `memory_search` for past week assessments
- Quantify changes: "Steps up 12% from last week"
- Highlight direction of travel, not just current numbers
- If no prior data: "This is our first weekly review together. I'll use this as your baseline."

## Step 5: Communication Guidelines

### Lead with the Narrative, Not the Numbers

**BAD**: "Steps: 52,340 total, 7,477 avg. Sleep: 6.8h avg. HR: 72 bpm resting."

**GOOD**: "You had a well-balanced week. Activity was consistent with your step goal met 5 out of 7 days. Sleep averaged a healthy 6.8 hours, though Friday and Saturday nights dipped below 6 hours — probably worth watching. Your resting heart rate stayed steady at 72, which is right in your normal range."

### Be Honest About Bad Weeks

Don't sugarcoat, but be constructive:

**BAD**: "This week wasn't great."

**GOOD**: "Tough week — activity was down and sleep was inconsistent. That happens. The good news is you're checking in, which means you're still engaged. Let's pick one thing to focus on next week."

### Celebrate Consistency Over Peaks

- "You hit your step goal 6 out of 7 days" beats "You had a 15,000 step day"
- Consistency signals habit formation, which matters more for health outcomes

### End With Forward Momentum

Every review should end with something forward-looking:
- A specific goal for next week
- A pattern to watch
- A question to reflect on

## Memory & Personalization

**Profile fields to use:**
- **Goals** (all): Frame the entire review against the user's goals. "Your step goal is 8,000 — you hit it 5/7 days."
- **Lifestyle** (exercisePreference): When suggesting improvements, stay within their preferences.

**When to search memory:**
- `memory_search("weekly review")` — **Essential for this skill.** Recall the previous week's assessment to show progress, regression, or consistency across weeks. Without this, you can only analyze the current week in isolation.
- `memory_search("goal change")` — Check if goals were recently adjusted (avoid measuring against outdated targets).

**What to save:**
- `memory_save` — Record the week's key stats as a baseline for future comparison: "Week of Jan 13-19: Avg steps 8,200, avg sleep 6.8h, 3 workouts. Trend: activity up, sleep stable."
- `daily_log` — Summarize the review.

**Personalization examples:**
- "Compared to last week's review, your step average went from 6,800 to 8,200 — that's a 20% jump. The daily walks you added are clearly paying off."
- "This is our third weekly review together. Your trajectory over these 3 weeks shows a clear upward trend in consistency."

## Red Lines

| Signal | Action |
|--------|--------|
| Multiple dimensions declining for 2+ weeks | "I've noticed a downward trend across several metrics. Is everything alright? Sometimes external factors affect our health routines." |
| User fixating on daily numbers obsessively | "The weekly view matters more than any single day. Let's focus on the trend." |
| Data shows extreme patterns (no sleep, excessive exercise) | Gently flag, don't lecture. Refer to specific skill (sleep-coach, workout-tracker) for deeper guidance. |
