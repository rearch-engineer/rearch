import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import mongoose from "mongoose";
import dotenv from "dotenv";
import bcrypt from "bcrypt";
import apiRoutes from "./routes/api.js";
import resourceRoutes from "./routes/resources.js";
import toolsRoutes from "./routes/tools.js";
import FlowPersonaRoutes from "./routes/flowPersonas.js";
import GuardRailRoutes from "./routes/guardRail.js";
import SkillRoutes from "./routes/skill.js";
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import Queue from "./queue";
import jobRoutes from "./routes/jobs.js";
import usageRoutes from "./routes/usage.js";
import settingsRoutes, {
  publicRouter as publicSettingsRoutes,
} from "./routes/settings.js";
import mcpRoutes from "./routes/mcp.js";
import { wsPlugin } from "./ws.js";
import { authPlugin } from "./middleware/auth.js";
import requireRole from "./middleware/requireRole.js";
import User from "./models/User.js";
import {
  privateRouter as fileRoutes,
  publicRouter as publicFileRoutes,
} from "./routes/files.js";
import { logger, access, system, getClientIp } from "./logger.js";

dotenv.config();

const PORT = process.env.PORT || 5000;

const corsOrigins = process.env.FRONTEND_URL
  ? [process.env.FRONTEND_URL, "http://localhost:4200", "http://localhost:3000"]
  : true; // true = allow all origins in Elysia CORS

const app = new Elysia()
  // ─── Security headers + Request ID ─────────────────────────────────
  .onRequest(({ set, request }) => {
    // Generate or accept request ID for correlation
    const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
    set.headers["X-Request-ID"] = requestId;

    // Stash request metadata for access logging in onAfterHandle
    request._startTime = performance.now();
    request._requestId = requestId;

    set.headers["X-Content-Type-Options"] = "nosniff";
    set.headers["X-Frame-Options"] = "SAMEORIGIN";
    set.headers["X-XSS-Protection"] = "0";
    set.headers["X-Download-Options"] = "noopen";
    set.headers["X-Permitted-Cross-Domain-Policies"] = "none";
    set.headers["Referrer-Policy"] = "no-referrer";
    set.headers["Cross-Origin-Opener-Policy"] = "same-origin";
    set.headers["Cross-Origin-Resource-Policy"] = "same-origin";
    if (process.env.NODE_ENV === "production") {
      set.headers["Strict-Transport-Security"] =
        "max-age=15552000; includeSubDomains";
    }
  })

  // ─── CORS ─────────────────────────────────────────────────────────────
  .use(
    cors({
      origin: corsOrigins,
      credentials: true,
    }),
  )

  // ─── Mongoose document serialization + Access logging ──────────────
  // Elysia dispatches on response.constructor.name to decide serialization.
  // Mongoose documents have constructor.name === "model", which falls through
  // to `new Response(doc)` — Bun then produces a non-JSON inspect format.
  // This hook converts Mongoose docs to plain objects so Elysia correctly
  // uses Response.json().
  .onAfterHandle(({ response, request, set }) => {
    // ── Access log ──────────────────────────────────────────────────────
    const url = new URL(request.url);
    const path = url.pathname;

    // Skip health check logging to reduce noise
    if (path !== "/health") {
      const durationMs = request._startTime
        ? Math.round(performance.now() - request._startTime)
        : undefined;
      const statusCode = set.status || 200;
      const logLevel = statusCode >= 500 ? "error" : statusCode >= 400 ? "warn" : "info";

      access[logLevel]({
        requestId: request._requestId,
        method: request.method,
        path,
        status: statusCode,
        durationMs,
        ip: getClientIp(Object.fromEntries(request.headers)),
        userAgent: request.headers.get("user-agent") || "",
      }, `${request.method} ${path} ${statusCode}`);
    }

    // ── Mongoose serialization ──────────────────────────────────────────
    if (
      response &&
      typeof response?.toJSON === "function" &&
      response?.constructor?.name === "model"
    ) {
      return response.toJSON();
    }
    if (Array.isArray(response)) {
      let needsConversion = false;
      for (let i = 0; i < response.length; i++) {
        if (
          response[i] &&
          typeof response[i]?.toJSON === "function" &&
          response[i]?.constructor?.name === "model"
        ) {
          needsConversion = true;
          break;
        }
      }
      if (needsConversion) {
        return response.map((item) =>
          item &&
          typeof item?.toJSON === "function" &&
          item?.constructor?.name === "model"
            ? item.toJSON()
            : item,
        );
      }
    }
  })

  // ─── Global Error Handler ─────────────────────────────────────────────
  .onError(({ error, code, set, request }) => {
    const requestId = request?._requestId;
    const path = request ? new URL(request.url).pathname : undefined;

    if (code === "NOT_FOUND") {
      set.status = 404;
      return { error: "Not found" };
    }
    if (code === "VALIDATION") {
      logger.warn({ requestId, path, code, err: error }, "validation error");
      set.status = 400;
      return {
        error: "Validation failed",
        details: error.message,
      };
    }

    const status = error.status || 500;
    set.status = status;

    logger.error({ requestId, path, status, err: error }, "unhandled error");

    const message =
      process.env.NODE_ENV === "production"
        ? "Internal server error"
        : error.message || "Internal server error";
    return { error: message };
  })

  // ─── WebSocket (own auth via query token) ──────────────────────────────
  .use(wsPlugin)

  // ─── Public Routes (no auth) ──────────────────────────────────────────
  .use(authRoutes)
  .use(publicFileRoutes)
  .use(publicSettingsRoutes)

  // ─── Health check ─────────────────────────────────────────────────────
  .get("/health", () => ({ status: "ok", message: "Server is running" }))

  // ─── Authenticated Routes ─────────────────────────────────────────────
  .use(apiRoutes)
  .use(fileRoutes)
  .use(resourceRoutes)
  .use(toolsRoutes)

  // ─── Admin Routes ─────────────────────────────────────────────────────
  .use(FlowPersonaRoutes)
  .use(GuardRailRoutes)
  .use(SkillRoutes)
  .use(userRoutes)
  .use(jobRoutes)
  .use(usageRoutes)
  .use(settingsRoutes)
  .use(mcpRoutes)

  // ─── Start ────────────────────────────────────────────────────────────
  .listen(PORT);

