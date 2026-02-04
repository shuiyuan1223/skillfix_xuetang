#!/usr/bin/env bun
/**
 * PHA CLI
 *
 * Command line interface for Personal Health Agent.
 */

import { Command } from "commander";
import { registerSetupCommand } from "./commands/setup.js";
import { registerOnboardCommand } from "./commands/onboard.js";
import { registerConfigCommand } from "./commands/config.js";
import { registerGatewayCommand } from "./commands/gateway.js";
import { registerTuiCommand } from "./commands/tui.js";
import { registerHealthCommand } from "./commands/health.js";
import { registerToolsCommand } from "./commands/tools.js";
import { registerChatCommand } from "./commands/chat.js";
import { registerEvalCommand } from "./commands/eval.js";
import { registerStatusCommand } from "./commands/status.js";
import { registerDoctorCommand } from "./commands/doctor.js";

const program = new Command();

program
  .name("pha")
  .description("Personal Health Agent - AI-powered health management")
  .version("0.1.0");

// Register all commands
registerSetupCommand(program);
registerOnboardCommand(program);
registerConfigCommand(program);
registerGatewayCommand(program);
registerTuiCommand(program);
registerHealthCommand(program);
registerToolsCommand(program);
registerChatCommand(program);
registerEvalCommand(program);
registerStatusCommand(program);
registerDoctorCommand(program);

program.parse();
