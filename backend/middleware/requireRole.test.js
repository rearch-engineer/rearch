import { describe, it, expect } from 'bun:test';
import { Elysia } from 'elysia';
import requireRole from './requireRole.js';

function createApp(user, ...roles) {
  return new Elysia()
    .derive(() => ({ user }))
    .use(requireRole(...roles))
    .get('/test', () => ({ ok: true }));
}

describe('requireRole middleware', () => {
  it('calls through when user has the required role', async () => {
    const app = createApp({ roles: ['admin'] }, 'admin');
    const res = await app.handle(new Request('http://localhost/test'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('returns 403 when user lacks the required role', async () => {
    const app = createApp({ roles: ['user'] }, 'admin');
    const res = await app.handle(new Request('http://localhost/test'));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain('admin');
  });

  it('returns 401 when user is not set', async () => {
    const app = createApp(null, 'admin');
    const res = await app.handle(new Request('http://localhost/test'));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain('Authentication required');
  });

  it('allows access when user has any one of multiple allowed roles (OR logic)', async () => {
    const app = createApp({ roles: ['editor'] }, 'admin', 'editor');
    const res = await app.handle(new Request('http://localhost/test'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('returns 403 when user has none of the multiple allowed roles', async () => {
    const app = createApp({ roles: ['viewer'] }, 'admin', 'editor');
    const res = await app.handle(new Request('http://localhost/test'));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain('admin or editor');
  });

  it('handles empty roles array on user gracefully', async () => {
    const app = createApp({ roles: [] }, 'admin');
    const res = await app.handle(new Request('http://localhost/test'));

    expect(res.status).toBe(403);
  });

  it('handles missing roles property on user gracefully', async () => {
    const app = createApp({}, 'admin');
    const res = await app.handle(new Request('http://localhost/test'));

    expect(res.status).toBe(403);
  });
});