system.info({ event: "system.startup", port: PORT }, `server listening on port ${PORT}`);

// ─── MongoDB connection ───────────────────────────────────────────────────────
mongoose
  .connect(process.env.MONGODB_URI || "mongodb://localhost:27017/rearch")
  .then(async () => {
    system.info({ event: "system.db.connected" }, "connected to MongoDB");
    await bootstrapAdminUser();
  })
  .catch((err) => system.error({ event: "system.db.error", err }, "MongoDB connection error"));

// ─── Admin Bootstrap ──────────────────────────────────────────────────────────
async function bootstrapAdminUser() {
  try {
    const userCount = await User.countDocuments();
    if (userCount > 0) return; // Users already exist, skip bootstrap

    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) {
      system.info(
        "no users exist and ADMIN_EMAIL is not set — set ADMIN_EMAIL (and ADMIN_PASSWORD for LOCAL mode) to bootstrap an admin user",
      );
      return;
    }

    const authMode = (process.env.AUTH_MODE || "LOCAL").toUpperCase();
    const adminData = {
      account: {
        email: adminEmail.toLowerCase(),
        username: "admin",
        status: "active",
      },
      profile: {
        display_name: "Administrator",
      },
      auth: {
        roles: ["admin", "user"],
      },
    };

    if (authMode === "LOCAL") {
      const adminPassword = process.env.ADMIN_PASSWORD;
      if (!adminPassword) {
        system.warn(
          "ADMIN_PASSWORD is required in LOCAL mode to bootstrap the admin user",
        );
        return;
      }
      adminData.auth.password_hash = await bcrypt.hash(adminPassword, 12);
    }

    await User.create(adminData);
    system.info({ event: "system.admin.bootstrapped", email: adminEmail }, `admin user bootstrapped: ${adminEmail}`);
  } catch (err) {
    system.error({ event: "system.admin.bootstrapped", err }, "admin bootstrap error");
  }
}

// ─── Process Error Handlers ───────────────────────────────────────────────────
process.on("unhandledRejection", (reason) => {
  system.error({ event: "system.unhandledRejection", err: reason }, "unhandled promise rejection");
});

process.on("uncaughtException", (err) => {
  system.fatal({ event: "system.uncaughtException", err }, "uncaught exception — shutting down");
  process.exit(1);
});

export default app;
