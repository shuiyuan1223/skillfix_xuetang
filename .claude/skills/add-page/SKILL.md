---
name: add-page
description: Use when adding a new page/view to the PHA web UI. Covers A2UI page generation, routing, sidebar nav, and i18n.
---

# Add New Page to PHA

## Checklist

Follow these steps **in order**. Do NOT skip any step.

### 1. i18n Types & Translations

- [ ] `src/locales/types.ts` — Add `nav.xxx` to nav section, add new section if needed
- [ ] `src/locales/zh-CN.ts` — Add Chinese translations
- [ ] `src/locales/en.ts` — Add English translations

### 2. Page Generator

- [ ] `src/gateway/pages.ts` — Create `generateXxxPage(data)` function
- [ ] Use `A2UIGenerator` to build component tree
- [ ] Use `t("xxx.yyy")` for all user-facing text (NO hardcoded strings)
- [ ] Use icon NAMES (e.g. `"heart"`, `"brain"`), **NEVER emoji** for `icon` properties
- [ ] Available icons listed in CLAUDE.md. Need new icon? Add SVG to `ui/src/main.ts` ICONS object

### 3. Sidebar Navigation

- [ ] `src/gateway/pages.ts` — In `generateSidebar()`, add nav item:
  ```typescript
  { id: "xxx", label: t("nav.xxx"), icon: "icon-name" }
  ```
- [ ] Main pages go in first `ui.nav()`, settings pages go in second `ui.nav()`

### 4. Route Handler

- [ ] `src/gateway/server.ts` — In `handleNavigate()`, add `case "xxx":` before `default:`
- [ ] Fetch data, call `generateXxxPage(data)`, assign to `mainPage`
- [ ] Add import for `generateXxxPage` at top of file

### 5. Action Handlers (if page has interactive elements)

- [ ] `src/gateway/server.ts` — In `handleAction()`, add handlers for buttons/forms
- [ ] Add any session state fields to `GatewaySession` class
- [ ] Pattern: `else if (action === "xxx_action" && payload?.field) { ... }`

### 6. Verify

```bash
bun run check   # Types pass
bun test         # Tests pass
bun run build    # Build succeeds
```

## Architecture Rules

- **Frontend is a pure renderer** — All UI generated server-side via A2UI
- **No frontend changes needed** if existing A2UI components suffice
- Available components: `text`, `card`, `column`, `row`, `grid`, `chart`, `stat_card`, `data_table`, `table`, `button`, `form`, `form_input`, `badge`, `progress`, `collapsible`, `code_editor`, `tabs`, `score_gauge`, `modal`
