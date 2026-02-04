# PHA - Personal Health Agent
# Installation Makefile

PREFIX ?= $(HOME)/.local
BINDIR ?= $(PREFIX)/bin

.PHONY: all install uninstall clean

all: build

# Install dependencies and build
build:
	@echo "Installing dependencies..."
	@bun install
	@echo "Building..."
	@cd packages/core && bun run build
	@cd packages/cli && bun run build
	@echo "Build complete."

# Install pha command
install: build
	@echo "Installing pha to $(BINDIR)..."
	@mkdir -p $(BINDIR)
	@echo '#!/bin/bash' > $(BINDIR)/pha
	@echo 'exec bun "$(CURDIR)/packages/cli/dist/main.js" "$$@"' >> $(BINDIR)/pha
	@chmod +x $(BINDIR)/pha
	@echo ""
	@echo "Installed! Make sure $(BINDIR) is in your PATH:"
	@echo '  export PATH="$$HOME/.local/bin:$$PATH"'
	@echo ""
	@echo "Then run: pha --help"

# Uninstall pha command
uninstall:
	@rm -f $(BINDIR)/pha
	@echo "Removed pha from $(BINDIR)"

# Clean build artifacts
clean:
	@rm -rf packages/*/dist
	@echo "Cleaned."
