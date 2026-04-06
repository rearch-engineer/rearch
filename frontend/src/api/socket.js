import config from "../config";

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
    if (this._ws) {
      this._ws.close();
      this._ws = null;
    }
  }

  // ── Internal ────────────────────────────────────────────────────────

  _getToken() {
    // Prefer app JWT (e.g. from Keycloak token exchange), fall back to auth_token
    return localStorage.getItem("app_jwt") || localStorage.getItem(TOKEN_KEY);
  }

  _open() {
    if (this._ws) {
      // Already connecting or connected
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
      this.id = Math.random().toString(36).slice(2, 10); // simple client id
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
      const prevId = this.id;
      this.id = null;
      console.log("Disconnected from WebSocket server:", event.reason || event.code);
      this._emit("disconnect", event.reason || "transport close");

      if (this._shouldConnect) {
        this._scheduleReconnect();
      }
    };

    this._ws.onerror = (error) => {
      console.error("WebSocket connection error");
      // onclose will fire after onerror, so reconnect is handled there
    };
  }

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
