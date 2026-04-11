import { Elysia } from "elysia";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import * as oidc from "openid-client";
import { z } from "zod";
import sharp from "sharp";
import { rateLimit } from "elysia-rate-limit";
import User from "../models/User.js";
import Setting from "../models/Setting.js";
import { authPlugin, authenticateRequest } from "../middleware/auth.js";
import { uploadFile, deleteFile } from "../utils/gridfs.js";
import {
  verifyKeycloakToken,
  extractKeycloakRoles,
  extractKeycloakUserInfo,
} from "../utils/keycloak.js";

const router = new Elysia({ prefix: "/api/auth" });

const AUTH_MODE = () => (process.env.AUTH_MODE || "LOCAL").toUpperCase();
const JWT_SECRET = () => process.env.JWT_SECRET;
const JWT_EXPIRY = () => process.env.JWT_EXPIRY || "24h";
const BCRYPT_ROUNDS = 12;

// ─── Rate Limiting (login & register) ─────────────────────────────────────────

const RATE_LIMIT_AUTH_MAX = parseInt(process.env.RATE_LIMIT_AUTH_MAX, 10) || 10;
const RATE_LIMIT_AUTH_WINDOW_MS = parseInt(process.env.RATE_LIMIT_AUTH_WINDOW_MS, 10) || 900_000; // 15 min

/**
 * Rate-limited sub-router for login and register endpoints.
 * Limits requests per IP to prevent brute-force and registration abuse.
 */
const rateLimitedAuthRoutes = new Elysia()
  .use(
    rateLimit({
      duration: RATE_LIMIT_AUTH_WINDOW_MS,
      max: RATE_LIMIT_AUTH_MAX,
      scoping: "scoped",
      generator: (req, server) =>
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        server?.requestIP(req)?.address ||
        "unknown",
      errorResponse: new Response(
        JSON.stringify({
          error: "Too many requests. Please try again later.",
        }),
        {
          status: 429,
          headers: { "Content-Type": "application/json" },
        },
      ),
    }),
  );

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const registerBodySchema = z.object({
  email: z.string().email("Invalid email format."),
  username: z
    .string()
    .min(3, "Username must be between 3 and 30 characters.")
    .max(30, "Username must be between 3 and 30 characters.")
    .regex(
      /^[a-zA-Z0-9_.-]+$/,
      "Username can only contain letters, numbers, underscores, dots, and hyphens.",
    ),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters long.")
    .max(128, "Password must not exceed 128 characters."),
  display_name: z.string().max(100).optional(),
});

const loginBodySchema = z.object({
  email: z.string().min(1, "email is required."),
  password: z.string().min(1, "password is required.").max(128),
});

const changePasswordBodySchema = z.object({
  currentPassword: z.string().min(1, "currentPassword is required.").max(128),
  newPassword: z
    .string()
    .min(8, "New password must be at least 8 characters long.")
    .max(128, "New password must not exceed 128 characters."),
});

const profileBodySchema = z.object({
  display_name: z
    .string()
    .trim()
    .min(1, "Display name must not be empty.")
    .max(100, "Display name must not exceed 100 characters.")
    .optional(),
  voice_language: z
    .string()
    .regex(/^$|^[a-zA-Z]{1,8}(-[a-zA-Z0-9]{1,8})*$/, "voice_language must be a valid BCP-47 language tag (e.g. en-US, es, pt-BR).")
    .optional(),
  theme: z.enum(["light", "dark", "system"], {
    errorMap: () => ({ message: "theme must be one of: light, dark, system." }),
  }).optional(),
});

const oauthCallbackBodySchema = z.object({
  code: z.string().min(1, "code is required."),
  state: z.string().min(1, "state is required."),
  stateToken: z.string().min(1, "stateToken is required."),
});

