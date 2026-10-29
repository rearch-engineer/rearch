/**
 * Per-user access tokens for `oauth-user` MCP servers.
 *
 * The proxy never touches refresh tokens or encryption keys: it asks the
 * backend's internal API for a valid access token and caches it briefly.
 * The backend refreshes transparently and tells us when the user needs to
 * re-authorise.
 */

const BACKEND_API_URL = process.env.BACKEND_API_URL || 'http://localhost:5000';
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET || '';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// Access tokens are cached at most this long, regardless of their expiry.
const MAX_CACHE_MS = 5 * 60_000;

/** @type {Map<string, { accessToken: string, tokenType: string, until: number }>} */
const cache = new Map();

export class NotConnectedError extends Error {
  constructor(serverName, message) {
    super(message || `User has not connected the "${serverName}" integration.`);
    this.name = 'NotConnectedError';
    this.serverName = serverName;
  }
}

function cacheKey(userId, serverName) {
  return `${serverName}:${userId}`;
}

export function integrationsUrl() {
  return `${FRONTEND_URL.replace(/\/+$/, '')}/account/integrations`;
}

/**
 * Human-readable instruction returned to the agent when a per-user
 * integration is not usable, so it can tell the user what to do.
 */
export function connectInstruction(serverName, reason) {
  const base = `The "${serverName}" integration requires your personal authorization.`;
  const detail = reason ? ` ${reason}` : '';
  return `${base}${detail} Ask the user to open ${integrationsUrl()} and connect "${serverName}", then retry.`;
}

/**
 * @param {string} userId
 * @param {string} serverName
 * @param {{ forceRefresh?: boolean }} [opts]
 * @returns {Promise<{ accessToken: string, tokenType: string }>}
 * @throws {NotConnectedError} when the user must (re)connect
 */
export async function getUserAccessToken(userId, serverName, { forceRefresh = false } = {}) {
  const key = cacheKey(userId, serverName);
  if (!forceRefresh) {
    const hit = cache.get(key);
    if (hit && hit.until > Date.now()) return hit;
  }
  cache.delete(key);

  const url = new URL('/api/internal/mcp/user-token', BACKEND_API_URL);
  url.searchParams.set('userId', userId);
  url.searchParams.set('server', serverName);
  if (forceRefresh) url.searchParams.set('forceRefresh', '1');

  let res;
  try {
    res = await fetch(url, {
      headers: { 'X-Internal-Secret': INTERNAL_API_SECRET },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    throw new Error(`Backend unreachable while fetching user token: ${err.message}`);
  }

  const data = await res.json().catch(() => ({}));

  if (res.status === 404 || res.status === 401) {
    throw new NotConnectedError(
      serverName,
      data.error === 'reauthorize_required'
        ? `The previous authorization expired or was revoked (${data.message || 'reauthorize required'}).`
        : undefined,
    );
  }
  if (!res.ok) {
    throw new Error(data.message || data.error || `Backend returned ${res.status}`);
  }

  const expiresAt = data.expiresAt ? new Date(data.expiresAt).getTime() : Infinity;
  const entry = {
    accessToken: data.accessToken,
    tokenType: data.tokenType || 'Bearer',
    until: Math.min(Date.now() + MAX_CACHE_MS, expiresAt - 30_000),
  };
  cache.set(key, entry);
  return entry;
}

export function invalidateUserToken(userId, serverName) {
  cache.delete(cacheKey(userId, serverName));
}

export function clearTokenCacheForServer(serverName) {
  for (const key of cache.keys()) {
    if (key.startsWith(`${serverName}:`)) cache.delete(key);
  }
}
