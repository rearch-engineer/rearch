/**
 * Per-user MCP credential management.
 *
 * Owns everything that touches McpUserCredential tokens: encryption at rest,
 * refresh, and the OAuth client bootstrap (discovery + dynamic registration)
 * for servers in `auth.mode === "oauth-user"`.
 */

import McpServer from "../../models/McpServer.js";
import McpUserCredential from "../../models/McpUserCredential.js";
import { encrypt, decrypt } from "../encryption.js";
import {
  discoverOAuth,
  registerClient,
  refreshAccessToken,
  revokeToken,
} from "./oauth.js";

// Refresh when the access token expires within this window.
const REFRESH_SKEW_MS = 60_000;

// ─── Redirect URI ─────────────────────────────────────────────────────────────

/**
 * Where the authorization server sends the user back. It is a frontend route
 * (the SPA posts the code to the backend), mirroring the OIDC login flow.
 */
export function getIntegrationsRedirectUri() {
  if (process.env.MCP_OAUTH_REDIRECT_URI) return process.env.MCP_OAUTH_REDIRECT_URI;
  const base = (process.env.FRONTEND_URL || "http://localhost:4200").replace(/\/+$/, "");
  return `${base}/account/integrations/callback`;
}

// ─── Encrypted field helpers ──────────────────────────────────────────────────

function encField(value) {
  if (!value) return { ciphertext: null, iv: null, tag: null };
  return encrypt(value);
}

function decField(field) {
  if (!field?.ciphertext) return null;
  return decrypt(field.ciphertext, field.iv, field.tag);
}

// ─── OAuth client bootstrap ───────────────────────────────────────────────────

/**
 * Ensure a server has discovered metadata and a registered OAuth client for
 * the current redirect URI. Persists the result on the McpServer document.
 *
 * @param {import('mongoose').Document} server McpServer document
 * @param {{ force?: boolean }} [opts]
 * @returns {Promise<object>} server.auth.oauth (plain)
 */
export async function ensureOAuthClient(server, { force = false } = {}) {
  if (server.type !== "remote" || server.auth?.mode !== "oauth-user") {
    throw new Error(`Server "${server.name}" is not configured for per-user OAuth.`);
  }
  const redirectUri = getIntegrationsRedirectUri();
  const oauth = server.auth.oauth || {};
  const manual = oauth.registration === "manual";

  let changed = false;
  const needsDiscovery =
    force ||
    !oauth.authorizationEndpoint ||
    !oauth.tokenEndpoint ||
    // Servers bootstrapped before scopeHint existed: discover once more.
    oauth.scopeHint === undefined ||
    oauth.scopeHint === null;
  if (needsDiscovery) {
    const meta = await discoverOAuth(server.url);
    server.auth.oauth.scopeHint = meta.scopeHint || "";
    server.auth.oauth.resource = meta.resource;
    server.auth.oauth.authorizationServer = meta.authorizationServer;
    server.auth.oauth.authorizationEndpoint = meta.authorizationEndpoint;
    server.auth.oauth.tokenEndpoint = meta.tokenEndpoint;
    server.auth.oauth.registrationEndpoint = meta.registrationEndpoint;
    server.auth.oauth.revocationEndpoint = meta.revocationEndpoint;
    server.auth.oauth.codeChallengeMethods = meta.codeChallengeMethods;
    server.auth.oauth.scopesSupported = meta.scopesSupported;
    server.auth.oauth.discoveredAt = new Date();
    changed = true;
    // A different authorization server invalidates a dynamically registered
    // client (a manually registered app is the admin's responsibility).
    if (
      !manual &&
      oauth.authorizationServer &&
      oauth.authorizationServer !== meta.authorizationServer
    ) {
      server.auth.oauth.clientId = null;
      server.auth.oauth.clientSecret = { ciphertext: null, iv: null, tag: null };
    }
  }

  if (manual) {
    if (!server.auth.oauth.clientId) {
      throw new Error(
        "Manual registration requires a client ID. Register an OAuth application with the provider " +
          `using the redirect URI ${redirectUri} and enter its client ID (and secret, if any).`,
      );
    }
    if (server.auth.oauth.redirectUri !== redirectUri) {
      server.auth.oauth.redirectUri = redirectUri;
      changed = true;
    }
  } else {
    const needsRegistration =
      force ||
      !server.auth.oauth.clientId ||
      server.auth.oauth.redirectUri !== redirectUri;
    if (needsRegistration) {
      const reg = await registerClient({
        registrationEndpoint: server.auth.oauth.registrationEndpoint,
        redirectUri,
        scopes: server.auth.oauth.scopes || "",
      });
      server.auth.oauth.clientId = reg.clientId;
      server.auth.oauth.clientSecret = encField(reg.clientSecret);
      server.auth.oauth.tokenEndpointAuthMethod = reg.tokenEndpointAuthMethod;
      server.auth.oauth.redirectUri = redirectUri;
      server.auth.oauth.registeredAt = new Date();
      changed = true;
    }
  }

  if (changed) {
    server.markModified("auth");
    await server.save();
  }

  return server.auth.oauth;
}

/**
 * Scopes to request: the admin's explicit list, else the scope the server
 * advertised in its WWW-Authenticate challenge, else none (server default).
 */
export function effectiveScopes(oauth) {
  return (oauth?.scopes || "").trim() || (oauth?.scopeHint || "").trim() || "";
}

