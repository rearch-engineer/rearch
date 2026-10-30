import Agent from "../models/Agent.js";
import Resource from "../models/Resource.js";
import Connection from "../models/Connection.js";

/**
 * Agent helpers.
 *
 * Centralises the glue between an Agent and the resources it uses so that
 * workers, routes and the migration script share one implementation.
 */

// Resource kind that represents a source-code repository.
export const REPOSITORY_KIND = "repository";

// Connection providers that can host a repository.
export const GIT_PROVIDERS = ["bitbucket", "github"];

export function isRepositoryResource(resource) {
  return resource?.kind === REPOSITORY_KIND;
}

/**
 * Derive the clone URL of a repository Resource (prefer HTTPS, then SSH,
 * then the HTML link).
 */
export function getRepositoryCloneUrl(resource) {
  const links = resource?.data?.links;
  if (!links) return "";
  if (Array.isArray(links.clone)) {
    const https = links.clone.find((c) => c.name === "https");
    const ssh = links.clone.find((c) => c.name === "ssh");
    if (https?.href || ssh?.href) return https?.href || ssh?.href;
  }
  return links.html || "";
}

/**
 * Map a legacy `Resource.rearch` block to Agent fields.
 * Used by the migration script and by the lazy fallback for conversations
 * created before agents existed.
 */
export function agentFieldsFromLegacyRearch(resource) {
  const r = resource.rearch || {};
  return {
    name: resource.name,
    description: resource.description || "",
    enabled: Boolean(r.enabled),
    repository: resource._id,
    resources: [],
    template: r.template || "",
    dockerImageFromBranch: r.dockerImageFromBranch || "",
    dockerImage: r.dockerImage || "",
    services: (r.services || []).map((s) => ({
      label: s.label,
      icon: s.icon || "Widgets",
      internalPort: s.internalPort,
    })),
    skills: (r.skills || []).filter(Boolean),
    limits: {
      memoryMb: r.resources?.memoryMb || 0,
      cpuQuota: r.resources?.cpuQuota || 0,
      pidsLimit: r.resources?.pidsLimit || 0,
    },
    suggestedPrompts: r.suggestedPrompts || {
      mode: "all",
      selectedIds: [],
      selectedCategories: [],
    },
  };
}

/**
 * Find the agent bound to a repository Resource. When none exists and the
 * sub-resource carries a legacy `rearch` block, create the agent from it.
 *
 * @param {string|import('mongoose').Types.ObjectId|object} resourceOrId
 * @param {{ createIfMissing?: boolean }} [options]
 * @returns {Promise<import('mongoose').Document|null>}
 */
export async function ensureAgentForResource(
  resourceOrId,
  { createIfMissing = true } = {},
) {
  const resourceId = resourceOrId?._id || resourceOrId;
  if (!resourceId) return null;

  const existing = await Agent.findOne({ repository: resourceId }).sort({
    createdAt: 1,
  });
  if (existing) return existing;
  if (!createIfMissing) return null;

  const resource =
    resourceOrId?._id && resourceOrId.kind
      ? resourceOrId
      : await Resource.findById(resourceId);
  if (!resource || !isRepositoryResource(resource)) return null;

  const agent = new Agent(agentFieldsFromLegacyRearch(resource));
  await agent.save();
  console.log(
    `🤖 Created agent '${agent.name}' (${agent._id}) from repository ${resource._id}`,
  );
  return agent;
}

/**
 * Resolve the Agent of a conversation. Conversations created before agents
 * existed only carry `resource`; for those the agent is derived (and
 * persisted) from the repository's legacy configuration.
 */
export async function resolveConversationAgent(conversation) {
  if (!conversation) return null;

  if (conversation.agent) {
    const agent = await Agent.findById(conversation.agent);
    if (agent) return agent;
  }

  if (conversation.resource) {
    const agent = await ensureAgentForResource(conversation.resource);
    if (agent) {
      conversation.agent = agent._id;
      try {
        await conversation.save();
      } catch (err) {
        console.warn(
          `Could not persist agent on conversation ${conversation._id}: ${err.message}`,
        );
      }
      return agent;
    }
  }

  return null;
}

/**
 * Compute everything the container needs to know about the agent's primary
 * repository (clone URL, branch, git credentials). Agents without a
 * repository get empty git settings and the container starts with an empty
 * workspace.
 *
 * @param {object} agent - Agent document
 * @returns {Promise<{
 *   repository: object|null,
 *   connection: object|null,
 *   repoUrl: string,
 *   repoBranch: string,
 *   gitProvider: string,
 *   gitEmail: string,
 *   gitToken: string,
 *   appPort: string,
 *   appStartCommand: string,
 * }>}
 */
export async function resolveAgentRuntime(agent) {
  const runtime = {
    repository: null,
    connection: null,
    repoUrl: "",
    repoBranch: "main",
    gitProvider: "",
    gitEmail: "",
    gitToken: "",
    appPort: "3000",
    appStartCommand: "npm run dev",
  };

  if (!agent?.repository) return runtime;

  const repository = await Resource.findById(agent.repository);
  if (!repository) {
    throw new Error(
      `Repository ${agent.repository} linked to agent '${agent.name}' not found`,
    );
  }
  const connection = await Connection.findById(repository.connection);
  if (!connection) {
    throw new Error(
      `Connection ${repository.connection} for repository '${repository.name}' not found`,
    );
  }

  runtime.repository = repository;
  runtime.connection = connection;
  runtime.repoUrl = getRepositoryCloneUrl(repository);
  runtime.repoBranch = repository.data?.mainBranch || "main";
  runtime.appPort = connection.data?.appPort || "3000";
  runtime.appStartCommand = connection.data?.appStartCommand || "npm run dev";

  const provider = connection.provider || "bitbucket";
  runtime.gitProvider = provider;

  if (provider === "github") {
    // GitHub Apps authenticate with a short-lived installation token
    const { getInstallationToken } = await import("./github/github.js");
    runtime.gitToken = await getInstallationToken(connection.data);
    runtime.gitEmail = "github-app@users.noreply.github.com";
  } else {
    runtime.gitEmail = connection.data?.email || "";
    runtime.gitToken = connection.data?.apiToken || "";
  }

  return runtime;
}

/**
 * Serialise an agent for API consumers: populated repository/connection names
 * flattened so the frontend does not need to know the resource model.
 */
export function serializeAgent(agentDoc) {
  const agent = agentDoc.toObject ? agentDoc.toObject() : { ...agentDoc };
  const repo = agent.repository;
  if (repo && typeof repo === "object" && repo._id) {
    agent.repository = repo._id;
    agent.repositoryName = repo.name;
    agent.repositoryKind = repo.kind;
    agent.repositoryProvider = repo.provider;
    agent.repositoryUrl = repo.data?.links?.html || null;
    const connection = repo.connection;
    if (connection && typeof connection === "object" && connection._id) {
      agent.connectionId = connection._id;
      agent.connectionName = connection.name;
      agent.provider = connection.provider;
    } else if (connection) {
      agent.connectionId = connection;
    }
  }
  return agent;
}

// Populate spec shared by every route that returns agents
export const AGENT_POPULATE = {
  path: "repository",
  select: "name kind provider data.links.html connection",
  populate: { path: "connection", select: "name provider" },
};
