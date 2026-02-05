# PHA - Personal Health Agent
# Installation Makefile

PREFIX ?= $(HOME)/.local
BINDIR ?= $(PREFIX)/bin

.PHONY: all install uninstall clean check-deps help

# Default target
all: help

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
