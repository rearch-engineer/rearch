import { Elysia } from 'elysia';
import { z } from 'zod';
import SuggestedPrompt from '../models/SuggestedPrompt.js';
import SuggestedPromptCategory from '../models/SuggestedPromptCategory.js';
import SubResource from '../models/SubResource.js';
import { authPlugin } from '../middleware/auth.js';
import requireRole from '../middleware/requireRole.js';
import { uploadFile, deleteFile } from '../utils/gridfs.js';

const OBJECT_ID_RE = /^[a-fA-F0-9]{24}$/;

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const createCategorySchema = z.object({
  name: z.string().min(1, 'Name is required.').max(100),
  slug: z.string().min(1, 'Slug is required.').max(100).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens.'),
  description: z.string().max(500).optional().default(''),
  order: z.number().int().optional().default(0),
});

const updateCategorySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens.').optional(),
  description: z.string().max(500).optional(),
  order: z.number().int().optional(),
});

const createPromptSchema = z.object({
  title: z.string().min(1, 'Title is required.').max(200),
  prompt: z.string().min(1, 'Prompt is required.').max(5000),
  category: z.string().regex(/^[a-fA-F0-9]{24}$/, 'Invalid category ID.'),
  icon: z.string().max(100).optional().default('SmartToyOutlined'),
  iconColor: z.string().max(20).optional().default('#6b7280'),
  order: z.coerce.number().int().optional().default(0),
});

const updatePromptSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  prompt: z.string().min(1).max(5000).optional(),
  category: z.string().regex(/^[a-fA-F0-9]{24}$/, 'Invalid category ID.').optional(),
  icon: z.string().max(100).optional(),
  iconColor: z.string().max(20).optional(),
  order: z.coerce.number().int().optional(),
});

// ─── Public router (authenticated, any user) ─────────────────────────────────

export const publicRouter = new Elysia({ prefix: '/api/suggested-prompts' })
  .use(authPlugin)

  // List all categories
  .get('/categories', async () => {
    const categories = await SuggestedPromptCategory.find().sort({ order: 1, name: 1 });
    return categories;
  })

  // List all prompts (with populated category)
  .get('/', async () => {
    const prompts = await SuggestedPrompt.find()
      .populate('category')
      .sort({ order: 1, title: 1 });
    return prompts;
  })

  // Get filtered prompts for a specific repo based on its rearch.suggestedPrompts settings
  .get('/for-repo/:subResourceId', async ({ params, status }) => {
    if (!OBJECT_ID_RE.test(params.subResourceId)) {
      return status(400, { error: 'Invalid subResource ID format.' });
    }

    try {
      const subResource = await SubResource.findById(params.subResourceId);
      if (!subResource) {
        return status(404, { error: 'SubResource not found.' });
      }

      const config = subResource.rearch?.suggestedPrompts || { mode: 'all' };
      let query = {};

      if (config.mode === 'selected' && config.selectedIds?.length > 0) {
        query._id = { $in: config.selectedIds };
      } else if (config.mode === 'categories' && config.selectedCategories?.length > 0) {
        query.category = { $in: config.selectedCategories };
      }
      // mode === 'all' -> no filter, return everything

      const prompts = await SuggestedPrompt.find(query)
        .populate('category')
        .sort({ order: 1, title: 1 });

      return prompts;
    } catch (err) {
      return status(500, { error: err.message });
    }
  });

// ─── Admin router ─────────────────────────────────────────────────────────────

