import { Elysia } from 'elysia';
import { z } from 'zod';
import Skill from '../models/Skill.js';
import { authPlugin } from '../middleware/auth.js';
import requireRole from '../middleware/requireRole.js';
import { audit } from '../logger.js';

const OBJECT_ID_RE = /^[a-fA-F0-9]{24}$/;

const createSkillSchema = z.object({
  title: z.string().min(1, "Title is required."),
  description: z.string().min(1, "Description is required."),
  skillsRepository: z.string().min(1, "Skills Repository is required."),
  isDefault: z.boolean().optional().default(false),
});

const updateSkillSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  skillsRepository: z.string().min(1).optional(),
  isDefault: z.boolean().optional(),
});

const router = new Elysia({ prefix: '/api/skills' })
  .use(authPlugin)
  .use(requireRole('admin'))

  // List all skills
  .get('/', async () => {
    try {
      const skillsList = await Skill.find();
      return skillsList;
    } catch (error) {
      throw new Error(error.message);
    }
  })

  // Get a single skill by ID
  .get('/:id', async ({ params, status }) => {
    try {
      if (!OBJECT_ID_RE.test(params.id)) {
        return status(400, { error: 'Invalid id format. Expected a 24-character hex string.' });
      }
      const skill = await Skill.findById(params.id);
      if (!skill) {
        return status(404, { error: 'Skill not found.' });
      }
      return skill;
    } catch (error) {
      throw new Error(error.message);
    }
  })

  // Create a new skill
  .post('/', async ({ body, status }) => {
    try {
      const parsed = createSkillSchema.safeParse(body);
      if (!parsed.success) {
        return status(400, { error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
      }
      const { title, description, skillsRepository, isDefault } = parsed.data;
      const newSkill = new Skill({ title, description, skillsRepository, isDefault });
      await newSkill.save();

      audit.info({ event: 'admin.skill.created', skillId: newSkill._id.toString(), title }, `skill created: ${title}`);

      return new Response(JSON.stringify(newSkill), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err) {
      return status(400, { error: err.message });
    }
  })

  // Update a skill
  .put('/:id', async ({ params, body, status }) => {
    try {
      if (!OBJECT_ID_RE.test(params.id)) {
        return status(400, { error: 'Invalid id format. Expected a 24-character hex string.' });
      }
      const parsed = updateSkillSchema.safeParse(body);
      if (!parsed.success) {
        return status(400, { error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
      }
      const { title, description, skillsRepository, isDefault } = parsed.data;
      const updatedSkill = await Skill.findByIdAndUpdate(
        params.id,
        { title, description, skillsRepository, isDefault },
        { new: true, runValidators: true },
      );
      if (!updatedSkill) {
        return status(404, { error: 'Skill not found.' });
      }

      audit.info({ event: 'admin.skill.updated', skillId: params.id }, `skill updated: ${params.id}`);

      return updatedSkill;
    } catch (err) {
      return status(400, { error: err.message });
    }
  })

  // Delete a skill
  .delete('/:id', async ({ params, status, set }) => {
    try {
      if (!OBJECT_ID_RE.test(params.id)) {
        return status(400, { error: 'Invalid id format. Expected a 24-character hex string.' });
      }
      const deleted = await Skill.findByIdAndDelete(params.id);
      if (!deleted) {
        return status(404, { error: 'Skill not found.' });
      }

      audit.info({ event: 'admin.skill.deleted', skillId: params.id }, `skill deleted: ${params.id}`);

      set.status = 204;
      return '';
    } catch (err) {
      return status(500, { error: err.message });
    }
  });

export default router;
