# PHA - Personal Health Agent
# Installation Makefile

PREFIX ?= $(HOME)/.local
BINDIR ?= $(PREFIX)/bin

.PHONY: all install uninstall clean check-deps help sync sync-dist sync-win

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
	@echo "  make sync REMOTE=user@host:path       - Sync, build, install and restart on remote"
	@echo "  make sync-dist REMOTE=user@host:path  - Sync pre-built dist and restart on remote"
	@echo "  make sync-win REMOTE=user@host:path  - Sync via tar+ssh (no rsync needed)"
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

# Sync to remote server (incremental) + install + restart
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
	@echo "==> Installing on remote..."
	$(eval REMOTE_HOST := $(shell echo $(REMOTE) | cut -d: -f1))
	$(eval REMOTE_PATH := $(shell echo $(REMOTE) | cut -d: -f2))
	@ssh $(REMOTE_HOST) "cd $(REMOTE_PATH) && make install"
	@echo ""
	@echo "==> Restarting service on remote..."
	@ssh $(REMOTE_HOST) "pkill -f 'bun.*dist/cli' 2>/dev/null || true; cd $(REMOTE_PATH) && nohup pha start > /tmp/pha.log 2>&1 &"
	@sleep 2
	@ssh $(REMOTE_HOST) "pgrep -f 'bun.*dist/cli' && echo 'PHA restarted successfully!' || echo 'Warning: PHA may not have started'"
	@echo ""
	@echo "==> Sync complete!"

# Sync with dist (pre-built version) + install + restart
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
	@echo "==> Installing dependencies on remote..."
	$(eval REMOTE_HOST := $(shell echo $(REMOTE) | cut -d: -f1))
	$(eval REMOTE_PATH := $(shell echo $(REMOTE) | cut -d: -f2))
	@ssh $(REMOTE_HOST) "cd $(REMOTE_PATH) && bun install"
	@echo ""
	@echo "==> Restarting service on remote..."
	@ssh $(REMOTE_HOST) "pkill -f 'bun.*dist/cli' 2>/dev/null || true; cd $(REMOTE_PATH) && nohup pha start > /tmp/pha.log 2>&1 &"
	@sleep 2
	@ssh $(REMOTE_HOST) "pgrep -f 'bun.*dist/cli' && echo 'PHA restarted successfully!' || echo 'Warning: PHA may not have started'"
	@echo ""
	@echo "==> Sync complete!"

# Sync to remote via tar + SSH (Windows compatible, no rsync needed)
# Usage: make sync-win REMOTE=user@host:/path/to/pha
sync-win:
ifndef REMOTE
	@echo "Error: REMOTE not specified"
	@echo "Usage: make sync-win REMOTE=user@host:/path/to/pha"
	@exit 1
endif
	@echo "==> Git pull..."
	@git pull
	@echo ""
	@echo "==> Packing source..."
	@tar czf pha-sync.tar.gz \
		--exclude='node_modules' \
		--exclude='.git' \
		--exclude='dist' \
		--exclude='ui/dist' \
		--exclude='ui/node_modules' \
		--exclude='.env' \
		--exclude='*.log' \
		--exclude='pha-sync.tar.gz' \
		.
	@echo ""
	$(eval _HOST := $(firstword $(subst :, ,$(REMOTE))))
	$(eval _PATH := $(word 2,$(subst :, ,$(REMOTE))))
	@echo "==> Uploading to $(_HOST):$(_PATH)..."
	cmd /c scp pha-sync.tar.gz $(_HOST):$(_PATH)/pha-sync.tar.gz
	-@del pha-sync.tar.gz 2>nul
	@echo ""
	@echo "==> Extracting on remote..."
	cmd /c ssh $(_HOST) "cd $(_PATH) && tar xzf pha-sync.tar.gz && rm -f pha-sync.tar.gz"
	@echo ""
	@echo "==> Installing on remote..."
	cmd /c ssh $(_HOST) "cd $(_PATH) && make install"
	@echo ""
	@echo "==> Restarting service on remote..."
	cmd /c ssh $(_HOST) "pkill -f 'bun.*dist/cli' 2>/dev/null || true; cd $(_PATH) && nohup pha start > /tmp/pha.log 2>&1 &"
	@ping -n 3 127.0.0.1 >nul 2>&1
	cmd /c ssh $(_HOST) "pgrep -f 'bun.*dist/cli' && echo 'PHA restarted successfully!' || echo 'Warning: PHA may not have started'"
	@echo ""
	@echo "==> Sync complete!"
