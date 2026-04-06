#!/bin/sh
set -e

# Generate runtime config from environment variables
# This allows the React SPA to read config at runtime without rebuilding
cat > /usr/share/nginx/html/config.js <<EOF
window.__RUNTIME_CONFIG__ = {
  API_BASE_URL: "${API_BASE_URL:-/api}",
  SOCKET_URL: "${SOCKET_URL:-}",
  KEYCLOAK_URL: "${KEYCLOAK_URL:-}",
  KEYCLOAK_REALM: "${KEYCLOAK_REALM:-}",
  KEYCLOAK_CLIENT_ID: "${KEYCLOAK_CLIENT_ID:-}",
};
EOF

echo "Runtime config generated:"
cat /usr/share/nginx/html/config.js

# Start nginx
exec nginx -g 'daemon off;'
