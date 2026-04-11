import Resource from "../models/Resource.js";
import SubResource from "../models/SubResource.js";
import Conversation from "../models/Conversation.js";
import Setting from "../models/Setting.js";

import { resourcesQueue, conversationsQueue, addJobToQueue } from "./config.js";
import { docker } from "./config.js";
import { clearClientCache } from "../utils/opencodeContainer.js";
import { broadcast } from "../ws.js";

// Job name constant for scheduled docker rebuilds
const REBUILD_ALL_JOB_NAME = "rebuild-all-docker-images";

/**
 * Trigger a rebuild of all docker images for subresources that have rearch enabled.
 * Each eligible subresource gets its own "rebuild" job queued.
 * @returns {Promise<Array>} Array of created BullMQ jobs
 */
async function triggerRebuildAll() {
  // Find all subresources with rearch.enabled = true that have rebuild prerequisites
  const subResources = await SubResource.find({ "rearch.enabled": true });

  const jobs = [];
  for (const sub of subResources) {
    // Only rebuild if the subresource has a branch configured
    if (!sub.rearch?.dockerImageFromBranch) continue;

    // Get the parent resource for credentials
    const parentResource = await Resource.findById(sub.resource);
    if (!parentResource) continue;

    const job = await addJobToQueue("resources", "rebuild", {
      parentResource,
      subResource: sub,
      payload: {},
    });
    jobs.push(job);
    console.log(
      `🔄 Queued rebuild for subresource ${sub.name} (${sub._id}), job ${job.id}`,
    );
  }

  console.log(`🔄 Triggered rebuild-all: ${jobs.length} jobs queued`);
  return jobs;
}

/**
 * Update the BullMQ repeatable job schedule for docker image rebuilds.
 * Removes any existing repeatable schedule before (optionally) adding a new one.
 * @param {{ enabled: boolean, intervalHours: number }} settings
 */
async function scheduleDockerRebuilds(settings) {
  // Remove all existing repeatable jobs with this name
  const repeatableJobs = await resourcesQueue.getRepeatableJobs();
  for (const rj of repeatableJobs) {
    if (rj.name === REBUILD_ALL_JOB_NAME) {
      await resourcesQueue.removeRepeatableByKey(rj.key);
      console.log(`🗑️ Removed existing docker rebuild schedule: ${rj.key}`);
    }
  }

  if (!settings.enabled) {
    console.log("🔄 Docker rebuild schedule disabled");
    return;
  }

  const intervalMs = settings.intervalHours * 60 * 60 * 1000;

  // Add a new repeatable job
  await resourcesQueue.add(
    REBUILD_ALL_JOB_NAME,
    { triggeredBy: "schedule" },
    {
      repeat: {
        every: intervalMs,
      },
    },
  );

  console.log(
    `🔄 Docker rebuild scheduled every ${settings.intervalHours} hours`,
  );
}

/**
 * Initialize the docker rebuild schedule from stored settings on startup.
 * Called after MongoDB is connected (deferred to avoid race conditions).
 */
async function initDockerRebuildSchedule() {
  try {
    const setting = await Setting.findOne({ key: "dockerRebuild" });
    if (setting?.value?.enabled) {
      await scheduleDockerRebuilds(setting.value);
    }
  } catch (err) {
    console.error("Failed to initialize docker rebuild schedule:", err);
  }
}

// ─── Container Cleanup ────────────────────────────────────────────────────────

const CLEANUP_JOB_NAME = "cleanup-idle-containers";

/**
 * Two-phase idle container cleanup.
 *
 * Phase 1 – STOP: Running containers whose conversation `updatedAt` is older
 *   than `idleStopMinutes` are stopped (Docker stop). The container still
 *   exists on disk so it can theoretically be inspected, but the conversation
 *   status is set to "stopped".
 *
 * Phase 2 – REMOVE: Stopped containers whose `environment.statusChangedAt` is
 *   older than `idleRemoveMinutes` are removed (Docker rm). The container ID
 *   is cleared from the conversation.
 *
 * @returns {Promise<{ stoppedCount: number, stoppedConversations: string[], removedCount: number, removedConversations: string[] }>}
 */
