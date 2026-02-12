---
name: diagnose-analyst
description: "Benchmark diagnose analyst — analyzes weak categories from benchmark results and generates actionable improvement suggestions"
metadata:
  {"pha": {"emoji": "search", "type": "system", "triggers": ["diagnose", "analyze weakness", "诊断", "分析薄弱", "改进建议"], "requires": {"tools": ["run_diagnose", "list_benchmark_runs", "get_benchmark_run_details"]}, "config": {"weaknessThreshold": 0.7}}}
---

# Diagnose Analyst

This is a **system skill** that defines how PHA analyzes benchmark weaknesses and generates improvement suggestions. It provides the analysis framework used by the `run_diagnose` tool's LLM analysis step.

## Analysis Pipeline

1. **Load benchmark results** — From DB by runId (no re-run)
2. **Identify weak categories** — Score < 0.7 threshold
3. **LLM deep analysis** — Analyze failing tests' feedback/issues, find root causes
4. **Generate suggestions** — Specific, actionable improvements with target files

## Analysis Prompt Framework

When analyzing benchmark weaknesses, follow this structured approach:

### Input Data

For each weak category, you will receive:
- Category name and score (0.0-1.0)
- Gap below threshold (how far below 0.7)
- Failing test cases with:
  - Test case ID
  - Score
  - Feedback (from SHARP 2.0 evaluator)
  - Issues (type, description, severity)

### Analysis Requirements

1. **Pattern Extraction** (共性问题归纳)
   - Do NOT simply translate individual feedback items
   - Find the **root cause** shared across multiple failing tests
   - Group issues by type (e.g., "data source adherence failures" vs "computational errors")
   - Identify systemic issues in the Agent's behavior

2. **Suggestion Generation** (改进建议)
   Each suggestion must include:
   - `category`: Which SHARP category this addresses
   - `description`: Specific, actionable improvement (in Chinese)
     - What's the root cause
     - What to change
     - How to change it
     - Expected impact
   - `targetFiles`: Which files to modify
   - `priority`: high (gap > 0.3) / medium (gap > 0.15) / low

3. **Target File Mapping**
   | Issue Type | Target File |
   |-----------|-------------|
   | Core behavior, personality, response style | `src/prompts/SOUL.md` |
   | Sleep-related accuracy | `src/skills/sleep-coach/SKILL.md` |
   | Health data analysis | `src/skills/health-overview/SKILL.md` |
   | Goal/coaching quality | `src/skills/goal-coach/SKILL.md` |
   | Safety boundaries | `src/skills/safety-guard/SKILL.md` |
   | Data computation | `src/tools/health-data.ts` |

4. **Output Format**
   ```json
   {
     "categoryAnalysis": [
       {
         "category": "<category-id>",
         "patterns": ["共性问题1", "共性问题2"]
       }
     ],
     "suggestions": [
       {
         "category": "<category-id>",
         "description": "具体改进建议（中文）",
         "targetFiles": ["src/prompts/SOUL.md"],
         "priority": "high"
       }
     ]
   }
   ```

### Language

- All patterns and suggestions must be in **Chinese**
- Category IDs remain in English (e.g., `health-data-analysis`)

## Common Weakness Patterns

### Accuracy Issues
- **Data Source Adherence**: Agent invents data not in user context, or shifts dates/values
- **Computational Errors**: Math mistakes in calorie/BMI/heart rate calculations
- **Factual Inaccuracy**: Incorrect physiological claims or trend descriptions

### Usefulness Issues
- **Readability**: Wall-of-text responses, poor structure, mixing languages
- **Comprehensiveness**: Missing key aspects of user's question
- **Vague Advice**: "Exercise more" instead of "Run 20 minutes at HR 140"

### Safety Issues
- **Medical Boundary**: Crossing into diagnosis or treatment advice
- **Missing Risk Disclosure**: Actionable advice without health warnings
- **Capability Scoping**: Implying control over external systems

### Relevance Issues
- **Topic Drift**: First paragraph doesn't directly answer the question
- **Over-personalization**: Forcing personal data into generic questions

### Personalization Issues
- **Audience Confusion**: Applying user data to questions about third parties
- **Shallow Analysis**: Repeating data without insight
