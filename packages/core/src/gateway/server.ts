/**
 * Gateway Server
 *
 * Bun-based HTTP + WebSocket server exposing A2UI, MCP, and REST APIs.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { mcpHandler } from "./mcp.js";
import { A2UIGenerator, SURFACE_MAIN, SURFACE_SIDEBAR } from "./a2ui.js";
import { createPHAAgent, type PHAAgent } from "../agent/pha-agent.js";
import { getDataSource } from "../tools/health-data.js";
import type { HealthDataSource } from "../data-sources/interface.js";

export interface GatewayConfig {
  port?: number;
  apiKey?: string;
  provider?: "anthropic" | "openai" | "google" | "openrouter" | "groq" | "mistral" | "xai";
  modelId?: string;
  baseUrl?: string;
}

// WebSocket message types
interface WSMessage {
  type: string;
  [key: string]: unknown;
}

interface WSInitMessage extends WSMessage {
  type: "init";
}

interface WSNavigateMessage extends WSMessage {
  type: "navigate";
  view: string;
}

interface WSUserMessage extends WSMessage {
  type: "user_message";
  content: string;
}

interface WSActionMessage extends WSMessage {
  type: "action";
  action: string;
  payload?: Record<string, unknown>;
}

/**
 * Create the Gateway Hono app (HTTP routes only)
 */
export function createGatewayApp() {
  const app = new Hono();

  // CORS
  app.use("/*", cors());

  // Health check
  app.get("/health", (c) => c.json({ status: "ok" }));

  // MCP endpoints
  app.post("/mcp/tools/list", async (c) => {
    const tools = mcpHandler.listTools();
    return c.json({ tools });
  });

  app.post("/mcp/tools/call", async (c) => {
    const body = await c.req.json();
    const result = await mcpHandler.callTool({
      name: body.name,
      arguments: body.arguments || {},
    });
    return c.json(result);
  });

  // REST API endpoints for health data
  app.get("/api/health/summary", async (c) => {
    const date = c.req.query("date") || "today";
    const dataSource = getDataSource();
    const actualDate = date === "today" ? new Date().toISOString().split("T")[0] : date;

    const [metrics, heartRate, sleep, workouts] = await Promise.all([
      dataSource.getMetrics(actualDate),
      dataSource.getHeartRate(actualDate),
      dataSource.getSleep(actualDate),
      dataSource.getWorkouts(actualDate),
    ]);

    return c.json({
      date: actualDate,
      metrics,
      heartRate,
      sleep,
      workouts,
    });
  });

  app.get("/api/health/metrics", async (c) => {
    const date = c.req.query("date") || "today";
    const dataSource = getDataSource();
    const actualDate = date === "today" ? new Date().toISOString().split("T")[0] : date;
    const metrics = await dataSource.getMetrics(actualDate);
    return c.json(metrics);
  });

  app.get("/api/health/heart-rate", async (c) => {
    const date = c.req.query("date") || "today";
    const dataSource = getDataSource();
    const actualDate = date === "today" ? new Date().toISOString().split("T")[0] : date;
    const heartRate = await dataSource.getHeartRate(actualDate);
    return c.json(heartRate);
  });

  app.get("/api/health/sleep", async (c) => {
    const date = c.req.query("date") || "today";
    const dataSource = getDataSource();
    const actualDate = date === "today" ? new Date().toISOString().split("T")[0] : date;
    const sleep = await dataSource.getSleep(actualDate);
    return c.json(sleep || { message: "No sleep data available" });
  });

  app.get("/api/health/workouts", async (c) => {
    const date = c.req.query("date") || "today";
    const dataSource = getDataSource();
    const actualDate = date === "today" ? new Date().toISOString().split("T")[0] : date;
    const workouts = await dataSource.getWorkouts(actualDate);
    return c.json(workouts);
  });

  app.get("/api/health/weekly", async (c) => {
    const dataSource = getDataSource();
    const today = new Date().toISOString().split("T")[0];
    const [weeklySteps, weeklySleep] = await Promise.all([
      dataSource.getWeeklySteps(today),
      dataSource.getWeeklySleep(today),
    ]);
    return c.json({ weeklySteps, weeklySleep });
  });

  return app;
}

/**
 * Gateway Session - Manages a single WebSocket session
 */
export class GatewaySession {
  private agent: PHAAgent | null = null;
  private config: GatewayConfig;
  private sessionId: string;
  private dataSource: HealthDataSource;

  constructor(config: GatewayConfig = {}) {
    this.config = config;
    this.sessionId = crypto.randomUUID();
    this.dataSource = getDataSource();
  }

