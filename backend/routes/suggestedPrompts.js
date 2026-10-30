import { Elysia } from 'elysia';
import SuggestedPrompt from '../models/SuggestedPrompt.js';
import SuggestedPromptCategory from '../models/SuggestedPromptCategory.js';
import Resource from '../models/Resource.js';
import Agent from '../models/Agent.js';
import { ensureAgentForResource } from '../utils/agents.js';
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

  // Get the prompts an agent exposes on its welcome screen
  .get('/for-agent/:agentId', async ({ params, status }) => {
    if (!OBJECT_ID_RE.test(params.agentId)) {
      return status(400, { error: 'Invalid agent ID format.' });
    }

    try {
      const agent = await Agent.findById(params.agentId);
      if (!agent) {
        return status(404, { error: 'Agent not found.' });
      }
      return await promptsForConfig(agent.suggestedPrompts);
    } catch (err) {
      return status(500, { error: err.message });
    }
  })

  // Legacy: prompts for a repository. Resolves the repository's agent and
  // falls back to the old Resource.rearch.suggestedPrompts block.
  .get('/for-repo/:resourceId', async ({ params, status }) => {
    if (!OBJECT_ID_RE.test(params.resourceId)) {
      return status(400, { error: 'Invalid resource ID format.' });
    }

    try {
      const resource = await Resource.findById(params.resourceId);
      if (!resource) {
        return status(404, { error: 'Resource not found.' });
      }

      const agent = await ensureAgentForResource(resource, { createIfMissing: false });
      const config = agent?.suggestedPrompts || resource.rearch?.suggestedPrompts;
      return await promptsForConfig(config);
    } catch (err) {
      return status(500, { error: err.message });
    }
  });

/**
 * Apply an agent's suggestedPrompts config ({ mode, selectedIds, selectedCategories })
 * to the SuggestedPrompt collection.
 */
async function promptsForConfig(config) {
  const cfg = config || { mode: 'all' };
  let query = {};

  if (cfg.mode === 'selected' && cfg.selectedIds?.length > 0) {
    query._id = { $in: cfg.selectedIds };
  } else if (cfg.mode === 'categories' && cfg.selectedCategories?.length > 0) {
    query.category = { $in: cfg.selectedCategories };
  }
  // mode === 'all' -> no filter, return everything

  return SuggestedPrompt.find(query)
    .populate('category')
    .sort({ order: 1, title: 1 });
}
