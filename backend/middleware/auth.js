import { Elysia } from 'elysia';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import {
  verifyKeycloakToken,
  isKeycloakToken,
  extractKeycloakRoles,
  extractKeycloakUserInfo,
} from '../utils/keycloak.js';

const AUTH_MODE = () => (process.env.AUTH_MODE || 'LOCAL').toUpperCase();

/**
 * Handle Keycloak-issued access tokens.
 * Verifies via JWKS, syncs user to MongoDB, returns user info.
 */
async function handleKeycloakToken(token) {
  let payload;
  try {
    payload = await verifyKeycloakToken(token);
  } catch (err) {
    if (err.code === 'ERR_JWT_EXPIRED') {
      throw { status: 401, message: 'Token expired. Please log in again.' };
    }
    console.error('Keycloak token verification failed:', err.message);
    throw { status: 401, message: 'Invalid token.' };
  }

  const userInfo = extractKeycloakUserInfo(payload);
  const keycloakRoles = extractKeycloakRoles(payload);

  // Ensure the user has at least the 'user' role
  if (!keycloakRoles.includes('user')) {
    keycloakRoles.push('user');
  }

  // Sync user to MongoDB (find or create)
  let user = await User.findOne({ 'oauth.provider': 'keycloak', 'oauth.subject': userInfo.sub });

  if (!user) {
    // Try by email
    user = await User.findOne({ 'account.email': userInfo.email?.toLowerCase() });

    if (user) {
      // Link existing user to Keycloak identity
      user.oauth = { provider: 'keycloak', subject: userInfo.sub };
      user.auth.roles = keycloakRoles;
      user.profile.display_name = user.profile.display_name || userInfo.displayName;
      await user.save();
    } else {
      // Auto-create with active status (Keycloak manages access)
      let uniqueUsername = userInfo.username;
      let counter = 1;
      while (await User.findOne({ 'account.username': uniqueUsername })) {
        uniqueUsername = `${userInfo.username}_${counter++}`;
      }

      user = await User.create({
        account: {
          email: userInfo.email?.toLowerCase(),
          username: uniqueUsername,
          status: 'active',
        },
        profile: {
          display_name: userInfo.displayName,
        },
        auth: {
          roles: keycloakRoles,
          last_login: new Date(),
        },
        oauth: {
          provider: 'keycloak',
          subject: userInfo.sub,
        },
      });
    }
  } else {
    // Sync roles from Keycloak on each request (Keycloak is source of truth for roles)
    if (JSON.stringify(user.auth.roles.sort()) !== JSON.stringify(keycloakRoles.sort())) {
      user.auth.roles = keycloakRoles;
      await user.save();
    }
  }

  // Check account status (admin can still suspend via the app)
  if (user.account.status !== 'active') {
    throw {
      status: 403,
      message: `Account is ${user.account.status}. Contact an administrator.`,
    };
  }

  return {
    userId: user._id.toString(),
    email: user.account.email,
    username: user.account.username,
    roles: user.auth.roles,
    status: user.account.status,
  };
}

/**
 * Handle app-issued JWTs (LOCAL, OAUTH modes, and KEYCLOAK_FIREWALL fallback).
 */
async function handleAppJwt(token) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.error('JWT_SECRET is not configured');
    throw { status: 500, message: 'Server authentication misconfiguration.' };
  }

  let decoded;
  try {
    decoded = jwt.verify(token, secret);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw { status: 401, message: 'Token expired. Please log in again.' };
    }
    throw { status: 401, message: 'Invalid token.' };
  }

  // Load user from DB to get latest status and roles
  const user = await User.findById(decoded.userId).lean();
  if (!user) {
    throw { status: 401, message: 'User not found.' };
  }

  if (user.account.status !== 'active') {
    throw {
      status: 403,
      message: `Account is ${user.account.status}. Contact an administrator.`,
    };
  }

  return {
    userId: user._id.toString(),
    email: user.account.email,
    username: user.account.username,
    roles: user.auth.roles,
    status: user.account.status,
  };
}

/**
 * Auth error class used to short-circuit requests from derive().
 * Caught by the plugin's onError handler to produce proper HTTP responses.
 */
class AuthError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * Elysia plugin that provides JWT authentication.
 *
 * Derives `user` into the context for authenticated routes.
 * Supports LOCAL, OAUTH, and KEYCLOAK_FIREWALL modes.
 *
 * Uses throw + onError pattern because Elysia's derive() does not
 * receive an `error()` function in its context (as of Elysia 1.4).
 */
export const authPlugin = new Elysia({ name: 'auth' })
  .onError({ as: 'scoped' }, ({ error, set }) => {
    if (error instanceof AuthError) {
      set.status = error.statusCode;
      return { error: error.message };
    }
  })
  .derive({ as: 'scoped' }, async ({ headers }) => {
    try {
      const authHeader = headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new AuthError(401, 'Authentication required. Provide a Bearer token.');
      }

      const token = authHeader.split(' ')[1];
      const mode = AUTH_MODE();

      // KEYCLOAK_FIREWALL mode: try Keycloak token first
      if (mode === 'KEYCLOAK_FIREWALL' && isKeycloakToken(token)) {
        try {
          const user = await handleKeycloakToken(token);
          return { user };
        } catch (err) {
          if (err.status) {
            throw new AuthError(err.status, err.message);
          }
          // Fall through to app JWT verification
        }
      }

      // LOCAL / OAUTH / KEYCLOAK_FIREWALL (app JWT fallback)
      const user = await handleAppJwt(token);
      return { user };
    } catch (err) {
      if (err instanceof AuthError) throw err;
      if (err.status) {
        throw new AuthError(err.status, err.message);
      }
      console.error('Auth middleware error:', err);
      throw new AuthError(500, 'Internal authentication error.');
    }
  });

/**
 * Legacy-compatible auth function for use within the auth routes
 * where we selectively apply auth (some routes are public, some need auth).
 * Returns user info or null.
 */
export async function authenticateRequest(headers) {
  const authHeader = headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.split(' ')[1];
  const mode = AUTH_MODE();

  if (mode === 'KEYCLOAK_FIREWALL' && isKeycloakToken(token)) {
    try {
      return await handleKeycloakToken(token);
    } catch {
      // Fall through
    }
  }

  try {
    return await handleAppJwt(token);
  } catch {
    return null;
  }
}

export default authPlugin;
