import { resourcesQueue, conversationsQueue } from "./config.js";
import { broadcast } from "../ws.js";

/**
 * Get combined job counts across all queues
 */
async function getJobCounts() {
  const [resourcesCounts, conversationsCounts] = await Promise.all([
    resourcesQueue.getJobCounts("active", "waiting", "completed", "failed"),
    conversationsQueue.getJobCounts("active", "waiting", "completed", "failed"),
  ]);
  return {
    active: (resourcesCounts.active || 0) + (conversationsCounts.active || 0),
    waiting:
      (resourcesCounts.waiting || 0) + (conversationsCounts.waiting || 0),
    completed:
      (resourcesCounts.completed || 0) + (conversationsCounts.completed || 0),
    failed: (resourcesCounts.failed || 0) + (conversationsCounts.failed || 0),
  };
}

/**
 * Build a serialisable job summary object for WebSocket events
 */
function jobSummary(job, queueName) {
  return {
    id: job.id,
    name: job.name,
    queue: queueName,
    timestamp: job.timestamp,
    processedOn: job.processedOn,
    finishedOn: job.finishedOn,
    data: job.data,
  };
}

/**
 * Broadcast a job event to all connected clients with updated counts
 */
async function emitJobEvent(event, job, queueName, extra = {}) {
  const counts = await getJobCounts();
  broadcast(event, { job: jobSummary(job, queueName), counts, ...extra });
}

/**
 * Wrapper around job.log() that also broadcasts a WebSocket event
 */
async function jobLog(job, queueName, message) {
  await job.log(message);
  broadcast("job.log", {
    jobId: job.id,
    queue: queueName,
    message,
    timestamp: Date.now(),
  });
}

export { getJobCounts, jobSummary, emitJobEvent, jobLog };
