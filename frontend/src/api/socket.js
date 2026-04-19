import config from "../config";
import { isTauri } from "../config";

const TOKEN_KEY = "auth_token";

/**
 * Derive the WebSocket URL from the API base URL.
 * e.g. "http://localhost:5000/api" -> "ws://localhost:5000/ws"
 *      "https://example.com/api"   -> "wss://example.com/ws"
 */
function getWsUrl() {
  const base = config.SOCKET_URL || config.API_BASE_URL;
  return base
    .replace(/\/api\/?$/, "")  // strip trailing /api
    .replace(/^http/, "ws")    // http -> ws, https -> wss
    + "/ws";
}

/**
 * Lightweight event-emitter WebSocket wrapper.
 *
 * Provides the same `.on(event, cb)` / `.off(event, cb)` interface that
 * components already use with Socket.IO, so consumer code needs minimal changes.
 *
 * Wire format (from server): JSON `{ event: string, data: any }`
 *
 * When running inside Tauri, WebSocket connections are proxied through the
 * Rust backend via IPC commands to avoid WebKit origin restrictions.
 */
class JsonWebSocket {
  constructor() {
    /** @type {WebSocket|null} */
    this._ws = null;
    /** @type {Map<string, Set<Function>>} */
    this._listeners = new Map();
    this._reconnectAttempts = 0;
    this._maxReconnectAttempts = 5;
    this._reconnectDelay = 1000;
    this._reconnectTimer = null;
    this._shouldConnect = false;
    this._tauriUnlisteners = [];
    this.id = null;
  }

  // ── Public API (matches Socket.IO client interface) ─────────────────

