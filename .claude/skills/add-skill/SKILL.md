---
name: add-skill
description: Use when adding a new Agent Skill to PHA. Covers SKILL.md format, triggers, MCP tool integration, and Git tracking.
---

# Add New Agent Skill to PHA

## What is a Skill?

Skills are **expert knowledge modules** that guide the Agent's behavior. They are NOT code — they are structured Markdown documents with YAML metadata.

- **MCP Tools** = hands (do things: fetch data, execute operations)
- **Skills** = brain (judge things: interpret data, evaluate quality, guide behavior)

## Checklist

### 1. Create Skill Directory & File

- [ ] Create `src/skills/<skill-name>/SKILL.md`
- [ ] Skill name should be kebab-case (e.g. `sleep-coach`, `heart-monitor`)

### 2. Write SKILL.md

Follow the OpenClaw format:

```yaml
---
name: skill-name
description: "一句话描述这个 Skill 做什么"
metadata:
  pha:
    emoji: "icon-name"     # Icon name (NOT emoji), e.g. "heart", "brain"
    triggers:              # Keywords that auto-activate this skill
      - "关键词1"
      - "关键词2"
    config: {}             # Optional config (usually empty)
---

# Skill Title

## 角色定位
描述 Agent 在使用此 Skill 时扮演的角色。

## 评估框架 / 行为指导
Skill 的核心内容：评分标准、解读规则、建议模板等。

## 与 MCP 工具的配合
说明需要调用哪些 MCP 工具获取数据，以及如何解读数据。
```

### 3. Design Triggers

Triggers are keywords in user messages that auto-inject this Skill's guide into the Agent's context.

```yaml
triggers:
  - "睡眠"        # Matches messages containing "睡眠"
  - "sleep"       # English variant
  - "失眠"        # Related terms
```

**Design principles:**
- Use 3-8 specific keywords, avoid overly broad terms
- Include both Chinese and English variants
- Avoid overlap with other Skills' triggers
- Triggers are substring matches, not exact matches

### 4. Integrate with MCP Tools (if needed)

If the Skill needs data from MCP tools, describe the integration in the Skill body:

```markdown
## 数据获取

使用以下 MCP 工具获取所需数据：
- `get_sleep`: 获取睡眠数据（入睡时间、深睡比例等）
- `get_heart_rate`: 获取心率数据用于睡眠质量评估

## 解读规则

根据获取的数据，按以下标准评估：
- 深睡比例 > 20%: 良好
- 深睡比例 15-20%: 一般
- 深睡比例 < 15%: 需改善
```

### 5. Verify

```bash
bun run check   # Ensure no TypeScript errors
bun run build   # Build succeeds
```

After deployment, test by sending a message containing one of the trigger keywords and verify the Agent uses the Skill's guidance.

## File Structure

```
src/skills/
├── sleep-coach/
│   └── SKILL.md           # 睡眠教练
├── evolution-driver/
│   └── SKILL.md           # 进化方法论
├── benchmark-evaluator/
│   └── SKILL.md           # 评测框架
└── your-new-skill/
    └── SKILL.md           # 新 Skill
```

## Git Tracking

- Skills are stored in the Git-tracked `src/skills/` directory
- When edited via Settings > Skills UI, changes are auto-committed with `gitCommitFiles()`
- Commit message format: `feat(skill): update <skill-name>`

## When to Use a Skill vs MCP Tool

| Need | Solution |
|------|----------|
| Fetch data from API | MCP Tool (`src/tools/`) |
| Read/write database | MCP Tool |
| Expert judgment / scoring rubric | **Skill** |
| Behavior guidance / response template | **Skill** |
| Both data + interpretation | MCP Tool provides data, **Skill** provides interpretation |

## UI Management

Skills can be managed through the web UI:
- **Settings > Skills** — View, edit, enable/disable skills
- The UI reads from `src/skills/*/SKILL.md` and provides a code editor
- Saving in the UI writes the file and creates a Git commit
