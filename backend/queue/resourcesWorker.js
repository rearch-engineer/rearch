import { Worker } from "bullmq";

import Setting from "../models/Setting.js";
import { executeActionHook } from "../utils/hookLoader.js";
import { queueLogger } from "../logger.js";

import { redisConfig } from "./config.js";
import { emitJobEvent, jobLog } from "./events.js";
import { REBUILD_ALL_JOB_NAME, triggerRebuildAll } from "./scheduler.js";

/** RESOURCES WORKER */
const resourcesWorker = new Worker(
  "resources",
  async (job) => {
    try {
      // Handle scheduled rebuild-all job
      if (job.name === REBUILD_ALL_JOB_NAME) {
        await jobLog(
          job,
          "resources",
          "Scheduled rebuild-all: triggering rebuild for all eligible subresources",
        );
        const jobs = await triggerRebuildAll();

        // Update lastTriggeredAt in settings
        try {
          const existing = await Setting.findOne({ key: "dockerRebuild" });
          if (existing) {
            await Setting.findOneAndUpdate(
              { key: "dockerRebuild" },
              {
                key: "dockerRebuild",
                value: {
                  ...existing.value,
                  lastTriggeredAt: new Date().toISOString(),
                },
              },
            );
          }
        } catch (updateErr) {
          queueLogger.error({ err: updateErr }, "Failed to update lastTriggeredAt");
        }

        await jobLog(
          job,
          "resources",
          `Scheduled rebuild-all complete: ${jobs.length} rebuild jobs queued`,
        );
        return { success: true, jobCount: jobs.length };
      }

      const { parentResource, subResource, action, payload } = job.data;

      await jobLog(
        job,
        "resources",
        `Executing action '${action}' for provider '${parentResource.provider}'`,
      );
      queueLogger.info(
        { action, provider: parentResource.provider, jobId: job.id },
        `Executing action '${action}' for provider '${parentResource.provider}'`,
      );

      // Execute the action hook, passing a log callback that also emits via Socket.IO
      const log = (message) => jobLog(job, "resources", message);
      const { success } = await executeActionHook(job, { log });

      await jobLog(
        job,
        "resources",
        `Action '${action}' completed successfully`,
      );
      return { success };
    } catch (error) {
      await jobLog(job, "resources", `Action failed: ${error.message}`);
      queueLogger.error(
        { err: error, jobId: job.id },
        `Job ${job.id} failed: ${error.message}`,
      );
      throw error; // Re-throw to mark job as failed
    }
  },
  redisConfig,
);

resourcesWorker.on("active", (job) => {
  queueLogger.debug({ jobId: job.id, queue: "resources" }, `Job ${job.id} is now active`);
  emitJobEvent("job.active", job, "resources");
});

resourcesWorker.on("completed", (job) => {
  queueLogger.info({ jobId: job.id, queue: "resources" }, `Job ${job.id} completed`);
  emitJobEvent("job.completed", job, "resources");
});

resourcesWorker.on("failed", (job, err) => {
  queueLogger.error(
    { jobId: job.id, queue: "resources", error: err.message },
    `Job ${job.id} failed: ${err.message}`,
  );
  emitJobEvent("job.failed", job, "resources", { error: err.message });
});

queueLogger.info("Resources Worker is running and listening for jobs");

export { resourcesWorker };
