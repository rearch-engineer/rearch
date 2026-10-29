import { describe, it, expect } from 'bun:test';
import crypto from 'crypto';
import { verifyIdentityToken, getRequestIdentity } from './identity.js';

// Mirror of backend/utils/mcp/identityToken.js#signMcpIdentity so the test
// proves both implementations agree on the wire format.
function sign(payload, secret) {
  const b64url = (buf) =>
    Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const encoded = b64url(JSON.stringify({ v: 1, iat: 1, ...payload }));
  const sig = crypto.createHmac('sha256', secret).update(encoded).digest();
  return `${encoded}.${b64url(sig)}`;
}

describe('identity token verification', () => {
  it('accepts a correctly signed token', () => {
    const token = sign({ userId: 'u1', conversationId: 'c1' }, 's3cret');
    const payload = verifyIdentityToken(token, 's3cret');
    expect(payload).toMatchObject({ userId: 'u1', conversationId: 'c1' });
  });

  it('rejects wrong secret, tampering and garbage', () => {
    const token = sign({ userId: 'u1', conversationId: 'c1' }, 's3cret');
    expect(verifyIdentityToken(token, 'nope')).toBeNull();
    const [, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ v: 1, iat: 1, userId: 'u2', conversationId: 'c1' }))
      .toString('base64url');
    expect(verifyIdentityToken(`${forged}.${sig}`, 's3cret')).toBeNull();
    expect(verifyIdentityToken('not-a-token', 's3cret')).toBeNull();
    expect(verifyIdentityToken(undefined, 's3cret')).toBeNull();
  });

  it('returns null when the request has no identity header', () => {
    const req = new Request('http://proxy/mcp', { method: 'POST' });
    expect(getRequestIdentity(req)).toBeNull();
  });
});
