# PHA - Personal Health Agent
# Installation Makefile

PREFIX ?= /usr/local
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

# Install pha command globally
install: build
	@echo "Installing pha to $(BINDIR)..."
	@mkdir -p $(BINDIR)
	@echo '#!/bin/bash' > $(BINDIR)/pha
	@echo 'exec bun "$(CURDIR)/packages/cli/dist/main.js" "$$@"' >> $(BINDIR)/pha
	@chmod +x $(BINDIR)/pha
	@echo "Done! Run 'pha --help' to get started."

# Uninstall pha command
uninstall:
	@echo "Removing pha from $(BINDIR)..."
	@rm -f $(BINDIR)/pha
	@echo "Done."

# Clean build artifacts
clean:
	@rm -rf packages/*/dist
	@echo "Cleaned."
