# 系统 Agent 工具清单

## Git 工具

| 工具 | 说明 |
|---|---|
| `git_status` | 查看工作区状态 |
| `git_log` | 查看提交历史 |
| `git_show_file` | 查看指定 commit 的文件内容 |
| `git_diff` | 查看差异 |
| `git_branch_list` | 列出分支 |
| `git_branch_create` | 创建分支 |
| `git_branch_delete` | 删除分支 |
| `git_worktree_list` | 列出 worktree |
| `git_commit` | 提交变更 |
| `git_merge` | 合并分支 |
| `git_revert` | 撤销提交 |
| `git_changed_files` | 列出变更文件 |

## 代码编辑

| 工具 | 说明 |
|---|---|
| `claude_code` | 在 git worktree 中调用 Claude Code 执行代码编辑 |

## 文件操作

| 工具 | 说明 |
|---|---|
| `read_file` | 读取文件内容 |
| `grep_search` | 搜索文件内容 |
| `find_files` | 查找文件 |
| `bash_exec` | 执行 bash 命令 |

## 记忆工具

| 工具 | 说明 |
|---|---|
| `sa_memory_read` | 读取系统记忆文件 |
| `sa_memory_write` | 覆写系统记忆文件 |
| `sa_memory_append` | 追加到系统记忆文件 |
| `sa_memory_search` | 搜索系统记忆 |

## 工具反馈

| 工具 | 说明 |
|---|---|
| `suggest_tool_improvement` | 建议工具改进 |
| `list_tool_wishlist` | 查看工具改进建议清单 |

## 技能工具

| 工具 | 说明 |
|---|---|
| `get_skill` | 加载专业技能指南（如 evolution-driver） |
