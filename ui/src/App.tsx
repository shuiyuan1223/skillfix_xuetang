import { useState, useRef, useEffect, useCallback, useMemo, startTransition } from 'react';
import type { A2UISurfaceData, A2UIComponent, WSMessage, AGUIEvent, MessagePart, QuickReply } from './lib/types';
import { componentType, prop, withProp } from './lib/types';
import { generateUUID } from './lib/utils';
import { ICONS } from './lib/icons';
import { i18n } from './lib/i18n';
import { A2UIRenderer } from './components/a2ui/A2UIRenderer';
import JSZip from 'jszip';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Gateway basePath injected by server (empty string when no prefix configured) */
const BASE_PATH = (window as any).__PHA_BASE_PATH__ || '';

function setUserIdCookie(userId: string): void {
  const expires = new Date();
  expires.setFullYear(expires.getFullYear() + 1);
  document.cookie = `pha_uid=${userId}; expires=${expires.toUTCString()}; path=/; SameSite=Strict`;
}

function getUserId(): string | null {
  // 1. URL ?uid=xxx (also accepts legacy ?user_id=xxx and ?uuid=xxx)
  const urlParams = new URLSearchParams(window.location.search);
  const urlUserId = urlParams.get('uid') || urlParams.get('user_id') || urlParams.get('uuid');
  if (urlUserId) {
    setUserIdCookie(urlUserId);
    return urlUserId;
  }

  // 2. Cookie pha_uid (set after OAuth; also check legacy pha_user_id)
  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if ((name === 'pha_uid' || name === 'pha_user_id') && value) {
      return value;
    }
  }

  // 3. Not authenticated — return null (no random UUID generation)
  return null;
}

