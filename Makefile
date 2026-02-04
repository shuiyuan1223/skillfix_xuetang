# PHA - Personal Health Agent
# Makefile for build and installation

.PHONY: all build install uninstall clean dev check help web gateway tui

# Default target
all: build

# Build all packages
build:
	@echo "Building PHA..."
	@cd packages/core && bun run build
	@cd packages/cli && bun run build
	@cd packages/web && bun run build
	@echo "✓ Build complete"

# Install dependencies and build
install:
	@echo "Installing dependencies..."
	@bun install --frozen-lockfile 2>/dev/null || bun install
	@$(MAKE) build
	@echo "✓ Installation complete"
	@echo ""
	@echo "Quick start:"
	@echo "  export ANTHROPIC_API_KEY=sk-ant-xxx"
	@echo "  bun run pha setup"
	@echo "  bun run pha tui --local"

# Install globally to ~/.local/bin
install-global: build
	@mkdir -p ~/.local/bin
	@echo '#!/bin/bash' > ~/.local/bin/pha
	@echo 'bun "$(CURDIR)/packages/cli/dist/main.js" "$$@"' >> ~/.local/bin/pha
	@chmod +x ~/.local/bin/pha
	@echo "✓ Installed pha to ~/.local/bin/pha"
	@echo ""
	@if [[ ":$$PATH:" != *":$$HOME/.local/bin:"* ]]; then \
		echo "Add to your shell config:"; \
		echo '  export PATH="$$HOME/.local/bin:$$PATH"'; \
	fi

# Uninstall global command
uninstall:
	@rm -f ~/.local/bin/pha
	@echo "✓ Removed ~/.local/bin/pha"

# Clean build artifacts
clean:
	@echo "Cleaning..."
	@rm -rf packages/*/dist
	@echo "✓ Clean complete"

# Deep clean (including node_modules)
clean-all: clean
	@rm -rf node_modules packages/*/node_modules
	@echo "✓ Deep clean complete"

# Development mode
dev:
	@cd packages/cli && bun run dev

# Type check
check:
	@echo "Running type checks..."
	@cd packages/core && bun run check 2>/dev/null || true
	@cd packages/cli && bun run check 2>/dev/null || true
	@cd packages/web && bun run check 2>/dev/null || true

# Run CLI
run:
	@bun packages/cli/dist/main.js $(ARGS)

# Start gateway
gateway:
	@bun packages/cli/dist/main.js gateway start

# Start TUI
tui:
	@bun packages/cli/dist/main.js tui --local

# Start Web UI dev server
web:
	@cd packages/web && bun run dev

# Show help
help:
	@echo "PHA Makefile targets:"
	@echo ""
	@echo "  make              Build all packages"
	@echo "  make install      Install dependencies and build"
	@echo "  make install-global  Install 'pha' command to ~/.local/bin"
	@echo "  make uninstall    Remove global 'pha' command"
	@echo "  make clean        Remove build artifacts"
	@echo "  make clean-all    Remove build artifacts and node_modules"
	@echo "  make dev          Run CLI in development mode"
	@echo "  make check        Run type checks"
	@echo "  make gateway      Start gateway server"
	@echo "  make tui          Start TUI (local mode)"
	@echo "  make web          Start Web UI dev server"
	@echo "  make run ARGS=... Run CLI with arguments"
	@echo ""
	@echo "Examples:"
	@echo "  make run ARGS='health'"
	@echo "  make run ARGS='tools list'"
