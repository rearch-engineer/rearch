/**
 * Runtime configuration helper.
 * Reads from window.__RUNTIME_CONFIG__ (injected via public/config.js)
 * with sensible defaults for local development.
 */
const runtimeConfig = window.__RUNTIME_CONFIG__ || {};

const config = {
  API_BASE_URL: runtimeConfig.API_BASE_URL || "http://localhost:5000/api",
  SOCKET_URL: runtimeConfig.SOCKET_URL || "http://localhost:5000",
  KEYCLOAK_URL: runtimeConfig.KEYCLOAK_URL || "",
  KEYCLOAK_REALM: runtimeConfig.KEYCLOAK_REALM || "",
  KEYCLOAK_CLIENT_ID: runtimeConfig.KEYCLOAK_CLIENT_ID || "",
};

export default config;
