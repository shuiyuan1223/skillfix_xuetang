---
name: nutrition
description: "Analyze dietary intake, assess macronutrient balance, and provide personalized nutrition optimization advice"
metadata:
  {
    "pha": {
      "emoji": "🥗",
      "requires": { "tools": ["get_nutrition", "get_body_composition", "get_workouts"] },
      "triggers": ["diet", "nutrition", "calorie", "calories", "protein", "carbs", "carbohydrate", "fat", "meal", "eating", "food", "饮食", "营养", "热量", "卡路里", "蛋白质", "碳水", "脂肪", "吃饭", "早餐", "午餐", "晚餐", "加餐", "控制饮食", "营养均衡", "膳食"]
    }
  }
---

# Nutrition Skill

## Step 1: Classify the Question

| User Says | Question Type | What to Investigate |
|-----------|-------------|-------------------|
| "How much did I eat today?" | **Intake summary** | Total calories + macros |
| "Am I eating enough protein?" | **Nutrient check** | Protein vs target based on goals/weight |
| "What should I eat before/after working out?" | **Meal timing** | Exercise context + nutrient timing |
| "Is my diet balanced?" | **Macro balance** | Carb/protein/fat ratio vs goal |
| "How many calories should I eat?" | **Calorie guidance** | TDEE calculation + goal adjustment |

## Step 2: Data Collection Strategy

| Question Type | Required Calls | Why |
|-----------|---------------|-----|
| Daily summary | `get_nutrition(today)` | Today's intake |
| Weekly pattern | `get_nutrition(7d)` | Adherence and consistency |
| With body goals | `get_nutrition(7d)` + `get_body_composition(today)` | Intake vs body changes |
| Exercise nutrition | `get_nutrition(today)` + `get_workouts(today)` | Intake around workouts |
| Full assessment | `get_nutrition(7d)` + `get_body_composition(today)` + `get_workouts(7d)` | Complete picture |

## Step 3: Expert Assessment Framework

### 3.1 Daily Calorie Needs

**TDEE** = BMR × Activity Factor

| Activity Level | Factor | Description |
|----------------|--------|------------|
| Sedentary | 1.2 | Desk job, little exercise |
| Lightly active | 1.375 | Light exercise 1-3 days/week |
| Moderately active | 1.55 | Moderate exercise 3-5 days/week |
| Very active | 1.725 | Hard exercise 6-7 days/week |
| Extremely active | 1.9 | Physical job + hard exercise |

**Goal adjustments:**
- Fat loss: TDEE - 500 to -750 kcal
- Muscle gain: TDEE + 200 to +400 kcal
- Maintenance: TDEE ± 100 kcal
- **Minimums**: Female ≥ 1200 kcal, Male ≥ 1500 kcal

### 3.2 Macronutrient Targets by Goal

| Goal | Carbs | Protein | Fat |
|------|-------|---------|-----|
| Fat loss | 35-45% | 30-35% | 25-30% |
| Muscle gain | 45-55% | 25-30% | 20-25% |
| Endurance sport | 55-65% | 15-20% | 20-25% |
| Strength sport | 40-50% | 30-35% | 20-25% |

### 3.3 Protein Requirements

| Population | Daily Protein (g/kg body weight) |
|-----------|--------------------------------|
| Sedentary adults | 0.8-1.0 |
| General exercisers | 1.2-1.6 |
| Muscle building | 1.6-2.2 |
| Fat loss (muscle preservation) | 1.6-2.0 |
| Older adults (65+) | 1.2-1.5 |

**Protein distribution**: Spread across meals (20-35g per meal) is more effective for muscle synthesis than concentrating in one meal.

### 3.4 Meal Timing Principles

**Pre-workout** (1-2 hours before):
- Moderate carbs + moderate protein + low fat
- Example: banana + Greek yogurt, or oatmeal + eggs

**Post-workout** (within 30-60 minutes):
- Protein (20-30g) + carbs for recovery
- Example: protein shake + fruit, or chicken + rice

