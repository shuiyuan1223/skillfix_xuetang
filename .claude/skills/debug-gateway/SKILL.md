---
name: debug-gateway
description: Use when debugging the Gateway server - WebSocket issues, A2UI rendering problems, page not loading, action handlers not working.
---

# Debug PHA Gateway

## Quick Diagnosis

### Server not starting?
```bash
bun run build          # Rebuild
pha start              # Start server
curl localhost:8000/health  # Should return {"status":"ok"}
```

### Page not rendering?

1. Check `handleNavigate()` in `src/gateway/server.ts` — is there a `case` for your view?
2. Check `generateSidebar()` in `src/gateway/pages.ts` — is nav item added?
3. Check page generator returns valid `A2UIMessage` — `ui.build(root)` called?
4. Check imports — is `generateXxxPage` imported in `server.ts`?

### Button/action not working?

1. Check `handleAction()` in `server.ts` — is there a handler for your `action` string?
2. Check button `action` string matches exactly (case-sensitive)
3. Check `payload` — does it contain expected fields?
4. Check the action handler calls `await this.handleNavigate()` to refresh UI after changes

### Icon showing as emoji?

1. Check `pages.ts` — is `icon` using a name (e.g. `"heart"`) or emoji (e.g. `"❤️"`)?
2. Check `ui/src/main.ts` `ICONS` object — does the icon name exist?
3. If new icon needed: add SVG to `ICONS`, add emoji mapping to `EMOJI_TO_ICON`

### Chat not updating?

1. Check `sendChatUpdate()` — is `this.currentView === "chat"` true?
2. Check `handleAgentEvent()` — are events being processed?
3. Check agent creation — `this.getAgent()` returns valid agent?

## Data Flow

```
Client WebSocket Message
  → GatewaySession.handleMessage()
    → handleInit() / handleNavigate() / handleUserMessage() / handleAction()
      → generateXxxPage() / agent.chat()
        → send(JSON) → WebSocket → Frontend renders
```

## Logging

- Server logs: `console.log("[Tag] message")`
- Agent events: Logged in `handleAgentEvent()`
- LLM API calls: Logged by `installFetchInterceptor()`

## Common Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| Blank page | Missing `case` in handleNavigate | Add route case |
| "Using toolName..." in chat | No custom label in handleAgentEvent | Add to `memoryToolLabels` |
| Type error on build | i18n key missing | Add to `types.ts` + both locale files |
| Icon renders as text | Icon name not in ICONS object | Add SVG to `ui/src/main.ts` |
| Action does nothing | No handler in handleAction | Add `else if` branch |
