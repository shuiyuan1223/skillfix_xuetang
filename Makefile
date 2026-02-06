# PHA - Personal Health Agent
# Installation Makefile

PREFIX ?= $(HOME)/.local
BINDIR ?= $(PREFIX)/bin

.PHONY: all install uninstall clean check-deps help sync sync-dist

# Default target
all: help

# Remote sync target (user@host:path)
REMOTE ?=

# Help message
help:
	@echo "PHA - Personal Health Agent"
	@echo ""
	@echo "Usage:"
	@echo "  make install    - Install PHA (checks dependencies first)"
	@echo "  make uninstall  - Remove PHA"
	@echo "  make build      - Build without installing"
	@echo "  make clean      - Clean build artifacts"
	@echo "  make test       - Run tests"
	@echo "  make sync REMOTE=user@host:path       - Git pull and rsync source to remote"
	@echo "  make sync-dist REMOTE=user@host:path  - Sync with pre-built dist"
	@echo ""
	@echo "Prerequisites:"
	@echo "  - Bun (https://bun.sh)"
	@echo ""

# Check for required dependencies
check-deps:
	@echo "Checking dependencies..."
	@command -v bun >/dev/null 2>&1 || { \
		echo ""; \
		echo "Error: Bun is not installed."; \
		echo ""; \
		echo "Please install Bun first:"; \
		echo "  curl -fsSL https://bun.sh/install | bash"; \
		echo ""; \
		echo "After installation, restart your terminal or run:"; \
		echo "  source ~/.bashrc  # or ~/.zshrc"; \
		echo ""; \
		exit 1; \
	}
	@echo "  Bun: $$(bun --version)"
	@echo "Dependencies OK."

# Install dependencies and build
build: check-deps
	@echo ""
	@echo "Installing dependencies..."
	@bun install
	@cd ui && bun install
	@echo ""
	@echo "Building project..."
	@bun run build
	@echo ""
	@echo "Build complete."

# Run tests
test: check-deps
	@bun test

# Install pha command
install: build
	@echo ""
	@echo "Installing pha to $(BINDIR)..."
	@mkdir -p $(BINDIR)
	@echo '#!/bin/bash' > $(BINDIR)/pha
	@echo 'exec bun "$(CURDIR)/dist/cli.js" "$$@"' >> $(BINDIR)/pha
	@chmod +x $(BINDIR)/pha
	@echo ""
	@echo "============================================"
	@echo "  PHA installed successfully!"
	@echo "============================================"
	@echo ""
	@echo "Make sure $(BINDIR) is in your PATH:"
	@echo ""
	@echo '  export PATH="$$HOME/.local/bin:$$PATH"'
	@echo ""
	@echo "Add this line to your ~/.bashrc or ~/.zshrc"
	@echo ""
	@echo "Then run:"
	@echo "  pha --help       # Show help"
	@echo "  pha onboard      # First-time setup"
	@echo "  pha start        # Start server"
	@echo ""

# Uninstall pha command
uninstall:
	@rm -f $(BINDIR)/pha
	@echo "Removed pha from $(BINDIR)"

# Clean build artifacts
clean:
	@rm -rf dist ui/dist node_modules
	@echo "Cleaned."

# Sync to remote server (incremental)
# Usage: make sync REMOTE=user@host:/path/to/pha
sync:
ifndef REMOTE
	@echo "Error: REMOTE not specified"
	@echo "Usage: make sync REMOTE=user@host:/path/to/pha"
	@exit 1
endif
	@echo "==> Git pull..."
	@git pull
	@echo ""
	@echo "==> Syncing to $(REMOTE)..."
	@rsync -avz --progress --delete \
		--exclude 'node_modules' \
		--exclude '.git' \
		--exclude 'dist' \
		--exclude 'ui/dist' \
		--exclude 'ui/node_modules' \
		--exclude '.pha' \
		--exclude '.env' \
		--exclude '*.log' \
		./ $(REMOTE)/
	@echo ""
	@echo "==> Sync complete!"
	@echo "Run on remote: cd <path> && bun install && bun run build"

# Sync with dist (pre-built version)
sync-dist:
ifndef REMOTE
	@echo "Error: REMOTE not specified"
	@echo "Usage: make sync-dist REMOTE=user@host:/path/to/pha"
	@exit 1
endif
	@echo "==> Git pull..."
	@git pull
	@echo ""
	@echo "==> Building locally..."
	@bun run build
	@echo ""
	@echo "==> Syncing to $(REMOTE) (with dist)..."
	@rsync -avz --progress --delete \
		--exclude 'node_modules' \
		--exclude '.git' \
		--exclude 'ui/node_modules' \
		--exclude '.pha' \
		--exclude '.env' \
		--exclude '*.log' \
		./ $(REMOTE)/
	@echo ""
	@echo "==> Sync complete! (with pre-built dist)"
	@echo "Run on remote: cd <path> && bun install && pha start"