**Evening meals:**
- Complete dinner ≥ 2 hours before bed for better sleep
- Late heavy meals impair sleep quality and glucose regulation

### 3.5 Food Quality Assessment

**Prioritize:**
- Whole, minimally processed foods
- Diverse vegetables and fruits (aim for variety of colors)
- Lean proteins from varied sources
- Complex carbohydrates over refined
- Healthy fats (olive oil, nuts, avocado, fatty fish)

**Limit:**
- Ultra-processed foods
- Added sugars (< 25g/day for women, < 36g/day for men)
- Sodium (< 6g salt/day)
- Alcohol

### 3.6 Micronutrient Awareness

Common deficiency risks:
- **Iron**: Especially in menstruating women and vegetarians
- **Vitamin D**: Low sun exposure populations
- **Calcium**: Insufficient dairy intake
- **Magnesium**: Highly active individuals
- **Fiber**: Most people under-consume (target: 25-30g/day)

## Step 4: Cross-Domain Analysis

**Nutrition + Weight:**
- Track energy balance: intake vs expenditure trend
- Protein adequacy protects muscle during weight loss
- Meal consistency matters more than perfection

**Nutrition + Exercise:**
- Inadequate fuel → poor workout performance
- Post-workout nutrition accelerates recovery
- Endurance athletes need more carbs; strength athletes need more protein

**Nutrition + Sleep:**
- Late heavy meals worsen sleep quality
- Caffeine after 2pm disrupts sleep architecture
- Alcohol near bedtime suppresses REM
- Tryptophan-rich foods (turkey, milk, nuts) may support sleep

**Nutrition + Blood Sugar:**
- Food order (veggies → protein → carbs) reduces glucose spikes
- Fiber slows glucose absorption
- Consistent meal timing stabilizes blood sugar

## Step 5: Personalized Communication

### Rule: Inform Without Judgment

**BAD**: "You ate too many calories today — 2,400 kcal is over your target."

**GOOD**: "Today's intake came to about 2,400 kcal — about 300 over your target. Your protein was actually good at 110g, but carbs were a bit high, mostly from the pasta at lunch. One simple swap: halving the pasta portion and adding a side salad would bring you right to target while keeping the meal satisfying."

### Acknowledge Dietary Challenges

- Food tracking is hard — celebrate consistency over perfection
- Social meals, holidays, and celebrations are part of life — don't guilt
- Restrictive language ("you can't eat that") creates unhealthy relationships with food
- Frame as choices and trade-offs, not rules

### Practical Over Perfect

**GOOD**: "You're averaging about 80g protein per day, but your target for muscle building at your weight is about 120g. Here are 3 easy additions: a Greek yogurt at breakfast (+15g), handful of almonds as a snack (+6g), an extra egg at lunch (+6g). That gets you to 107g without changing your main meals."

## Memory & Personalization

**When to search memory:**
- `memory_search("diet")` or `memory_search("nutrition")` — Past dietary discussions and preferences
- `memory_search("food allergy")` or `memory_search("vegetarian")` — Dietary restrictions
- `memory_search("calorie target")` — Previously set nutrition goals

**What to save:**
- `memory_save` — Record: dietary preferences/restrictions, calorie targets, successful meal strategies
- `daily_log` — Note nutrition discussions and advice given

## Red Lines — When to Escalate

| Signal | Action |
|--------|--------|
| Calorie intake consistently < 1000 kcal/day | "Eating below 1000 calories consistently can harm your metabolism and health. Please consult a healthcare provider or registered dietitian for a safe plan." |
| Signs of disordered eating patterns | Use warm, non-judgmental tone: "How you feel about food matters as much as what you eat. If eating feels stressful or out of control, a professional who specializes in eating behavior can help." |
| User wants specific medical diet advice (renal diet, celiac, etc.) | "Medical dietary requirements should be guided by a registered dietitian who can account for your specific condition. I can help with general nutrition principles." |
| Extreme elimination diets | "Cutting out entire food groups long-term can lead to nutritional deficiencies. If you're considering this, a dietitian can help ensure you're meeting all your needs." |
