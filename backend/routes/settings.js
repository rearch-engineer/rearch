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

// ─── LLM Provider / Model catalogue ──────────────────────────────────────────
// Only providers and models that OpenCode natively supports.
// The env var names here map 1-to-1 with what OpenCode reads inside containers.
export const LLM_PROVIDERS = {
  anthropic: {
    label: 'Anthropic',
    envKey: 'ANTHROPIC_API_KEY',
    models: [
      { id: 'claude-opus-4-5', label: 'Claude Opus 4.5' },
      { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
      { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
      { id: 'claude-opus-4-20250514', label: 'Claude Opus 4' },
      { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
      { id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
      { id: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
    ],
  },
  openai: {
    label: 'OpenAI',
    envKey: 'OPENAI_API_KEY',
    models: [
      { id: 'gpt-4o', label: 'GPT-4o' },
      { id: 'gpt-4o-mini', label: 'GPT-4o Mini' },
      { id: 'o3', label: 'o3' },
      { id: 'o3-mini', label: 'o3 Mini' },
      { id: 'o4-mini', label: 'o4 Mini' },
    ],
  },
  google: {
    label: 'Google (Gemini)',
    envKey: 'GOOGLE_API_KEY',
    models: [
      { id: 'gemini-2.5-pro-preview-05-06', label: 'Gemini 2.5 Pro Preview' },
      { id: 'gemini-2.5-flash-preview-04-17', label: 'Gemini 2.5 Flash Preview' },
      { id: 'gemini-2.0-flash-001', label: 'Gemini 2.0 Flash' },
      { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
      { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
    ],
  },
  groq: {
    label: 'Groq',
    envKey: 'GROQ_API_KEY',
    models: [
      { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B Versatile' },
      { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant' },
      { id: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B' },
    ],
  },
  xai: {
    label: 'xAI (Grok)',
    envKey: 'XAI_API_KEY',
    models: [
      { id: 'grok-3', label: 'Grok 3' },
      { id: 'grok-3-mini', label: 'Grok 3 Mini' },
      { id: 'grok-2', label: 'Grok 2' },
    ],
  },
};

const validProviderIds = Object.keys(LLM_PROVIDERS);

const llmSettingsSchema = z.object({
  provider: z.enum(validProviderIds, {
    errorMap: () => ({ message: `Provider must be one of: ${validProviderIds.join(', ')}` }),
  }),
  model: z.string().min(1, 'Model is required'),
  // apiKey is optional on update so admins can change provider/model without
  // re-entering an already-stored key. When omitted the existing stored key is kept.
  apiKey: z.string().optional(),
}).superRefine((data, ctx) => {
  const validModelIds = LLM_PROVIDERS[data.provider]?.models.map((m) => m.id) ?? [];
  if (!validModelIds.includes(data.model)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['model'],
      message: `Model must be one of: ${validModelIds.join(', ')}`,
    });
  }
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
  })

  // ─── LLM provider settings ───────────────────────────────────────────────

  /**
   * Get LLM provider catalogue (providers + valid models).
   * GET /api/settings/llm/providers
   */
  .get('/llm/providers', async ({ status }) => {
    try {
      return Object.entries(LLM_PROVIDERS).map(([id, info]) => ({
        id,
        label: info.label,
        models: info.models,
      }));
    } catch (err) {
      console.error('Error fetching LLM providers:', err);
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
   * Get current LLM provider/model setting.
   * API key value is masked (returns only prefix) for display purposes.
   * GET /api/settings/llm
   */
  .get('/llm', async ({ status }) => {
    try {
      const setting = await Setting.findOne({ key: 'llmProvider' });
      if (!setting) {
        return {
          configured: false,
          provider: null,
          model: null,
          apiKeySet: false,
          apiKeyPreview: null,
        };
      }
      const { provider, model, apiKey } = setting.value || {};
      return {
        configured: !!(provider && model && apiKey),
        provider: provider || null,
        model: model || null,
        apiKeySet: !!apiKey,
        // Show first 8 chars of key so admin can recognise which key is configured
        apiKeyPreview: apiKey ? `${apiKey.substring(0, 8)}...` : null,
      };
    } catch (err) {
      console.error('Error fetching LLM settings:', err);
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
   * Update LLM provider/model/API key setting.
   * PUT /api/settings/llm
   * Body: { provider: string, model: string, apiKey?: string }
   * When apiKey is omitted the previously stored key is kept (allows provider/model-only updates).
   */
  .put('/llm', async ({ body, user, status }) => {
    try {
      const parsed = llmSettingsSchema.safeParse(body);
      if (!parsed.success) {
        return status(400, {
          error: parsed.error.errors.map((e) => e.message).join(', '),
        });
      }

      const { provider, model, apiKey: newApiKey } = parsed.data;

      // Load existing setting to preserve the key if a new one was not provided
      const existing = await Setting.findOne({ key: 'llmProvider' });
      const existingApiKey = existing?.value?.apiKey;

      const resolvedApiKey = (newApiKey && newApiKey.trim()) ? newApiKey.trim() : existingApiKey;
      if (!resolvedApiKey) {
        return status(400, { error: 'API key is required when no key has been stored yet' });
      }

      const value = { provider, model, apiKey: resolvedApiKey };

      await Setting.findOneAndUpdate(
        { key: 'llmProvider' },
        { key: 'llmProvider', value },
        { upsert: true, new: true },
      );

      return {
        provider,
        model,
        apiKeySet: true,
        apiKeyPreview: `${resolvedApiKey.substring(0, 8)}...`,
      };
    } catch (err) {
      console.error('Error updating LLM settings:', err);
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
   * Delete / clear LLM provider setting (revert to env var fallback).
   * DELETE /api/settings/llm
   */
  .delete('/llm', async ({ user, status }) => {
    try {
      await Setting.deleteOne({ key: 'llmProvider' });
      return { success: true };
    } catch (err) {
      console.error('Error deleting LLM settings:', err);
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
