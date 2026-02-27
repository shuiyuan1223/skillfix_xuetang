/**
 * Tools command - Manage and list MCP tools
 */

import type { Command } from "commander";
import { mcpHandler } from "../gateway/mcp.js";

type JsonSchema = { type?: string; description?: string; default?: unknown };
import {
  printHeader,
  printSection,
  printTable,
  c,
  icons,
  truncate,
  Spinner,
  fatal,
} from "../utils/cli-ui.js";

async function handleToolsList(options: { json?: boolean; verbose?: boolean }): Promise<void> {
  const tools = await mcpHandler.listTools();

  if (options.json) {
    console.log(JSON.stringify(tools, null, 2));
    return;
  }

  console.log("");
  printHeader(`${icons.tools} MCP Tools`, `${tools.length} available`);

  if (options.verbose) {
    for (const tool of tools) {
      printSection(tool.name);
      console.log(`  ${c.dim(tool.description)}`);
      const props = tool.inputSchema.properties;
      const required = tool.inputSchema.required || [];
      if (Object.keys(props).length > 0) {
        console.log(`\n  ${c.bold("Parameters:")}`);
        for (const [name, schema] of Object.entries(props)) {
          const isReq = required.includes(name);
          const desc = (schema as JsonSchema).description || "";
          const type = (schema as JsonSchema).type || "any";
          console.log(`  ${c.cyan(name)}${isReq ? c.red("*") : ""} ${c.dim(`(${type})`)}`);
          if (desc) console.log(`    ${c.dim(desc)}`);
        }
      }
    }
  } else {
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
    console.log(`  ${c.dim("Use")} ${c.cyan("pha tools list -v")} ${c.dim("for detailed view")}`);
    console.log(
      `  ${c.dim("Use")} ${c.cyan("pha tools info <name>")} ${c.dim("for specific tool")}`
    );
  }

  console.log("");
  process.exit(0);
}

async function handleToolsCall(
  name: string,
  options: { arg?: string[]; json?: boolean }
): Promise<void> {
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
      try {
        value = JSON.parse(value as string);
      } catch {
        /* keep as string */
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
    } else if (result.isError) {
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
  } catch (error) {
    if (!options.json) spinner.stop("error");
    fatal("Error calling tool", error instanceof Error ? error.message : String(error));
  }
  process.exit(0);
}

async function handleToolsInfo(name: string): Promise<void> {
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
      const type = (schema as JsonSchema).type || "any";
      const desc = (schema as JsonSchema).description || "";
      const defaultVal = (schema as JsonSchema).default;
      console.log(`  ${c.cyan(paramName)}${isReq ? c.red(" *required") : ""}`);
      console.log(`    ${c.dim("Type:")} ${type}`);
      if (desc) console.log(`    ${c.dim("Desc:")} ${desc}`);
      if (defaultVal !== undefined)
        console.log(`    ${c.dim("Default:")} ${JSON.stringify(defaultVal)}`);
      console.log("");
    }
  }

  printSection("Usage");
  const exampleArgs = Object.entries(props)
    .filter(([n]) => required.includes(n))
    .map(([n, schema]) => {
      const type = (schema as JsonSchema).type;
      const exampleMap: Record<string, string> = { string: "value", number: "123" };
      return `-a ${n}=${exampleMap[type as string] ?? "true"}`;
    })
    .join(" ");
  console.log(`  ${c.cyan("pha tools call")} ${tool.name} ${exampleArgs || ""}`);
  console.log("");
  process.exit(0);
}

export function registerToolsCommand(program: Command): void {
  const toolsCmd = program.command("tools").description("Manage MCP tools");

  toolsCmd
    .command("list", { isDefault: true })
    .description("List available MCP tools")
    .option("--json", "Output as JSON")
    .option("-v, --verbose", "Show detailed information")
    .action(handleToolsList);

  toolsCmd
    .command("call <name>")
    .description("Call an MCP tool")
    .option("-a, --arg <args...>", "Arguments as key=value pairs")
    .option("--json", "Output as JSON")
    .action(handleToolsCall);

  toolsCmd
    .command("info <name>")
    .description("Show detailed info about a tool")
    .action(handleToolsInfo);
}
