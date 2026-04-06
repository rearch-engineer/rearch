import Resource from "../models/Resource.js";
import SubResource from "../models/SubResource.js";
import Setting from "../models/Setting.js";

import { resourcesQueue, addJobToQueue } from "./config.js";

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

// Defer initialization until MongoDB is likely connected
setTimeout(initDockerRebuildSchedule, 5000);

export {
  REBUILD_ALL_JOB_NAME,
  triggerRebuildAll,
  scheduleDockerRebuilds,
};
