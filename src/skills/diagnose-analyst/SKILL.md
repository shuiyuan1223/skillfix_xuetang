---
name: diagnose-analyst
description: "基准测试诊断分析师 — 分析基准测试结果中的薄弱大类，生成可操作的改进建议"
metadata:
  {"pha": {"emoji": "search", "category": "evolution", "tags": ["sa", "diagnosis", "benchmark", "analysis"], "type": "system", "requires": {"tools": ["run_diagnose", "list_benchmark_runs", "get_benchmark_run_details"]}, "config": {"weaknessThreshold": 0.7}}}
---

# 诊断分析师

这是一个**系统技能**，定义了 PHA 如何分析基准测试的薄弱环节并生成改进建议。它提供了 `run_diagnose` 工具中 LLM 分析步骤所使用的分析框架。

## 分析流水线

1. **加载基准测试结果** — 从数据库按 runId 读取（无需重跑）
2. **识别薄弱大类** — 评分低于 0.7 阈值
3. **LLM 深度分析** — 分析失败测试用例的反馈/问题，找到根因
4. **生成建议** — 具体、可操作的改进措施，附带目标文件

## 分析提示词框架

分析基准测试薄弱环节时，遵循以下结构化方法：

### 输入数据

对于每个薄弱大类，你将收到：
- 大类名称和评分（0.0-1.0）
- 与阈值的差距（低于 0.7 多少）
- 失败的测试用例，包括：
  - 测试用例 ID
  - 评分
  - 反馈（来自 SHARP 2.0 评估器）
  - 问题（类型、描述、严重程度）

### 分析要求

1. **共性问题归纳**
   - 不要简单翻译各条反馈
   - 找出多个失败测试共同的**根因**
   - 按类型归组问题（如 "数据源一致性失败" vs "计算错误"）
   - 识别 Agent 行为中的系统性问题

2. **改进建议生成**
   每条建议必须包含：
   - `category`：针对哪个 SHARP 大类
   - `description`：具体、可操作的改进措施（中文）
     - 根因是什么
     - 改什么
     - 怎么改
     - 预期效果
   - `targetFiles`：需要修改哪些文件
   - `priority`：high（差距 > 0.3）/ medium（差距 > 0.15）/ low

3. **目标文件映射**
   | 问题类型 | 目标文件 |
   |---------|---------|
   | 核心行为、人设、回复风格 | `src/prompts/SOUL.md` |
   | 睡眠相关准确性 | `src/skills/sleep-coach/SKILL.md` |
   | 健康数据分析 | `src/skills/health-overview/SKILL.md` |
   | 目标/教练质量 | `src/skills/goal-coach/SKILL.md` |
   | 安全边界 | `src/skills/safety-guard/SKILL.md` |
   | 数据计算 | `src/tools/health-data.ts` |

4. **输出格式**
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

### 语言要求

- 所有共性问题和建议必须使用**中文**
- Category ID 保持英文（如 `health-data-analysis`）

## 常见薄弱模式

### 准确性问题
- **数据源一致性**：Agent 编造用户上下文中不存在的数据，或偏移日期/数值
- **计算错误**：卡路里/BMI/心率计算中的数学错误
- **事实错误**：不正确的生理学论断或趋势描述

### 有用性问题
- **可读性**：大段文字堆砌、结构差、中英混杂
- **全面性**：遗漏了用户问题的关键方面
- **建议模糊**："多运动"而非"以心率 140 跑步 20 分钟"

### 安全性问题
- **医疗边界**：越界到疾病诊断或治疗建议
- **缺少风险披露**：可操作的建议缺少健康警告
- **能力边界**：暗示拥有对外部系统的控制权

### 相关性问题
- **话题偏移**：第一段没有直接回答问题
- **过度个性化**：对通用性问题强行使用个人数据

### 个性化问题
- **受众混淆**：将用户数据应用于关于第三方的问题
- **分析浅薄**：重复数据但缺乏洞察
