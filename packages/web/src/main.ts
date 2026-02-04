/**
 * PHA Web UI
 *
 * Web frontend for Personal Health Agent using A2UI protocol.
 */

import { html, css, LitElement } from "lit";
import { customElement, state, property } from "lit/decorators.js";

// A2UI Component Types
interface A2UIComponent {
  id: string;
  type: string;
  children?: string[];
  [key: string]: unknown;
}

interface A2UIMessage {
  type: "a2ui";
  surface_id: string;
  components: A2UIComponent[];
  root_id: string;
}

// Simple SVG chart rendering
function renderLineChart(data: any[], xKey: string, yKey: string, color: string, height: number): string {
  if (!data || data.length === 0) return '';

  const values = data.map(d => d[yKey] as number);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const width = 100;
  const padding = 5;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  const points = data.map((d, i) => {
    const x = padding + (i / (data.length - 1)) * chartWidth;
    const y = padding + chartHeight - ((d[yKey] - min) / range) * chartHeight;
    return `${x},${y}`;
  }).join(' ');

  return `
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" style="width: 100%; height: ${height}px;">
      <polyline
        points="${points}"
        fill="none"
        stroke="${color}"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <linearGradient id="gradient-${color.replace('#', '')}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${color}" stop-opacity="0.3"/>
        <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
      </linearGradient>
      <polygon
        points="${padding},${padding + chartHeight} ${points} ${padding + chartWidth},${padding + chartHeight}"
        fill="url(#gradient-${color.replace('#', '')})"
      />
    </svg>
  `;
}

function renderBarChart(data: any[], xKey: string, yKey: string, color: string, height: number): string {
  if (!data || data.length === 0) return '';

  const values = data.map(d => d[yKey] as number);
  const max = Math.max(...values);

  const width = 100;
  const padding = 5;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  const barWidth = chartWidth / data.length * 0.7;
  const gap = chartWidth / data.length * 0.3;

  const bars = data.map((d, i) => {
    const barHeight = (d[yKey] / max) * chartHeight;
    const x = padding + i * (barWidth + gap) + gap / 2;
    const y = padding + chartHeight - barHeight;
    return `<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" fill="${color}" rx="2"/>`;
  }).join('');

  return `
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" style="width: 100%; height: ${height}px;">
      ${bars}
    </svg>
  `;
}

