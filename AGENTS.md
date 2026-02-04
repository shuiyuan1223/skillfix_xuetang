# PHA Development Rules

## Project Overview

PHA (Personal Health Agent) is an AgentOS-based health management platform built with TypeScript.

## Architecture

- **Gateway**: Exposes A2UI, MCP, A2A protocols
- **Agent Core**: Built on pi-agent-core + pi-ai
- **Health Tools**: Domain-specific tools for health data
- **Data Sources**: Pluggable (Mock, Huawei Health, Apple HealthKit)

## Code Quality

- No `any` types unless absolutely necessary
- Use strict TypeScript
- All new code must have proper types

## Commands

- `npm run build` - Build all packages
- `npm run dev` - Start development mode
- `npm run check` - Lint and type check

## Packages

- `@pha/core` - Core library (agent, gateway, tools, evolution)
- `@pha/cli` - CLI + TUI interface
- `@pha/web` - Web UI

## Style

- Keep code concise
- No emojis in code or commits
- Use conventional commits (feat:, fix:, docs:, etc.)
