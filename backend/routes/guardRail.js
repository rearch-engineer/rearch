import { Elysia } from 'elysia';
import { z } from 'zod';
import guardRail from '../models/GuardRail.js';
import { authPlugin } from '../middleware/auth.js';
import requireRole from '../middleware/requireRole.js';

const OBJECT_ID_RE = /^[a-fA-F0-9]{24}$/;

const createGuardRailSchema = z.object({
  regularExpression: z.string().min(1, "regularExpression is required."),
  reject: z.boolean().optional().default(false),
  replaceWith: z.string().optional(),
});

const updateGuardRailSchema = z.object({
  regularExpression: z.string().min(1).optional(),
  reject: z.boolean().optional(),
  replaceWith: z.string().optional(),
});

const router = new Elysia({ prefix: '/api/guard-rails' })
  .use(authPlugin)
  .use(requireRole('admin'))

  .get('/', async ({ set }) => {
    try {
      const guardRails = await guardRail.find();
      return guardRails;
    } catch (err) {
      set.status = 500;
      return { error: err.message };
    }
  })

  .post('/', async ({ body, set }) => {
    try {
      const parsed = createGuardRailSchema.safeParse(body);
      if (!parsed.success) {
        set.status = 400;
        return { error: 'Validation failed', details: parsed.error.flatten().fieldErrors };
      }
      const { regularExpression, reject, replaceWith } = parsed.data;
      const newGuardRail = new guardRail({ regularExpression, reject, replaceWith });
      await newGuardRail.save();
      set.status = 201;
      return newGuardRail;
    } catch (err) {
      set.status = 400;
      return { error: err.message };
    }
  })

  .put('/:id', async ({ params, body, set }) => {
    try {
      if (!OBJECT_ID_RE.test(params.id)) {
        set.status = 400;
        return { error: 'Invalid id format. Expected a 24-character hex string.' };
      }
      const parsed = updateGuardRailSchema.safeParse(body);
      if (!parsed.success) {
        set.status = 400;
        return { error: 'Validation failed', details: parsed.error.flatten().fieldErrors };
      }
      const { regularExpression, reject, replaceWith } = parsed.data;
      const updated = await guardRail.findByIdAndUpdate(
        params.id,
        { regularExpression, reject, replaceWith },
        { new: true, runValidators: true },
      );
      if (!updated) {
        set.status = 404;
        return { error: 'Guard rail not found.' };
      }
      return updated;
    } catch (err) {
      set.status = 400;
      return { error: err.message };
    }
  })

  .delete('/:id', async ({ params, set }) => {
    try {
      if (!OBJECT_ID_RE.test(params.id)) {
        set.status = 400;
        return { error: 'Invalid id format. Expected a 24-character hex string.' };
      }
      const deleted = await guardRail.findByIdAndDelete(params.id);
      if (!deleted) {
        set.status = 404;
        return { error: 'Guard rail not found.' };
      }
      set.status = 204;
      return '';
    } catch (err) {
      set.status = 500;
      return { error: err.message };
    }
  });

export default router;
