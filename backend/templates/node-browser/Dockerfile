# =============================================================================
# Node.js + Browser Development Environment with Code-Server and OpenCode
# =============================================================================
#
# Built-in template: node-browser
#
# This Dockerfile creates a Node.js development environment with:
# - Code-server (VS Code in browser) on port 8080
# - OpenCode (AI coding assistant) on port 4096
# - Terminal (ttyd + Oh My Zsh) on port 7681
# - Node.js runtime with npm install and configurable dev server
# - Playwright with Chromium for browser automation tools
#
# The repository code is copied at build time into /repository.
# npm install is run automatically. A dev server can be started via
# the APP_START_COMMAND environment variable (default: npm run dev).
#
# Extends: ghcr.io/rearch-engineer/rearch-agent-base
# Supervisor programs inherited: vscode, opencode (overridden), terminal
# Supervisor programs added: app
#
# =============================================================================

FROM ghcr.io/rearch-engineer/rearch-agent-base:latest

# =============================================================================
# 1. Install Playwright (Chromium only) for browser automation tools
# =============================================================================
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/playwright-browsers
RUN npx playwright install --with-deps chromium && \
    chmod -R 755 /opt/playwright-browsers

# =============================================================================
# 2. Install Nodemon globally
# =============================================================================
RUN npm i -g nodemon

# =============================================================================
# 3. Copy repository code
# =============================================================================
COPY --chown=coder:coder . /repository

# =============================================================================
# 4. Install project dependencies
# =============================================================================
WORKDIR /repository
RUN if [ -f package.json ]; then su - coder -c "cd /repository && npm install"; fi

# =============================================================================
# 5. Copy custom OpenCode tools (browser automation suite)
# =============================================================================
COPY --chown=coder:coder .rearch/agent-tools/ /home/coder/.config/opencode/tools/
COPY --chown=coder:coder .rearch/opencode-package.json /home/coder/.config/opencode/package.json

# =============================================================================
# 6. Ensure proper HOME directory permissions
# =============================================================================
RUN chown -R coder:coder /home/coder

# =============================================================================
# 7. Copy and setup entrypoint script
# =============================================================================
COPY .rearch/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# =============================================================================
# 8. Override Supervisor program: opencode (add PLAYWRIGHT_BROWSERS_PATH)
# =============================================================================
RUN echo '[program:opencode]\n\
command=opencode serve --hostname 0.0.0.0 --port 4096\n\
user=coder\n\
environment=HOME="/home/coder",PLAYWRIGHT_BROWSERS_PATH="/opt/playwright-browsers"\n\
directory=/repository\n\
autostart=true\n\
autorestart=true\n\
priority=10\n\
stdout_logfile=/var/log/supervisor/opencode.log\n\
stderr_logfile=/var/log/supervisor/opencode.err\n\
' > /etc/supervisor/conf.d/opencode.conf

# =============================================================================
# 9. Add Supervisor program: app (configurable dev server)
# =============================================================================
RUN echo '[program:app]\n\
command=/bin/bash -c "%(ENV_APP_START_COMMAND)s"\n\
user=coder\n\
environment=HOME="/home/coder",NODE_ENV="development"\n\
directory=/repository\n\
autostart=true\n\
autorestart=true\n\
startsecs=5\n\
startretries=999\n\
priority=20\n\
stdout_logfile=/var/log/supervisor/app.log\n\
stderr_logfile=/var/log/supervisor/app.err\n\
' > /etc/supervisor/conf.d/app.conf

# =============================================================================
# 10. Environment Variables with Defaults
# =============================================================================
ENV APP_START_COMMAND="npm run dev"
ENV APP_PORT="3000"

# =============================================================================
# 11. Expose Ports
# =============================================================================
# 8080: VS Code Web Interface (code-server)
# 4096: OpenCode Server API
# 3000: Application dev server (default, configurable via APP_PORT)
# 7681: Terminal (ttyd + Oh My Zsh)
EXPOSE 8080 4096 3000 7681

# =============================================================================
# 12. Start via Entrypoint
# =============================================================================
WORKDIR /repository
ENTRYPOINT ["/entrypoint.sh"]
