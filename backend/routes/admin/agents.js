import { Elysia } from "elysia";
import { z } from "zod";
import Agent, { AGENT_TEMPLATES } from "../../models/Agent.js";
import Conversation from "../../models/Conversation.js";
import Connection from "../../models/Connection.js";
import Resource from "../../models/Resource.js";
import {
  AGENT_POPULATE,
  isRepositoryResource,
  serializeAgent,
} from "../../utils/agents.js";
import queue from "../../queue";

const router = new Elysia({ prefix: "/agents" });

const OBJECT_ID_RE = /^[a-fA-F0-9]{24}$/;
const objectId = z.string().regex(OBJECT_ID_RE, "Invalid ID format.");

const agentBodySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(2000).optional().default(""),
  enabled: z.boolean().optional().default(false),
  workspace: objectId.nullable().optional().default(null),
  repository: objectId.nullable().optional().default(null),
  resources: z.array(objectId).optional().default([]),
  template: z.enum(AGENT_TEMPLATES).optional().default(""),
  dockerImageFromBranch: z.string().max(200).optional().default(""),
  services: z
    .array(
      z.object({
        label: z.string().min(1).max(50),
        icon: z.string().max(50).optional().default("Widgets"),
        internalPort: z.number().int().min(1).max(65535),
      }),
    )
    .optional()
    .default([]),
  skills: z.array(objectId).optional().default([]),
  limits: z
    .object({
      memoryMb: z.number().int().min(0).max(32768).optional().default(0),
      cpuQuota: z.number().int().min(0).max(800000).optional().default(0),
      pidsLimit: z.number().int().min(0).max(4096).optional().default(0),
    })
    .optional()
    .default({}),
  suggestedPrompts: z
    .object({
      mode: z.enum(["all", "selected", "categories"]).optional().default("all"),
      selectedIds: z.array(objectId).optional().default([]),
      selectedCategories: z.array(objectId).optional().default([]),
    })
    .optional()
    .default({}),
});

/**
 * Make sure the referenced repository exists and is a repository sub-resource.
 * Returns an error message or null.
 */
async function validateRepository(repositoryId) {
  if (!repositoryId) return null;
  const sub = await Resource.findById(repositoryId);
  if (!sub) return "Repository not found";
  if (!isRepositoryResource(sub)) {
    return "The selected resource is not a repository";
  }
  return null;
}

async function loadAgent(id) {
  return Agent.findById(id).populate(AGENT_POPULATE);
}

// List all agents
router.get("/", async ({ status }) => {
  try {
    const agents = await Agent.find().populate(AGENT_POPULATE).sort({ name: 1 });
    return agents.map(serializeAgent);
  } catch (err) {
    return status(500, { error: err.message });
  }
});

// Get a single agent (includes conversation count for the UI)
router.get("/:id", async ({ params, status }) => {
  if (!OBJECT_ID_RE.test(params.id)) {
    return status(400, { error: "Invalid ID format." });
  }
  try {
    const agent = await loadAgent(params.id);
    if (!agent) return status(404, { error: "Agent not found" });
    const conversationCount = await Conversation.countDocuments({
      agent: agent._id,
    });
    return { ...serializeAgent(agent), conversationCount };
  } catch (err) {
    return status(500, { error: err.message });
  }
});

// Create agent
router.post("/", async ({ body, status }) => {
  const parsed = agentBodySchema.safeParse(body);
  if (!parsed.success) {
    return status(400, { errors: parsed.error.errors });
  }
  try {
    const repoError = await validateRepository(parsed.data.repository);
    if (repoError) return status(400, { error: repoError });

    const agent = new Agent(parsed.data);
    await agent.save();
    return serializeAgent(await loadAgent(agent._id));
  } catch (err) {
    return status(500, { error: err.message });
  }
});

// Update agent
router.put("/:id", async ({ params, body, status }) => {
  if (!OBJECT_ID_RE.test(params.id)) {
    return status(400, { error: "Invalid ID format." });
  }
  const parsed = agentBodySchema.safeParse(body);
  if (!parsed.success) {
    return status(400, { errors: parsed.error.errors });
  }
  try {
    const agent = await Agent.findById(params.id);
    if (!agent) return status(404, { error: "Agent not found" });

    const repoError = await validateRepository(parsed.data.repository);
    if (repoError) return status(400, { error: repoError });

    // The built image is produced by the rebuild action and belongs to the
    // repository + branch it was built from. Keep it unless those change.
    const previousRepository = agent.repository ? agent.repository.toString() : null;
    const previousBranch = agent.dockerImageFromBranch || "";
    const keepImage =
      previousRepository === (parsed.data.repository || null) &&
      previousBranch === (parsed.data.dockerImageFromBranch || "");

    Object.assign(agent, parsed.data);
    if (!keepImage) agent.dockerImage = "";
    await agent.save();

    return serializeAgent(await loadAgent(agent._id));
  } catch (err) {
    return status(500, { error: err.message });
  }
});

// Delete agent (refuses when conversations still reference it unless ?force=true)
router.delete("/:id", async ({ params, query, status }) => {
  if (!OBJECT_ID_RE.test(params.id)) {
    return status(400, { error: "Invalid ID format." });
  }
  try {
    const agent = await Agent.findById(params.id);
    if (!agent) return status(404, { error: "Agent not found" });

    const conversationCount = await Conversation.countDocuments({
      agent: agent._id,
    });
    if (conversationCount > 0 && query?.force !== "true") {
      return status(409, {
        error: "agent-in-use",
        conversationCount,
      });
    }

    await Agent.deleteOne({ _id: agent._id });
    return { success: true };
  } catch (err) {
    return status(500, { error: err.message });
  }
});

// Queue a docker image rebuild for the agent
router.post("/:id/actions/rebuild", async ({ params, body, status }) => {
  if (!OBJECT_ID_RE.test(params.id)) {
    return status(400, { error: "Invalid ID format." });
  }
  try {
    const agent = await Agent.findById(params.id);
    if (!agent) return status(404, { error: "Agent not found" });
    if (!agent.repository) {
      return status(400, {
        error: "The agent has no repository to build the image from",
      });
    }
    if (!agent.dockerImageFromBranch) {
      return status(400, {
        error: "Select a branch (dockerImageFromBranch) before building",
      });
    }

    const resource = await Resource.findById(agent.repository);
    if (!resource) return status(404, { error: "Repository not found" });
    const connection = await Connection.findById(resource.connection);
    if (!connection) {
      return status(404, { error: "Repository connection not found" });
    }

    const job = await queue.addJobToQueue("resources", "rebuild", {
      connection,
      resource,
      agent,
      payload: body || {},
    });

    return {
      success: true,
      jobId: job.id,
      message: "Docker image rebuild has been queued",
    };
  } catch (err) {
    return status(500, { error: err.message });
  }
});

export default router;
