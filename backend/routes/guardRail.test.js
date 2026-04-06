import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { Elysia } from 'elysia';

// ── Mock modules before importing the router ──────────────────────────────────

const mockFind = mock(() => {});
const mockSave = mock(() => {});
const mockFindByIdAndUpdate = mock(() => {});
const mockFindByIdAndDelete = mock(() => {});

/**
 * Mock constructor that returns a plain object (so Elysia serialises it as JSON).
 * Mongoose documents serialize fine via toJSON; our mock mimics that by returning
 * a plain object with a non-enumerable `save` method.
 */
function MockGuardRail(data) {
  const instance = { ...data };
  Object.defineProperty(instance, 'save', { enumerable: false, value: mockSave });
  return instance;
}
MockGuardRail.find = mockFind;
MockGuardRail.findByIdAndUpdate = mockFindByIdAndUpdate;
MockGuardRail.findByIdAndDelete = mockFindByIdAndDelete;

mock.module('../models/GuardRail.js', () => ({ default: MockGuardRail }));

// Mock auth dependencies so authPlugin passes through
const mockJwtVerify = mock(() => {});
const mockUserFindById = mock(() => {});

mock.module('jsonwebtoken', () => ({
  default: { verify: mockJwtVerify },
}));

mock.module('../models/User.js', () => ({
  default: {
    findById: mockUserFindById,
    findOne: mock(() => null),
    create: mock(() => {}),
  },
}));

// Import AFTER mocks are in place
const { default: router } = await import('./guardRail.js');

// ── Helpers ────────────────────────────────────────────────────────────────────

const VALID_ID = 'a1b2c3d4e5f6a1b2c3d4e5f6';
const VALID_TOKEN = 'header.payload.signature';

const ADMIN_USER = {
  _id: { toString: () => 'admin123' },
  account: { email: 'admin@example.com', username: 'admin', status: 'active' },
  auth: { roles: ['admin'] },
};

function createApp() {
  return new Elysia().use(router);
}

/**
 * Send a request to the guard-rail router with auth headers.
 * Returns { status, body }.
 */
async function sendRequest(method, path, { body, headers = {} } = {}) {
  const app = createApp();

  const reqInit = {
    method,
    headers: {
      'Authorization': `Bearer ${VALID_TOKEN}`,
      ...headers,
    },
  };

  if (body !== undefined) {
    reqInit.headers['Content-Type'] = 'application/json';
    reqInit.body = JSON.stringify(body);
  }

  const response = await app.handle(
    new Request(`http://localhost/api/guard-rails${path}`, reqInit),
  );

  let responseBody;
  const text = await response.text();
  try {
    responseBody = JSON.parse(text);
  } catch {
    responseBody = text || null;
  }

  return { status: response.status, body: responseBody };
}

beforeEach(() => {
  mockFind.mockReset();
  mockSave.mockReset();
  mockFindByIdAndUpdate.mockReset();
  mockFindByIdAndDelete.mockReset();
  mockJwtVerify.mockReset();
  mockUserFindById.mockReset();

  // Default: auth passes with an admin user
  process.env.AUTH_MODE = 'LOCAL';
  process.env.JWT_SECRET = 'test-secret';
  mockJwtVerify.mockReturnValue({ userId: 'admin123' });
  mockUserFindById.mockReturnValue({ lean: () => Promise.resolve(ADMIN_USER) });
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('GET /api/guard-rails', () => {
  it('returns all guard rails as JSON', async () => {
    const items = [{ regularExpression: 'foo', reject: false }];
    mockFind.mockResolvedValue(items);

    const { status, body } = await sendRequest('GET', '/');

    expect(status).toBe(200);
    expect(body).toEqual(items);
  });

  it('returns 500 when the database throws', async () => {
    mockFind.mockRejectedValue(new Error('DB connection lost'));

    const { status, body } = await sendRequest('GET', '/');

    expect(status).toBe(500);
    expect(body.error).toContain('DB connection lost');
  });
});

describe('POST /api/guard-rails', () => {
  it('creates and returns a new guard rail with status 201', async () => {
    const reqBody = { regularExpression: 'bad-word', reject: true };
    mockSave.mockResolvedValue(undefined);

    const { status, body } = await sendRequest('POST', '/', { body: reqBody });

    expect(status).toBe(201);
    expect(body.regularExpression).toBe('bad-word');
    expect(body.reject).toBe(true);
  });

  it('returns 400 when regularExpression is missing (validation)', async () => {
    const { status, body } = await sendRequest('POST', '/', { body: {} });

    expect(status).toBe(400);
    expect(body.error).toBe('Validation failed');
  });

  it('applies default value of false for reject when omitted', async () => {
    mockSave.mockResolvedValue(undefined);

    const { status, body } = await sendRequest('POST', '/', {
      body: { regularExpression: 'test' },
    });

    expect(status).toBe(201);
    expect(body.reject).toBe(false);
  });
});

describe('PUT /api/guard-rails/:id', () => {
  it('updates and returns the guard rail', async () => {
    const updated = { _id: VALID_ID, regularExpression: 'new-pattern', reject: false };
    mockFindByIdAndUpdate.mockResolvedValue(updated);

    const { status, body } = await sendRequest('PUT', `/${VALID_ID}`, {
      body: { regularExpression: 'new-pattern' },
    });

    expect(status).toBe(200);
    expect(body).toEqual(updated);
  });

  it('returns 404 when guard rail does not exist', async () => {
    mockFindByIdAndUpdate.mockResolvedValue(null);

    const { status, body } = await sendRequest('PUT', `/${VALID_ID}`, {
      body: { regularExpression: 'x' },
    });

    expect(status).toBe(404);
    expect(body.error).toContain('not found');
  });

  it('returns 400 when the id param is not a valid ObjectId', async () => {
    const { status, body } = await sendRequest('PUT', '/not-valid', {
      body: { regularExpression: 'x' },
    });

    expect(status).toBe(400);
    expect(body.error).toContain('id');
  });
});

describe('DELETE /api/guard-rails/:id', () => {
  it('returns 204 on success', async () => {
    mockFindByIdAndDelete.mockResolvedValue({ _id: VALID_ID });

    const { status } = await sendRequest('DELETE', `/${VALID_ID}`);

    expect(status).toBe(204);
  });

  it('returns 404 when guard rail does not exist', async () => {
    mockFindByIdAndDelete.mockResolvedValue(null);

    const { status, body } = await sendRequest('DELETE', `/${VALID_ID}`);

    expect(status).toBe(404);
    expect(body.error).toContain('not found');
  });
});
