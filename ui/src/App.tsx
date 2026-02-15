import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { A2UISurfaceData, WSMessage, PlotlyChart, AGUIEvent, MessagePart, QuickReply } from "./lib/types";
import { generateUUID } from "./lib/utils";
import { ICONS } from "./lib/icons";
import { i18n } from "./lib/i18n";
import { A2UIRenderer } from "./components/a2ui/A2UIRenderer";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getUserUuid(): string {
  // Check URL query param first (for debugging: ?uuid=xxx)
  const urlParams = new URLSearchParams(window.location.search);
  const urlUuid = urlParams.get("uuid");
  if (urlUuid) {
    const expires = new Date();
    expires.setFullYear(expires.getFullYear() + 1);
    document.cookie = `pha_user_id=${urlUuid}; expires=${expires.toUTCString()}; path=/; SameSite=Strict`;
    return urlUuid;
  }

  // Check cookie
  const cookies = document.cookie.split(";");
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split("=");
    if (name === "pha_user_id" && value) {
      return value;
    }
  }

  // Generate new UUID and save to cookie
  const uuid = generateUUID();
  const expires = new Date();
  expires.setFullYear(expires.getFullYear() + 1);
  document.cookie = `pha_user_id=${uuid}; expires=${expires.toUTCString()}; path=/; SameSite=Strict`;
  return uuid;
}

// ---------------------------------------------------------------------------
// App Component
// ---------------------------------------------------------------------------

