#!/bin/bash
# =============================================================================
# Entrypoint Script for Projects Development Container
# =============================================================================
#
# This script handles:
# 1. Git configuration (for pushing changes)
# 2. PostgreSQL initialization (cluster, database, user)
# 3. Environment file generation (backend & frontend .env)
# 4. Vite proxy configuration (frontend -> backend API routing)
# 5. Start supervisor (which manages all services)
#
# =============================================================================

set -e

echo "=========================================="
echo "Container Initialization Starting"
echo "=========================================="

# =============================================================================
# 1. Configure Git (for coding agent to push changes)
# =============================================================================
echo "[1/5] Configuring Git..."

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
# 2. Initialize PostgreSQL
# =============================================================================
echo "[2/5] Initializing PostgreSQL..."

PG_VERSION=15
PG_DATA="/var/lib/postgresql/${PG_VERSION}/main"
PG_CONF="/etc/postgresql/${PG_VERSION}/main"

# Configure PostgreSQL to allow local connections with password
echo "  -> Configuring pg_hba.conf..."
cat > "${PG_CONF}/pg_hba.conf" <<'PGHBA'
# TYPE  DATABASE        USER            ADDRESS                 METHOD
local   all             postgres                                trust
local   all             all                                     md5
host    all             all             127.0.0.1/32            md5
host    all             all             ::1/128                 md5
PGHBA
chown postgres:postgres "${PG_CONF}/pg_hba.conf"

# Configure PostgreSQL to listen on localhost
sed -i "s/#listen_addresses = 'localhost'/listen_addresses = 'localhost'/" "${PG_CONF}/postgresql.conf"

# Disable SSL (snakeoil cert not available in container)
sed -i "s/^ssl = on/ssl = off/" "${PG_CONF}/postgresql.conf"

# Start PostgreSQL temporarily to create the database
echo "  -> Starting PostgreSQL temporarily..."
pg_ctlcluster ${PG_VERSION} main start
if [ $? -ne 0 ]; then
    echo "  -> ERROR: PostgreSQL failed to start. Log output:"
    cat /var/log/postgresql/postgresql-${PG_VERSION}-main.log 2>/dev/null || echo "  -> No log file found"
    exit 1
fi

# Set password for postgres user and create the database
echo "  -> Setting up database..."
su - postgres -c "psql -c \"ALTER USER postgres WITH PASSWORD 'postgres';\""
su - postgres -c "psql -tc \"SELECT 1 FROM pg_database WHERE datname = 'main_database'\"" | grep -q 1 || \
    su - postgres -c "psql -c \"CREATE DATABASE main_database OWNER postgres;\""

echo "  -> Database 'main_database' ready"

# Stop PostgreSQL (supervisor will manage it)
pg_ctlcluster ${PG_VERSION} main stop
echo "  -> PostgreSQL initialized and stopped (supervisor will start it)"

# =============================================================================
# 3. Generate Backend .env
# =============================================================================
echo "[3/5] Generating backend .env..."

cat > /repository/backend/.env <<'BACKENDENV'
# PostgreSQL Connection (container-local)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/main_database

# Server Configuration
PORT=3000
NODE_ENV=development

# CORS Configuration
CORS_ORIGIN=*

# Authentication - skip OIDC in container dev environment
SKIP_AUTH=true

# JWT
JWT_SECRET=dev-secret-container
JWT_EXPIRATION=24h

# Admin Bootstrap
ADMIN_EMAILS=dev@localhost
BACKENDENV

chown coder:coder /repository/backend/.env
echo "  -> Backend .env written"

# =============================================================================
# 4. Generate Frontend .env and Vite Proxy Configuration
# =============================================================================
echo "[4/5] Configuring frontend..."

# Write frontend .env with empty VITE_API_URL (uses relative URLs via Vite proxy)
cat > /repository/frontend/.env <<'FRONTENDENV'
# API URL is empty - requests are proxied through Vite dev server
VITE_API_URL=
VITE_SKIP_AUTH=true
FRONTENDENV

chown coder:coder /repository/frontend/.env
echo "  -> Frontend .env written"

# Patch vite.config.ts to add proxy rules for backend API routes
echo "  -> Patching vite.config.ts with proxy configuration..."

# Write the patch script to a temp file to avoid bash escaping issues
cat > /tmp/patch-vite.js <<'VITEPATCH'
const fs = require('fs');
const configPath = '/repository/frontend/vite.config.ts';
let content = fs.readFileSync(configPath, 'utf8');

// Check if proxy is already configured
if (content.includes('proxy:')) {
  console.log('  -> Vite proxy already configured, skipping patch');
  process.exit(0);
}

// Replace the server block to add proxy configuration
const oldServer = `server: {
    allowedHosts: true,
    port: 4200,
  },`;

const newServer = `server: {
    allowedHosts: true,
    port: 4200,
    proxy: {
      '/auth': 'http://localhost:3000',
      '/forms': 'http://localhost:3000',
      '/submit': 'http://localhost:3000',
      '/search': 'http://localhost:3000',
      '/projects': 'http://localhost:3000',
      '/partners': 'http://localhost:3000',
      '/flows': 'http://localhost:3000',
      '/files': 'http://localhost:3000',
      '/admin': 'http://localhost:3000',
      '/health': 'http://localhost:3000',
    },
  },`;

if (content.includes(oldServer)) {
  content = content.replace(oldServer, newServer);
  fs.writeFileSync(configPath, content, 'utf8');
  console.log('  -> Vite proxy configuration added successfully');
} else {
  console.error('  -> WARNING: Could not match server block in vite.config.ts');
  console.error('  -> Expected to find:');
  console.error(oldServer);
  process.exit(1);
}
VITEPATCH

su - coder -c "node /tmp/patch-vite.js"
rm -f /tmp/patch-vite.js

# =============================================================================
# 5. Write OpenCode config (before supervisord starts opencode)
# =============================================================================
echo "[5/6] Configuring OpenCode..."

if [ -n "$OPENCODE_CONFIG_CONTENT" ]; then
    mkdir -p /home/coder/.config/opencode
    echo "$OPENCODE_CONFIG_CONTENT" > /home/coder/.config/opencode/opencode.json
    chown -R coder:coder /home/coder/.config/opencode
    echo "  -> OpenCode config written"
else
    echo "  -> OPENCODE_CONFIG_CONTENT not set, skipping"
fi

# =============================================================================
# 6. Start Services
# =============================================================================
echo "[6/6] Starting services..."

echo "=========================================="
echo "Container Configuration:"
echo "  - Repository URL: ${REPOSITORY_URL:-'Not set'}"
echo "  - Repository Branch: ${REPOSITORY_BRANCH:-main}"
echo "=========================================="
echo "Services:"
echo "  - PostgreSQL:        localhost:5432"
echo "  - Backend API:       http://localhost:3000"
echo "  - Frontend (Vite):   http://localhost:4200"
echo "  - pgweb (DB UI):     http://localhost:8081"
echo "  - Code-server:       http://localhost:8080"
echo "  - OpenCode API:      http://localhost:4096"
echo "=========================================="
echo ""

# Start supervisor (it will manage all services)
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
