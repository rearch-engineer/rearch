/**
 * Runtime configuration helper.
 *
 * - **Browser**: reads from window.__RUNTIME_CONFIG__ (injected via public/config.js)
 * - **Tauri desktop**: reads from the Tauri store (persisted on disk).
 *   If no server has been configured yet the values will be empty and
 *   the app should show the ServerSetup screen.
 */

/** True when the app is running inside a Tauri webview. */
export const isTauri = '__TAURI_INTERNALS__' in window;

const runtimeConfig = window.__RUNTIME_CONFIG__ || {};

const config = {
  API_BASE_URL: runtimeConfig.API_BASE_URL || "http://localhost:5000/api",
  SOCKET_URL: runtimeConfig.SOCKET_URL || "http://localhost:5000",
  KEYCLOAK_URL: runtimeConfig.KEYCLOAK_URL || "",
  KEYCLOAK_REALM: runtimeConfig.KEYCLOAK_REALM || "",
  KEYCLOAK_CLIENT_ID: runtimeConfig.KEYCLOAK_CLIENT_ID || "",
};

/**
 * Apply Tauri-stored server config onto the config object.
 * Called once at app startup from App.js when running inside Tauri.
 */
export async function applyTauriConfig() {
  if (!isTauri) return;

  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const stored = await invoke('get_server_config');
    console.log('[config] Tauri stored config:', stored);
    console.log('[config] Current config before merge:', { ...config });
    if (stored.API_BASE_URL) config.API_BASE_URL = stored.API_BASE_URL;
    if (stored.SOCKET_URL) config.SOCKET_URL = stored.SOCKET_URL;
    console.log('[config] Config after merge:', { ...config });
  } catch (e) {
    console.warn('Failed to load Tauri server config:', e);
  }
}

export default config;
