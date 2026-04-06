import { Elysia } from 'elysia';
import { z } from 'zod';
import Setting from '../models/Setting.js';
import { uploadFile, deleteFile } from '../utils/gridfs.js';
import { authPlugin } from '../middleware/auth.js';
import requireRole from '../middleware/requireRole.js';
import { scheduleDockerRebuilds, triggerRebuildAll } from '../queue';

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const dockerRebuildSchema = z.object({
  enabled: z.boolean().optional(),
  intervalHours: z.number().min(1 / 60).max(720).optional(),
});

const signupSchema = z.object({
  restrictSignups: z.boolean().optional(),
  allowedDomains: z
    .array(
      z
        .string()
        .min(1)
        .regex(
          /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/,
          'Invalid domain format',
        ),
    )
    .optional(),
});

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

// ─── Private router (authenticated) ──────────────────────────────────────────

const router = new Elysia({ prefix: '/api/settings' })
  .use(authPlugin)

  // ─── Read endpoints (any authenticated user) ─────────────────────────────

  /**
   * Get all settings
   * GET /api/settings
   */
  .get('/', async ({ status }) => {
    try {
      const settings = await Setting.find();
      return settings;
    } catch (err) {
      return status(500, { error: err.message });
    }
  })

  // ─── Admin-only endpoints ─────────────────────────────────────────────────

  /**
   * Upload logo image
   * POST /api/settings/logo
   * Body: multipart/form-data with field "logo" (single image)
   */
  .post('/logo', async ({ body, user, status }) => {
    try {
      if (!body.logo) {
        return status(400, { error: 'No image file provided' });
      }

      // Validate file type (images only)
      if (!body.logo.type.startsWith('image/')) {
        return status(400, { error: 'Only image files are allowed' });
      }

      // Validate file size (2MB limit)
      if (body.logo.size > 2 * 1024 * 1024) {
        return status(400, { error: 'File size exceeds 2MB limit' });
      }

      // Delete old logo from GridFS if one exists
      const existing = await Setting.findOne({ key: 'logo' });
      if (existing && existing.value && existing.value.fileId) {
        try {
          await deleteFile(existing.value.fileId);
        } catch (e) {
          // Old file may already be gone; ignore
        }
      }

      // Convert Web API File to buffer
      const buffer = Buffer.from(await body.logo.arrayBuffer());

      // Upload new logo to GridFS (flagged as public so it can be served without auth)
      const fileId = await uploadFile(
        buffer,
        body.logo.name,
        body.logo.type,
        'attachments',
        { public: true },
      );

      const value = {
        fileId: fileId.toString(),
        filename: body.logo.name,
        contentType: body.logo.type,
        size: body.logo.size,
      };

      // Upsert the logo setting
      const setting = await Setting.findOneAndUpdate(
        { key: 'logo' },
        { key: 'logo', value },
        { upsert: true, new: true },
      );

      return setting;
    } catch (err) {
      console.error('Error uploading logo:', err);
      return status(500, { error: err.message });
    }
  }, {
    beforeHandle: ({ user, status }) => {
      if (!user?.roles?.includes('admin')) {
        return status(403, { error: 'Insufficient permissions. Required role: admin' });
      }
    },
  })

  /**
   * Set logo to a named MUI icon (no file upload needed)
   * PUT /api/settings/logo/icon
   * Body: { iconName: string }
   */
  .put('/logo/icon', async ({ body, user, status }) => {
    try {
      const iconName = body?.iconName;
      if (!iconName || typeof iconName !== 'string' || !/^[A-Za-z0-9]+$/.test(iconName)) {
        return status(400, { error: 'Invalid icon name' });
      }

      // Delete old uploaded logo file from GridFS if one exists
      const existing = await Setting.findOne({ key: 'logo' });
      if (existing?.value?.fileId) {
        try {
          await deleteFile(existing.value.fileId);
        } catch (e) {
          // Old file may already be gone; ignore
        }
      }

      const value = { iconName };

      const setting = await Setting.findOneAndUpdate(
        { key: 'logo' },
        { key: 'logo', value },
        { upsert: true, new: true },
      );

      return setting;
    } catch (err) {
      console.error('Error setting icon logo:', err);
      return status(500, { error: err.message });
    }
  }, {
    beforeHandle: ({ user, status }) => {
      if (!user?.roles?.includes('admin')) {
        return status(403, { error: 'Insufficient permissions. Required role: admin' });
      }
    },
  })

  /**
   * Delete logo
   * DELETE /api/settings/logo
   */
  .delete('/logo', async ({ user, status }) => {
    try {
      const existing = await Setting.findOne({ key: 'logo' });
      if (!existing) {
        return status(404, { error: 'No logo setting found' });
      }

      // Delete file from GridFS
      if (existing.value && existing.value.fileId) {
        try {
          await deleteFile(existing.value.fileId);
        } catch (e) {
          // File may already be gone; ignore
        }
      }

      await Setting.deleteOne({ key: 'logo' });
      return { success: true };
    } catch (err) {
      console.error('Error deleting logo:', err);
      return status(500, { error: err.message });
    }
  }, {
    beforeHandle: ({ user, status }) => {
      if (!user?.roles?.includes('admin')) {
        return status(403, { error: 'Insufficient permissions. Required role: admin' });
      }
    },
  })

  // ─── Signup restriction settings ────────────────────────────────────────

  /**
   * Update signup restriction settings
   * PUT /api/settings/signup
   */
  .put('/signup', async ({ body, user, status }) => {
    try {
      const parsed = signupSchema.safeParse(body);
      if (!parsed.success) {
        return status(400, {
          error: parsed.error.errors.map((e) => e.message).join(', '),
        });
      }

      const { restrictSignups, allowedDomains } = parsed.data;

      // Get current value or defaults
      const existing = await Setting.findOne({ key: 'signup' });
      const current = existing?.value || { restrictSignups: false, allowedDomains: [] };

      const value = {
        restrictSignups: restrictSignups !== undefined ? restrictSignups : current.restrictSignups,
        allowedDomains: allowedDomains !== undefined
          ? allowedDomains.map((d) => d.toLowerCase().trim()).filter(Boolean)
          : current.allowedDomains,
      };

      const setting = await Setting.findOneAndUpdate(
        { key: 'signup' },
        { key: 'signup', value },
        { upsert: true, new: true },
      );

      return setting;
    } catch (err) {
      console.error('Error updating signup settings:', err);
      return status(500, { error: err.message });
    }
  }, {
    beforeHandle: ({ user, status }) => {
      if (!user?.roles?.includes('admin')) {
        return status(403, { error: 'Insufficient permissions. Required role: admin' });
      }
    },
  })

  // ─── Docker rebuild schedule settings ───────────────────────────────────

  /**
   * Get docker rebuild schedule settings
   * GET /api/settings/docker-rebuild
   */
  .get('/docker-rebuild', async ({ status }) => {
    try {
      const setting = await Setting.findOne({ key: 'dockerRebuild' });
      const value = setting?.value || { enabled: false, intervalHours: 24 };
      return {
        enabled: value.enabled || false,
        intervalHours: value.intervalHours || 24,
        lastTriggeredAt: value.lastTriggeredAt || null,
      };
    } catch (err) {
      console.error('Error fetching docker rebuild settings:', err);
      return status(500, { error: err.message });
    }
  }, {
    beforeHandle: ({ user, status }) => {
      if (!user?.roles?.includes('admin')) {
        return status(403, { error: 'Insufficient permissions. Required role: admin' });
      }
    },
  })

  /**
   * Update docker rebuild schedule settings
   * PUT /api/settings/docker-rebuild
   * Body: { enabled?: boolean, intervalHours?: number }
   */
  .put('/docker-rebuild', async ({ body, user, status }) => {
    try {
      const parsed = dockerRebuildSchema.safeParse(body);
      if (!parsed.success) {
        return status(400, {
          error: parsed.error.errors.map((e) => e.message).join(', '),
        });
      }

      const { enabled, intervalHours } = parsed.data;

      // Get current value or defaults
      const existing = await Setting.findOne({ key: 'dockerRebuild' });
      const current = existing?.value || { enabled: false, intervalHours: 24 };

      const value = {
        enabled: enabled !== undefined ? enabled : current.enabled,
        intervalHours: intervalHours !== undefined ? intervalHours : current.intervalHours,
        lastTriggeredAt: current.lastTriggeredAt || null,
      };

      const setting = await Setting.findOneAndUpdate(
        { key: 'dockerRebuild' },
        { key: 'dockerRebuild', value },
        { upsert: true, new: true },
      );

      // Update the BullMQ repeatable job schedule
      await scheduleDockerRebuilds(value);

      return setting;
    } catch (err) {
      console.error('Error updating docker rebuild settings:', err);
      return status(500, { error: err.message });
    }
  }, {
    beforeHandle: ({ user, status }) => {
      if (!user?.roles?.includes('admin')) {
        return status(403, { error: 'Insufficient permissions. Required role: admin' });
      }
    },
  })

  /**
   * Trigger rebuild of all docker images now
   * POST /api/settings/docker-rebuild/trigger
   */
  .post('/docker-rebuild/trigger', async ({ user, status }) => {
    try {
      const jobs = await triggerRebuildAll();

      // Update lastTriggeredAt
      const existing = await Setting.findOne({ key: 'dockerRebuild' });
      const current = existing?.value || { enabled: false, intervalHours: 24 };
      await Setting.findOneAndUpdate(
        { key: 'dockerRebuild' },
        { key: 'dockerRebuild', value: { ...current, lastTriggeredAt: new Date().toISOString() } },
        { upsert: true, new: true },
      );

      return {
        success: true,
        jobCount: jobs.length,
        jobs: jobs.map((j) => ({ id: j.id, name: j.name })),
      };
    } catch (err) {
      console.error('Error triggering docker rebuild:', err);
      return status(500, { error: err.message });
    }
  }, {
    beforeHandle: ({ user, status }) => {
      if (!user?.roles?.includes('admin')) {
        return status(403, { error: 'Insufficient permissions. Required role: admin' });
      }
    },
  });

export default router;
