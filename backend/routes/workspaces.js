import { Elysia } from "elysia";
import Docker from "dockerode";
import { z } from "zod";
import Conversation from "../models/Conversation.js";
import User from "../models/User.js";
import Resource from "../models/Resource.js";
import SubResource from "../models/SubResource.js";
import Workspace from "../models/Workspace.js";
import WorkspaceMember from "../models/WorkspaceMember.js";
import { createConversation } from "../tools/conversation/create.js";
import { destroyConversation } from "../tools/conversation/destroy.js";
import {
  streamPrompt,
  sendPrompt,
  getContainerStatus,
  getSessionMessages,
  getSessionStatuses,
  executeCommand,
  abortSession,
  getProviders,
  getAgents,
  getSessionInfo,
  replyToQuestion,
  rejectQuestion,
  replyToPermission,
} from "../utils/opencodeContainer.js";
import { execInContainer, gitExec } from "../utils/containerExec.js";
import {
  createPullRequest as createBitbucketPR,
  listWorkspaceMembers as listBitbucketWorkspaceMembers,
} from "../utils/attlasian/bitbucket.js";
import {
  createPullRequest as createGithubPR,
  listCollaborators as listGithubCollaborators,
} from "../utils/github/github.js";
import { authPlugin } from "../middleware/auth.js";
import { broadcast } from "../ws.js";
import { addJobToQueue } from "../queue/config.js";

const docker = new Docker();

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const OBJECT_ID_RE = /^[a-fA-F0-9]{24}$/;

const createConversationBody = z.object({
  title: z.string().max(200).optional(),
  repository: z.string().regex(OBJECT_ID_RE, "Invalid repository ID format."),
  subResource: z.string().regex(OBJECT_ID_RE, "Invalid subResource ID format."),
});

const searchConversationsQuery = z.object({
  q: z.string().max(200).optional(),
});

const sendMessageBody = z.object({
  content: z.string().min(1, "Content is required.").max(50000),
  model: z
    .object({
      providerID: z.string(),
      modelID: z.string(),
    })
    .optional(),
  agent: z.string().optional(),
  files: z
    .array(
      z.object({
        fileId: z.string(),
        filename: z.string(),
        contentType: z.string(),
        size: z.number(),
      }),
    )
    .optional(),
});

const promptBody = z.object({
  content: z.string().min(1, "Content is required.").max(50000),
  model: z
    .object({
      providerID: z.string(),
      modelID: z.string(),
    })
    .optional(),
  agent: z.string().optional(),
});

const commandBody = z.object({
  command: z.string().min(1, "Command is required."),
  arguments: z.record(z.unknown()).optional(),
});

const replyToQuestionBody = z.object({
  answers: z.array(z.array(z.string())),
});

const replyToPermissionBody = z.object({
  reply: z.enum(["once", "always", "reject"]),
  message: z.string().optional(),
});

const generateMessageBody = z.object({
  diff: z.string().min(1, "Diff is required."),
});

const commitPushBody = z.object({
  branchName: z
    .string()
    .min(1, "Branch name is required.")
    .max(250)
    .regex(
      /^[a-zA-Z0-9._\-/]+$/,
      "Invalid branch name. Use only alphanumeric characters, dots, hyphens, underscores, and slashes.",
    ),
  commitMessage: z.string().min(1, "Commit message is required.").max(5000),
});

const renameConversationBody = z.object({
  title: z.string().min(1, "Title is required.").max(200).trim(),
});

const createPrBody = z.object({
  title: z.string().min(1, "Title is required.").max(500),
  description: z.string().max(5000).optional().default(""),
  sourceBranch: z.string().min(1, "Source branch is required.").max(250),
  reviewers: z
    .array(z.string().min(1, "Reviewer UUID must not be empty."))
    .max(20, "Maximum 20 reviewers allowed.")
    .optional()
    .default([]),
});

const createWorkspaceBody = z.object({
  name: z.string().min(1, "Name is required.").max(100).trim(),
});

const updateWorkspaceBody = z.object({
  name: z.string().min(1, "Name is required.").max(100).trim(),
});

const addMemberBody = z.object({
  userId: z.string().regex(OBJECT_ID_RE, "Invalid user ID format."),
  role: z.enum(["admin", "member"]).optional().default("member"),
});

const updateMemberBody = z.object({
  role: z.enum(["admin", "member"]),
});

// ─── Helper: validate ObjectId param ──────────────────────────────────────────

function validateObjectId(id) {
  return OBJECT_ID_RE.test(id);
}

// ─── Helper: require workspace membership ─────────────────────────────────────

async function requireMembership(workspaceId, userId, set) {
  if (!OBJECT_ID_RE.test(workspaceId)) {
    set.status = 400;
    return null;
  }
  const workspace = await Workspace.findById(workspaceId);
  if (!workspace) {
    set.status = 404;
    return null;
  }
  const member = await WorkspaceMember.findOne({
    workspace: workspaceId,
    user: userId,
  });
  if (!member) {
    set.status = 404;
    return null;
  }
  return { workspace, member };
}

// ─── Helper: load conversation and verify workspace ownership ─────────────────

async function loadConversation(conversationId, workspaceId, set) {
  if (!OBJECT_ID_RE.test(conversationId)) {
    set.status = 400;
    return null;
  }
  const conversation = await Conversation.findById(conversationId);
  if (
    !conversation ||
    !conversation.workspace ||
    conversation.workspace.toString() !== workspaceId
  ) {
    set.status = 404;
    return null;
  }
  return conversation;
}

// ─── Router ───────────────────────────────────────────────────────────────────

