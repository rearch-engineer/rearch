import { Elysia } from "elysia";
import { z } from "zod";
import McpServer from "../../models/McpServer.js";
import McpUserCredential from "../../models/McpUserCredential.js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { downloadFileBuffer } from "../../utils/gridfs.js";
import { parseOpenApiSpec, loadSpec } from "../../utils/mcp/openapiParser.js";
import { suggestCuration } from "../../utils/mcp/openapiAiCuration.js";
import { discoverOAuth } from "../../utils/mcp/oauth.js";
import { ensureOAuthClient } from "../../utils/mcp/userCredentials.js";

// ─── Gallery Data ─────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
let galleryData = [];
try {
  const raw = readFileSync(join(__dirname, "..", "..", "mcp-gallery.json"), "utf-8");
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

const objectIdSchema = z
  .string()
  .regex(/^[a-fA-F0-9]{24}$/, "Must be a valid file id");

const openApiParameterSchema = z.object({
  name: z.string().min(1),
  in: z.enum(["path", "query", "header", "cookie"]),
  required: z.boolean().optional().default(false),
  type: z.string().optional().default("string"),
  description: z.string().optional().default(""),
});

const openApiOperationSchema = z.object({
  operationId: z.string().optional(),
  method: z.string().min(1),
  path: z.string().min(1),
  toolName: z
    .string()
    .min(1)
    .regex(/^[a-zA-Z0-9_]+$/, "Tool name must be alphanumeric/underscore"),
  description: z.string().optional().default(""),
  enabled: z.boolean().optional().default(true),
  parameters: z.array(openApiParameterSchema).optional().default([]),
  requestBodySchema: z.any().optional().nullable(),
});

const authSchema = z
  .object({
    mode: z.enum(["shared", "oauth-user"]).optional().default("shared"),
    oauth: z
      .object({
        scopes: z.string().max(500).optional().default(""),
      })
      .optional(),
  })
  .optional();

// Shared validation for the type-specific required fields.
function refineByType(data, ctx) {
  if (data.auth?.mode === "oauth-user" && data.type !== "remote") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Per-user OAuth is only available for remote servers",
      path: ["auth", "mode"],
    });
  }
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
  if (data.type === "openapi") {
    if (!data.baseUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Base URL is required for API Definition server type",
        path: ["baseUrl"],
      });
    }
    if (!data.specFileId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Spec file is required for API Definition server type",
        path: ["specFileId"],
      });
    }
    const enabledOps = (data.operations || []).filter((o) => o.enabled !== false);
    if (enabledOps.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one operation must be selected",
        path: ["operations"],
      });
    }
  }
}

const serverFieldsShape = {
  type: z.enum(["remote", "local", "openapi"], {
    required_error: 'Type must be "remote", "local" or "openapi"',
  }),
  url: z.string().url("Must be a valid URL").optional(),
  command: z.array(z.string().min(1)).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  environment: z.record(z.string(), z.string()).optional(),
  baseUrl: z.string().url("Must be a valid URL").optional(),
  specFileId: objectIdSchema.optional(),
  operations: z.array(openApiOperationSchema).optional(),
  auth: authSchema,
  enabled: z.boolean().optional().default(true),
};

const createServerSchema = z
  .object({
    name: serverNameSchema,
    ...serverFieldsShape,
  })
  .superRefine(refineByType);

const updateServerSchema = z
  .object({
    ...serverFieldsShape,
  })
  .superRefine(refineByType);

