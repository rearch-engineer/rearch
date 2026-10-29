/**
 * Caller identity for MCP requests.
 *
 * The backend signs `{ userId, conversationId }` into the `X-MCP-Identity`
 * header of every conversation container (see
 * backend/utils/mcp/identityToken.js — keep the two in sync). Verifying the
 * HMAC here guarantees that a container can only ever act as the user that
 * owns it, which is what makes per-user credentials safe.
 *
 * Format: `<base64url(json)>.<base64url(hmac-sha256)>`
 */

import crypto from 'crypto';

const SIGNING_SECRET =
  process.env.MCP_PROXY_SECRET || process.env.INTERNAL_API_SECRET || '';

if (!SIGNING_SECRET) {
  console.warn(
    '[identity] Neither MCP_PROXY_SECRET nor INTERNAL_API_SECRET is set — ' +
      'identity tokens are unsigned (dev mode only).',
  );
}

function fromB64url(str) {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

/**
 * @param {string} token
 * @param {string} [secret]
 * @returns {{ userId: string, conversationId: string, iat: number } | null}
 */
export function verifyIdentityToken(token, secret = SIGNING_SECRET) {
  if (!token || typeof token !== 'string') return null;
  const [encoded, sig] = token.split('.');
  if (!encoded || !sig) return null;

  const expected = crypto.createHmac('sha256', secret).update(encoded).digest();
  const given = fromB64url(sig);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    return null;
  }

  try {
    const payload = JSON.parse(fromB64url(encoded).toString('utf8'));
    if (payload.v !== 1 || !payload.userId || !payload.conversationId) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Resolve the verified identity of an incoming MCP request.
 *
 * @param {Request} request
 * @returns {{ userId: string, conversationId: string } | null}
 */
export function getRequestIdentity(request) {
  const header = request?.headers?.get?.('x-mcp-identity');
  if (!header) return null;
  const payload = verifyIdentityToken(header);
  if (!payload) {
    console.warn('[identity] Rejected X-MCP-Identity header with invalid signature');
    return null;
  }
  return { userId: payload.userId, conversationId: payload.conversationId };
}
