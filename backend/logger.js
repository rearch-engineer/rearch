/**
 * Structured audit logging for ReArch backend.
 *
 * All logs are emitted as JSON to stdout (one line per event), which is the
 * standard for containerized services. Docker/Swarm captures stdout
 * automatically and ships it via the configured log driver.
 *
 * Usage:
 *   import { logger, security, audit, system } from './logger.js';
 *
 *   logger.info({ requestId, method, path, status }, 'request completed');
 *   security.warn({ event: 'auth.login.failed', email, ip, reason }, 'login failed');
 *   audit.info({ event: 'admin.user.updated', userId, targetId, changes }, 'user updated');
 *   system.info({ event: 'system.startup' }, 'server started');
 */

import pino from "pino";

// ─── Configuration ────────────────────────────────────────────────────────────

const LOG_LEVEL = process.env.LOG_LEVEL || (process.env.NODE_ENV === "production" ? "info" : "debug");
const IS_PRODUCTION = process.env.NODE_ENV === "production";

// ─── Sensitive Data Redaction ─────────────────────────────────────────────────

const REDACT_PATHS = [
  "password",
  "password_hash",
  "currentPassword",
  "newPassword",
  "auth.password_hash",
  "token",
  "accessToken",
  "refreshToken",
  "keycloakToken",
  "apiToken",
  "apiKey",
  "ANTHROPIC_API_KEY",
  "BITBUCKET_TOKEN",
  "GIT_TOKEN",
  "secret",
  "MCP_PROXY_SECRET",
  "JWT_SECRET",
  "authorization",
  "cookie",
];

// ─── Base Logger ──────────────────────────────────────────────────────────────

const transport = IS_PRODUCTION
  ? undefined // JSON to stdout in production
  : {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "SYS:HH:MM:ss.l",
        ignore: "pid,hostname",
      },
    };

const logger = pino({
  level: LOG_LEVEL,
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: REDACT_PATHS,
    censor: "[REDACTED]",
  },
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
  },
  ...(transport ? { transport } : {}),
  // Base fields included in every log line
  base: {
    service: "rearch-backend",
  },
});

// ─── Child Loggers (namespaced) ───────────────────────────────────────────────

/** HTTP access logs (request/response lifecycle) */
const access = logger.child({ component: "access" });

/** Security events: authentication, authorization, rate limiting */
const security = logger.child({ component: "security" });

/** Audit trail: admin actions, data mutations */
const audit = logger.child({ component: "audit" });

/** System events: startup, shutdown, DB connections, queue events */
const system = logger.child({ component: "system" });

/** Queue worker events: job lifecycle, container management */
const queue = logger.child({ component: "queue" });

// ─── Helper: Truncate token for correlation logging ───────────────────────────

/**
 * Return last 8 chars of a token for correlation without exposing the full value.
 * @param {string} token
 * @returns {string}
 */
function tokenSuffix(token) {
  if (!token || token.length < 8) return "***";
  return `...${token.slice(-8)}`;
}

// ─── Helper: Extract client IP from headers ───────────────────────────────────

/**
 * Extract the client IP address from request headers.
 * @param {object} headers - Request headers object
 * @returns {string}
 */
function getClientIp(headers) {
  return headers?.["x-forwarded-for"]?.split(",")[0]?.trim() || headers?.["x-real-ip"] || "";
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export {
  logger,
  access,
  security,
  audit,
  system,
  queue as queueLogger,
  tokenSuffix,
  getClientIp,
};

export default logger;
