# 侧边栏收起 + 丰富动效设计

## 概述

为 PHA Web UI 添加侧边栏收起功能和丰富的动效系统，提升科技感和用户体验。

## 1. 侧边栏收起机制

### 状态管理
- `collapsed: boolean` 状态控制侧边栏宽度
- 展开时 280px，收起时 68px（图标 + padding）
- 状态持久化到 localStorage

### 布局变化
```
展开状态:                    收起状态:
┌──────────┬─────────┐      ┌────┬──────────────┐
│ 🏥 PHA   │         │      │ 🏥 │              │
│          │         │      │    │              │
│ 💬 Chat  │  Main   │  →   │ 💬 │    Main      │
│ ❤️ Health│         │      │ ❤️ │              │
│ 🌙 Sleep │         │      │ 🌙 │              │
│          │         │      │    │              │
│ [<<]     │         │      │[>>]│              │
└──────────┴─────────┘      └────┴──────────────┘
```

### 折叠按钮
- 位置：侧边栏底部 footer 区域
- 图标：`«` 收起 / `»` 展开
- hover 时有发光效果

### 过渡动画
- `transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1)`
- 文字标签淡出（收起时 opacity → 0），图标保持
- Logo 文字 "PHA" 收起时隐藏，只显示图标

## 2. 页面切换与卡片动效

### 页面切换淡入淡出
- 切换 view 时，main surface 内容 `opacity: 0 → 1`，`translateY: 10px → 0`
- 持续时间 300ms，ease-out 缓动
- 新内容从下方轻微滑入

### 卡片入场动画（依次出现）
```css
.a2ui-stat-card:nth-child(1) { animation-delay: 0ms; }
.a2ui-stat-card:nth-child(2) { animation-delay: 100ms; }
.a2ui-stat-card:nth-child(3) { animation-delay: 200ms; }

@keyframes cardEntrance {
  from { opacity: 0; transform: translateY(20px) scale(0.95); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
```

### 数字滚动动效
- stat_card 的数值使用 CSS counter 或 JS 实现滚动
- 从 0 滚动到目标值，持续 800ms
- 使用 ease-out 让结尾减速

### 导航项 hover 增强
- hover 时左侧出现 3px 的渐变光条
- 背景有微妙的发光扩散
- 图标轻微放大 `scale(1.1)`

## 3. 背景粒子与图表动画

### 背景流动效果
- 使用 CSS 渐变动画（不用 Canvas，性能更好）
- 两层渐变光斑缓慢移动，营造科技感
- 周期 20s，非常缓慢，不分散注意力
- 网格线保持静态，光斑在其上流动

### 图表绘制动画
- **折线图**：SVG stroke-dasharray 动画，线条从左到右"画出"
- **柱状图**：每根柱子从底部生长，依次延迟 50ms

### 骨架屏脉冲增强
- shimmer 效果加快到 1s 周期
- 添加微弱的发光边缘

## 实施文件

- `packages/web/src/main.ts` - 所有 UI 和动效代码
