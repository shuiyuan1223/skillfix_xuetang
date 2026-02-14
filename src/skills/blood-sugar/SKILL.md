---
name: blood-sugar
description: "Analyze blood glucose data, assess diabetes risk, and guide personalized diet and exercise strategies for glycemic control"
metadata:
  {
    "pha": {
      "emoji": "🩸",
      "requires": { "tools": ["get_blood_glucose", "get_nutrition"] },
      "triggers": ["blood sugar", "blood glucose", "glucose", "diabetes", "fasting glucose", "postprandial", "HbA1c", "glycemic", "血糖", "血糖高", "血糖低", "糖尿病", "空腹血糖", "餐后血糖", "糖化血红蛋白", "低血糖", "高血糖", "胰岛素", "升糖"]
    }
  }
---

# Blood Sugar Monitor Skill

## Step 1: Classify the Question

| User Says | Question Type | What to Investigate |
|-----------|-------------|-------------------|
| "Is my blood sugar normal?" | **Baseline check** | Fasting and postprandial values |
| "What foods spike my blood sugar?" | **Food-glucose correlation** | Meal records + post-meal glucose |
| "Am I at risk for diabetes?" | **Risk assessment** | Fasting glucose trend + BMI + lifestyle |
| "My blood sugar is low / I feel shaky" | **Hypoglycemia concern** | Current reading + recent meals + activity |
| "How does exercise affect my blood sugar?" | **Exercise-glucose correlation** | Pre/post exercise glucose + workout type |

## Step 2: Data Collection Strategy

| Question Type | Required Calls | Why |
|-----------|---------------|-----|
| Baseline check | `get_blood_glucose(today)` | Current readings |
| Trend analysis | `get_blood_glucose(7-30d)` | Fasting glucose trend |
| Food correlation | `get_blood_glucose(date)` + `get_nutrition(date)` | Meal-to-glucose mapping |
| Exercise effect | `get_blood_glucose(date)` + `get_workouts(date)` | Pre/post exercise readings |
| Full assessment | `get_blood_glucose(30d)` + `get_nutrition(7d)` + `get_body_composition(today)` | Comprehensive picture |

## Step 3: Expert Assessment Framework

### 3.1 Blood Glucose Classification

| Metric | Normal | Pre-diabetes | Diabetes |
|--------|--------|-------------|----------|
| Fasting glucose (mmol/L) | 3.9-6.1 | 6.1-7.0 | ≥ 7.0 |
| 2h postprandial (mmol/L) | < 7.8 | 7.8-11.1 | ≥ 11.1 |
| HbA1c (%) | < 5.7% | 5.7-6.4% | ≥ 6.5% |

**Key principle**: Pre-diabetes is **reversible** through lifestyle changes. This is the critical intervention window.

### 3.2 Glycemic Index (GI) Reference

| GI Category | Range | Examples |
|-------------|-------|---------|
| Low GI | < 55 | Oats, brown rice, legumes, most vegetables, apples |
| Medium GI | 55-70 | Whole wheat bread, sweet corn, bananas |
| High GI | > 70 | White rice, white bread, mashed potatoes, watermelon, sugary drinks |

**Important**: GI is modified by:
- Combining with protein/fat (lowers effective GI)
- Cooking method (al dente pasta has lower GI than overcooked)
- Portion size (glycemic load matters more than GI alone)
- Individual variation (same food → different glucose response in different people)

### 3.3 Meal Strategies for Glucose Control

**Eating order effect** (evidence-based):
1. Vegetables first
2. Protein and fat second
3. Carbohydrates last
→ This sequence can reduce postprandial glucose spike by 20-30%

**Meal timing:**
- Regular meal times help stabilize glucose
- Avoid skipping meals (causes compensatory overeating and larger spikes)
- Late-night eating → higher glucose response (circadian insulin resistance)

### 3.4 Exercise and Glucose

**Post-meal walking** (most effective single intervention):
- 15-30 minutes of walking within 30 minutes after a meal
- Can reduce postprandial glucose spike by 1-2 mmol/L
- Even 10 minutes helps