  private getAgent(): PHAAgent {
    if (!this.agent) {
      this.agent = createPHAAgent({
        apiKey: this.config.apiKey,
        provider: this.config.provider,
        modelId: this.config.modelId,
        baseUrl: this.config.baseUrl,
      });
    }
    return this.agent;
  }

  /**
   * Handle incoming WebSocket message
   */
  async handleMessage(data: WSMessage, send: (msg: unknown) => void): Promise<void> {
    switch (data.type) {
      case "init":
        await this.handleInit(send);
        break;
      case "navigate":
        await this.handleNavigate((data as WSNavigateMessage).view, send);
        break;
      case "user_message":
        await this.handleUserMessage((data as WSUserMessage).content, send);
        break;
      case "action":
        await this.handleAction(
          (data as WSActionMessage).action,
          (data as WSActionMessage).payload,
          send
        );
        break;
      case "ping":
        send({ type: "pong" });
        break;
      default:
        console.warn("Unknown message type:", data.type);
    }
  }

  private async handleInit(send: (msg: unknown) => void): Promise<void> {
    send({
      type: "connected",
      session_id: this.sessionId,
    });

    // Send initial UI (sidebar + main dashboard)
    await this.sendSidebar("overview", send);
    await this.sendDashboard("overview", send);
  }

  private async handleNavigate(view: string, send: (msg: unknown) => void): Promise<void> {
    await this.sendSidebar(view, send);
    await this.sendDashboard(view, send);
  }

