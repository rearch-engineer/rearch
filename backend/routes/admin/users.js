import { Elysia } from 'elysia';
import bcrypt from "bcrypt";
import { z } from "zod";
import User from "../../models/User.js";

const OBJECT_ID_RE = /^[a-fA-F0-9]{24}$/;
const BCRYPT_ROUNDS = 12;

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const listUsersQuerySchema = z.object({
  search: z.string().max(200).optional(),
  status: z.enum(["active", "suspended", "pending_verification"]).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

const updateUserBodySchema = z.object({
  status: z.enum(["active", "suspended", "pending_verification"]).optional(),
  roles: z.array(z.enum(["admin", "user"])).optional(),
  display_name: z.string().max(100).optional(),
  tags: z.array(z.string().max(50)).optional(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters long.")
    .max(128)
    .optional(),
});

// ─── Router ───────────────────────────────────────────────────────────────────

const router = new Elysia({ prefix: '/users' })

  /**
   * GET /api/admin/users
   * List all users. Supports query params: ?search=&status=&page=1&limit=20
   */
  .get('/', async ({ query: rawQuery, status }) => {
    try {
      const parsed = listUsersQuerySchema.safeParse(rawQuery);
      if (!parsed.success) {
        return status(400, { error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
      }

      const { search, status: userStatus, page, limit } = parsed.data;

      console.log(rawQuery);

      const query = {};

      if (userStatus) {
        query["account.status"] = userStatus;
      }

      if (search) {
        // Escape regex special characters to prevent ReDoS
        const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(escaped, "i");
        query.$or = [
          { "account.email": regex },
          { "account.username": regex },
          { "profile.display_name": regex },
        ];
      }

      const skip = (page - 1) * limit;
      const [users, total] = await Promise.all([
        User.find(query)
          .select("-auth.password_hash")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        User.countDocuments(query),
      ]);

      return {
        users,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (err) {
      console.error("GET /users error:", err);
      return status(500, { error: "Failed to fetch users." });
    }
  })

  /**
   * GET /api/admin/users/:id
   * Get a single user by ID.
   */
  .get('/:id', async ({ params, status }) => {
    try {
      if (!OBJECT_ID_RE.test(params.id)) {
        return status(400, { error: 'Invalid id format. Expected a 24-character hex string.' });
      }

      const user = await User.findById(params.id);
      if (!user) return status(404, { error: "User not found." });
      return user.toSafeJSON();
    } catch (err) {
      console.error("GET /users/:id error:", err);
      return status(500, { error: "Failed to fetch user." });
    }
  })

  /**
   * PUT /api/admin/users/:id
   * Update a user's status, roles, profile, or tags.
   * Body can include: { status, roles, display_name, tags, password }
   */
  .put('/:id', async ({ params, body, user: currentUser, status }) => {
    try {
      if (!OBJECT_ID_RE.test(params.id)) {
        return status(400, { error: 'Invalid id format. Expected a 24-character hex string.' });
      }

      const parsed = updateUserBodySchema.safeParse(body);
      if (!parsed.success) {
        return status(400, { error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
      }

      const targetUser = await User.findById(params.id);
      if (!targetUser) return status(404, { error: "User not found." });

      const { status: userStatus, roles, display_name, tags, password } = parsed.data;

      // Prevent admins from demoting themselves
      if (
        targetUser._id.toString() === currentUser.userId &&
        roles &&
        !roles.includes("admin")
      ) {
        return status(400, { error: "You cannot remove your own admin role." });
      }

      // Prevent admins from deactivating themselves
      if (
        targetUser._id.toString() === currentUser.userId &&
        userStatus &&
        userStatus !== "active"
      ) {
        return status(400, { error: "You cannot deactivate your own account." });
      }

      if (userStatus) {
        targetUser.account.status = userStatus;
      }

      if (roles) {
        targetUser.auth.roles = roles;
      }

      if (display_name !== undefined) {
        targetUser.profile.display_name = display_name;
      }

      if (tags) {
        targetUser.metadata.tags = tags;
      }

      if (password) {
        targetUser.auth.password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      }

      await targetUser.save();
      return targetUser.toSafeJSON();
    } catch (err) {
      console.error("PUT /users/:id error:", err);
      return status(500, { error: "Failed to update user." });
    }
  })

  /**
   * DELETE /api/admin/users/:id
   * Delete a user.
   */
  .delete('/:id', async ({ params, user: currentUser, status }) => {
    try {
      if (!OBJECT_ID_RE.test(params.id)) {
        return status(400, { error: 'Invalid id format. Expected a 24-character hex string.' });
      }

      // Prevent admins from deleting themselves
      if (params.id === currentUser.userId) {
        return status(400, { error: "You cannot delete your own account." });
      }

      const user = await User.findByIdAndDelete(params.id);
      if (!user) return status(404, { error: "User not found." });

      return { message: "User deleted successfully." };
    } catch (err) {
      console.error("DELETE /users/:id error:", err);
      return status(500, { error: "Failed to delete user." });
    }
  });

export default router;
