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
3. Check page generator returns valid `A2UISurfaceData` — `ui.build(root)` called?
4. Check imports — is `generateXxxPage` imported in `server.ts`?

### Button/action not working?

1. Check `handleAction()` in `server.ts` — is there a handler for your `action` string?
2. Check button `action` string matches exactly (case-sensitive)
3. Check `payload` — does it contain expected fields?
4. Check the action handler calls `await this.handleNavigate()` to refresh UI after changes

### Icon showing as emoji?

1. Check `pages.ts` — is `icon` using a name (e.g. `"heart"`) or emoji (e.g. `"❤️"`)?
2. Check `ui/src/lib/icons.tsx` `ICONS` object — does the icon name exist?
3. If new icon needed: add SVG to `ICONS` in `icons.tsx`

### Chat not working (SSE mode)?

1. **SSE endpoint**: `POST /api/ag-ui` — test with curl:
   ```bash
   curl -X POST http://localhost:8000/api/ag-ui \
     -H "Content-Type: application/json" \
     -d '{"messages":[{"role":"user","content":"hello"}]}' \
     --no-buffer
   ```
2. **Check `_sseMode`**: If `true`, a chat request is already in flight. The server rejects concurrent SSE requests with `_chatLock`.
3. **Check `_chatLock`**: If stuck `true`, the previous SSE stream didn't close cleanly. Look for errors in `pha logs -f`.
4. **SSE events not arriving?**: Check that the response has `Content-Type: text/event-stream` and `Cache-Control: no-cache`.
5. **Stream closes immediately?**: Check agent creation — `this.getAgent()` returns valid agent? Check LLM API key in `.pha/config.json`.

### Chat not updating (WebSocket fallback)?

1. Check `sendChatUpdate()` — is `this.currentView === "chat"` true?
2. Check `handleAgentEvent()` — are events being processed?
3. Check agent creation — `this.getAgent()` returns valid agent?

### WebSocket reconnection issues?

1. Frontend auto-reconnects on disconnect. Check browser console for WebSocket errors.
2. Check `pha status` — is the server actually running?
3. Check port conflicts — is another process using port 8000?
4. After reconnect, frontend re-sends `init` message to get fresh A2UI state.

## Data Flow

### WebSocket (pages, navigation, actions)
```
Client WebSocket Message
  → GatewaySession.handleMessage()
    → handleInit() / handleNavigate() / handleUserMessage() / handleAction()
      → generateXxxPage() / agent.chat()
        → send(JSON) → WebSocket → Frontend renders
```

### SSE (chat streaming)
```
Client POST /api/ag-ui
  → GatewaySession.handleChatSSE(message, writer, encoder)
    → agent.chat() with streaming callback
      → SSE events: RunStarted → TextMessageContent* → ToolCallStart/End → RunFinished
        → writer.write(encoder.encode("data: {json}\n\n"))
```

## Logging

- Server logs: `console.log("[Tag] message")`
- Agent events: Logged in `handleAgentEvent()`
- LLM API calls: Logged by `installFetchInterceptor()`
- View logs in real-time: `pha logs -f`

## Common Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| Blank page | Missing `case` in handleNavigate | Add route case |
| "Using toolName..." in chat | No custom label in TOOL_DISPLAY_NAMES | Add to `A2UIRenderer.tsx` |
| Type error on build | i18n key missing | Add to `types.ts` + both locale files |
| Icon renders as text | Icon name not in ICONS object | Add SVG to `ui/src/lib/icons.tsx` |
| Action does nothing | No handler in handleAction | Add `else if` branch |
| SSE hangs | `_chatLock` stuck true | Restart server (`pha restart`) |
| Chat duplicates | SSE + WebSocket both sending messages | Check `_sseMode` flag |
| CORS error on SSE | Missing CORS headers | Check server CORS config for `/api/ag-ui` |
