/**
 * Internal API routes for service-to-service communication.
 *
 * These routes are authenticated via a shared secret (X-Internal-Secret header)
 * rather than user JWT tokens. They are used by the MCP proxy to create
 * conversations on behalf of users.
 */

import { Elysia } from "elysia";
import Conversation from "../models/Conversation.js";
import WorkspaceMember from "../models/WorkspaceMember.js";
import {
  resolveAgentForNewConversation,
  startConversationForAgent,
} from "../utils/conversationFactory.js";
import { broadcast } from "../ws.js";
import { ensurePersonalWorkspace } from "../utils/workspace.js";
import { getUserAccessToken } from "../utils/mcp/userCredentials.js";

const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET || "";

// ---------------------------------------------------------------------------
// Auth guard
// ---------------------------------------------------------------------------

function validateInternalSecret(request) {
  if (!INTERNAL_API_SECRET) {
    // No secret configured — reject all requests (fail closed)
    return false;
  }
  const header = request.headers.get
    ? request.headers.get("x-internal-secret")
    : request.headers["x-internal-secret"];
  return header === INTERNAL_API_SECRET;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const internalRoutes = new Elysia({ prefix: "/api/internal" })

  // Auth guard for all internal routes
  .onBeforeHandle(({ request, set }) => {
    if (!validateInternalSecret(request)) {
      set.status = 401;
      return { error: "Unauthorized" };
    }
  })

  /**
   * POST /api/internal/conversations
   *
   * Create a conversation on behalf of a user (called by the MCP proxy).
   *
   * Body: { userId, agentId, prompt?, workspaceId? }
   *       `subResourceId` (legacy) is still accepted and mapped to the
   *       agent bound to that repository.
   * Returns: { _id, title }
   */
  .post("/conversations", async ({ body, set }) => {
    let { userId, agentId, subResourceId, prompt, workspaceId } = body || {};

    if (!userId || (!agentId && !subResourceId)) {
      set.status = 400;
      return { error: "userId and agentId are required" };
    }

    // Validate ObjectId format
    const OBJECT_ID_RE = /^[a-fA-F0-9]{24}$/;
    if (
      !OBJECT_ID_RE.test(userId) ||
      (agentId && !OBJECT_ID_RE.test(agentId)) ||
      (subResourceId && !OBJECT_ID_RE.test(subResourceId))
    ) {
      set.status = 400;
      return { error: "Invalid ID format" };
    }

    if (workspaceId && !OBJECT_ID_RE.test(workspaceId)) {
      set.status = 400;
      return { error: "Invalid workspaceId format" };
    }

    try {
      // Resolve workspace
      if (workspaceId) {
        const membership = await WorkspaceMember.findOne({
          workspace: workspaceId,
          user: userId,
        });
        if (!membership) {
          set.status = 403;
          return { error: "User is not a member of the specified workspace" };
        }
      } else {
        const personalWs = await ensurePersonalWorkspace(userId);
        workspaceId = personalWs._id;
      }

      // Resolve the agent (legacy subResourceId maps to the repository's agent)
      const { agent, error } = await resolveAgentForNewConversation({
        agent: agentId,
        subResource: subResourceId,
      });
      if (error) {
        set.status = error.status;
        return { error: error.message };
      }

      const conversation = await startConversationForAgent({
        agent,
        userId,
        workspaceId,
        initialPrompt: prompt || null,
      });

      // Populate names for the WS broadcast
      const populatedConv = await Conversation.findById(conversation._id)
        .populate("agent", "name")
        .populate("subResource", "name")
        .lean();

      // Broadcast so all frontend clients see the new conversation
      broadcast("conversation.created", { conversation: populatedConv });

      return {
        _id: conversation._id.toString(),
        title: conversation.title,
      };
    } catch (err) {
      console.error("[internal] Error creating conversation:", err.message);
      set.status = 500;
      return { error: err.message };
    }
  })

  /**
   * GET /api/internal/mcp/user-token?userId=&server=&forceRefresh=
   *
   * Hands the MCP proxy a valid access token for a user's per-user OAuth
   * MCP server, refreshing it transparently. `forceRefresh=1` is used after
   * the upstream rejected the current token.
   *
   * Returns: { accessToken, tokenType, expiresAt }
   * Errors:  404 { error: "not_connected" | "server_not_found" }
   *          401 { error: "reauthorize_required", message }
   *          502 { error: "refresh_failed", message }
   */
  .get("/mcp/user-token", async ({ query, set }) => {
    const { userId, server, forceRefresh } = query || {};
    const OBJECT_ID_RE = /^[a-fA-F0-9]{24}$/;
    if (!userId || !server || !OBJECT_ID_RE.test(userId) || !/^[a-zA-Z0-9_-]+$/.test(server)) {
      set.status = 400;
      return { error: "userId and server are required" };
    }
    try {
      const token = await getUserAccessToken(userId, server, {
        forceRefresh: forceRefresh === "1" || forceRefresh === "true",
      });
      return token;
    } catch (err) {
      switch (err.code) {
        case "not_connected":
        case "server_not_found":
          set.status = 404;
          return { error: err.code, message: err.message };
        case "reauthorize_required":
          set.status = 401;
          return { error: err.code, message: err.message };
        case "refresh_failed":
          set.status = 502;
          return { error: err.code, message: err.message };
        default:
          console.error("[internal] user-token error:", err);
          set.status = 500;
          return { error: "internal_error", message: err.message };
      }
    }
  });

export default internalRoutes;
