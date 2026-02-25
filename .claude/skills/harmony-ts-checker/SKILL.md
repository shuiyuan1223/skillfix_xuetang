---
name: harmony-ts-checker
description: Use when reviewing HarmonyOS TypeScript/JavaScript code for security, style, and compliance issues. Covers file/directory, code snippet, git commit, git diff, and full-repo scan modes. Combines checker.py static analysis + ESLint for Harmony environment restrictions, naming conventions, formatting, type safety, and security audits (hardcoded secrets, console禁用, SQL injection, etc.).
---

# HarmonyOS TS/JS 代码安全检查 Skill

## 角色定位

你是 HarmonyOS TypeScript/JavaScript 代码安全检查专家，基于《华为鸿蒙 TypeScript/JavaScript 编程规范》对代码进行全面静态分析。

规范来源包括：
- 华为 JavaScript & TypeScript 语言编程规范 V3.0
- OpenHarmony JS 通用编程规范
- ESLint / TSC 配置 / Google JS & TS Style Guide 等业界最佳实践

规则分为两级：**要求**（强制）和 **建议**（最佳实践）。检查时对"要求"级别的违规标记为 🔴 ERROR，对"建议"级别标记为 🟡 WARN。

## 检查流程

### 第一步：确定检查范围

根据用户输入，确定待检查的 TS/JS 文件列表：

| 输入场景 | 操作 |
|---------|------|
| 文件/目录路径 | 直接使用该路径 |
| 代码片段 | 写入临时文件 `/tmp/harmony-check.ts`（检查完成后删除） |
| 某次 git 提交 | `git show <hash> --name-only --diff-filter=ACMR \| grep -E '\.(ts\|js\|ets\|tsx\|jsx)$'` |
| 两次提交之间的 diff | `git diff <hash1> <hash2> --name-only --diff-filter=ACMR \| grep -E '\.(ts\|js\|ets\|tsx\|jsx)$'` |
| 全仓库扫描 | 使用项目根目录，checker.py 会递归扫描 |

> git 场景下，`--diff-filter=ACMR` 只取新增/修改/重命名的文件，跳过已删除文件。

### 第二步：运行 checker.py

```bash
python3 .claude/skills/harmony-ts-checker/checker.py <file_or_dir> --severity all
```

支持的参数：
- `<path>`：文件或目录（git 场景下传入空格分隔的多个文件路径）
- `--severity error|warn|all`：过滤问题级别（默认 all）
- `--json`：JSON 格式输出（便于后续处理）

### 第三步：运行 ESLint（如已配置）

先检查项目是否存在 ESLint 配置：
```bash
ls .eslintrc.json .eslintrc.js .eslintrc.cjs eslint.config.js eslint.config.mjs 2>/dev/null | head -1
```

**若存在配置**，对目标文件运行 ESLint：
```bash
npx eslint --format compact <file1> <file2> ...
```

**若不存在配置**，在报告末尾提示：
> 项目未配置 ESLint，可根据本 Skill 规则速查表配置 `.eslintrc.json` 以实现自动化检测。

### 第四步：人工补充分析

checker.py 无法覆盖以下需要语义理解的规则，需人工判断：

| 规则 | 原因 |
|------|------|
| G.TYP.03 浮点数比较 | 需理解上下文是否为精确比较 |
| G.MET.07 一致 return | 需追踪所有控制流路径 |
| Ext-12.1 null/undefined 类型标注 | 需 TypeScript 类型推断 |
| Ext-12.3/12.4 类型导入导出一致性 | 需区分值与类型 |
| SEC.01 密钥强度判断 | 需判断字符串是否为真实密钥 |
| SEC.07 代码重复语义相似度 | 仅检测文本完全重复，语义相似需人工 |
| SEC.11 SQL 注入完整性 | 复杂拼接逻辑需人工确认 |
| EXT.13.6 ES Module 循环依赖 | 需整体项目依赖图分析，建议用 `madge` 或 `import/no-cycle` |
| EXT.13.7 优先函数声明 | checker 不检测此项，属风格建议 |

