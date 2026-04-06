import { Elysia } from 'elysia';
import { authPlugin } from '../middleware/auth.js';
import { toolsMetadata } from '../tools/index.js';

const router = new Elysia({ prefix: '/api/tools' })
  .use(authPlugin)
  .get('/', () => toolsMetadata);

export default router;
