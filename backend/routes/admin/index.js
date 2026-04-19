import { Elysia } from 'elysia';
import { authPlugin } from '../../middleware/auth.js';
import requireRole from '../../middleware/requireRole.js';

import settingsRoutes from './settings.js';
import llmProviderRoutes from './llmProviders.js';
import userRoutes from './users.js';
import skillRoutes from './skills.js';
import jobRoutes from './jobs.js';
import usageRoutes from './usage.js';
import mcpRoutes from './mcp.js';
import suggestedPromptsRoutes from './suggestedPrompts.js';
import resourceRoutes from './resources.js';
import workspaceRoutes from './workspaces.js';

const adminRouter = new Elysia({ prefix: '/api/admin' })
  .use(authPlugin)
  .use(requireRole('admin'))
  .use(settingsRoutes)
  .use(llmProviderRoutes)
  .use(userRoutes)
  .use(skillRoutes)
  .use(jobRoutes)
  .use(usageRoutes)
  .use(mcpRoutes)
  .use(suggestedPromptsRoutes)
  .use(resourceRoutes)
  .use(workspaceRoutes);

export default adminRouter;
