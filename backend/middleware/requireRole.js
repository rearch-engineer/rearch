import { Elysia } from 'elysia';
import { security } from '../logger.js';

/**
 * Elysia plugin factory for role-based access control.
 * Usage: .use(requireRole('admin')) or .use(requireRole('admin', 'editor'))
 *
 * Must be used AFTER authPlugin (expects `user` to be in context).
 */
export default function requireRole(...requiredRoles) {
  return new Elysia({ name: `requireRole-${requiredRoles.join('-')}` })
    .onBeforeHandle({ as: 'scoped' }, ({ user, set }) => {
      if (!user) {
        set.status = 401;
        return { error: 'Authentication required.' };
      }

      const userRoles = user.roles || [];
      const hasRole = requiredRoles.some(role => userRoles.includes(role));

      if (!hasRole) {
        security.warn({
          event: 'authz.role.denied',
          userId: user.userId,
          email: user.email,
          userRoles,
          requiredRoles,
        }, `access denied — requires ${requiredRoles.join(' or ')}`);
        set.status = 403;
        return {
          error: 'Insufficient permissions. Required role: ' + requiredRoles.join(' or '),
        };
      }
    });
}
