---
name: harmony-ts-checker
description: "HarmonyOS TypeScript/JavaScript 代码安全与规范检查工具。覆盖鸿蒙环境限制、命名风格、格式规范、类型安全及安全审计（密钥明文、console禁用、SQL注入等）全部规则。"
metadata:
  pha:
    emoji: "shield"
    triggers:
      - "代码安全检查"
      - "安全审计"
      - "代码规范检查"
      - "code review"
      - "鸿蒙代码"
      - "HarmonyOS"
      - "OpenHarmony"
      - "代码审查"
      - "lint"
      - "TS代码检查"
      - "JS代码检查"
    config: {}
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

1. **读取代码**：从用户提供的文件或代码片段获取待检查内容
2. **加载规则集**：参考 `references/rules.md` 中的完整规则列表
3. **逐条扫描**：按规则分类逐一检查代码
4. **生成报告**：输出结构化的检查报告

## 报告输出格式

对每个发现的问题，输出以下信息：

```
[🔴 ERROR | 🟡 WARN] 规则编号 - 规则名称
  📍 位置: 文件名:行号
  📝 描述: 具体违规说明
  ✅ 修复建议: 如何修改
```

报告末尾输出汇总：
```
═══ 检查汇总 ═══
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

## 检查细节

对于完整的规则描述、正反例代码，请参阅 `references/rules.md`。

## 使用说明

当收到用户的代码后：
1. 首先判断代码是 TypeScript 还是 JavaScript
2. 如果是 JS，跳过 TypeScript 类型安全章节（第十一类）
3. 逐条检查所有适用规则
4. 对发现的问题按严重级别排序（🔴 优先于 🟡）
5. 给出具体的修复建议和修改后的代码示例
6. 如果用户要求自动修复，生成修复后的完整代码文件

## 对应 ESLint 配置建议

检查完成后，可以建议用户配置以下 ESLint 规则实现自动化检测：

```json
{
  "rules": {
    "strict": ["error", "global"],
    "no-eval": "error",
    "no-with": "error",
    "no-new-func": "error",
    "no-var": "error",
    "no-floating-decimal": "error",
    "use-isnan": "error",
    "eqeqeq": ["error", "smart"],
    "no-cond-assign": "error",
    "consistent-return": "error",
    "prefer-rest-params": "error",
    "no-extend-native": "error",
    "no-unsafe-finally": "error",
    "no-return-await": "error",
    "semi": ["warn", "always"],
    "quotes": ["warn", "single"],
    "indent": ["warn", 2],
    "max-len": ["warn", { "code": 120 }],
    "curly": "warn",
    "@typescript-eslint/explicit-function-return-type": "error",
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-unsafe-argument": "error",
    "@typescript-eslint/no-unsafe-assignment": "error",
    "@typescript-eslint/no-unsafe-call": "error",
    "@typescript-eslint/no-unsafe-member-access": "error",
    "@typescript-eslint/no-unsafe-return": "error",
    "@typescript-eslint/consistent-type-exports": "error",
    "@typescript-eslint/consistent-type-imports": "error",
    "@typescript-eslint/no-this-alias": "error",
    "@typescript-eslint/no-dynamic-delete": "error",
    "@typescript-eslint/await-thenable": "error",
    "no-console": "error",
    "no-debugger": "error",
    "no-restricted-syntax": ["error",
      { "selector": "CallExpression[callee.object.name='Math'][callee.property.name='random']", "message": "Use crypto.randomBytes/randomUUID for security scenarios" }
    ]
  }
}
```
