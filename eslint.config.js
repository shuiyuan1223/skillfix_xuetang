import eslint from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import prettier from "eslint-config-prettier";
import importPlugin from "eslint-plugin-import-x";

export default [
  eslint.configs.recommended,

  // ─── Main config (non-type-aware rules) ──────────────────────────────────────
  {
    files: ["src/**/*.ts", "ui/src/**/*.ts", "src/**/*.js"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
      globals: {
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
        setTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        clearTimeout: "readonly",
        fetch: "readonly",
        crypto: "readonly",
        WebSocket: "readonly",
        Bun: "readonly",
        URL: "readonly",
        AbortSignal: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
      "import": importPlugin,
    },
    rules: {
      // ── TypeScript overrides ──────────────────────────────────────────────────
      "no-unused-vars": "off",
      "no-undef": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],

      // ── Ch1: 鸿蒙环境限制 ────────────────────────────────────────────────────
      // Ext-2.1: strict mode — ES Module 自动启用，无需额外规则
      "no-eval": "error",                                            // G.AOD.01 禁止 eval()
      "no-with": "error",                                            // G.SCO.02 禁止 with(){}
      "no-new-func": "error",                                        // G.MET.08 禁止动态创建函数

      // ── Ch3: 格式规范 ────────────────────────────────────────────────────────
      "no-tabs": "warn",                                             // G.FMT.01 禁止 tab 缩进
      "indent": ["warn", 2, { SwitchCase: 1 }],                      // G.FMT.01 2空格缩进 + OH 2.6 switch缩进
      "max-len": ["warn", { code: 120, ignoreUrls: true }],          // G.FMT.02 行宽 ≤ 120
      "curly": "warn",                                               // OH 2.4  if/for/while 必须用大括号
      "operator-linebreak": ["warn", "after"],                       // G.FMT.03 换行时运算符放行末
      "one-var": ["error", "never"],                                 // G.VAR.03 多变量不同行
      "keyword-spacing": "warn",                                     // G.FMT.09 关键字前后空格
      "space-before-function-paren": ["warn", "never"],              // G.FMT.09 函数名与(之间无空格
      "space-before-blocks": "warn",                                 // G.FMT.09 { 前有空格
      "space-infix-ops": "warn",                                     // G.FMT.09 运算符前后空格
      "comma-spacing": "warn",                                       // G.FMT.09 逗号后有空格
      "array-bracket-spacing": ["warn", "never"],                    // G.FMT.09 [] 内侧无空格
      "semi": ["warn", "always"],                                    // G.FMT.12 语句以分号结尾
      "quotes": ["warn", "single", { avoidEscape: true }],           // G.TYP.04 使用单引号

      // ── Ch4: 声明与初始化 ────────────────────────────────────────────────────
      "no-var": "error",                                             // G.VAR.01 禁止 var

      // ── Ch5: 数据类型 ────────────────────────────────────────────────────────
      "no-floating-decimal": "error",                                // G.TYP.01 浮点数不省略 0
      "use-isnan": "error",                                          // G.TYP.02 用 isNaN() 判断 NaN

      // ── Ch6: 运算与表达式 ────────────────────────────────────────────────────
      "eqeqeq": ["error", "smart"],                                  // G.EXP.02 使用 ===
      "no-cond-assign": "error",                                     // G.CTL.06 条件中不赋值

      // ── Ch7: 函数 ────────────────────────────────────────────────────────────
      "consistent-return": "error",                                  // G.MET.07 一致的 return
      "prefer-rest-params": "error",                                 // G.MET.10 rest 替代 arguments
      "@typescript-eslint/no-this-alias": "error",                   // Ext-8.3  禁止 this 赋值

      // ── Ch8: 类与对象 ────────────────────────────────────────────────────────
      "dot-notation": "error",                                       // G.OBJ.04 点号访问属性
      "no-extend-native": "error",                                   // G.OBJ.07 不修改内置对象原型
      "@typescript-eslint/no-dynamic-delete": "error",               // Ext-9.3  禁止 delete 计算属性

      // ── Ch9: 异常 ────────────────────────────────────────────────────────────
      "no-unsafe-finally": "error",                                  // G.ERR.03 finally 中不用 return/break

      // ── Ch10: 异步 ───────────────────────────────────────────────────────────
      "no-return-await": "error",                                    // G.ASY.01 禁止不必要的 return await

      // ── Ch11: TypeScript 类型安全 (不需要 project) ───────────────────────────
      "@typescript-eslint/explicit-function-return-type": "error",   // G.FUN.01-TS 显式返回类型
      "@typescript-eslint/consistent-type-imports": "error",         // Ext-12.4  类型导入一致性
      "@typescript-eslint/no-explicit-any": "error",                 // Ext-12.6  禁止 any

      // ── Ch12: 安全审计 ───────────────────────────────────────────────────────
      "no-console": "error",                                         // SEC.02 禁止 console 直接输出
      "no-debugger": "error",                                        // SEC.03 禁止 debugger
      "no-alert": "error",                                           // SEC.03 禁止 alert()
      "no-restricted-syntax": [                                      // SEC.09 禁止 Math.random() 安全场景
        "error",
        {
          selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
          message: "SEC.09: 安全场景请使用 crypto.randomBytes / randomUUID / getRandomValues",
        },
      ],

      // ── Ch13: Google/ESLint 补充规则 ─────────────────────────────────────────
      "import/no-default-export": "error",                        // EXT.13.1 禁止 default export
      "no-array-constructor": "error",                               // EXT.13.2 禁止 Array 构造函数
      "no-throw-literal": "error",                                   // EXT.13.3 只抛出 Error 对象
      "guard-for-in": "warn",                                        // EXT.13.5 for-in 过滤原型属性
      "import/no-cycle": ["warn", { maxDepth: 3 }],               // EXT.13.6 禁止循环依赖
      "@typescript-eslint/no-namespace": "error",                    // EXT.13.8 禁止 namespace 关键字
      "radix": ["warn", "always"],                                   // EXT.13.9 parseInt 必须指定基数
      "no-implicit-coercion": ["warn", { number: true, string: false, boolean: false }], // EXT.13.10 禁止 unary +
      "no-new-wrappers": "error",                                    // EXT.13.11 禁止基本类型包装器
      "no-prototype-builtins": "error",                              // EXT.13.12 不直接调用 Object.prototype 方法
      "no-proto": "error",                                           // EXT.13.13 禁止 __proto__
      "prefer-template": "warn",                                     // EXT.13.14 优先使用模板字符串
      "no-inner-declarations": "error",                              // EXT.13.15 禁止块内声明函数
    },
  },

  // ─── Type-aware rules (需要 tsconfig project 引用) ───────────────────────────
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: ["./tsconfig.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { "@typescript-eslint": tseslint },
    rules: {
      "@typescript-eslint/await-thenable": "error",               // Ext-11.2  不 await 非 Thenable
      "@typescript-eslint/consistent-type-exports": "error",      // Ext-12.3  类型导出一致性 (needs type info)
      "@typescript-eslint/no-unsafe-argument": "error",           // Ext-12.7  不传 any 参数
      "@typescript-eslint/no-unsafe-assignment": "error",         // Ext-12.8  赋值中不使用 any
      "@typescript-eslint/no-unsafe-call": "error",               // Ext-12.9  不 call any 类型变量
      "@typescript-eslint/no-unsafe-member-access": "error",      // Ext-12.10 不访问 any 成员
      "@typescript-eslint/no-unsafe-return": "error",             // Ext-12.11 不返回 any
      "@typescript-eslint/only-throw-error": "error",             // EXT.13.3  仅抛出 Error (类型增强版)
      "@typescript-eslint/return-await": ["error", "never"],      // G.ASY.01  return await 类型增强版
    },
  },

  // ─── Test files override ─────────────────────────────────────────────────────
  {
    files: ["tests/**/*.ts", "**/*.test.ts", "**/*.spec.ts"],
    rules: {
      "no-console": "off",
      "no-alert": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
    },
  },

  prettier,

  {
    ignores: ["dist/", "node_modules/", "ui/dist/", "data/", "tmp/"],
  },
];
