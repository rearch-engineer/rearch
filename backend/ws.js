import { Elysia } from "elysia";
import jwt from "jsonwebtoken";
import User from "./models/User.js";
import {
  verifyKeycloakToken,
  isKeycloakToken,
  extractKeycloakUserInfo,
} from "./utils/keycloak.js";
import { security, logger } from "./logger.js";

const AUTH_MODE = () => (process.env.AUTH_MODE || "LOCAL").toUpperCase();

/**
 * Set of all connected WebSocket clients.
 * Each entry is a Bun ServerWebSocket instance with `data.user` attached.
 */
const clients = new Set();

/**
 * Verify a token (app JWT or Keycloak) and return user info.
 * Throws on failure.
 */
async function verifyToken(token) {
  const mode = AUTH_MODE();

  // ── KEYCLOAK_FIREWALL: try Keycloak token first ──────────────────────
  if (mode === "KEYCLOAK_FIREWALL" && isKeycloakToken(token)) {
    try {
      const payload = await verifyKeycloakToken(token);
      const userInfo = extractKeycloakUserInfo(payload);

      let user = await User.findOne({
        "oauth.provider": "keycloak",
        "oauth.subject": userInfo.sub,
      })
        .select("account.status account.email auth.roles")
        .lean();

      if (!user) {
        user = await User.findOne({
          "account.email": userInfo.email?.toLowerCase(),
        })
          .select("account.status account.email auth.roles")
          .lean();
      }

      if (!user) throw new Error("User not found.");
      if (user.account.status !== "active") throw new Error("Account is not active.");

      return {
        userId: user._id.toString(),
        email: user.account.email,
        roles: user.auth.roles,
      };
    } catch (err) {
      if (err.code === "ERR_JWT_EXPIRED") throw new Error("Token expired.");
      // Fall through to app JWT verification
    }
  }

  // ── App JWT verification (LOCAL, OAUTH, or KEYCLOAK_FIREWALL fallback) ─
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("Server authentication misconfiguration.");

  const decoded = jwt.verify(token, secret);

  const user = await User.findById(decoded.userId)
    .select("account.status account.email auth.roles")
    .lean();
  if (!user) throw new Error("User not found.");
  if (user.account.status !== "active") throw new Error("Account is not active.");

  return {
    userId: user._id.toString(),
    email: user.account.email,
    roles: user.auth.roles,
  };
}

/**
 * Elysia plugin that registers the /ws WebSocket endpoint.
 *
 * Authentication is performed via a `token` query parameter during the
 * HTTP upgrade request (native WebSocket does not support custom headers
 * during the handshake).
 */
export const wsPlugin = new Elysia()
  .ws("/ws", {
    async beforeHandle({ query, set }) {
      // Validate token before upgrading the connection
      const token = query.token;
      if (!token) {
        set.status = 401;
        return "Authentication required. Provide a token query parameter.";
      }

      try {
        // Verify and stash user info — it will be available in `open` via `ws.data`
        const user = await verifyToken(token);
        // Store on query so it's available in ws.data.query
        query._user = JSON.stringify(user);
      } catch (err) {
        set.status = 401;
        return err.message || "Authentication failed.";
      }
    },

    open(ws) {
      // Parse user info stashed during beforeHandle
      try {
        const user = JSON.parse(ws.data.query._user);
        ws.data.user = user;
      } catch {
        ws.data.user = null;
      }

      clients.add(ws);
      logger.debug({ event: 'ws.connected', clientCount: clients.size }, `WS client connected (${clients.size} total)`);
    },

    message(ws, message) {
      // Server-to-client only — no client messages expected.
      // Could handle ping/pong or future client-to-server events here.
    },

    close(ws) {
      clients.delete(ws);
      logger.debug({ event: 'ws.disconnected', clientCount: clients.size }, `WS client disconnected (${clients.size} total)`);
    },
  });

/**
 * Broadcast an event to all connected WebSocket clients.
 *
 * Wire format: JSON `{ event: string, data: any }`
 *
 * @param {string} event - Event name (e.g. "job.active", "conversation.sessionInfo")
 * @param {object} data  - Event payload
 */
export function broadcast(event, data) {
  const message = JSON.stringify({ event, data });

  for (const ws of clients) {
    try {
      ws.send(message);
    } catch (err) {
      // Client likely disconnected — remove it
      clients.delete(ws);
    }
  }
}

/**
 * Get the number of connected clients (useful for health checks / debugging).
 */
export function getClientCount() {
  return clients.size;
}