  private async handleUserMessage(content: string, send: (msg: unknown) => void): Promise<void> {
    try {
      const agent = this.getAgent();

      // Subscribe to agent events
      const unsubscribe = agent.subscribe((event) => {
        this.handleAgentEvent(event, send);
      });

      try {
        await agent.chat(content);
        await agent.getAgent().waitForIdle();
      } finally {
        unsubscribe();
      }
    } catch (error) {
      send({
        type: "error",
        code: "agent_error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async handleAction(
    action: string,
    payload: Record<string, unknown> | undefined,
    send: (msg: unknown) => void
  ): Promise<void> {
    // Handle UI actions (button clicks, form submissions, etc.)
    if (action.startsWith("navigate:")) {
      const view = action.replace("navigate:", "");
      await this.handleNavigate(view, send);
    } else {
      // Pass to agent as user message
      const message = `[Action: ${action}] ${payload ? JSON.stringify(payload) : ""}`;
      await this.handleUserMessage(message, send);
    }
  }

  private handleAgentEvent(event: any, send: (msg: unknown) => void): void {
    switch (event.type) {
      case "message_start":
      case "message_update":
        // Stream partial content
        if (event.message.role === "assistant") {
          const content = event.message.content;
          let text = "";
          for (const block of content) {
            if (block.type === "text") {
              text += block.text;
            }
          }
          send({
            type: "agent_text",
            content: text,
            is_final: false,
          });
        }
        break;

      case "message_end":
        if (event.message.role === "assistant") {
          const content = event.message.content;
          let text = "";
          for (const block of content) {
            if (block.type === "text") {
              text += block.text;
            }
          }
          send({
            type: "agent_text",
            content: text,
            is_final: true,
          });
        }
        break;

      case "tool_execution_start":
        send({
          type: "tool_call",
          tool: event.toolName,
          arguments: event.args,
        });
        break;

      case "tool_execution_end":
        send({
          type: "tool_result",
          tool: event.toolName,
          result: event.result,
        });
        break;

      case "agent_end":
        send({ type: "done" });
        break;
    }
  }

  private async sendSidebar(activeView: string, send: (msg: unknown) => void): Promise<void> {
    const gen = new A2UIGenerator(SURFACE_SIDEBAR);

    const navItems = [
      { id: "overview", label: "Overview", icon: "home" },
      { id: "heart", label: "Heart", icon: "heart" },
      { id: "sleep", label: "Sleep", icon: "moon" },
      { id: "activity", label: "Activity", icon: "activity" },
      { id: "chat", label: "Chat", icon: "message-circle" },
    ];

    const navId = gen.nav(navItems, { activeId: activeView, orientation: "vertical" });
    const rootId = gen.column([navId], { padding: 16, gap: 8 });

    send(gen.build(rootId));
  }

  private async sendDashboard(view: string, send: (msg: unknown) => void): Promise<void> {
    const today = new Date().toISOString().split("T")[0];

    const gen = new A2UIGenerator(SURFACE_MAIN);

    switch (view) {
      case "overview":
        await this.buildOverviewPage(gen, today);
        break;
      case "heart":
        await this.buildHeartPage(gen, today);
        break;
      case "sleep":
        await this.buildSleepPage(gen, today);
        break;
      case "activity":
        await this.buildActivityPage(gen, today);
        break;
      case "chat":
        this.buildChatPage(gen);
        break;
      default:
        await this.buildOverviewPage(gen, today);
    }

    // Find root (last added component with children)
    const components = Array.from((gen as any).components.values());
    const root = components.find((c: any) => c.id.startsWith("col_") && c.children);
    if (root) {
      send(gen.build((root as any).id));
    }
  }

  private async buildOverviewPage(gen: A2UIGenerator, date: string): Promise<void> {
    const [metrics, heartRate, sleep] = await Promise.all([
      this.dataSource.getMetrics(date),
      this.dataSource.getHeartRate(date),
      this.dataSource.getSleep(date),
    ]);

    // Header
    const titleId = gen.text("Today's Overview", "h1");
    const dateId = gen.text(date, "caption");
    const headerId = gen.column([titleId, dateId], { gap: 4 });

    // Metrics cards
    const stepsId = gen.statCard({
      title: "Steps",
      value: metrics.steps.toLocaleString(),
      icon: "footprints",
      subtitle: `${Math.round(metrics.distance / 1000 * 10) / 10} km`,
    });

    const caloriesId = gen.statCard({
      title: "Calories",
      value: metrics.calories.toLocaleString(),
      icon: "flame",
      subtitle: "kcal burned",
    });

    const heartId = gen.statCard({
      title: "Heart Rate",
      value: heartRate.restingAvg.toString(),
      icon: "heart",
      subtitle: "bpm resting",
    });

    const sleepId = gen.statCard({
      title: "Sleep",
      value: sleep ? `${sleep.durationHours}h` : "N/A",
      icon: "moon",
      subtitle: sleep ? `Quality: ${sleep.qualityScore}%` : "No data",
    });

    const statsGridId = gen.grid([stepsId, caloriesId, heartId, sleepId], {
      columns: 2,
      gap: 16,
      responsive: true,
    });

    // Root layout
    gen.column([headerId, statsGridId], { padding: 24, gap: 24 });
  }

  private async buildHeartPage(gen: A2UIGenerator, date: string): Promise<void> {
    const heartRate = await this.dataSource.getHeartRate(date);

    const titleId = gen.text("Heart Rate", "h1");

    const restingId = gen.statCard({
      title: "Resting",
      value: heartRate.restingAvg.toString(),
      icon: "heart",
      subtitle: "bpm average",
    });

    const maxId = gen.statCard({
      title: "Maximum",
      value: heartRate.maxToday.toString(),
      icon: "arrow-up",
      subtitle: "bpm today",
    });

    const minId = gen.statCard({
      title: "Minimum",
      value: heartRate.minToday.toString(),
      icon: "arrow-down",
      subtitle: "bpm today",
    });

    const statsRowId = gen.grid([restingId, maxId, minId], { columns: 3, gap: 16 });

    // Heart rate chart
    const chartId = gen.chart({
      chartType: "line",
      data: heartRate.readings,
      xKey: "time",
      yKey: "value",
      height: 300,
      color: "#ef4444",
    });

    const chartCardId = gen.card([chartId], { title: "Today's Heart Rate", padding: 16 });

    gen.column([titleId, statsRowId, chartCardId], { padding: 24, gap: 24 });
  }

  private async buildSleepPage(gen: A2UIGenerator, date: string): Promise<void> {
    const sleep = await this.dataSource.getSleep(date);

    const titleId = gen.text("Sleep Analysis", "h1");

    if (!sleep) {
      const noDataId = gen.text("No sleep data available for this date.", "body");
      gen.column([titleId, noDataId], { padding: 24, gap: 24 });
      return;
    }

    const durationId = gen.statCard({
      title: "Duration",
      value: `${sleep.durationHours}h`,
      icon: "clock",
      subtitle: `${sleep.bedTime} - ${sleep.wakeTime}`,
    });

    const qualityId = gen.statCard({
      title: "Quality",
      value: `${sleep.qualityScore}%`,
      icon: "star",
      subtitle: "score",
    });

    const statsRowId = gen.row([durationId, qualityId], { gap: 16 });

    // Sleep stages
    const deepId = gen.metric({
      label: "Deep Sleep",
      value: sleep.stages.deep,
      unit: "min",
    });

    const lightId = gen.metric({
      label: "Light Sleep",
      value: sleep.stages.light,
      unit: "min",
    });

    const remId = gen.metric({
      label: "REM",
      value: sleep.stages.rem,
      unit: "min",
    });

    const awakeId = gen.metric({
      label: "Awake",
      value: sleep.stages.awake,
      unit: "min",
    });

    const stagesGridId = gen.grid([deepId, lightId, remId, awakeId], { columns: 4, gap: 16 });
    const stagesCardId = gen.card([stagesGridId], { title: "Sleep Stages", padding: 16 });

    gen.column([titleId, statsRowId, stagesCardId], { padding: 24, gap: 24 });
  }

  private async buildActivityPage(gen: A2UIGenerator, date: string): Promise<void> {
    const [metrics, workouts, weeklySteps] = await Promise.all([
      this.dataSource.getMetrics(date),
      this.dataSource.getWorkouts(date),
      this.dataSource.getWeeklySteps(date),
    ]);

    const titleId = gen.text("Activity", "h1");

    // Today's stats
    const stepsId = gen.statCard({
      title: "Steps",
      value: metrics.steps.toLocaleString(),
      icon: "footprints",
    });

    const distanceId = gen.statCard({
      title: "Distance",
      value: `${Math.round(metrics.distance / 1000 * 10) / 10}`,
      icon: "map-pin",
      subtitle: "km",
    });

    const activeId = gen.statCard({
      title: "Active Time",
      value: metrics.activeMinutes.toString(),
      icon: "timer",
      subtitle: "minutes",
    });

    const statsRowId = gen.grid([stepsId, distanceId, activeId], { columns: 3, gap: 16 });

    // Weekly chart
    const chartId = gen.chart({
      chartType: "bar",
      data: weeklySteps,
      xKey: "date",
      yKey: "steps",
      height: 200,
      color: "#3b82f6",
    });
    const chartCardId = gen.card([chartId], { title: "Weekly Steps", padding: 16 });

    // Workouts
    const workoutComponents: string[] = [];
    if (workouts.length === 0) {
      workoutComponents.push(gen.text("No workouts recorded today.", "body"));
    } else {
      for (const workout of workouts) {
        const workoutId = gen.row([
          gen.badge(workout.type, { variant: "default" }),
          gen.text(`${workout.durationMinutes} min`, "body"),
          gen.text(`${workout.caloriesBurned} kcal`, "caption"),
        ], { gap: 12, align: "center" });
        workoutComponents.push(workoutId);
      }
    }
    const workoutsCardId = gen.card(workoutComponents, { title: "Today's Workouts", padding: 16 });

    gen.column([titleId, statsRowId, chartCardId, workoutsCardId], { padding: 24, gap: 24 });
  }

  private buildChatPage(gen: A2UIGenerator): void {
    const titleId = gen.text("Chat with PHA", "h1");
    const subtitleId = gen.text("Ask me anything about your health data", "caption");
    const headerId = gen.column([titleId, subtitleId], { gap: 4 });

    // Chat placeholder
    const placeholderId = gen.text("Send a message to start chatting...", "body");
    const chatAreaId = gen.card([placeholderId], { padding: 16 });

    gen.column([headerId, chatAreaId], { padding: 24, gap: 24 });
  }
}

// WebSocket data type
interface WSData {
  sessionId: string;
  config: GatewayConfig;
}

/**
 * Start the Gateway server with Bun
 */
export function startGateway(config: GatewayConfig = {}): void {
  const port = config.port || 8000;
  const app = createGatewayApp();
  const sessions = new Map<string, GatewaySession>();

  Bun.serve<WSData>({
    port,
    fetch(req, server) {
      const url = new URL(req.url);

      // Upgrade WebSocket connections
      if (url.pathname === "/ws") {
        const sessionId = crypto.randomUUID();
        const success = server.upgrade(req, {
          data: { sessionId, config },
        });
        if (success) {
          return undefined;
        }
        return new Response("WebSocket upgrade failed", { status: 400 });
      }

      // Handle HTTP requests with Hono
      return app.fetch(req);
    },
    websocket: {
      open(ws) {
        const { sessionId, config: wsConfig } = ws.data;
        const session = new GatewaySession(wsConfig);
        sessions.set(sessionId, session);
        console.log(`WebSocket connected: ${sessionId}`);
      },
      async message(ws, message) {
        const { sessionId } = ws.data;
        const session = sessions.get(sessionId);
        if (!session) return;

        try {
          const data = JSON.parse(message.toString());
          await session.handleMessage(data, (msg) => {
            ws.send(JSON.stringify(msg));
          });
        } catch (error) {
          console.error("WebSocket message error:", error);
          ws.send(JSON.stringify({
            type: "error",
            code: "parse_error",
            message: "Failed to parse message",
          }));
        }
      },
      close(ws) {
        const { sessionId } = ws.data;
        sessions.delete(sessionId);
        console.log(`WebSocket disconnected: ${sessionId}`);
      },
    },
  });

  console.log(`PHA Gateway running at http://localhost:${port}`);
  console.log(`WebSocket available at ws://localhost:${port}/ws`);
}

// Legacy export for compatibility
export const createGateway = createGatewayApp;
