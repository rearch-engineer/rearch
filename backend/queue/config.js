import { Queue } from "bullmq";
import { getRedisConfig, logRedisConnection } from "../config/redisConfig.js";
import Docker from "dockerode";

// Get Redis connection configuration
const redisConfig = getRedisConfig();

// Log Redis connection details
logRedisConnection();

// Initialize Docker client
const docker = new Docker();

const resourcesQueue = new Queue("resources", redisConfig);
const conversationsQueue = new Queue("conversations", redisConfig);

const addJobToQueue = async (queueName, name, data) => {
  let q = null;

  if (queueName === "resources") {
    q = resourcesQueue;
  } else if (queueName === "conversations") {
    q = conversationsQueue;
  }

  if (!q) {
    throw new Error("Invalid queue name");
  }

  return await q.add(name, data);
};

export {
  redisConfig,
  docker,
  resourcesQueue,
  conversationsQueue,
  addJobToQueue,
};
