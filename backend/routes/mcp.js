import { Elysia } from "elysia";
import { z } from "zod";
import McpServer from "../models/McpServer.js";
import { authPlugin } from "../middleware/auth.js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// ─── Gallery Data ─────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
let galleryData = [];
try {
  const raw = readFileSync(join(__dirname, "..", "mcp-gallery.json"), "utf-8");
  galleryData = JSON.parse(raw);
} catch (err) {
  console.warn("Could not load mcp-gallery.json:", err.message);
}

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const serverNameSchema = z
  .string()
  .min(1, "Server name is required")
  .max(50, "Server name must be 50 characters or fewer")
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    "Server name must contain only alphanumeric characters, hyphens, and underscores",
  );

const createServerSchema = z
  .object({
    name: serverNameSchema,
    type: z.enum(["remote", "local"], {
      required_error: 'Type must be "remote" or "local"',
    }),
    url: z.string().url("Must be a valid URL").optional(),
    command: z.array(z.string().min(1)).optional(),
    headers: z.record(z.string(), z.string()).optional(),
    environment: z.record(z.string(), z.string()).optional(),
    enabled: z.boolean().optional().default(true),
  })
  .superRefine((data, ctx) => {
    if (data.type === "remote" && !data.url) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "URL is required for remote server type",
        path: ["url"],
      });
    }
    if (data.type === "local" && (!data.command || data.command.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Command is required for local server type",
        path: ["command"],
      });
    }
  });

const updateServerSchema = z
  .object({
    type: z.enum(["remote", "local"], {
      required_error: 'Type must be "remote" or "local"',
    }),
    url: z.string().url("Must be a valid URL").optional(),
    command: z.array(z.string().min(1)).optional(),
    headers: z.record(z.string(), z.string()).optional(),
    environment: z.record(z.string(), z.string()).optional(),
    enabled: z.boolean().optional().default(true),
  })
  .superRefine((data, ctx) => {
    if (data.type === "remote" && !data.url) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "URL is required for remote server type",
        path: ["url"],
      });
    }
    if (data.type === "local" && (!data.command || data.command.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Command is required for local server type",
        path: ["command"],
      });
    }
  });

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MCP_PROXY_URL = process.env.MCP_PROXY_URL || "http://mcp-proxy:3100";

// ─── Admin-only beforeHandle ─────────────────────────────────────────────────

const adminOnly = {
  beforeHandle: ({ user, status }) => {
    if (!user?.roles?.includes("admin")) {
      return status(403, {
        error: "Insufficient permissions. Required role: admin",
      });
    }
  },
};

// ─── Router ───────────────────────────────────────────────────────────────────

