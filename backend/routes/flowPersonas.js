import { Elysia } from 'elysia';
import { z } from 'zod';
import flowPersonas from '../models/FlowPersona.js';
import { authPlugin } from '../middleware/auth.js';
import requireRole from '../middleware/requireRole.js';
import { audit } from '../logger.js';

const OBJECT_ID_RE = /^[a-fA-F0-9]{24}$/;

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const createFlowPersonaSchema = z.object({
  title: z.string().min(1, "Title is required."),
  slug: z
    .string()
    .min(1, "Slug is required.")
    .regex(
      /^[a-z0-9_-]+$/,
      "Slug must be URL-safe (lowercase letters, numbers, hyphens, underscores).",
    )
    .refine((val) => val !== "description", {
      message: 'Slug cannot be "description".',
    }),
  prompt: z.string().optional().default(''),
  systemPrompt: z.string().optional().default(''),
  code: z.boolean().optional().default(false),
  active: z.boolean().optional().default(true),
});

const updateFlowPersonaSchema = z.object({
  title: z.string().min(1).optional(),
  slug: z
    .string()
    .min(1)
    .regex(
      /^[a-z0-9_-]+$/,
      "Slug must be URL-safe (lowercase letters, numbers, hyphens, underscores).",
    )
    .refine((val) => val !== "description", {
      message: 'Slug cannot be "description".',
    })
    .optional(),
  prompt: z.string().optional(),
  systemPrompt: z.string().optional(),
  code: z.boolean().optional(),
  active: z.boolean().optional(),
});

const router = new Elysia({ prefix: '/api/flow-personas' })
  .use(authPlugin)
  .use(requireRole('admin'))

  .get('/', async () => {
    try {
      const personas = await flowPersonas.find();
      return personas;
    } catch (err) {
      throw new Error(err.message);
    }
  })

  .post('/', async ({ body, status }) => {
    try {
      const parsed = createFlowPersonaSchema.safeParse(body);
      if (!parsed.success) {
        return status(400, { error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
      }
      const { title, slug, prompt, systemPrompt, code, active } = parsed.data;
      const newPersona = new flowPersonas({
        title,
        slug,
        prompt,
        systemPrompt,
        code,
        active,
      });
      await newPersona.save();

      audit.info({ event: 'admin.persona.created', personaId: newPersona._id.toString(), title, slug }, `persona created: ${title}`);

      return new Response(JSON.stringify(newPersona), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err) {
      return status(400, { error: err.message });
    }
  })

  .put('/:id', async ({ params, body, status }) => {
    try {
      if (!OBJECT_ID_RE.test(params.id)) {
        return status(400, { error: 'Invalid id format. Expected a 24-character hex string.' });
      }
      const parsed = updateFlowPersonaSchema.safeParse(body);
      if (!parsed.success) {
        return status(400, { error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
      }
      const { title, slug, prompt, systemPrompt, code, active } = parsed.data;
      const updatedPersona = await flowPersonas.findByIdAndUpdate(
        params.id,
        { title, slug, prompt, systemPrompt, code, active },
        { new: true, runValidators: true },
      );
      if (!updatedPersona) {
        return status(404, { error: 'Flow persona not found.' });
      }

      audit.info({ event: 'admin.persona.updated', personaId: params.id }, `persona updated: ${params.id}`);

      return updatedPersona;
    } catch (err) {
      return status(400, { error: err.message });
    }
  })

  .delete('/:id', async ({ params, status, set }) => {
    try {
      if (!OBJECT_ID_RE.test(params.id)) {
        return status(400, { error: 'Invalid id format. Expected a 24-character hex string.' });
      }
      const deleted = await flowPersonas.findByIdAndDelete(params.id);
      if (!deleted) {
        return status(404, { error: 'Flow persona not found.' });
      }

      audit.info({ event: 'admin.persona.deleted', personaId: params.id }, `persona deleted: ${params.id}`);

      set.status = 204;
      return '';
    } catch (err) {
      return status(500, { error: err.message });
    }
  });

export default router;