/** Client credentials (decrypted) for token-endpoint calls. */
function clientCredentials(server) {
  const o = server.auth.oauth;
  return {
    tokenEndpoint: o.tokenEndpoint,
    resource: o.resource,
    scopes: effectiveScopes(o),
    clientId: o.clientId,
    clientSecret: decField(o.clientSecret),
    tokenEndpointAuthMethod: o.tokenEndpointAuthMethod || "none",
  };
}

// ─── Credential persistence ───────────────────────────────────────────────────

export async function storeUserTokens(userId, serverName, tokens) {
  const update = {
    accessToken: encField(tokens.accessToken),
    refreshToken: encField(tokens.refreshToken),
    tokenType: tokens.tokenType || "Bearer",
    scope: tokens.scope || "",
    expiresAt: tokens.expiresAt || null,
    connectedAt: new Date(),
    lastRefreshedAt: null,
    lastError: null,
    needsReauth: false,
  };
  return McpUserCredential.findOneAndUpdate(
    { user: userId, server: serverName },
    { $set: update },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

export async function deleteUserCredential(userId, serverName) {
  const cred = await McpUserCredential.findOne({ user: userId, server: serverName });
  if (!cred) return false;

  // Best-effort revocation so the upstream forgets the grant too.
  const server = await McpServer.findOne({ name: serverName });
  if (server?.auth?.oauth?.revocationEndpoint) {
    const creds = clientCredentials(server);
    for (const field of [cred.refreshToken, cred.accessToken]) {
      const token = decField(field);
      if (token) {
        await revokeToken({
          revocationEndpoint: server.auth.oauth.revocationEndpoint,
          token,
          clientId: creds.clientId,
          clientSecret: creds.clientSecret,
          tokenEndpointAuthMethod: creds.tokenEndpointAuthMethod,
        });
      }
    }
  }

  await cred.deleteOne();
  return true;
}

/**
 * Return a valid access token for a user/server pair, refreshing it when it
 * is expired or about to expire (or when `forceRefresh` is set, e.g. after
 * the upstream rejected the token).
 *
 * @returns {Promise<{ accessToken: string, tokenType: string, expiresAt: Date|null }>}
 * @throws {Error} with `code` = "not_connected" | "reauthorize_required" | "server_not_found"
 */
export async function getUserAccessToken(userId, serverName, { forceRefresh = false } = {}) {
  const server = await McpServer.findOne({ name: serverName });
  if (!server || server.auth?.mode !== "oauth-user") {
    const err = new Error(`Server "${serverName}" is not configured for per-user OAuth.`);
    err.code = "server_not_found";
    throw err;
  }

  const cred = await McpUserCredential.findOne({ user: userId, server: serverName });
  if (!cred?.accessToken?.ciphertext) {
    const err = new Error("User has not connected this integration.");
    err.code = "not_connected";
    throw err;
  }
  if (cred.needsReauth) {
    const err = new Error(cred.lastError || "Re-authorization required.");
    err.code = "reauthorize_required";
    throw err;
  }

  const expiringSoon =
    cred.expiresAt && cred.expiresAt.getTime() - Date.now() < REFRESH_SKEW_MS;

  if (!forceRefresh && !expiringSoon) {
    return {
      accessToken: decField(cred.accessToken),
      tokenType: cred.tokenType || "Bearer",
      expiresAt: cred.expiresAt,
    };
  }

  const refreshToken = decField(cred.refreshToken);
  if (!refreshToken) {
    // Nothing to refresh with. If the token has no expiry we assume it is a
    // long-lived token and still hand it out unless the caller forced it.
    if (!cred.expiresAt && !forceRefresh) {
      return {
        accessToken: decField(cred.accessToken),
        tokenType: cred.tokenType || "Bearer",
        expiresAt: null,
      };
    }
    cred.needsReauth = true;
    cred.lastError = "Access token expired and no refresh token is available.";
    await cred.save();
    const err = new Error(cred.lastError);
    err.code = "reauthorize_required";
    throw err;
  }

  try {
    const tokens = await refreshAccessToken({
      ...clientCredentials(server),
      refreshToken,
    });
    cred.accessToken = encField(tokens.accessToken);
    cred.refreshToken = encField(tokens.refreshToken);
    cred.tokenType = tokens.tokenType || cred.tokenType;
    if (tokens.scope) cred.scope = tokens.scope;
    cred.expiresAt = tokens.expiresAt;
    cred.lastRefreshedAt = new Date();
    cred.lastError = null;
    cred.needsReauth = false;
    await cred.save();
    return {
      accessToken: tokens.accessToken,
      tokenType: cred.tokenType,
      expiresAt: cred.expiresAt,
    };
  } catch (refreshErr) {
    // `invalid_grant` means the refresh token was revoked/expired → re-auth.
    const permanent =
      refreshErr.oauthError === "invalid_grant" ||
      refreshErr.oauthError === "invalid_client" ||
      (refreshErr.status >= 400 && refreshErr.status < 500);
    if (permanent) {
      cred.needsReauth = true;
      cred.lastError = refreshErr.message;
      await cred.save();
      const err = new Error(refreshErr.message);
      err.code = "reauthorize_required";
      throw err;
    }
    // Transient failure: surface it but keep the credential intact.
    const err = new Error(`Token refresh failed: ${refreshErr.message}`);
    err.code = "refresh_failed";
    throw err;
  }
}