export const adminRouter = new Elysia({ prefix: '/api/suggested-prompts' })
  .use(authPlugin)
  .use(requireRole('admin'))

  // ─── Category CRUD ────────────────────────────────────────────────────────

  .post('/categories', async ({ body, status }) => {
    try {
      const parsed = createCategorySchema.safeParse(body);
      if (!parsed.success) {
        return status(400, { error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
      }

      const category = new SuggestedPromptCategory(parsed.data);
      await category.save();
      return new Response(JSON.stringify(category), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err) {
      if (err.code === 11000) {
        return status(400, { error: 'A category with this slug already exists.' });
      }
      return status(400, { error: err.message });
    }
  })

  .put('/categories/:id', async ({ params, body, status }) => {
    if (!OBJECT_ID_RE.test(params.id)) {
      return status(400, { error: 'Invalid ID format.' });
    }

    try {
      const parsed = updateCategorySchema.safeParse(body);
      if (!parsed.success) {
        return status(400, { error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
      }

      const updated = await SuggestedPromptCategory.findByIdAndUpdate(
        params.id,
        parsed.data,
        { new: true, runValidators: true },
      );
      if (!updated) {
        return status(404, { error: 'Category not found.' });
      }
      return updated;
    } catch (err) {
      if (err.code === 11000) {
        return status(400, { error: 'A category with this slug already exists.' });
      }
      return status(400, { error: err.message });
    }
  })

  .delete('/categories/:id', async ({ params, status, set }) => {
    if (!OBJECT_ID_RE.test(params.id)) {
      return status(400, { error: 'Invalid ID format.' });
    }

    try {
      // Check if there are prompts using this category
      const promptCount = await SuggestedPrompt.countDocuments({ category: params.id });
      if (promptCount > 0) {
        return status(400, { error: `Cannot delete category: ${promptCount} prompt(s) still use it. Move or delete them first.` });
      }

      const deleted = await SuggestedPromptCategory.findByIdAndDelete(params.id);
      if (!deleted) {
        return status(404, { error: 'Category not found.' });
      }
      set.status = 204;
      return '';
    } catch (err) {
      return status(500, { error: err.message });
    }
  })

  // ─── Prompt CRUD ──────────────────────────────────────────────────────────

  .post('/', async ({ body, status }) => {
    try {
      // Elysia parses multipart form data into a plain object:
      // text fields → strings, file fields → File/Blob objects
      const promptData = {
        title: body.title,
        prompt: body.prompt,
        category: body.category,
        icon: body.icon || 'SmartToyOutlined',
        iconColor: body.iconColor || '#6b7280',
        order: body.order ? Number(body.order) : 0,
      };
      const imageFile = body.image;

      const parsed = createPromptSchema.safeParse(promptData);
      if (!parsed.success) {
        console.error('Suggested prompt validation failed:', JSON.stringify(parsed.error.flatten(), null, 2), 'Input:', promptData);
        return status(400, { error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
      }

      // Verify category exists
      const category = await SuggestedPromptCategory.findById(parsed.data.category);
      if (!category) {
        return status(400, { error: 'Category not found.' });
      }

      let imageFileId = null;
      if (imageFile && typeof imageFile === 'object' && imageFile.size > 0) {
        const buffer = Buffer.from(await imageFile.arrayBuffer());
        imageFileId = await uploadFile(
          buffer,
          imageFile.name || 'prompt-image',
          imageFile.type || 'image/png',
          'attachments',
          { public: true },
        );
      }

      const prompt = new SuggestedPrompt({
        ...parsed.data,
        imageFileId,
      });
      await prompt.save();

      const populated = await SuggestedPrompt.findById(prompt._id).populate('category');
      return new Response(JSON.stringify(populated), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err) {
      return status(400, { error: err.message });
    }
  })

  .put('/:id', async ({ params, body, status }) => {
    if (!OBJECT_ID_RE.test(params.id)) {
      return status(400, { error: 'Invalid ID format.' });
    }

    try {
      const existing = await SuggestedPrompt.findById(params.id);
      if (!existing) {
        return status(404, { error: 'Prompt not found.' });
      }

      // Elysia parses multipart form data into a plain object
      const promptData = {};
      if (body.title !== undefined) promptData.title = body.title;
      if (body.prompt !== undefined) promptData.prompt = body.prompt;
      if (body.category !== undefined) promptData.category = body.category;
      if (body.icon !== undefined) promptData.icon = body.icon;
      if (body.iconColor !== undefined) promptData.iconColor = body.iconColor;
      if (body.order !== undefined) promptData.order = Number(body.order);
      const imageFile = body.image;
      const removeImage = body.removeImage === 'true' || body.removeImage === true;

      const parsed = updatePromptSchema.safeParse(promptData);
      if (!parsed.success) {
        return status(400, { error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
      }

      // If category is being changed, verify it exists
      if (parsed.data.category) {
        const category = await SuggestedPromptCategory.findById(parsed.data.category);
        if (!category) {
          return status(400, { error: 'Category not found.' });
        }
      }

      // Handle image upload/removal
      if (imageFile && typeof imageFile === 'object' && imageFile.size > 0) {
        // Delete old image if exists
        if (existing.imageFileId) {
          try {
            await deleteFile(existing.imageFileId, 'attachments');
          } catch (e) {
            // Ignore if old file doesn't exist
          }
        }
        const buffer = Buffer.from(await imageFile.arrayBuffer());
        parsed.data.imageFileId = await uploadFile(
          buffer,
          imageFile.name || 'prompt-image',
          imageFile.type || 'image/png',
          'attachments',
          { public: true },
        );
      } else if (removeImage && existing.imageFileId) {
        try {
          await deleteFile(existing.imageFileId, 'attachments');
        } catch (e) {
          // Ignore
        }
        parsed.data.imageFileId = null;
      }

      const updated = await SuggestedPrompt.findByIdAndUpdate(
        params.id,
        parsed.data,
        { new: true, runValidators: true },
      ).populate('category');

      return updated;
    } catch (err) {
      return status(400, { error: err.message });
    }
  })

  .delete('/:id', async ({ params, status, set }) => {
    if (!OBJECT_ID_RE.test(params.id)) {
      return status(400, { error: 'Invalid ID format.' });
    }

    try {
      const prompt = await SuggestedPrompt.findById(params.id);
      if (!prompt) {
        return status(404, { error: 'Prompt not found.' });
      }

      // Delete associated image from GridFS
      if (prompt.imageFileId) {
        try {
          await deleteFile(prompt.imageFileId, 'attachments');
        } catch (e) {
          // Ignore if file doesn't exist
        }
      }

      await SuggestedPrompt.findByIdAndDelete(params.id);
      set.status = 204;
      return '';
    } catch (err) {
      return status(500, { error: err.message });
    }
  });
