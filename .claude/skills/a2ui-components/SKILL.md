---
name: a2ui-components
description: Reference for A2UI component API. Use when building pages or UI features to know what components exist and how to use them.
---

# A2UI Component Reference

## Architecture

```
Backend (pages.ts)           Frontend (main.ts)
A2UIGenerator.build() ──→ WebSocket JSON ──→ Pure Renderer
```

**All UI is server-generated.** Frontend never contains business logic.

## A2UIGenerator API

```typescript
const ui = new A2UIGenerator("main"); // surface: "main" | "sidebar" | "modal" | "toast"
```

### Layout

| Method | Usage |
|--------|-------|
| `ui.column(children, { gap, padding, align })` | Vertical stack |
| `ui.row(children, { gap, justify, align, wrap })` | Horizontal stack |
| `ui.grid(children, { columns, gap })` | Grid layout |
| `ui.card(children, { title, padding })` | Card container |

### Content

| Method | Usage |
|--------|-------|
| `ui.text(text, variant)` | Text. variant: `"h1"│"h2"│"h3"│"body"│"caption"│"label"` |
| `ui.statCard({ title, value, subtitle, icon, trend, color })` | Stat card with icon |
| `ui.chart({ chartType, data, xKey, yKey, height, color })` | Chart. type: `"line"│"bar"│"area"│"pie"` |
| `ui.table(columns, rows)` | Simple table |
| `ui.dataTable(columns, rows, { pagination, onRowClick })` | Rich table with sorting/pagination |
| `ui.badge(text, { variant })` | Badge. variant: `"default"│"success"│"warning"│"error"│"info"` |
| `ui.progress(value, { maxValue, label, color })` | Progress bar |
| `ui.scoreGauge(value, { label, max, size })` | Score gauge |
| `ui.codeEditor(value, { language, readonly, height })` | Code/markdown editor |
| `ui.collapsible(title, children, { icon, expanded })` | Collapsible section |

### Interactive

| Method | Usage |
|--------|-------|
| `ui.button(label, action, { variant, size, payload })` | Button → triggers `handleAction(action, payload)` |
| `ui.formInput(name, inputType, { label, placeholder, required, options })` | Input field |
| `ui.form(children, onSubmit, { submitLabel, cancelLabel })` | Form wrapper |
| `ui.nav(items, { activeId })` | Navigation list |
| `ui.tabs(tabs, activeTab, contentIds)` | Tab panels |
| `ui.modal(title, children, { size })` | Modal dialog |

### Building

```typescript
const root = ui.column([child1, child2], { gap: 24, padding: 24 });
return ui.build(root); // Returns A2UIMessage
```

## Icon Rules

**MUST use icon names, NEVER emoji.** Full list in CLAUDE.md.

```typescript
// CORRECT
icon: "heart"
icon: "brain"

// WRONG - will render as raw emoji
icon: "❤️"
icon: "🧠"
```

## i18n Rules

**All user-facing text MUST use `t()` function.**

```typescript
import { t } from "../locales/index.js";

ui.text(t("health.title"), "h2");      // CORRECT
ui.text("Health Overview", "h2");       // WRONG
```

Update 3 files: `types.ts`, `zh-CN.ts`, `en.ts` in `src/locales/`.

## Page Assembly Pattern

```typescript
export function generateXxxPage(data: { ... }): A2UIMessage {
  const ui = new A2UIGenerator("main");

  // 1. Header
  const title = ui.text(t("xxx.title"), "h2");
  const subtitle = ui.text(t("xxx.subtitle"), "caption");
  const header = ui.column([title, subtitle], { gap: 4, padding: 24 });

  // 2. Content
  const content = ui.column([...], { gap: 24, padding: 24 });

  // 3. Root
  const root = ui.column([header, content], { gap: 0 });
  return ui.build(root);
}
```

## Sending to Frontend

```typescript
// Full page (sidebar + main)
import { generatePage } from "./pages.js";
send(generatePage("viewName", mainContent));

// Update single surface
send({ type: "a2ui", surface_id: "main", components, root_id });

// Show modal
send({ type: "a2ui", surface_id: "modal", components, root_id });

// Show toast
const toast = generateToast("message", "success");
send({ type: "a2ui", surface_id: "toast", ...toast });

// Close modal
send({ type: "clear_surface", surface_id: "modal" });
```
