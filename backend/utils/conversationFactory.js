import Agent from "../models/Agent.js";
import Conversation from "../models/Conversation.js";
import Resource from "../models/Resource.js";
import { createConversation } from "../tools/conversation/create.js";
import { ensureAgentForResource, isRepositoryResource } from "./agents.js";

/**
 * Shared logic to create a conversation for an agent. Used by the public API,
 * the workspace API and the internal (MCP proxy) API so that the three stay
 * consistent.
 */

const OBJECT_ID_RE = /^[a-fA-F0-9]{24}$/;

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Resolve the agent a new conversation should run with.
 *
 * Accepts either `agent` (preferred) or the legacy `repository` + `resource`
 * pair; the legacy pair is mapped to the agent bound to that repository.
 *
 * @returns {Promise<{ agent?: object, error?: { status: number, message: string } }>}
 */
export async function resolveAgentForNewConversation({
  agent: agentId,
  connection: connectionId,
  resource: resourceId,
} = {}) {
  let agent = null;

  if (agentId) {
    if (!OBJECT_ID_RE.test(String(agentId))) {
      return { error: { status: 400, message: "Invalid agent ID format." } };
    }
    agent = await Agent.findById(agentId);
    if (!agent) {
      return { error: { status: 404, message: "agent-not-found" } };
    }
  } else if (resourceId) {
    if (!OBJECT_ID_RE.test(String(resourceId))) {
      return {
        error: { status: 400, message: "Invalid resource ID format." },
      };
    }
    const resourceDoc = await Resource.findById(resourceId);
    if (!resourceDoc) {
      return { error: { status: 404, message: "resource-not-found" } };
    }
    if (!isRepositoryResource(resourceDoc)) {
      return {
        error: {
          status: 400,
          message: "Resource must be a repository",
        },
      };
    }
    if (
      connectionId &&
      resourceDoc.connection.toString() !== String(connectionId)
    ) {
      return {
        error: {
          status: 400,
          message: "Resource does not belong to the specified resource",
        },
      };
    }
    agent = await ensureAgentForResource(resourceDoc);
    if (!agent) {
      return { error: { status: 404, message: "agent-not-found" } };
    }
  } else {
    return { error: { status: 400, message: "agent is required" } };
  }

  if (!agent.enabled) {
    return { error: { status: 400, message: "agent-disabled" } };
  }

  return { agent };
}

/**
 * Find an enabled agent by name (case-insensitive). Falls back to the agent
 * bound to a repository with that name so legacy `/start#<repoName>` links
 * keep working.
 */
export async function findEnabledAgentByName(name) {
  const trimmed = (name || "").trim();
  if (!trimmed) return null;
  const re = new RegExp(`^${escapeRegex(trimmed)}$`, "i");

  const byName = await Agent.findOne({ name: { $regex: re }, enabled: true });
  if (byName) return byName;

  const repos = await Resource.find({
    name: { $regex: re },
    kind: "repository",
  }).select("_id");
  if (repos.length === 0) return null;

  return Agent.findOne({
    repository: { $in: repos.map((r) => r._id) },
    enabled: true,
  }).sort({ createdAt: 1 });
}

/**
 * Create and persist a conversation for an agent, then queue its container
 * setup job. Legacy `repository`/`resource` fields are filled from the
 * agent's repository so provider tools (pull requests, reviewers) keep working.
 *
 * @returns {Promise<import('mongoose').Document>} the saved conversation
 */
export async function startConversationForAgent({
  agent,
  userId,
  workspaceId = null,
  title = "New Conversation",
  initialPrompt = null,
}) {
  let repositoryDoc = null;
  if (agent.repository) {
    repositoryDoc = await Resource.findById(agent.repository).select(
      "resource",
    );
  }

  const conversation = new Conversation({
    title: title || "New Conversation",
    createdBy: userId,
    participants: [userId],
    agent: agent._id,
    resource: repositoryDoc?._id || null,
    connection: repositoryDoc?.connection || null,
    workspace: workspaceId,
    ...(initialPrompt ? { initialPrompt } : {}),
  });
  await conversation.save();

  await createConversation(conversation._id, agent._id, {
    connectionId: repositoryDoc?.connection?.toString(),
    resourceId: repositoryDoc?._id?.toString(),
  });

  return conversation;
}
