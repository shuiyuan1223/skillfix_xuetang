# HarmonyOS TS/JS 编程规范 - 完整规则参考

> 本文档包含所有规则的详细描述、正反例和检测模式。
> 来源：华为 JS/TS 编程规范 V3.0、OpenHarmony JS 通用编程规范、ESLint/TSC/Google Style Guide

## 目录

1. [鸿蒙环境限制](#1-鸿蒙环境限制)
2. [命名规范](#2-命名规范)
3. [格式规范](#3-格式规范)
4. [声明与初始化](#4-声明与初始化)
5. [数据类型](#5-数据类型)
6. [运算与表达式](#6-运算与表达式)
7. [函数](#7-函数)
8. [类与对象](#8-类与对象)
9. [异常](#9-异常)
10. [异步](#10-异步)
11. [TypeScript 类型安全](#11-typescript-类型安全)

---

## 1. 鸿蒙环境限制

### 1.1 使用严格模式 【Ext-2.1】
- **级别**: 🔴 要求
- **检测模式**: 文件顶部是否有 `'use strict';` 或文件是否为 ES Module（含 import/export）
- **说明**: 方舟编译运行时只支持严格模式。ES Module 自动启用严格模式。
- **反例**:
```javascript
// 缺少 'use strict' 且非 ES Module
var x = 1;
```
- **正例**:
```javascript
'use strict';
const x = 1;
```

### 1.2 禁止使用 eval() 【G.AOD.01】
- **级别**: 🔴 要求
- **检测模式**: 搜索 `eval(` 调用，包括 `window.eval`、`global.eval`、间接调用 `(0, eval)()`
- **ESLint**: `no-eval`
- **反例**:
```javascript
console.log(eval('2 + 2'));
eval('let value = 1 + 1;');
```

### 1.3 禁止使用 with(){} 【G.SCO.02】
- **级别**: 🔴 要求
- **检测模式**: 搜索 `with (` 或 `with(` 语句
- **ESLint**: `no-with`
- **反例**:
```javascript
with (foo) {
  let x = 3;
}
```

### 1.4 不要动态创建函数 【G.MET.08】
- **级别**: 🔴 要求
- **检测模式**: 搜索 `new Function(`
- **ESLint**: `no-new-func`
- **反例**:
```javascript
let add = new Function('a', 'b', 'return a + b');
```
- **正例**:
```javascript
function add(a, b) { return a + b; }
const add = (a, b) => a + b;
```

---

## 2. 命名规范

### 2.1 类名/枚举名/命名空间名用 UpperCamelCase 【G.NAM.01】
- **级别**: 🟡 建议
- **检测模式**: `class X` / `enum X` / `namespace X` 中 X 匹配 `/^[A-Z][a-zA-Z0-9]*$/`
- **反例**: `class user_info {}`, `class userData {}`（首字母未大写）
- **正例**: `class UserInfo {}`, `enum UserType {}`

### 2.2 变量/方法/参数用 lowerCamelCase 【G.NAM.02】【G.NAM.03】
- **级别**: 🟡 建议
- **检测模式**: `let/const/function` 声明的标识符匹配 `/^[a-z][a-zA-Z0-9]*$/` 或 `UPPER_SNAKE_CASE`（常量除外）
- **反例**: `let UserName = 'x';`, `function GetUser() {}`
- **正例**: `let userName = 'x';`, `function getUser() {}`

### 2.3 常量/枚举值用 UPPER_SNAKE_CASE 【G.NAM.06】
- **级别**: 🟡 建议
- **检测模式**: 模块级 `const` 且值为字面量/冻结对象，名称匹配 `/^[A-Z][A-Z0-9_]*$/`
- **正例**: `const MAX_USER_SIZE = 10000;`

### 2.4 布尔变量加 is/has/can/should 前缀，避免否定命名 【G.NAM.04】
- **级别**: 🟡 建议
- **检测模式**: boolean 类型变量名是否以 `is|has|can|should` 开头；是否含 `Not|No` 等否定词
- **反例**: `let isNoError = true;`, `let isNotFound = false;`
- **正例**: `let isError = false;`, `let isFound = true;`, `function isEmpty() {}`

---

## 3. 格式规范

### 3.1 空格缩进，禁止 tab 【G.FMT.01】
- **级别**: 🟡 建议
- **检测模式**: 搜索 `\t` 字符
- **ESLint**: `no-tabs`, `indent`
- **建议**: 普通缩进 2 空格，换行缩进 4 空格

### 3.2 行宽 ≤ 120 字符 【G.FMT.02】【OH 2.1】
- **级别**: 🟡 建议
- **检测模式**: 逐行检查长度，URL 和命令行注释除外
- **ESLint**: `max-len: 120`

### 3.3 if/for/do/while 必须用大括号 【OH 2.4】
- **级别**: 🟡 建议
- **检测模式**: `if/for/while/do` 后不跟 `{` 的语句
- **ESLint**: `curly`
- **反例**:
```javascript
if (condition)
  console.log('success');
```
- **正例**:
```javascript
if (condition) {
  console.log('success');
}
```

### 3.4 switch 的 case/default 缩进一层 【OH 2.6】
- **级别**: 🟡 建议
- **检测模式**: switch 内 case/default 的缩进级别

### 3.5 换行时运算符放行末 【G.FMT.03】【OH 2.7】
- **级别**: 🟡 建议
- **检测模式**: 行首出现 `&&`, `||`, `+`, `-` 等二元运算符
- **ESLint**: `operator-linebreak: ["warn", "after"]`

### 3.6 多变量声明不写同一行 【G.VAR.03】
- **级别**: 🔴 要求
- **检测模式**: 单个 `let/const/var` 声明含逗号分隔多变量；同一行出现多个赋值语句
- **ESLint**: `one-var: ["error", "never"]`
- **反例**:
```javascript
let maxCount = 10, isCompleted = false;
let pointX, pointY;
pointX = 10; pointY = 0;
```
- **正例**:
```javascript
let maxCount = 10;
let isCompleted = false;
```

### 3.7 空格使用规范 【G.FMT.09】
- **级别**: 🟡 建议
- **检测要点**:
  - `if/for/while/switch` 与 `(` 之间有空格
  - 函数名与 `(` 之间无空格
  - `else/catch` 与 `}` 之间有空格
  - `{` 前有空格
  - 二元/三元运算符前后有空格
  - 逗号后有空格，逗号前无空格
  - `[]` 内侧无空格
  - 无多个连续空格
- **ESLint**: `keyword-spacing`, `space-before-function-paren`, `space-before-blocks`, `space-infix-ops`, `comma-spacing`, `array-bracket-spacing`

### 3.8 语句以分号结尾 【G.FMT.12】
- **级别**: 🟡 建议
- **检测模式**: 表达式语句末尾缺少 `;`
- **ESLint**: `semi: ["warn", "always"]`

### 3.9 字符串使用单引号 【G.TYP.04】
- **级别**: 🟡 建议
- **检测模式**: 非模板字符串中使用双引号
- **ESLint**: `quotes: ["warn", "single"]`
- **例外**: 字符串内含单引号时可用双引号

---

## 4. 声明与初始化

### 4.1 使用 const/let 代替 var 【G.VAR.01】
- **级别**: 🔴 要求
- **检测模式**: 搜索 `var ` 声明
- **ESLint**: `no-var`
- **反例**: `var number = 1;`
- **正例**: `const number = 1;` / `let count = 1;`

---

## 5. 数据类型

### 5.1 浮点数不省略小数点前后的 0 【G.TYP.01】
- **级别**: 🔴 要求
- **检测模式**: 匹配 `/\.\d/` 前无数字 或 `/\d\./` 后无数字（排除属性访问）
- **ESLint**: `no-floating-decimal`
- **反例**: `const num = .5;`, `const num = 2.;`
- **正例**: `const num = 0.5;`, `const num = 2.0;`

### 5.2 用 isNaN() 判断 NaN 【G.TYP.02】
- **级别**: 🔴 要求
- **检测模式**: 搜索 `== NaN` / `!= NaN` / `=== NaN` / `!== NaN`
- **ESLint**: `use-isnan`
- **正例**: `if (isNaN(foo)) {}` 或 `if (Number.isNaN(foo)) {}`

### 5.3 浮点数不用 ==/=== 直接比较 【G.TYP.03】
- **级别**: 🔴 要求
- **检测模式**: 两个浮点运算结果用 `==` / `===` 比较
- **正例**:
```javascript
const EPSILON = 1e-6;
if (Math.abs(num1 + num2 - sum) < EPSILON) { }
```

### 5.4 数组不定义非数字属性 【G.TYP.07】
- **级别**: 🔴 要求
- **检测模式**: 对数组使用字符串索引赋值 `arr['key'] = val`
- **正例**: 使用 `Map` 或 `Object` 代替

### 5.5 数组遍历优先用 Array 方法 【G.TYP.08】
- **级别**: 🔴 要求
- **检测模式**: 对数组使用 `for...in`；可用 `map/filter/reduce` 替代的 `for` 循环
- **禁止**: 对数组使用 `for...in`
- **推荐**: `forEach`, `map`, `filter`, `find`, `findIndex`, `reduce`, `some`, `every`, `for...of`

---

## 6. 运算与表达式

### 6.1 使用 ===/!== 代替 ==/!= 【G.EXP.02】
- **级别**: 🔴 要求
- **检测模式**: 搜索 `==` 和 `!=`（排除 `===`/`!==`）
- **ESLint**: `eqeqeq: ["error", "smart"]`
- **例外**: `obj == null` / `obj != null` 可接受

### 6.2 条件表达式中不赋值 【G.CTL.06】
- **级别**: 🔴 要求
- **检测模式**: `if/while/for/?:` 条件中出现 `=`（单等号，排除 `==`/`===`）
- **ESLint**: `no-cond-assign`
- **反例**: `if (isFoo = false) {}`

---

## 7. 函数

### 7.1 一致的 return 语句 【G.MET.07】
- **级别**: 🔴 要求
- **检测模式**: 函数内部分路径返回值、部分路径不返回或返回 undefined
- **ESLint**: `consistent-return`
- **反例**:
```javascript
function doSomething(condition) {
  if (condition) { return true; }
  // 隐式返回 undefined
}
```

### 7.2 用 rest 语法代替 arguments 【G.MET.10】
- **级别**: 🔴 要求
- **检测模式**: 函数体内引用 `arguments`
- **ESLint**: `prefer-rest-params`
- **正例**: `function concatenateAll(...args) { return args.join(''); }`

### 7.3 禁止 this 赋值给变量 【Ext-8.3】
- **级别**: 🔴 要求
- **检测模式**: `const/let/var self/that/me/... = this`
- **ESLint**: `@typescript-eslint/no-this-alias`
- **正例**: 使用箭头函数保持 this 绑定
```javascript
function foo() {
  return () => { console.log(this); };
}
```

---

## 8. 类与对象

### 8.1 点号访问属性 【G.OBJ.04】
- **级别**: 🔴 要求
- **检测模式**: 对已知属性名使用 `obj['knownProp']` 而非 `obj.knownProp`
- **ESLint**: `dot-notation`
- **例外**: 属性名为变量时可用 `[]`

### 8.2 不修改内置对象原型 【G.OBJ.07】
- **级别**: 🔴 要求
- **检测模式**: `Array.prototype.xxx =`, `String.prototype.xxx =`, `Object.prototype.xxx =` 等
- **ESLint**: `no-extend-native`

### 8.3 禁止 delete 可计算属性 【Ext-9.3】
- **级别**: 🔴 要求
- **检测模式**: `delete obj[expr]`（expr 为变量或表达式，非数字字面量）
- **ESLint**: `@typescript-eslint/no-dynamic-delete`
- **反例**: `delete container[name]`
- **允许**: `delete container.aaa;`, `delete container[7];`

---

## 9. 异常

### 9.1 finally 中不用 return/break/continue/throw 【G.ERR.03】
- **级别**: 🔴 要求
- **检测模式**: `finally` 块内出现 `return`/`break`/`continue`/`throw`
- **ESLint**: `no-unsafe-finally`

---

## 10. 异步

### 10.1 禁用不必要的 return await 【G.ASY.01】
- **级别**: 🔴 要求
- **检测模式**: `async function` 中直接 `return await expr`（非 try 块内）
- **ESLint**: `no-return-await`
- **例外**: `try { return await bar(); } catch(e) {}` 是合法的

### 10.2 不 await 非 Thenable 值 【Ext-11.2】
- **级别**: 🔴 要求
- **检测模式**: `await` 后接字面量或非 Promise 类型值
- **ESLint**: `@typescript-eslint/await-thenable`
- **反例**: `const y = await 20;`
- **正例**: `const y = 20;`

---

## 11. TypeScript 类型安全

> 以下规则仅适用于 TypeScript 代码

### 11.1 null/undefined 作为独立类型标注 【Ext-12.1】
- **级别**: 🔴 要求
- **检测模式**: 变量可能赋值 `null`/`undefined` 但类型声明中未包含
- **TSConfig**: `strictNullChecks: true`
- **反例**: `let userName: string; userName = undefined;`
- **正例**: `let userName: string | undefined;`

### 11.2 显式声明函数返回值类型 【G.FUN.01-TS】
- **级别**: 🔴 要求
- **检测模式**: 函数/方法/箭头函数缺少返回值类型注解
- **ESLint**: `@typescript-eslint/explicit-function-return-type`
- **反例**: `function fn() { return 1; }`
- **正例**: `function fn(): number { return 1; }`

### 11.3 类型导出一致性 【Ext-12.3】
- **级别**: 🔴 要求
- **检测模式**: `export { SomeType }` 中 SomeType 是 type/interface 但未用 `export type`
- **ESLint**: `@typescript-eslint/consistent-type-exports`
- **正例**: `export type { ButtonProps };`

### 11.4 类型导入一致性 【Ext-12.4】
- **级别**: 🔴 要求
- **检测模式**: `import { SomeType }` 中 SomeType 仅用作类型但未用 `import type`
- **ESLint**: `@typescript-eslint/consistent-type-imports`
- **正例**: `import type { Foo } from 'Foo';`

### 11.5 禁止使用 any 【Ext-12.5 ~ 12.11】
- **级别**: 🔴 要求
- **覆盖全部 any 相关规则**:

| 子规则 | 检测模式 | ESLint 规则 |
|--------|----------|------------|
| 12.5 避免 any | 类型未知时用 `unknown` | - |
| 12.6 不定义 any 类型 | `: any` 类型注解 | `@typescript-eslint/no-explicit-any` |
| 12.7 不传递 any 参数 | 函数调用时传入 any 类型值 | `@typescript-eslint/no-unsafe-argument` |
| 12.8 不在赋值中使用 any | `= x as any` 等 | `@typescript-eslint/no-unsafe-assignment` |
| 12.9 不 call any 类型变量 | `anyVar()` | `@typescript-eslint/no-unsafe-call` |
| 12.10 不访问 any 成员 | `anyVar.prop` | `@typescript-eslint/no-unsafe-member-access` |
| 12.11 不返回 any | `return x as any` | `@typescript-eslint/no-unsafe-return` |

- **例外**: 引入无 TS 类型声明的三方库时可使用 any

---

## 12. 安全审计

> 源自华为内部代码安全审计常见问题，由 Python 审计规则适配至 TS/JS 及鸿蒙环境。全部为 🔴 要求级别。

### 12.1 禁止明文硬编码密钥/凭据 【SEC.01】
- **级别**: 🔴 要求
- **检测模式**:
  - 变量名含 `password`/`secret`/`token`/`apiKey`/`accessKey`/`privateKey`/`credential` 且直接赋值字面量字符串
  - 检测高熵字符串（Base64/Hex 编码且长度 ≥ 16）赋值给可疑变量
  - `.env` 文件中存储密钥（`.env` 不应进入仓库）
- **说明**: 密钥明文写在代码中一旦泄露无法撤回，且会随 git 历史永久存在。应通过运行时从安全存储（KMS、Vault、鸿蒙 Security 模块）动态获取。
- **反例**:
```typescript
const DB_PASSWORD = 'MyS3cretP@ss!';
const API_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6Ikp...';
const config = {
  secret: 'hardcoded-secret-value',
  accessKey: 'AKIAIOSFODNN7EXAMPLE',
};
```
- **正例**:
```typescript
import { getSecret } from '@huawei/kms-client';

const DB_PASSWORD: string = await getSecret('db-password');
const API_TOKEN: string = process.env.API_TOKEN ?? '';
// 鸿蒙侧
const credential: string = await securityManager.getCredential('api-token');
```

### 12.2 禁止 console 直接输出，日志统一管理 【SEC.02】
- **级别**: 🔴 要求
- **检测模式**: 搜索 `console.log`/`console.warn`/`console.error`/`console.info`/`console.debug`/`console.trace`
- **ESLint**: `no-console`
- **说明**: 直接使用 console 会导致日志无法统一管控级别、无法脱敏、无法对接日志采集平台。鸿蒙侧应使用 `hilog`。
- **反例**:
```typescript
console.log('User logged in:', userId);
console.error('Failed to fetch:', error);
console.warn(`Retry attempt ${count}`);
```
- **正例**:
```typescript
import { Logger } from '@utils/logger';
const logger = Logger.create('UserModule');

logger.info('User logged in', { userId: maskId(userId) });
logger.error('Failed to fetch', { error: error.message });

// 鸿蒙侧
import hilog from '@ohos.hilog';
hilog.info(0x0001, 'UserModule', 'User logged in: %{public}s', maskId(userId));
```

### 12.3 禁止残留测试/调试代码 【SEC.03】
- **级别**: 🔴 要求
- **检测模式**:
  - `debugger` 语句
  - `describe(`/`it(`/`test(`/`expect(` 在非 `*.test.*`/`*.spec.*`/`__tests__` 目录的文件中
  - `.only` / `.skip` 调用（如 `describe.only`、`it.skip`）
  - 含 `TODO:REMOVE`/`FIXME:REMOVE`/`HACK` 的注释
  - `alert(` 调用
- **ESLint**: `no-debugger`, `no-alert`
- **反例**:
```typescript
// src/service/user.ts（非测试文件）
debugger;
describe('temp test', () => {
  it.only('should work', () => {
    expect(1).toBe(1);
  });
});
alert('debug: reached here');
// TODO:REMOVE 临时调试代码
```
- **正例**: 测试代码只存在于 `*.test.ts`/`*.spec.ts`/`__tests__/` 目录中，生产代码无任何调试残留。

### 12.4 禁止硬编码 URL/UID/ID/Cookie 【SEC.04】
- **级别**: 🔴 要求
- **检测模式**:
  - 字符串字面量匹配 UUID 格式 `/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i`
  - 变量名含 `cookie`/`sessionId`/`deviceId`/`userId` 且赋值为字面量
  - 代码中出现形如 `uid=xxx`、`id=xxx` 的硬编码查询参数
- **说明**: 硬编码的 ID/Cookie 会导致环境切换困难且存在信息泄漏风险。与 SEC.08（公网地址）互补——SEC.04 侧重 ID/凭据类，SEC.08 侧重 URL 地址类。
- **反例**:
```typescript
const userId = '550e8400-e29b-41d4-a716-446655440000';
const sessionCookie = 'sid=abc123def456';
fetch(`/api/user?uid=10086&deviceId=HUAWEI-MATE60-001`);
```
- **正例**:
```typescript
import { AppConfig } from '@config';

const userId: string = AppConfig.get('defaultTestUserId');
const sessionCookie: string = authService.getSessionCookie();
fetch(`/api/user?uid=${currentUser.id}&deviceId=${device.getId()}`);
```

### 12.5 文件操作必须显式设置权限 【SEC.05】
- **级别**: 🔴 要求
- **检测模式**:
  - `fs.open(path, flags)` 缺少第三个 `mode` 参数
  - `fs.writeFile`/`fs.writeFileSync` 未在 options 中指定 `mode`
  - `fs.openSync` 缺少 mode
  - 鸿蒙侧 `fileio.openSync` 缺少 mode
- **说明**: 不设权限时使用系统默认值（通常 0o666），可能导致文件被其他进程/用户读写。应显式设置最小必要权限。
- **反例**:
```typescript
import fs from 'fs';
// 缺少 mode 参数
fs.openSync('/data/config.json', 'w');
fs.writeFileSync('/data/output.txt', data);

// 鸿蒙侧
import fileio from '@ohos.fileio';
fileio.openSync('/data/storage/config', 0o2);  // 缺少第三个 mode 参数
```
- **正例**:
```typescript
import fs from 'fs';
fs.openSync('/data/config.json', 'w', 0o640);
fs.writeFileSync('/data/output.txt', data, { mode: 0o640 });

// 鸿蒙侧
import fileio from '@ohos.fileio';
fileio.openSync('/data/storage/config', 0o2, 0o640);
```

### 12.6 日志级别必须统一为枚举常量 【SEC.06】
- **级别**: 🔴 要求
- **检测模式**:
  - 日志调用中使用裸字符串表示级别：`logger.log('info', ...)` / `logger.setLevel('debug')`
  - 多处使用不同的日志级别字符串
- **说明**: 裸字符串没有编译时检查，容易拼写错误（如 `'warn'` vs `'warning'`），且无法统一变更。
- **反例**:
```typescript
logger.setLevel('debug');
logger.log('info', 'Starting service');
logger.log('warn', 'Low memory');
hilog.info(0x0001, 'TAG', 'message');  // 域ID硬编码
```
- **正例**:
```typescript
enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}
const LOG_DOMAIN = 0x0001;

logger.setLevel(LogLevel.DEBUG);
logger.log(LogLevel.INFO, 'Starting service');
hilog.info(LOG_DOMAIN, 'TAG', 'message');
```

### 12.7 禁止大段代码重复 【SEC.07】
- **级别**: 🔴 要求
- **检测模式**: 同一文件内连续 ≥ 6 行代码（去除空白后）出现重复
- **说明**: 重复代码增加维护成本，修复 bug 时容易遗漏。应提取公共函数。此规则通过静态扫描近似检测，完整检测建议配合 jscpd 等工具。
- **反例**:
```typescript
// Block A
const userA = await db.query('SELECT * FROM users WHERE id = ?', [idA]);
if (!userA) { throw new Error('User not found'); }
const profileA = await db.query('SELECT * FROM profiles WHERE uid = ?', [userA.id]);
const result_a = { ...userA, ...profileA };

// Block B — 几乎完全相同
const userB = await db.query('SELECT * FROM users WHERE id = ?', [idB]);
if (!userB) { throw new Error('User not found'); }
const profileB = await db.query('SELECT * FROM profiles WHERE uid = ?', [userB.id]);
const result_b = { ...userB, ...profileB };
```
- **正例**:
```typescript
async function getUserWithProfile(id: string): Promise<UserWithProfile> {
  const user = await db.query('SELECT * FROM users WHERE id = ?', [id]);
  if (!user) { throw new Error('User not found'); }
  const profile = await db.query('SELECT * FROM profiles WHERE uid = ?', [user.id]);
  return { ...user, ...profile };
}

const resultA = await getUserWithProfile(idA);
const resultB = await getUserWithProfile(idB);
```

### 12.8 公网地址必须外置到配置 【SEC.08】
- **级别**: 🔴 要求
- **检测模式**:
  - 代码文件（`.ts`/`.js`/`.ets`）中出现 `http://` 或 `https://` 字面量字符串
  - HTML 模板（含 JSX/TSX 中的字符串）中出现 CDN 地址或 API 域名
  - 例外：`localhost`/`127.0.0.1`/`0.0.0.0` 的本地地址、注释中的文档链接
- **说明**: 硬编码公网地址导致环境切换需改代码，也会泄露内部服务拓扑。所有外部地址应定义在配置文件（如 `config.ts`/`app.json5`）中，通过变量引用。
- **反例**:
```typescript
const API_BASE = 'https://api.internal.huawei.com/v2';
fetch('https://cdn.example.com/sdk/v3/loader.js');

// HTML 模板
const html = `<script src="https://cdn.jsdelivr.net/npm/vue@3"></script>`;

// .ets 组件
Image('https://static.huawei.com/logo.png')
```
- **正例**:
```typescript
// config.ts
export const Endpoints = {
  API_BASE: process.env.API_BASE_URL ?? '',
  CDN_SDK: process.env.CDN_SDK_URL ?? '',
  STATIC_LOGO: process.env.STATIC_LOGO_URL ?? '',
};

// 使用
fetch(`${Endpoints.API_BASE}/users`);
const html = `<script src="${Endpoints.CDN_SDK}"></script>`;
Image(Endpoints.STATIC_LOGO)
```

### 12.9 使用安全随机数 【SEC.09】
- **级别**: 🔴 要求
- **检测模式**: `Math.random()` 出现在以下上下文：
  - 变量名含 `token`/`secret`/`key`/`salt`/`nonce`/`code`/`otp`/`password`/`captcha`
  - 同一函数中涉及加密、鉴权、验证码等逻辑
  - 通用扫描：所有 `Math.random()` 均标记为 WARN，上述上下文标记为 ERROR
- **说明**: `Math.random()` 是伪随机数生成器（PRNG），可预测、不适用于安全场景。
- **反例**:
```typescript
const token = Math.random().toString(36).substring(2);
const verifyCode = Math.floor(Math.random() * 900000 + 100000);
const salt = Math.random().toString(16);
```
- **正例**:
```typescript
import { randomBytes, randomUUID } from 'crypto';

const token: string = randomBytes(32).toString('hex');
const verifyCode: string = randomBytes(3).readUIntBE(0, 3).toString().slice(-6).padStart(6, '0');
const salt: string = randomBytes(16).toString('hex');
const uuid: string = randomUUID();

// 浏览器环境 / 鸿蒙 ArkTS
const array = new Uint8Array(32);
crypto.getRandomValues(array);
```

### 12.10 mkdir 必须设置权限 【SEC.10】
- **级别**: 🔴 要求
- **检测模式**:
  - `fs.mkdirSync(path)` / `fs.mkdir(path, callback)` 缺少 options/mode 参数
  - `fs.mkdirSync(path, { recursive: true })` 未包含 `mode` 字段
  - 鸿蒙侧 `fileio.mkdirSync(path)` 缺少第二个 mode 参数
- **说明**: 默认权限 `0o777` 在大部分场景过于宽松。应根据最小权限原则设置，一般目录建议 `0o750`。
- **反例**:
```typescript
fs.mkdirSync('/data/cache');
fs.mkdirSync('/data/logs', { recursive: true });

// 鸿蒙侧
fileio.mkdirSync('/data/storage/mydir');
```
- **正例**:
```typescript
fs.mkdirSync('/data/cache', { mode: 0o750 });
fs.mkdirSync('/data/logs', { recursive: true, mode: 0o750 });

// 鸿蒙侧
fileio.mkdirSync('/data/storage/mydir', 0o750);
```

### 12.11 禁止字符串拼接 SQL 【SEC.11】
- **级别**: 🔴 要求
- **检测模式**:
  - 字符串中含 SQL 关键字（`SELECT`/`INSERT`/`UPDATE`/`DELETE`/`DROP`/`ALTER`/`CREATE TABLE`）且通过 `+` 或模板字符串 `${}` 拼接变量
  - `query(` / `execute(` / `exec(` 调用中直接传入拼接字符串
- **说明**: 字符串拼接 SQL 是最常见的 SQL 注入攻击入口。必须使用参数化查询。
- **反例**:
```typescript
// 模板字符串拼接
const sql = `SELECT * FROM users WHERE name = '${userName}'`;
db.query(sql);

// + 拼接
const query = 'SELECT * FROM orders WHERE id = ' + orderId;
db.execute(query);

// 拼接 DELETE
db.query('DELETE FROM sessions WHERE token = \'' + token + '\'');
```
- **正例**:
```typescript
// 参数化查询（占位符）
const sql = 'SELECT * FROM users WHERE name = ?';
db.query(sql, [userName]);

// 命名参数
const sql = 'SELECT * FROM orders WHERE id = :orderId';
db.execute(sql, { orderId });

// ORM 方式
const user = await userRepository.findOne({ where: { name: userName } });
```

---

## 参考文献

1. 《华为 JavaScript & TypeScript 语言编程规范 V3.0（试行）》
2. 《OpenHarmony JS 通用编程规范》: https://gitee.com/openharmony/docs/blob/master/zh-cn/contribute/OpenHarmony-JavaScript-coding-style-guide.md
3. ESLint Rules: https://github.com/typescript-eslint/typescript-eslint/tree/main/packages/eslint-plugin/docs/rules
4. 《高性能 JavaScript》
5. Google JS Guide: https://google.github.io/styleguide/jsguide.html
6. Google TS Guide: https://google.github.io/styleguide/tsguide.html
