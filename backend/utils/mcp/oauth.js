/**
 * Generic OAuth 2.1 client for remote MCP servers.
 *
 * Implements the client side of the MCP authorization specification without
 * any provider-specific code:
 *
 *   1. Protected-resource discovery (RFC 9728) — from the `WWW-Authenticate`
 *      header of an unauthenticated request or from the well-known URL.
 *   2. Authorization-server metadata (RFC 8414, with OpenID Connect
 *      discovery as fallback).
 *   3. Dynamic client registration (RFC 7591) so admins never have to create
 *      an OAuth app by hand when the server supports it.
 *   4. Authorization-code grant with PKCE (S256) and the `resource`
 *      indicator (RFC 8707).
 *   5. Refresh-token grant.
 *
 * Everything here is pure HTTP + crypto; persistence lives in the callers.
 */

import crypto from "crypto";

const FETCH_TIMEOUT_MS = 15_000;
const CLIENT_NAME = "ReArch";

// ─── PKCE / state helpers ─────────────────────────────────────────────────────

function base64url(buffer) {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function generatePkce() {
  const codeVerifier = base64url(crypto.randomBytes(48));
  const codeChallenge = base64url(
    crypto.createHash("sha256").update(codeVerifier).digest(),
  );
  return { codeVerifier, codeChallenge, codeChallengeMethod: "S256" };
}

export function generateState() {
  return base64url(crypto.randomBytes(24));
}

// ─── Discovery ────────────────────────────────────────────────────────────────

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    redirect: "follow",
  });
  if (!res.ok) return null;
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("json")) {
    // Some servers answer 200 with HTML for unknown well-known paths.
    try {
      return JSON.parse(await res.text());
    } catch {
      return null;
    }
  }
  return res.json();
}

/**
 * Parse the `WWW-Authenticate` header into a key/value map.
 * e.g. `Bearer realm="OAuth", resource_metadata="https://…", scope="read"`
 */
export function parseWwwAuthenticate(header) {
  const params = {};
  if (!header) return params;
  const re = /([a-zA-Z_]+)=(?:"([^"]*)"|([^,\s]+))/g;
  let m;
  while ((m = re.exec(header)) !== null) {
    params[m[1]] = m[2] !== undefined ? m[2] : m[3];
  }
  return params;
}

/**
 * Candidate URLs for a well-known document, honouring the path component of
 * the resource as described in RFC 8414 §3.1 / RFC 9728 §3.1, then falling
 * back to the origin-level document.
 */
export function wellKnownCandidates(baseUrl, suffix) {
  const u = new URL(baseUrl);
  const path = u.pathname.replace(/\/+$/, "");
  const out = [];
  if (path && path !== "/") {
    out.push(`${u.origin}/.well-known/${suffix}${path}`);
  }
  out.push(`${u.origin}/.well-known/${suffix}`);
  return out;
}

/**
 * Discover the protected-resource metadata for an MCP server URL.
 * Returns `{ metadata, scopeHint }` where metadata may be null when the server
 * does not publish any (i.e. it probably does not use OAuth at all).
 */
async function discoverProtectedResource(mcpUrl) {
  let resourceMetadataUrl = null;
  let scopeHint = "";

  // 1) Probe the MCP endpoint unauthenticated — a spec-compliant server
  //    answers 401 with a `resource_metadata` pointer.
  try {
    const res = await fetch(mcpUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: CLIENT_NAME, version: "1.0.0" },
        },
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (res.status === 401) {
      const params = parseWwwAuthenticate(res.headers.get("www-authenticate"));
      if (params.resource_metadata) resourceMetadataUrl = params.resource_metadata;
      if (params.scope) scopeHint = params.scope;
    }
    // Drain the body so the connection can be reused.
    await res.text().catch(() => {});
  } catch {
    // Network error while probing — fall through to the well-known lookup.
  }

  const candidates = resourceMetadataUrl
    ? [resourceMetadataUrl]
    : wellKnownCandidates(mcpUrl, "oauth-protected-resource");

  for (const url of candidates) {
    try {
      const doc = await fetchJson(url);
      if (doc && Array.isArray(doc.authorization_servers)) {
        return { metadata: doc, scopeHint };
      }
    } catch {
      // try next
    }
  }
  return { metadata: null, scopeHint };
}

/**
 * Fetch authorization-server metadata for an issuer URL.
 */
async function discoverAuthorizationServer(issuer) {
  const candidates = [
    ...wellKnownCandidates(issuer, "oauth-authorization-server"),
    ...wellKnownCandidates(issuer, "openid-configuration"),
    `${issuer.replace(/\/+$/, "")}/.well-known/openid-configuration`,
  ];
  for (const url of candidates) {
    try {
      const doc = await fetchJson(url);
      if (doc && doc.authorization_endpoint && doc.token_endpoint) return doc;
    } catch {
      // try next
    }
  }
  return null;
}

/**
 * Full discovery for an MCP server URL.
 *
 * @param {string} mcpUrl
 * @returns {Promise<{
 *   resource: string,
 *   authorizationServer: string,
 *   authorizationEndpoint: string,
 *   tokenEndpoint: string,
 *   registrationEndpoint: string|null,
 *   revocationEndpoint: string|null,
 *   codeChallengeMethods: string[],
 *   scopesSupported: string[],
 *   scopeHint: string,
 * }>}
 */