const keycloakTokenExchangeBodySchema = z.object({
  keycloakToken: z.string().min(1, "keycloakToken is required."),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function signToken(user) {
  return jwt.sign(
    {
      userId: user._id.toString(),
      email: user.account.email,
      roles: user.auth.roles,
    },
    JWT_SECRET(),
    { expiresIn: JWT_EXPIRY() },
  );
}

function getClientIp(headers) {
  return headers["x-forwarded-for"]?.split(",")[0]?.trim() || "";
}

// ─── OIDC lazy-initialised config cache ───────────────────────────────────────

let _oidcConfig = null;

async function getOIDCConfig() {
  if (_oidcConfig) return _oidcConfig;

  const issuerUrl = new URL(process.env.OAUTH_ISSUER_URL);
  _oidcConfig = await oidc.discovery(issuerUrl, process.env.OAUTH_CLIENT_ID);
  return _oidcConfig;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC ROUTES (no auth required)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Public: Get auth mode ────────────────────────────────────────────────────

/**
 * GET /api/auth/mode
 * Returns the configured authentication mode so the frontend can adapt.
 */
router.get("/mode", () => {
  return { mode: AUTH_MODE() };
});

// ═══════════════════════════════════════════════════════════════════════════════
// LOCAL AUTH ROUTES (public, rate-limited)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/auth/register
 * Self-registration for LOCAL mode.
 * Creates a user with status 'pending_verification'. Admin must activate.
 */
rateLimitedAuthRoutes.post("/register", async ({ body, status }) => {
  if (AUTH_MODE() !== "LOCAL") {
    return status(400, { error: "Registration is only available in LOCAL auth mode." });
  }

  const parsed = registerBodySchema.safeParse(body);
  if (!parsed.success) {
    return status(400, { error: parsed.error.errors[0].message });
  }

  try {
    const { email, username, password, display_name } = parsed.data;

    // ── Check signup restriction settings ──────────────────────────────
    const signupSetting = await Setting.findOne({ key: "signup" });
    const signupConfig = signupSetting?.value || { restrictSignups: false, allowedDomains: [] };

    if (signupConfig.restrictSignups) {
      return status(403, { error: "New registrations are currently disabled." });
    }

    if (signupConfig.allowedDomains && signupConfig.allowedDomains.length > 0) {
      const emailDomain = email.toLowerCase().split("@")[1];
      if (!signupConfig.allowedDomains.includes(emailDomain)) {
        return status(403, { error: "Registration is not allowed for this email domain." });
      }
    }

    // Check for existing user
    const existingUser = await User.findOne({
      $or: [
        { "account.email": email.toLowerCase() },
        { "account.username": username },
      ],
    });
    if (existingUser) {
      const field =
        existingUser.account.email === email.toLowerCase()
          ? "email"
          : "username";
      return status(409, { error: `A user with this ${field} already exists.` });
    }

    const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const user = await User.create({
      account: {
        email: email.toLowerCase(),
        username,
        status: "pending_verification",
      },
      profile: {
        display_name: display_name || username,
      },
      auth: {
        password_hash,
        roles: ["user"],
      },
    });

    return new Response(
      JSON.stringify({
        message:
          "Registration successful. Your account is pending admin approval.",
        user: user.toSafeJSON(),
      }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("POST /auth/register error:", err);
    return status(500, { error: "Registration failed." });
  }
});

/**
 * POST /api/auth/login
 * Local login with email + password.
 */
rateLimitedAuthRoutes.post("/login", async ({ body, headers, status }) => {
  if (AUTH_MODE() !== "LOCAL") {
    return status(400, { error: "Local login is only available in LOCAL auth mode." });
  }

  const parsed = loginBodySchema.safeParse(body);
  if (!parsed.success) {
    return status(400, { error: parsed.error.errors[0].message });
  }

  try {
    const { email, password } = parsed.data;

    const user = await User.findOne({ "account.email": email.toLowerCase() });
    if (!user) {
      return status(401, { error: "Invalid email or password." });
    }

    // Verify password
    if (!user.auth.password_hash) {
      return status(401, { error: "Invalid email or password." });
    }

    const passwordValid = await bcrypt.compare(
      password,
      user.auth.password_hash,
    );
    if (!passwordValid) {
      return status(401, { error: "Invalid email or password." });
    }

    // Check account status
    if (user.account.status !== "active") {
      return status(403, {
        error: `Account is ${user.account.status}. Contact an administrator.`,
      });
    }

    // Update last login and activity
    user.auth.last_login = new Date();
    user.addActivity("login", getClientIp(headers));
    await user.save();

    const token = signToken(user);

    return {
      token,
      user: user.toSafeJSON(),
    };
  } catch (err) {
    console.error("POST /auth/login error:", err);
    return status(500, { error: "Login failed." });
  }
});

// Mount rate-limited login & register routes into the auth router
router.use(rateLimitedAuthRoutes);

// ═══════════════════════════════════════════════════════════════════════════════
// OAUTH (OIDC) ROUTES (public)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/auth/oauth/authorize
 * Returns the OIDC authorization URL for the frontend to redirect to.
 */
router.get("/oauth/authorize", async ({ status }) => {
  if (AUTH_MODE() !== "OAUTH") {
    return status(400, { error: "OAuth is only available in OAUTH auth mode." });
  }

  try {
    const config = await getOIDCConfig();
    const redirectUri = process.env.OAUTH_REDIRECT_URI;

    const codeVerifier = oidc.randomPKCECodeVerifier();
    const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
    const state = oidc.randomState();

    // Store verifier and state in a short-lived JWT so we can validate on callback
    const stateToken = jwt.sign({ codeVerifier, state }, JWT_SECRET(), {
      expiresIn: "10m",
    });

    const params = new URLSearchParams({
      redirect_uri: redirectUri,
      scope: "openid email profile",
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      state,
    });

    const authUrl = oidc.buildAuthorizationUrl(config, params);

    return {
      url: authUrl.href,
      stateToken, // frontend must send this back with the callback
    };
  } catch (err) {
    console.error("GET /auth/oauth/authorize error:", err);
    return status(500, { error: "Failed to generate authorization URL." });
  }
});

/**
 * POST /api/auth/oauth/callback
 * Exchanges the authorization code for tokens and creates/finds the user.
 * Body: { code, state, stateToken }
 */
router.post("/oauth/callback", async ({ body, headers, status }) => {
  if (AUTH_MODE() !== "OAUTH") {
    return status(400, { error: "OAuth is only available in OAUTH auth mode." });
  }

  const parsed = oauthCallbackBodySchema.safeParse(body);
  if (!parsed.success) {
    return status(400, { error: parsed.error.errors[0].message });
  }

  try {
    const { code, state, stateToken } = parsed.data;

    // Validate the state token and extract PKCE verifier
    let statePayload;
    try {
      statePayload = jwt.verify(stateToken, JWT_SECRET());
    } catch {
      return status(400, {
        error: "Invalid or expired state token. Please try logging in again.",
      });
    }

    if (statePayload.state !== state) {
      return status(400, { error: "State mismatch. Possible CSRF attack." });
    }

    const config = await getOIDCConfig();
    const redirectUri = process.env.OAUTH_REDIRECT_URI;

    // Build the callback URL as the OIDC library expects it
    const callbackUrl = new URL(redirectUri);
    callbackUrl.searchParams.set("code", code);
    callbackUrl.searchParams.set("state", state);

    // Exchange the code for tokens
    const tokens = await oidc.authorizationCodeGrant(config, callbackUrl, {
      pkceCodeVerifier: statePayload.codeVerifier,
      expectedState: state,
    });

    // Extract claims from the ID token
    const claims = tokens.claims();
    const email = claims.email;
    const sub = claims.sub;
    const name = claims.name || claims.preferred_username || email;

    if (!email) {
      return status(400, {
        error:
          'The identity provider did not return an email address. Ensure the "email" scope is configured.',
      });
    }

    // Find existing user by OIDC subject
    let user = await User.findOne({
      "oauth.provider": "oidc",
      "oauth.subject": sub,
    });

    if (!user) {
      // Also check if a user with this email already exists (admin pre-created)
      user = await User.findOne({ "account.email": email.toLowerCase() });

      if (user) {
        // Link the OIDC identity to the existing user
        user.oauth = { provider: "oidc", subject: sub };
        user.profile.display_name = user.profile.display_name || name;
        await user.save();
      } else {
        // Auto-create with pending_verification
        const username = email.split("@")[0].replace(/[^a-zA-Z0-9_.-]/g, "_");
        // Ensure unique username
        let uniqueUsername = username;
        let counter = 1;
        while (await User.findOne({ "account.username": uniqueUsername })) {
          uniqueUsername = `${username}_${counter++}`;
        }

        user = await User.create({
          account: {
            email: email.toLowerCase(),
            username: uniqueUsername,
            status: "pending_verification",
          },
          profile: {
            display_name: name,
          },
          auth: {
            roles: ["user"],
          },
          oauth: {
            provider: "oidc",
            subject: sub,
          },
        });
      }
    }

    // Check account status
    if (user.account.status !== "active") {
      return status(403, {
        error: `Account is ${user.account.status}. Contact an administrator.`,
        accountStatus: user.account.status,
      });
    }

    // Update last login
    user.auth.last_login = new Date();
    user.addActivity("login", getClientIp(headers));
    await user.save();

    const token = signToken(user);

    return {
      token,
      user: user.toSafeJSON(),
    };
  } catch (err) {
    console.error("POST /auth/oauth/callback error:", err);
    return status(500, { error: "OAuth callback failed." });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// KEYCLOAK FIREWALL ROUTES (public)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/auth/keycloak/config
 * Returns the Keycloak configuration needed by the frontend to initialize
 * the keycloak-js adapter. Only available in KEYCLOAK_FIREWALL mode.
 */
router.get("/keycloak/config", ({ status }) => {
  if (AUTH_MODE() !== "KEYCLOAK_FIREWALL") {
    return status(400, { error: "Keycloak config is only available in KEYCLOAK_FIREWALL auth mode." });
  }

  const realmUrl = process.env.KEYCLOAK_REALM_URL;
  if (!realmUrl) {
    return status(500, { error: "KEYCLOAK_REALM_URL is not configured." });
  }

  // Derive Keycloak base URL and realm name from the realm URL
  // e.g. https://auth.rearch.engineer/realms/rearch
  const urlParts = realmUrl.match(/^(https?:\/\/.+)\/realms\/(.+)$/);
  if (!urlParts) {
    return status(500, { error: "Invalid KEYCLOAK_REALM_URL format." });
  }

  return {
    url: urlParts[1],           // e.g. https://auth.rearch.engineer
    realm: urlParts[2],         // e.g. rearch
    clientId: process.env.KEYCLOAK_CLIENT_ID || "rearch-app",
  };
});

/**
 * POST /api/auth/keycloak/token-exchange
 * Accepts a Keycloak access token, validates it, syncs the user to MongoDB,
 * and returns an app-issued JWT. This JWT is used by Socket.IO and internal calls.
 *
 * Body: { keycloakToken: "<Keycloak access token>" }
 */
router.post("/keycloak/token-exchange", async ({ body, headers, status }) => {
  if (AUTH_MODE() !== "KEYCLOAK_FIREWALL") {
    return status(400, { error: "Token exchange is only available in KEYCLOAK_FIREWALL auth mode." });
  }

  const parsed = keycloakTokenExchangeBodySchema.safeParse(body);
  if (!parsed.success) {
    return status(400, { error: parsed.error.errors[0].message });
  }

  try {
    const { keycloakToken } = parsed.data;

    // Verify the Keycloak token
    let payload;
    try {
      payload = await verifyKeycloakToken(keycloakToken);
    } catch (err) {
      if (err.code === "ERR_JWT_EXPIRED") {
        return status(401, { error: "Keycloak token expired." });
      }
      return status(401, { error: "Invalid Keycloak token." });
    }

    const userInfo = extractKeycloakUserInfo(payload);
    const keycloakRoles = extractKeycloakRoles(payload);
    if (!keycloakRoles.includes("user")) {
      keycloakRoles.push("user");
    }

    // Sync user to MongoDB
    let user = await User.findOne({
      "oauth.provider": "keycloak",
      "oauth.subject": userInfo.sub,
    });

    if (!user) {
      user = await User.findOne({ "account.email": userInfo.email?.toLowerCase() });

      if (user) {
        user.oauth = { provider: "keycloak", subject: userInfo.sub };
        user.auth.roles = keycloakRoles;
        user.profile.display_name = user.profile.display_name || userInfo.displayName;
      } else {
        let uniqueUsername = userInfo.username;
        let counter = 1;
        while (await User.findOne({ "account.username": uniqueUsername })) {
          uniqueUsername = `${userInfo.username}_${counter++}`;
        }

        user = await User.create({
          account: {
            email: userInfo.email?.toLowerCase(),
            username: uniqueUsername,
            status: "active",
          },
          profile: {
            display_name: userInfo.displayName,
          },
          auth: {
            roles: keycloakRoles,
          },
          oauth: {
            provider: "keycloak",
            subject: userInfo.sub,
          },
        });
      }
    } else {
      // Sync roles
      user.auth.roles = keycloakRoles;
    }

    // Check account status
    if (user.account.status !== "active") {
      return status(403, {
        error: `Account is ${user.account.status}. Contact an administrator.`,
        accountStatus: user.account.status,
      });
    }

    // Update last login
    user.auth.last_login = new Date();
    user.addActivity("login", getClientIp(headers));
    await user.save();

    // Issue app JWT for Socket.IO and internal use
    const appToken = signToken(user);

    return {
      token: appToken,
      user: user.toSafeJSON(),
    };
  } catch (err) {
    console.error("POST /auth/keycloak/token-exchange error:", err);
    return status(500, { error: "Token exchange failed." });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// AUTHENTICATED ROUTES (authPlugin applied from here onward)
// ═══════════════════════════════════════════════════════════════════════════════

router.use(authPlugin);

// ─── Get current user ─────────────────────────────────────────────────────────

/**
 * GET /api/auth/me
 * Returns the authenticated user's profile (no password hash).
 */
router.get("/me", async ({ user, status }) => {
  try {
    const dbUser = await User.findById(user.userId);
    if (!dbUser) return status(404, { error: "User not found." });
    return dbUser.toSafeJSON();
  } catch (err) {
    console.error("GET /auth/me error:", err);
    return status(500, { error: "Failed to fetch user profile." });
  }
});

// ─── Self-service: Change password ────────────────────────────────────────────

/**
 * POST /api/auth/change-password
 * Allows an authenticated user to change their own password (LOCAL mode only).
 * Body: { currentPassword, newPassword }
 */
router.post("/change-password", async ({ body, user, status }) => {
  if (AUTH_MODE() !== "LOCAL") {
    return status(400, { error: "Password changes are only available in LOCAL auth mode." });
  }

  const parsed = changePasswordBodySchema.safeParse(body);
  if (!parsed.success) {
    return status(400, { error: parsed.error.errors[0].message });
  }

  try {
    const { currentPassword, newPassword } = parsed.data;

    const dbUser = await User.findById(user.userId);
    if (!dbUser) {
      return status(404, { error: "User not found." });
    }

    if (!dbUser.auth.password_hash) {
      return status(400, { error: "No password set for this account." });
    }

    const isValid = await bcrypt.compare(currentPassword, dbUser.auth.password_hash);
    if (!isValid) {
      return status(401, { error: "Current password is incorrect." });
    }

    dbUser.auth.password_hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await dbUser.save();

    return { message: "Password changed successfully." };
  } catch (err) {
    console.error("POST /auth/change-password error:", err);
    return status(500, { error: "Failed to change password." });
  }
});

// ─── Self-service: Update profile ─────────────────────────────────────────────

/**
 * PATCH /api/auth/profile
 * Allows an authenticated user to update their own profile preferences.
 * Body: { voice_language, theme }
 */
router.patch("/profile", async ({ body, user, status }) => {
  const parsed = profileBodySchema.safeParse(body);
  if (!parsed.success) {
    return status(400, { error: parsed.error.errors[0].message });
  }

  try {
    const { display_name, voice_language, theme } = parsed.data;

    const dbUser = await User.findById(user.userId);
    if (!dbUser) {
      return status(404, { error: "User not found." });
    }

    if (display_name !== undefined) {
      dbUser.profile.display_name = display_name;
    }

    if (voice_language !== undefined) {
      dbUser.profile.preferences.voice_language = voice_language;
    }

    if (theme !== undefined) {
      dbUser.profile.preferences.theme = theme;
    }

    await dbUser.save();

    return dbUser.toSafeJSON();
  } catch (err) {
    console.error("PATCH /auth/profile error:", err);
    return status(500, { error: "Failed to update profile." });
  }
});

// ─── Self-service: Upload avatar ──────────────────────────────────────────────

/**
 * POST /api/auth/avatar
 * Allows an authenticated user to upload/replace their avatar image.
 * Multipart form-data, field name: "avatar".
 * The image is resized to 256x256 and stored in GridFS (public).
 */
router.post("/avatar", async ({ body, user, status }) => {
  try {
    if (!body?.avatar) {
      return status(400, { error: "No image file provided." });
    }

    const file = body.avatar;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      return status(400, { error: "Only image files are allowed." });
    }

    // Validate file size (2MB limit)
    if (file.size > 2 * 1024 * 1024) {
      return status(400, { error: "File size must not exceed 2MB." });
    }

    const dbUser = await User.findById(user.userId);
    if (!dbUser) {
      return status(404, { error: "User not found." });
    }

    // Delete old avatar from GridFS if one exists
    if (dbUser.profile.avatar_fileId) {
      try {
        await deleteFile(dbUser.profile.avatar_fileId);
      } catch {
        // Ignore — old file may have been manually removed
      }
    }

    // Read file buffer
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    // Resize to 256x256 (cover fit) and convert to WebP for consistency
    const resizedBuffer = await sharp(fileBuffer)
      .resize(256, 256, { fit: "cover", position: "center" })
      .webp({ quality: 85 })
      .toBuffer();

    // Upload to GridFS as a public file
    const fileId = await uploadFile(
      resizedBuffer,
      `avatar_${dbUser._id}.webp`,
      "image/webp",
      "attachments",
      { public: true },
    );

    dbUser.profile.avatar_fileId = fileId.toString();
    await dbUser.save();

    return dbUser.toSafeJSON();
  } catch (err) {
    console.error("POST /auth/avatar error:", err);
    return status(500, { error: "Failed to upload avatar." });
  }
});

// ─── Self-service: Delete avatar ──────────────────────────────────────────────

/**
 * DELETE /api/auth/avatar
 * Removes the user's avatar image.
 */
router.delete("/avatar", async ({ user, status }) => {
  try {
    const dbUser = await User.findById(user.userId);
    if (!dbUser) {
      return status(404, { error: "User not found." });
    }

    if (dbUser.profile.avatar_fileId) {
      try {
        await deleteFile(dbUser.profile.avatar_fileId);
      } catch {
        // Ignore — file may already be gone
      }
      dbUser.profile.avatar_fileId = "";
      await dbUser.save();
    }

    return dbUser.toSafeJSON();
  } catch (err) {
    console.error("DELETE /auth/avatar error:", err);
    return status(500, { error: "Failed to delete avatar." });
  }
});

export default router;
