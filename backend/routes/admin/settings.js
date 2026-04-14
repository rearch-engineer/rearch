import { Elysia } from 'elysia';
import { z } from 'zod';
import Setting from '../../models/Setting.js';
import { scheduleDockerRebuilds, triggerRebuildAll, scheduleContainerCleanup, triggerContainerCleanup } from '../../queue';

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const dockerRebuildSchema = z.object({
  enabled: z.boolean().optional(),
  intervalHours: z.number().min(1 / 60).max(720).optional(),
});

const containerCleanupSchema = z.object({
  enabled: z.boolean().optional(),
  idleStopMinutes: z.number().min(1).max(1440).optional(),
  idleRemoveMinutes: z.number().min(1).max(10080).optional(), // up to 7 days
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

// ─── Router ───────────────────────────────────────────────────────────────────

const router = new Elysia({ prefix: '/settings' })

  /**
   * Get all settings
   * GET /api/admin/settings
   */
  .get('/', async ({ status }) => {
    try {
      const settings = await Setting.find();
      return settings;
    } catch (err) {
      return status(500, { error: err.message });
    }
  })

  // ─── Signup restriction settings ────────────────────────────────────────

  /**
   * Update signup restriction settings
   * PUT /api/admin/settings/signup
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
  })

  // ─── Docker rebuild schedule settings ───────────────────────────────────

  /**
   * Get docker rebuild schedule settings
   * GET /api/admin/settings/docker-rebuild
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
  })

  /**
   * Update docker rebuild schedule settings
   * PUT /api/admin/settings/docker-rebuild
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
  })

  /**
   * Trigger rebuild of all docker images now
   * POST /api/admin/settings/docker-rebuild/trigger
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
  })

  // ─── Container cleanup settings ─────────────────────────────────────────

  /**
   * Get container cleanup settings
   * GET /api/admin/settings/container-cleanup
   */
  .get('/container-cleanup', async ({ status }) => {
    try {
      const setting = await Setting.findOne({ key: 'containerCleanup' });
      const value = setting?.value || { enabled: false, idleStopMinutes: 30, idleRemoveMinutes: 1440 };
      return {
        enabled: value.enabled || false,
        idleStopMinutes: value.idleStopMinutes || 30,
        idleRemoveMinutes: value.idleRemoveMinutes || 1440,
        lastTriggeredAt: value.lastTriggeredAt || null,
      };
    } catch (err) {
      console.error('Error fetching container cleanup settings:', err);
      return status(500, { error: err.message });
    }
  })

  /**
   * Update container cleanup settings
   * PUT /api/admin/settings/container-cleanup
   */
  .put('/container-cleanup', async ({ body, user, status }) => {
    try {
      const parsed = containerCleanupSchema.safeParse(body);
      if (!parsed.success) {
        return status(400, {
          error: parsed.error.errors.map((e) => e.message).join(', '),
        });
      }

      const { enabled, idleStopMinutes, idleRemoveMinutes } = parsed.data;

      // Get current value or defaults
      const existing = await Setting.findOne({ key: 'containerCleanup' });
      const current = existing?.value || { enabled: false, idleStopMinutes: 30, idleRemoveMinutes: 1440 };

      const value = {
        enabled: enabled !== undefined ? enabled : current.enabled,
        idleStopMinutes: idleStopMinutes !== undefined ? idleStopMinutes : current.idleStopMinutes,
        idleRemoveMinutes: idleRemoveMinutes !== undefined ? idleRemoveMinutes : current.idleRemoveMinutes,
        lastTriggeredAt: current.lastTriggeredAt || null,
      };

      const setting = await Setting.findOneAndUpdate(
        { key: 'containerCleanup' },
        { key: 'containerCleanup', value },
        { upsert: true, new: true },
      );

      // Update the BullMQ repeatable job schedule
      await scheduleContainerCleanup(value);

      return setting;
    } catch (err) {
      console.error('Error updating container cleanup settings:', err);
      return status(500, { error: err.message });
    }
  })

  /**
   * Trigger container cleanup now
   * POST /api/admin/settings/container-cleanup/trigger
   */
  .post('/container-cleanup/trigger', async ({ user, status }) => {
    try {
      const result = await triggerContainerCleanup();

      // Update lastTriggeredAt
      const existing = await Setting.findOne({ key: 'containerCleanup' });
      const current = existing?.value || { enabled: false, idleStopMinutes: 30, idleRemoveMinutes: 1440 };
      await Setting.findOneAndUpdate(
        { key: 'containerCleanup' },
        { key: 'containerCleanup', value: { ...current, lastTriggeredAt: new Date().toISOString() } },
        { upsert: true, new: true },
      );

      return {
        success: true,
        stoppedCount: result.stoppedCount,
        stoppedConversations: result.stoppedConversations,
        removedCount: result.removedCount,
        removedConversations: result.removedConversations,
      };
    } catch (err) {
      console.error('Error triggering container cleanup:', err);
      return status(500, { error: err.message });
    }
  });

export default router;
