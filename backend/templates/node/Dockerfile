# =============================================================================
# Node.js Development Environment with Code-Server and OpenCode
# =============================================================================
#
# Built-in template: node
#
# This Dockerfile creates a Node.js development environment with:
# - Code-server (VS Code in browser) on port 8080
# - OpenCode (AI coding assistant) on port 4096
# - Terminal (ttyd + Oh My Zsh) on port 7681
# - Node.js runtime with npm install and configurable dev server
#
# The repository code is copied at build time into /repository.
# npm install is run automatically. A dev server can be started via
# the APP_START_COMMAND environment variable (default: npm run dev).
#
# Extends: ghcr.io/rearch-engineer/rearch-agent-base
# Supervisor programs inherited: vscode, opencode, terminal
# Supervisor programs added: app
#
# =============================================================================

FROM ghcr.io/rearch-engineer/rearch-agent-base:latest

# =============================================================================
# 1. Install Nodemon globally
# =============================================================================
RUN npm i -g nodemon

# =============================================================================
# 2. Copy repository code
# =============================================================================
COPY --chown=coder:coder . /repository

# =============================================================================
# 3. Install project dependencies
# =============================================================================
WORKDIR /repository
RUN if [ -f package.json ]; then su - coder -c "cd /repository && npm install"; fi

# =============================================================================
# 4. Ensure proper HOME directory permissions
# =============================================================================
RUN chown -R coder:coder /home/coder

# =============================================================================
# 5. Copy and setup entrypoint script
# =============================================================================
COPY .rearch/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# =============================================================================
# 6. Add Supervisor program: app (configurable dev server)
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
# 7. Environment Variables with Defaults
# =============================================================================
ENV APP_START_COMMAND="npm run dev"
ENV APP_PORT="3000"

# =============================================================================
# 8. Expose Ports
# =============================================================================
# 8080: VS Code Web Interface (code-server)
# 4096: OpenCode Server API
# 3000: Application dev server (default, configurable via APP_PORT)
# 7681: Terminal (ttyd + Oh My Zsh)
EXPOSE 8080 4096 3000 7681

# =============================================================================
# 9. Start via Entrypoint
# =============================================================================
WORKDIR /repository
ENTRYPOINT ["/entrypoint.sh"]