### 第五步：输出最终报告

整合三个来源的结果，每条问题标注来源标签：

```
[🔴 ERROR | 🟡 WARN] 规则编号 - 规则名称  [checker|ESLint|人工]
  📍 位置: 文件名:行号
  📝 描述: 具体违规说明
  ✅ 修复建议: 如何修改
```

相同位置的重复问题合并，避免 checker 和 ESLint 双重上报。

## 报告输出格式

每条问题标注来源（`[checker]` / `[ESLint]` / `[人工]`），相同位置重复问题合并：

```
[🔴 ERROR | 🟡 WARN] 规则编号 - 规则名称  [checker|ESLint|人工]
  📍 位置: 文件名:行号
  📝 描述: 具体违规说明
  ✅ 修复建议: 如何修改
```

报告末尾输出汇总：
```
═══ 检查汇总 ═══
📁 检查文件: N 个（含 git 变更/全部扫描）
✅ 通过规则: N 条
🔴 ERROR: N 条（要求级别违规）
🟡 WARN:  N 条（建议级别违规）
📊 合规率: XX%
```

## 规则分类速查

### 一、鸿蒙环境限制（全部为 🔴 要求）
| 规则ID | 规则 | 检查要点 |
|--------|------|----------|
| Ext-2.1 | 严格模式 | 检查是否有 `'use strict'` 或 ES Module |
| G.AOD.01 | 禁止 eval() | 搜索 `eval(` 调用 |
| G.SCO.02 | 禁止 with(){} | 搜索 `with (` 语句 |
| G.MET.08 | 禁止动态创建函数 | 搜索 `new Function(` |

### 二、命名规范（🟡 建议）
| 规则ID | 规则 | 检查要点 |
|--------|------|----------|
| G.NAM.01 | 类/枚举/命名空间用 UpperCamelCase | 正则检查 class/enum/namespace 名称 |
| G.NAM.02/03 | 变量/方法/参数用 lowerCamelCase | 正则检查标识符 |
| G.NAM.06 | 常量/枚举值用 UPPER_SNAKE_CASE | 正则检查 const 声明 |
| G.NAM.04 | 布尔变量加 is/has/can/should 前缀 | 检查 boolean 类型变量名 |

### 三、格式规范（🟡 建议，4.6 为 🔴 要求）
| 规则ID | 规则 |
|--------|------|
| G.FMT.01 | 空格缩进，禁止 tab |
| G.FMT.02 / OH 2.1 | 行宽 ≤ 120 字符 |
| OH 2.4 | if/for/do/while 必须用大括号 |
| OH 2.6 | switch 的 case/default 缩进一层 |
| G.FMT.03 / OH 2.7 | 换行时运算符放行末 |
| G.VAR.03 | 🔴 多变量声明不写同一行 |
| G.FMT.09 | 空格使用规范 |
| G.FMT.12 | 语句以分号结尾 |
| G.TYP.04 | 字符串使用单引号 |

### 四、声明与初始化（🔴 要求）
| 规则ID | 规则 |
|--------|------|
| G.VAR.01 | 使用 const/let，禁止 var |

### 五、数据类型（🔴 要求）
| 规则ID | 规则 |
|--------|------|
| G.TYP.01 | 浮点数小数点前后不省略 0 |
| G.TYP.02 | 用 isNaN() 判断 NaN |
| G.TYP.03 | 浮点数不用 ==/=== 比较 |
| G.TYP.07 | 数组不定义非数字属性 |
| G.TYP.08 | 数组遍历优先用 Array 方法 |

### 六、运算与表达式（🔴 要求）
| 规则ID | 规则 |
|--------|------|
| G.EXP.02 | 使用 ===/!== 代替 ==/!= |
| G.CTL.06 | 条件表达式中不赋值 |

