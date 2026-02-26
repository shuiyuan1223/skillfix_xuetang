# 侧边栏导航配置

在 `.pha/config.json` 的 `gateway.sidebar` 中配置显示哪些 Tab。

## Tab ID 对照表

| ID | 说明 |
|----|------|
| `chat` | 聊天 |
| `dashboard` | 健康仪表盘 |
| `plans` | 健康计划 |
| `experiment` | 实验面板 |
| `memory` | 记忆管理 |
| `legacy-chat` | 边想边搜 |
| `evolution` | 进化实验室 |
| `system-agent` | 系统 Agent |
| `settings/prompts` | 提示词管理 |
| `settings/skills` | 技能管理 |
| `settings/tools` | 工具列表 |
| `settings/integrations` | 集成配置 |
| `settings/logs` | 系统日志 |
| `settings/general` | 通用设置 |

## 配置示例

```jsonc
{
  "gateway": {
    "port": 8000,
    "sidebar": {
      // 白名单：只显示这些 Tab（设置后 exclude 无效）
      "include": ["chat", "dashboard", "plans", "settings/general"],
      // 黑名单：隐藏这些 Tab
      "exclude": ["evolution", "system-agent"]
    }
  }
}
```
