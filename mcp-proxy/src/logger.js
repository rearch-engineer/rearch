/**
 * Structured logging for rearch-mcp-proxy.
 *
 * Mirrors the backend logger configuration: JSON to stdout in production,
 * pino-pretty in development.
 */

import pino from "pino";

const LOG_LEVEL = process.env.LOG_LEVEL || (process.env.NODE_ENV === "production" ? "info" : "debug");
const IS_PRODUCTION = process.env.NODE_ENV === "production";

const REDACT_PATHS = [
  "secret",
  "MCP_PROXY_SECRET",
  "apiToken",
  "password",
  "token",
  "authorization",
];

const transport = IS_PRODUCTION
  ? undefined
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
  base: {
    service: "rearch-mcp-proxy",
  },
});

/** MongoDB / connectivity events */
const system = logger.child({ component: "system" });

/** MCP proxy core events */
const proxy = logger.child({ component: "proxy" });

/** Upstream MCP server management */
const upstream = logger.child({ component: "upstream" });

/** Configuration loading / watching */
const config = logger.child({ component: "config" });

export { logger, system, proxy, upstream, config };
export default logger;
