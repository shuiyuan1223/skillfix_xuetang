#!/usr/bin/env bun
/**
 * PHA CLI
 *
 * Command line interface for Personal Health Agent.
 */

import { Command } from "commander";
import { registerStartCommand } from "./commands/start.js";
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
import { registerHuaweiCommand } from "./commands/huawei.js";
import { registerAuthCommand } from "./commands/auth.js";
import { registerWebCommand } from "./commands/web.js";
import { registerStateCommand } from "./commands/state.js";
import { registerInitCommand } from "./commands/init.js";

const program = new Command();

program
  .name("pha")
  .description(
    `
  🏥 Personal Health Agent - AI-powered health management

  PHA is an intelligent health assistant that analyzes your health data
  and provides personalized insights using AI.

  Quick Start:
    $ pha onboard       # First-time setup wizard
    $ pha start         # Start gateway and open browser
    $ pha health        # View health summary
    $ pha tui --local   # Chat in terminal
`.trim()
  )
  .version("0.1.0")
  .addHelpText(
    "after",
    `
Examples:
  $ pha start                    Start gateway server
  $ pha health -w                Weekly health summary
  $ pha chat -m "How did I sleep?"  Single message chat
  $ pha tools call get_sleep     Call MCP tool directly
  $ pha eval run                 Run evaluation on traces

Documentation:
  https://github.com/anthropics/pha
`
  );

// Register all commands
// Server commands
registerStartCommand(program); // start, stop, restart
registerGatewayCommand(program); // gateway start/stop (legacy)

// Setup commands
registerSetupCommand(program);
registerOnboardCommand(program);
registerConfigCommand(program);

// Health commands
registerHealthCommand(program);

// Chat/UI commands
registerTuiCommand(program);
registerChatCommand(program);

// Tools & Evolution
registerToolsCommand(program);
registerEvalCommand(program);

// Diagnostics
registerStatusCommand(program); // status, logs
registerDoctorCommand(program);

// Data source integrations
registerHuaweiCommand(program);
registerAuthCommand(program);

// Quick actions
registerWebCommand(program);

// State management
registerStateCommand(program);
registerInitCommand(program);

program.parse();
