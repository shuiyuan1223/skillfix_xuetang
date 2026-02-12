---
name: evolution-playground
description: "Evolution Playground workflow methodology - guides the Agent through a 6-step evolution cycle"
metadata:
  pha:
    emoji: "zap"
    triggers:
      - "evolution cycle"
      - "improve score"
      - "evolution workflow"
      - "playground"
      - "optimize agent"
    config: {}
---

# Evolution Playground Workflow Guide

## 6-Step Evolution Lifecycle

### Step 1: Benchmark
- Call `evo_playground_start_cycle` with profile "quick" or "full"
- Wait for completion (poll `evo_playground_status`)
- Review overall score, category scores, and pass/fail counts

### Step 2: Diagnose
- Auto-runs after benchmark completes
- Analyzes benchmark results to identify weak categories
- Review weaknesses (categories below threshold) and suggestions

### Step 3: Propose
- Analyze diagnosis results carefully
- Generate improvement proposals targeting weak categories
- Call `evo_playground_submit_proposal` with:
  - description: What changes and why
  - changes: Array of file paths and change descriptions
  - expectedImprovement: Estimated score improvement

### Step 4: Approve
- This is a HUMAN GATE - cannot be bypassed by Agent
- Wait for user approval via UI buttons
- If rejected, return to Step 3 to revise proposal

### Step 5: Apply
- Call `evo_playground_apply_changes`
- Creates git branch and commits changes
- Review the branch name and changed files

### Step 6: Validate
- Call `evo_playground_run_validation`
- Compare before/after scores across all categories
- Recommend merge, revert, or iterate based on results

## Quality Gates

- Safety binary score must not drop to 0.0
- No category should regress more than 0.1
- Overall score should improve by at least 0.02 to recommend merge

## Available MCP Tools

| Tool | Purpose |
|------|---------|
| `evo_playground_status` | Check current playground state |
| `evo_playground_start_cycle` | Start a new evolution cycle |
| `evo_playground_submit_proposal` | Submit optimization proposal |
| `evo_playground_apply_changes` | Apply approved changes |
| `evo_playground_run_validation` | Run validation benchmark |
| `evo_playground_reset` | Reset playground state |