/** Send an action to the A2UI HTTP endpoint and process response updates. */
async function postAction(data: Record<string, unknown>, handleMessage: (msg: WSMessage) => void): Promise<void> {
  try {
    const res = await fetch(`${BASE_PATH}/api/a2ui/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      return;
    }
    const { updates } = (await res.json()) as { updates: unknown[] };
    if (updates) {
      // Use startTransition so action-response re-renders are non-urgent,
      // consistent with SSE updates — user interactions stay responsive.
      startTransition(() => {
        for (const msg of updates) {
          handleMessage(msg as WSMessage);
        }
      });
    }
  } catch (e) {
    console.error('[A2UI] Action error:', e);
  }
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
    role: 'user' | 'assistant';
    parts: MessagePart[];
  }
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatStreaming, setChatStreaming] = useState(false);
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const activeMessageRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const chatInitializedRef = useRef(false);

  // --- Refs ----------------------------------------------------------------
  const sessionIdRef = useRef<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const uidRef = useRef<string | null>(null);
  const chatAutoScrollRef = useRef(true);
  const isAutoScrollingRef = useRef(false);
  const extensionDetectedRef = useRef(false);
  const reconnectAttemptRef = useRef(0);
  const lastViewRef = useRef<string | null>(null);
  const mainDataRef = useRef<A2UISurfaceData | null>(null);
  const handleMessageRef = useRef<(msg: WSMessage) => void>(() => {});
  const pendingSurface = useRef(new Map<string, A2UIComponent[]>());

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
      console.log('[OAuth] Checking for extension...');

      const timeout = setTimeout(() => {
        console.log('[OAuth] Extension check timed out');
        window.removeEventListener('message', handler);
        resolve(false);
      }, 2000);

      const handler = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) {
          return;
        }
        if (event.data?.type?.startsWith('PHA_')) {
          console.log('[OAuth] Received message:', event.data.type, event.data);
        }
        if (event.data?.type === 'PHA_EXTENSION_READY' || event.data?.type === 'PHA_EXTENSION_STATUS') {
          clearTimeout(timeout);
          window.removeEventListener('message', handler);
          extensionDetectedRef.current = true;
          console.log('[OAuth] Extension detected, version:', event.data.version);
          resolve(true);
        }
      };

      window.addEventListener('message', handler);
      window.postMessage({ type: 'PHA_CHECK_EXTENSION' }, window.location.origin);
    });
  }, []);

  const requestExtensionOAuth = useCallback(
    (authUrl: string): Promise<{ success: boolean; code?: string; error?: string }> => {
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          window.removeEventListener('message', handler);
          resolve({ success: false, error: 'OAuth timeout' });
        }, 180000); // 3 minute timeout

        const handler = (event: MessageEvent) => {
          if (event.origin !== window.location.origin) {
            return;
          }
          if (event.data?.type === 'PHA_OAUTH_RESULT') {
            clearTimeout(timeout);
            window.removeEventListener('message', handler);
            resolve(event.data);
          }
        };

        window.addEventListener('message', handler);
        window.postMessage({ type: 'PHA_OAUTH_START', authUrl }, window.location.origin);
      });
    },
    []
  );

  // sendActionRaw: fire-and-forget action via HTTP POST
  const sendActionRaw = useCallback((action: string, payload?: Record<string, unknown>) => {
    postAction({ type: 'action', action, payload }, handleMessageRef.current);
  }, []);

  // ---------------------------------------------------------------------------
  // AG-UI SSE Chat
  // ---------------------------------------------------------------------------

  const handleAGUIEvent = useCallback((event: AGUIEvent) => {
    switch (event.type) {
      case 'TextMessageStart': {
        const msg: ChatMessage = { id: event.messageId, role: 'assistant', parts: [] };
        activeMessageRef.current = event.messageId;
        // Replace placeholder with real assistant message
        setChatMessages((prev) => {
          const filtered = prev.filter((m) => m.id !== 'streaming-placeholder');
          return [...filtered, msg];
        });
        break;
      }
      case 'TextMessageContent': {
        setChatMessages((prev) => {
          const msgs = [...prev];
          const last = msgs[msgs.length - 1];
          if (last && last.id === event.messageId) {
            const updated = { ...last, parts: [...last.parts] };
            const lastPart = updated.parts[updated.parts.length - 1];
            if (lastPart && lastPart.type === 'text') {
              updated.parts[updated.parts.length - 1] = { ...lastPart, content: lastPart.content + event.delta };
            } else {
              updated.parts.push({ type: 'text', content: event.delta });
            }
            msgs[msgs.length - 1] = updated;
          }
          return msgs;
        });
        break;
      }
      case 'TextMessageEnd': {
        // No-op: text is already accumulated
        break;
      }
      case 'ToolCallStart': {
        setChatMessages((prev) => {
          const msgs = [...prev];
          const last = msgs[msgs.length - 1];
          if (last && last.role === 'assistant') {
            const updated = { ...last, parts: [...last.parts] };
            // Remove empty trailing text part before tool_use
            const lastP = updated.parts[updated.parts.length - 1];
            if (lastP && lastP.type === 'text' && !lastP.content.trim()) {
              updated.parts.pop();
            }
            updated.parts.push({
              type: 'tool_use',
              toolCallId: event.toolCallId,
              toolName: event.toolCallName,
              status: 'running' as const,
              ...(event.displayName ? { displayName: event.displayName } : {}),
            });
            msgs[msgs.length - 1] = updated;
          }
          return msgs;
        });
        break;
      }
      case 'ToolCallEnd': {
        setChatMessages((prev) => {
          const msgs = [...prev];
          const last = msgs[msgs.length - 1];
          if (last && last.role === 'assistant') {
            const updated = {
              ...last,
              parts: last.parts.map((p) => {
                if (p.type === 'tool_use' && p.toolCallId === event.toolCallId) {
                  return { ...p, status: 'completed' as const };
                }
                return p;
              }),
            };
            msgs[msgs.length - 1] = updated;
          }
          return msgs;
        });
        break;
      }
      case 'ToolCallResult': {
        setChatMessages((prev) => {
          const msgs = [...prev];
          const last = msgs[msgs.length - 1];
          if (last && last.role === 'assistant' && event.cards) {
            const updated = { ...last, parts: [...last.parts] };
            updated.parts.push({
              type: 'tool_result',
              toolCallId: event.toolCallId,
              cards: event.cards,
            });
            msgs[msgs.length - 1] = updated;
          }
          return msgs;
        });
        break;
      }
      case 'RunFinished': {
        setChatStreaming(false);
        activeMessageRef.current = null;
        break;
      }
      case 'Custom': {
        if (event.name === 'QuickReplies') {
          setQuickReplies(event.data as QuickReply[]);
        }
        break;
      }
      default:
        break;
    }
  }, []);

  const sendChatMessage = useCallback(
    (content: string) => {
      // Optimistic: add user message
      const userMsg: ChatMessage = {
        id: generateUUID(),
        role: 'user',
        parts: [{ type: 'text', content }],
      };
      const placeholderMsg: ChatMessage = {
        id: 'streaming-placeholder',
        role: 'assistant',
        parts: [],
      };
      setChatMessages((prev) => [...prev, userMsg, placeholderMsg]);
      setChatStreaming(true);
      setQuickReplies([]);
      chatAutoScrollRef.current = true;

      // Abort previous if still running
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const uuid = uidRef.current || 'anonymous';

      fetch(`${BASE_PATH}/api/ag-ui`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ thread_id: uuid, messages: [{ role: 'user', content }] }),
        signal: controller.signal,
      })
        .then(async (res) => {
          if (!res.ok || !res.body) {
            setChatStreaming(false);
            return;
          }
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              break;
            }
            buffer += decoder.decode(value, { stream: true });

            // Parse SSE lines
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // keep incomplete line
            for (const line of lines) {
              if (line.startsWith('data: ')) {
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
          if (buffer.startsWith('data: ')) {
            try {
              const event = JSON.parse(buffer.slice(6)) as AGUIEvent;
              handleAGUIEvent(event);
            } catch {
              /* skip */
            }
          }

          setChatStreaming(false);
          activeMessageRef.current = null;
        })
        .catch((err) => {
          if (err.name !== 'AbortError') {
            console.error('[SSE] Chat error:', err);
          }
          setChatStreaming(false);
          activeMessageRef.current = null;
        });
    },
    [handleAGUIEvent]
  );

  const startOAuthWithExtension = useCallback(async () => {
    console.log('[OAuth] Using browser extension flow...');

    sendActionRaw('show_toast', { message: 'Opening authorization page...', variant: 'info' });

    try {
      const urlResponse = await fetch(`${BASE_PATH}/auth/huawei/get-auth-url`);
      if (!urlResponse.ok) {
        const text = await urlResponse.text();
        console.error('[OAuth] get-auth-url failed:', urlResponse.status, text.slice(0, 200));
        throw new Error(`Server error: ${urlResponse.status}`);
      }

      const urlData = await urlResponse.json();
      if (urlData.error) {
        throw new Error(urlData.error);
      }
      if (!urlData.authUrl) {
        throw new Error('No auth URL returned');
      }

      console.log('[OAuth] Got auth URL, requesting extension...');
      const result = await requestExtensionOAuth(urlData.authUrl);
      console.log('[OAuth] Extension result:', result);

      if (result.success && result.code) {
        const exchangeResponse = await fetch(`${BASE_PATH}/auth/huawei/exchange`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: result.code, uuid: uidRef.current }),
        });
        if (!exchangeResponse.ok) {
          const text = await exchangeResponse.text();
          console.error('[OAuth] exchange failed:', exchangeResponse.status, text.slice(0, 200));
          throw new Error(`Exchange failed: ${exchangeResponse.status}`);
        }
        const exchangeResult = await exchangeResponse.json();
        if (exchangeResult.success) {
          console.log('[OAuth] Authentication successful!');
          // Store the Huawei user ID returned by the server
          if (exchangeResult.userId) {
            setUserIdCookie(exchangeResult.userId);
            uidRef.current = exchangeResult.userId;
          }
          sendActionRaw('auth_complete', { userId: exchangeResult.userId });
        } else {
          throw new Error(exchangeResult.error || 'Failed to exchange code');
        }
      } else {
        throw new Error(result.error || 'Extension OAuth failed');
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error('[OAuth] Extension flow failed:', message);
      sendActionRaw('show_toast', { message: `Authentication failed: ${message}`, variant: 'error' });
    }
  }, [requestExtensionOAuth, sendActionRaw]);

  const startOAuthWithMCP = useCallback(async () => {
    console.log('[OAuth] Using Chrome MCP flow...');

    sendActionRaw('show_toast', { message: 'Launching browser for authentication...', variant: 'info' });

    try {
      const response = await fetch(`${BASE_PATH}/auth/huawei/mcp-flow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uuid: uidRef.current }),
      });
      if (!response.ok) {
        const text = await response.text();
        console.error('[OAuth] MCP flow request failed:', response.status, text.slice(0, 200));
        throw new Error(`Server error: ${response.status}`);
      }
      const result = await response.json();
      if (result.success) {
        console.log('[OAuth] Authentication successful!');
        // Store the Huawei user ID returned by the server
        if (result.userId) {
          setUserIdCookie(result.userId);
          uidRef.current = result.userId;
        }
        sendActionRaw('auth_complete', { userId: result.userId });
      } else {
        console.error('[OAuth] MCP flow failed:', result.error);
        if (result.error?.includes('MCP') || result.error?.includes('chrome') || result.error?.includes('spawn')) {
          sendActionRaw('show_toast', {
            message: 'Please install PHA browser extension for authentication',
            variant: 'warning',
          });
        } else {
          sendActionRaw('show_toast', {
            message: `Authentication failed: ${result.error}`,
            variant: 'error',
          });
        }
      }
    } catch (e) {
      console.error('[OAuth] Request failed:', e);
      sendActionRaw('show_toast', {
        message: 'Failed to start authentication. Please install PHA extension.',
        variant: 'error',
      });
    }
  }, [sendActionRaw]);

  const startHuaweiAuth = useCallback(async () => {
    console.log('[OAuth] Starting authentication...');
    const hasExtension = await checkExtension();
    if (hasExtension) {
      await startOAuthWithExtension();
    } else {
      await startOAuthWithMCP();
    }
  }, [checkExtension, startOAuthWithExtension, startOAuthWithMCP]);

  // ---------------------------------------------------------------------------
  // Workbench ZIP Export
  // ---------------------------------------------------------------------------

  const exportWorkbenchZip = useCallback(async () => {
    try {
      // Fetch all skills and prompts from server
      const response = await fetch(`${BASE_PATH}/api/a2ui/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'action',
          action: 'workbench_get_export_data'
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch workbench data');
      }

      const result = await response.json();

      // The response is { updates: [...] }, find the workbench_export_data message
      const dataMessage = result.updates?.find((msg: any) => msg.type === 'workbench_export_data');

      if (!dataMessage || !dataMessage.data) {
        throw new Error('No data returned from server');
      }

      const { skills, prompts } = dataMessage.data;

      if (!skills || !prompts || (skills.length === 0 && prompts.length === 0)) {
        sendActionRaw('show_toast', {
          message: 'No skills or prompts to export',
          variant: 'warning'
        });
        return;
      }

      // Create ZIP file
      const zip = new JSZip();
      const skillsFolder = zip.folder('skills');
      const promptsFolder = zip.folder('prompts');

      // Add skills
      for (const skill of skills) {
        if (skillsFolder && skill.id && skill.content) {
          const skillSubfolder = skillsFolder.folder(skill.id);
          skillSubfolder?.file('SKILL.md', skill.content);
        }
      }

      // Add prompts
      for (const prompt of prompts) {
        if (promptsFolder && prompt.id && prompt.content) {
          promptsFolder.file(`${prompt.id}.md`, prompt.content);
        }
      }

      // Generate ZIP file
      const blob = await zip.generateAsync({ type: 'blob' });

      // Trigger download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      a.download = `workbench-export-${timestamp}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      sendActionRaw('show_toast', { message: 'Export successful!', variant: 'success' });
    } catch (err) {
      console.error('[Workbench] Export failed:', err);
      sendActionRaw('show_toast', { message: 'Export failed', variant: 'error' });
    }
  }, [sendActionRaw]);

  // ---------------------------------------------------------------------------
  // Core actions
  // ---------------------------------------------------------------------------

  const sendAction = useCallback(
    (action: string, payload?: Record<string, unknown>) => {
      // Handle OAuth actions locally
      if (action === 'start_huawei_auth') {
        // Also notify server so it can clear scope error cache
        postAction({ type: 'action', action, payload }, handleMessageRef.current);
        startHuaweiAuth();
        return;
      }

      // Handle workbench export zip locally on the frontend
      if (action === 'debug_export_zip') {
        exportWorkbenchZip();
        return;
      }

      // Handle workbench copy messages locally on the frontend
      if (action === 'debug_copy_messages') {
        const text = (payload?.text as string) || '';
        if (text) {
          // Try modern clipboard API first
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard
              .writeText(text)
              .then(() => {
                sendActionRaw('show_toast', { message: 'Messages copied!', variant: 'success' });
              })
              .catch(() => {
                // Fallback to legacy method
                fallbackCopyToClipboard(text);
              });
          } else {
            // Use legacy method directly if clipboard API not available
            fallbackCopyToClipboard(text);
          }
        }
        return;
      }

      // Fallback copy method for older browsers or non-HTTPS contexts
      function fallbackCopyToClipboard(text: string) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.top = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        try {
          const successful = document.execCommand('copy');
          if (successful) {
            sendActionRaw('show_toast', { message: 'Messages copied!', variant: 'success' });
          } else {
            sendActionRaw('show_toast', { message: 'Copy failed', variant: 'error' });
          }
        } catch (err) {
          sendActionRaw('show_toast', { message: 'Copy failed', variant: 'error' });
        } finally {
          document.body.removeChild(textarea);
        }
      }

      // Handle copy/download config locally on the frontend
      if (action === 'settings_copy_config' || action === 'settings_download_config') {
        // Find the code_editor component in current main data to get raw config
        const mainDataSnap = mainDataRef.current;
        const editorComp = mainDataSnap?.components.find(
          (c: A2UIComponent) => componentType(c) === 'CodeEditor' && prop(c, 'readonly')
        );
        const configJson = editorComp ? (prop(editorComp, 'value') as string) || '{}' : '{}';
        if (action === 'settings_copy_config') {
          navigator.clipboard
            .writeText(configJson)
            .then(() => {
              sendActionRaw('show_toast', { message: 'Copied!', variant: 'success' });
            })
            .catch(() => {
              sendActionRaw('show_toast', { message: 'Copy failed', variant: 'error' });
            });
        } else {
          const blob = new Blob([configJson], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'config.json';
          a.click();
          URL.revokeObjectURL(url);
        }
        return;
      }

      // Reset auto-scroll when user sends a message
      if (
        action === 'send_message' ||
        action === 'sa_send_message' ||
        action === 'evo_send_message' ||
        action === 'pg_send_message'
      ) {
        chatAutoScrollRef.current = true;
      }

      // Route main chat messages through SSE
      if (action === 'send_message' && payload?.content) {
        sendChatMessage(String(payload.content));
        return;
      }

      // Optimistic user message for server-driven chats (SA/evo/pg)
      if (
        (action === 'sa_send_message' || action === 'evo_send_message' || action === 'pg_send_message') &&
        (payload?.content || payload?.value)
      ) {
        const text = String(payload.content || payload.value);
        setMainData((prev) => {
          if (!prev) {
            return prev;
          }
          return {
            ...prev,
            components: prev.components.map((c) => {
              if (componentType(c) === 'ChatMessages' && prop(c, 'action') === action) {
                const msgs = (prop(c, 'messages') as any[]) || [];
                return withProp(c, 'messages', [
                  ...msgs,
                  { id: generateUUID(), role: 'user', parts: [{ type: 'text', content: text }] },
                ]);
              }
              return c;
            }),
          };
        });
      }

      // Clear chat: reset local + server state, show welcome screen
      if (action === 'clear_chat') {
        abortControllerRef.current?.abort();
        setChatMessages([]);
        setChatStreaming(false);
        setQuickReplies([]);
        activeMessageRef.current = null;
        chatInitializedRef.current = false;
        // Clear messages from mainData so welcome screen shows immediately
        setMainData((prev) => {
          if (!prev) {
            return prev;
          }
          return {
            ...prev,
            components: prev.components.map((c) => {
              if (componentType(c) === 'ChatMessages' && (!prop(c, 'action') || prop(c, 'action') === 'send_message')) {
                return withProp(withProp(c, 'messages', []), 'streaming', false);
              }
              if (componentType(c) === 'ChatInput' && (!prop(c, 'action') || prop(c, 'action') === 'send_message')) {
                return withProp(c, 'streaming', false);
              }
              return c;
            }),
          };
        });
        postAction({ type: 'action', action, payload: {} }, handleMessageRef.current);
        return;
      }

      // Stop generation: abort SSE fetch
      if (action === 'stop_generation') {
        abortControllerRef.current?.abort();
        setChatStreaming(false);
        activeMessageRef.current = null;
        // Also notify server
        postAction({ type: 'action', action, payload }, handleMessageRef.current);
        return;
      }

      postAction({ type: 'action', action, payload }, handleMessageRef.current);
    },
    [startHuaweiAuth, sendChatMessage, sendActionRaw]
  );

  const sendNavigate = useCallback((view: string) => {
    lastViewRef.current = view;
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

    // Reset chat state so the new page's messages are picked up from server
    chatInitializedRef.current = false;
    setChatMessages([]);

    postAction({ type: 'navigate', view }, handleMessageRef.current);
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
      localStorage.setItem('pha-dark-mode', String(next));
      document.documentElement.classList.toggle('dark', next);
      document.documentElement.classList.toggle('light', !next);
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

  // Extract chat history from a2ui surface data (for initial sync)
  const extractChatHistory = useCallback((surface: A2UISurfaceData) => {
    if (chatInitializedRef.current) {
      return;
    }
    const chatComp = surface.components.find(
      (c) => componentType(c) === 'ChatMessages' && (!prop(c, 'action') || prop(c, 'action') === 'send_message')
    );
    if (!chatComp) {
      return;
    }
    const rawMessages = (prop(chatComp, 'messages') as any[]) || [];
    if (rawMessages.length === 0) {
      return;
    }
    chatInitializedRef.current = true;
    const normalized: ChatMessage[] = [];
    for (const raw of rawMessages) {
      if (raw.parts && raw.parts.length > 0) {
        normalized.push({
          id: raw.id || generateUUID(),
          role: raw.role === 'user' ? 'user' : 'assistant',
          parts: raw.parts,
        });
      } else {
        const parts: MessagePart[] = raw.content ? [{ type: 'text', content: raw.content }] : [];
        normalized.push({ id: raw.id || generateUUID(), role: raw.role === 'user' ? 'user' : 'assistant', parts });
      }
    }
    setChatMessages(normalized);
  }, []);

  // Surface application helpers
  const applySurface = useCallback(
    (surfaceId: string, data: A2UISurfaceData) => {
      switch (surfaceId) {
        case 'sidebar':
          setSidebarData(data);
          break;
        case 'main':
          setMainData(data);
          extractChatHistory(data);
          break;
        case 'modal':
          setModalData(data);
          requestAnimationFrame(() => setModalVisible(true));
          break;
        case 'toast':
          setToastData(data);
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
        case 'progress':
          setProgressData(data);
          break;
        default:
          break;
      }
    },
    [extractChatHistory]
  );

  const clearSurface = useCallback(
    (surfaceId: string) => {
      switch (surfaceId) {
        case 'modal':
          closeModal();
          break;
        case 'toast':
          setToastData(null);
          break;
        case 'progress':
          setProgressData(null);
          break;
        default:
          break;
      }
    },
    [closeModal]
  );

  const handleMessage = useCallback(
    (msg: WSMessage) => {
      // v0.8 A2UI messages
      if ('surfaceUpdate' in msg) {
        pendingSurface.current.set(msg.surfaceUpdate.surfaceId, msg.surfaceUpdate.components);
        return;
      }
      if ('beginRendering' in msg) {
        const { surfaceId, root } = msg.beginRendering;
        const components = pendingSurface.current.get(surfaceId);
        if (!components) {
          return;
        }
        pendingSurface.current.delete(surfaceId);
        applySurface(surfaceId, { components, root_id: root });
        return;
      }
      if ('deleteSurface' in msg) {
        clearSurface(msg.deleteSurface.surfaceId);
        return;
      }

      // Legacy / non-A2UI messages
      if ('type' in msg) {
        switch ((msg as any).type) {
          case 'agent_text': {
            // Incremental streaming update — patch streamingContent without full re-render
            const agentMsg = msg as { type: 'agent_text'; content: string; is_final: boolean };
            if (!agentMsg.is_final) {
              setMainData((prev) => {
                if (!prev) {
                  return prev;
                }
                const updated = {
                  ...prev,
                  components: prev.components.map((c) => {
                    if (componentType(c) === 'ChatMessages') {
                      return withProp(c, 'streamingContent', agentMsg.content);
                    }
                    return c;
                  }),
                };
                return updated;
              });
            }
            break;
          }

          case 'log_entry': {
            // Append new log entry to current main surface log_viewer component
            setMainData((prev) => {
              if (!prev) {
                return prev;
              }
              const updated = {
                ...prev,
                components: prev.components.map((c) => {
                  if (componentType(c) === 'LogViewer') {
                    const entries = (prop(c, 'entries') as any[]) || [];
                    return withProp(c, 'entries', [...entries, (msg as any).entry]);
                  }
                  return c;
                }),
              };
              return updated;
            });
            // Auto-scroll to bottom
            requestAnimationFrame(() => {
              const el = document.getElementById('log-viewer-scroll');
              if (el) {
                el.scrollTop = el.scrollHeight;
              }
            });
            break;
          }

          case 'download': {
            // Handle file download
            const downloadMsg = msg as any;
            const { filename, content, mimeType } = downloadMsg;
            if (filename && content) {
              try {
                const blob = new Blob([Uint8Array.from(atob(content), (c) => c.charCodeAt(0))], {
                  type: mimeType || 'application/octet-stream',
                });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              } catch (err) {
                console.error('[Download] Failed:', err);
              }
            }
            break;
          }

          default:
            break;
        }
      }
    },
    [applySurface, clearSurface]
  );

  // Keep handleMessageRef in sync so postAction always uses the latest
  handleMessageRef.current = handleMessage;

  // ---------------------------------------------------------------------------
  // HTTP+SSE connect (replaces WebSocket)
  // ---------------------------------------------------------------------------

  const connect = useCallback(async () => {
    try {
      // 1. HTTP init — get session + initial page state
      const uuid = uidRef.current;
      const initRes = await fetch(`${BASE_PATH}/api/a2ui/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uuid, view: lastViewRef.current }),
      });

      if (!initRes.ok) {
        console.error('[A2UI] Init failed:', initRes.status);
        setTimeout(() => connect(), 2000);
        return;
      }

      const { sessionId, updates } = (await initRes.json()) as {
        sessionId: string;
        uid?: string;
        updates: unknown[];
      };
      sessionIdRef.current = sessionId;

      // Process initial page state
      for (const msg of updates) {
        handleMessage(msg as WSMessage);
      }

      setConnected(true);

      // 2. SSE events — long-lived connection for server push
      const es = new EventSource(`${BASE_PATH}/api/a2ui/events?sessionId=${sessionId}`);
      eventSourceRef.current = es;

      es.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as WSMessage;
          if ((msg as any).type === 'throttled') return; // Graceful 429: ignore, browser retries per retry: field
          // Mark SSE-pushed updates as non-urgent so React 18 can let user
          // interactions (clicks, keystrokes) take priority and not get
          // interrupted by rapid streaming re-renders on high-latency connections.
          startTransition(() => {
            handleMessage(msg);
          });
        } catch (e) {
          console.error('[SSE] Parse error:', e);
        }
      };

      es.onerror = () => {
        setConnected(false);
        // EventSource has native reconnection (interval controlled by server retry: field).
        // Only manually reconnect when the connection is fully closed (won't auto-retry).
        if (es.readyState === EventSource.CLOSED) {
          eventSourceRef.current = null;
          reconnectAttemptRef.current++;
          const delay = Math.min(2000 * Math.pow(1.5, reconnectAttemptRef.current - 1), 30000);
          setTimeout(() => connect(), delay);
        }
      };

      es.onopen = () => {
        setConnected(true);
        reconnectAttemptRef.current = 0;
      };
    } catch (e) {
      console.error('[A2UI] Connect error:', e);
      setTimeout(() => connect(), 2000);
    }
  }, [handleMessage]);

  // ---------------------------------------------------------------------------
  // Initialization effect (runs once on mount)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    // Restore theme state (default to LIGHT, check localStorage first, then system preference)
    const savedTheme = localStorage.getItem('pha-dark-mode');
    let isDark = false;
    if (savedTheme !== null) {
      isDark = savedTheme === 'true';
    } else {
      isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    setDarkMode(isDark);
    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.classList.toggle('light', !isDark);

    // Get user UUID
    uidRef.current = getUserId();

    // Listen for OAuth completion from callback popup/tab
    const oauthHandler = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) {
        return;
      }
      if (event.data?.type === 'PHA_OAUTH_COMPLETE' && event.data.userId) {
        setUserIdCookie(event.data.userId);
        uidRef.current = event.data.userId;
        sendActionRaw('auth_complete', { userId: event.data.userId });
      }
    };
    window.addEventListener('message', oauthHandler);

    // Connect via HTTP+SSE
    connect();

    // Cleanup
    return () => {
      eventSourceRef.current?.close();
      window.removeEventListener('message', oauthHandler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------
  // Inject client-side chat state into mainData for rendering
  // ---------------------------------------------------------------------------

  const enhancedMainData = useMemo(() => {
    if (!mainData) {
      return null;
    }
    // Check if mainData has a ChatMessages component (i.e. we're on chat page)
    const hasChatMessages = mainData.components.some((c) => componentType(c) === 'ChatMessages');
    if (!hasChatMessages || chatMessages.length === 0) {
      return mainData;
    }

    // Override chat_messages component with client-managed state
    // Only override PHA chat (action="send_message"), NOT system-agent (action="sa_send_message")
    return {
      ...mainData,
      components: mainData.components.map((c) => {
        if (componentType(c) === 'ChatMessages' && (!prop(c, 'action') || prop(c, 'action') === 'send_message')) {
          let updated = withProp(c, 'messages', chatMessages);
          updated = withProp(updated, 'streaming', chatStreaming);
          updated = withProp(updated, 'streamingContent', ''); // No longer used; text is inline in parts
          if (quickReplies.length > 0) {
            updated = withProp(updated, 'quickReplies', quickReplies);
          }
          return updated;
        }
        if (componentType(c) === 'ChatInput' && (!prop(c, 'action') || prop(c, 'action') === 'send_message')) {
          return withProp(c, 'streaming', chatStreaming);
        }
        return c;
      }),
    };
  }, [mainData, chatMessages, chatStreaming, quickReplies]);

  // ---------------------------------------------------------------------------
  // Auto-scroll effect (runs when mainData or chatMessages change)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    // Auto-scroll chat to bottom on new content
    if (chatAutoScrollRef.current) {
      isAutoScrollingRef.current = true;
      requestAnimationFrame(() => {
        const el = document.querySelector('.chat-scroll-container');
        if (el) {
          el.scrollTo({ top: el.scrollHeight, behavior: 'instant' as ScrollBehavior });
        }
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

  const skel =
    'bg-gradient-to-r from-white/5 via-white/10 to-white/5 bg-[length:200%_100%] motion-safe:animate-skeleton-shimmer rounded-lg';

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

  // Detect if we're showing the auth page (hide shell chrome)
  const isAuthPage = mainData?.components.some((c) => componentType(c) === 'AuthPage') ?? false;

  return (
    <div className={isAuthPage ? '' : 'shell'}>
      {/* Decorative grid */}
      {!isAuthPage && <div className="shell-grid-bg" />}

      {/* ===== Topbar ===== */}
      {!isAuthPage && (
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="topbar-btn md:!hidden"
              onClick={() => toggleMobileSidebar()}
              dangerouslySetInnerHTML={{ __html: ICONS.menu }}
            />
            <div className="topbar-brand">
              <div className="topbar-logo" dangerouslySetInnerHTML={{ __html: ICONS.hospital }} />
              <span className="topbar-title">PHA</span>
            </div>
          </div>
          <div className="topbar-right" />
        </header>
      )}

      {/* Mobile sidebar overlay */}
      {!isAuthPage && mobileSidebarOpen ? (
        <div
          className={`mobile-overlay md:!hidden transition-opacity duration-normal ${
            mobileSidebarVisible ? 'opacity-100' : 'opacity-0'
          }`}
          onClick={() => toggleMobileSidebar()}
        />
      ) : null}

      {/* ===== Sidebar ===== */}
      {!isAuthPage && (
        <aside className={`sidebar ${mobileSidebarOpen && mobileSidebarVisible ? 'mobile-open' : ''}`}>
          <div className="flex-1 flex flex-col items-center">
            {sidebarData ? (
              <A2UIRenderer
                data={sidebarData}
                sendAction={sendAction}
                sendNavigate={sendNavigate}
                chatAutoScrollRef={chatAutoScrollRef}
                isAutoScrollingRef={isAutoScrollingRef}
              />
            ) : (
              renderSkeleton()
            )}
          </div>
          <div className="sidebar-bottom">
            <div className="relative">
              <button
                className="sidebar-bottom-btn"
                onClick={() => toggleTheme()}
                title={darkMode ? i18n.common.switchToLight : i18n.common.switchToDark}
                dangerouslySetInnerHTML={{ __html: darkMode ? ICONS.sun : ICONS.moon }}
              />
              <span
                className={`status-dot-badge ${connected ? 'online' : 'offline'}`}
                title={connected ? i18n.common.connected : i18n.common.reconnecting}
              />
            </div>
          </div>
        </aside>
      )}

      {/* ===== Main Content ===== */}
      <main className={isAuthPage ? '' : 'main-area'}>
        {progressData ? (
          <div className="shrink-0 border-b border-border bg-primary/5 z-10">
            <A2UIRenderer
              data={progressData}
              sendAction={sendAction}
              sendNavigate={sendNavigate}
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
          style={{ animation: 'page-enter 0.35s cubic-bezier(0.16, 1, 0.3, 1) backwards' }}
        >
          {enhancedMainData ? (
            <A2UIRenderer
              data={enhancedMainData}
              sendAction={sendAction}
              sendNavigate={sendNavigate}
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
            modalVisible ? 'bg-overlay backdrop-blur-sm' : 'bg-transparent pointer-events-none'
          }`}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              closeModal();
            }
          }}
        >
          <div
            className={`w-full max-h-[90vh] overflow-visible flex justify-center transition-all duration-slow ease-spring ${
              modalVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-2 scale-[0.97]'
            }`}
          >
            <A2UIRenderer
              data={modalData}
              sendAction={sendAction}
              sendNavigate={sendNavigate}
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
            toastExiting ? 'translate-x-[120%] opacity-0' : ''
          }`}
        >
          <A2UIRenderer
            data={toastData}
            sendAction={sendAction}
            sendNavigate={sendNavigate}
            chatAutoScrollRef={chatAutoScrollRef}
            isAutoScrollingRef={isAutoScrollingRef}
          />
        </div>
      ) : null}
    </div>
  );
}