export function App() {
  // --- State ---------------------------------------------------------------
  const [connected, setConnected] = useState(false);
  const [sidebarData, setSidebarData] = useState<A2UISurfaceData | null>(null);
  const [mainData, setMainData] = useState<A2UISurfaceData | null>(null);
  const [modalData, setModalData] = useState<A2UISurfaceData | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [toastData, setToastData] = useState<A2UISurfaceData | null>(null);
  const [toastExiting, setToastExiting] = useState(false);
  const [progressData, setProgressData] = useState<A2UISurfaceData | null>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [mobileSidebarVisible, setMobileSidebarVisible] = useState(false);
  const [pageKey, setPageKey] = useState(0);
  const [darkMode, setDarkMode] = useState(false);

  // --- AG-UI SSE Chat State ------------------------------------------------
  interface ChatMessage {
    id: string;
    role: "user" | "assistant";
    parts: MessagePart[];
  }
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatStreaming, setChatStreaming] = useState(false);
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const activeMessageRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const chatInitializedRef = useRef(false);

  // --- Refs ----------------------------------------------------------------
  const wsRef = useRef<WebSocket | null>(null);
  const userUuidRef = useRef<string | null>(null);
  const chatAutoScrollRef = useRef(true);
  const isAutoScrollingRef = useRef(false);
  const pendingPlotlyChartsRef = useRef<PlotlyChart[]>([]);
  const extensionDetectedRef = useRef(false);
  const mainDataRef = useRef<A2UISurfaceData | null>(null);

  // Keep mainDataRef in sync with mainData state
  mainDataRef.current = mainData;

  // Keep a ref to the latest mainData so the scroll container ref callback
  // can reference it without stale closures.
  const mainContentRef = useRef<HTMLDivElement | null>(null);

  // ---------------------------------------------------------------------------
  // OAuth helpers (stable across renders via useCallback + refs)
  // ---------------------------------------------------------------------------

  const checkExtension = useCallback((): Promise<boolean> => {
    return new Promise((resolve) => {
      console.log("[OAuth] Checking for extension...");

      const timeout = setTimeout(() => {
        console.log("[OAuth] Extension check timed out");
        window.removeEventListener("message", handler);
        resolve(false);
      }, 2000);

      const handler = (event: MessageEvent) => {
        if (event.data?.type?.startsWith("PHA_")) {
          console.log("[OAuth] Received message:", event.data.type, event.data);
        }
        if (
          event.data?.type === "PHA_EXTENSION_READY" ||
          event.data?.type === "PHA_EXTENSION_STATUS"
        ) {
          clearTimeout(timeout);
          window.removeEventListener("message", handler);
          extensionDetectedRef.current = true;
          console.log("[OAuth] Extension detected, version:", event.data.version);
          resolve(true);
        }
      };

      window.addEventListener("message", handler);
      window.postMessage({ type: "PHA_CHECK_EXTENSION" }, "*");
    });
  }, []);

  const requestExtensionOAuth = useCallback(
    (authUrl: string): Promise<{ success: boolean; code?: string; error?: string }> => {
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          window.removeEventListener("message", handler);
          resolve({ success: false, error: "OAuth timeout" });
        }, 180000); // 3 minute timeout

        const handler = (event: MessageEvent) => {
          if (event.data?.type === "PHA_OAUTH_RESULT") {
            clearTimeout(timeout);
            window.removeEventListener("message", handler);
            resolve(event.data);
          }
        };

        window.addEventListener("message", handler);
        window.postMessage({ type: "PHA_OAUTH_START", authUrl }, "*");
      });
    },
    [],
  );

  // We define sendAction early so OAuth helpers can reference it.  Because
  // sendAction itself depends on wsRef (a ref, stable), there is no circular
  // dependency issue -- we just need to forward-declare it before the OAuth
  // functions that call it.

  const sendActionRaw = useCallback(
    (action: string, payload?: Record<string, unknown>) => {
      wsRef.current?.send(JSON.stringify({ type: "action", action, payload }));
    },
    [],
  );

  // ---------------------------------------------------------------------------
  // AG-UI SSE Chat
  // ---------------------------------------------------------------------------

  const handleAGUIEvent = useCallback((event: AGUIEvent) => {
    switch (event.type) {
      case "TextMessageStart": {
        const msg: ChatMessage = { id: event.messageId, role: "assistant", parts: [] };
        activeMessageRef.current = event.messageId;
        setChatMessages((prev) => [...prev, msg]);
        break;
      }
      case "TextMessageContent": {
        setChatMessages((prev) => {
          const msgs = [...prev];
          const last = msgs[msgs.length - 1];
          if (last && last.id === event.messageId) {
            const updated = { ...last, parts: [...last.parts] };
            const lastPart = updated.parts[updated.parts.length - 1];
            if (lastPart && lastPart.type === "text") {
              updated.parts[updated.parts.length - 1] = { ...lastPart, content: lastPart.content + event.delta };
            } else {
              updated.parts.push({ type: "text", content: event.delta });
            }
            msgs[msgs.length - 1] = updated;
          }
          return msgs;
        });
        break;
      }
      case "TextMessageEnd": {
        // No-op: text is already accumulated
        break;
      }
      case "ToolCallStart": {
        setChatMessages((prev) => {
          const msgs = [...prev];
          const last = msgs[msgs.length - 1];
          if (last && last.role === "assistant") {
            const updated = { ...last, parts: [...last.parts] };
            // Remove empty trailing text part before tool_use
            const lastP = updated.parts[updated.parts.length - 1];
            if (lastP && lastP.type === "text" && !lastP.content.trim()) {
              updated.parts.pop();
            }
            updated.parts.push({
              type: "tool_use",
              toolCallId: event.toolCallId,
              toolName: event.toolCallName,
              status: "running" as const,
            });
            msgs[msgs.length - 1] = updated;
          }
          return msgs;
        });
        break;
      }
      case "ToolCallEnd": {
        setChatMessages((prev) => {
          const msgs = [...prev];
          const last = msgs[msgs.length - 1];
          if (last && last.role === "assistant") {
            const updated = { ...last, parts: last.parts.map((p) => {
              if (p.type === "tool_use" && p.toolCallId === event.toolCallId) {
                return { ...p, status: "completed" as const };
              }
              return p;
            })};
            msgs[msgs.length - 1] = updated;
          }
          return msgs;
        });
        break;
      }
      case "ToolCallResult": {
        setChatMessages((prev) => {
          const msgs = [...prev];
          const last = msgs[msgs.length - 1];
          if (last && last.role === "assistant" && event.cards) {
            const updated = { ...last, parts: [...last.parts] };
            updated.parts.push({
              type: "tool_result",
              toolCallId: event.toolCallId,
              cards: event.cards,
            });
            // Add empty text part for next text stream
            updated.parts.push({ type: "text", content: "" });
            msgs[msgs.length - 1] = updated;
          }
          return msgs;
        });
        break;
      }
      case "RunFinished": {
        setChatStreaming(false);
        activeMessageRef.current = null;
        break;
      }
      case "Custom": {
        if (event.name === "QuickReplies") {
          setQuickReplies(event.data as QuickReply[]);
        }
        break;
      }
    }
  }, []);

  const sendChatMessage = useCallback((content: string) => {
    // Optimistic: add user message
    const userMsg: ChatMessage = {
      id: generateUUID(),
      role: "user",
      parts: [{ type: "text", content }],
    };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatStreaming(true);
    setQuickReplies([]);
    chatAutoScrollRef.current = true;

    // Abort previous if still running
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const uuid = userUuidRef.current || "anonymous";

    fetch("/api/ag-ui", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify({ thread_id: uuid, messages: [{ role: "user", content }] }),
      signal: controller.signal,
    }).then(async (res) => {
      if (!res.ok || !res.body) {
        setChatStreaming(false);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Parse SSE lines
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // keep incomplete line
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const event = JSON.parse(line.slice(6)) as AGUIEvent;
              handleAGUIEvent(event);
            } catch {
              // skip malformed
            }
          }
        }
      }

      // Process remaining buffer
      if (buffer.startsWith("data: ")) {
        try {
          const event = JSON.parse(buffer.slice(6)) as AGUIEvent;
          handleAGUIEvent(event);
        } catch { /* skip */ }
      }

      setChatStreaming(false);
      activeMessageRef.current = null;
    }).catch((err) => {
      if (err.name !== "AbortError") {
        console.error("[SSE] Chat error:", err);
      }
      setChatStreaming(false);
      activeMessageRef.current = null;
    });
  }, [handleAGUIEvent]);

  const startOAuthWithExtension = useCallback(async () => {
    console.log("[OAuth] Using browser extension flow...");

    wsRef.current?.send(
      JSON.stringify({
        type: "action",
        action: "show_toast",
        payload: { message: "Opening authorization page...", variant: "info" },
      }),
    );

    try {
      const urlResponse = await fetch(
        `/auth/huawei/get-auth-url?uuid=${encodeURIComponent(userUuidRef.current!)}`,
      );
      if (!urlResponse.ok) {
        const text = await urlResponse.text();
        console.error("[OAuth] get-auth-url failed:", urlResponse.status, text.slice(0, 200));
        throw new Error(`Server error: ${urlResponse.status}`);
      }

      const urlData = await urlResponse.json();
      if (urlData.error) throw new Error(urlData.error);
      if (!urlData.authUrl) throw new Error("No auth URL returned");

      console.log("[OAuth] Got auth URL, requesting extension...");
      const result = await requestExtensionOAuth(urlData.authUrl);
      console.log("[OAuth] Extension result:", result);

      if (result.success && result.code) {
        const exchangeResponse = await fetch("/auth/huawei/exchange", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: result.code, uuid: userUuidRef.current }),
        });
        if (!exchangeResponse.ok) {
          const text = await exchangeResponse.text();
          console.error("[OAuth] exchange failed:", exchangeResponse.status, text.slice(0, 200));
          throw new Error(`Exchange failed: ${exchangeResponse.status}`);
        }
        const exchangeResult = await exchangeResponse.json();
        if (exchangeResult.success) {
          console.log("[OAuth] Authentication successful!");
          sendActionRaw("auth_complete");
        } else {
          throw new Error(exchangeResult.error || "Failed to exchange code");
        }
      } else {
        throw new Error(result.error || "Extension OAuth failed");
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("[OAuth] Extension flow failed:", message);
      wsRef.current?.send(
        JSON.stringify({
          type: "action",
          action: "show_toast",
          payload: { message: `Authentication failed: ${message}`, variant: "error" },
        }),
      );
    }
  }, [requestExtensionOAuth, sendActionRaw]);

  const startOAuthWithMCP = useCallback(async () => {
    console.log("[OAuth] Using Chrome MCP flow...");

    wsRef.current?.send(
      JSON.stringify({
        type: "action",
        action: "show_toast",
        payload: { message: "Launching browser for authentication...", variant: "info" },
      }),
    );

    try {
      const response = await fetch("/auth/huawei/mcp-flow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uuid: userUuidRef.current }),
      });
      if (!response.ok) {
        const text = await response.text();
        console.error("[OAuth] MCP flow request failed:", response.status, text.slice(0, 200));
        throw new Error(`Server error: ${response.status}`);
      }
      const result = await response.json();
      if (result.success) {
        console.log("[OAuth] Authentication successful!");
        sendActionRaw("auth_complete");
      } else {
        console.error("[OAuth] MCP flow failed:", result.error);
        if (
          result.error?.includes("MCP") ||
          result.error?.includes("chrome") ||
          result.error?.includes("spawn")
        ) {
          wsRef.current?.send(
            JSON.stringify({
              type: "action",
              action: "show_toast",
              payload: {
                message: "Please install PHA browser extension for authentication",
                variant: "warning",
              },
            }),
          );
        } else {
          wsRef.current?.send(
            JSON.stringify({
              type: "action",
              action: "show_toast",
              payload: {
                message: `Authentication failed: ${result.error}`,
                variant: "error",
              },
            }),
          );
        }
      }
    } catch (e) {
      console.error("[OAuth] Request failed:", e);
      wsRef.current?.send(
        JSON.stringify({
          type: "action",
          action: "show_toast",
          payload: {
            message: "Failed to start authentication. Please install PHA extension.",
            variant: "error",
          },
        }),
      );
    }
  }, [sendActionRaw]);

  const startHuaweiAuth = useCallback(async () => {
    userUuidRef.current = getUserUuid();
    console.log("[OAuth] Starting authentication...");
    const hasExtension = await checkExtension();
    if (hasExtension) {
      await startOAuthWithExtension();
    } else {
      await startOAuthWithMCP();
    }
  }, [checkExtension, startOAuthWithExtension, startOAuthWithMCP]);

  // ---------------------------------------------------------------------------
  // Core actions
  // ---------------------------------------------------------------------------

  const sendAction = useCallback(
    (action: string, payload?: Record<string, unknown>) => {
      // Handle OAuth actions locally
      if (action === "start_huawei_auth") {
        // Also notify server so it can clear scope error cache
        wsRef.current?.send(JSON.stringify({ type: "action", action, payload }));
        startHuaweiAuth();
        return;
      }

      // Handle copy/download config locally on the frontend
      if (action === "settings_copy_config" || action === "settings_download_config") {
        // Find the code_editor component in current main data to get raw config
        const mainDataSnap = mainDataRef.current;
        const editorComp = mainDataSnap?.components.find((c: any) => c.type === "code_editor" && c.readonly);
        const configJson = (editorComp as any)?.value || "{}";
        if (action === "settings_copy_config") {
          navigator.clipboard.writeText(configJson).then(() => {
            wsRef.current?.send(JSON.stringify({ type: "action", action: "show_toast", payload: { message: "Copied!", variant: "success" } }));
          }).catch(() => {
            wsRef.current?.send(JSON.stringify({ type: "action", action: "show_toast", payload: { message: "Copy failed", variant: "error" } }));
          });
        } else {
          const blob = new Blob([configJson], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "config.json";
          a.click();
          URL.revokeObjectURL(url);
        }
        return;
      }

      // Reset auto-scroll when user sends a message
      if (
        action === "send_message" ||
        action === "sa_send_message" ||
        action === "evo_send_message" ||
        action === "pg_send_message"
      ) {
        chatAutoScrollRef.current = true;
      }

      // Route main chat messages through SSE
      if (action === "send_message" && payload?.content) {
        sendChatMessage(String(payload.content));
        return;
      }

      // Stop generation: abort SSE fetch
      if (action === "stop_generation") {
        abortControllerRef.current?.abort();
        setChatStreaming(false);
        activeMessageRef.current = null;
        // Also notify server
        wsRef.current?.send(JSON.stringify({ type: "action", action, payload }));
        return;
      }

      wsRef.current?.send(JSON.stringify({ type: "action", action, payload }));
    },
    [startHuaweiAuth, sendChatMessage],
  );

  const sendNavigate = useCallback((view: string) => {
    setPageKey((k) => k + 1);

    // Close mobile sidebar with animation
    setMobileSidebarOpen((open) => {
      if (open) {
        setMobileSidebarVisible(false);
        setTimeout(() => {
          setMobileSidebarOpen(false);
        }, 250);
      }
      return open; // don't change yet if closing -- the timeout handles it
    });

    // Scroll main content to top on navigation
    if (mainContentRef.current) {
      mainContentRef.current.scrollTop = 0;
    }

    wsRef.current?.send(JSON.stringify({ type: "navigate", view }));
  }, []);

  // ---------------------------------------------------------------------------
  // Modal / Toast / Sidebar toggles
  // ---------------------------------------------------------------------------

  const closeModal = useCallback(() => {
    setModalVisible(false);
    setTimeout(() => {
      setModalData(null);
    }, 250);
  }, []);

  const toggleTheme = useCallback(() => {
    setDarkMode((prev) => {
      const next = !prev;
      localStorage.setItem("pha-dark-mode", String(next));
      document.documentElement.classList.toggle("dark", next);
      document.documentElement.classList.toggle("light", !next);
      return next;
    });
  }, []);


  const toggleMobileSidebar = useCallback(() => {
    setMobileSidebarOpen((open) => {
      if (open) {
        // Close with exit animation
        setMobileSidebarVisible(false);
        setTimeout(() => {
          setMobileSidebarOpen(false);
        }, 250);
        return open; // stays true until timeout fires
      } else {
        // Open with enter animation
        requestAnimationFrame(() => {
          setMobileSidebarVisible(true);
        });
        return true;
      }
    });
  }, []);

  // ---------------------------------------------------------------------------
  // handleMessage (uses functional setState to avoid stale closures)
  // ---------------------------------------------------------------------------

  // Extract chat history from a2ui surface data (for initial sync from WebSocket)
  const extractChatHistory = useCallback((surface: A2UISurfaceData) => {
    if (chatInitializedRef.current) return;
    const chatComp = surface.components.find((c) => c.type === "chat_messages");
    if (!chatComp) return;
    const rawMessages = (chatComp.messages as any[]) || [];
    if (rawMessages.length === 0) return;
    chatInitializedRef.current = true;
    const normalized: ChatMessage[] = [];
    for (const raw of rawMessages) {
      if (raw.parts && raw.parts.length > 0) {
        normalized.push({ id: raw.id || generateUUID(), role: raw.role === "user" ? "user" : "assistant", parts: raw.parts });
      } else {
        const parts: MessagePart[] = raw.content ? [{ type: "text", content: raw.content }] : [];
        normalized.push({ id: raw.id || generateUUID(), role: raw.role === "user" ? "user" : "assistant", parts });
      }
    }
    setChatMessages(normalized);
  }, []);

  const handleMessage = useCallback(
    (msg: WSMessage) => {
      switch (msg.type) {
        case "page":
          if (msg.surfaces.sidebar) setSidebarData(msg.surfaces.sidebar);
          if (msg.surfaces.main) {
            setMainData(msg.surfaces.main);
            extractChatHistory(msg.surfaces.main);
          }
          break;

        case "a2ui":
          switch (msg.surface_id) {
            case "sidebar":
              setSidebarData({ components: msg.components, root_id: msg.root_id });
              break;
            case "main": {
              const mainSurface = { components: msg.components, root_id: msg.root_id };
              setMainData(mainSurface);
              extractChatHistory(mainSurface);
              break;
            }
            case "modal":
              setModalData({ components: msg.components, root_id: msg.root_id });
              // Trigger enter animation on next frame
              requestAnimationFrame(() => {
                setModalVisible(true);
              });
              break;
            case "toast":
              setToastData({ components: msg.components, root_id: msg.root_id });
              setToastExiting(false);
              // Auto-dismiss toast: start exit animation at 4.6s, remove DOM at 5s
              setTimeout(() => {
                setToastExiting(true);
              }, 4600);
              setTimeout(() => {
                setToastData(null);
                setToastExiting(false);
              }, 5000);
              break;
            case "progress":
              setProgressData({ components: msg.components, root_id: msg.root_id });
              break;
          }
          break;

        case "clear_surface":
          switch (msg.surface_id) {
            case "modal":
              closeModal();
              break;
            case "toast":
              setToastData(null);
              break;
            case "progress":
              setProgressData(null);
              break;
          }
          break;

        case "agent_text": {
          // Incremental streaming update — patch streamingContent without full re-render
          const agentMsg = msg as { type: "agent_text"; content: string; is_final: boolean };
          if (!agentMsg.is_final) {
            setMainData((prev) => {
              if (!prev) return prev;
              const updated = { ...prev, components: prev.components.map((c) => {
                if (c.type === "chat_messages") {
                  return { ...c, streamingContent: agentMsg.content };
                }
                return c;
              })};
              return updated;
            });
          }
          break;
        }

        case "log_entry": {
          // Append new log entry to current main surface log_viewer component
          setMainData((prev) => {
            if (!prev) return prev;
            const updated = { ...prev, components: prev.components.map((c) => {
              if (c.type === "log_viewer") {
                return { ...c, entries: [...((c as any).entries || []), (msg as any).entry] };
              }
              return c;
            })};
            return updated;
          });
          // Auto-scroll to bottom
          requestAnimationFrame(() => {
            const el = document.getElementById("log-viewer-scroll");
            if (el) el.scrollTop = el.scrollHeight;
          });
          break;
        }
      }
    },
    [closeModal, extractChatHistory],
  );

  // ---------------------------------------------------------------------------
  // WebSocket connect (stable via refs)
  // ---------------------------------------------------------------------------

  const connect = useCallback(() => {
    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const uuidParam = userUuidRef.current ? `?uuid=${userUuidRef.current}` : "";
    const wsUrl = `${wsProtocol}//${window.location.host}/ws${uuidParam}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      ws.send(JSON.stringify({ type: "init" }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as WSMessage;
        handleMessage(msg);
      } catch (e) {
        console.error("Parse error:", e);
      }
    };

    ws.onerror = () => {
      console.error("WebSocket error");
    };

    ws.onclose = () => {
      setConnected(false);
      setTimeout(() => connect(), 2000);
    };
  }, [handleMessage]);

  // ---------------------------------------------------------------------------
  // Initialization effect (runs once on mount)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    // Restore theme state (default to LIGHT, check localStorage first, then system preference)
    const savedTheme = localStorage.getItem("pha-dark-mode");
    let isDark = false;
    if (savedTheme !== null) {
      isDark = savedTheme === "true";
    } else {
      isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    setDarkMode(isDark);
    document.documentElement.classList.toggle("dark", isDark);
    document.documentElement.classList.toggle("light", !isDark);

    // Get user UUID
    userUuidRef.current = getUserUuid();

    // Connect WebSocket
    connect();

    // Cleanup
    return () => {
      wsRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------
  // Inject client-side chat state into mainData for rendering
  // ---------------------------------------------------------------------------

  const enhancedMainData = useMemo(() => {
    if (!mainData) return null;
    // Check if mainData has a chat_messages component (i.e. we're on chat page)
    const hasChatMessages = mainData.components.some((c) => c.type === "chat_messages");
    if (!hasChatMessages || chatMessages.length === 0) return mainData;

    // Override chat_messages component with client-managed state
    return {
      ...mainData,
      components: mainData.components.map((c) => {
        if (c.type === "chat_messages") {
          return {
            ...c,
            messages: chatMessages,
            streaming: chatStreaming,
            streamingContent: "", // No longer used; text is inline in parts
            quickReplies: quickReplies.length > 0 ? quickReplies : undefined,
          };
        }
        if (c.type === "chat_input") {
          return { ...c, streaming: chatStreaming };
        }
        return c;
      }),
    };
  }, [mainData, chatMessages, chatStreaming, quickReplies]);

  // ---------------------------------------------------------------------------
  // Auto-scroll & Plotly effect (runs when mainData or chatMessages change)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    // Process pending Plotly chart renders after DOM update
    if (pendingPlotlyChartsRef.current.length) {
      const charts = [...pendingPlotlyChartsRef.current];
      pendingPlotlyChartsRef.current = [];
      requestAnimationFrame(() => {
        for (const chart of charts) {
          const el = document.getElementById(chart.elementId);
          if (el && (window as any).Plotly) {
            (window as any).Plotly.newPlot(el, chart.traces, chart.layout, chart.config);
          }
        }
      });
    }

    // Auto-scroll chat to bottom on new content
    if (chatAutoScrollRef.current) {
      isAutoScrollingRef.current = true;
      requestAnimationFrame(() => {
        const el = document.querySelector(".chat-scroll-container");
        if (el) el.scrollTo({ top: el.scrollHeight, behavior: "instant" as ScrollBehavior });
        // Release guard after scroll settles
        setTimeout(() => {
          isAutoScrollingRef.current = false;
        }, 100);
      });
    }
  }, [mainData, chatMessages, chatStreaming]);

  // ---------------------------------------------------------------------------
  // Skeleton renderers
  // ---------------------------------------------------------------------------

  const skel = "bg-gradient-to-r from-white/5 via-white/10 to-white/5 bg-[length:200%_100%] motion-safe:animate-skeleton-shimmer rounded-lg";

  const renderSkeleton = () => (
    <div className="flex flex-col gap-2 p-1">
      <div className={skel} style={{ height: 38 }} />
      <div className={skel} style={{ height: 38 }} />
      <div className={skel} style={{ height: 38 }} />
    </div>
  );

  const renderMainSkeleton = () => (
    <div className="flex flex-col gap-4 p-8">
      <div className={skel} style={{ height: 24, width: 160 }} />
      <div className={skel} style={{ height: 100 }} />
      <div className={skel} style={{ height: 160 }} />
    </div>
  );

  // ---------------------------------------------------------------------------
  // JSX — Grid Shell Layout (Topbar + Sidebar + Content)
  // ---------------------------------------------------------------------------

  return (
    <div className="shell">
      {/* Decorative grid */}
      <div className="shell-grid-bg" />

      {/* ===== Topbar ===== */}
      <header className="topbar">
        <div className="topbar-left">
          <button
            className="topbar-btn md:!hidden"
            onClick={() => toggleMobileSidebar()}
            dangerouslySetInnerHTML={{ __html: ICONS["menu"] }}
          />
          <div className="topbar-brand">
            <div className="topbar-logo" dangerouslySetInnerHTML={{ __html: ICONS["hospital"] }} />
            <span className="topbar-title">PHA</span>
          </div>
        </div>
        <div className="topbar-right" />
      </header>

      {/* Mobile sidebar overlay */}
      {mobileSidebarOpen ? (
        <div
          className={`mobile-overlay md:!hidden transition-opacity duration-normal ${
            mobileSidebarVisible ? "opacity-100" : "opacity-0"
          }`}
          onClick={() => toggleMobileSidebar()}
        />
      ) : null}

      {/* ===== Sidebar ===== */}
      <aside
        className={`sidebar ${
          mobileSidebarOpen && mobileSidebarVisible ? "mobile-open" : ""
        }`}
      >
        <div className="flex-1 flex flex-col items-center">
          {sidebarData ? (
            <A2UIRenderer
              data={sidebarData}
              sendAction={sendAction}
              sendNavigate={sendNavigate}
              pendingPlotlyCharts={pendingPlotlyChartsRef}
              chatAutoScrollRef={chatAutoScrollRef}
              isAutoScrollingRef={isAutoScrollingRef}
            />
          ) : (
            renderSkeleton()
          )}
        </div>
        <div className="sidebar-bottom">
          <button
            className="sidebar-bottom-btn"
            onClick={() => toggleTheme()}
            title={darkMode ? i18n.common.switchToLight : i18n.common.switchToDark}
            dangerouslySetInnerHTML={{ __html: darkMode ? ICONS["sun"] : ICONS["moon"] }}
          />
          <span
            className={`status-dot ${connected ? "online" : "offline"}`}
            title={connected ? i18n.common.connected : i18n.common.reconnecting}
          />
        </div>
      </aside>

      {/* ===== Main Content ===== */}
      <main className="main-area">
        {progressData ? (
          <div className="shrink-0 border-b border-border bg-primary/5 z-10">
            <A2UIRenderer
              data={progressData}
              sendAction={sendAction}
              sendNavigate={sendNavigate}
              pendingPlotlyCharts={pendingPlotlyChartsRef}
              chatAutoScrollRef={chatAutoScrollRef}
              isAutoScrollingRef={isAutoScrollingRef}
            />
          </div>
        ) : null}

        <div
          key={pageKey}
          ref={mainContentRef}
          className="main-scroll"
          onScroll={(e) => {
            const scrolled = e.currentTarget.scrollTop > 8;
            document.querySelector('.topbar')?.classList.toggle('topbar-scrolled', scrolled);
          }}
          style={{ animation: "page-enter 0.35s cubic-bezier(0.16, 1, 0.3, 1) backwards" }}
        >
          {enhancedMainData ? (
            <A2UIRenderer
              data={enhancedMainData}
              sendAction={sendAction}
              sendNavigate={sendNavigate}
              pendingPlotlyCharts={pendingPlotlyChartsRef}
              chatAutoScrollRef={chatAutoScrollRef}
              isAutoScrollingRef={isAutoScrollingRef}
            />
          ) : (
            renderMainSkeleton()
          )}
        </div>
      </main>

      {/* ===== Modal Surface ===== */}
      {modalData ? (
        <div
          className={`fixed inset-0 flex items-center justify-center z-[100] transition-all duration-normal ${
            modalVisible
              ? "bg-overlay backdrop-blur-sm"
              : "bg-transparent pointer-events-none"
          }`}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div
            className={`w-full max-h-[90vh] overflow-visible flex justify-center transition-all duration-slow ease-spring ${
              modalVisible
                ? "opacity-100 translate-y-0 scale-100"
                : "opacity-0 translate-y-2 scale-[0.97]"
            }`}
          >
            <A2UIRenderer
              data={modalData}
              sendAction={sendAction}
              sendNavigate={sendNavigate}
              pendingPlotlyCharts={pendingPlotlyChartsRef}
              chatAutoScrollRef={chatAutoScrollRef}
              isAutoScrollingRef={isAutoScrollingRef}
            />
          </div>
        </div>
      ) : null}

      {/* ===== Toast Surface ===== */}
      {toastData ? (
        <div
          className={`fixed bottom-6 right-6 z-[200] motion-safe:animate-toast-slide-in transition-all duration-normal ${
            toastExiting ? "translate-x-[120%] opacity-0" : ""
          }`}
        >
          <A2UIRenderer
            data={toastData}
            sendAction={sendAction}
            sendNavigate={sendNavigate}
            pendingPlotlyCharts={pendingPlotlyChartsRef}
            chatAutoScrollRef={chatAutoScrollRef}
            isAutoScrollingRef={isAutoScrollingRef}
          />
        </div>
      ) : null}
    </div>
  );
}
