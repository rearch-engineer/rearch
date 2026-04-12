import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import mongoose from "mongoose";
import dotenv from "dotenv";
import bcrypt from "bcrypt";
import apiRoutes from "./routes/api.js";
import resourceRoutes from "./routes/resources.js";
import toolsRoutes from "./routes/tools.js";
import authRoutes from "./routes/auth.js";
import Queue from "./queue";
import { publicRouter as publicSettingsRoutes } from "./routes/settings.js";
import { publicRouter as suggestedPromptsPublicRoutes } from "./routes/suggestedPrompts.js";
import adminRoutes from "./routes/admin/index.js";
import { wsPlugin } from "./ws.js";
import { authPlugin } from "./middleware/auth.js";
import User from "./models/User.js";
import {
  privateRouter as fileRoutes,
  publicRouter as publicFileRoutes,
} from "./routes/files.js";

dotenv.config();

const PORT = process.env.PORT || 5000;

const corsOrigins = process.env.FRONTEND_URL
  ? [process.env.FRONTEND_URL, "http://localhost:4200", "http://localhost:3000"]
  : true; // true = allow all origins in Elysia CORS

const app = new Elysia()
  // ─── Security headers (replaces helmet) ───────────────────────────────
  .onRequest(({ set }) => {
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

  // ─── Mongoose document serialization ──────────────────────────────────
  // Elysia dispatches on response.constructor.name to decide serialization.
  // Mongoose documents have constructor.name === "model", which falls through
  // to `new Response(doc)` — Bun then produces a non-JSON inspect format.
  // This hook converts Mongoose docs to plain objects so Elysia correctly
  // uses Response.json().
  .onAfterHandle(({ response }) => {
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
  .onError(({ error, code, set }) => {
    console.error("Unhandled error:", error);
    if (code === "NOT_FOUND") {
      set.status = 404;
      return { error: "Not found" };
    }
    if (code === "VALIDATION") {
      set.status = 400;
      return {
        error: "Validation failed",
        details: error.message,
      };
    }
    const status = error.status || 500;
    set.status = status;
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
  .use(suggestedPromptsPublicRoutes)

  // ─── Admin Routes ─────────────────────────────────────────────────────
  .use(adminRoutes)

  // ─── Start ────────────────────────────────────────────────────────────
  .listen(PORT);

console.log(`Server running on http://localhost:${PORT}`);

// ─── MongoDB connection ───────────────────────────────────────────────────────
mongoose
  .connect(process.env.MONGODB_URI || "mongodb://localhost:27017/rearch")
  .then(async () => {
    console.log("Connected to MongoDB");
    await bootstrapAdminUser();
  })
  .catch((err) => console.error("MongoDB connection error:", err));

// ─── Admin Bootstrap ──────────────────────────────────────────────────────────
async function bootstrapAdminUser() {
  try {
    const userCount = await User.countDocuments();
    if (userCount > 0) return; // Users already exist, skip bootstrap

    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) {
      console.log(
        "No users exist and ADMIN_EMAIL is not set. Set ADMIN_EMAIL (and ADMIN_PASSWORD for LOCAL mode) to bootstrap an admin user.",
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
        console.log(
          "ADMIN_PASSWORD is required in LOCAL mode to bootstrap the admin user.",
        );
        return;
      }
      adminData.auth.password_hash = await bcrypt.hash(adminPassword, 12);
    }

    await User.create(adminData);
    console.log(`Admin user bootstrapped: ${adminEmail}`);
  } catch (err) {
    console.error("Admin bootstrap error:", err);
  }
}

// ─── Process Error Handlers ───────────────────────────────────────────────────
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  process.exit(1);
});

export default app;
