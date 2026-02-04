/**
 * Tools command - Manage and list MCP tools
 */

import type { Command } from "commander";
import { mcpHandler } from "@pha/core";
import { loadConfig } from "../utils/config.js";

export function registerToolsCommand(program: Command): void {
  const toolsCmd = program
    .command("tools")
    .description("Manage MCP tools");

  // tools list (default)
  toolsCmd
    .command("list", { isDefault: true })
    .description("List available MCP tools")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      const tools = mcpHandler.listTools();

      if (options.json) {
        console.log(JSON.stringify(tools, null, 2));
        return;
      }

      console.log("\n🔧 Available MCP Tools\n");
      console.log("━".repeat(50));

      for (const tool of tools) {
        console.log(`\n  ${tool.name}`);
        console.log(`  ${"-".repeat(tool.name.length)}`);
        console.log(`  ${tool.description}`);

        const props = tool.inputSchema.properties;
        const required = tool.inputSchema.required || [];

        if (Object.keys(props).length > 0) {
          console.log("\n  Parameters:");
          for (const [name, schema] of Object.entries(props)) {
            const req = required.includes(name) ? "*" : "";
            const desc = (schema as any).description || "";
            console.log(`    • ${name}${req}: ${desc}`);
          }
        }
      }

      console.log("\n" + "━".repeat(50) + "\n");
    });

  // tools call <name> [args...]
  toolsCmd
    .command("call <name>")
    .description("Call an MCP tool")
    .option("-a, --arg <args...>", "Arguments as key=value pairs")
    .option("--json", "Output as JSON")
    .action(async (name, options) => {
      const args: Record<string, unknown> = {};

      if (options.arg) {
        for (const pair of options.arg) {
          const [key, ...valueParts] = pair.split("=");
          let value: unknown = valueParts.join("=");

          // Try to parse as JSON
          try {
            value = JSON.parse(value as string);
          } catch {
            // Keep as string
          }

          args[key] = value;
        }
      }

      try {
        const result = await mcpHandler.callTool({ name, arguments: args });

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log("\nTool Result:\n");
          if (result.isError) {
            console.log("Error:", result.content?.[0]?.text || "Unknown error");
          } else {
            for (const content of result.content || []) {
              if (content.type === "text") {
                try {
                  const parsed = JSON.parse(content.text);
                  console.log(JSON.stringify(parsed, null, 2));
                } catch {
                  console.log(content.text);
                }
              }
            }
          }
          console.log("");
        }
      } catch (error) {
        console.error("Error calling tool:", error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // tools info <name>
  toolsCmd
    .command("info <name>")
    .description("Show detailed info about a tool")
    .action((name) => {
      const tools = mcpHandler.listTools();
      const tool = tools.find(t => t.name === name);

      if (!tool) {
        console.error(`Tool not found: ${name}`);
        console.log("Available tools:", tools.map(t => t.name).join(", "));
        process.exit(1);
      }

      console.log("\n🔧 Tool:", tool.name);
      console.log("━".repeat(50));
      console.log("\nDescription:", tool.description);
      console.log("\nInput Schema:");
      console.log(JSON.stringify(tool.inputSchema, null, 2));
      console.log("");
    });
}