export async function discoverOAuth(mcpUrl) {
  const { metadata: prm, scopeHint } = await discoverProtectedResource(mcpUrl);

  // Without protected-resource metadata, fall back to treating the MCP origin
  // as the authorization server (older servers did this before RFC 9728).
  const issuer =
    prm?.authorization_servers?.[0] || new URL(mcpUrl).origin;
  const resource = prm?.resource || mcpUrl;

  const asMeta = await discoverAuthorizationServer(issuer);
  if (!asMeta) {
    throw new Error(
      `Could not discover OAuth authorization-server metadata for ${mcpUrl} (issuer ${issuer}). ` +
        "The server may not support OAuth; use shared headers instead.",
    );
  }

  const methods = asMeta.code_challenge_methods_supported || [];
  if (methods.length > 0 && !methods.includes("S256")) {
    throw new Error(
      `Authorization server ${issuer} does not support PKCE S256 (supports: ${methods.join(", ")}).`,
    );
  }

  return {
    resource,
    authorizationServer: issuer,
    authorizationEndpoint: asMeta.authorization_endpoint,
    tokenEndpoint: asMeta.token_endpoint,
    registrationEndpoint: asMeta.registration_endpoint || null,
    revocationEndpoint: asMeta.revocation_endpoint || null,
    codeChallengeMethods: methods,
    scopesSupported: Array.isArray(asMeta.scopes_supported)
      ? asMeta.scopes_supported
      : Array.isArray(prm?.scopes_supported)
        ? prm.scopes_supported
        : [],
    scopeHint,
  };
}

// ─── Dynamic client registration (RFC 7591) ──────────────────────────────────

/**
 * Register a public client (PKCE, no secret) with the authorization server.
 * If the server insists on issuing a secret, it is returned and the caller
 * must persist it (encrypted).
 *
 * @returns {Promise<{ clientId: string, clientSecret: string|null, tokenEndpointAuthMethod: string }>}
 */
export async function registerClient({
  registrationEndpoint,
  redirectUri,
  scopes = "",
  clientName = CLIENT_NAME,
}) {
  if (!registrationEndpoint) {
    throw new Error(
      "The authorization server does not support dynamic client registration. " +
        "Register an OAuth application manually and configure its client ID.",
    );
  }

  const body = {
    client_name: clientName,
    redirect_uris: [redirectUri],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    ...(scopes ? { scope: scopes } : {}),
  };

  const res = await fetch(registrationEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.client_id) {
    throw new Error(
      `Dynamic client registration failed (${res.status}): ${data.error_description || data.error || JSON.stringify(data)}`,
    );
  }

  return {
    clientId: data.client_id,
    clientSecret: data.client_secret || null,
    tokenEndpointAuthMethod:
      data.token_endpoint_auth_method || (data.client_secret ? "client_secret_post" : "none"),
  };
}

// ─── Authorization URL ────────────────────────────────────────────────────────

export function buildAuthorizationUrl({
  authorizationEndpoint,
  clientId,
  redirectUri,
  scopes = "",
  state,
  codeChallenge,
  resource,
}) {
  const url = new URL(authorizationEndpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (scopes) url.searchParams.set("scope", scopes);
  if (resource) url.searchParams.set("resource", resource);
  return url.href;
}

// ─── Token endpoint ───────────────────────────────────────────────────────────

function clientAuth(params, headers, { clientId, clientSecret, tokenEndpointAuthMethod }) {
  if (clientSecret && tokenEndpointAuthMethod === "client_secret_basic") {
    headers.Authorization =
      "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    return;
  }
  params.set("client_id", clientId);
  if (clientSecret) params.set("client_secret", clientSecret);
}

async function tokenRequest(tokenEndpoint, params, headers) {
  const res = await fetch(tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      ...headers,
    },
    body: params.toString(),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error || !data.access_token) {
    const err = new Error(
      `Token request failed (${res.status}): ${data.error_description || data.error || "no access_token in response"}`,
    );
    err.oauthError = data.error || null;
    err.status = res.status;
    throw err;
  }
  return normalizeTokenResponse(data);
}

function normalizeTokenResponse(data) {
  const expiresIn = Number(data.expires_in);
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || null,
    tokenType: data.token_type || "Bearer",
    scope: data.scope || "",
    expiresAt:
      Number.isFinite(expiresIn) && expiresIn > 0
        ? new Date(Date.now() + expiresIn * 1000)
        : null,
  };
}

export async function exchangeCode({
  tokenEndpoint,
  code,
  redirectUri,
  codeVerifier,
  resource,
  clientId,
  clientSecret = null,
  tokenEndpointAuthMethod = "none",
}) {
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });
  if (resource) params.set("resource", resource);
  const headers = {};
  clientAuth(params, headers, { clientId, clientSecret, tokenEndpointAuthMethod });
  return tokenRequest(tokenEndpoint, params, headers);
}

export async function refreshAccessToken({
  tokenEndpoint,
  refreshToken,
  resource,
  scopes = "",
  clientId,
  clientSecret = null,
  tokenEndpointAuthMethod = "none",
}) {
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  if (resource) params.set("resource", resource);
  if (scopes) params.set("scope", scopes);
  const headers = {};
  clientAuth(params, headers, { clientId, clientSecret, tokenEndpointAuthMethod });
  const tokens = await tokenRequest(tokenEndpoint, params, headers);
  // Servers may omit the refresh token on rotation-less refreshes.
  if (!tokens.refreshToken) tokens.refreshToken = refreshToken;
  return tokens;
}

/** Best-effort token revocation (RFC 7009). Never throws. */
export async function revokeToken({ revocationEndpoint, token, clientId, clientSecret = null, tokenEndpointAuthMethod = "none" }) {
  if (!revocationEndpoint || !token) return;
  try {
    const params = new URLSearchParams({ token });
    const headers = {};
    clientAuth(params, headers, { clientId, clientSecret, tokenEndpointAuthMethod });
    await fetch(revocationEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", ...headers },
      body: params.toString(),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch {
    // ignore
  }
}