### 七、函数（🔴 要求）
| 规则ID | 规则 |
|--------|------|
| G.MET.07 | 一致的 return 语句 |
| G.MET.10 | 用 rest 语法代替 arguments |
| Ext-8.3 | 禁止 this 赋值给变量 |

### 八、类与对象（🔴 要求）
| 规则ID | 规则 |
|--------|------|
| G.OBJ.04 | 点号访问属性，计算属性才用 [] |
| G.OBJ.07 | 不修改内置对象原型 |
| Ext-9.3 | 禁止 delete 可计算属性 |

### 九、异常（🔴 要求）
| 规则ID | 规则 |
|--------|------|
| G.ERR.03 | finally 中不用 return/break/continue/throw |

### 十、异步（🔴 要求）
| 规则ID | 规则 |
|--------|------|
| G.ASY.01 | 禁用不必要的 return await |
| Ext-11.2 | 不 await 非 Thenable 值 |

### 十一、TypeScript 类型安全（🔴 要求）
| 规则ID | 规则 | ESLint 规则 |
|--------|------|------------|
| Ext-12.1 | null/undefined 独立类型标注 | strictNullChecks |
| G.FUN.01-TS | 显式声明函数返回值类型 | @typescript-eslint/explicit-function-return-type |
| Ext-12.3 | 类型导出一致性 | @typescript-eslint/consistent-type-exports |
| Ext-12.4 | 类型导入一致性 | @typescript-eslint/consistent-type-imports |
| Ext-12.5~12.11 | 禁止 any 系列 | @typescript-eslint/no-explicit-any 等 |

### 十二、安全审计（全部为 🔴 要求）

源自华为内部代码安全审计常见问题，由 Python 审计规则适配至 TS/JS 环境。

| 规则ID | 规则 | 检查要点 |
|--------|------|----------|
| SEC.01 | 禁止明文硬编码密钥/凭据 | 代码中不得出现 password、secret、token、apiKey 等明文字符串赋值，也不得在 `.env` 文件中存储密钥；应通过运行时安全存储或 KMS 获取 |
| SEC.02 | 禁止 console 直接输出，日志统一管理 | 禁止 `console.log/warn/error/info/debug`；所有日志必须通过统一的 Logger 模块输出，便于级别控制与脱敏 |
| SEC.03 | 禁止残留测试/调试代码 | 提交代码中不得包含 `describe()`、`it()`、`test()`、`debugger`、`.only`、`.skip`、`TODO:REMOVE` 等测试与调试残留 |
| SEC.04 | 禁止硬编码 URL/UID/ID/Cookie | 链接地址、用户ID、设备ID、Cookie 值等不得以字面量写在代码中；应从配置中心或环境变量读取 |
| SEC.05 | 文件操作必须显式设置权限 | `fs.open`/`fs.writeFile`/`fs.mkdir` 等必须传入 `mode` 参数；鸿蒙侧 `fileio.openSync` 同理 |
| SEC.06 | 日志级别必须统一为枚举常量 | 不得使用裸字符串 `'info'`/`'debug'` 表示日志级别；应定义 `LogLevel` 枚举并统一引用 |
| SEC.07 | 禁止大段代码重复 | 相似度极高的连续代码块（≥6行）应抽取为公共函数或工具方法 |
| SEC.08 | 公网地址必须外置到配置 | 任何 `http://`/`https://` 地址（含 HTML 模板中的 CDN、API 地址）都必须提取到配置文件，代码中通过变量引用 |
| SEC.09 | 使用安全随机数 | 涉及安全场景（token 生成、验证码、加密盐）禁止 `Math.random()`；应使用 `crypto.randomBytes` / `crypto.randomUUID` / `crypto.getRandomValues` |
| SEC.10 | mkdir 必须设置权限 | `fs.mkdirSync`/`fs.mkdir`/鸿蒙 `fileio.mkdirSync` 必须显式传入 `mode`（如 `0o750`），不得使用默认权限 |
| SEC.11 | 禁止字符串拼接 SQL | 禁止通过模板字符串或 `+` 拼接 SQL 语句；必须使用参数化查询 / Prepared Statement / ORM |

