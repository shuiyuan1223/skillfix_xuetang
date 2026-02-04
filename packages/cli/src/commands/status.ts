/**
 * Status command - Show system status
 */

import type { Command } from "commander";
import { loadConfig, isConfigured, getConfigPath } from "../utils/config.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const PID_FILE = path.join(os.homedir(), ".pha", "gateway.pid");

function getPid(): number | null {
  if (!fs.existsSync(PID_FILE)) return null;
  try {
    return parseInt(fs.readFileSync(PID_FILE, "utf-8").trim(), 10);
  } catch {
    return null;
  }
}

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function registerStatusCommand(program: Command): void {
  program
    .command("status")
    .description("Show PHA system status")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      const configured = isConfigured();
      const config = configured ? loadConfig() : null;
      const pid = getPid();
      const gatewayRunning = pid ? isRunning(pid) : false;

      // Check API keys
      const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
      const hasOpenAI = !!process.env.OPENAI_API_KEY;
      const hasGoogle = !!process.env.GOOGLE_API_KEY;
      const hasAnyKey = hasAnthropic || hasOpenAI || hasGoogle;

      // Check gateway health if running
      let gatewayHealth = null;
      if (gatewayRunning && config) {
        try {
          const response = await fetch(`http://localhost:${config.gateway.port}/health`);
          gatewayHealth = await response.json();
        } catch {
          // Gateway not responding
        }
      }

      const status = {
        configured,
        configPath: getConfigPath(),
        gateway: {
          running: gatewayRunning,
          pid: gatewayRunning ? pid : null,
          port: config?.gateway.port || 8000,
          health: gatewayHealth,
        },
        llm: {
          provider: config?.llm.provider || "not configured",
          hasApiKey: hasAnyKey,
          apiKeys: {
            anthropic: hasAnthropic,
            openai: hasOpenAI,
            google: hasGoogle,
          },
        },
        dataSource: {
          type: config?.dataSources.type || "mock",
        },
      };

      if (options.json) {
        console.log(JSON.stringify(status, null, 2));
        return;
      }

      console.log("\n🏥 PHA System Status\n");
      console.log("━".repeat(50));

      // Configuration
      console.log("\n📁 Configuration");
      console.log(`   Status:    ${configured ? "✓ Configured" : "✗ Not configured"}`);
      if (configured) {
        console.log(`   Path:      ${getConfigPath()}`);
      }

      // Gateway
      console.log("\n🌐 Gateway");
      console.log(`   Status:    ${gatewayRunning ? "✓ Running" : "✗ Stopped"}`);
      if (gatewayRunning) {
        console.log(`   PID:       ${pid}`);
        console.log(`   Port:      ${config?.gateway.port}`);
        console.log(`   URL:       http://localhost:${config?.gateway.port}`);
        console.log(`   Health:    ${gatewayHealth ? "✓ Healthy" : "⚠ Not responding"}`);
      }

      // LLM Provider
      console.log("\n🤖 LLM Provider");
      console.log(`   Provider:  ${config?.llm.provider || "not set"}`);
      console.log(`   API Keys:`);
      console.log(`     Anthropic: ${hasAnthropic ? "✓" : "✗"}`);
      console.log(`     OpenAI:    ${hasOpenAI ? "✓" : "✗"}`);
      console.log(`     Google:    ${hasGoogle ? "✓" : "✗"}`);

      // Data Source
      console.log("\n📊 Data Source");
      console.log(`   Type:      ${config?.dataSources.type || "mock"}`);

      // Quick actions
      console.log("\n" + "━".repeat(50));
      console.log("\n📋 Quick Actions\n");

      if (!configured) {
        console.log("   pha setup     - Initialize configuration");
        console.log("   pha onboard   - Run interactive setup wizard");
      } else if (!gatewayRunning) {
        console.log("   pha gateway start   - Start the gateway");
        console.log("   pha tui --local     - Start TUI without gateway");
      } else {
        console.log("   pha tui            - Open terminal UI");
        console.log("   pha health         - View health summary");
        console.log("   pha gateway stop   - Stop the gateway");
      }

      console.log("");
    });
}
