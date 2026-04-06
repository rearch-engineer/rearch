import dotenv from "dotenv";

dotenv.config();

/**
 * Redis Configuration
 * Supports both URL-based and parameter-based configuration
 * Works with local Redis, Docker, and cloud providers (Redis Cloud, AWS ElastiCache, etc.)
 */

const getRedisConnection = () => {
  // Option 1: Use REDIS_URL if provided (simplest for cloud providers)
  if (process.env.REDIS_URL) {
    return {
      connection: {
        url: process.env.REDIS_URL,
      },
    };
  }

  // Option 2: Use individual parameters (more flexible)
  const host = process.env.REDIS_HOST || "localhost";
  const port = parseInt(process.env.REDIS_PORT || "6379", 10);
  const password = process.env.REDIS_PASSWORD || undefined;
  const tls = process.env.REDIS_TLS === "true" ? {} : undefined;

  const connection = {
    host,
    port,
  };

  if (password) {
    connection.password = password;
  }

  if (tls) {
    connection.tls = tls;
  }

  return { connection };
};

/**
 * Get Redis connection options for BullMQ
 * @returns {Object} Redis connection configuration
 */
export const getRedisConfig = () => {
  try {
    const config = getRedisConnection();

    // Add additional BullMQ options
    config.connection.maxRetriesPerRequest = null; // Required for BullMQ
    config.connection.enableReadyCheck = false;
    config.connection.retryStrategy = (times) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    };

    return config;
  } catch (error) {
    console.error("❌ Error creating Redis configuration:", error.message);
    throw error;
  }
};

/**
 * Log Redis connection details (without sensitive info)
 */
export const logRedisConnection = () => {
  if (process.env.REDIS_URL) {
    const urlObj = new URL(process.env.REDIS_URL);
    console.log(
      `📡 Redis configured via URL: ${urlObj.protocol}//${urlObj.hostname}:${urlObj.port}`,
    );
  } else {
    const host = process.env.REDIS_HOST || "localhost";
    const port = process.env.REDIS_PORT || "6379";
    console.log(`📡 Redis configured: ${host}:${port}`);
  }
};

export default {
  getRedisConfig,
  logRedisConnection,
};
