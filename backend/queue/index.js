// Barrel file — re-exports the same public API that backend/queue.js provided.
// Importing this module also starts the workers (side effects).

export { resourcesQueue, conversationsQueue, addJobToQueue } from "./config.js";
export { scheduleDockerRebuilds, triggerRebuildAll, scheduleContainerCleanup, triggerContainerCleanup } from "./scheduler.js";

// Import workers for their side effects (registers BullMQ processors + event handlers)
import "./resourcesWorker.js";
import "./conversationsWorker.js";

// Default export (used by routes/resources.js, tools/conversation/*)
import { addJobToQueue } from "./config.js";
export default { addJobToQueue };
