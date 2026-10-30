/**
 * Migration: repositories → agents
 *
 * Before this migration the runtime configuration of a conversation lived in
 * `Resource.rearch` (one config per repository) and conversations pointed
 * to `repository` (the connection) + `resource` (the repository).
 *
 * This script:
 *   1. Creates one Agent per imported repository sub-resource that does not
 *      have an agent yet, copying its legacy `rearch` block.
 *   2. Links every conversation without `agent` to the agent of its
 *      repository.
 *
 * Idempotent: re-running it only touches repositories/conversations that are
 * still unlinked. Legacy fields are left in place; they can be dropped once
 * everything runs on agents.
 *
 * Usage (from backend/):  bun run migrate:rename   (first, once)
 *                         bun run migrate:agents
 * Dry run:                DRY_RUN=1 bun run migrate:agents
 */
import mongoose from "mongoose";
import Agent from "../models/Agent.js";
import Conversation from "../models/Conversation.js";
import Resource from "../models/Resource.js";
import {
  REPOSITORY_KIND,
  agentFieldsFromLegacyRearch,
} from "../utils/agents.js";

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/rearch";
const DRY_RUN = process.env.DRY_RUN === "1";

async function migrate() {
  console.log(`Connecting to MongoDB... ${DRY_RUN ? "(dry run)" : ""}`);
  await mongoose.connect(MONGODB_URI);
  console.log("Connected.");

  // Step 1: one agent per imported repository
  const repositories = await Resource.find({
    kind: REPOSITORY_KIND,
    imported: true,
  });
  console.log(`Found ${repositories.length} imported repositories.`);

  const agentByRepository = new Map();
  for (const agent of await Agent.find({ repository: { $ne: null } })) {
    agentByRepository.set(agent.repository.toString(), agent);
  }

  let agentsCreated = 0;
  for (const repo of repositories) {
    const key = repo._id.toString();
    if (agentByRepository.has(key)) continue;

    const fields = agentFieldsFromLegacyRearch(repo);
    console.log(
      `  + agent '${fields.name}' from repository ${key} (enabled=${fields.enabled}, template='${fields.template}')`,
    );
    if (!DRY_RUN) {
      const agent = await Agent.create(fields);
      agentByRepository.set(key, agent);
    }
    agentsCreated++;
  }
  console.log(
    `Agents created: ${agentsCreated} (${repositories.length - agentsCreated} already existed).`,
  );

  // Step 2: link conversations to agents (include soft-deleted ones)
  const unlinked = await Conversation.findWithDeleted({
    $or: [{ agent: null }, { agent: { $exists: false } }],
    resource: { $ne: null },
  }).select("_id resource");
  console.log(`Found ${unlinked.length} conversations without an agent.`);

  let linked = 0;
  let orphaned = 0;
  for (const conv of unlinked) {
    const agent = agentByRepository.get(conv.resource.toString());
    if (!agent) {
      orphaned++;
      console.warn(
        `  ! conversation ${conv._id} references repository ${conv.resource} which has no agent`,
      );
      continue;
    }
    if (!DRY_RUN) {
      await Conversation.updateOneWithDeleted(
        { _id: conv._id },
        { $set: { agent: agent._id } },
      );
    }
    linked++;
  }
  console.log(`Conversations linked: ${linked}, orphaned: ${orphaned}.`);
  console.log("Migration complete.");
}

migrate()
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
