#!/usr/bin/env python3
"""
HarmonyOS TS/JS Code Security Checker
基于《华为鸿蒙 TypeScript/JavaScript 编程规范》的代码安全检查工具

用法: python checker.py <file_or_directory> [--fix] [--json] [--severity error|warn|all]
"""

import re
import sys
import os
import json
import argparse
from dataclasses import dataclass, field, asdict
from enum import Enum
from typing import Optional
from pathlib import Path


class Severity(Enum):
    ERROR = "🔴 ERROR"
    WARN = "🟡 WARN"


@dataclass
class Issue:
    rule_id: str
    rule_name: str
    severity: Severity
    file: str
    line: int
    column: int = 0
    description: str = ""
    suggestion: str = ""

    def to_dict(self) -> dict:
        return {
            "rule_id": self.rule_id,
            "rule_name": self.rule_name,
            "severity": self.severity.value,
            "file": self.file,
            "line": self.line,
            "column": self.column,
            "description": self.description,
            "suggestion": self.suggestion,
        }


class HarmonyChecker:
    """HarmonyOS TS/JS 编程规范检查器"""

    def __init__(self, filepath: str):
        self.filepath = filepath
        self.filename = os.path.basename(filepath)
        self.is_ts = filepath.endswith(('.ts', '.ets', '.tsx'))
        self.issues: list[Issue] = []
        with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
            self.content = f.read()
        self.lines = self.content.split('\n')

    def add_issue(self, rule_id: str, rule_name: str, severity: Severity,
                  line: int, description: str, suggestion: str = "", column: int = 0):
        self.issues.append(Issue(
            rule_id=rule_id,
            rule_name=rule_name,
            severity=severity,
            file=self.filepath,
            line=line,
            column=column,
            description=description,
            suggestion=suggestion,
        ))

    def check_all(self) -> list[Issue]:
        """运行所有检查"""
        # 鸿蒙环境限制 (ERROR)
        self.check_strict_mode()
        self.check_eval()
        self.check_with()
        self.check_new_function()

        # 命名规范 (WARN)
        self.check_class_naming()
        self.check_const_naming()
        self.check_bool_naming()

        # 格式规范
        self.check_tabs()
        self.check_line_width()
        self.check_curly_braces()
        self.check_multi_var_declaration()
        self.check_semicolons()
        self.check_quotes()

        # 声明与初始化 (ERROR)
        self.check_var_usage()

        # 数据类型 (ERROR)
        self.check_floating_decimal()
        self.check_nan_comparison()
        self.check_equality_operators()
        self.check_cond_assign()

        # 函数 (ERROR)
        self.check_arguments_usage()
        self.check_this_alias()

        # 类与对象 (ERROR)
        self.check_prototype_modification()
        self.check_dynamic_delete()

        # 异常 (ERROR)
        self.check_unsafe_finally()

        # 异步 (ERROR)
        self.check_return_await()
        self.check_await_non_thenable()

        # TypeScript 类型安全 (ERROR) - 仅 TS 文件
        if self.is_ts:
            self.check_explicit_any()
            self.check_function_return_type()
            self.check_type_imports()
            self.check_type_exports()

        # 安全审计 (ERROR)
        self.check_hardcoded_secrets()
        self.check_console_usage()
        self.check_test_residual()
        self.check_hardcoded_ids()
        self.check_file_open_permission()
        self.check_log_level_strings()
        self.check_code_duplication()
        self.check_hardcoded_urls()
        self.check_math_random()
        self.check_mkdir_permission()
        self.check_sql_concatenation()

        # Google/ESLint 补充规则
        self.check_default_export()
        self.check_array_constructor()
        self.check_throw_literal()
        self.check_export_let()
        self.check_for_in_guard()
        self.check_namespace_usage()
        self.check_parseInt_radix()
        self.check_unary_plus_coercion()
        self.check_primitive_wrappers()
        self.check_prototype_builtins()
        self.check_dunder_proto()
        self.check_prefer_template()
        self.check_inner_declarations()

        return self.issues

    # ========== 鸿蒙环境限制 ==========

    def check_strict_mode(self):
        """Ext-2.1: 使用严格模式"""
        has_use_strict = "'use strict'" in self.content or '"use strict"' in self.content
        has_import = re.search(r'^\s*(import|export)\s', self.content, re.MULTILINE)
        if not has_use_strict and not has_import:
            self.add_issue("Ext-2.1", "使用严格模式", Severity.ERROR, 1,
                           "文件未启用严格模式，且非 ES Module",
                           "在文件顶部添加 'use strict'; 或使用 import/export 语法")

    def check_eval(self):
        """G.AOD.01: 禁止使用 eval()"""
        for i, line in enumerate(self.lines, 1):
            stripped = self._strip_comments(line)
            if re.search(r'\beval\s*\(', stripped):
                self.add_issue("G.AOD.01", "禁止使用 eval()", Severity.ERROR, i,
                               f"发现 eval() 调用",
                               "使用 JSON.parse() 或其他安全方式替代")

    def check_with(self):
        """G.SCO.02: 禁止使用 with(){}"""
        for i, line in enumerate(self.lines, 1):
            stripped = self._strip_comments(line)
            if re.search(r'\bwith\s*\(', stripped):
                self.add_issue("G.SCO.02", "禁止使用 with(){}", Severity.ERROR, i,
                               "发现 with 语句",
                               "直接使用对象属性访问")

    def check_new_function(self):
        """G.MET.08: 不要动态创建函数"""
        for i, line in enumerate(self.lines, 1):
            stripped = self._strip_comments(line)
            if re.search(r'\bnew\s+Function\s*\(', stripped):
                self.add_issue("G.MET.08", "禁止动态创建函数", Severity.ERROR, i,
                               "发现 new Function() 动态创建函数",
                               "使用函数声明或函数表达式")

    # ========== 命名规范 ==========

    def check_class_naming(self):
        """G.NAM.01: 类名/枚举名用 UpperCamelCase"""
        for i, line in enumerate(self.lines, 1):
            match = re.search(r'\b(?:class|enum|namespace)\s+([a-zA-Z_$][\w$]*)', line)
            if match:
                name = match.group(1)
                if not re.match(r'^[A-Z][a-zA-Z0-9]*$', name):
                    self.add_issue("G.NAM.01", "类名/枚举名用 UpperCamelCase", Severity.WARN, i,
                                   f"'{name}' 不符合 UpperCamelCase 风格",
                                   f"建议改为: {self._to_upper_camel(name)}")

    def check_const_naming(self):
        """G.NAM.06: 常量/枚举值用 UPPER_SNAKE_CASE"""
        # 只检查模块级 const + 字面量赋值
        for i, line in enumerate(self.lines, 1):
            match = re.match(r'^\s*(?:export\s+)?const\s+([a-zA-Z_$][\w$]*)\s*=\s*(\d|[\'"])', line)
            if match:
                name = match.group(1)
                # 跳过函数或对象
                if name == name.upper() or re.match(r'^[a-z]', name):
                    continue  # 全大写已合规，小驼峰可能是普通变量
                # 混合大小写但不全大写的常量
                if re.match(r'^[A-Z]', name) and not re.match(r'^[A-Z][A-Z0-9_]*$', name):
                    self.add_issue("G.NAM.06", "常量名用 UPPER_SNAKE_CASE", Severity.WARN, i,
                                   f"常量 '{name}' 看起来应使用 UPPER_SNAKE_CASE",
                                   f"建议改为: {self._to_upper_snake(name)}")

    def check_bool_naming(self):
        """G.NAM.04: 布尔变量避免否定命名"""
        for i, line in enumerate(self.lines, 1):
            # 检查 boolean 类型的变量
            match = re.search(r'\b(?:let|const|var)\s+([a-zA-Z_$][\w$]*)\s*(?::\s*boolean)?\s*=\s*(?:true|false)\b', line)
            if match:
                name = match.group(1)
                if re.match(r'is(?:No[A-Z]|Not[A-Z])', name):
                    self.add_issue("G.NAM.04", "避免否定的布尔变量名", Severity.WARN, i,
                                   f"'{name}' 使用了否定命名",
                                   "建议使用肯定形式，如将 isNotFound 改为 isFound")

    # ========== 格式规范 ==========

    def check_tabs(self):
        """G.FMT.01: 禁止 tab 缩进"""
        for i, line in enumerate(self.lines, 1):
            if '\t' in line:
                self.add_issue("G.FMT.01", "禁止使用 tab 缩进", Severity.WARN, i,
                               "发现 tab 字符",
                               "替换为空格缩进（推荐 2 空格）")

    def check_line_width(self):
        """G.FMT.02: 行宽不超过 120 字符"""
        for i, line in enumerate(self.lines, 1):
            if len(line) > 120:
                # 例外：含 URL 的行
                if re.search(r'https?://', line):
                    continue
                self.add_issue("G.FMT.02", "行宽不超过 120 字符", Severity.WARN, i,
                               f"行宽 {len(line)} 字符，超过 120 限制",
                               "拆分为多行")

    def check_curly_braces(self):
        """OH 2.4: 条件/循环语句必须用大括号"""
        for i, line in enumerate(self.lines, 1):
            stripped = line.strip()
            # 简化检测：if/for/while 后下一行没有大括号
            match = re.match(r'^(if|for|while)\s*\(.*\)\s*$', stripped)
            if match and i < len(self.lines):
                next_line = self.lines[i].strip()  # i 已经是 1-indexed
                if next_line and not next_line.startswith('{') and not next_line.startswith('//'):
                    self.add_issue("OH-2.4", "条件/循环语句必须用大括号", Severity.WARN, i,
                                   f"{match.group(1)} 语句后缺少大括号",
                                   "用 {{ }} 包裹执行体")

    def check_multi_var_declaration(self):
        """G.VAR.03: 多变量声明不写同一行"""
        for i, line in enumerate(self.lines, 1):
            stripped = self._strip_comments(line).strip()
            # 检测 let/const/var x = 1, y = 2
            if re.match(r'^(?:let|const|var)\s+\w+.*,\s*\w+', stripped):
                # 排除数组/对象解构
                if not re.search(r'[\[\{]', stripped.split('=')[0]):
                    self.add_issue("G.VAR.03", "多变量声明不写同一行", Severity.ERROR, i,
                                   "单行声明了多个变量",
                                   "每个变量用独立的声明语句")

    def check_semicolons(self):
        """G.FMT.12: 语句以分号结尾"""
        for i, line in enumerate(self.lines, 1):
            stripped = self._strip_comments(line).strip()
            if not stripped or stripped.startswith('//') or stripped.startswith('/*'):
                continue
            # 跳过非表达式行
            skip_patterns = ['{', '}', '//', '/*', '*/', '*', 'if', 'else', 'for', 'while',
                             'switch', 'case', 'default', 'try', 'catch', 'finally',
                             'class', 'function', 'interface', 'type', 'enum', 'namespace',
                             'import', 'export']
            if any(stripped.startswith(p) for p in skip_patterns):
                continue
            if stripped.endswith(('{', '}', ',', '(', '/**', '*/')):
                continue
            # 检查以变量赋值/函数调用等结尾但没有分号的行
            if re.match(r'.*[\w\)\]\'"0-9]$', stripped) and not stripped.endswith(';'):
                # 排除一些误报场景
                if not re.match(r'^(\/\/|\/\*|\*)', stripped):
                    self.add_issue("G.FMT.12", "语句以分号结尾", Severity.WARN, i,
                                   "语句末尾缺少分号",
                                   "在语句末尾添加 ;")

    def check_quotes(self):
        """G.TYP.04: 建议使用单引号"""
        for i, line in enumerate(self.lines, 1):
            stripped = self._strip_comments(line)
            # 简化：查找双引号字符串（排除含单引号的情况和 JSX/HTML 属性）
            matches = re.finditer(r'"([^"]*)"', stripped)
            for m in matches:
                content = m.group(1)
                if "'" not in content and not re.search(r'=\s*$', stripped[:m.start()]):
                    # 排除 import 路径中的双引号（有些团队偏好）
                    if not re.match(r'^\s*import\s', stripped):
                        self.add_issue("G.TYP.04", "字符串使用单引号", Severity.WARN, i,
                                       f"使用了双引号: \"{content}\"",
                                       f"建议改为: '{content}'")
                        break  # 每行只报一次

    # ========== 声明与初始化 ==========

    def check_var_usage(self):
        """G.VAR.01: 使用 const/let 代替 var"""
        for i, line in enumerate(self.lines, 1):
            stripped = self._strip_comments(line)
            if re.search(r'\bvar\s+', stripped):
                self.add_issue("G.VAR.01", "禁止使用 var", Severity.ERROR, i,
                               "使用了 var 声明变量",
                               "改用 const（只读）或 let（可变）")

    # ========== 数据类型 ==========

    def check_floating_decimal(self):
        """G.TYP.01: 浮点数不省略小数点前后的 0"""
        for i, line in enumerate(self.lines, 1):
            stripped = self._strip_comments(line)
            # .5 形式（前面不是数字和标识符字符）
            if re.search(r'(?<![.\w])\.\d', stripped):
                self.add_issue("G.TYP.01", "浮点数不省略小数点前的 0", Severity.ERROR, i,
                               "浮点数小数点前缺少 0",
                               "例如将 .5 改为 0.5")
            # 2. 形式（后面不是标识符字符）
            if re.search(r'\d\.(?!\d)(?!\w)', stripped):
                # 排除属性访问如 obj.prop
                if not re.search(r'\w\.\w', stripped):
                    self.add_issue("G.TYP.01", "浮点数不省略小数点后的 0", Severity.ERROR, i,
                                   "浮点数小数点后缺少 0",
                                   "例如将 2. 改为 2.0")

    def check_nan_comparison(self):
        """G.TYP.02: 用 isNaN() 判断 NaN"""
        for i, line in enumerate(self.lines, 1):
            stripped = self._strip_comments(line)
            if re.search(r'[=!]=+\s*NaN\b|\bNaN\s*[=!]=+', stripped):
                self.add_issue("G.TYP.02", "用 isNaN() 判断 NaN", Severity.ERROR, i,
                               "直接与 NaN 比较无效",
                               "使用 isNaN(value) 或 Number.isNaN(value)")

    def check_equality_operators(self):
        """G.EXP.02: 使用 ===/!== 代替 ==/!="""
        for i, line in enumerate(self.lines, 1):
            stripped = self._strip_comments(line)
            # 查找 == 但不是 ===
            matches = list(re.finditer(r'(?<!=)(?<!\!)={2}(?!=)', stripped))
            for m in matches:
                # 例外: == null
                context = stripped[m.start()-10:m.end()+10] if m.start() > 10 else stripped[:m.end()+10]
                if 'null' in context:
                    continue
                self.add_issue("G.EXP.02", "使用 === 代替 ==", Severity.ERROR, i,
                               "使用了 == 进行比较",
                               "改用 === 进行严格相等比较")
                break
            # 查找 != 但不是 !==
            matches = list(re.finditer(r'!={1}(?!=)', stripped))
            for m in matches:
                context = stripped[m.start()-10:m.end()+10] if m.start() > 10 else stripped[:m.end()+10]
                if 'null' in context:
                    continue
                self.add_issue("G.EXP.02", "使用 !== 代替 !=", Severity.ERROR, i,
                               "使用了 != 进行比较",
                               "改用 !== 进行严格不等比较")
                break

    def check_cond_assign(self):
        """G.CTL.06: 条件表达式中不赋值"""
        for i, line in enumerate(self.lines, 1):
            stripped = self._strip_comments(line)
            # if/while 条件中的单 =（排除 ==, ===, !=, !==, <=, >=, =>）
            match = re.search(r'\b(?:if|while)\s*\(', stripped)
            if match:
                paren_content = self._extract_paren(stripped, match.end() - 1)
                if paren_content and re.search(r'(?<![=!<>])=(?!=)', paren_content):
                    self.add_issue("G.CTL.06", "条件表达式中不赋值", Severity.ERROR, i,
                                   "在条件表达式中执行了赋值操作",
                                   "将赋值移到条件判断之前")

    # ========== 函数 ==========

    def check_arguments_usage(self):
        """G.MET.10: 用 rest 语法代替 arguments"""
        for i, line in enumerate(self.lines, 1):
            stripped = self._strip_comments(line)
            if re.search(r'\barguments\b', stripped):
                # 排除注释和字符串中的
                if re.search(r'(?<![\'"])\barguments\s*[\.\[]', stripped) or \
                   re.search(r'(?<![\'"])\barguments\s*\)', stripped):
                    self.add_issue("G.MET.10", "用 rest 语法代替 arguments", Severity.ERROR, i,
                                   "使用了 arguments 对象",
                                   "改用 rest 语法: function fn(...args) {}")

    def check_this_alias(self):
        """Ext-8.3: 禁止 this 赋值给变量"""
        for i, line in enumerate(self.lines, 1):
            stripped = self._strip_comments(line)
            if re.search(r'\b(?:const|let|var)\s+\w+\s*=\s*this\b', stripped):
                self.add_issue("Ext-8.3", "禁止 this 赋值给变量", Severity.ERROR, i,
                               "将 this 赋值给了变量",
                               "使用箭头函数保持 this 绑定")

    # ========== 类与对象 ==========

    def check_prototype_modification(self):
        """G.OBJ.07: 不修改内置对象原型"""
        builtins = ['Array', 'String', 'Number', 'Boolean', 'Object', 'Function',
                    'Date', 'RegExp', 'Error', 'Map', 'Set', 'Promise']
        for i, line in enumerate(self.lines, 1):
            stripped = self._strip_comments(line)
            for builtin in builtins:
                if re.search(rf'\b{builtin}\.prototype\.\w+\s*=', stripped):
                    self.add_issue("G.OBJ.07", "不修改内置对象原型", Severity.ERROR, i,
                                   f"修改了 {builtin}.prototype",
                                   "不要修改内置对象的原型")

    def check_dynamic_delete(self):
        """Ext-9.3: 禁止 delete 可计算属性"""
        for i, line in enumerate(self.lines, 1):
            stripped = self._strip_comments(line)
            match = re.search(r'\bdelete\s+\w+\[', stripped)
            if match:
                bracket_content = self._extract_bracket(stripped, stripped.index('[', match.start()))
                if bracket_content and not re.match(r'^\d+$', bracket_content.strip()):
                    self.add_issue("Ext-9.3", "禁止 delete 可计算属性", Severity.ERROR, i,
                                   "使用了 delete 删除可计算属性",
                                   "使用 Map/Set 代替，或用 delete obj.prop 语法")

    # ========== 异常 ==========

    def check_unsafe_finally(self):
        """G.ERR.03: finally 中不用 return/break/continue/throw"""
        in_finally = False
        brace_depth = 0
        finally_brace_depth = 0
        for i, line in enumerate(self.lines, 1):
            stripped = self._strip_comments(line).strip()
            if re.search(r'\bfinally\s*\{', stripped):
                in_finally = True
                finally_brace_depth = brace_depth + 1
            if in_finally:
                brace_depth += stripped.count('{') - stripped.count('}')
                if re.search(r'\b(return|break|continue|throw)\b', stripped):
                    self.add_issue("G.ERR.03", "finally 中禁止 return/break/continue/throw",
                                   Severity.ERROR, i,
                                   "finally 块中使用了控制流语句",
                                   "移除 finally 中的 return/break/continue/throw")
                if brace_depth < finally_brace_depth:
                    in_finally = False

    # ========== 异步 ==========

    def check_return_await(self):
        """G.ASY.01: 禁用不必要的 return await"""
        in_try = False
        for i, line in enumerate(self.lines, 1):
            stripped = self._strip_comments(line).strip()
            if re.search(r'\btry\s*\{', stripped):
                in_try = True
            if re.search(r'\bcatch\s*[\(\{]', stripped):
                in_try = False
            if not in_try and re.search(r'\breturn\s+await\b', stripped):
                self.add_issue("G.ASY.01", "禁用不必要的 return await", Severity.ERROR, i,
                               "return await 是不必要的",
                               "直接 return promise，或将 await 结果存入变量后返回")

    def check_await_non_thenable(self):
        """Ext-11.2: 不 await 非 Thenable 值"""
        for i, line in enumerate(self.lines, 1):
            stripped = self._strip_comments(line).strip()
            # 检查 await 后面跟着字面量
            match = re.search(r'\bawait\s+(\d+|true|false|null|undefined|[\'"])', stripped)
            if match:
                self.add_issue("Ext-11.2", "不 await 非 Thenable 值", Severity.ERROR, i,
                               f"await 了非 Thenable 的值: {match.group(1)}",
                               "直接使用该值，无需 await")

    # ========== TypeScript 类型安全 ==========

    def check_explicit_any(self):
        """Ext-12.5~12.11: 禁止使用 any"""
        for i, line in enumerate(self.lines, 1):
            stripped = self._strip_comments(line)
            # : any, : any[], as any, Array<any>
            if re.search(r':\s*any\b|as\s+any\b|<\s*any\s*>', stripped):
                self.add_issue("Ext-12.6", "禁止使用 any 类型", Severity.ERROR, i,
                               "使用了 any 类型",
                               "使用具体类型或 unknown 替代")

    def check_function_return_type(self):
        """G.FUN.01-TS: 显式声明函数返回值类型"""
        for i, line in enumerate(self.lines, 1):
            stripped = self._strip_comments(line).strip()
            # function name(params) { — 缺少返回类型
            match = re.match(r'^(?:export\s+)?(?:async\s+)?function\s+\w+\s*\([^)]*\)\s*\{', stripped)
            if match:
                if not re.search(r'\)\s*:\s*\w', stripped):
                    self.add_issue("G.FUN.01-TS", "显式声明函数返回值类型", Severity.ERROR, i,
                                   "函数缺少返回值类型声明",
                                   "在参数列表 ) 后添加 : ReturnType")
            # 类方法
            match = re.match(r'^(?:public|private|protected|static|async|\s)*(\w+)\s*\([^)]*\)\s*\{', stripped)
            if match and match.group(1) not in ('if', 'for', 'while', 'switch', 'catch', 'function'):
                if not re.search(r'\)\s*:\s*\w', stripped):
                    self.add_issue("G.FUN.01-TS", "显式声明方法返回值类型", Severity.ERROR, i,
                                   f"方法 '{match.group(1)}' 缺少返回值类型声明",
                                   "在参数列表 ) 后添加 : ReturnType")

    def check_type_imports(self):
        """Ext-12.4: 类型导入一致性"""
        for i, line in enumerate(self.lines, 1):
            stripped = line.strip()
            # import { X } from — 但不是 import type
            if re.match(r'^import\s+\{', stripped) and not re.match(r'^import\s+type\b', stripped):
                # 这里只能做简单检测，完整检测需要类型信息
                pass  # 需要 AST 分析，此处跳过，由 ESLint 处理

    def check_type_exports(self):
        """Ext-12.3: 类型导出一致性"""
        # 类似 type_imports，完整检测需要 AST
        pass

    # ========== Google/ESLint 补充规则 ==========

    def check_default_export(self):
        """EXT.13.1: 禁止使用 default export"""
        for i, line in enumerate(self.lines, 1):
            stripped = self._strip_comments(line).strip()
            if re.match(r'^export\s+default\b', stripped):
                self.add_issue("EXT.13.1", "禁止使用 default export", Severity.ERROR, i,
                               "使用了 export default",
                               "改用命名导出: export class Foo / export function bar")

    def check_array_constructor(self):
        """EXT.13.2: 禁止使用 Array 构造函数"""
        for i, line in enumerate(self.lines, 1):
            stripped = self._strip_comments(line)
            if re.search(r'\bnew\s+Array\s*\(', stripped) or \
               re.search(r'(?<!\w)Array\s*\(\s*\d', stripped):
                self.add_issue("EXT.13.2", "禁止使用 Array 构造函数", Severity.ERROR, i,
                               "使用了 Array() 构造函数",
                               "使用数组字面量 [] 或 Array.from()")

    def check_throw_literal(self):
        """EXT.13.3: 只抛出 Error 对象"""
        for i, line in enumerate(self.lines, 1):
            stripped = self._strip_comments(line).strip()
            # throw 后面跟字符串/数字/undefined/null
            if re.search(r'\bthrow\s+[\'"`]', stripped) or \
               re.search(r'\bthrow\s+\d', stripped) or \
               re.search(r'\bthrow\s+(?:undefined|null|true|false)\b', stripped):
                self.add_issue("EXT.13.3", "只抛出 Error 对象", Severity.ERROR, i,
                               "throw 了非 Error 类型的值",
                               "使用 throw new Error('message') 或自定义 Error 子类")
            # Promise.reject 非 Error
            match = re.search(r'Promise\s*\.\s*reject\s*\(\s*([\'"`]|undefined|null|\d)', stripped)
            if match:
                self.add_issue("EXT.13.3", "Promise.reject 应传入 Error 对象", Severity.ERROR, i,
                               "Promise.reject() 传入了非 Error 值",
                               "使用 Promise.reject(new Error('message'))")

    def check_export_let(self):
        """EXT.13.4: 禁止 export let"""
        for i, line in enumerate(self.lines, 1):
            stripped = self._strip_comments(line).strip()
            if re.match(r'^export\s+let\b', stripped):
                self.add_issue("EXT.13.4", "禁止 export let（可变导出）", Severity.ERROR, i,
                               "使用了 export let 可变导出",
                               "改用 export const，或导出 getter 函数")

    def check_for_in_guard(self):
        """EXT.13.5: for-in 必须过滤原型属性"""
        in_for_in = False
        for_in_line = 0
        brace_depth = 0
        has_guard = False
        for i, line in enumerate(self.lines, 1):
            stripped = self._strip_comments(line).strip()
            if re.search(r'\bfor\s*\(\s*(?:const|let|var)\s+\w+\s+in\b', stripped):
                in_for_in = True
                for_in_line = i
                brace_depth = 0
                has_guard = False
            if in_for_in:
                brace_depth += stripped.count('{') - stripped.count('}')
                if 'hasOwnProperty' in stripped or 'Object.keys' in stripped or \
                   'Object.entries' in stripped or 'Object.values' in stripped:
                    has_guard = True
                if brace_depth <= 0 and '{' in self._strip_comments(self.lines[for_in_line - 1]):
                    if not has_guard:
                        self.add_issue("EXT.13.5", "for-in 须过滤原型属性", Severity.WARN, for_in_line,
                                       "for-in 循环未过滤原型属性",
                                       "使用 hasOwnProperty 过滤，或改用 Object.keys()/entries()")
                    in_for_in = False

    def check_namespace_usage(self):
        """EXT.13.8: 禁止使用 namespace 关键字"""
        if not self.is_ts:
            return
        for i, line in enumerate(self.lines, 1):
            stripped = self._strip_comments(line).strip()
            if re.match(r'^(?:export\s+)?namespace\s+\w+\s*\{', stripped):
                self.add_issue("EXT.13.8", "禁止使用 namespace 关键字", Severity.ERROR, i,
                               "使用了 namespace 关键字",
                               "使用 ES Module（import/export）组织代码")

    def check_parseInt_radix(self):
        """EXT.13.9: parseInt 必须指定基数"""
        for i, line in enumerate(self.lines, 1):
            stripped = self._strip_comments(line)
            # parseInt(str) 只有一个参数
            match = re.search(r'\bparseInt\s*\(\s*[^,)]+\s*\)', stripped)
            if match:
                # 检查是否只有一个参数（无逗号）
                inner = match.group(0)
                if ',' not in inner:
                    self.add_issue("EXT.13.9", "parseInt 须指定基数", Severity.WARN, i,
                                   "parseInt() 缺少基数参数",
                                   "添加基数参数如 parseInt(str, 10)，或使用 Number()")

    def check_unary_plus_coercion(self):
        """EXT.13.10: 不使用 unary + 做类型转换"""
        for i, line in enumerate(self.lines, 1):
            stripped = self._strip_comments(line)
            # = +variable 或 = +functionCall 模式
            if re.search(r'=\s*\+\s*[a-zA-Z_$][\w$]*(?:\s*[;,)\]]|\s*$)', stripped):
                # 排除 += 运算符
                if not re.search(r'\+=', stripped):
                    self.add_issue("EXT.13.10", "不使用 unary + 做类型转换", Severity.WARN, i,
                                   "使用了 +variable 做隐式类型转换",
                                   "使用 Number(variable) 显式转换")

    def check_primitive_wrappers(self):
        """EXT.13.11: 禁止基本类型包装器"""
        for i, line in enumerate(self.lines, 1):
            stripped = self._strip_comments(line)
            if re.search(r'\bnew\s+(?:Boolean|String|Number)\s*\(', stripped):
                self.add_issue("EXT.13.11", "禁止基本类型包装器", Severity.ERROR, i,
                               "使用了 new Boolean/String/Number 包装器",
                               "直接使用字面量值，如 false / 'str' / 42")

    def check_prototype_builtins(self):
        """EXT.13.12: 不直接调用 Object.prototype 方法"""
        for i, line in enumerate(self.lines, 1):
            stripped = self._strip_comments(line)
            # foo.hasOwnProperty( 但排除 Object.prototype.hasOwnProperty.call
            if re.search(r'(?<!Object\.prototype)\.\s*hasOwnProperty\s*\(', stripped):
                if 'Object.prototype' not in stripped and 'Object.hasOwn' not in stripped:
                    self.add_issue("EXT.13.12", "不直接调用 Object.prototype 方法", Severity.ERROR, i,
                                   "直接调用了 .hasOwnProperty()",
                                   "使用 Object.prototype.hasOwnProperty.call(obj, key) 或 Object.hasOwn()")
            if re.search(r'(?<!Object\.prototype)\.\s*isPrototypeOf\s*\(', stripped):
                if 'Object.prototype' not in stripped:
                    self.add_issue("EXT.13.12", "不直接调用 Object.prototype 方法", Severity.ERROR, i,
                                   "直接调用了 .isPrototypeOf()",
                                   "使用 Object.prototype.isPrototypeOf.call()")
            if re.search(r'(?<!Object\.prototype)\.\s*propertyIsEnumerable\s*\(', stripped):
                if 'Object.prototype' not in stripped:
                    self.add_issue("EXT.13.12", "不直接调用 Object.prototype 方法", Severity.ERROR, i,
                                   "直接调用了 .propertyIsEnumerable()",
                                   "使用 Object.prototype.propertyIsEnumerable.call()")

    def check_dunder_proto(self):
        """EXT.13.13: 用 Object.getPrototypeOf 替代 __proto__"""
        for i, line in enumerate(self.lines, 1):
            stripped = self._strip_comments(line)
            if re.search(r'\.__proto__\b', stripped):
                self.add_issue("EXT.13.13", "禁止使用 __proto__", Severity.ERROR, i,
                               "使用了 __proto__ 属性",
                               "使用 Object.getPrototypeOf() / Object.setPrototypeOf()")

    def check_prefer_template(self):
        """EXT.13.14: 优先使用模板字符串"""
        for i, line in enumerate(self.lines, 1):
            stripped = self._strip_comments(line)
            # 'string' + variable 或 variable + 'string' 模式
            if re.search(r'[\'"][^\'"]*[\'"]\s*\+\s*[a-zA-Z_$]', stripped) or \
               re.search(r'[a-zA-Z_$][\w$]*\s*\+\s*[\'"]', stripped):
                # 排除 SQL 拼接（已有 SEC.11）和 import 语句
                if 'import' not in stripped and not re.search(
                    r'(?:SELECT|INSERT|UPDATE|DELETE|DROP)', stripped, re.IGNORECASE):
                    self.add_issue("EXT.13.14", "优先使用模板字符串", Severity.WARN, i,
                                   "使用 + 拼接字符串",
                                   "使用模板字面量 `...${var}...` 替代")

    def check_inner_declarations(self):
        """EXT.13.15: 禁止在块内声明函数"""
        # 简化检测：查找 if/for/while/else 块内的 function 声明
        brace_depth = 0
        in_control_block = False
        control_depth = 0
        for i, line in enumerate(self.lines, 1):
            stripped = self._strip_comments(line).strip()
            # 检测进入控制块
            if re.search(r'\b(?:if|for|while|else)\b', stripped) and '{' in stripped:
                if not in_control_block:
                    in_control_block = True
                    control_depth = brace_depth
            brace_depth += stripped.count('{') - stripped.count('}')
            # 在控制块内检测函数声明
            if in_control_block and brace_depth > control_depth:
                # 匹配 function 声明（非表达式：行首或紧跟在 { 后）
                if re.match(r'^(?:async\s+)?function\s+\w+', stripped):
                    self.add_issue("EXT.13.15", "禁止在块内声明函数", Severity.ERROR, i,
                                   "在控制流块内使用了函数声明",
                                   "使用函数表达式（const foo = function() {}）或箭头函数")
            # 退出控制块
            if in_control_block and brace_depth <= control_depth:
                in_control_block = False

    # ========== 安全审计 ==========

    def check_hardcoded_secrets(self):
        """SEC.01: 禁止明文硬编码密钥/凭据"""
        secret_patterns = [
            r'\b(?:password|passwd|pwd)\s*[:=]\s*[\'"`]',
            r'\b(?:secret|secretKey|secret_key)\s*[:=]\s*[\'"`]',
            r'\b(?:token|accessToken|access_token|apiToken)\s*[:=]\s*[\'"`]',
            r'\b(?:apiKey|api_key|appKey|app_key)\s*[:=]\s*[\'"`]',
            r'\b(?:accessKey|access_key|privateKey|private_key)\s*[:=]\s*[\'"`]',
            r'\b(?:credential|credentials)\s*[:=]\s*[\'"`]',
            r'\b(?:AUTH|BEARER)\s*[:=]\s*[\'"`]',
        ]
        for i, line in enumerate(self.lines, 1):
            stripped = self._strip_comments(line)
            for pattern in secret_patterns:
                if re.search(pattern, stripped, re.IGNORECASE):
                    # 排除空字符串赋值和环境变量引用
                    if re.search(r'[\'"`]\s*[\'"`]', stripped) or \
                       'process.env' in stripped or \
                       'getSecret' in stripped or \
                       'getCredential' in stripped:
                        continue
                    self.add_issue("SEC.01", "禁止明文硬编码密钥/凭据", Severity.ERROR, i,
                                   "疑似明文硬编码密钥或凭据",
                                   "通过环境变量、KMS 或安全存储运行时获取")
                    break

    def check_console_usage(self):
        """SEC.02: 禁止 console 直接输出"""
        for i, line in enumerate(self.lines, 1):
            stripped = self._strip_comments(line)
            if re.search(r'\bconsole\s*\.\s*(log|warn|error|info|debug|trace|dir|table|time|timeEnd)\s*\(', stripped):
                self.add_issue("SEC.02", "禁止 console 直接输出", Severity.ERROR, i,
                               "使用了 console 直接输出",
                               "使用统一的 Logger 模块（鸿蒙侧用 hilog）")

    def check_test_residual(self):
        """SEC.03: 禁止残留测试/调试代码"""
        # 判断是否为测试文件
        is_test_file = bool(re.search(
            r'(\.test\.|\.spec\.|__tests__|__test__|\.test$|\.spec$|test/|tests/|spec/)',
            self.filepath
        ))
        if is_test_file:
            return  # 测试文件中允许测试代码

        for i, line in enumerate(self.lines, 1):
            stripped = self._strip_comments(line).strip()
            # debugger 语句
            if re.match(r'^debugger\s*;?\s*$', stripped):
                self.add_issue("SEC.03", "禁止残留调试代码", Severity.ERROR, i,
                               "发现 debugger 语句",
                               "删除 debugger 语句")
            # 测试框架函数
            if re.search(r'\b(?:describe|it|test)\s*\(', stripped) and not 'import' in stripped:
                self.add_issue("SEC.03", "禁止残留测试代码", Severity.ERROR, i,
                               "非测试文件中发现测试代码（describe/it/test）",
                               "将测试代码移到 *.test.ts 或 *.spec.ts 文件中")
            # .only / .skip
            if re.search(r'\.(only|skip)\s*\(', stripped):
                self.add_issue("SEC.03", "禁止残留测试代码", Severity.ERROR, i,
                               "发现 .only/.skip 调试标记",
                               "删除 .only/.skip 标记")
            # alert
            if re.search(r'\balert\s*\(', stripped):
                self.add_issue("SEC.03", "禁止残留调试代码", Severity.ERROR, i,
                               "发现 alert() 调用",
                               "删除 alert() 调用")
            # TODO:REMOVE / HACK
            raw = line.strip()
            if re.search(r'(?:TODO|FIXME)\s*:\s*REMOVE', raw, re.IGNORECASE) or \
               re.search(r'\bHACK\b', raw):
                self.add_issue("SEC.03", "禁止残留调试标记", Severity.ERROR, i,
                               "发现 TODO:REMOVE 或 HACK 标记",
                               "处理后删除标记")

    def check_hardcoded_ids(self):
        """SEC.04: 禁止硬编码 URL/UID/ID/Cookie"""
        for i, line in enumerate(self.lines, 1):
            stripped = self._strip_comments(line)
            # UUID 字面量
            if re.search(r'[\'"`][0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[\'"`]',
                         stripped, re.IGNORECASE):
                self.add_issue("SEC.04", "禁止硬编码 UUID", Severity.ERROR, i,
                               "发现硬编码的 UUID",
                               "从配置或运行时获取")
            # cookie/sessionId/deviceId 赋值为字面量 (支持驼峰命名如 sessionCookie)
            if re.search(r'(?:cookie|session[_]?[Ii]d|device[_]?[Ii]d|user[_]?[Ii]d)\s*[:=]\s*[\'"`][^\'"` ]{3,}',
                         stripped, re.IGNORECASE):
                if 'process.env' not in stripped and 'Config' not in stripped:
                    self.add_issue("SEC.04", "禁止硬编码 Cookie/ID", Severity.ERROR, i,
                                   "疑似硬编码了 Cookie 或 ID 值",
                                   "从配置中心或运行时获取")

    def check_file_open_permission(self):
        """SEC.05: 文件操作必须显式设置权限"""
        for i, line in enumerate(self.lines, 1):
            stripped = self._strip_comments(line)
            # fs.openSync(path, flags) — 只有2个参数，缺少 mode
            match = re.search(r'\bfs\s*\.\s*openSync\s*\(\s*[^,]+,\s*[^,)]+\s*\)', stripped)
            if match:
                # 数参数：如果只有2个逗号分隔，缺少 mode
                args = match.group(0)
                if args.count(',') < 2:
                    self.add_issue("SEC.05", "文件操作必须设置权限", Severity.ERROR, i,
                                   "fs.openSync 缺少 mode 参数",
                                   "添加第三个参数，如 fs.openSync(path, flags, 0o640)")
            # fs.writeFileSync 不带 mode
            if re.search(r'\bfs\s*\.\s*writeFileSync\s*\(', stripped):
                if 'mode' not in stripped:
                    self.add_issue("SEC.05", "文件操作必须设置权限", Severity.ERROR, i,
                                   "fs.writeFileSync 未设置 mode",
                                   "在 options 中添加 mode，如 { mode: 0o640 }")
            # fileio.openSync (鸿蒙) — 2个参数
            match = re.search(r'\bfileio\s*\.\s*openSync\s*\(\s*[^,]+,\s*[^,)]+\s*\)', stripped)
            if match:
                if match.group(0).count(',') < 2:
                    self.add_issue("SEC.05", "文件操作必须设置权限（鸿蒙）", Severity.ERROR, i,
                                   "fileio.openSync 缺少 mode 参数",
                                   "添加第三个参数，如 fileio.openSync(path, flags, 0o640)")

    def check_log_level_strings(self):
        """SEC.06: 日志级别必须统一为枚举常量"""
        for i, line in enumerate(self.lines, 1):
            stripped = self._strip_comments(line)
            # logger.log('info', ...) / logger.setLevel('debug') 等裸字符串日志级别
            if re.search(r'\b(?:logger|log)\s*\.\s*(?:log|setLevel|level)\s*\(\s*[\'"](?:debug|info|warn|warning|error|trace|fatal)[\'"]',
                         stripped, re.IGNORECASE):
                self.add_issue("SEC.06", "日志级别必须使用枚举常量", Severity.ERROR, i,
                               "日志级别使用了裸字符串",
                               "定义 LogLevel 枚举，使用 LogLevel.INFO 等常量")

    def check_code_duplication(self):
        """SEC.07: 禁止大段代码重复"""
        # 简化检测：在同一文件内查找连续 N 行完全相同的代码块
        min_dup_lines = 6
        normalized = []
        for line in self.lines:
            n = self._strip_comments(line).strip()
            normalized.append(n if n and n != '{' and n != '}' else '')

        # 滑动窗口查找重复块
        seen_blocks: dict[str, int] = {}
        reported: set[int] = set()
        for i in range(len(normalized) - min_dup_lines + 1):
            block = tuple(normalized[i:i + min_dup_lines])
            # 跳过全空块
            if all(b == '' for b in block):
                continue
            # 至少4行非空
            if sum(1 for b in block if b) < 4:
                continue
            block_key = '\n'.join(block)
            if block_key in seen_blocks:
                first_line = seen_blocks[block_key]
                current_line = i + 1
                if current_line not in reported and first_line not in reported:
                    self.add_issue("SEC.07", "禁止大段代码重复", Severity.ERROR, current_line,
                                   f"第 {current_line}-{current_line + min_dup_lines - 1} 行与第 {first_line}-{first_line + min_dup_lines - 1} 行高度重复",
                                   "提取为公共函数或工具方法")
                    reported.add(current_line)
                    reported.add(first_line)
            else:
                seen_blocks[block_key] = i + 1

    def check_hardcoded_urls(self):
        """SEC.08: 公网地址必须外置到配置"""
        for i, line in enumerate(self.lines, 1):
            stripped = self._strip_comments(line)
            # 匹配 http:// 或 https:// 字面量字符串
            matches = re.finditer(r'[\'"`](https?://[^\'"`\s]+)[\'"`]', stripped)
            for m in matches:
                url = m.group(1)
                # 例外：localhost / 127.0.0.1 / 0.0.0.0
                if re.search(r'localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]', url):
                    continue
                # 例外：纯注释行
                if line.strip().startswith('//') or line.strip().startswith('*'):
                    continue
                # 例外：import 语句（CDN imports 也应配置化，但优先级低）
                self.add_issue("SEC.08", "公网地址必须外置到配置", Severity.ERROR, i,
                               f"代码中硬编码了公网地址: {url[:60]}{'...' if len(url) > 60 else ''}",
                               "将地址提取到配置文件中，代码通过变量引用")

    def check_math_random(self):
        """SEC.09: 使用安全随机数"""
        # 收集函数级上下文：先标记所有含安全关键字的函数
        security_context_lines: set[int] = set()
        security_keywords = ['token', 'secret', 'key', 'salt', 'nonce', 'code', 'otp',
                             'password', 'captcha', 'verify', 'auth', 'encrypt', 'cipher',
                             'hash', 'sign']
        for i, line in enumerate(self.lines, 1):
            lower = line.lower()
            if any(kw in lower for kw in security_keywords):
                # 标记前后 20 行为安全上下文
                for j in range(max(0, i - 20), min(len(self.lines), i + 20)):
                    security_context_lines.add(j + 1)

        for i, line in enumerate(self.lines, 1):
            stripped = self._strip_comments(line)
            if re.search(r'\bMath\s*\.\s*random\s*\(', stripped):
                if i in security_context_lines:
                    self.add_issue("SEC.09", "禁止在安全场景使用 Math.random()", Severity.ERROR, i,
                                   "在安全相关上下文中使用了 Math.random()",
                                   "使用 crypto.randomBytes / crypto.randomUUID / crypto.getRandomValues")
                else:
                    self.add_issue("SEC.09", "建议使用安全随机数替代 Math.random()", Severity.WARN, i,
                                   "使用了 Math.random()，请确认是否涉及安全场景",
                                   "安全场景应使用 crypto.randomBytes / crypto.randomUUID")

    def check_mkdir_permission(self):
        """SEC.10: mkdir 必须设置权限"""
        for i, line in enumerate(self.lines, 1):
            stripped = self._strip_comments(line)
            # fs.mkdirSync(path) / fs.mkdirSync(path, { recursive: true }) 不含 mode
            if re.search(r'\bfs\s*\.\s*(?:mkdirSync|mkdir)\s*\(', stripped):
                if 'mode' not in stripped and not re.search(r',\s*0o\d+', stripped):
                    self.add_issue("SEC.10", "mkdir 必须设置权限", Severity.ERROR, i,
                                   "mkdir 调用未设置 mode 权限",
                                   "添加 mode 参数，如 { recursive: true, mode: 0o750 }")
            # 鸿蒙侧 fileio.mkdirSync
            match = re.search(r'\bfileio\s*\.\s*mkdirSync\s*\(\s*([^)]*)\)', stripped)
            if match:
                args = match.group(1)
                if args.count(',') < 1:  # 只有一个参数
                    self.add_issue("SEC.10", "mkdir 必须设置权限（鸿蒙）", Severity.ERROR, i,
                                   "fileio.mkdirSync 缺少 mode 参数",
                                   "添加第二个参数，如 fileio.mkdirSync(path, 0o750)")

    def check_sql_concatenation(self):
        """SEC.11: 禁止字符串拼接 SQL"""
        sql_keywords = r'(?:SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE\s+TABLE|TRUNCATE|MERGE)'
        for i, line in enumerate(self.lines, 1):
            stripped = self._strip_comments(line)
            # 模板字符串中含 SQL 关键字和 ${...} 插值
            if re.search(rf'`[^`]*\b{sql_keywords}\b[^`]*\$\{{', stripped, re.IGNORECASE):
                self.add_issue("SEC.11", "禁止字符串拼接 SQL", Severity.ERROR, i,
                               "模板字符串中拼接了 SQL 语句",
                               "使用参数化查询（占位符 ? 或命名参数 :param）")
            # 'SELECT ...' + variable 拼接
            if re.search(rf'[\'"][^\'\"]*\b{sql_keywords}\b[^\'\"]*[\'"]\s*\+', stripped, re.IGNORECASE):
                self.add_issue("SEC.11", "禁止字符串拼接 SQL", Severity.ERROR, i,
                               "使用 + 拼接了 SQL 语句",
                               "使用参数化查询（占位符 ? 或命名参数 :param）")
            # + 'SQL...'
            if re.search(rf'\+\s*[\'"][^\'\"]*\b{sql_keywords}\b', stripped, re.IGNORECASE):
                self.add_issue("SEC.11", "禁止字符串拼接 SQL", Severity.ERROR, i,
                               "使用 + 拼接了 SQL 语句",
                               "使用参数化查询（占位符 ? 或命名参数 :param）")

    # ========== 工具方法 ==========

    def _strip_comments(self, line: str) -> str:
        """去除行内注释，但保留字符串内的 // 和 /* */"""
        result = []
        i = 0
        in_single = False
        in_double = False
        in_template = False
        while i < len(line):
            ch = line[i]
            # 处理转义字符
            if i + 1 < len(line) and ch == '\\' and (in_single or in_double or in_template):
                result.append(ch)
                result.append(line[i + 1])
                i += 2
                continue
            # 字符串边界
            if ch == "'" and not in_double and not in_template:
                in_single = not in_single
            elif ch == '"' and not in_single and not in_template:
                in_double = not in_double
            elif ch == '`' and not in_single and not in_double:
                in_template = not in_template
            # 不在字符串内时处理注释
            if not in_single and not in_double and not in_template:
                if ch == '/' and i + 1 < len(line):
                    if line[i + 1] == '/':
                        break  # 行注释，截断后续
                    if line[i + 1] == '*':
                        # 块注释：找到 */
                        end = line.find('*/', i + 2)
                        if end != -1:
                            i = end + 2
                            continue
                        else:
                            break
            result.append(ch)
            i += 1
        return ''.join(result)

    def _extract_paren(self, text: str, start: int) -> Optional[str]:
        """提取括号内容"""
        if start >= len(text) or text[start] != '(':
            return None
        depth = 0
        for i in range(start, len(text)):
            if text[i] == '(':
                depth += 1
            elif text[i] == ')':
                depth -= 1
                if depth == 0:
                    return text[start+1:i]
        return None

    def _extract_bracket(self, text: str, start: int) -> Optional[str]:
        """提取方括号内容"""
        if start >= len(text) or text[start] != '[':
            return None
        depth = 0
        for i in range(start, len(text)):
            if text[i] == '[':
                depth += 1
            elif text[i] == ']':
                depth -= 1
                if depth == 0:
                    return text[start+1:i]
        return None

    def _to_upper_camel(self, name: str) -> str:
        """转换为 UpperCamelCase"""
        parts = re.split(r'[_\-\s]+', name)
        return ''.join(p.capitalize() for p in parts if p)

    def _to_upper_snake(self, name: str) -> str:
        """转换为 UPPER_SNAKE_CASE"""
        s1 = re.sub(r'([A-Z]+)([A-Z][a-z])', r'\1_\2', name)
        s2 = re.sub(r'([a-z\d])([A-Z])', r'\1_\2', s1)
        return s2.upper()


