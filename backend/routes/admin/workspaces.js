import { Elysia } from 'elysia';
import { z } from "zod";
import Workspace from "../../models/Workspace.js";
import WorkspaceMember from "../../models/WorkspaceMember.js";
import User from "../../models/User.js";

const OBJECT_ID_RE = /^[a-fA-F0-9]{24}$/;

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const listWorkspacesQuerySchema = z.object({
  search: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

const updateWorkspaceBodySchema = z.object({
  name: z.string().max(100),
});

const addMemberBodySchema = z.object({
  userId: z.string().regex(OBJECT_ID_RE, "Invalid ObjectId format."),
});

const updateMemberBodySchema = z.object({
  role: z.enum(["admin", "member"]),
});

// ─── Router ───────────────────────────────────────────────────────────────────

const router = new Elysia({ prefix: '/workspaces' })

  /**
   * GET /api/admin/workspaces
   * List all workspaces. Supports query params: ?search=&page=1&limit=20
   */
  .get('/', async ({ query: rawQuery, status }) => {
    try {
      const parsed = listWorkspacesQuerySchema.safeParse(rawQuery);
      if (!parsed.success) {
        return status(400, { error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
      }

      const { search, page, limit } = parsed.data;

      const query = {};

      if (search) {
        const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(escaped, "i");
        query.name = regex;
      }

      const skip = (page - 1) * limit;
      const [workspaces, total] = await Promise.all([
        Workspace.find(query)
          .populate("owner", "profile.display_name account.email account.username")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Workspace.countDocuments(query),
      ]);

      // Attach member counts
      const workspaceIds = workspaces.map((w) => w._id);
      const memberCounts = await WorkspaceMember.aggregate([
        { $match: { workspace: { $in: workspaceIds } } },
        { $group: { _id: "$workspace", count: { $sum: 1 } } },
      ]);
      const countMap = Object.fromEntries(
        memberCounts.map((mc) => [mc._id.toString(), mc.count])
      );

      const results = workspaces.map((w) => ({
        ...w,
        memberCount: countMap[w._id.toString()] || 0,
      }));

      return {
        workspaces: results,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (err) {
      console.error("GET /workspaces error:", err);
      return status(500, { error: "Failed to fetch workspaces." });
    }
  })

  /**
   * GET /api/admin/workspaces/:id
   * Get a single workspace by ID.
   */
  .get('/:id', async ({ params, status }) => {
    try {
      if (!OBJECT_ID_RE.test(params.id)) {
        return status(400, { error: 'Invalid id format. Expected a 24-character hex string.' });
      }

      const workspace = await Workspace.findById(params.id)
        .populate("owner", "profile.display_name account.email account.username")
        .lean();
      if (!workspace) return status(404, { error: "Workspace not found." });

      const memberCount = await WorkspaceMember.countDocuments({ workspace: workspace._id });

      return { ...workspace, memberCount };
    } catch (err) {
      console.error("GET /workspaces/:id error:", err);
      return status(500, { error: "Failed to fetch workspace." });
    }
  })

  /**
   * PUT /api/admin/workspaces/:id
   * Update a workspace's name.
   * Body: { name }
   */
  .put('/:id', async ({ params, body, status }) => {
    try {
      if (!OBJECT_ID_RE.test(params.id)) {
        return status(400, { error: 'Invalid id format. Expected a 24-character hex string.' });
      }

      const parsed = updateWorkspaceBodySchema.safeParse(body);
      if (!parsed.success) {
        return status(400, { error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
      }

      const workspace = await Workspace.findById(params.id);
      if (!workspace) return status(404, { error: "Workspace not found." });

      workspace.name = parsed.data.name;
      await workspace.save();

      const updated = await Workspace.findById(params.id)
        .populate("owner", "profile.display_name account.email account.username")
        .lean();

      return updated;
    } catch (err) {
      console.error("PUT /workspaces/:id error:", err);
      return status(500, { error: "Failed to update workspace." });
    }
  })

  /**
   * DELETE /api/admin/workspaces/:id
   * Delete a workspace and all associated members (admin override — includes personal workspaces).
   */
  .delete('/:id', async ({ params, status }) => {
    try {
      if (!OBJECT_ID_RE.test(params.id)) {
        return status(400, { error: 'Invalid id format. Expected a 24-character hex string.' });
      }

      const workspace = await Workspace.findByIdAndDelete(params.id);
      if (!workspace) return status(404, { error: "Workspace not found." });

      await WorkspaceMember.deleteMany({ workspace: workspace._id });

      return { message: "Workspace deleted successfully." };
    } catch (err) {
      console.error("DELETE /workspaces/:id error:", err);
      return status(500, { error: "Failed to delete workspace." });
    }
  })

  /**
   * GET /api/admin/workspaces/:id/members
   * List members of a workspace.
   */
  .get('/:id/members', async ({ params, status }) => {
    try {
      if (!OBJECT_ID_RE.test(params.id)) {
        return status(400, { error: 'Invalid id format. Expected a 24-character hex string.' });
      }

      const workspace = await Workspace.findById(params.id).lean();
      if (!workspace) return status(404, { error: "Workspace not found." });

      const members = await WorkspaceMember.find({ workspace: params.id })
        .populate("user", "profile.display_name account.email account.username")
        .sort({ createdAt: -1 })
        .lean();

      return { members };
    } catch (err) {
      console.error("GET /workspaces/:id/members error:", err);
      return status(500, { error: "Failed to fetch workspace members." });
    }
  })

  /**
   * POST /api/admin/workspaces/:id/members
   * Add a member to a workspace.
   * Body: { userId }
   */
  .post('/:id/members', async ({ params, body, status }) => {
    try {
      if (!OBJECT_ID_RE.test(params.id)) {
        return status(400, { error: 'Invalid id format. Expected a 24-character hex string.' });
      }

      const parsed = addMemberBodySchema.safeParse(body);
      if (!parsed.success) {
        return status(400, { error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
      }

      const workspace = await Workspace.findById(params.id).lean();
      if (!workspace) return status(404, { error: "Workspace not found." });

      const user = await User.findById(parsed.data.userId).lean();
      if (!user) return status(404, { error: "User not found." });

      const existing = await WorkspaceMember.findOne({
        workspace: params.id,
        user: parsed.data.userId,
      }).lean();
      if (existing) {
        return status(409, { error: "User is already a member of this workspace." });
      }

      const member = await WorkspaceMember.create({
        workspace: params.id,
        user: parsed.data.userId,
        role: "member",
      });

      const populated = await WorkspaceMember.findById(member._id)
        .populate("user", "profile.display_name account.email account.username")
        .lean();

      return populated;
    } catch (err) {
      console.error("POST /workspaces/:id/members error:", err);
      return status(500, { error: "Failed to add workspace member." });
    }
  })

  /**
   * PUT /api/admin/workspaces/:id/members/:userId
   * Change a member's role in a workspace.
   * Body: { role }
   */
  .put('/:id/members/:userId', async ({ params, body, status }) => {
    try {
      if (!OBJECT_ID_RE.test(params.id)) {
        return status(400, { error: 'Invalid id format. Expected a 24-character hex string.' });
      }
      if (!OBJECT_ID_RE.test(params.userId)) {
        return status(400, { error: 'Invalid userId format. Expected a 24-character hex string.' });
      }

      const parsed = updateMemberBodySchema.safeParse(body);
      if (!parsed.success) {
        return status(400, { error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
      }

      const workspace = await Workspace.findById(params.id).lean();
      if (!workspace) return status(404, { error: "Workspace not found." });

      const member = await WorkspaceMember.findOne({
        workspace: params.id,
        user: params.userId,
      });
      if (!member) return status(404, { error: "Member not found in this workspace." });

      member.role = parsed.data.role;
      await member.save();

      const populated = await WorkspaceMember.findById(member._id)
        .populate("user", "profile.display_name account.email account.username")
        .lean();

      return populated;
    } catch (err) {
      console.error("PUT /workspaces/:id/members/:userId error:", err);
      return status(500, { error: "Failed to update workspace member." });
    }
  })

  /**
   * DELETE /api/admin/workspaces/:id/members/:userId
   * Remove a member from a workspace.
   */
  .delete('/:id/members/:userId', async ({ params, status }) => {
    try {
      if (!OBJECT_ID_RE.test(params.id)) {
        return status(400, { error: 'Invalid id format. Expected a 24-character hex string.' });
      }
      if (!OBJECT_ID_RE.test(params.userId)) {
        return status(400, { error: 'Invalid userId format. Expected a 24-character hex string.' });
      }

      const workspace = await Workspace.findById(params.id).lean();
      if (!workspace) return status(404, { error: "Workspace not found." });

      const member = await WorkspaceMember.findOneAndDelete({
        workspace: params.id,
        user: params.userId,
      });
      if (!member) return status(404, { error: "Member not found in this workspace." });

      return { message: "Member removed from workspace successfully." };
    } catch (err) {
      console.error("DELETE /workspaces/:id/members/:userId error:", err);
      return status(500, { error: "Failed to remove workspace member." });
    }
  });

export default router;
