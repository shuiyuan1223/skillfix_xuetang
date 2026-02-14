---
name: time-resolver
description: "Resolve natural language time expressions into precise date ranges for health data queries"
metadata:
  {
    "pha": {
      "emoji": "📅",
      "requires": { "tools": [] },
      "triggers": []
    }
  }
---

# Health Query Time Resolver Skill

This skill is an internal reference for the Agent. It is NOT auto-triggered by user messages. The Agent should consult this skill when interpreting time expressions in health data queries.

## Rule Priority

Apply rules in this order:
1. **Sleep scenario** — if applicable, use sleep-specific rules
2. **Menstrual/data-occurrence scenario** — if applicable, use special default ranges
3. **General time parsing** — for all other cases

---

## Section 1: General Time Parsing Rules

### 1.1 No Time Expression

When the query contains no time-related words, **do not provide a time range** — let the tool use its default behavior.

> "What's my heart rate during sleep?" → no time parameter
> "What's my weight?" → no time parameter

### 1.2 Count-Based Expressions

When the user says "last time", "recent N times", etc., output a count rather than a date range.

**Explicit count:**
- "last time" / "most recent" → last 1
- "second to last" → last 2nd
- "Nth time" → Nth from start

**Fuzzy count:**
- "recent few times" → last 7
- "previous few times" → context-dependent (relative=last 7, absolute=first 7)

### 1.3 This Week / This Month / This Quarter / This Year

| Expression | Start | End |
|-----------|-------|-----|
| This week | This Monday | Today |
| This month | 1st of current month | Today |
| This quarter | First day of current quarter (1/1, 4/1, 7/1, 10/1) | Today |
| This year | January 1st | Today |

### 1.4 X Weeks Ago / X Months Ago (Complete Natural Period)

Returns the **complete** past natural week or month, excluding the current one.

**X weeks ago:**
- Start = This Monday - X×7 days
- End = Start + 6 days

**X months ago:**
- Start = 1st of that month
- End = last day of that month

| Expression | Example (today = Feb 3, Tuesday) |
|-----------|--------------------------------|
| Last week | Jan 26 (Mon) – Feb 1 (Sun) |
| 2 weeks ago | Jan 19 (Mon) – Jan 25 (Sun) |
| Last month | Jan 1 – Jan 31 |
| 3 months ago | Nov 1 – Nov 30 |

### 1.5 These X Weeks / These X Months (Including Current Period)

From X periods ago to today, **including the current period**.

**These X weeks:**
- Start = This Monday - (X-1)×7 days
- End = Today

**These X months:**
- Start = 1st of the month (X-1) months ago
- End = Today

| Expression | Example (today = Feb 3, Tuesday) |
|-----------|--------------------------------|
| These 2 weeks | Jan 26 (Mon) – Feb 3 |
| These 3 weeks | Jan 19 (Mon) – Feb 3 |
| These 2 months | Jan 1 – Feb 3 |
| These 3 months | Dec 1 – Feb 3 |

**Fuzzy defaults:**
- "These few weeks" / "past few weeks" → same as "these 2 weeks"
- "These few months" / "recent months" → same as "these 2 months"

### 1.6 Last X Weeks / Last X Months (Rolling Days)

End = Today, roll back by calendar days.

**Last X weeks:**
- Start = Today - X×7 + 1 day
- End = Today

**Last X months:**
- Start = Current month minus X months, same day + 1
- If that date doesn't exist, roll to the 1st of the next month
- End = Today

| Expression | Example (today = Feb 3) |
|-----------|----------------------|
| Last 2 weeks | Jan 21 – Feb 3 |
| Last 3 weeks | Jan 14 – Feb 3 |
| Last 2 months | Dec 4 – Feb 3 |
| Last 3 months | Nov 4 – Feb 3 |

**Special equivalences:**
- "Last quarter" → same as "last 3 months"
- "Last half year" → same as "last 6 months"

### 1.7 "Recently" / "These Days" / "Usually"

These fuzzy expressions all map to **last 7 days (including today)**.

- Start = Today - 6 days
- End = Today

### 1.8 "Up to Now" / "Historical" / "Long-term"

When the user queries long-term data without a clear start date, use **2 years ago from today** as the start.

### 1.9 Multi-Period Split Queries

When the user asks "for each period separately", split into independent ranges.

> "Show me my activity calories for each of these 2 weeks" → Week 1 range, Week 2 range (separately)
> "Monthly running distance for these 3 months" → Month 1, Month 2, Month 3 (separately)

---

## Section 2: Sleep Scenario Special Rules

### Why Sleep Needs Special Handling

Sleep data is recorded under the **wake-up date**. E.g., sleep starting Jan 5 night, waking Jan 6 morning → recorded as Jan 6.

### Identifying Sleep Scenarios

Enter sleep rules when query contains: sleep, slept, insomnia, sleep quality, sleep score, deep sleep, light sleep, REM, snoring, etc.

### Sleep Time Mapping

| User Expression | Record Date | Explanation |
|----------------|------------|------------|
| "Day before yesterday's sleep" | Day before yesterday | Refers to waking up that day |
| "Night before last's sleep" | Yesterday | Night before last → woke up yesterday |
| "January 5th's sleep" | Jan 5 | Woke up Jan 5 |
| "January 5th night's sleep" | Jan 6 | Fell asleep Jan 5, woke up Jan 6 |
| "Yesterday/last night/today's sleep" | Today | Most recent wake-up (this morning) |
| "Tonight's sleep" | No time param | Hasn't happened yet |

**Core logic:**
- Mentions "night" → date + 1 (fell asleep that night, woke up next day)
- No "night" mention → use that date directly (woke up that day)
- "Yesterday"/"last night"/"today" in sleep context → today's date
- "Tonight" → hasn't occurred, no time parameter

### Multi-Turn Sleep Context

If previous turn established a sleep context, follow-up questions maintain sleep rules.

---

## Section 3: Special Domain Defaults

### Menstrual Cycle Queries

When query involves menstrual/period topics with fuzzy time words (like "recently"), default to **last 3 months** (not the general 7 days), because cycles are monthly.

### Querying When Something Occurred

When the user wants to know when a specific event happened ("When was the last time my BP was high?"):
- **Physiological metrics** (weight, BP, SpO2, temperature, HR) → last 3 months
- **Activity metrics** (workouts, steps) → last 1 month
