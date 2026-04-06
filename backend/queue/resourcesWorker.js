import { Worker } from "bullmq";

import Setting from "../models/Setting.js";
import { executeActionHook } from "../utils/hookLoader.js";

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
          console.error("Failed to update lastTriggeredAt:", updateErr);
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
      console.log(
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
      console.error(`❌ Job ${job.id} failed:`, error.message);
      throw error; // Re-throw to mark job as failed
    }
  },
  redisConfig,
);

resourcesWorker.on("active", (job) => {
  console.log(`Job ${job.id} is now active`);
  emitJobEvent("job.active", job, "resources");
});

resourcesWorker.on("completed", (job) => {
  console.log(`Job ${job.id} has been completed`);
  emitJobEvent("job.completed", job, "resources");
});

resourcesWorker.on("failed", (job, err) => {
  console.error(`Job ${job.id} has failed with error: ${err.message}`);
  emitJobEvent("job.failed", job, "resources", { error: err.message });
});

console.log("✅ Resources Worker is running and listening for jobs");

export { resourcesWorker };
