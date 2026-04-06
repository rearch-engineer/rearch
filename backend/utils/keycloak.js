import * as jose from 'jose';

/**
 * Keycloak JWT verification utility.
 * Validates Keycloak-issued access tokens using the realm's JWKS endpoint.
 * Caches the JWKS for performance.
 */

let _jwks = null;
let _jwksRealmUrl = null;

/**
 * Get (or create and cache) the JWKS remote key set for the configured Keycloak realm.
 * Resets the cache if the realm URL changes.
 */
function getJWKS() {
  const realmUrl = process.env.KEYCLOAK_REALM_URL;
  if (!realmUrl) {
    throw new Error('KEYCLOAK_REALM_URL is not configured');
  }

  // Reset cache if realm URL changed
  if (_jwks && _jwksRealmUrl !== realmUrl) {
    _jwks = null;
  }

  if (!_jwks) {
    const jwksUrl = new URL(`${realmUrl}/protocol/openid-connect/certs`);
    _jwks = jose.createRemoteJWKSet(jwksUrl);
    _jwksRealmUrl = realmUrl;
  }

  return _jwks;
}

/**
 * Verify a Keycloak access token.
 *
 * @param {string} token - The raw JWT access token from Keycloak
 * @returns {Promise<Object>} Decoded payload with claims:
 *   - sub: Keycloak user subject ID
 *   - email: user email
 *   - preferred_username: Keycloak username
 *   - name: display name
 *   - realm_roles: array of realm role names
 *   - realm_access.roles: standard Keycloak realm roles
 */
export async function verifyKeycloakToken(token) {
  const realmUrl = process.env.KEYCLOAK_REALM_URL;
  if (!realmUrl) {
    throw new Error('KEYCLOAK_REALM_URL is not configured');
  }

  const jwks = getJWKS();

  const { payload } = await jose.jwtVerify(token, jwks, {
    issuer: realmUrl,
    // Audience can be the backend client ID or 'account'
    // Keycloak access tokens have azp (authorized party) instead of aud for client checks
  });

  return payload;
}

/**
 * Check whether a JWT is a Keycloak token (vs app-issued JWT).
 * Keycloak tokens have an `iss` field matching the realm URL,
 * and contain `realm_access` or `azp` claims.
 *
 * @param {string} token - Raw JWT string
 * @returns {boolean}
 */
export function isKeycloakToken(token) {
  try {
    // Decode without verifying to inspect the issuer
    const payload = jose.decodeJwt(token);
    const realmUrl = process.env.KEYCLOAK_REALM_URL;
    if (!realmUrl) return false;
    return payload.iss === realmUrl;
  } catch {
    return false;
  }
}

/**
 * Extract role names from a Keycloak token payload.
 * Keycloak stores realm roles in `realm_access.roles` by default,
 * and our custom mapper also adds `realm_roles` as a top-level claim.
 *
 * @param {Object} payload - Decoded Keycloak JWT payload
 * @returns {string[]} Array of role names
 */
export function extractKeycloakRoles(payload) {
  const roles = new Set();

  // Standard Keycloak realm_access.roles
  if (payload.realm_access?.roles) {
    for (const role of payload.realm_access.roles) {
      roles.add(role);
    }
  }

  // Custom mapper: realm_roles claim
  if (Array.isArray(payload.realm_roles)) {
    for (const role of payload.realm_roles) {
      roles.add(role);
    }
  }

  // Filter out Keycloak internal roles, keep only app-relevant ones
  const appRoles = ['user', 'admin'];
  return [...roles].filter(r => appRoles.includes(r));
}

/**
 * Extract user information from a Keycloak token payload.
 *
 * @param {Object} payload - Decoded Keycloak JWT payload
 * @returns {Object} User info with email, username, displayName, sub
 */
export function extractKeycloakUserInfo(payload) {
  return {
    sub: payload.sub,
    email: payload.email,
    username: payload.preferred_username || payload.email?.split('@')[0] || payload.sub,
    displayName: payload.name || payload.preferred_username || payload.email,
    emailVerified: payload.email_verified || false,
  };
}

export default {
  verifyKeycloakToken,
  isKeycloakToken,
  extractKeycloakRoles,
  extractKeycloakUserInfo,
};
