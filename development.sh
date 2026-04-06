#!/usr/bin/env bash
set -eu

# ------------------------------------------------------------------
# development.sh — ReArch Development Server
#
# Launches the interactive TUI dashboard that manages:
#   Docker (detached):  Redis, MongoDB
#   Local (foreground): mcp-proxy, backend, frontend
#
# The TUI provides live status, switchable log views, and controls.
# ------------------------------------------------------------------

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEVTOOLS_DIR="$ROOT_DIR/devtools"

# ------------------------------------------------------------------
# Ensure devtools dependencies are installed
# ------------------------------------------------------------------
if [ ! -d "$DEVTOOLS_DIR/node_modules" ]; then
  echo "Installing devtools dependencies..."
  (cd "$DEVTOOLS_DIR" && bun install)
  echo ""
fi

# ------------------------------------------------------------------
# Launch the TUI
# ------------------------------------------------------------------
exec bun run "$DEVTOOLS_DIR/src/index.ts"
