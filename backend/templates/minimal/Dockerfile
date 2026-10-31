# =============================================================================
# Minimal Development Environment with OpenCode
# =============================================================================
#
# Built-in template: minimal
#
# This Dockerfile creates a minimal development environment with:
# - OpenCode (AI coding assistant) on port 4096
# - Terminal (ttyd + Oh My Zsh) on port 7681
#
# The repository code is copied at build time into /repository.
# No language-specific tooling or dependency installation is performed.
#
# Extends: ghcr.io/rearch-engineer/rearch-agent-base
# Supervisor programs inherited: opencode, terminal
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
# 4096: OpenCode Server API
# 7681: Terminal (ttyd + Oh My Zsh)
EXPOSE 4096 7681

# =============================================================================
# 5. Start via Entrypoint
# =============================================================================
WORKDIR /repository
ENTRYPOINT ["/entrypoint.sh"]