const router = new Elysia({ prefix: "/api/workspaces" })
  .use(authPlugin)

  // ==========================================================================
  // User search (for workspace member invites)
  // ==========================================================================

  // Search users (for workspace member invites)
  .get("/users/search", async ({ query, user, set }) => {
    try {
      const search = query?.q?.trim();
      if (!search || search.length < 2) {
        return [];
      }
      
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(escaped, "i");
      
      const users = await User.find({
        "account.status": "active",
        $or: [
          { "account.email": regex },
          { "account.username": regex },
          { "profile.display_name": regex },
        ],
      })
        .select("account.email account.username profile.display_name")
        .limit(10)
        .lean();
      
      return users;
    } catch (err) {
      console.error("GET /workspaces/users/search error:", err);
      set.status = 500;
      return { error: "Failed to search users." };
    }
  })

  // ==========================================================================
  // Workspace CRUD
  // ==========================================================================

  // List workspaces the current user belongs to
  .get("/", async ({ user, set }) => {
    try {
      const memberships = await WorkspaceMember.find({
        user: user.userId,
      }).lean();
      const workspaceIds = memberships.map((m) => m.workspace);
      const workspaces = await Workspace.find({
        _id: { $in: workspaceIds },
      })
        .sort({ isPersonal: -1, createdAt: 1 })
        .lean();

      // Attach the user's role to each workspace
      const roleMap = {};
      for (const m of memberships) {
        roleMap[m.workspace.toString()] = m.role;
      }
      return workspaces.map((ws) => ({
        ...ws,
        role: roleMap[ws._id.toString()] || "member",
      }));
    } catch (err) {
      set.status = 500;
      return { error: err.message };
    }
  })

  // Create new workspace (user becomes admin)
  .post("/", async ({ body, user, set }) => {
    const parsed = createWorkspaceBody.safeParse(body);
    if (!parsed.success) {
      set.status = 400;
      return { error: parsed.error.flatten() };
    }

    try {
      const workspace = await Workspace.create({
        name: parsed.data.name,
        owner: user.userId,
        isPersonal: false,
      });

      await WorkspaceMember.create({
        workspace: workspace._id,
        user: user.userId,
        role: "admin",
      });

      return workspace;
    } catch (err) {
      set.status = 500;
      return { error: err.message };
    }
  })

  // Get workspace details (member only)
  .get("/:wid", async ({ params, user, set }) => {
    const membership = await requireMembership(params.wid, user.userId, set);
    if (!membership) return { error: "Not found" };

    try {
      return {
        ...membership.workspace.toObject(),
        role: membership.member.role,
      };
    } catch (err) {
      set.status = 500;
      return { error: err.message };
    }
  })

  // Update workspace name (admin only)
  .put("/:wid", async ({ params, body, user, set }) => {
    const membership = await requireMembership(params.wid, user.userId, set);
    if (!membership) return { error: "Not found" };

    if (membership.member.role !== "admin") {
      set.status = 403;
      return { error: "Admin access required" };
    }

    const parsed = updateWorkspaceBody.safeParse(body);
    if (!parsed.success) {
      set.status = 400;
      return { error: parsed.error.flatten() };
    }

    try {
      const updated = await Workspace.findByIdAndUpdate(
        params.wid,
        { name: parsed.data.name },
        { new: true },
      );
      return updated;
    } catch (err) {
      set.status = 500;
      return { error: err.message };
    }
  })

  // Delete workspace (admin only, not personal)
  .delete("/:wid", async ({ params, user, set }) => {
    const membership = await requireMembership(params.wid, user.userId, set);
    if (!membership) return { error: "Not found" };

    if (membership.member.role !== "admin") {
      set.status = 403;
      return { error: "Admin access required" };
    }

    if (membership.workspace.isPersonal) {
      set.status = 400;
      return { error: "Cannot delete personal workspace" };
    }

    try {
      await WorkspaceMember.deleteMany({ workspace: params.wid });
      await Workspace.findByIdAndDelete(params.wid);
      return { success: true };
    } catch (err) {
      set.status = 500;
      return { error: err.message };
    }
  })

  // ==========================================================================
  // Workspace Member Management
  // ==========================================================================

  // List members (member only)
  .get("/:wid/members", async ({ params, user, set }) => {
    const membership = await requireMembership(params.wid, user.userId, set);
    if (!membership) return { error: "Not found" };

    try {
      const members = await WorkspaceMember.find({
        workspace: params.wid,
      })
        .populate(
          "user",
          "profile.display_name profile.avatar_fileId account.username account.email",
        )
        .lean();
      return members;
    } catch (err) {
      set.status = 500;
      return { error: err.message };
    }
  })

  // Add member by userId (admin only)
  .post("/:wid/members", async ({ params, body, user, set }) => {
    const membership = await requireMembership(params.wid, user.userId, set);
    if (!membership) return { error: "Not found" };

    if (membership.member.role !== "admin") {
      set.status = 403;
      return { error: "Admin access required" };
    }

    const parsed = addMemberBody.safeParse(body);
    if (!parsed.success) {
      set.status = 400;
      return { error: parsed.error.flatten() };
    }

    try {
      // Check user exists
      const targetUser = await User.findById(parsed.data.userId);
      if (!targetUser) {
        set.status = 404;
        return { error: "User not found" };
      }

      // Check not already a member
      const existing = await WorkspaceMember.findOne({
        workspace: params.wid,
        user: parsed.data.userId,
      });
      if (existing) {
        set.status = 409;
        return { error: "User is already a member of this workspace" };
      }

      const member = await WorkspaceMember.create({
        workspace: params.wid,
        user: parsed.data.userId,
        role: parsed.data.role,
      });

      return member;
    } catch (err) {
      set.status = 500;
      return { error: err.message };
    }
  })

  // Change member role (admin only)
  .put("/:wid/members/:userId", async ({ params, body, user, set }) => {
    const membership = await requireMembership(params.wid, user.userId, set);
    if (!membership) return { error: "Not found" };

    if (membership.member.role !== "admin") {
      set.status = 403;
      return { error: "Admin access required" };
    }

    if (!validateObjectId(params.userId)) {
      set.status = 400;
      return { error: "Invalid user ID format" };
    }

    const parsed = updateMemberBody.safeParse(body);
    if (!parsed.success) {
      set.status = 400;
      return { error: parsed.error.flatten() };
    }

    try {
      const targetMember = await WorkspaceMember.findOne({
        workspace: params.wid,
        user: params.userId,
      });
      if (!targetMember) {
        set.status = 404;
        return { error: "Member not found" };
      }

      targetMember.role = parsed.data.role;
      await targetMember.save();
      return targetMember;
    } catch (err) {
      set.status = 500;
      return { error: err.message };
    }
  })

  // Remove member (admin only)
  .delete("/:wid/members/:userId", async ({ params, user, set }) => {
    const membership = await requireMembership(params.wid, user.userId, set);
    if (!membership) return { error: "Not found" };

    if (membership.member.role !== "admin") {
      set.status = 403;
      return { error: "Admin access required" };
    }

    if (!validateObjectId(params.userId)) {
      set.status = 400;
      return { error: "Invalid user ID format" };
    }

    try {
      const result = await WorkspaceMember.findOneAndDelete({
        workspace: params.wid,
        user: params.userId,
      });
      if (!result) {
        set.status = 404;
        return { error: "Member not found" };
      }
      return { success: true };
    } catch (err) {
      set.status = 500;
      return { error: err.message };
    }
  })

  // Leave workspace (any member, but not sole admin)
  .post("/:wid/leave", async ({ params, user, set }) => {
    const membership = await requireMembership(params.wid, user.userId, set);
    if (!membership) return { error: "Not found" };

    try {
      // If user is admin, check there's at least one other admin
      if (membership.member.role === "admin") {
        const adminCount = await WorkspaceMember.countDocuments({
          workspace: params.wid,
          role: "admin",
        });
        if (adminCount <= 1) {
          set.status = 400;
          return {
            error:
              "Cannot leave: you are the only admin. Promote another member first or delete the workspace.",
          };
        }
      }

      await WorkspaceMember.findByIdAndDelete(membership.member._id);
      return { success: true };
    } catch (err) {
      set.status = 500;
      return { error: err.message };
    }
  })

  // ==========================================================================
  // Conversation Routes (nested under /:wid/conversations)
  // ==========================================================================

  // Create new conversation
  .post("/:wid/conversations", async ({ params, body, user, set }) => {
    const membership = await requireMembership(params.wid, user.userId, set);
    if (!membership) return { error: "Not found" };

    const parsed = createConversationBody.safeParse(body);
    if (!parsed.success) {
      set.status = 400;
      return { error: parsed.error.flatten() };
    }

    try {
      const { title, repository, subResource } = parsed.data;

      // Check if repository exists and is of type 'bitbucket'
      const resourceDoc = await Resource.findById(repository);
      if (!resourceDoc) {
        set.status = 404;
        return { error: "resource-not-found" };
      }

      if (!["bitbucket", "github"].includes(resourceDoc.provider)) {
        set.status = 400;
        return { error: "Resource must be of type bitbucket or github" };
      }

      // Check if subResource exists and belongs to the given resource
      const subResourceDoc = await SubResource.findById(subResource);
      if (!subResourceDoc) {
        set.status = 404;
        return { error: "subresource-not-found" };
      }

      if (subResourceDoc.resource.toString() !== repository) {
        set.status = 400;
        return {
          error: "SubResource does not belong to the specified resource",
        };
      }

      if (
        !["bitbucket-repository", "github-repository"].includes(
          subResourceDoc.type,
        )
      ) {
        set.status = 400;
        return {
          error:
            "SubResource must be of type bitbucket-repository or github-repository",
        };
      }

      // Create conversation (seed creator as first participant)
      const conversation = new Conversation({
        title: title || "New Conversation",
        createdBy: user.userId,
        participants: [user.userId],
        repository: repository,
        subResource: subResource,
        workspace: params.wid,
      });
      await conversation.save();

      // Trigger BullMQ job for conversation setup
      await createConversation(conversation._id, repository, subResource);

      return conversation;
    } catch (err) {
      set.status = 500;
      return { error: err.message };
    }
  })

  // Create conversation by repository name (used by /start#<repoName> links)
  .post(
    "/:wid/conversations/start-by-name",
    async ({ params, body, user, set }) => {
      const membership = await requireMembership(params.wid, user.userId, set);
      if (!membership) return { error: "Not found" };

      const { name } = body || {};
      if (!name || typeof name !== "string" || !name.trim()) {
        set.status = 400;
        return { error: "Repository name is required." };
      }

      try {
        // Find the subresource by name (case-insensitive), must be an enabled repository
        const subResourceDoc = await SubResource.findOne({
          name: {
            $regex: new RegExp(
              `^${name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
              "i",
            ),
          },
          type: { $in: ["bitbucket-repository", "github-repository"] },
          "rearch.enabled": true,
        }).populate("resource");

        if (!subResourceDoc) {
          set.status = 404;
          return { error: "repository-not-found" };
        }

        if (
          !subResourceDoc.resource ||
          !["bitbucket", "github"].includes(subResourceDoc.resource.provider)
        ) {
          set.status = 400;
          return { error: "Resource must be of type bitbucket or github" };
        }

        const repositoryId = subResourceDoc.resource._id.toString();
        const subResourceId = subResourceDoc._id.toString();

        // Create conversation
        const conversation = new Conversation({
          title: "New Conversation",
          createdBy: user.userId,
          participants: [user.userId],
          repository: repositoryId,
          subResource: subResourceId,
          workspace: params.wid,
        });
        await conversation.save();

        // Trigger BullMQ job for conversation setup
        await createConversation(conversation._id, repositoryId, subResourceId);

        return conversation;
      } catch (err) {
        set.status = 500;
        return { error: err.message };
      }
    },
  )

  // Search conversations in workspace
  .get(
    "/:wid/conversations/search",
    async ({ params, query, user, set }) => {
      const membership = await requireMembership(params.wid, user.userId, set);
      if (!membership) return { error: "Not found" };

      const parsed = searchConversationsQuery.safeParse(query);
      if (!parsed.success) {
        set.status = 400;
        return { error: parsed.error.flatten() };
      }

      try {
        const { q } = parsed.data;
        if (!q || !q.trim()) {
          return [];
        }
        const conversations = await Conversation.find({
          workspace: params.wid,
          title: { $regex: q.trim(), $options: "i" },
        })
          .sort({ createdAt: -1 })
          .populate("subResource", "name");
        return conversations;
      } catch (err) {
        set.status = 500;
        return { error: err.message };
      }
    },
  )

  // Get all conversations in workspace
  .get("/:wid/conversations", async ({ params, user, set }) => {
    const membership = await requireMembership(params.wid, user.userId, set);
    if (!membership) return { error: "Not found" };

    try {
      const conversations = await Conversation.find({
        workspace: params.wid,
      })
        .sort({ createdAt: -1 })
        .populate("subResource", "name");

      // Fetch session statuses for running conversations (busy/idle)
      let statusMap = {};
      try {
        statusMap = await getSessionStatuses(conversations);
      } catch (err) {
        console.error("Error fetching session statuses:", err.message);
      }

      // Enrich each conversation with sessionStatus and hasUnread
      const enriched = conversations.map((conv) => {
        const obj = conv.toObject();
        const convId = conv._id.toString();

        // Session status: "busy", "idle", or null
        obj.sessionStatus = statusMap[convId] || null;

        // Unread detection: compare user's lastReadBy.at against updatedAt
        const readEntry = (conv.lastReadBy || []).find(
          (entry) => entry.user?.toString() === user.userId,
        );
        if (readEntry) {
          obj.hasUnread = conv.updatedAt > readEntry.at;
        } else {
          // Never read: unread only if conversation has been updated since creation
          // (i.e., there has been activity beyond the initial creation)
          const createdMs = conv.createdAt?.getTime() || 0;
          const updatedMs = conv.updatedAt?.getTime() || 0;
          obj.hasUnread = updatedMs - createdMs > 1000; // >1s delta means real activity
        }

        return obj;
      });

      return enriched;
    } catch (err) {
      set.status = 500;
      return { error: err.message };
    }
  })

  // Get conversation details
  .get("/:wid/conversations/:id", async ({ params, user, set }) => {
    const membership = await requireMembership(params.wid, user.userId, set);
    if (!membership) return { error: "Not found" };

    const conversation = await loadConversation(params.id, params.wid, set);
    if (!conversation) return { error: "Not found" };

    try {
      let conv = await Conversation.findById(params.id).populate(
        "participants",
        "profile.display_name profile.avatar_fileId account.username account.email",
      );
      if (!conv) {
        set.status = 404;
        return { error: "Conversation not found" };
      }

      // Reconcile container status: if stored as "running", verify against
      // actual Docker state and update MongoDB if the container has stopped.
      if (conv.environment?.status === "running") {
        const reconciledStatus = await getContainerStatus(params.id);

        if (reconciledStatus.containerStatus !== "running") {
          // Status was corrected in MongoDB by getContainerStatus — reload
          conv = await Conversation.findById(params.id).populate(
            "participants",
            "profile.display_name profile.avatar_fileId account.username account.email",
          );
        }
      }

      return conv;
    } catch (err) {
      set.status = 500;
      return { error: err.message };
    }
  })

  // Get messages for a conversation (from OpenCode session)
  .get("/:wid/conversations/:id/messages", async ({ params, user, set }) => {
    const membership = await requireMembership(params.wid, user.userId, set);
    if (!membership) return { error: "Not found" };

    const conversation = await loadConversation(params.id, params.wid, set);
    if (!conversation) return { error: "Not found" };

    try {
      // Auto-restart stopped/errored containers when user opens the conversation
      const envStatus = conversation.environment?.status;
      if (envStatus === "stopped" || envStatus === "error") {
        conversation.environment = {
          ...conversation.environment,
          status: "starting",
          statusChangedAt: new Date(),
          errorMessage: null,
        };
        await conversation.save();
        broadcast("conversation.environment.status", {
          conversationId: params.id,
          status: "starting",
        });
        await addJobToQueue("conversations", "restart-conversation", {
          conversationId: params.id,
          repositoryId: conversation.repository.toString(),
          subResourceId: conversation.subResource.toString(),
        });
      }

      let messages = [];

      if (
        conversation.environment?.opencodeUrl &&
        conversation.environment?.status === "running"
      ) {
        try {
          const opencodeMessages = await getSessionMessages(params.id);
          messages = opencodeMessages || [];
        } catch (err) {
          console.log("Could not fetch messages from OpenCode:", err.message);
        }
      }

      // Side effect: mark conversation as read for the requesting user
      const userId = user.userId;
      const existingEntry = (conversation.lastReadBy || []).find(
        (entry) => entry.user?.toString() === userId,
      );
      if (existingEntry) {
        await Conversation.updateOne(
          { _id: params.id, "lastReadBy.user": userId },
          { $set: { "lastReadBy.$.at": new Date() } },
        );
      } else {
        await Conversation.updateOne(
          { _id: params.id },
          { $push: { lastReadBy: { user: userId, at: new Date() } } },
        );
      }

      return messages;
    } catch (err) {
      set.status = 500;
      return { error: err.message };
    }
  })

  // Rename conversation
  .patch(
    "/:wid/conversations/:id",
    async ({ params, body, user, set }) => {
      const membership = await requireMembership(params.wid, user.userId, set);
      if (!membership) return { error: "Not found" };

      const conv = await loadConversation(params.id, params.wid, set);
      if (!conv) return { error: "Not found" };

      const parsed = renameConversationBody.safeParse(body);
      if (!parsed.success) {
        set.status = 400;
        return { error: parsed.error.errors.map((e) => e.message).join(", ") };
      }

      try {
        const conversation = await Conversation.findByIdAndUpdate(
          params.id,
          { title: parsed.data.title },
          { new: true },
        );
        if (!conversation) {
          set.status = 404;
          return { error: "Conversation not found" };
        }
        return conversation;
      } catch (err) {
        set.status = 500;
        return { error: err.message };
      }
    },
  )

  // Delete conversation (soft-delete + async container cleanup)
  .delete("/:wid/conversations/:id", async ({ params, user, set }) => {
    const membership = await requireMembership(params.wid, user.userId, set);
    if (!membership) return { error: "Not found" };

    const conv = await loadConversation(params.id, params.wid, set);
    if (!conv) return { error: "Not found" };

    try {
      await conv.delete(user.userId);

      // Enqueue async container cleanup job
      await destroyConversation(params.id);

      return { success: true };
    } catch (err) {
      set.status = 500;
      return { error: err.message };
    }
  })

  // Send message and get AI response (streaming via OpenCode agent)
  .post(
    "/:wid/conversations/:id/messages",
    async ({ params, body, user, set }) => {
      console.log("Handler triggered");

      const membership = await requireMembership(params.wid, user.userId, set);
      if (!membership) return { error: "Not found" };

      const conv = await loadConversation(params.id, params.wid, set);
      if (!conv) return { error: "Not found" };

      const parsed = sendMessageBody.safeParse(body);
      if (!parsed.success) {
        set.status = 400;
        return { error: parsed.error.flatten() };
      }

      console.log("Validation success");

      const { content, model, agent, files } = parsed.data;
      const conversationId = params.id;

      // Check if container is ready
      const status = await getContainerStatus(conversationId);

      console.log("Container status", status.containerStatus);

      if (status.containerStatus !== "running") {
        set.status = 503;
        return {
          error: "Container not ready",
          status: status.containerStatus,
          message:
            status.errorMessage ||
            "Container is not in running state. Please wait for the conversation environment to be ready.",
        };
      }

      console.log("Server healthy", status.serverHealthy);

      if (!status.serverHealthy) {
        set.status = 503;
        return {
          error: "OpenCode server not healthy",
          healthCheckError: status.healthCheckError,
        };
      }

      // Track this user as a participant (upsert-style, no duplicates)
      await Conversation.findByIdAndUpdate(conversationId, {
        $addToSet: { participants: user.userId },
      });

      console.log("Ensured user is part of conversation");

      // AbortController lets us tear down the SSE subscription to the OpenCode
      // container when the client disconnects or the stream ends.
      const streamAbortController = new AbortController();

      // Stream events from OpenCode agent via SSE
      let streamClosed = false;
      const stream = new ReadableStream({
        async start(controller) {
          const safeEnqueue = (chunk) => {
            if (!streamClosed) controller.enqueue(chunk);
          };
          const safeClose = () => {
            if (!streamClosed) {
              streamClosed = true;
              controller.close();
            }
          };

          try {
            const eventStream = streamPrompt(conversationId, content, {
              model,
              agent,
              files,
              userId: user.userId,
              signal: streamAbortController.signal,
            });

            for await (const event of eventStream) {
              safeEnqueue(`data: ${JSON.stringify(event)}\n\n`);
            }

            safeEnqueue(`data: ${JSON.stringify({ type: "done" })}\n\n`);
            safeClose();
          } catch (err) {
            console.error("Error:", err);
            if (!streamClosed) {
              streamClosed = true;
              controller.enqueue(
                `data: ${JSON.stringify({ type: "error", error: err.message })}\n\n`,
              );
              controller.close();
            }
          }
        },
        cancel() {
          streamClosed = true;
          // Client disconnected — abort the SSE subscription so the generator
          // and all underlying fetch connections are cleaned up immediately.
          streamAbortController.abort();
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    },
  )

  // ============================================================================
  // OpenCode Agent Control Endpoints
  // ============================================================================

  /**
   * Reply to a question asked by the OpenCode agent
   * POST /:wid/conversations/:id/question/:requestId/reply
   * Body: { answers: Array<Array<string>> }
   */
  .post(
    "/:wid/conversations/:id/question/:requestId/reply",
    async ({ params, body, user, set }) => {
      const membership = await requireMembership(params.wid, user.userId, set);
      if (!membership) return { error: "Not found" };

      const conv = await loadConversation(params.id, params.wid, set);
      if (!conv) return { error: "Not found" };

      const parsed = replyToQuestionBody.safeParse(body);
      if (!parsed.success) {
        set.status = 400;
        return { error: parsed.error.flatten() };
      }

      try {
        const { id: conversationId, requestId } = params;
        const { answers } = parsed.data;

        // Check if container is ready
        const status = await getContainerStatus(conversationId);
        if (status.containerStatus !== "running" || !status.serverHealthy) {
          set.status = 503;
          return {
            error: "Agent not available",
            containerStatus: status.containerStatus,
            serverHealthy: status.serverHealthy,
          };
        }

        const result = await replyToQuestion(
          conversationId,
          requestId,
          answers,
        );
        return { success: true, data: result };
      } catch (err) {
        console.error("Error replying to question:", err);
        set.status = 500;
        return { error: err.message };
      }
    },
  )

  /**
   * Reject (dismiss) a question asked by the OpenCode agent
   * POST /:wid/conversations/:id/question/:requestId/reject
   */
  .post(
    "/:wid/conversations/:id/question/:requestId/reject",
    async ({ params, user, set }) => {
      const membership = await requireMembership(params.wid, user.userId, set);
      if (!membership) return { error: "Not found" };

      const conv = await loadConversation(params.id, params.wid, set);
      if (!conv) return { error: "Not found" };

      try {
        const { id: conversationId, requestId } = params;

        // Check if container is ready
        const status = await getContainerStatus(conversationId);
        if (status.containerStatus !== "running" || !status.serverHealthy) {
          set.status = 503;
          return {
            error: "Agent not available",
            containerStatus: status.containerStatus,
            serverHealthy: status.serverHealthy,
          };
        }

        const result = await rejectQuestion(conversationId, requestId);
        return { success: true, data: result };
      } catch (err) {
        console.error("Error rejecting question:", err);
        set.status = 500;
        return { error: err.message };
      }
    },
  )

  /**
   * Reply to a permission request from the OpenCode agent
   * POST /:wid/conversations/:id/permission/:requestId/reply
   * Body: { reply: "once" | "always" | "reject", message?: string }
   */
  .post(
    "/:wid/conversations/:id/permission/:requestId/reply",
    async ({ params, body, user, set }) => {
      const membership = await requireMembership(params.wid, user.userId, set);
      if (!membership) return { error: "Not found" };

      const conv = await loadConversation(params.id, params.wid, set);
      if (!conv) return { error: "Not found" };

      const parsed = replyToPermissionBody.safeParse(body);
      if (!parsed.success) {
        set.status = 400;
        return { error: parsed.error.flatten() };
      }

      try {
        const { id: conversationId, requestId } = params;
        const { reply, message } = parsed.data;

        // Check if container is ready
        const status = await getContainerStatus(conversationId);
        if (status.containerStatus !== "running" || !status.serverHealthy) {
          set.status = 503;
          return {
            error: "Agent not available",
            containerStatus: status.containerStatus,
            serverHealthy: status.serverHealthy,
          };
        }

        const result = await replyToPermission(
          conversationId,
          requestId,
          reply,
          message,
        );
        return { success: true, data: result };
      } catch (err) {
        console.error("Error replying to permission:", err);
        set.status = 500;
        return { error: err.message };
      }
    },
  )

  // ============================================================================
  // OpenCode Container Data Endpoints
  // ============================================================================

  /**
   * Get available providers and models from the conversation's container
   * GET /:wid/conversations/:id/providers
   */
  .get(
    "/:wid/conversations/:id/providers",
    async ({ params, user, set }) => {
      const membership = await requireMembership(params.wid, user.userId, set);
      if (!membership) return { error: "Not found" };

      const conv = await loadConversation(params.id, params.wid, set);
      if (!conv) return { error: "Not found" };

      try {
        const conversationId = params.id;

        // Check if container is ready
        const status = await getContainerStatus(conversationId);
        if (status.containerStatus !== "running" || !status.serverHealthy) {
          set.status = 503;
          return {
            error: "Container not ready",
            containerStatus: status.containerStatus,
            serverHealthy: status.serverHealthy,
          };
        }

        const providers = await getProviders(conversationId);
        return providers;
      } catch (err) {
        console.error("Error getting providers:", err);
        set.status = 500;
        return { error: err.message };
      }
    },
  )

  /**
   * Get available agents from the conversation's container
   * GET /:wid/conversations/:id/agents
   */
  .get(
    "/:wid/conversations/:id/agents",
    async ({ params, user, set }) => {
      const membership = await requireMembership(params.wid, user.userId, set);
      if (!membership) return { error: "Not found" };

      const conv = await loadConversation(params.id, params.wid, set);
      if (!conv) return { error: "Not found" };

      try {
        const conversationId = params.id;

        // Check if container is ready
        const status = await getContainerStatus(conversationId);
        if (status.containerStatus !== "running" || !status.serverHealthy) {
          set.status = 503;
          return {
            error: "Container not ready",
            containerStatus: status.containerStatus,
            serverHealthy: status.serverHealthy,
          };
        }

        const agents = await getAgents(conversationId);
        return agents;
      } catch (err) {
        console.error("Error getting agents:", err);
        set.status = 500;
        return { error: err.message };
      }
    },
  )

  /**
   * Get session info (repo name, context window usage, cost)
   * GET /:wid/conversations/:id/session-info
   */
  .get(
    "/:wid/conversations/:id/session-info",
    async ({ params, user, set }) => {
      const membership = await requireMembership(params.wid, user.userId, set);
      if (!membership) return { error: "Not found" };

      const conv = await loadConversation(params.id, params.wid, set);
      if (!conv) return { error: "Not found" };

      try {
        const conversationId = params.id;
        const info = await getSessionInfo(conversationId);
        return info;
      } catch (err) {
        console.error("Error getting session info:", err);
        set.status = 500;
        return { error: err.message };
      }
    },
  )

  /**
   * Get available services for a conversation's running container
   * GET /:wid/conversations/:id/services
   */
  .get(
    "/:wid/conversations/:id/services",
    async ({ params, user, set }) => {
      const membership = await requireMembership(params.wid, user.userId, set);
      if (!membership) return { error: "Not found" };

      const conversation = await loadConversation(params.id, params.wid, set);
      if (!conversation) return { error: "Not found" };

      try {
        const conversationId = params.id;

        // Container must be running
        if (
          conversation.environment?.status !== "running" ||
          !conversation.environment?.container
        ) {
          return { services: [] };
        }

        // Get the SubResource's rearch.services definitions
        const subResource = await SubResource.findById(
          conversation.subResource,
        );
        const rearchServices = subResource?.rearch?.services || [];

        if (rearchServices.length === 0) {
          return { services: [] };
        }

        // Inspect the running Docker container to get actual port mappings
        let ports;
        try {
          const container = docker.getContainer(
            conversation.environment.container,
          );
          const containerInfo = await container.inspect();
          ports = containerInfo.NetworkSettings.Ports || {};
        } catch (dockerError) {
          console.error("Error inspecting container:", dockerError.message);
          return { services: [] };
        }

        // Join service definitions with live port mappings.
        const services = rearchServices
          .map((service) => {
            const portKey = `${service.internalPort}/tcp`;
            const bindings = ports[portKey];
            const hostPort = bindings?.[0]?.HostPort
              ? parseInt(bindings[0].HostPort, 10)
              : null;

            if (!hostPort) return null;

            return {
              label: service.label,
              icon: service.icon || "Widgets",
              internalPort: service.internalPort,
              hostPort,
              url: `http://localhost:${hostPort}`,
            };
          })
          .filter(Boolean);

        return { services };
      } catch (err) {
        console.error("Error getting services:", err);
        set.status = 500;
        return { error: err.message };
      }
    },
  )

  // ============================================================================
  // Git Operations Endpoints
  // ============================================================================

  /**
   * Get changed files with line counts from inside a conversation's container
   * GET /:wid/conversations/:id/git-files
   */
  .get(
    "/:wid/conversations/:id/git-files",
    async ({ params, user, set }) => {
      const membership = await requireMembership(params.wid, user.userId, set);
      if (!membership) return { error: "Not found" };

      const conversation = await loadConversation(params.id, params.wid, set);
      if (!conversation) return { error: "Not found" };

      try {
        const conversationId = params.id;

        if (
          conversation.environment?.status !== "running" ||
          !conversation.environment?.container
        ) {
          return { files: [] };
        }

        const containerId = conversation.environment.container;

        // git diff --numstat HEAD shows: additions \t deletions \t filename
        const [numstatResult, untrackedResult] = await Promise.all([
          gitExec(containerId, "diff --numstat HEAD"),
          gitExec(containerId, "ls-files --others --exclude-standard"),
        ]);

        const files = [];

        // Parse numstat output for tracked changed files
        if (numstatResult.exitCode === 0 && numstatResult.stdout) {
          for (const line of numstatResult.stdout.split("\n").filter(Boolean)) {
            const parts = line.split("\t");
            if (parts.length >= 3) {
              const added =
                parts[0] === "-" ? 0 : parseInt(parts[0], 10) || 0;
              const deleted =
                parts[1] === "-" ? 0 : parseInt(parts[1], 10) || 0;
              const filename = parts.slice(2).join("\t");
              files.push({ filename, added, deleted });
            }
          }
        }

        // Count lines for untracked (new) files
        if (untrackedResult.exitCode === 0 && untrackedResult.stdout) {
          const untrackedFiles = untrackedResult.stdout
            .split("\n")
            .filter(Boolean);
          for (const filename of untrackedFiles.slice(0, 50)) {
            try {
              const wcResult = await execInContainer(
                containerId,
                `wc -l < "${filename}"`,
              );
              const lineCount =
                wcResult.exitCode === 0
                  ? parseInt(wcResult.stdout, 10) || 0
                  : 0;
              files.push({
                filename,
                added: lineCount,
                deleted: 0,
                isNew: true,
              });
            } catch {
              files.push({ filename, added: 0, deleted: 0, isNew: true });
            }
          }
        }

        return { files };
      } catch (err) {
        console.error("Error getting git files:", err);
        set.status = 500;
        return { error: err.message };
      }
    },
  )

  /**
   * Get the git diff from inside a conversation's container
   * GET /:wid/conversations/:id/git-diff
   */
  .get(
    "/:wid/conversations/:id/git-diff",
    async ({ params, user, set }) => {
      const membership = await requireMembership(params.wid, user.userId, set);
      if (!membership) return { error: "Not found" };

      const conversation = await loadConversation(params.id, params.wid, set);
      if (!conversation) return { error: "Not found" };

      try {
        if (
          conversation.environment?.status !== "running" ||
          !conversation.environment?.container
        ) {
          set.status = 503;
          return { error: "Container not running" };
        }

        const containerId = conversation.environment.container;

        // Get both staged and unstaged diff, plus untracked files
        const [diffResult, untrackedResult, statusResult] = await Promise.all([
          gitExec(containerId, "diff HEAD"),
          gitExec(containerId, "ls-files --others --exclude-standard"),
          gitExec(containerId, "status --porcelain"),
        ]);

        // For untracked files, get their content as a pseudo-diff
        let untrackedDiff = "";
        if (untrackedResult.exitCode === 0 && untrackedResult.stdout) {
          const untrackedFiles = untrackedResult.stdout
            .split("\n")
            .filter(Boolean);
          for (const file of untrackedFiles.slice(0, 50)) {
            try {
              const contentResult = await execInContainer(
                containerId,
                `cat "${file}"`,
              );
              if (contentResult.exitCode === 0) {
                const lines = contentResult.stdout.split("\n");
                untrackedDiff += `\ndiff --git a/${file} b/${file}\nnew file mode 100644\n--- /dev/null\n+++ b/${file}\n@@ -0,0 +1,${lines.length} @@\n`;
                untrackedDiff += lines.map((l) => `+${l}`).join("\n") + "\n";
              }
            } catch {
              // Skip files we can't read
            }
          }
        }

        const fullDiff = (diffResult.stdout || "") + untrackedDiff;

        return {
          diff: fullDiff,
          status: statusResult.stdout || "",
          hasChanges: !!statusResult.stdout?.trim(),
        };
      } catch (err) {
        console.error("Error getting git diff:", err);
        set.status = 500;
        return { error: err.message };
      }
    },
  )

  /**
   * Get the diff for a single file inside a conversation's container
   * POST /:wid/conversations/:id/git-diff-file
   * Body: { filename: string }
   */
  .post(
    "/:wid/conversations/:id/git-diff-file",
    async ({ params, body, user, set }) => {
      const membership = await requireMembership(params.wid, user.userId, set);
      if (!membership) return { error: "Not found" };

      const conversation = await loadConversation(params.id, params.wid, set);
      if (!conversation) return { error: "Not found" };

      try {
        const conversationId = params.id;
        const filename = body?.filename;

        if (!filename) {
          set.status = 400;
          return { error: "Filename is required" };
        }

        if (
          conversation.environment?.status !== "running" ||
          !conversation.environment?.container
        ) {
          set.status = 503;
          return { error: "Container not running" };
        }

        const containerId = conversation.environment.container;

        // Detect language from extension
        const ext = filename.split(".").pop().toLowerCase();
        const languageMap = {
          js: "javascript",
          jsx: "javascript",
          ts: "typescript",
          tsx: "typescript",
          py: "python",
          rb: "ruby",
          java: "java",
          go: "go",
          rs: "rust",
          cpp: "cpp",
          cc: "cpp",
          c: "c",
          h: "c",
          cs: "csharp",
          html: "html",
          htm: "html",
          xml: "xml",
          json: "json",
          yaml: "yaml",
          yml: "yaml",
          toml: "toml",
          md: "markdown",
          sh: "shell",
          bash: "shell",
          zsh: "shell",
          css: "css",
          scss: "scss",
          sass: "scss",
          less: "less",
          sql: "sql",
          php: "php",
          swift: "swift",
          kt: "kotlin",
          kts: "kotlin",
          dockerfile: "dockerfile",
          tf: "hcl",
          hcl: "hcl",
        };
        const language = languageMap[ext] || "plaintext";

        // Check if this is a new (untracked) file
        const untrackedResult = await gitExec(
          containerId,
          `ls-files --others --exclude-standard "${filename}"`,
        );
        const isNew =
          untrackedResult.exitCode === 0 &&
          untrackedResult.stdout.trim().length > 0;

        // Check if this is a deleted file
        const statusResult = await gitExec(
          containerId,
          `status --porcelain "${filename}"`,
        );
        const statusLine = statusResult.stdout?.trim() || "";
        const isDeleted =
          statusLine.startsWith("D") || statusLine.startsWith(" D");

        let original = "";
        let modified = "";

        if (isNew) {
          // New untracked file: original is empty, modified is current content
          original = "";
          const contentResult = await execInContainer(
            containerId,
            `cat "${filename}"`,
          );
          if (contentResult.exitCode === 0) {
            // Check for binary content
            if (contentResult.stdout.includes("\0")) {
              return {
                original: "",
                modified: "",
                filename,
                language,
                isBinary: true,
              };
            }
            modified = contentResult.stdout;
          }
        } else if (isDeleted) {
          // Deleted file: original is HEAD content, modified is empty
          const headResult = await gitExec(
            containerId,
            `show HEAD:"${filename}"`,
          );
          if (headResult.exitCode === 0) {
            original = headResult.stdout;
          }
          modified = "";
        } else {
          // Modified tracked file: get both HEAD and working tree versions
          const [headResult, currentResult] = await Promise.all([
            gitExec(containerId, `show HEAD:"${filename}"`),
            execInContainer(containerId, `cat "${filename}"`),
          ]);

          if (headResult.exitCode === 0) {
            if (headResult.stdout.includes("\0")) {
              return {
                original: "",
                modified: "",
                filename,
                language,
                isBinary: true,
              };
            }
            original = headResult.stdout;
          }
          if (currentResult.exitCode === 0) {
            modified = currentResult.stdout;
          }
        }

        return { original, modified, filename, language, isBinary: false };
      } catch (err) {
        console.error("Error getting file diff:", err);
        set.status = 500;
        return { error: err.message };
      }
    },
  )

  /**
   * Commit and push changes from inside the container to a new branch
   * POST /:wid/conversations/:id/git-commit-push
   * Body: { branchName: string, commitMessage: string }
   */
  .post(
    "/:wid/conversations/:id/git-commit-push",
    async ({ params, body, user, set }) => {
      const membership = await requireMembership(params.wid, user.userId, set);
      if (!membership) return { error: "Not found" };

      const conversation = await loadConversation(params.id, params.wid, set);
      if (!conversation) return { error: "Not found" };

      const parsed = commitPushBody.safeParse(body);
      if (!parsed.success) {
        set.status = 400;
        return { error: parsed.error.flatten() };
      }

      try {
        const conversationId = params.id;
        const { branchName, commitMessage } = parsed.data;

        if (
          conversation.environment?.status !== "running" ||
          !conversation.environment?.container
        ) {
          set.status = 503;
          return { error: "Container not running" };
        }

        const containerId = conversation.environment.container;

        // Step 1: Check there are actually changes
        const statusResult = await gitExec(containerId, "status --porcelain");
        if (statusResult.exitCode !== 0) {
          set.status = 500;
          return {
            error: "Failed to check git status",
            details: statusResult.stderr,
          };
        }
        if (!statusResult.stdout?.trim()) {
          set.status = 400;
          return { error: "No changes to commit" };
        }

        // Step 2: Create and checkout new branch
        const checkoutResult = await gitExec(
          containerId,
          `checkout -b "${branchName}"`,
        );
        if (checkoutResult.exitCode !== 0) {
          // Branch might already exist, try switching to it
          const switchResult = await gitExec(
            containerId,
            `checkout "${branchName}"`,
          );
          if (switchResult.exitCode !== 0) {
            set.status = 500;
            return {
              error: "Failed to create/switch to branch",
              details: checkoutResult.stderr || switchResult.stderr,
            };
          }
        }

        // Step 3: Stage all changes
        const addResult = await gitExec(containerId, "add -A");
        if (addResult.exitCode !== 0) {
          set.status = 500;
          return {
            error: "Failed to stage changes",
            details: addResult.stderr,
          };
        }

        // Step 4: Commit
        const escapedMessage = commitMessage.replace(/'/g, "'\\''");
        const commitResult = await gitExec(
          containerId,
          `commit -m '${escapedMessage}'`,
        );
        if (commitResult.exitCode !== 0) {
          set.status = 500;
          return {
            error: "Failed to commit",
            details: commitResult.stderr,
          };
        }

        // Step 5: Push to origin
        const pushResult = await gitExec(
          containerId,
          `push origin "${branchName}"`,
          { timeout: 60000 },
        );
        if (pushResult.exitCode !== 0) {
          set.status = 500;
          return {
            error: "Failed to push",
            details: pushResult.stderr,
          };
        }

        return {
          success: true,
          branch: branchName,
          commitMessage,
          commitOutput: commitResult.stdout,
          pushOutput: pushResult.stdout,
        };
      } catch (err) {
        console.error("Error in git commit-push:", err);
        set.status = 500;
        return { error: err.message };
      }
    },
  )

  /**
   * Create a pull request for a conversation's pushed branch
   * POST /:wid/conversations/:id/create-pr
   * Body: { title: string, description?: string, sourceBranch: string, reviewers?: string[] }
   */
  .post(
    "/:wid/conversations/:id/create-pr",
    async ({ params, body, user, set }) => {
      const membership = await requireMembership(params.wid, user.userId, set);
      if (!membership) return { error: "Not found" };

      const conv = await loadConversation(params.id, params.wid, set);
      if (!conv) return { error: "Not found" };

      const parsed = createPrBody.safeParse(body);
      if (!parsed.success) {
        set.status = 400;
        return { error: parsed.error.flatten() };
      }

      try {
        const conversationId = params.id;
        const { title, description, sourceBranch, reviewers } = parsed.data;

        const conversation = await Conversation.findById(conversationId)
          .populate("repository")
          .populate("subResource");

        if (!conversation) {
          set.status = 404;
          return { error: "Conversation not found" };
        }

        const resource = conversation.repository;
        const subResource = conversation.subResource;

        if (!resource || !subResource) {
          set.status = 400;
          return {
            error: "Conversation has no linked repository",
          };
        }

        // Extract owner/workspace and repo slug from the subresource fullName
        const fullName = subResource.data?.fullName;
        if (!fullName || !fullName.includes("/")) {
          set.status = 400;
          return {
            error: "Cannot determine workspace/repo from subresource",
          };
        }

        const [ownerOrWorkspace, repoSlug] = fullName.split("/");
        const destinationBranch = subResource.data?.mainBranch || "main";

        let pr;
        if (resource.provider === "github") {
          pr = await createGithubPR(
            resource.data,
            ownerOrWorkspace,
            repoSlug,
            {
              title,
              description: description || "",
              sourceBranch,
              destinationBranch,
              reviewers,
            },
          );
        } else {
          pr = await createBitbucketPR(
            resource.data,
            ownerOrWorkspace,
            repoSlug,
            {
              title,
              description: description || "",
              sourceBranch,
              destinationBranch,
              reviewers,
            },
          );
        }

        // Persist the PR record on the conversation
        await Conversation.findByIdAndUpdate(conversationId, {
          $push: {
            pullRequests: {
              url: pr.url,
              title: pr.title || title,
              sourceBranch,
              externalId: pr.id ? String(pr.id) : undefined,
              createdBy: user.userId,
              createdAt: new Date(),
            },
          },
        });

        return pr;
      } catch (err) {
        console.error("Error creating pull request:", err);
        set.status = 500;
        return { error: err.message };
      }
    },
  )

  /**
   * List repository members/collaborators for reviewer selection.
   * GET /:wid/conversations/:id/bitbucket-members
   */
  .get(
    "/:wid/conversations/:id/bitbucket-members",
    async ({ params, query, user, set }) => {
      const membership = await requireMembership(params.wid, user.userId, set);
      if (!membership) return { error: "Not found" };

      const conv = await loadConversation(params.id, params.wid, set);
      if (!conv) return { error: "Not found" };

      try {
        const conversation = await Conversation.findById(params.id)
          .populate("repository")
          .populate("subResource");

        if (!conversation) {
          set.status = 404;
          return { error: "Conversation not found" };
        }

        const resource = conversation.repository;
        const subResource = conversation.subResource;

        if (!resource || !subResource) {
          set.status = 400;
          return { error: "Conversation has no linked repository" };
        }

        const fullName = subResource.data?.fullName;
        if (!fullName || !fullName.includes("/")) {
          set.status = 400;
          return {
            error: "Cannot determine workspace from subresource",
          };
        }

        const [ownerOrWorkspace, repoSlug] = fullName.split("/");
        const search = query?.search?.trim() || "";

        let members;
        if (resource.provider === "github") {
          members = await listGithubCollaborators(
            resource.data,
            ownerOrWorkspace,
            repoSlug,
            { search },
          );
        } else {
          members = await listBitbucketWorkspaceMembers(
            resource.data,
            ownerOrWorkspace,
            {
              search,
            },
          );
        }

        return { members };
      } catch (err) {
        console.error("Error listing members/collaborators:", err);
        set.status = 500;
        return { error: err.message };
      }
    },
  );

export default router;
