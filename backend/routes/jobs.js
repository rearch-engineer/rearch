import { Elysia } from 'elysia';
import { z } from 'zod';
import { resourcesQueue, conversationsQueue } from '../queue';
import { authPlugin } from '../middleware/auth.js';
import requireRole from '../middleware/requireRole.js';

const router = new Elysia({ prefix: '/api/jobs' })
  .use(authPlugin)
  .use(requireRole('admin'));

/**
 * Map of queue names to queue instances
 */
const queues = {
  resources: resourcesQueue,
  conversations: conversationsQueue,
};

/**
 * Serialise a BullMQ job into a plain object safe for JSON responses.
 */
function serialiseJob(job, queueName) {
  return {
    id: job.id,
    name: job.name,
    queue: queueName,
    data: job.data,
    returnvalue: job.returnvalue,
    failedReason: job.failedReason,
    stacktrace: job.stacktrace,
    timestamp: job.timestamp,
    processedOn: job.processedOn,
    finishedOn: job.finishedOn,
    attemptsMade: job.attemptsMade,
    progress: job.progress,
  };
}

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const listJobsSchema = z.object({
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
});

const getJobParamsSchema = z.object({
  queue: z.enum(['resources', 'conversations'], {
    errorMap: () => ({ message: "Unknown queue. Must be 'resources' or 'conversations'." }),
  }),
  id: z.string().min(1, "Job ID is required."),
});

/**
 * GET /api/jobs
 *
 * Returns aggregated job counts and a combined list of jobs across all queues
 * and statuses (active, waiting, completed, failed).
 *
 * Query params:
 *   - status: comma-separated list of statuses to include (default: all)
 *   - limit:  max jobs per status per queue (default: 50)
 */
router.get('/', async ({ query, status }) => {
  const parsed = listJobsSchema.safeParse(query);
  if (!parsed.success) {
    return status(400, { error: parsed.error.flatten() });
  }

  try {
    const allowedStatuses = ['active', 'waiting', 'completed', 'failed'];
    const statusFilter = parsed.data.status
      ? parsed.data.status.split(',').filter((s) => allowedStatuses.includes(s))
      : allowedStatuses;
    const limit = parsed.data.limit;

    const allJobs = [];
    const counts = { active: 0, waiting: 0, completed: 0, failed: 0 };

    for (const [queueName, queue] of Object.entries(queues)) {
      // Get counts
      const queueCounts = await queue.getJobCounts(...allowedStatuses);
      for (const s of allowedStatuses) {
        counts[s] += queueCounts[s] || 0;
      }

      // Get jobs for each requested status
      for (const status of statusFilter) {
        const jobs = await queue.getJobs([status], 0, limit - 1);
        for (const job of jobs) {
          allJobs.push({ ...serialiseJob(job, queueName), status });
        }
      }
    }

    // Sort newest first
    allJobs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    return { counts, jobs: allJobs };
  } catch (err) {
    console.error('Error fetching jobs:', err);
    return status(500, { error: 'Failed to fetch jobs' });
  }
});

/**
 * GET /api/jobs/:queue/:id
 *
 * Returns details for a single job including its logs.
 */
router.get('/:queue/:id', async ({ params, status }) => {
  const parsed = getJobParamsSchema.safeParse(params);
  if (!parsed.success) {
    return status(400, { error: parsed.error.flatten() });
  }

  try {
    const { queue: queueName, id } = parsed.data;
    const queue = queues[queueName];

    const job = await queue.getJob(id);
    if (!job) {
      return status(404, { error: 'Job not found' });
    }

    // Determine the current state of the job
    const state = await job.getState();

    // Fetch logs
    const { logs, count } = await queue.getJobLogs(id, 0, 1000);

    return {
      ...serialiseJob(job, queueName),
      state,
      logs,
      logCount: count,
    };
  } catch (err) {
    console.error('Error fetching job details:', err);
    return status(500, { error: 'Failed to fetch job details' });
  }
});

export default router;
