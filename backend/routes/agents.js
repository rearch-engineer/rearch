import { Elysia } from "elysia";
import Agent from "../models/Agent.js";
import { authPlugin } from "../middleware/auth.js";
import { AGENT_POPULATE, serializeAgent } from "../utils/agents.js";

const OBJECT_ID_RE = /^[a-fA-F0-9]{24}$/;

/**
 * User-facing agent routes: what a user can pick when starting a conversation.
 * Only enabled agents are exposed and connection credentials are never
 * included (AGENT_POPULATE selects names only).
 */
const router = new Elysia({ prefix: "/api/agents" })
  .use(authPlugin)

  // List enabled agents
  .get("/", async ({ status }) => {
    try {
      const agents = await Agent.find({ enabled: true })
        .populate(AGENT_POPULATE)
        .sort({ name: 1 });
      return agents.map(serializeAgent);
    } catch (err) {
      return status(500, { error: err.message });
    }
  })

  // Get a single enabled agent
  .get("/:id", async ({ params, status }) => {
    if (!OBJECT_ID_RE.test(params.id)) {
      return status(400, { error: "Invalid ID format." });
    }
    try {
      const agent = await Agent.findOne({
        _id: params.id,
        enabled: true,
      }).populate(AGENT_POPULATE);
      if (!agent) {
        return status(404, { error: "Agent not found" });
      }
      return serializeAgent(agent);
    } catch (err) {
      return status(500, { error: err.message });
    }
  });

export default router;
