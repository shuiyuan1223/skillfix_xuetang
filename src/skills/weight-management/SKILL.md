---
name: weight-management
description: "Analyze body composition data, manage weight loss/gain goals, and optimize body fat reduction strategies"
metadata:
  {
    "pha": {
      "emoji": "⚖️",
      "requires": { "tools": ["get_body_composition", "get_workouts", "get_nutrition"] },
      "triggers": ["weight", "body fat", "BMI", "lose weight", "fat loss", "diet", "body composition", "muscle mass", "visceral fat", "metabolism", "体重", "减脂", "减肥", "体脂", "体脂率", "增肌", "身体成分", "内脏脂肪", "基础代谢", "瘦身", "塑形", "平台期", "反弹"]
    }
  }
---

# Weight Management Skill

## Step 1: Classify the Question

| User Says | Question Type | What to Investigate |
|-----------|-------------|-------------------|
| "How's my weight?" / "Am I losing weight?" | **Progress check** | Weight/body fat trend over time |
| "I've hit a plateau" | **Plateau diagnosis** | Energy balance, metabolic adaptation |
| "How much should I eat to lose weight?" | **Calorie guidance** | Calculate TDEE, set deficit |
| "My weight went up!" | **Fluctuation concern** | Check context: water retention, menstrual cycle, sodium |
| "What's my body fat percentage?" | **Composition check** | Body fat, muscle mass, visceral fat analysis |

## Step 2: Data Collection Strategy

| Question Type | Required Calls | Why |
|-----------|---------------|-----|
| Progress check | `get_body_composition(date_range)` + `get_workouts(week)` | Weight + fat trend + activity context |
| Plateau diagnosis | `get_body_composition(30d)` + `get_nutrition(7d)` + `get_workouts(7d)` | Full energy balance picture |
| Calorie guidance | `get_body_composition(today)` + `get_workouts(week)` | BMR from composition + activity level |
| Fluctuation | `get_body_composition(7d)` + `get_menstrual_cycle` (if female) | Short-term trend + cycle context |

## Step 3: Expert Assessment Framework

### 3.1 Body Composition Reference

| Metric | Healthy Range |
|--------|-------------|
| Body fat % (female) | 20-30% (athletic: 18-24%) |
| Body fat % (male) | 10-20% (athletic: 8-17%) |
| Healthy weight loss rate | 0.5-1.0 kg/week (max 1% body weight) |
| Energy deficit | 500-750 kcal/day (never exceed 1000 kcal) |
| Minimum calorie intake | Female ≥ 1200 kcal, Male ≥ 1500 kcal |
| Protein during fat loss | 1.6-2.2 g/kg body weight/day |

### 3.2 Energy Balance Analysis

**Total Daily Energy Expenditure (TDEE)** = BMR + NEAT + Exercise + TEF

- **BMR**: From body composition scale or Mifflin-St Jeor formula
- **NEAT** (non-exercise activity thermogenesis): 15-50% of total expenditure
- **Exercise**: Logged workout calories
- **TEF** (thermic effect of food): ~10% of intake

**Weight change prediction**: 1 kg of fat ≈ 7,700 kcal deficit

### 3.3 Progress Assessment

Focus on **body fat % and muscle mass trends**, not just weight:

| Scenario | What It Means |
|----------|--------------|
| Weight down, body fat % down, muscle maintained | Ideal fat loss — celebrate |
| Weight stable, body fat % down, muscle up | Body recomposition — excellent |
| Weight down fast (>1.5 kg/week) | Likely losing muscle — slow down |
| Weight fluctuating ±1 kg daily | Normal water/sodium variation — ignore |
| Weight stalled 10+ days | True plateau — investigate energy balance |

### 3.4 Plateau Diagnosis

When weight stalls for 10+ days:
1. Check if calorie intake has crept up (diet fatigue)
2. Check if NEAT has decreased (body adaptation)
3. Check if BMR has dropped (metabolic adaptation signal)
4. Recommend: 1-week maintenance eating to restore metabolism, then resume deficit

### 3.5 Female Menstrual Cycle Considerations

- **Pre-menstrual weight gain of 0.5-2 kg is water retention, NOT fat gain**
- Weight typically drops back after period starts
- Best to compare weight at same cycle phase month-to-month
- Luteal phase may increase appetite — this is hormonal, not lack of willpower

## Step 4: Cross-Domain Analysis

**Weight + Nutrition:**
- Track energy balance: intake vs expenditure
- Protein adequacy is critical during fat loss to preserve muscle
- Meal timing matters less than total daily intake for most people

**Weight + Exercise:**
- Strength training preserves muscle during fat loss — more important than extra cardio
- Excessive cardio without strength training → muscle loss risk
- Post-exercise weight increase is often glycogen + water, not fat

**Weight + Sleep:**
- Sleep deprivation (< 6h) increases hunger hormones (ghrelin) and decreases satiety (leptin)
- Poor sleep → higher cortisol → promotes visceral fat storage
- Prioritize sleep as a weight management strategy

**Weight + Stress:**
- Chronic stress → elevated cortisol → promotes abdominal fat storage
- Stress eating patterns are common — acknowledge without judgment

## Step 5: Personalized Communication

### Rule: Body Composition Over Weight

**BAD**: "You gained 0.5 kg this week."

**GOOD**: "Your weight is up 0.5 kg this week, but your body fat dropped from 28% to 27.2% and muscle mass increased slightly. This is actually ideal body recomposition — you're replacing fat with muscle. The scale doesn't tell the whole story."

### Handle Weight Anxiety Carefully

- Never use judgmental language about weight or eating
- Normalize fluctuations: "Weight can vary 1-2 kg day to day from water, sodium, and food volume"
- For female users: always check cycle phase before interpreting weight changes
- Focus on health markers (body fat %, energy levels, fitness) over scale weight

### Plateau Encouragement

**GOOD**: "Plateaus are a normal part of the process — they mean your body has adapted, which is actually a sign of a healthy metabolism. Let's adjust your approach slightly to get things moving again."

## Memory & Personalization

**When to search memory:**
- `memory_search("weight goal")` — Check target weight or body fat goal
- `memory_search("plateau")` — Has this happened before? What worked?
- `memory_search("diet")` — Past dietary approaches, preferences, restrictions

**What to save:**
- `memory_save` — Record: starting measurements, goal targets, plateau events, successful strategies
- `daily_log` — Note significant body composition changes and context

## Red Lines — When to Escalate

| Signal | Action |
|--------|--------|
| Rapid weight loss > 2 kg/week consistently | "This rate of loss risks muscle wasting and metabolic damage. Please slow down and consider consulting a nutritionist." |
| Calorie intake < 1000 kcal/day | "This is below safe minimums. Your body needs adequate fuel. Please talk to a healthcare provider about a sustainable approach." |
| Signs of disordered eating (obsessive tracking, guilt about food, binge-restrict cycles) | Use warm, non-judgmental language. "Your relationship with food matters as much as the numbers. A professional who specializes in eating behavior could be really helpful." |
| BMI < 18.5 with continued desire to lose weight | "At your current weight, further loss could affect your health. I'd recommend discussing your goals with a doctor." |
