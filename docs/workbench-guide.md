# 技能调试工作台使用指南

## 概述

技能调试工作台（Skill Debug Workbench）是 PHA 的开发调试工具，提供了一个独立的环境来测试和迭代健康 Skills 和解读 Prompts，无需影响主 Agent。

## 功能特性

- **技能管理**：查看、编辑、启用/禁用健康教练技能
- **提示词管理**：编辑和切换解读提示词
- **测试数据输入**：输入模拟健康数据进行测试
- **实时解读**：运行 LLM 解读并查看流式输出结果
- **一键导出**：导出所有技能和提示词为 ZIP 包

## 访问入口

### 方式一：配置文件开启（推荐）

编辑 `.pha/config.json`，添加 sidebar 配置：

```json
{
  "gateway": {
    "sidebar": {
      "include": ["workbench"]
    }
  }
}
```

重启服务后，侧边栏将只显示"调试工作台"入口。

### 方式二：完整导航

不配置 `sidebar.include` 时，侧边栏显示所有页面，包括调试工作台。

## 界面布局

工作台采用三栏布局：

```
┌─────────────────────────────────────────────────────────────┐
│                     调试工作台                                │
├──────────────┬──────────────────────┬────────────────────────┤
│  测试数据     │   技能 / 提示词       │   运行结果              │
│              │                      │                        │
│  JSON 编辑器  │  [技能] [提示词]      │  [运行解读] 按钮        │
│              │                      │                        │
│  字符计数     │  技能列表 (表格)      │  实时流式输出           │
│  清空按钮     │  - 启用/禁用         │                        │
│              │  - 选择编辑          │  状态栏：               │
│              │                      │  - 运行状态             │
│              │  代码编辑器           │  - 活跃提示词           │
│              │  - 保存/回退         │  - 启用技能数           │
│              │                      │  - 耗时/Token          │
└──────────────┴──────────────────────┴────────────────────────┘
```

## 使用流程

### 1. 准备测试数据

在左侧"测试数据"区域输入 JSON 格式的健康数据：

```json
{
  "user": {
    "age": 30,
    "gender": "male",
    "height": 175,
    "weight": 70
  },
  "sleep": {
    "duration": 420,
    "deep_sleep": 120,
    "light_sleep": 240,
    "rem_sleep": 60,
    "awake_time": 15
  },
  "heart_rate": {
    "resting": 65,
    "max": 180,
    "avg": 75
  }
}
```

**操作提示**：
- 支持多行编辑，自动语法高亮
- 右上角显示字符计数
- 点击"清空"按钮清除所有数据

### 2. 配置技能

切换到"技能"标签页：

#### 查看技能列表

技能列表以表格形式展示：
- **名称**：技能 ID
- **描述**：技能简介
- **状态**：启用/禁用（点击切换）
- **修改状态**：显示是否有未保存的编辑

#### 批量操作

- **全部启用**：一键启用所有技能
- **全部禁用**：一键禁用所有技能
- **展开/折叠**：控制列表高度（折叠态 300px，支持滚动）

#### 编辑技能

1. 点击技能行，选中该技能
2. 下方出现代码编辑器，显示 `SKILL.md` 内容
3. 编辑内容后，"保存"按钮变为可用
4. 点击"保存"提交修改，或点击"回退"放弃修改

**技能文件位置**：`.pha/workbench/skills/{skill-id}/SKILL.md`

### 3. 配置提示词

切换到"提示词"标签页：

#### 查看提示词列表

- **状态列**：显示 `selected`（活跃）或 `view`（仅查看）
- **名称**：提示词 ID
- **修改状态**：显示是否有未保存的编辑

#### 激活提示词

点击状态列的徽章，将该提示词设为活跃（运行时使用）。

#### 编辑提示词

1. 点击提示词行，选中该提示词
2. 下方出现代码编辑器，显示 `.md` 内容
3. 编辑后保存或回退

**提示词文件位置**：`.pha/workbench/prompts/{prompt-id}.md`

### 4. 运行解读

在右侧"运行结果"区域：

1. 点击"运行解读"按钮
2. 系统自动组合：
   - 活跃提示词内容
   - 启用技能的 `<skill_guides>`
   - 测试数据的 `<user_health_data>`
3. 调用 LLM 进行解读
4. 实时流式显示结果

**运行状态**：
- **ready**：就绪
- **running**：运行中（按钮禁用）
- **done**：完成
- **error**：错误（查看状态栏错误信息）

### 5. 查看结果

#### 当前结果

运行完成后，右侧显示完整的解读文本（Markdown 格式）。

#### 复制消息

点击"复制 Messages"按钮，将完整的输入提示词（包含技能、数据）复制到剪贴板，方便在其他工具中测试。

**兼容性**：支持 Windows 非 HTTPS 环境（自动降级到 `document.execCommand`）。

#### 状态栏信息

底部状态栏显示：
- 运行状态徽章
- 活跃提示词名称
- 启用技能数量（如 `3/12 技能`）
- Token 消耗（如果可用）
- 运行耗时（秒）

