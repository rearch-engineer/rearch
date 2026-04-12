import { Elysia } from 'elysia';
import SuggestedPrompt from '../models/SuggestedPrompt.js';
import SuggestedPromptCategory from '../models/SuggestedPromptCategory.js';
import SubResource from '../models/SubResource.js';
import { authPlugin } from '../middleware/auth.js';

const OBJECT_ID_RE = /^[a-fA-F0-9]{24}$/;

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
