# =============================================================================
# Minimal Development Environment with Code-Server and OpenCode
# =============================================================================
#
# Built-in template: minimal
#
# This Dockerfile creates a minimal development environment with:
# - Code-server (VS Code in browser) on port 8080
# - OpenCode (AI coding assistant) on port 4096
#
# The repository code is copied at build time into /repository.
# No language-specific tooling or dependency installation is performed.
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
    iputils-ping \
    ca-certificates \
    sudo \
    && rm -rf /var/lib/apt/lists/*

# =============================================================================
# 2. Install Code-Server
# =============================================================================
RUN curl -fsSL https://code-server.dev/install.sh | sh

# =============================================================================
# 3. Install OpenCode globally
# =============================================================================
RUN npm i -g opencode-ai

# =============================================================================
# 4. Create the "coder" user and setup directories
# =============================================================================
RUN useradd -m -s /bin/bash coder && \
    echo "coder ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers && \
    mkdir -p /repository && \
    chown -R coder:coder /repository && \
    mkdir -p /home/coder/.config/code-server && \
    chown -R coder:coder /home/coder/.config

# =============================================================================
# 5. Copy repository code
# =============================================================================
COPY --chown=coder:coder . /repository

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
# 8. Create Supervisor Configuration
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
environment=HOME="/home/coder"\n\
directory=/repository\n\
autostart=true\n\
autorestart=true\n\
priority=10\n\
stdout_logfile=/var/log/supervisor/opencode.log\n\
stderr_logfile=/var/log/supervisor/opencode.err\n\
' > /etc/supervisor/conf.d/supervisord.conf

# =============================================================================
# 9. Environment Variables with Defaults
# =============================================================================
ENV REPOSITORY_BRANCH="main"

# =============================================================================
# 10. Expose Ports
# =============================================================================
# 8080: VS Code Web Interface (code-server)
# 4096: OpenCode Server API
EXPOSE 8080 4096

# =============================================================================
# 11. Start via Entrypoint
# =============================================================================
WORKDIR /repository
ENTRYPOINT ["/entrypoint.sh"]
