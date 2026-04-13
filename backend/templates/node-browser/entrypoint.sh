#!/bin/bash
# =============================================================================
# Entrypoint Script for Node.js + Browser Development Container
# =============================================================================
#
# Built-in template: node-browser
#
# This script handles:
# 1. Git configuration (for pushing changes)
# 2. Display configuration info
# 3. Start supervisor (which manages all services)
#
# =============================================================================

set -e

echo "=========================================="
echo "Container Initialization Starting"
echo "  Template: node-browser"
echo "=========================================="

# =============================================================================
# 1. Configure Git (for coding agent to push changes)
# =============================================================================
echo "[1/3] Configuring Git..."

GIT_USER_EMAIL="${GIT_USER_EMAIL:-rearch.bot.external@lab34.es}"
GIT_USER_NAME="${GIT_USER_NAME:-ReArch}"

su - coder -c "git config --global user.email '$GIT_USER_EMAIL'"
echo "  -> Git email configured: $GIT_USER_EMAIL"

su - coder -c "git config --global user.name '$GIT_USER_NAME'"
echo "  -> Git name configured: $GIT_USER_NAME"

if [ -n "$GIT_TOKEN" ]; then
    if [ "$GIT_PROVIDER" = "github" ]; then
        su - coder -c "git config --global url.\"https://x-access-token:${GIT_TOKEN}@github.com/\".insteadOf \"https://github.com/\""
        su - coder -c "git config --global url.\"https://x-access-token:${GIT_TOKEN}@github.com/\".insteadOf \"git@github.com:\""
        echo "  -> Git credentials configured for GitHub"
    else
        su - coder -c "git config --global url.\"https://x-token-auth:${GIT_TOKEN}@bitbucket.org/\".insteadOf \"https://bitbucket.org/\""
        su - coder -c "git config --global url.\"https://x-token-auth:${GIT_TOKEN}@bitbucket.org/\".insteadOf \"git@bitbucket.org:\""
        echo "  -> Git credentials configured for Bitbucket"
    fi
fi

# =============================================================================
# 2. Write OpenCode config (before supervisord starts opencode)
# =============================================================================
echo "[2/3] Configuring OpenCode..."

if [ -n "$OPENCODE_CONFIG_CONTENT" ]; then
    mkdir -p /home/coder/.config/opencode
    echo "$OPENCODE_CONFIG_CONTENT" > /home/coder/.config/opencode/opencode.json
    chown -R coder:coder /home/coder/.config/opencode
    echo "  -> OpenCode config written"
else
    echo "  -> OPENCODE_CONFIG_CONTENT not set, skipping"
fi

# =============================================================================
# 3. Start Services
# =============================================================================
echo "[3/3] Starting services..."

echo "=========================================="
echo "Container Configuration:"
echo "  - Repository URL: ${REPOSITORY_URL:-'Not set'}"
echo "  - Repository Branch: ${REPOSITORY_BRANCH:-main}"
echo "  - App Start Command: ${APP_START_COMMAND:-'npm run dev'}"
echo "  - App Port: ${APP_PORT:-3000}"
echo "  - Browser Automation: Playwright + Chromium enabled"
echo "=========================================="
echo "Services:"
echo "  - Code-server (VS Code): http://localhost:8080"
echo "  - OpenCode API: http://localhost:4096"
echo "  - Application: http://localhost:${APP_PORT:-3000}"
echo "=========================================="
echo ""

# Start supervisor (it will manage all services)
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
