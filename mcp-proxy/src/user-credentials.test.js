import { describe, it, expect, beforeEach, afterAll } from 'bun:test';
import {
  getUserAccessToken,
  invalidateUserToken,
  NotConnectedError,
  connectInstruction,
} from './user-credentials.js';

const realFetch = globalThis.fetch;
let nextResponse = null;
let calls = 0;

function mockFetch(status, body) {
  nextResponse = { status, body };
}

beforeEach(() => {
  calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    const { status, body } = nextResponse;
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  };
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

describe('per-user token fetching', () => {
  it('maps 404 not_connected to NotConnectedError', async () => {
    mockFetch(404, { error: 'not_connected' });
    await expect(getUserAccessToken('u404', 'linear')).rejects.toBeInstanceOf(NotConnectedError);
  });

  it('maps 401 reauthorize_required to NotConnectedError with a reason', async () => {
    mockFetch(401, { error: 'reauthorize_required', message: 'invalid_grant' });
    let err;
    try {
      await getUserAccessToken('u401', 'linear');
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(NotConnectedError);
    expect(err.message).toContain('invalid_grant');
  });

  it('treats a plain 401 as a proxy configuration error, not a user problem', async () => {
    mockFetch(401, { error: 'Unauthorized' });
    let err;
    try {
      await getUserAccessToken('uCfg', 'linear');
    } catch (e) {
      err = e;
    }
    expect(err).not.toBeInstanceOf(NotConnectedError);
    expect(err.message).toMatch(/INTERNAL_API_SECRET/);
  });

  it('caches a successful token until invalidated or forced', async () => {
    mockFetch(200, { accessToken: 'tok-1', tokenType: 'Bearer', expiresAt: null });
    const a = await getUserAccessToken('uCache', 'linear');
    const b = await getUserAccessToken('uCache', 'linear');
    expect(a.accessToken).toBe('tok-1');
    expect(b.accessToken).toBe('tok-1');
    expect(calls).toBe(1);

    mockFetch(200, { accessToken: 'tok-2', tokenType: 'Bearer', expiresAt: null });
    const c = await getUserAccessToken('uCache', 'linear', { forceRefresh: true });
    expect(c.accessToken).toBe('tok-2');
    expect(calls).toBe(2);

    invalidateUserToken('uCache', 'linear');
    mockFetch(200, { accessToken: 'tok-3', tokenType: 'Bearer', expiresAt: null });
    const d = await getUserAccessToken('uCache', 'linear');
    expect(d.accessToken).toBe('tok-3');
    expect(calls).toBe(3);
  });

  it('builds a connect instruction pointing at the integrations page', () => {
    const text = connectInstruction('linear', 'because');
    expect(text).toContain('/account/integrations');
    expect(text).toContain('"linear"');
    expect(text).toContain('because');
  });
});
