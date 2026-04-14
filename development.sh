#!/usr/bin/env bash
set -eu

# ------------------------------------------------------------------
# development.sh — ReArch CLI
#
# Usage: ./development.sh [command] [args]
#        ./development.sh start
#        ./development.sh logs
#        ./development.sh stop
#        ./development.sh help
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
# Run CLI — pass all arguments through
# ------------------------------------------------------------------
exec bun run "$DEVTOOLS_DIR/src/cli.ts" "$@"
