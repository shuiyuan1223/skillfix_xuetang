/**
 * Tools command - Manage and list MCP tools
 */

import type { Command } from "commander";
import { mcpHandler } from "../gateway/mcp.js";
import {
  printHeader,
  printSection,
  printKV,
  printDivider,
  printTable,
  c,
  icons,
  truncate,
  Spinner,
  fatal,
} from "../utils/cli-ui.js";

export function registerToolsCommand(program: Command): void {
  const toolsCmd = program.command("tools").description("Manage MCP tools");

  // tools list (default)
  toolsCmd
    .command("list", { isDefault: true })
    .description("List available MCP tools")
    .option("--json", "Output as JSON")
    .option("-v, --verbose", "Show detailed information")
    .action(async (options) => {
      const tools = await mcpHandler.listTools();

      if (options.json) {
        console.log(JSON.stringify(tools, null, 2));
        return;
      }

      console.log("");
      printHeader(`${icons.tools} MCP Tools`, `${tools.length} available`);

      if (options.verbose) {
        // Detailed view
        for (const tool of tools) {
          printSection(tool.name);
          console.log(`  ${c.dim(tool.description)}`);

          const props = tool.inputSchema.properties;
          const required = tool.inputSchema.required || [];

          if (Object.keys(props).length > 0) {
            console.log(`\n  ${c.bold("Parameters:")}`);
            for (const [name, schema] of Object.entries(props)) {
              const isReq = required.includes(name);
              const desc = (schema as any).description || "";
              const type = (schema as any).type || "any";
              console.log(`  ${c.cyan(name)}${isReq ? c.red("*") : ""} ${c.dim(`(${type})`)}`);
              if (desc) {
                console.log(`    ${c.dim(desc)}`);
              }
            }
          }
        }
      } else {
        // Compact table view
        printTable(
          ["Tool", "Description", "Params"],
          tools.map((tool) => {
            const paramCount = Object.keys(tool.inputSchema.properties || {}).length;
            return [
              c.cyan(tool.name),
              truncate(tool.description, 40),
              paramCount > 0 ? String(paramCount) : c.dim("-"),
            ];
          })
        );

        console.log("");
        console.log(
          `  ${c.dim("Use")} ${c.cyan("pha tools list -v")} ${c.dim("for detailed view")}`
        );
        console.log(
          `  ${c.dim("Use")} ${c.cyan("pha tools info <name>")} ${c.dim("for specific tool")}`
        );
      }

      console.log("");
    });

  // tools call <name> [args...]
  toolsCmd
    .command("call <name>")
    .description("Call an MCP tool")
    .option("-a, --arg <args...>", "Arguments as key=value pairs")
    .option("--json", "Output as JSON")
    .action(async (name, options) => {
      const tools = await mcpHandler.listTools();
      const tool = tools.find((t) => t.name === name);

      if (!tool) {
        fatal(`Tool not found: ${name}`, `Available: ${tools.map((t) => t.name).join(", ")}`);
      }

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

      const spinner = new Spinner(`Calling ${name}...`);
      if (!options.json) spinner.start();

      try {
        const result = await mcpHandler.callTool({ name, arguments: args });

        if (!options.json) spinner.stop(result.isError ? "error" : "success");

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          if (result.isError) {
            console.log(`\n${c.red(icons.error)} ${c.red("Error:")}`);
            console.log(`  ${result.content?.[0]?.text || "Unknown error"}`);
          } else {
            console.log(`\n${c.bold("Result:")}\n`);
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
        if (!options.json) spinner.stop("error");
        fatal("Error calling tool", error instanceof Error ? error.message : String(error));
      }
    });

  // tools info <name>
  toolsCmd
    .command("info <name>")
    .description("Show detailed info about a tool")
    .action(async (name) => {
      const tools = await mcpHandler.listTools();
      const tool = tools.find((t) => t.name === name);

      if (!tool) {
        fatal(`Tool not found: ${name}`, `Available: ${tools.map((t) => t.name).join(", ")}`);
      }

      console.log("");
      printHeader(`${icons.tools} ${tool.name}`);

      console.log(`  ${tool.description}`);

      const props = tool.inputSchema.properties || {};
      const required = tool.inputSchema.required || [];

      if (Object.keys(props).length > 0) {
        printSection("Parameters");

        for (const [paramName, schema] of Object.entries(props)) {
          const isReq = required.includes(paramName);
          const type = (schema as any).type || "any";
          const desc = (schema as any).description || "";
          const defaultVal = (schema as any).default;

          console.log(`  ${c.cyan(paramName)}${isReq ? c.red(" *required") : ""}`);
          console.log(`    ${c.dim("Type:")} ${type}`);
          if (desc) {
            console.log(`    ${c.dim("Desc:")} ${desc}`);
          }
          if (defaultVal !== undefined) {
            console.log(`    ${c.dim("Default:")} ${JSON.stringify(defaultVal)}`);
          }
          console.log("");
        }
      }

      // Usage example
      printSection("Usage");
      const exampleArgs = Object.entries(props)
        .filter(([name]) => required.includes(name))
        .map(([name, schema]) => {
          const type = (schema as any).type;
          const example = type === "string" ? "value" : type === "number" ? "123" : "true";
          return `-a ${name}=${example}`;
        })
        .join(" ");

      console.log(`  ${c.cyan("pha tools call")} ${tool.name} ${exampleArgs || ""}`);
      console.log("");
    });
}