  /** Register a listener for an event name */
  on(event, callback) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add(callback);
    return this;
  }

  /** Remove a listener */
  off(event, callback) {
    const set = this._listeners.get(event);
    if (set) {
      set.delete(callback);
      if (set.size === 0) this._listeners.delete(event);
    }
    return this;
  }

  /** Open the WebSocket connection */
  connect() {
    this._shouldConnect = true;
    this._reconnectAttempts = 0;
    this._open();
  }

  /** Close the WebSocket connection */
  disconnect() {
    this._shouldConnect = false;
    this._reconnectAttempts = 0;
    clearTimeout(this._reconnectTimer);

    if (isTauri) {
      this._disconnectTauri();
    } else {
      if (this._ws) {
        this._ws.close();
        this._ws = null;
      }
    }
  }

  // ── Internal ────────────────────────────────────────────────────────

  _getToken() {
    // Prefer app JWT (e.g. from Keycloak token exchange), fall back to auth_token
    return localStorage.getItem("app_jwt") || localStorage.getItem(TOKEN_KEY);
  }

  _open() {
    console.log("[WS] _open called, isTauri:", isTauri, "__TAURI_INTERNALS__" in window);
    console.log("[WS] config.SOCKET_URL:", config.SOCKET_URL, "config.API_BASE_URL:", config.API_BASE_URL);
    console.log("[WS] token present:", !!this._getToken());
    console.log("[WS] wsUrl would be:", getWsUrl());
    if (isTauri) {
      this._openTauri();
    } else {
      this._openBrowser();
    }
  }

  // ── Tauri path: WebSocket via Rust IPC ──────────────────────────────

  async _openTauri() {
    const token = this._getToken();
    if (!token) {
      console.warn("WebSocket: no auth token available, deferring connection");
      return;
    }

    const url = `${getWsUrl()}?token=${encodeURIComponent(token)}`;
    console.log("WebSocket (Tauri): connecting to", url);

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const { listen } = await import("@tauri-apps/api/event");

      // Clean up previous listeners
      await this._cleanupTauriListeners();

      // Listen for events from Rust
      const unlistenMessage = await listen("ws-message", (event) => {
        try {
          const { event: eventName, data } = JSON.parse(event.payload);
          if (eventName) {
            this._emit(eventName, data);
          }
        } catch (err) {
          console.error("WebSocket (Tauri): failed to parse message:", err.message);
        }
      });

      const unlistenConnected = await listen("ws-connected", () => {
        this.id = Math.random().toString(36).slice(2, 10);
        this._reconnectAttempts = 0;
        console.log("WebSocket (Tauri): connected", this.id);
        this._emit("connect");
      });

      const unlistenDisconnected = await listen("ws-disconnected", () => {
        const prevId = this.id;
        this.id = null;
        console.log("WebSocket (Tauri): disconnected");
        this._emit("disconnect", "transport close");

        if (this._shouldConnect) {
          this._scheduleReconnect();
        }
      });

      this._tauriUnlisteners = [unlistenMessage, unlistenConnected, unlistenDisconnected];

      // Connect via Rust
      await invoke("ws_connect", { url });
    } catch (err) {
      console.error("WebSocket (Tauri): connect failed:", err);
      this._scheduleReconnect();
    }
  }

  async _disconnectTauri() {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("ws_disconnect");
    } catch (err) {
      console.error("WebSocket (Tauri): disconnect error:", err);
    }
    await this._cleanupTauriListeners();
    this.id = null;
  }

  async _cleanupTauriListeners() {
    for (const unlisten of this._tauriUnlisteners) {
      unlisten();
    }
    this._tauriUnlisteners = [];
  }

  // ── Browser path: native WebSocket ──────────────────────────────────

  _openBrowser() {
    if (this._ws) {
      if (this._ws.readyState === WebSocket.OPEN || this._ws.readyState === WebSocket.CONNECTING) {
        return;
      }
    }

    const token = this._getToken();
    if (!token) {
      console.warn("WebSocket: no auth token available, deferring connection");
      return;
    }

    const url = `${getWsUrl()}?token=${encodeURIComponent(token)}`;

    try {
      this._ws = new WebSocket(url);
    } catch (err) {
      console.error("WebSocket: failed to create connection:", err.message);
      this._scheduleReconnect();
      return;
    }

    this._ws.onopen = () => {
      this.id = Math.random().toString(36).slice(2, 10);
      this._reconnectAttempts = 0;
      console.log("Connected to WebSocket server:", this.id);
      this._emit("connect");
    };

    this._ws.onmessage = (event) => {
      try {
        const { event: eventName, data } = JSON.parse(event.data);
        if (eventName) {
          this._emit(eventName, data);
        }
      } catch (err) {
        console.error("WebSocket: failed to parse message:", err.message);
      }
    };

    this._ws.onclose = (event) => {
      this.id = null;
      console.log("Disconnected from WebSocket server:", event.reason || event.code);
      this._emit("disconnect", event.reason || "transport close");

      if (this._shouldConnect) {
        this._scheduleReconnect();
      }
    };

    this._ws.onerror = (error) => {
      console.error("WebSocket connection error");
    };
  }

  // ── Shared ──────────────────────────────────────────────────────────

  _scheduleReconnect() {
    if (!this._shouldConnect) return;
    if (this._reconnectAttempts >= this._maxReconnectAttempts) {
      console.error("WebSocket: max reconnection attempts reached");
      this._emit("reconnect_failed");
      return;
    }

    this._reconnectAttempts++;
    const delay = this._reconnectDelay * Math.pow(1.5, this._reconnectAttempts - 1);
    console.log(`WebSocket: reconnecting in ${Math.round(delay)}ms (attempt ${this._reconnectAttempts}/${this._maxReconnectAttempts})`);

    this._reconnectTimer = setTimeout(() => {
      this._emit("reconnect_attempt", this._reconnectAttempts);
      this._open();
    }, delay);
  }

  /** Emit to internal listeners */
  _emit(event, data) {
    const set = this._listeners.get(event);
    if (set) {
      for (const cb of set) {
        try {
          cb(data);
        } catch (err) {
          console.error(`WebSocket: error in listener for "${event}":`, err);
        }
      }
    }
  }
}

const socket = new JsonWebSocket();

export default socket;
