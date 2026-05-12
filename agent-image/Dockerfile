# =============================================================================
# ReArch Agent Base Image
# =============================================================================
#
# Base Docker image for all ReArch dev container templates.
# Provides the common foundation that every agent environment needs:
#
# - Code-server (VS Code in browser)
# - OpenCode (AI coding assistant)
# - ttyd (web-based terminal)
# - Oh My Zsh shell environment
# - System utilities (git, curl, vim, nano, jq, htop, etc.)
# - Supervisor process manager
# - Non-root "coder" user with sudo access
#
# Templates extend this image to add language-specific tooling,
# supervisor configurations, and repository code.
#
# Published to: ghcr.io/rearch-engineer/rearch-agent-base
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
    vim \
    nano \
    wget \
    jq \
    htop \
    zip \
    unzip \
    tar \
    rsync \
    zsh \
    && rm -rf /var/lib/apt/lists/*

# =============================================================================
# 2. Install ttyd (web-based terminal)
# =============================================================================
RUN ARCH=$(dpkg --print-architecture) && \
    case "$ARCH" in \
      amd64) TTYD_ARCH="x86_64" ;; \
      arm64) TTYD_ARCH="aarch64" ;; \
      armhf) TTYD_ARCH="armhf" ;; \
      *) TTYD_ARCH="$ARCH" ;; \
    esac && \
    wget -qO /usr/local/bin/ttyd \
      "https://github.com/tsl0922/ttyd/releases/latest/download/ttyd.${TTYD_ARCH}" && \
    chmod +x /usr/local/bin/ttyd

# =============================================================================
# 3. Install Code-Server (VS Code in browser)
# =============================================================================
RUN curl -fsSL https://code-server.dev/install.sh | sh

# =============================================================================
# 4. Install OpenCode globally
# =============================================================================
RUN npm i -g opencode-ai

# =============================================================================
# 5. Create the "coder" user and setup directories
# =============================================================================
RUN useradd -m -s /bin/zsh coder && \
    echo "coder ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers && \
    mkdir -p /repository && \
    chown -R coder:coder /repository && \
    mkdir -p /home/coder/.config/code-server && \
    chown -R coder:coder /home/coder/.config

# =============================================================================
# 6. Install Oh My Zsh for the coder user
# =============================================================================
USER coder
RUN sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended
USER root

# =============================================================================
# 7. Prepare supervisor log directory
# =============================================================================
RUN mkdir -p /var/log/supervisor

# =============================================================================
# 8. Create Supervisor base configuration
# =============================================================================
# Main supervisord settings.
#
# IMPORTANT: this file lives at /etc/supervisor/supervisord.conf (NOT inside
# conf.d/) and explicitly includes every *.conf file under conf.d/.  Templates
# that extend this image add their own program configs into
# /etc/supervisor/conf.d/ and rely on the [include] glob below to be picked
# up at launch.
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
[include]\n\
files = /etc/supervisor/conf.d/*.conf\n\
' > /etc/supervisor/supervisord.conf

# VS Code (code-server) on port 8080
RUN echo '[program:vscode]\n\
command=code-server --bind-addr 0.0.0.0:8080 --auth none /repository\n\
user=coder\n\
environment=HOME="/home/coder"\n\
directory=/repository\n\
autostart=true\n\
autorestart=true\n\
priority=10\n\
stdout_logfile=/var/log/supervisor/vscode.log\n\
stderr_logfile=/var/log/supervisor/vscode.err\n\
' > /etc/supervisor/conf.d/vscode.conf

# OpenCode (AI coding assistant) on port 4096
RUN echo '[program:opencode]\n\
command=opencode serve --hostname 0.0.0.0 --port 4096\n\
user=coder\n\
environment=HOME="/home/coder"\n\
directory=/repository\n\
autostart=true\n\
autorestart=true\n\
priority=10\n\
stdout_logfile=/var/log/supervisor/opencode.log\n\
stderr_logfile=/var/log/supervisor/opencode.err\n\
' > /etc/supervisor/conf.d/opencode.conf

# Terminal (ttyd + Oh My Zsh) on port 7681
RUN echo '[program:terminal]\n\
command=ttyd --port 7681 --writable zsh\n\
user=coder\n\
environment=HOME="/home/coder",TERM="xterm-256color"\n\
directory=/repository\n\
autostart=true\n\
autorestart=true\n\
priority=10\n\
stdout_logfile=/var/log/supervisor/terminal.log\n\
stderr_logfile=/var/log/supervisor/terminal.err\n\
' > /etc/supervisor/conf.d/terminal.conf

# =============================================================================
# 9. Default environment variables
# =============================================================================
ENV REPOSITORY_BRANCH="main"
