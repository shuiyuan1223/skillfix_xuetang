---
name: debug-chrome-mcp
description: Use when debugging PHA with Chrome DevTools MCP. Covers how to get the user UID, construct the correct URL with ?uid= parameter, and use Chrome MCP tools to inspect pages.
---

# Debug PHA with Chrome DevTools MCP

## Prerequisites

1. PHA Gateway is running: `pha start`
2. Chrome DevTools MCP server is connected

## Get User UID

PHA pages require a `?uid=xxx` URL parameter to load user-specific data (health data, chat history, etc). Without it, the page shows the auth/login screen.

```bash
# Get the default authenticated user's UID
pha get uid

# List all known users
pha get uid --all
```

Copy the output and append it to the URL as `?uid=<uid>`.

## Open PHA in Chrome MCP

```
# Main chat page (most common)
http://localhost:8000?uid=<uid>

# Specific pages via hash navigation (handled by A2UI)
http://localhost:8000?uid=<uid>
```

### Step-by-step

1. Run `pha get uid` to get the UID
2. Use `navigate_page` to open `http://localhost:8000?uid=<UID>`
3. Wait for the page to load, then use `take_snapshot` to inspect the DOM
4. Use `click`, `fill`, `take_screenshot` etc. to interact

## Common Debugging Scenarios

### Inspect a page

```
1. navigate_page → http://localhost:8000?uid=<UID>
2. take_snapshot → see the A2UI rendered components
3. take_screenshot → visual check
```

### Test chat flow

```
1. navigate_page → http://localhost:8000?uid=<UID>
2. take_snapshot → find the chat input element
3. fill → type a message into the input
4. click → press the send button
5. wait_for → wait for response text to appear
6. take_snapshot → check the agent's response
```

### Navigate to other pages

After loading with `?uid=`, use the sidebar navigation:

```
1. take_snapshot → find sidebar nav items
2. click → click the desired nav item (e.g., "Dashboard", "Settings")
3. take_snapshot → inspect the new page
```

### Check network requests

```
1. list_network_requests → see all API calls
2. get_network_request → inspect specific request/response
```

### Check console errors

```
1. list_console_messages → see all console output
2. Filter by types: ["error", "warn"] to find issues
```

## Important Notes

- **Always include `?uid=`** in the URL. Without it, PHA shows the login/auth page instead of the actual app.
- The UID is NOT a short ID. It's typically a long string like `MDEjZL9EvxOnbu9c3MAfqYNE8YXibDfqs0nJzFibpjlVlIeA` (Huawei user ID) or a UUID like `a755451c-938e-4cea-b7a6-b66b205949cf`.
- If the page shows "Connect Huawei Health" (auth page), the UID is missing or the user is not authenticated.
- The Gateway runs on port 8000 by default. Check with `pha status` if unsure.
