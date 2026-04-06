import { Elysia } from 'elysia';
import mongoose from "mongoose";
import { z } from "zod";
import Conversation from "../models/Conversation.js";
import User from "../models/User.js";
import SubResource from "../models/SubResource.js";
import { authPlugin } from '../middleware/auth.js';
import requireRole from '../middleware/requireRole.js';
import { logger } from '../logger.js';

const router = new Elysia({ prefix: '/api/usage' })
  .use(authPlugin)
  .use(requireRole('admin'));

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
const OBJECT_ID_RE = /^[a-fA-F0-9]{24}$/;

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const usageQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  userId: z.string().regex(OBJECT_ID_RE, "Invalid userId format.").optional(),
  subResource: z.string().regex(OBJECT_ID_RE, "Invalid subResource ID format.").optional(),
}).refine(
  (data) => {
    if (data.from) {
      const d = new Date(data.from);
      if (isNaN(d.getTime())) return false;
    }
    if (data.to) {
      const d = new Date(data.to);
      if (isNaN(d.getTime())) return false;
    }
    return true;
  },
  { message: "from and to must be valid date strings (ISO 8601 format)." },
);

/**
 * For a given conversation, find the userId of the first user-role message.
 * Since messages are no longer stored in MongoDB, we cannot determine the user
 * from the message collection. Returns null — usage filtering by user will rely
 * on the conversation's updatedAt and other metadata instead.
 */
async function getConversationUserId(conversationId) {
  // Messages are stored in OpenCode (ephemeral). User attribution is not available
  // once the container is gone. For the usage dashboard we return null.
  return null;
}

/**
 * For a given conversation, get an approximate "last activity" timestamp.
 * Since messages are no longer in MongoDB, we use conversation.updatedAt
 * which is refreshed after each prompt completes.
 */
async function getLastMessageTime(conversationId) {
  try {
    const conv = await Conversation.findById(conversationId)
      .select("updatedAt")
      .lean();
    return conv ? conv.updatedAt : null;
  } catch {
    return null;
  }
}

/**
 * GET /api/usage/filters
 *
 * Returns the list of users and sub-resources (repositories) available for
 * filtering. Used to populate the dropdown selectors in the UI.
 */
router.get("/filters", async ({ status }) => {
  try {
    const [users, subResources] = await Promise.all([
      User.find({ "account.status": "active" })
        .select("_id profile.display_name profile.avatar_fileId account.username account.email")
        .lean(),
      SubResource.find()
        .select("_id name resource")
        .populate("resource", "name")
        .lean(),
    ]);

    return {
      users: users.map((u) => ({
        _id: u._id,
        displayName:
          u.profile?.display_name ||
          u.account?.username ||
          u.account?.email ||
          "Unknown",
        avatarFileId: u.profile?.avatar_fileId || null,
      })),
      subResources: subResources.map((sr) => ({
        _id: sr._id,
        name: sr.name,
        resourceName: sr.resource?.name || "Unknown",
      })),
    };
  } catch (err) {
    logger.error({ err }, 'error fetching usage filters');
    return status(500, { error: "Failed to fetch usage filters" });
  }
});

/**
 * GET /api/usage
 *
 * Returns aggregated usage data for the admin dashboard.
 *
 * Query params:
 *   - from: ISO date string (default: 7 days ago)
 *   - to:   ISO date string (default: now)
 *   - userId: filter by user (ObjectId)
 *   - subResource: filter by repository/sub-resource (ObjectId)
 */
