import { describe, it, expect, mock, beforeEach, spyOn } from 'bun:test';
import { Elysia } from 'elysia';

// ── Module mocks must be hoisted before the module under test is imported ──────

const mockJwtVerify = mock(() => {});
const mockUserFindById = mock(() => {});

mock.module('jsonwebtoken', () => ({
  default: { verify: mockJwtVerify },
}));

mock.module('../models/User.js', () => ({
  default: {
    findById: mockUserFindById,
    findOne: mock(() => {}),
    create: mock(() => {}),
  },
}));

// Import AFTER mocks are registered
const { authPlugin } = await import('./auth.js');

// ── Helpers ────────────────────────────────────────────────────────────────────

const VALID_USER = {
  _id: { toString: () => 'user123' },
  account: { email: 'alice@example.com', username: 'alice', status: 'active' },
  auth: { roles: ['user'] },
};

const VALID_TOKEN = 'header.payload.signature';

/**
 * Build a fresh Elysia app with the auth plugin and a test route,
 * then send a request and return { status, body }.
 */
async function sendRequest(headers = {}) {
  const app = new Elysia()
    .use(authPlugin)
    .get('/test', ({ user }) => ({ user }));

  const reqHeaders = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    reqHeaders.set(key, value);
  }

  const response = await app.handle(
    new Request('http://localhost/test', { headers: reqHeaders }),
  );

  let body;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  return { status: response.status, body };
}

beforeEach(() => {
  mockJwtVerify.mockReset();
  mockUserFindById.mockReset();
  // Default env for LOCAL mode
  process.env.AUTH_MODE = 'LOCAL';
  process.env.JWT_SECRET = 'test-secret';
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('authPlugin (LOCAL mode)', () => {
  it('returns 401 when Authorization header is absent', async () => {
    const { status, body } = await sendRequest({});

    expect(status).toBe(401);
    expect(body.error).toContain('Authentication required');
  });

  it('returns 401 when Authorization header does not start with Bearer', async () => {
    const { status, body } = await sendRequest({ authorization: 'Basic abc123' });

    expect(status).toBe(401);
    expect(body.error).toContain('Authentication required');
  });

  it('returns 500 when JWT_SECRET is not configured', async () => {
    delete process.env.JWT_SECRET;
    const consoleSpy = spyOn(console, 'error').mockImplementation(() => {});

    const { status, body } = await sendRequest({ authorization: `Bearer ${VALID_TOKEN}` });
    consoleSpy.mockRestore();

    expect(status).toBe(500);
    expect(body.error).toContain('misconfiguration');
  });

  it('returns 401 when JWT verification throws a generic error', async () => {
    mockJwtVerify.mockImplementation(() => { throw new Error('invalid signature'); });

    const { status, body } = await sendRequest({ authorization: `Bearer ${VALID_TOKEN}` });

    expect(status).toBe(401);
    expect(body.error).toContain('Invalid token');
  });

  it('returns 401 when JWT is expired', async () => {
    const expired = new Error('jwt expired');
    expired.name = 'TokenExpiredError';
    mockJwtVerify.mockImplementation(() => { throw expired; });

    const { status, body } = await sendRequest({ authorization: `Bearer ${VALID_TOKEN}` });

    expect(status).toBe(401);
    expect(body.error).toContain('expired');
  });

  it('returns 401 when user is not found in the database', async () => {
    mockJwtVerify.mockReturnValue({ userId: 'user123' });
    mockUserFindById.mockReturnValue({ lean: () => Promise.resolve(null) });

    const { status, body } = await sendRequest({ authorization: `Bearer ${VALID_TOKEN}` });

    expect(status).toBe(401);
    expect(body.error).toContain('User not found');
  });

  it('returns 403 when user account is not active', async () => {
    mockJwtVerify.mockReturnValue({ userId: 'user123' });
    mockUserFindById.mockReturnValue({
      lean: () => Promise.resolve({
        ...VALID_USER,
        account: { ...VALID_USER.account, status: 'suspended' },
      }),
    });

    const { status, body } = await sendRequest({ authorization: `Bearer ${VALID_TOKEN}` });

    expect(status).toBe(403);
    expect(body.error).toContain('suspended');
  });

  it('populates user in context on valid token and active user', async () => {
    mockJwtVerify.mockReturnValue({ userId: 'user123' });
    mockUserFindById.mockReturnValue({ lean: () => Promise.resolve(VALID_USER) });

    const { status, body } = await sendRequest({ authorization: `Bearer ${VALID_TOKEN}` });

    expect(status).toBe(200);
    expect(body.user).toEqual({
      userId: 'user123',
      email: 'alice@example.com',
      username: 'alice',
      roles: ['user'],
      status: 'active',
    });
  });

  it('attaches correct userId string (not ObjectId object) to user', async () => {
    mockJwtVerify.mockReturnValue({ userId: 'user123' });
    mockUserFindById.mockReturnValue({ lean: () => Promise.resolve(VALID_USER) });

    const { status, body } = await sendRequest({ authorization: `Bearer ${VALID_TOKEN}` });

    expect(status).toBe(200);
    expect(typeof body.user.userId).toBe('string');
    expect(body.user.userId).toBe('user123');
  });
});
