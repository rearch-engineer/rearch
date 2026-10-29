/**
 * Self-service integrations: per-user OAuth connections to MCP servers that
 * the admin configured with `auth.mode === "oauth-user"`.
 *
 * Flow (mirrors the OIDC login flow in routes/auth.js):
 *   1. POST /api/integrations/:server/authorize → { url, stateToken }
 *      The SPA stores stateToken in sessionStorage and redirects to `url`.
 *   2. The authorization server redirects back to the frontend route
 *      /account/integrations/callback?code=…&state=…
 *   3. POST /api/integrations/:server/callback { code, state, stateToken }
 *      The backend verifies the state token (JWT bound to the user), exchanges
 *      the code with PKCE and stores the tokens encrypted.
 */

import { Elysia } from "elysia";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import McpServer from "../models/McpServer.js";
import McpUserCredential from "../models/McpUserCredential.js";
import { authPlugin } from "../middleware/auth.js";
import {
  ensureOAuthClient,
  getIntegrationsRedirectUri,
  storeUserTokens,
  deleteUserCredential,
} from "../utils/mcp/userCredentials.js";
import {
  generatePkce,
  generateState,
  buildAuthorizationUrl,
  exchangeCode,
} from "../utils/mcp/oauth.js";
import { decrypt } from "../utils/encryption.js";

const JWT_SECRET = () => process.env.JWT_SECRET;

// ─── Gallery metadata (titles/descriptions/icons for known servers) ──────────

const __dirname = dirname(fileURLToPath(import.meta.url));
let galleryById = {};
try {
  const raw = readFileSync(join(__dirname, "..", "mcp-gallery.json"), "utf-8");
  for (const item of JSON.parse(raw)) galleryById[item.id] = item;
} catch (err) {
  console.warn("Could not load mcp-gallery.json for integrations:", err.message);
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const serverNameSchema = z.string().regex(/^[a-zA-Z0-9_-]+$/, "Invalid server name");

const callbackBodySchema = z.object({
  code: z.string().min(1, "code is required."),
  state: z.string().min(1, "state is required."),
  stateToken: z.string().min(1, "stateToken is required."),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function findOAuthServer(name) {
  const parsed = serverNameSchema.safeParse(name);
  if (!parsed.success) return null;
  return McpServer.findOne({ name, enabled: true, "auth.mode": "oauth-user" });
}

function presentServer(server, cred) {
  const gallery = galleryById[server.name] || {};
  return {
    name: server.name,
    title: gallery.title || server.name,
    description: gallery.description || "",
    icon: gallery.icon || null,
    url: server.url,
    scopes: server.auth?.oauth?.scopes || "",
    authorizationServer: server.auth?.oauth?.authorizationServer || null,
    ...(cred
      ? cred.toStatusJSON()
      : { connected: false, connectedAt: null, expiresAt: null, scope: "", needsReauth: false, lastError: null }),
  };
}

// ─── Router ───────────────────────────────────────────────────────────────────

const router = new Elysia({ prefix: "/api/integrations" })
  .use(authPlugin)

  /**
   * GET /api/integrations
   * Lists every per-user OAuth MCP server with the caller's connection status.
   */
  .get("/", async ({ user, status }) => {
    try {
      const servers = await McpServer.find({ enabled: true, "auth.mode": "oauth-user" }).sort({ name: 1 });
      const creds = await McpUserCredential.find({
        user: user.userId,
        server: { $in: servers.map((s) => s.name) },
      });
      const byServer = new Map(creds.map((c) => [c.server, c]));
      return servers.map((s) => presentServer(s, byServer.get(s.name)));
    } catch (err) {
      console.error("GET /integrations error:", err);
      return status(500, { error: "Failed to load integrations." });
    }
  })

  /**
   * POST /api/integrations/:server/authorize
   * Returns the authorization URL and a short-lived state token.
   */
  .post("/:server/authorize", async ({ params, user, status }) => {
    const server = await findOAuthServer(params.server);
    if (!server) return status(404, { error: "Integration not found." });

    try {
      const oauth = await ensureOAuthClient(server);
      const { codeVerifier, codeChallenge } = generatePkce();
      const state = generateState();

      const stateToken = jwt.sign(
        { purpose: "mcp-oauth", userId: user.userId, server: server.name, state, codeVerifier },
        JWT_SECRET(),
        { expiresIn: "10m" },
      );

      const url = buildAuthorizationUrl({
        authorizationEndpoint: oauth.authorizationEndpoint,
        clientId: oauth.clientId,
        redirectUri: getIntegrationsRedirectUri(),
        scopes: oauth.scopes || "",
        state,
        codeChallenge,
        resource: oauth.resource,
      });

      return { url, stateToken };
    } catch (err) {
      console.error(`POST /integrations/${params.server}/authorize error:`, err);
      return status(502, { error: err.message || "Failed to start authorization." });
    }
  })

  /**
   * POST /api/integrations/:server/callback
   * Body: { code, state, stateToken }
   */
  .post("/:server/callback", async ({ params, body, user, status }) => {
    const server = await findOAuthServer(params.server);
    if (!server) return status(404, { error: "Integration not found." });

    const parsed = callbackBodySchema.safeParse(body);
    if (!parsed.success) {
      return status(400, { error: parsed.error.errors[0].message });
    }
    const { code, state, stateToken } = parsed.data;

    let payload;
    try {
      payload = jwt.verify(stateToken, JWT_SECRET());
    } catch {
      return status(400, { error: "Invalid or expired state token. Please try connecting again." });
    }
    if (
      payload.purpose !== "mcp-oauth" ||
      payload.userId !== user.userId ||
      payload.server !== server.name ||
      payload.state !== state
    ) {
      return status(400, { error: "State mismatch. Please try connecting again." });
    }

    try {
      const oauth = server.auth.oauth;
      const tokens = await exchangeCode({
        tokenEndpoint: oauth.tokenEndpoint,
        code,
        redirectUri: oauth.redirectUri || getIntegrationsRedirectUri(),
        codeVerifier: payload.codeVerifier,
        resource: oauth.resource,
        clientId: oauth.clientId,
        clientSecret: oauth.clientSecret?.ciphertext
          ? decrypt(oauth.clientSecret.ciphertext, oauth.clientSecret.iv, oauth.clientSecret.tag)
          : null,
        tokenEndpointAuthMethod: oauth.tokenEndpointAuthMethod || "none",
      });

      const cred = await storeUserTokens(user.userId, server.name, tokens);
      return presentServer(server, cred);
    } catch (err) {
      console.error(`POST /integrations/${params.server}/callback error:`, err);
      return status(502, { error: err.message || "Failed to complete authorization." });
    }
  })

  /**
   * DELETE /api/integrations/:server
   * Disconnects the caller from the integration (revokes tokens best-effort).
   */
  .delete("/:server", async ({ params, user, status }) => {
    const server = await findOAuthServer(params.server);
    if (!server) return status(404, { error: "Integration not found." });
    try {
      await deleteUserCredential(user.userId, server.name);
      return presentServer(server, null);
    } catch (err) {
      console.error(`DELETE /integrations/${params.server} error:`, err);
      return status(500, { error: "Failed to disconnect integration." });
    }
  });

export default router;