### 6. 导出技能和提示词

点击右上角"导出 ZIP"按钮：

1. 系统读取所有技能和提示词内容（包括未保存的编辑）
2. 生成 ZIP 文件，目录结构：
   ```
   workbench-export-2026-03-02T10-30-45.zip
   ├── skills/
   │   ├── sleep-coach/
   │   │   └── SKILL.md
   │   ├── heart-monitor/
   │   │   └── SKILL.md
   │   └── ...
   └── prompts/
       ├── health_interpretation.md
       └── ...
   ```
3. 自动触发浏览器下载

**文件命名**：`workbench-export-{timestamp}.zip`

## 技能列表

当前工作台包含 12 个健康教练技能：

| 技能 ID | 描述 |
|---------|------|
| `sleep-coach` | 睡眠教练 - 睡眠质量分析与改善建议 |
| `heart-monitor` | 心率监测 - 心率数据解读与异常提醒 |
| `stress-manager` | 压力管理 - 压力水平评估与缓解方法 |
| `nutrition-advisor` | 营养顾问 - 饮食建议与营养搭配 |
| `hydration-tracker` | 饮水追踪 - 水分摄入监测与提醒 |
| `weight-coach` | 体重管理 - 体重趋势分析与目标设定 |
| `blood-pressure-monitor` | 血压监测 - 血压数据解读与健康建议 |
| `blood-glucose-monitor` | 血糖监测 - 血糖数据解读与饮食建议 |
| `medication-reminder` | 用药提醒 - 用药计划管理与提醒 |
| `running` | 跑步教练 - 配速分析、心率区间、马拉松训练 |
| `cycling` | 骑行教练 - 功率训练、踏频优化、FTP 区间 |
| `swimming` | 游泳教练 - 四种泳姿、SWOLF、配速区间 |

**默认状态**：所有技能初始为禁用状态，需手动启用。

## 提示词列表

当前工作台包含的提示词：

- `health_interpretation` - 健康数据综合解读提示词（默认）

## 常见问题

### Q: 修改技能后需要重启服务吗？

A: 不需要。工作台是独立环境，修改仅影响 `.pha/workbench/` 目录，不影响主系统的 `src/skills/`。

### Q: 如何将调试好的技能应用到主系统？

A: 手动复制 `.pha/workbench/skills/{skill-id}/SKILL.md` 到 `src/skills/{skill-id}/SKILL.md`，然后重启服务。

### Q: 运行解读时提示"No prompt or test data provided"？

A: 确保：
1. 左侧测试数据不为空
2. 或者活跃提示词有内容

### Q: 导出 ZIP 时提示"No skills or prompts to export"？

A: 这是服务端返回数据为空。检查：
1. `.pha/workbench/skills/` 目录是否有技能文件
2. `.pha/workbench/prompts/` 目录是否有提示词文件
3. 刷新页面重新加载数据

### Q: 清空按钮不生效？

A: 已修复。如果仍有问题，刷新页面后重试。

### Q: Windows 系统复制 Messages 失败？

A: 已添加降级方案，支持非 HTTPS 环境。如果仍失败，检查浏览器权限设置。

## 技术细节

### 数据存储

- **技能**：`.pha/workbench/skills/{skill-id}/SKILL.md`
- **提示词**：`.pha/workbench/prompts/{prompt-id}.md`
- **状态**：内存中（`GatewaySession.workbenchState`），不持久化

### 运行机制

1. 组合最终提示词：
   ```
   [系统指令]
   [活跃提示词内容]
   <skill_guides>
     <skill name="skill-id">
       [技能内容]
     </skill>
     ...
   </skill_guides>
   <user_health_data>
     [测试数据]
   </user_health_data>
   ```

2. 创建隔离 Agent（使用 `MockDataSource`，无工具调用）

3. 调用 LLM 进行纯文本生成

4. 通过 SSE 推送流式更新到前端

### 模型配置

工作台使用 `.pha/config.json` 中配置的模型：

```json
{
  "orchestrator": {
    "pha": "openrouter/z-ai/glm-5"
  }
}
```

如果遇到生成中断问题，检查模型配置是否正确。

## 开发者信息

- **入口文件**：`src/gateway/workbench-page.ts`
- **Action 处理**：`src/gateway/workbench-handlers.ts`
- **初始化逻辑**：`src/gateway/workbench-init.ts`
- **前端渲染**：`ui/src/App.tsx` + `ui/src/components/a2ui/AdvancedRenderers.tsx`

## 更新日志

### 2026-03-02

- ✅ 实现三栏布局
- ✅ 技能和提示词编辑功能
- ✅ 实时流式解读输出
- ✅ 复制 Messages 功能（Windows 兼容）
- ✅ 一键导出 ZIP
- ✅ 展开/折叠列表
- ✅ 修复清空/回退按钮（controlled component）
- ✅ 修复 GLM-5 模型配置
- ✅ 修复导出数据解析问题