router.get("/", async ({ query, status }) => {
  const parsed = usageQuerySchema.safeParse(query);
  if (!parsed.success) {
    return status(400, { error: parsed.error.flatten() });
  }

  try {
    const now = new Date();
    const from = parsed.data.from ? new Date(parsed.data.from) : new Date(now - 7 * 24 * 60 * 60 * 1000);
    const to = parsed.data.to ? new Date(parsed.data.to) : now;
    const filterUserId = parsed.data.userId || null;
    const filterSubResource = parsed.data.subResource || null;

    // ── Step 1: Build base match for conversations in date range ──────────
    const baseMatch = {
      createdAt: { $gte: from, $lte: to },
    };

    if (filterSubResource) {
      baseMatch.subResource = new mongoose.Types.ObjectId(filterSubResource);
    }

    // ── Step 2: Get all matching conversations ───────────────────────────
    let conversations = await Conversation.find(baseMatch)
      .select("_id title cost contextUsage subResource pullRequests createdAt updatedAt")
      .populate({
        path: "subResource",
        select: "name resource",
        populate: { path: "resource", select: "name" },
      })
      .lean();

    // ── Step 3: If filtering by user, resolve user ownership per convo ───
    // Also build a map of conversationId -> userId for per-user aggregation
    const convoUserMap = new Map();

    if (filterUserId || true) {
      // We always need user mapping for the per-user cost chart
      await Promise.all(
        conversations.map(async (conv) => {
          const userId = await getConversationUserId(conv._id.toString());
          convoUserMap.set(conv._id.toString(), userId);
        })
      );

      if (filterUserId) {
        const filterOid = filterUserId.toString();
        conversations = conversations.filter((conv) => {
          const uid = convoUserMap.get(conv._id.toString());
          return uid && uid.toString() === filterOid;
        });
      }
    }

    // ── Step 4: Determine active/closed status per conversation ──────────
    let activeCount = 0;
    await Promise.all(
      conversations.map(async (conv) => {
        const lastMsgTime = await getLastMessageTime(conv._id.toString());
        if (lastMsgTime && now - new Date(lastMsgTime) < TWENTY_FOUR_HOURS) {
          activeCount++;
        }
      })
    );

    // ── Step 5: Aggregate KPIs ───────────────────────────────────────────
    const totalCost = conversations.reduce((sum, c) => sum + (c.cost?.total || 0), 0);
    const totalConversations = conversations.length;
    const avgCostPerConversation =
      totalConversations > 0 ? totalCost / totalConversations : 0;

    // ── Step 6: Cost over time (daily buckets) ───────────────────────────
    const dailyCostMap = new Map();
    const dailyConvoMap = new Map();

    for (const conv of conversations) {
      const dayKey = conv.createdAt.toISOString().slice(0, 10); // YYYY-MM-DD
      dailyCostMap.set(dayKey, (dailyCostMap.get(dayKey) || 0) + (conv.cost?.total || 0));
      dailyConvoMap.set(dayKey, (dailyConvoMap.get(dayKey) || 0) + 1);
    }

    // Fill in missing days in the range with zeroes
    const costOverTime = [];
    const conversationsOverTime = [];
    const cursor = new Date(from);
    cursor.setUTCHours(0, 0, 0, 0);
    const endDay = new Date(to);
    endDay.setUTCHours(23, 59, 59, 999);

    while (cursor <= endDay) {
      const dayKey = cursor.toISOString().slice(0, 10);
      costOverTime.push({
        date: dayKey,
        cost: Math.round((dailyCostMap.get(dayKey) || 0) * 10000) / 10000,
      });
      conversationsOverTime.push({
        date: dayKey,
        count: dailyConvoMap.get(dayKey) || 0,
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    // ── Step 7: Cost per user ────────────────────────────────────────────
    const userCostMap = new Map();
    for (const conv of conversations) {
      const userId = convoUserMap.get(conv._id.toString());
      if (!userId) continue;
      const key = userId.toString();
      userCostMap.set(key, (userCostMap.get(key) || 0) + (conv.cost?.total || 0));
    }

    // Resolve user display names (include both conversation owners and PR creators)
    const allUserIds = new Set([...userCostMap.keys()]);
    for (const conv of conversations) {
      for (const pr of (conv.pullRequests || [])) {
        if (pr.createdBy) allUserIds.add(pr.createdBy.toString());
      }
    }
    const userIdsArray = [...allUserIds].map((id) => new mongoose.Types.ObjectId(id));
    const users = userIdsArray.length
      ? await User.find({ _id: { $in: userIdsArray } })
          .select("_id profile.display_name profile.avatar_fileId account.username account.email")
          .lean()
      : [];

    const userNameMap = new Map();
    const userAvatarMap = new Map();
    for (const u of users) {
      userNameMap.set(
        u._id.toString(),
        u.profile?.display_name || u.account?.username || u.account?.email || "Unknown"
      );
      userAvatarMap.set(u._id.toString(), u.profile?.avatar_fileId || null);
    }

    const costPerUser = [...userCostMap.entries()]
      .map(([userId, cost]) => ({
        userId,
        name: userNameMap.get(userId) || "Unknown",
        avatarFileId: userAvatarMap.get(userId) || null,
        cost: Math.round(cost * 10000) / 10000,
      }))
      .sort((a, b) => b.cost - a.cost);

    // ── Step 8: Cost per resource/repo ───────────────────────────────────
    const repoCostMap = new Map();
    const repoNameMap = new Map();
    for (const conv of conversations) {
      if (!conv.subResource) continue;
      // subResource is populated, so extract _id
      const srId = conv.subResource._id ? conv.subResource._id.toString() : conv.subResource.toString();
      repoCostMap.set(srId, (repoCostMap.get(srId) || 0) + (conv.cost?.total || 0));
      // Build name map from populated data if available
      if (conv.subResource._id && !repoNameMap.has(srId)) {
        const sr = conv.subResource;
        const label = sr.resource?.name ? `${sr.resource.name} / ${sr.name}` : sr.name;
        repoNameMap.set(srId, label);
      }
    }

    // For any subResources not yet resolved (unpopulated), fetch them
    const unresolvedRepoIds = [...repoCostMap.keys()].filter((id) => !repoNameMap.has(id));
    if (unresolvedRepoIds.length > 0) {
      const repos = await SubResource.find({ _id: { $in: unresolvedRepoIds.map((id) => new mongoose.Types.ObjectId(id)) } })
        .select("_id name resource")
        .populate("resource", "name")
        .lean();
      for (const r of repos) {
        const label = r.resource?.name ? `${r.resource.name} / ${r.name}` : r.name;
        repoNameMap.set(r._id.toString(), label);
      }
    }

    const costPerResource = [...repoCostMap.entries()]
      .map(([subResourceId, cost]) => ({
        subResourceId,
        name: repoNameMap.get(subResourceId) || "Unknown",
        cost: Math.round(cost * 10000) / 10000,
      }))
      .sort((a, b) => b.cost - a.cost);

    // ── Step 9: Pull request aggregations ────────────────────────────────
    // Collect all PRs from conversations in the date range, bucketed by
    // the PR's own createdAt date (not the conversation's createdAt).
    const dailyPrMap = new Map();
    let totalPullRequests = 0;
    let conversationsWithPRs = 0;

    for (const conv of conversations) {
      const prs = conv.pullRequests || [];
      if (prs.length > 0) conversationsWithPRs++;
      for (const pr of prs) {
        // Only count PRs whose createdAt falls within the date range
        const prDate = new Date(pr.createdAt);
        if (prDate >= from && prDate <= to) {
          totalPullRequests++;
          const dayKey = prDate.toISOString().slice(0, 10);
          dailyPrMap.set(dayKey, (dailyPrMap.get(dayKey) || 0) + 1);
        }
      }
    }

    // Build the daily PR series (reuse the same day range as cost/convos)
    const pullRequestsOverTime = [];
    const prCursor = new Date(from);
    prCursor.setUTCHours(0, 0, 0, 0);
    while (prCursor <= endDay) {
      const dayKey = prCursor.toISOString().slice(0, 10);
      pullRequestsOverTime.push({
        date: dayKey,
        count: dailyPrMap.get(dayKey) || 0,
      });
      prCursor.setUTCDate(prCursor.getUTCDate() + 1);
    }

    // ── Step 10: Build conversations list ───────────────────────────────
    const conversationsList = conversations.map((conv) => {
      const userId = convoUserMap.get(conv._id.toString());
      const uidStr = userId ? userId.toString() : null;
      return {
        _id: conv._id,
        title: conv.title || "New Conversation",
        user: uidStr ? (userNameMap.get(uidStr) || "Unknown") : "Unknown",
        userAvatarFileId: uidStr ? (userAvatarMap.get(uidStr) || null) : null,
        repository: repoNameMap.get(conv.subResource?._id?.toString() || conv.subResource?.toString()) ||
          (conv.subResource?.name || "Unknown"),
        cost: Math.round((conv.cost?.total || 0) * 10000) / 10000,
        pullRequestsCount: (conv.pullRequests || []).length,
        createdAt: conv.createdAt,
      };
    }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // ── Step 11: Build pull requests list ────────────────────────────────
    const pullRequestsList = [];
    for (const conv of conversations) {
      const prs = conv.pullRequests || [];
      for (const pr of prs) {
        const prDate = new Date(pr.createdAt);
        if (prDate >= from && prDate <= to) {
          const createdByName = pr.createdBy
            ? (userNameMap.get(pr.createdBy.toString()) || "Unknown")
            : "Unknown";
          pullRequestsList.push({
            _id: pr._id,
            title: pr.title || "(No title)",
            url: pr.url,
            sourceBranch: pr.sourceBranch || "",
            conversationTitle: conv.title || "New Conversation",
            conversationId: conv._id,
            createdBy: createdByName,
            createdAt: pr.createdAt,
          });
        }
      }
    }
    pullRequestsList.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // ── Response ─────────────────────────────────────────────────────────
    return {
      summary: {
        totalCost: Math.round(totalCost * 10000) / 10000,
        totalConversations,
        avgCostPerConversation: Math.round(avgCostPerConversation * 10000) / 10000,
        activeConversations: activeCount,
        totalPullRequests,
        conversationsWithPRs,
        currency: "USD",
      },
      costOverTime,
      conversationsOverTime,
      pullRequestsOverTime,
      costPerUser,
      costPerResource,
      conversationsList,
      pullRequestsList,
    };
  } catch (err) {
    logger.error({ err }, 'error fetching usage data');
    return status(500, { error: "Failed to fetch usage data" });
  }
});

export default router;