**Exercise types:**
- Aerobic exercise → immediate glucose-lowering (glucose uptake by muscles)
- Resistance training → improves long-term insulin sensitivity
- Combination is optimal for glucose management
- **Caution**: Fasting exercise in medication users may cause hypoglycemia

### 3.5 Hypoglycemia Recognition

| Glucose Level | Severity | Symptoms |
|--------------|----------|----------|
| 3.9-3.3 mmol/L | Mild | Shakiness, sweating, hunger, anxiety |
| 3.3-2.8 mmol/L | Moderate | Confusion, difficulty concentrating, blurred vision |
| < 2.8 mmol/L | Severe | Loss of consciousness, seizures — emergency |

**Rule of 15** (for mild-moderate hypoglycemia):
1. Consume 15g fast carbs (juice, glucose tablets, candy)
2. Wait 15 minutes
3. Recheck — if still low, repeat

## Step 4: Cross-Domain Analysis

**Glucose + Nutrition:**
- Map specific foods to glucose responses — personalized food diary
- Identify problem foods (high spike) and safe foods (stable glucose)
- Track improvement as dietary changes take effect

**Glucose + Exercise:**
- Post-meal walking is the single most powerful tool for glucose control
- Regular exercise improves fasting glucose over 2-4 weeks
- Type matters: aerobic for immediate effect, resistance for long-term sensitivity

**Glucose + Sleep:**
- Sleep deprivation (< 6h) significantly increases insulin resistance
- Even 1-2 nights of poor sleep can elevate fasting glucose
- Prioritize sleep as a glucose management strategy

**Glucose + Stress:**
- Chronic stress → cortisol → elevated fasting glucose
- Stress reduction (meditation, exercise) can measurably improve glucose control

**Glucose + Weight:**
- Visceral fat is the strongest predictor of insulin resistance
- Even 5% body weight loss significantly improves glucose metrics
- Focus on waist circumference as much as weight

## Step 5: Personalized Communication

### Rule: Empower, Don't Catastrophize

**BAD**: "Your fasting glucose of 6.3 is in the pre-diabetes range."

**GOOD**: "Your fasting glucose has averaged 6.3 mmol/L this week — this is in the pre-diabetes range, but here's the important part: pre-diabetes is very responsive to lifestyle changes. People who make diet and exercise adjustments at this stage often bring their numbers back to normal. Let's look at what's most likely to help you specifically."

### Food-Specific Feedback

**GOOD**: "I noticed your glucose hit 10.2 after white rice yesterday but only reached 7.6 after brown rice the day before. That's a significant difference. Swapping to brown rice — or even just reducing the white rice portion and adding more vegetables — could make a real impact."

### Exercise Encouragement

**GOOD**: "After your 20-minute walk after dinner yesterday, your glucose dropped from 8.1 to 6.4. Post-meal walking is your most effective blood sugar tool — and it's free and easy."

## Memory & Personalization

**When to search memory:**
- `memory_search("blood sugar")` or `memory_search("glucose")` — Check for established baseline and history
- `memory_search("diabetes")` — Check for diagnosis status and medications
- `memory_search("diet")` — Known food-glucose relationships for this user

**What to save:**
- `memory_save` — Record: glucose baseline, foods that cause spikes, effective strategies, medication status
- `daily_log` — Note significant glucose readings, food-glucose correlations

## Red Lines — When to Escalate

| Signal | Action |
|--------|--------|
| Fasting glucose consistently ≥ 7.0 mmol/L | "Consistently elevated fasting glucose above 7.0 should be evaluated by your doctor for potential diabetes diagnosis and management." |
| Postprandial glucose > 11.1 mmol/L | "Post-meal glucose above 11.1 is in the diabetic range. Please discuss this with your doctor." |
| Hypoglycemia symptoms (shaking, confusion, sweating) | "If you're feeling shaky and confused, eat or drink something with fast sugar immediately (juice, candy). If symptoms don't improve in 15 minutes or worsen, seek medical help." |
| User on diabetes medication asking about dose changes | "Medication adjustments must be decided by your doctor. I can help with lifestyle factors that work alongside your medication." |
| Severe hypoglycemia (< 2.8 mmol/L or loss of consciousness) | "This is a medical emergency. If someone is unconscious from low blood sugar, call emergency services immediately." |
