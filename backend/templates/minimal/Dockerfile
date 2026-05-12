# =============================================================================
# Minimal Development Environment with Code-Server and OpenCode
# =============================================================================
#
# Built-in template: minimal
#
# This Dockerfile creates a minimal development environment with:
# - Code-server (VS Code in browser) on port 8080
# - OpenCode (AI coding assistant) on port 4096
# - Terminal (ttyd + Oh My Zsh) on port 7681
#
# The repository code is copied at build time into /repository.
# No language-specific tooling or dependency installation is performed.
#
# Extends: ghcr.io/rearch-engineer/rearch-agent-base
# Supervisor programs inherited: vscode, opencode, terminal
#
# =============================================================================

FROM ghcr.io/rearch-engineer/rearch-agent-base:latest

# =============================================================================
# 1. Copy repository code
# =============================================================================
COPY --chown=coder:coder . /repository

# =============================================================================
# 2. Ensure proper HOME directory permissions
# =============================================================================
RUN chown -R coder:coder /home/coder

# =============================================================================
# 3. Copy and setup entrypoint script
# =============================================================================
COPY .rearch/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# =============================================================================
# 4. Expose Ports
# =============================================================================
# 8080: VS Code Web Interface (code-server)
# 4096: OpenCode Server API
# 7681: Terminal (ttyd + Oh My Zsh)
EXPOSE 8080 4096 7681

# =============================================================================
# 5. Start via Entrypoint
# =============================================================================
WORKDIR /repository
ENTRYPOINT ["/entrypoint.sh"]