async function triggerContainerCleanup() {
  const setting = await Setting.findOne({ key: "containerCleanup" });
  const idleStopMinutes = setting?.value?.idleStopMinutes || 30;
  const idleRemoveMinutes = setting?.value?.idleRemoveMinutes || 1440;

  const now = Date.now();
  const stopCutoff = new Date(now - idleStopMinutes * 60 * 1000);
  const removeCutoff = new Date(now - idleRemoveMinutes * 60 * 1000);

  // ── Phase 1: Stop idle running containers ───────────────────────────

  const idleRunning = await Conversation.find({
    "environment.status": "running",
    updatedAt: { $lt: stopCutoff },
  });

  const stoppedConversations = [];

  for (const conversation of idleRunning) {
    const containerId = conversation.environment?.container;
    if (containerId) {
      try {
        const container = docker.getContainer(containerId);
        await container.stop();
        console.log(
          `🧹 Idle container ${containerId} stopped for conversation ${conversation._id}`,
        );
      } catch (stopErr) {
        // Container may already be stopped / gone
        console.log(
          `🧹 Container stop skipped (${conversation._id}): ${stopErr.message}`,
        );
      }
    }

    // Clear the OpenCode client cache
    clearClientCache(conversation._id.toString());

    // Update conversation — keep container ID so Phase 2 can remove it later
    conversation.environment = {
      ...conversation.environment,
      status: "stopped",
      statusChangedAt: new Date(),
      opencodeUrl: null,
      opencodeSessionId: null,
      hostPort: null,
      errorMessage: "Container stopped due to inactivity",
    };
    await conversation.save();

    stoppedConversations.push(conversation._id.toString());

    broadcast("conversation.stopped.idle", {
      conversationId: conversation._id.toString(),
      reason: "idle_timeout",
    });
  }

  // ── Phase 2: Remove stopped containers past the remove threshold ────

  const staleConversations = await Conversation.find({
    "environment.status": "stopped",
    "environment.container": { $ne: null, $exists: true },
    "environment.statusChangedAt": { $lt: removeCutoff },
  });

  const removedConversations = [];

  for (const conversation of staleConversations) {
    const containerId = conversation.environment?.container;
    if (containerId) {
      try {
        const container = docker.getContainer(containerId);
        // Ensure the container is stopped before removing (might have been
        // manually restarted outside the app)
        try {
          await container.stop();
        } catch (_) {
          /* already stopped */
        }
        await container.remove();
        console.log(
          `🧹 Container ${containerId} removed for conversation ${conversation._id}`,
        );
      } catch (removeErr) {
        console.log(
          `🧹 Container removal skipped (${conversation._id}): ${removeErr.message}`,
        );
      }
    }

    // Clear container reference
    conversation.environment = {
      ...conversation.environment,
      container: null,
      statusChangedAt: new Date(),
    };
    await conversation.save();

    removedConversations.push(conversation._id.toString());

    broadcast("conversation.removed.idle", {
      conversationId: conversation._id.toString(),
      reason: "idle_remove",
    });
  }

  // ── Summary ─────────────────────────────────────────────────────────

  const totalActions =
    stoppedConversations.length + removedConversations.length;

  if (totalActions > 0) {
    console.log(
      `🧹 Container cleanup complete: ${stoppedConversations.length} stopped, ${removedConversations.length} removed`,
    );

    const existing = await Setting.findOne({ key: "containerCleanup" });
    const current = existing?.value || {
      enabled: false,
      idleStopMinutes: 30,
      idleRemoveMinutes: 1440,
    };
    await Setting.findOneAndUpdate(
      { key: "containerCleanup" },
      {
        key: "containerCleanup",
        value: { ...current, lastTriggeredAt: new Date().toISOString() },
      },
      { upsert: true, new: true },
    );
  } else {
    console.log("🧹 Container cleanup: nothing to do");
  }

  return {
    stoppedCount: stoppedConversations.length,
    stoppedConversations,
    removedCount: removedConversations.length,
    removedConversations,
  };
}

/**
 * Update the BullMQ repeatable job schedule for container cleanup.
 * Removes any existing repeatable schedule before (optionally) adding a new one.
 * The check interval is the smaller of 5 minutes or half the stop timeout.
 * The actual thresholds are read from Settings at execution time.
 * @param {{ enabled: boolean, idleStopMinutes: number, idleRemoveMinutes: number }} settings
 */
async function scheduleContainerCleanup(settings) {
  // Remove all existing repeatable jobs with this name
  const repeatableJobs = await conversationsQueue.getRepeatableJobs();
  for (const rj of repeatableJobs) {
    if (rj.name === CLEANUP_JOB_NAME) {
      await conversationsQueue.removeRepeatableByKey(rj.key);
      console.log(`🗑️ Removed existing container cleanup schedule: ${rj.key}`);
    }
  }

  if (!settings.enabled) {
    console.log("🧹 Container cleanup schedule disabled");
    return;
  }

  // Check every 5 minutes (or half the stop timeout if that's shorter)
  const stopMinutes = settings.idleStopMinutes || 30;
  const checkIntervalMs = Math.min(
    5 * 60 * 1000,
    (stopMinutes / 2) * 60 * 1000,
  );

  await conversationsQueue.add(
    CLEANUP_JOB_NAME,
    { triggeredBy: "schedule" },
    {
      repeat: {
        every: checkIntervalMs,
      },
    },
  );

  console.log(
    `🧹 Container cleanup scheduled: check every ${Math.round(checkIntervalMs / 60000)} min, stop after ${settings.idleStopMinutes} min idle, remove after ${settings.idleRemoveMinutes} min`,
  );
}

/**
 * Initialize the container cleanup schedule from stored settings on startup.
 */
async function initContainerCleanupSchedule() {
  try {
    const setting = await Setting.findOne({ key: "containerCleanup" });
    if (setting?.value?.enabled) {
      await scheduleContainerCleanup(setting.value);
    }
  } catch (err) {
    console.error("Failed to initialize container cleanup schedule:", err);
  }
}

// Defer initialization until MongoDB is likely connected
setTimeout(initDockerRebuildSchedule, 5000);
setTimeout(initContainerCleanupSchedule, 5000);

export {
  REBUILD_ALL_JOB_NAME,
  triggerRebuildAll,
  scheduleDockerRebuilds,
  CLEANUP_JOB_NAME,
  triggerContainerCleanup,
  scheduleContainerCleanup,
};