### 十三、Google/ESLint 补充规则（🔴 要求 / 🟡 建议）

源自 Google JS/TS Style Guide 及 OpenHarmony JS 通用编程规范中尚未被前述章节覆盖的重要规则。

| 规则ID | 级别 | 规则 | 检查要点 |
|--------|------|------|----------|
| EXT.13.1 | 🔴 | 禁止使用 default export | 所有导出必须使用命名导出，`export default` 会导致跨模块命名不一致 |
| EXT.13.2 | 🔴 | 禁止使用 Array 构造函数 | `new Array()` 行为不一致，应使用 `[]` 字面量或 `Array.from()` |
| EXT.13.3 | 🔴 | 只抛出 Error 对象 | `throw` 和 `Promise.reject()` 必须传入 `Error` 或其子类实例 |
| EXT.13.4 | 🔴 | 禁止 export let（可变导出） | 导出变量禁止使用 `export let`，应使用 `export const` 或导出 getter 函数 |
| EXT.13.5 | 🟡 | for-in 必须过滤原型属性 | `for...in` 循环体内必须用 `hasOwnProperty` 过滤，推荐用 `Object.keys/values/entries` 替代 |
| EXT.13.6 | 🟡 | 禁止 ES Module 循环依赖 | 模块间不得存在 `import` 循环引用（需 `madge` / `import/no-cycle` 检测） |
| EXT.13.7 | 🟡 | 优先使用函数声明 | 命名函数优先用 `function foo()` 声明，而非 `const foo = () =>` |
| EXT.13.8 | 🔴 | 禁止使用 namespace 关键字 | 使用 ES Module 组织代码，不使用 `namespace Foo {}` |
| EXT.13.9 | 🟡 | Number() 解析须检查 NaN | `Number(str)` 后必须检查 `isNaN`/`isFinite`；`parseInt` 必须指定基数 |
| EXT.13.10 | 🟡 | 不使用 unary + 做类型转换 | 禁止 `+str` 转数字，应使用 `Number(str)` |
| EXT.13.11 | 🔴 | 禁止基本类型包装器 | 禁止 `new Boolean()`/`new String()`/`new Number()` |
| EXT.13.12 | 🔴 | 不直接调用 Object.prototype 方法 | 禁止 `foo.hasOwnProperty('bar')`，应使用 `Object.prototype.hasOwnProperty.call()` 或 `Object.hasOwn()` |
| EXT.13.13 | 🔴 | 用 Object.getPrototypeOf 替代 \_\_proto\_\_ | 禁止访问 `__proto__` 属性 |
| EXT.13.14 | 🟡 | 优先使用模板字符串 | 字符串 `+` 拼接应使用模板字面量替代 |
| EXT.13.15 | 🔴 | 禁止在块内声明函数 | `if`/`for`/`while` 等块内不得用 `function` 声明函数，应使用函数表达式 |

## 使用说明

根据用户输入模式执行对应流程：

1. **文件/目录** — 直接进入第二步运行 checker.py
2. **代码片段** — 先写入 `/tmp/harmony-check.ts`，检查后删除
3. **`git show <hash>`** — 第一步获取该提交的变更文件列表，再依次检查
4. **`git diff <h1> <h2>`** — 第一步获取两次提交之间的变更文件，再依次检查
5. **全仓库** — 传入项目根目录，checker.py 递归扫描所有 TS/JS 文件

无论哪种模式：
- JS 文件跳过「十一、TypeScript 类型安全」章节
- 发现的问题按严重级别排序（🔴 优先于 🟡）
- 给出具体修复建议和代码示例
- 如果用户要求自动修复，生成修复后的完整文件
