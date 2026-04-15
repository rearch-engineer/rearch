/**
 * Internal API routes for service-to-service communication.
 *
 * These routes are authenticated via a shared secret (X-Internal-Secret header)
 * rather than user JWT tokens. They are used by the MCP proxy to create
 * conversations on behalf of users.
 */

import { Elysia } from "elysia";
import Conversation from "../models/Conversation.js";
import Resource from "../models/Resource.js";
import SubResource from "../models/SubResource.js";
import { createConversation } from "../tools/conversation/create.js";
import { broadcast } from "../ws.js";

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
   * Body: { userId, subResourceId, prompt? }
   * Returns: { _id, title, link }
   */
  .post("/conversations", async ({ body, set }) => {
    const { userId, subResourceId, prompt } = body || {};

    if (!userId || !subResourceId) {
      set.status = 400;
      return { error: "userId and subResourceId are required" };
    }

    // Validate ObjectId format
    const OBJECT_ID_RE = /^[a-fA-F0-9]{24}$/;
    if (!OBJECT_ID_RE.test(userId) || !OBJECT_ID_RE.test(subResourceId)) {
      set.status = 400;
      return { error: "Invalid ID format" };
    }

    try {
      // Find the SubResource and its parent Resource
      const subResourceDoc = await SubResource.findById(subResourceId).populate(
        "resource",
      );

      if (!subResourceDoc) {
        set.status = 404;
        return { error: "subresource-not-found" };
      }

      if (!subResourceDoc.rearch?.enabled) {
        set.status = 400;
        return { error: "Repository is not enabled for conversations" };
      }

      if (
        !["bitbucket-repository", "github-repository"].includes(
          subResourceDoc.type,
        )
      ) {
        set.status = 400;
        return { error: "SubResource must be a repository type" };
      }

      const resourceDoc = subResourceDoc.resource;
      if (
        !resourceDoc ||
        !["bitbucket", "github"].includes(resourceDoc.provider)
      ) {
        set.status = 400;
        return { error: "Resource must be of type bitbucket or github" };
      }

      const repositoryId = resourceDoc._id.toString();

      // Create the conversation
      const conversation = new Conversation({
        title: "New Conversation",
        createdBy: userId,
        participants: [userId],
        repository: repositoryId,
        subResource: subResourceId,
        ...(prompt ? { initialPrompt: prompt } : {}),
      });
      await conversation.save();

      // Trigger BullMQ job for conversation setup
      await createConversation(conversation._id, repositoryId, subResourceId);

      // Populate subResource name for the WS broadcast
      const populatedConv = await Conversation.findById(conversation._id)
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
  });

export default internalRoutes;
