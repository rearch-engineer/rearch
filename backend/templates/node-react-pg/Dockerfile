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
#
# ENVIRONMENT VARIABLES (passed at runtime):
# - ANTHROPIC_API_KEY (required): API key for OpenCode
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
# =============================================================================

FROM node:22

# =============================================================================
# 1. Install System Dependencies
# =============================================================================
RUN apt-get update && apt-get install -y \
    supervisor \
    build-essential \
    python3 \
    git \
    curl \
    postgresql \
    postgresql-client \
    vim \
    nano \
    wget \
    jq \
    htop \
    zip \
    unzip \
    tar \
    rsync \
    && rm -rf /var/lib/apt/lists/*

# =============================================================================
# 2. Install Code-Server
# =============================================================================
RUN curl -fsSL https://code-server.dev/install.sh | sh

# =============================================================================
# 3. Install Playwright (Chromium only) for browser automation tools
# =============================================================================
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/playwright-browsers
RUN npx playwright install --with-deps chromium && \
    chmod -R 755 /opt/playwright-browsers

# =============================================================================
# 4. Install OpenCode and Nodemon globally
# =============================================================================
RUN npm i -g opencode-ai nodemon

# =============================================================================
# 5. Install pgweb (PostgreSQL web UI)
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
# 6. Create the "coder" user and setup directories
# =============================================================================
RUN useradd -m -s /bin/bash coder && \
    mkdir -p /repository && \
    chown -R coder:coder /repository && \
    echo 'root:root' | chpasswd

# =============================================================================
# 7. Copy repository code
# =============================================================================
COPY --chown=coder:coder . /repository

# =============================================================================
# 8. Install backend dependencies
# =============================================================================
WORKDIR /repository/backend
RUN su - coder -c "cd /repository/backend && npm install"

# =============================================================================
# 9. Install frontend dependencies
# =============================================================================
WORKDIR /repository/frontend
RUN su - coder -c "cd /repository/frontend && npm install"

# =============================================================================
# 10. Copy custom OpenCode tools (browser automation suite)
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
# 10.1. Ensure proper HOME directory permissions
# =============================================================================
RUN chown -R coder:coder /home/coder

# =============================================================================
# 11. Copy and setup entrypoint script
# =============================================================================
COPY .rearch/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# =============================================================================
# 12. Create Supervisor Configuration
# =============================================================================
RUN mkdir -p /var/log/supervisor
RUN echo '[unix_http_server]\n\
file=/var/run/supervisor.sock\n\
chmod=0700\n\
\n\
[rpcinterface:supervisor]\n\
supervisor.rpcinterface_factory = supervisor.rpcinterface:make_main_rpcinterface\n\
\n\
[supervisorctl]\n\
serverurl=unix:///var/run/supervisor.sock\n\
\n\
[supervisord]\n\
nodaemon=true\n\
user=root\n\
\n\
[program:postgres]\n\
command=/usr/lib/postgresql/15/bin/postgres -D /var/lib/postgresql/15/main -c config_file=/etc/postgresql/15/main/postgresql.conf\n\
user=postgres\n\
autostart=true\n\
autorestart=true\n\
priority=5\n\
stdout_logfile=/var/log/supervisor/postgres.log\n\
stderr_logfile=/var/log/supervisor/postgres.err\n\
\n\
[program:vscode]\n\
command=code-server --bind-addr 0.0.0.0:8080 --auth none /repository\n\
user=coder\n\
environment=HOME="/home/coder"\n\
directory=/repository\n\
autostart=true\n\
autorestart=true\n\
priority=10\n\
stdout_logfile=/var/log/supervisor/vscode.log\n\
stderr_logfile=/var/log/supervisor/vscode.err\n\
\n\
[program:opencode]\n\
command=opencode serve --hostname 0.0.0.0 --port 4096\n\
user=coder\n\
environment=HOME="/home/coder",PLAYWRIGHT_BROWSERS_PATH="/opt/playwright-browsers"\n\
directory=/repository\n\
autostart=true\n\
autorestart=true\n\
priority=10\n\
stdout_logfile=/var/log/supervisor/opencode.log\n\
stderr_logfile=/var/log/supervisor/opencode.err\n\
\n\
[program:pgweb]\n\
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
\n\
[program:backend]\n\
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
\n\
[program:frontend]\n\
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
' > /etc/supervisor/conf.d/supervisord.conf

# =============================================================================
# 13. Environment Variables with Defaults
# =============================================================================
ENV REPOSITORY_BRANCH="main"

# =============================================================================
# 14. Expose Ports
# =============================================================================
# 3000: Backend API (Express)
# 4200: Frontend (Vite dev server)
# 8081: pgweb (PostgreSQL web UI)
# 8080: VS Code Web Interface (code-server)
# 4096: OpenCode Server API
# Note: PostgreSQL (5432) is internal only, accessed via pgweb or container shell
EXPOSE 3000 4200 8081 8080 4096

# =============================================================================
# 15. Start via Entrypoint
# =============================================================================
WORKDIR /repository
ENTRYPOINT ["/entrypoint.sh"]