@customElement("pha-app")
class PHAApp extends LitElement {
  static styles = css`
    :host {
      display: flex;
      min-height: 100vh;
      font-family: system-ui, -apple-system, sans-serif;
      background: #0f172a;
      color: #f1f5f9;
    }

    .sidebar {
      width: 240px;
      background: #1e293b;
      border-right: 1px solid #334155;
      display: flex;
      flex-direction: column;
    }

    .sidebar-header {
      padding: 20px;
      border-bottom: 1px solid #334155;
    }

    .sidebar-logo {
      font-size: 24px;
      font-weight: 700;
      background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .sidebar-content {
      flex: 1;
      padding: 16px 0;
    }

    .main {
      flex: 1;
      overflow: auto;
      display: flex;
      flex-direction: column;
    }

    .main-content {
      flex: 1;
      overflow: auto;
    }

    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: #94a3b8;
    }

    .error {
      padding: 24px;
      color: #f87171;
      text-align: center;
    }

    /* A2UI Component Styles */
    .a2ui-column {
      display: flex;
      flex-direction: column;
    }

    .a2ui-row {
      display: flex;
      flex-direction: row;
      align-items: center;
    }

    .a2ui-grid {
      display: grid;
    }

    .a2ui-card {
      background: #1e293b;
      border-radius: 12px;
      border: 1px solid #334155;
    }

    .a2ui-card-title {
      font-size: 14px;
      font-weight: 500;
      color: #94a3b8;
      margin-bottom: 12px;
    }

    .a2ui-text-h1 {
      font-size: 28px;
      font-weight: 700;
      color: #f1f5f9;
      margin: 0;
    }

    .a2ui-text-h2 {
      font-size: 22px;
      font-weight: 600;
      color: #f1f5f9;
      margin: 0;
    }

    .a2ui-text-h3 {
      font-size: 18px;
      font-weight: 600;
      color: #f1f5f9;
      margin: 0;
    }

    .a2ui-text-body {
      font-size: 14px;
      color: #cbd5e1;
      margin: 0;
    }

    .a2ui-text-caption {
      font-size: 12px;
      color: #64748b;
      margin: 0;
    }

    .a2ui-stat-card {
      background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
      border-radius: 16px;
      border: 1px solid #334155;
      padding: 20px;
      transition: transform 0.2s, box-shadow 0.2s;
    }

    .a2ui-stat-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
    }

    .a2ui-stat-card-icon {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 12px;
      font-size: 20px;
    }

    .a2ui-stat-card-title {
      font-size: 13px;
      font-weight: 500;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }

    .a2ui-stat-card-value {
      font-size: 32px;
      font-weight: 700;
      color: #f1f5f9;
      line-height: 1;
    }

    .a2ui-stat-card-subtitle {
      font-size: 13px;
      color: #94a3b8;
      margin-top: 6px;
    }

    .a2ui-metric {
      text-align: center;
      padding: 16px;
      background: #0f172a;
      border-radius: 12px;
    }

    .a2ui-metric-value {
      font-size: 24px;
      font-weight: 600;
      color: #f1f5f9;
    }

    .a2ui-metric-unit {
      font-size: 14px;
      color: #64748b;
      margin-left: 4px;
    }

    .a2ui-metric-label {
      font-size: 12px;
      color: #94a3b8;
      margin-top: 4px;
    }

    .a2ui-nav {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .a2ui-nav-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 20px;
      color: #94a3b8;
      text-decoration: none;
      border-radius: 0;
      transition: all 0.15s ease;
      cursor: pointer;
      border: none;
      background: none;
      width: 100%;
      text-align: left;
      font-size: 14px;
      font-family: inherit;
    }

    .a2ui-nav-item:hover {
      background: #334155;
      color: #f1f5f9;
    }

    .a2ui-nav-item.active {
      background: linear-gradient(90deg, rgba(59, 130, 246, 0.3) 0%, transparent 100%);
      color: #f1f5f9;
      border-left: 3px solid #3b82f6;
    }

    .a2ui-nav-icon {
      width: 20px;
      height: 20px;
      opacity: 0.7;
    }

    .a2ui-badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 500;
      background: #334155;
      color: #f1f5f9;
    }

    .a2ui-badge-success {
      background: #166534;
      color: #86efac;
    }

    .a2ui-badge-warning {
      background: #854d0e;
      color: #fde047;
    }

    .a2ui-badge-error {
      background: #991b1b;
      color: #fca5a5;
    }

    .a2ui-progress {
      width: 100%;
      height: 8px;
      background: #334155;
      border-radius: 9999px;
      overflow: hidden;
    }

    .a2ui-progress-bar {
      height: 100%;
      background: linear-gradient(90deg, #3b82f6 0%, #8b5cf6 100%);
      border-radius: 9999px;
      transition: width 0.3s ease;
    }

    .a2ui-chart {
      width: 100%;
      background: #0f172a;
      border-radius: 8px;
      overflow: hidden;
    }

    /* Chat styles */
    .chat-page {
      display: flex;
      flex-direction: column;
      height: calc(100vh - 48px);
      padding: 24px;
    }

    .chat-header {
      margin-bottom: 16px;
    }

    .chat-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      background: #1e293b;
      border-radius: 12px;
      margin-bottom: 16px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .chat-message {
      max-width: 80%;
      animation: fadeIn 0.3s ease;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .chat-message-user {
      background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
      color: white;
      padding: 12px 16px;
      border-radius: 16px 16px 4px 16px;
      margin-left: auto;
    }

    .chat-message-assistant {
      background: #0f172a;
      color: #f1f5f9;
      padding: 12px 16px;
      border-radius: 16px 16px 16px 4px;
      border: 1px solid #334155;
    }

    .chat-message-tool {
      background: #1e3a5f;
      color: #93c5fd;
      padding: 8px 12px;
      border-radius: 8px;
      font-size: 12px;
      font-family: monospace;
    }

    .chat-input-container {
      display: flex;
      gap: 12px;
    }

    .chat-input {
      flex: 1;
      padding: 14px 18px;
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 12px;
      color: #f1f5f9;
      font-size: 14px;
      outline: none;
      font-family: inherit;
      transition: border-color 0.2s;
    }

    .chat-input:focus {
      border-color: #3b82f6;
    }

    .chat-input::placeholder {
      color: #64748b;
    }

    .chat-send-btn {
      padding: 14px 24px;
      background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
      border: none;
      border-radius: 12px;
      color: white;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
      font-family: inherit;
    }

    .chat-send-btn:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
    }

    .chat-send-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
      box-shadow: none;
    }

    .chat-typing {
      display: flex;
      gap: 4px;
      padding: 12px 16px;
    }

    .chat-typing-dot {
      width: 8px;
      height: 8px;
      background: #64748b;
      border-radius: 50%;
      animation: typing 1.4s infinite;
    }

    .chat-typing-dot:nth-child(2) { animation-delay: 0.2s; }
    .chat-typing-dot:nth-child(3) { animation-delay: 0.4s; }

    @keyframes typing {
      0%, 60%, 100% { transform: translateY(0); }
      30% { transform: translateY(-6px); }
    }

    .empty-chat {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: #64748b;
    }

    .empty-chat-icon {
      font-size: 48px;
      margin-bottom: 16px;
      opacity: 0.5;
    }

    .empty-chat-text {
      font-size: 16px;
      margin-bottom: 8px;
    }

    .empty-chat-hint {
      font-size: 14px;
      opacity: 0.7;
    }
  `;