const router = new Elysia({ prefix: "/api/mcp" })
  .use(authPlugin)

  // ─── List all MCP servers ───────────────────────────────────────────────

  /**
   * Get all MCP servers
   * GET /api/mcp/servers
   */
  .get(
    "/servers",
    async ({ status }) => {
      try {
        const servers = await McpServer.find().sort({ name: 1 });
        return servers;
      } catch (err) {
        console.error("Error fetching MCP servers:", err);
        return status(500, { error: err.message });
      }
    },
    adminOnly,
  )

  // ─── Add a new MCP server ──────────────────────────────────────────────

  /**
   * Add a new MCP server
   * POST /api/mcp/servers
   * Body: { name, type, url?, command?, headers?, environment?, enabled? }
   */
  .post(
    "/servers",
    async ({ body, status }) => {
      try {
        const parsed = createServerSchema.safeParse(body);
        if (!parsed.success) {
          return status(400, {
            error: parsed.error.errors.map((e) => e.message).join(", "),
          });
        }

        const { name, type, url, command, headers, environment, enabled } =
          parsed.data;

        const existing = await McpServer.findOne({ name });
        if (existing) {
          return status(409, { error: `Server "${name}" already exists` });
        }

        const server = await McpServer.create({
          name,
          type,
          url,
          command,
          headers,
          environment,
          enabled,
        });
        return server;
      } catch (err) {
        console.error("Error adding MCP server:", err);
        return status(500, { error: err.message });
      }
    },
    adminOnly,
  )

  // ─── Update an MCP server ──────────────────────────────────────────────

  /**
   * Update an existing MCP server
   * PUT /api/mcp/servers/:name
   * Body: { type, url?, command?, headers?, environment?, enabled? }
   */
  .put(
    "/servers/:name",
    async ({ params, body, status }) => {
      try {
        const nameResult = serverNameSchema.safeParse(params.name);
        if (!nameResult.success) {
          return status(400, {
            error: nameResult.error.errors.map((e) => e.message).join(", "),
          });
        }

        const parsed = updateServerSchema.safeParse(body);
        if (!parsed.success) {
          return status(400, {
            error: parsed.error.errors.map((e) => e.message).join(", "),
          });
        }

        const server = await McpServer.findOne({ name: params.name });
        if (!server) {
          return status(404, { error: `Server "${params.name}" not found` });
        }

        const { type, url, command, headers, environment, enabled } =
          parsed.data;
        Object.assign(server, {
          type,
          url,
          command,
          headers,
          environment,
          enabled,
        });
        await server.save();

        return server;
      } catch (err) {
        console.error("Error updating MCP server:", err);
        return status(500, { error: err.message });
      }
    },
    adminOnly,
  )

  // ─── Delete an MCP server ──────────────────────────────────────────────

  /**
   * Remove an MCP server
   * DELETE /api/mcp/servers/:name
   */
  .delete(
    "/servers/:name",
    async ({ params, status }) => {
      try {
        const nameResult = serverNameSchema.safeParse(params.name);
        if (!nameResult.success) {
          return status(400, {
            error: nameResult.error.errors.map((e) => e.message).join(", "),
          });
        }

        const server = await McpServer.findOneAndDelete({ name: params.name });
        if (!server) {
          return status(404, { error: `Server "${params.name}" not found` });
        }

        return { success: true };
      } catch (err) {
        console.error("Error deleting MCP server:", err);
        return status(500, { error: err.message });
      }
    },
    adminOnly,
  )

  // ─── Gallery ────────────────────────────────────────────────────────────

  /**
   * Get the MCP server gallery (popular pre-configured servers)
   * GET /api/mcp/gallery
   */
  .get(
    "/gallery",
    async ({ status }) => {
      try {
        return galleryData;
      } catch (err) {
        console.error("Error fetching MCP gallery:", err);
        return status(500, { error: err.message });
      }
    },
    adminOnly,
  )

  // ─── Proxy status ──────────────────────────────────────────────────────

  /**
   * Get MCP proxy health status
   * GET /api/mcp/status
   */
  .get(
    "/status",
    async ({ status }) => {
      try {
        const res = await fetch(`${MCP_PROXY_URL}/health`, {
          signal: AbortSignal.timeout(5000),
        });
        const data = await res.json();
        return data;
      } catch (err) {
        return { healthy: false, error: "MCP proxy unreachable" };
      }
    },
    adminOnly,
  )

  // ─── Reload proxy ──────────────────────────────────────────────────────

  /**
   * Signal MCP proxy to reload its configuration
   * POST /api/mcp/reload
   */
  .post(
    "/reload",
    async ({ status }) => {
      console.log(`${MCP_PROXY_URL}/reload`);
      try {
        const res = await fetch(`${MCP_PROXY_URL}/reload`, {
          method: "POST",
          signal: AbortSignal.timeout(10000),
        });

        if (!res.ok) {
          const text = await res.text();
          return status(502, { error: `Proxy reload failed: ${text}` });
        }

        const data = await res.json();
        return { success: true, ...data };
      } catch (err) {
        console.error("Error reloading MCP proxy:", err);
        return status(502, { error: "MCP proxy unreachable" });
      }
    },
    adminOnly,
  );

export default router;
