/**
 * rearch-mcp-proxy – entry point
 *
 * Bun.serve()-based MCP proxy that reads upstream server configs from MongoDB
 * and exposes an aggregated Streamable HTTP endpoint for downstream consumers.
 */

import mongoose from "mongoose";
import { validateAuth } from "./auth.js";
import { loadMcpServers, watchForChanges } from "./config.js";
import { UpstreamManager } from "./upstream-manager.js";
import { handleMcpRequest } from "./proxy.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.MCP_PROXY_PORT || "3100", 10);
const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/rearch";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const upstreamManager = new UpstreamManager();
let configWatcher = null;

// ---------------------------------------------------------------------------
// MongoDB connection
// ---------------------------------------------------------------------------

async function connectMongo() {
  console.log(
    `[mongo] Connecting to ${MONGODB_URI.replace(/\/\/[^@]+@/, "//***@")} ...`,
  );
  await mongoose.connect(MONGODB_URI);
  console.log("[mongo] Connected");
}

// ---------------------------------------------------------------------------
// Load / reload upstream servers
// ---------------------------------------------------------------------------

async function reloadUpstreams() {
  console.log("[proxy] Loading MCP server configs from MongoDB ...");
  const configs = await loadMcpServers();
  const count = Object.keys(configs).length;
  console.log(`[proxy] Found ${count} server config(s)`);
  await upstreamManager.loadServers(configs);
}

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------

const server = Bun.serve({
  port: PORT,
  async fetch(request) {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    // ----- Health check (unauthenticated) --------------------------------
    if (pathname === "/health" && method === "GET") {
      return Response.json({
        healthy: true,
        upstreams: upstreamManager.getStatuses(),
      });
    }

    // ----- Auth gate for everything else ---------------------------------
    if (!validateAuth(request)) {
      return Response.json(
        { error: "Unauthorized" },
        { status: 401, headers: { "content-type": "application/json" } },
      );
    }

    // ----- MCP Streamable HTTP endpoint ----------------------------------
    if (pathname === "/mcp") {
      if (method === "POST") {
        return handleMcpRequest(request, upstreamManager);
      }

      if (method === "GET") {
        // SSE endpoint for server-initiated notifications – not needed yet
        return new Response("SSE not implemented", { status: 405 });
      }

      if (method === "DELETE") {
        // Session termination – not needed yet
        return new Response("Session termination not implemented", {
          status: 405,
        });
      }

      return new Response("Method not allowed", { status: 405 });
    }

    // ----- Config reload -------------------------------------------------
    if (pathname === "/reload" && method === "POST") {
      try {
        await reloadUpstreams();
        return Response.json({
          ok: true,
          upstreams: upstreamManager.getStatuses(),
        });
      } catch (err) {
        return Response.json(
          { ok: false, error: err.message },
          { status: 500 },
        );
      }
    }

    // ----- 404 -----------------------------------------------------------
    return new Response("Not found", { status: 404 });
  },
});

// ---------------------------------------------------------------------------
// Startup sequence
// ---------------------------------------------------------------------------

async function start() {
  try {
    await connectMongo();
    await reloadUpstreams();

    // Watch for runtime config changes
    configWatcher = watchForChanges(async (servers) => {
      console.log("[proxy] Config change detected – reloading upstreams");
      await upstreamManager.loadServers(servers);
    });

    console.log(`[proxy] MCP proxy listening on http://0.0.0.0:${PORT}`);
    console.log(`[proxy] Endpoints:`);
    console.log(`         POST /mcp      – MCP Streamable HTTP`);
    console.log(`         GET  /health   – Health check`);
    console.log(`         POST /reload   – Reload config from MongoDB`);
  } catch (err) {
    console.error("[proxy] Fatal startup error:", err);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

async function shutdown() {
  console.log("\n[proxy] Shutting down ...");
  if (configWatcher) configWatcher.stop();
  await upstreamManager.closeAll();
  await mongoose.disconnect();
  server.stop();
  console.log("[proxy] Bye");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Go
start();