const parseSpecSchema = z.object({
  specFileId: objectIdSchema.optional(),
  spec: z.string().optional(),
  aiCurate: z.boolean().optional().default(false),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MCP_PROXY_URL = process.env.MCP_PROXY_URL || "http://mcp-proxy:3100";

/**
 * Merge the admin-submitted `auth` block into a server document, preserving
 * discovered OAuth metadata/registration when the mode stays `oauth-user`.
 */
function applyAuth(server, auth) {
  const mode = auth?.mode || "shared";
  const prev = server.auth?.oauth?.toObject ? server.auth.oauth.toObject() : server.auth?.oauth || {};
  server.auth = {
    mode,
    oauth: {
      ...(mode === "oauth-user" ? prev : {}),
      scopes: auth?.oauth?.scopes ?? prev.scopes ?? "",
    },
  };
  server.markModified("auth");
}

/**
 * For `oauth-user` servers, run discovery + dynamic client registration right
 * away so the admin sees configuration problems at save time rather than when
 * the first user clicks "Connect". Returns an error message or null.
 */
async function bootstrapOAuth(server) {
  if (server.type !== "remote" || server.auth?.mode !== "oauth-user") return null;
  try {
    await ensureOAuthClient(server, { force: true });
    return null;
  } catch (err) {
    return err.message;
  }
}

// ─── Router ───────────────────────────────────────────────────────────────────

const router = new Elysia({ prefix: "/mcp" })

  /**
   * Get all MCP servers
   * GET /api/admin/mcp/servers
   */
  .get(
    "/servers",
    async ({ status }) => {
      try {
        const servers = await McpServer.find().sort({ name: 1 });
        return servers.map((s) => s.toAdminJSON());
      } catch (err) {
        console.error("Error fetching MCP servers:", err);
        return status(500, { error: err.message });
      }
    },
  )

  /**
   * Add a new MCP server
   * POST /api/admin/mcp/servers
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

        const {
          name,
          type,
          url,
          command,
          headers,
          environment,
          baseUrl,
          specFileId,
          operations,
          auth,
          enabled,
        } = parsed.data;

        const existing = await McpServer.findOne({ name });
        if (existing) {
          return status(409, { error: `Server "${name}" already exists` });
        }

        const server = new McpServer({
          name,
          type,
          url,
          command,
          // Per-user OAuth servers never use shared headers.
          headers: auth?.mode === "oauth-user" ? {} : headers,
          environment,
          baseUrl,
          specFileId,
          operations,
          enabled,
        });
        applyAuth(server, auth);

        const oauthError = await bootstrapOAuth(server);
        if (oauthError) {
          return status(400, { error: `OAuth setup failed: ${oauthError}` });
        }

        await server.save();
        return server.toAdminJSON();
      } catch (err) {
        console.error("Error adding MCP server:", err);
        return status(500, { error: err.message });
      }
    },
  )

  /**
   * Update an existing MCP server
   * PUT /api/admin/mcp/servers/:name
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

        const {
          type,
          url,
          command,
          headers,
          environment,
          baseUrl,
          specFileId,
          operations,
          auth,
          enabled,
        } = parsed.data;
        const urlChanged = type === "remote" && url !== server.url;
        const modeChanged = (auth?.mode || "shared") !== (server.auth?.mode || "shared");
        Object.assign(server, {
          type,
          url,
          command,
          headers: auth?.mode === "oauth-user" ? {} : headers,
          environment,
          baseUrl,
          specFileId,
          operations,
          enabled,
        });
        applyAuth(server, auth);

        // Re-run discovery/registration when the target or mode changed, or
        // when the server has never been bootstrapped.
        if (
          server.auth.mode === "oauth-user" &&
          (urlChanged || modeChanged || !server.auth.oauth?.clientId)
        ) {
          const oauthError = await bootstrapOAuth(server);
          if (oauthError) {
            return status(400, { error: `OAuth setup failed: ${oauthError}` });
          }
        }

        // Switching away from per-user OAuth invalidates every user grant.
        if (modeChanged && server.auth.mode !== "oauth-user") {
          await McpUserCredential.deleteMany({ server: server.name });
        }

        await server.save();

        return server.toAdminJSON();
      } catch (err) {
        console.error("Error updating MCP server:", err);
        return status(500, { error: err.message });
      }
    },
  )

  /**
   * Remove an MCP server
   * DELETE /api/admin/mcp/servers/:name
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
        await McpUserCredential.deleteMany({ server: params.name });

        return { success: true };
      } catch (err) {
        console.error("Error deleting MCP server:", err);
        return status(500, { error: err.message });
      }
    },
  )

  /**
   * Get the MCP server gallery (popular pre-configured servers)
   * GET /api/admin/mcp/gallery
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
  )

  /**
   * Parse an uploaded OpenAPI/Swagger spec into a curation-ready operation list.
   * POST /api/admin/mcp/openapi/parse
   * Body: { specFileId?: string (GridFS id), spec?: string (raw), aiCurate?: boolean }
   * Returns: { info, defaultBaseUrl, operations, aiApplied }
   */
  .post(
    "/openapi/parse",
    async ({ body, status }) => {
      try {
        const parsed = parseSpecSchema.safeParse(body);
        if (!parsed.success) {
          return status(400, {
            error: parsed.error.errors.map((e) => e.message).join(", "),
          });
        }

        const { specFileId, spec, aiCurate } = parsed.data;

        let raw = spec;
        if (!raw && specFileId) {
          const buffer = await downloadFileBuffer(specFileId);
          raw = buffer.toString("utf-8");
        }

        if (!raw) {
          return status(400, {
            error: "Either specFileId or spec content is required",
          });
        }

        let result;
        try {
          result = parseOpenApiSpec(raw);
        } catch (err) {
          return status(400, { error: err.message });
        }

        // Future-foreseen AI auto-curation seam (currently a no-op pass-through).
        const { operations, aiApplied } = await suggestCuration(
          result.operations,
          loadSpec(raw),
          { aiCurate },
        );

        return { ...result, operations, aiApplied };
      } catch (err) {
        console.error("Error parsing OpenAPI spec:", err);
        return status(500, { error: err.message });
      }
    },
  )

  /**
   * Probe a remote MCP URL for OAuth support (used by the admin form before
   * saving a per-user OAuth server).
   * POST /api/admin/mcp/oauth/discover  Body: { url }
   * Returns the discovered metadata, or 400 when the server does not
   * advertise an OAuth authorization server.
   */
  .post(
    "/oauth/discover",
    async ({ body, status }) => {
      const parsed = z.object({ url: z.string().url("Must be a valid URL") }).safeParse(body);
      if (!parsed.success) {
        return status(400, { error: parsed.error.errors.map((e) => e.message).join(", ") });
      }
      try {
        const meta = await discoverOAuth(parsed.data.url);
        return {
          supported: true,
          dynamicRegistration: !!meta.registrationEndpoint,
          ...meta,
        };
      } catch (err) {
        return status(400, { supported: false, error: err.message });
      }
    },
  )

  /**
   * Get MCP proxy health status
   * GET /api/admin/mcp/status
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
  )

  /**
   * Signal MCP proxy to reload its configuration
   * POST /api/admin/mcp/reload
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
  );

export default router;