  @state() private sidebarUI: A2UIMessage | null = null;
  @state() private mainUI: A2UIMessage | null = null;
  @state() private connected = false;
  @state() private error: string | null = null;
  @state() private chatMessages: Array<{ role: string; content: string }> = [];
  @state() private chatInput = "";
  @state() private isStreaming = false;
  @state() private currentView = "overview";
  @state() private streamingContent = "";

  private ws: WebSocket | null = null;
  private componentMap = new Map<string, A2UIComponent>();
  private sidebarComponentMap = new Map<string, A2UIComponent>();

  connectedCallback() {
    super.connectedCallback();
    this.connect();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.ws?.close();
  }

  private connect() {
    const wsUrl = `ws://${window.location.hostname}:8000/ws`;
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log("WebSocket connected");
      this.connected = true;
      this.error = null;
      this.ws?.send(JSON.stringify({ type: "init" }));
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        this.handleMessage(msg);
      } catch (e) {
        console.error("Failed to parse message:", e);
      }
    };

    this.ws.onerror = () => {
      this.error = "Connection error. Make sure the server is running on port 8000.";
    };

    this.ws.onclose = () => {
      this.connected = false;
      setTimeout(() => this.connect(), 2000);
    };
  }

  private handleMessage(msg: any) {
    switch (msg.type) {
      case "connected":
        console.log("Session ID:", msg.session_id);
        break;

      case "a2ui":
        this.handleA2UIMessage(msg as A2UIMessage);
        break;

      case "agent_text":
        if (msg.is_final) {
          this.chatMessages = [
            ...this.chatMessages,
            { role: "assistant", content: msg.content },
          ];
          this.isStreaming = false;
          this.streamingContent = "";
        } else {
          this.streamingContent = msg.content;
        }
        break;

      case "tool_call":
        this.chatMessages = [
          ...this.chatMessages,
          { role: "tool", content: `Calling ${msg.tool}...` },
        ];
        break;

      case "error":
        this.error = msg.message;
        this.isStreaming = false;
        break;
    }
  }

  private handleA2UIMessage(msg: A2UIMessage) {
    if (msg.surface_id === "sidebar") {
      this.sidebarComponentMap.clear();
      for (const component of msg.components) {
        this.sidebarComponentMap.set(component.id, component);
      }
      this.sidebarUI = msg;
    } else if (msg.surface_id === "main") {
      this.componentMap.clear();
      for (const component of msg.components) {
        this.componentMap.set(component.id, component);
      }
      this.mainUI = msg;
    }
  }

  private getIcon(name: string): string {
    const icons: Record<string, string> = {
      home: "🏠",
      heart: "❤️",
      moon: "🌙",
      activity: "🏃",
      "message-circle": "💬",
      footprints: "👣",
      flame: "🔥",
      clock: "⏰",
      star: "⭐",
      "arrow-up": "↑",
      "arrow-down": "↓",
      "map-pin": "📍",
      timer: "⏱️",
    };
    return icons[name] || "•";
  }

  private renderComponent(id: string, componentMap: Map<string, A2UIComponent>): unknown {
    const component = componentMap.get(id);
    if (!component) return html``;

    const children = component.children?.map((childId) =>
      this.renderComponent(childId, componentMap)
    );

    switch (component.type) {
      case "column":
        return html`
          <div
            class="a2ui-column"
            style="gap: ${component.gap || 0}px; padding: ${component.padding || 0}px;"
          >
            ${children}
          </div>
        `;

      case "row":
        return html`
          <div
            class="a2ui-row"
            style="gap: ${component.gap || 0}px; justify-content: ${component.justify || "start"};"
          >
            ${children}
          </div>
        `;

      case "grid":
        return html`
          <div
            class="a2ui-grid"
            style="grid-template-columns: repeat(${component.columns || 2}, 1fr); gap: ${component.gap || 16}px;"
          >
            ${children}
          </div>
        `;

      case "card":
        return html`
          <div class="a2ui-card" style="padding: ${component.padding || 16}px;">
            ${component.title
              ? html`<div class="a2ui-card-title">${component.title}</div>`
              : ""}
            ${children}
          </div>
        `;

      case "text":
        return html`
          <p class="a2ui-text-${component.variant || "body"}">${component.text}</p>
        `;

      case "stat_card":
        return html`
          <div class="a2ui-stat-card">
            ${component.icon
              ? html`<div class="a2ui-stat-card-icon">${this.getIcon(component.icon as string)}</div>`
              : ""}
            <div class="a2ui-stat-card-title">${component.title}</div>
            <div class="a2ui-stat-card-value">${component.value}</div>
            ${component.subtitle
              ? html`<div class="a2ui-stat-card-subtitle">${component.subtitle}</div>`
              : ""}
          </div>
        `;

      case "metric":
        return html`
          <div class="a2ui-metric">
            <div class="a2ui-metric-value">
              ${component.value}
              ${component.unit
                ? html`<span class="a2ui-metric-unit">${component.unit}</span>`
                : ""}
            </div>
            <div class="a2ui-metric-label">${component.label}</div>
          </div>
        `;

      case "nav":
        const items = component.items as Array<{
          id: string;
          label: string;
          icon?: string;
        }>;
        return html`
          <nav class="a2ui-nav">
            ${items.map(
              (item) => html`
                <button
                  class="a2ui-nav-item ${item.id === component.activeId ? "active" : ""}"
                  @click=${() => this.navigate(item.id)}
                >
                  <span class="a2ui-nav-icon">${this.getIcon(item.icon || "")}</span>
                  ${item.label}
                </button>
              `
            )}
          </nav>
        `;

      case "badge":
        return html`
          <span class="a2ui-badge a2ui-badge-${component.variant || "default"}">
            ${component.text}
          </span>
        `;

      case "progress":
        const percent = ((component.value as number) / ((component.maxValue as number) || 100)) * 100;
        return html`
          <div class="a2ui-progress">
            <div class="a2ui-progress-bar" style="width: ${percent}%"></div>
          </div>
        `;

      case "chart":
        const chartType = component.chartType as string;
        const data = component.data as any[];
        const xKey = component.xKey as string;
        const yKey = component.yKey as string;
        const color = (component.color as string) || "#3b82f6";
        const height = (component.height as number) || 200;

        let chartSvg = "";
        if (chartType === "line" || chartType === "area") {
          chartSvg = renderLineChart(data, xKey, yKey, color, height);
        } else if (chartType === "bar") {
          chartSvg = renderBarChart(data, xKey, yKey, color, height);
        }

        return html`
          <div class="a2ui-chart" .innerHTML=${chartSvg}></div>
        `;

      default:
        return html`<div>[Unknown: ${component.type}]</div>`;
    }
  }

  private navigate(view: string) {
    this.currentView = view;
    this.ws?.send(JSON.stringify({ type: "navigate", view }));
  }

  private sendMessage() {
    if (!this.chatInput.trim() || this.isStreaming) return;

    this.chatMessages = [
      ...this.chatMessages,
      { role: "user", content: this.chatInput },
    ];

    this.ws?.send(
      JSON.stringify({ type: "user_message", content: this.chatInput })
    );

    this.chatInput = "";
    this.isStreaming = true;
  }

  private handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      this.sendMessage();
    }
  }

  private renderChatPage() {
    return html`
      <div class="chat-page">
        <div class="chat-header">
          <h1 class="a2ui-text-h1">Chat with PHA</h1>
          <p class="a2ui-text-caption">Ask me anything about your health data</p>
        </div>

        <div class="chat-messages">
          ${this.chatMessages.length === 0 ? html`
            <div class="empty-chat">
              <div class="empty-chat-icon">💬</div>
              <div class="empty-chat-text">Start a conversation</div>
              <div class="empty-chat-hint">Try asking about your health data, sleep, or activity</div>
            </div>
          ` : this.chatMessages.map(msg => html`
            <div class="chat-message chat-message-${msg.role}">
              ${msg.content}
            </div>
          `)}
          ${this.isStreaming && this.streamingContent ? html`
            <div class="chat-message chat-message-assistant">
              ${this.streamingContent}
            </div>
          ` : ""}
          ${this.isStreaming && !this.streamingContent ? html`
            <div class="chat-message chat-message-assistant chat-typing">
              <div class="chat-typing-dot"></div>
              <div class="chat-typing-dot"></div>
              <div class="chat-typing-dot"></div>
            </div>
          ` : ""}
        </div>

        <div class="chat-input-container">
          <input
            type="text"
            class="chat-input"
            placeholder="Type your message..."
            .value=${this.chatInput}
            @input=${(e: Event) => this.chatInput = (e.target as HTMLInputElement).value}
            @keydown=${this.handleKeyDown}
            ?disabled=${this.isStreaming}
          />
          <button
            class="chat-send-btn"
            @click=${this.sendMessage}
            ?disabled=${this.isStreaming || !this.chatInput.trim()}
          >
            Send
          </button>
        </div>
      </div>
    `;
  }

  render() {
    if (this.error) {
      return html`
        <div class="error">
          <h2>Connection Error</h2>
          <p>${this.error}</p>
          <p>Run: <code>bun packages/cli/dist/main.js start</code></p>
        </div>
      `;
    }

    if (!this.connected) {
      return html`<div class="loading">Connecting to server...</div>`;
    }

    return html`
      <aside class="sidebar">
        <div class="sidebar-header">
          <div class="sidebar-logo">PHA</div>
        </div>
        <div class="sidebar-content">
          ${this.sidebarUI
            ? this.renderComponent(this.sidebarUI.root_id, this.sidebarComponentMap)
            : html`<div class="loading">Loading...</div>`}
        </div>
      </aside>
      <main class="main">
        <div class="main-content">
          ${this.currentView === "chat"
            ? this.renderChatPage()
            : this.mainUI
              ? this.renderComponent(this.mainUI.root_id, this.componentMap)
              : html`<div class="loading">Loading...</div>`}
        </div>
      </main>
    `;
  }
}

// Mount app
const app = document.getElementById("app");
if (app) {
  app.innerHTML = "<pha-app></pha-app>";
}
