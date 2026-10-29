import Agent from "../models/Agent.js";
import Conversation from "../models/Conversation.js";
import SubResource from "../models/SubResource.js";
import { createConversation } from "../tools/conversation/create.js";
import { ensureAgentForSubResource, isRepositorySubResource } from "./agents.js";

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
 * Accepts either `agent` (preferred) or the legacy `repository` + `subResource`
 * pair; the legacy pair is mapped to the agent bound to that repository.
 *
 * @returns {Promise<{ agent?: object, error?: { status: number, message: string } }>}
 */
export async function resolveAgentForNewConversation({
  agent: agentId,
  repository: repositoryId,
  subResource: subResourceId,
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
  } else if (subResourceId) {
    if (!OBJECT_ID_RE.test(String(subResourceId))) {
      return {
        error: { status: 400, message: "Invalid subResource ID format." },
      };
    }
    const subResourceDoc = await SubResource.findById(subResourceId);
    if (!subResourceDoc) {
      return { error: { status: 404, message: "subresource-not-found" } };
    }
    if (!isRepositorySubResource(subResourceDoc)) {
      return {
        error: {
          status: 400,
          message:
            "SubResource must be of type bitbucket-repository or github-repository",
        },
      };
    }
    if (
      repositoryId &&
      subResourceDoc.resource.toString() !== String(repositoryId)
    ) {
      return {
        error: {
          status: 400,
          message: "SubResource does not belong to the specified resource",
        },
      };
    }
    agent = await ensureAgentForSubResource(subResourceDoc);
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

  const repos = await SubResource.find({
    name: { $regex: re },
    type: { $in: ["bitbucket-repository", "github-repository"] },
  }).select("_id");
  if (repos.length === 0) return null;

  return Agent.findOne({
    repository: { $in: repos.map((r) => r._id) },
    enabled: true,
  }).sort({ createdAt: 1 });
}

/**
 * Create and persist a conversation for an agent, then queue its container
 * setup job. Legacy `repository`/`subResource` fields are filled from the
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
    repositoryDoc = await SubResource.findById(agent.repository).select(
      "resource",
    );
  }

  const conversation = new Conversation({
    title: title || "New Conversation",
    createdBy: userId,
    participants: [userId],
    agent: agent._id,
    subResource: repositoryDoc?._id || null,
    repository: repositoryDoc?.resource || null,
    workspace: workspaceId,
    ...(initialPrompt ? { initialPrompt } : {}),
  });
  await conversation.save();

  await createConversation(conversation._id, agent._id, {
    repositoryId: repositoryDoc?.resource?.toString(),
    subResourceId: repositoryDoc?._id?.toString(),
  });

  return conversation;
}