def scan_files(path: str, extensions: tuple = ('.ts', '.js', '.ets', '.tsx', '.jsx')) -> list[str]:
    """递归扫描目录下的 TS/JS 文件"""
    if os.path.isfile(path):
        return [path] if path.endswith(extensions) else []
    files = []
    for root, dirs, filenames in os.walk(path):
        # 跳过 node_modules, .git 等
        dirs[:] = [d for d in dirs if d not in ('node_modules', '.git', 'dist', 'build', 'oh_modules')]
        for f in filenames:
            if f.endswith(extensions):
                files.append(os.path.join(root, f))
    return sorted(files)


def print_report(all_issues: list[Issue], json_output: bool = False):
    """打印检查报告"""
    if json_output:
        print(json.dumps([i.to_dict() for i in all_issues], ensure_ascii=False, indent=2))
        return

    errors = [i for i in all_issues if i.severity == Severity.ERROR]
    warns = [i for i in all_issues if i.severity == Severity.WARN]

    if not all_issues:
        print("✅ 恭喜！未发现任何违规项。")
        return

    # 先输出 ERROR，再输出 WARN
    for issue in errors + warns:
        print(f"\n[{issue.severity.value}] {issue.rule_id} - {issue.rule_name}")
        print(f"  📍 位置: {issue.file}:{issue.line}")
        print(f"  📝 描述: {issue.description}")
        if issue.suggestion:
            print(f"  ✅ 修复建议: {issue.suggestion}")

    print(f"\n{'═' * 40}")
    print(f"  检查汇总")
    print(f"{'═' * 40}")
    total_rules = 61  # 35 原有 + 11 安全审计 + 15 Google/ESLint 补充
    passed = total_rules - len(set(i.rule_id for i in all_issues))
    print(f"  ✅ 通过规则: {max(0, passed)} 条")
    print(f"  🔴 ERROR:   {len(errors)} 条（要求级别违规）")
    print(f"  🟡 WARN:    {len(warns)} 条（建议级别违规）")
    compliance = max(0, (total_rules - len(set(i.rule_id for i in all_issues))) / total_rules * 100)
    print(f"  📊 合规率:  {compliance:.0f}%")
    print(f"{'═' * 40}")


def main():
    parser = argparse.ArgumentParser(
        description='HarmonyOS TS/JS 代码安全检查工具',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='基于《华为鸿蒙 TypeScript/JavaScript 编程规范》'
    )
    parser.add_argument('path', help='要检查的文件或目录路径')
    parser.add_argument('--json', action='store_true', help='以 JSON 格式输出结果')
    parser.add_argument('--severity', choices=['error', 'warn', 'all'], default='all',
                        help='过滤问题级别 (默认: all)')
    args = parser.parse_args()

    files = scan_files(args.path)
    if not files:
        print(f"未找到 TS/JS 文件: {args.path}")
        sys.exit(1)

    all_issues = []
    for filepath in files:
        checker = HarmonyChecker(filepath)
        issues = checker.check_all()

        if args.severity == 'error':
            issues = [i for i in issues if i.severity == Severity.ERROR]
        elif args.severity == 'warn':
            issues = [i for i in issues if i.severity == Severity.WARN]

        all_issues.extend(issues)

    print_report(all_issues, args.json)

    # 有 ERROR 时返回非零退出码
    if any(i.severity == Severity.ERROR for i in all_issues):
        sys.exit(1)


if __name__ == '__main__':
    main()
