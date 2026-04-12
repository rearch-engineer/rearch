import { Elysia } from 'elysia';
import Setting from '../models/Setting.js';

// ─── Public router — mounted separately in server.js without authMiddleware ──

export const publicRouter = new Elysia({ prefix: '/api/settings' })

  /**
   * Get signup restriction settings (public, no auth required)
   * GET /api/settings/signup/public
   */
  .get('/signup/public', async ({ status }) => {
    try {
      const setting = await Setting.findOne({ key: 'signup' });
      const value = setting?.value || { restrictSignups: false, allowedDomains: [] };
      return {
        restrictSignups: value.restrictSignups || false,
        allowedDomains: value.allowedDomains || [],
      };
    } catch (err) {
      console.error('Error fetching signup settings:', err);
      return status(500, { error: err.message });
    }
  });
