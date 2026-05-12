# =============================================================================
# Projects Development Environment with PostgreSQL, pgweb, Code-Server & OpenCode
# =============================================================================
#
# This Dockerfile creates a development environment with:
# - PostgreSQL 15 database server on port 5432
# - pgweb (PostgreSQL web UI) on port 8081
# - Backend (Express/TypeScript via tsx watch) on port 3000
# - Frontend (Vite React dev server) on port 4200
# - Code-server (VS Code in browser) on port 8080
# - OpenCode (AI coding assistant) on port 4096
# - Terminal (ttyd + Oh My Zsh) on port 7681
#
# ENVIRONMENT VARIABLES (passed at runtime):
# - REPOSITORY_URL (optional): Git repository URL (metadata for coding agent)
# - REPOSITORY_BRANCH (optional, default: main): Branch name
# - GIT_USER_EMAIL (optional, default: rearch.bot.external@lab34.es): Git user.email
# - GIT_USER_NAME (optional, default: ReArch): Git user.name
# - GIT_TOKEN (optional): For git push authentication
# - CONVERSATION_ID (optional): OpenCode session tracking
#
# BUILD FROM REPOSITORY ROOT:
#   docker build -f .rearch/Dockerfile -t projects .
#
# Extends: ghcr.io/rearch-engineer/rearch-agent-base
# Supervisor programs inherited: vscode, opencode (overridden), terminal
# Supervisor programs added: postgres, pgweb, backend, frontend
#
# =============================================================================

FROM ghcr.io/rearch-engineer/rearch-agent-base:latest

# =============================================================================
# 1. Install PostgreSQL and additional dependencies
# =============================================================================
RUN apt-get update && apt-get install -y \
    postgresql \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# =============================================================================
# 2. Install Playwright (Chromium only) for browser automation tools
# =============================================================================
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/playwright-browsers
RUN npx playwright install --with-deps chromium && \
    chmod -R 755 /opt/playwright-browsers

# =============================================================================
# 3. Install Nodemon globally
# =============================================================================
RUN npm i -g nodemon

# =============================================================================
# 4. Install pgweb (PostgreSQL web UI)
# =============================================================================
RUN curl -fsSL https://github.com/sosedoff/pgweb/releases/download/v0.16.2/pgweb_linux_amd64.zip -o /tmp/pgweb.zip && \
    apt-get update && apt-get install -y unzip && \
    unzip /tmp/pgweb.zip -d /usr/local/bin/ && \
    chmod +x /usr/local/bin/pgweb_linux_amd64 && \
    mv /usr/local/bin/pgweb_linux_amd64 /usr/local/bin/pgweb && \
    rm /tmp/pgweb.zip && \
    apt-get purge -y unzip && apt-get autoremove -y && \
    rm -rf /var/lib/apt/lists/*

# =============================================================================
# 5. Copy repository code
# =============================================================================
COPY --chown=coder:coder . /repository

# =============================================================================
# 6. Install backend dependencies
# =============================================================================
WORKDIR /repository/backend
RUN su - coder -c "cd /repository/backend && npm install"

# =============================================================================
# 7. Install frontend dependencies
# =============================================================================
WORKDIR /repository/frontend
RUN su - coder -c "cd /repository/frontend && npm install"

# =============================================================================
# 8. Copy custom OpenCode tools (browser automation suite)
# =============================================================================
# These tools provide Playwright-based browser automation capabilities:
# - browser_screenshot: Take screenshots of running web pages
# - browser_navigate: Navigate to URLs, go back/forward/reload
# - browser_click: Click elements by CSS selector or text
# - browser_type: Type text into input fields, press keys
# - browser_evaluate: Execute JavaScript in the page context
# - browser_wait: Wait for elements, URLs, or fixed delays
# - browser_close: Close the persistent browser instance
COPY --chown=coder:coder .rearch/agent-tools/ /home/coder/.config/opencode/tools/
COPY --chown=coder:coder .rearch/opencode-package.json /home/coder/.config/opencode/package.json

# =============================================================================
# 9. Ensure proper HOME directory permissions
# =============================================================================
RUN chown -R coder:coder /home/coder

# =============================================================================
# 10. Copy and setup entrypoint script
# =============================================================================
COPY .rearch/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# =============================================================================
# 11. Override Supervisor program: opencode (add PLAYWRIGHT_BROWSERS_PATH)
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
# 12. Add Supervisor programs: postgres, pgweb, backend, frontend
# =============================================================================
RUN echo '[program:postgres]\n\
command=/usr/lib/postgresql/15/bin/postgres -D /var/lib/postgresql/15/main -c config_file=/etc/postgresql/15/main/postgresql.conf\n\
user=postgres\n\
autostart=true\n\
autorestart=true\n\
priority=5\n\
stdout_logfile=/var/log/supervisor/postgres.log\n\
stderr_logfile=/var/log/supervisor/postgres.err\n\
' > /etc/supervisor/conf.d/postgres.conf

RUN echo '[program:pgweb]\n\
command=pgweb --bind=0.0.0.0 --listen=8081 --url postgresql://postgres:postgres@localhost:5432/main_database\n\
user=coder\n\
environment=HOME="/home/coder"\n\
directory=/repository\n\
autostart=true\n\
autorestart=true\n\
startsecs=5\n\
startretries=999\n\
priority=15\n\
stdout_logfile=/var/log/supervisor/pgweb.log\n\
stderr_logfile=/var/log/supervisor/pgweb.err\n\
' > /etc/supervisor/conf.d/pgweb.conf

RUN echo '[program:backend]\n\
command=/bin/bash -c "npm run dev"\n\
user=coder\n\
environment=HOME="/home/coder",NODE_ENV="development"\n\
directory=/repository/backend\n\
autostart=true\n\
autorestart=true\n\
startsecs=5\n\
startretries=999\n\
priority=20\n\
stdout_logfile=/var/log/supervisor/backend.log\n\
stderr_logfile=/var/log/supervisor/backend.err\n\
' > /etc/supervisor/conf.d/backend.conf

RUN echo '[program:frontend]\n\
command=/bin/bash -c "npm run dev -- --host 0.0.0.0"\n\
user=coder\n\
environment=HOME="/home/coder",NODE_ENV="development"\n\
directory=/repository/frontend\n\
autostart=true\n\
autorestart=true\n\
startsecs=5\n\
startretries=999\n\
priority=25\n\
stdout_logfile=/var/log/supervisor/frontend.log\n\
stderr_logfile=/var/log/supervisor/frontend.err\n\
' > /etc/supervisor/conf.d/frontend.conf

# =============================================================================
# 13. Expose Ports
# =============================================================================
# 3000: Backend API (Express)
# 4200: Frontend (Vite dev server)
# 8081: pgweb (PostgreSQL web UI)
# 8080: VS Code Web Interface (code-server)
# 4096: OpenCode Server API
# 7681: Terminal (ttyd + Oh My Zsh)
# Note: PostgreSQL (5432) is internal only, accessed via pgweb or container shell
EXPOSE 3000 4200 8081 8080 4096 7681

# =============================================================================
# 14. Start via Entrypoint
# =============================================================================
WORKDIR /repository
ENTRYPOINT ["/entrypoint.sh"]
