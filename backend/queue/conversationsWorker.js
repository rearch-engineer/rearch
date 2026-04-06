import { Worker } from "bullmq";

import Resource from "../models/Resource.js";
import SubResource from "../models/SubResource.js";
import Conversation from "../models/Conversation.js";
import config from "../config.js";
import { clearClientCache } from "../utils/opencodeContainer.js";
import { queueLogger } from "../logger.js";

import { redisConfig, docker } from "./config.js";
import { emitJobEvent, jobLog } from "./events.js";
import { waitForOpencodeReady, injectSkillsIntoContainer } from "./helpers.js";
import { createConversationContainer } from "./createConversationContainer.js";

/** CONVERSATIONS WORKER */
const conversationsWorker = new Worker(
  "conversations",
  async (job) => {
    // ── Destroy conversation ─────────────────────────────────────────────
    if (job.name === "destroy-conversation") {
      const { conversationId } = job.data;

      await jobLog(
        job,
        "conversations",
        `Destroying conversation ${conversationId}`,
      );

      // Use findOneWithDeleted since the doc is already soft-deleted
      const conversation = await Conversation.findOneWithDeleted({
        _id: conversationId,
      });
      if (!conversation) {
        await jobLog(job, "conversations", "Conversation not found, skipping");
        return { success: true };
      }

      // Stop and remove Docker container if it exists
      const containerId = conversation.environment?.container;
      if (containerId) {
        try {
          const container = docker.getContainer(containerId);
          try {
            await container.stop();
            await jobLog(
              job,
              "conversations",
              `Container ${containerId} stopped`,
            );
          } catch (stopErr) {
            // Container may already be stopped
            await jobLog(
              job,
              "conversations",
              `Container stop skipped: ${stopErr.message}`,
            );
          }
          await container.remove();
          await jobLog(
            job,
            "conversations",
            `Container ${containerId} removed`,
          );
        } catch (removeErr) {
          await jobLog(
            job,
            "conversations",
            `Container removal failed: ${removeErr.message}`,
          );
        }
      }

      // Clear the OpenCode client cache
      clearClientCache(conversationId);

      // Update conversation environment status
      conversation.environment = {
        ...conversation.environment,
        status: "stopped",
        container: null,
        opencodeUrl: null,
        opencodeSessionId: null,
        hostPort: null,
        errorMessage: null,
      };
      await conversation.save();

      await jobLog(job, "conversations", "Conversation environment destroyed");
      return { success: true, conversationId };
    }

    // ── Setup conversation ───────────────────────────────────────────────
    try {
      const { conversationId, repositoryId, subResourceId } = job.data;

      await jobLog(
        job,
        "conversations",
        `Setting up conversation ${conversationId}`,
      );
      queueLogger.info(
        { conversationId, repositoryId, subResourceId },
        `Setting up conversation ${conversationId} with repository ${repositoryId}`,
      );

      // Get the conversation
      const conversation = await Conversation.findById(conversationId);
      if (!conversation) {
        throw new Error("Conversation not found");
      }

      // Mark as starting
      conversation.environment = {
        ...conversation.environment,
        status: "starting",
      };
      await conversation.save();

      await jobLog(
        job,
        "conversations",
        "Loading repository and subresource data",
      );

      // Get the repository resource (parent - contains credentials)
      const repository = await Resource.findById(repositoryId);
      if (!repository) {
        throw new Error("Repository not found");
      }

      // Get the subresource (actual repository with clone URL, branch, etc.)
      const subResource = await SubResource.findById(subResourceId);
      if (!subResource) {
        throw new Error("SubResource not found");
      }

      // Get container image: prefer subresource's custom docker image, then default
      let containerImage =
        config.conversationContainerImage ||
        process.env.CONVERSATION_CONTAINER_IMAGE;
      if (subResource.rearch?.dockerImage) {
        containerImage = subResource.rearch.dockerImage;
        queueLogger.info(
          { containerImage, subResourceId: subResource._id },
          `Using custom container image from subresource: ${containerImage}`,
        );
      }
      if (!containerImage) {
        throw new Error(
          "CONVERSATION_CONTAINER_IMAGE environment variable not set",
        );
      }

      // Validate Anthropic API key is set
      const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
      if (!anthropicApiKey) {
        throw new Error(
          "ANTHROPIC_API_KEY environment variable not set - required for OpenCode containers",
        );
      }

      // Log API key is set without exposing the value
      const keyPrefix = anthropicApiKey.substring(0, 7);
      const keyLength = anthropicApiKey.length;
      queueLogger.debug(
        { keyPrefix, keyLength },
        "Anthropic API key configured",
      );

      await jobLog(
        job,
        "conversations",
        `Creating container with image: ${containerImage}`,
      );
      queueLogger.info(
        { containerImage, conversationId },
        `Creating container with image: ${containerImage}`,
      );

      // Get optional environment variables for Node.js app containers
      const appPort = repository.data.appPort || "3000";
      const appStartCommand = repository.data.appStartCommand || "npm run dev";

      // Get Bitbucket credentials from the parent resource data
      const bitbucketEmail = repository.data.email || "";
      const bitbucketToken = repository.data.apiToken || "";

      // Derive repository URL from subresource clone links (prefer HTTPS)
      let repoUrl = "";
      if (subResource.data?.links?.clone) {
        const httpsClone = subResource.data.links.clone.find(
          (c) => c.name === "https",
        );
        const sshClone = subResource.data.links.clone.find(
          (c) => c.name === "ssh",
        );
        repoUrl = httpsClone?.href || sshClone?.href || "";
      }
      // Fallback to html link if no clone links
      if (!repoUrl && subResource.data?.links?.html) {
        repoUrl = subResource.data.links.html;
      }

      // Derive branch from subresource's mainBranch
      const repoBranch = subResource.data?.mainBranch || "main";

      // ── Create and start the container ──────────────────────────────────
      const {
        containerId,
        opencodeUrl,
        hostPort,
        codeServerHostPort,
        appHostPort,
        postgresHostPort,
        publicBaseUrl,
      } = await createConversationContainer({
        containerImage,
        conversationId,
        repoUrl,
        repoBranch,
        anthropicApiKey,
        appPort,
        appStartCommand,
        bitbucketEmail,
        bitbucketToken,
        rearchServices: subResource.rearch?.services || [],
        log: (msg) => jobLog(job, "conversations", msg),
      });

      // Wait for OpenCode server to be ready
      await jobLog(
        job,
        "conversations",
        `Waiting for OpenCode server at ${opencodeUrl}`,
      );
      await waitForOpencodeReady(opencodeUrl);
      await jobLog(job, "conversations", "OpenCode server is ready");

      // MCP config is written by entrypoint.sh before supervisord starts,
      // so OpenCode already has MCP tools available at this point.
      await jobLog(
        job,
        "conversations",
        "OpenCode server ready with MCP config (injected via entrypoint)",
      );

      // Inject skills into the container
      await injectSkillsIntoContainer(containerId, subResourceId, (message) =>
        jobLog(job, "conversations", message),
      );

      // Update conversation with container info and OpenCode URL
      conversation.environment = {
        container: containerId,
        status: "running",
        opencodeUrl: opencodeUrl,
        hostPort: hostPort,
        opencodeSessionId: null, // Will be set when first session is created
        errorMessage: null,
        // Public URLs (overlay mode only, used by frontend)
        publicUrl: publicBaseUrl,
        publicCodeServerUrl: publicBaseUrl ? `${publicBaseUrl}/code` : null,
        // Host-port mode URLs (backward compat)
        codeServerUrl: codeServerHostPort
          ? `http://localhost:${codeServerHostPort}`
          : publicBaseUrl
            ? `${publicBaseUrl}/code`
            : null,
        codeServerPort: codeServerHostPort,
        appUrl: appHostPort ? `http://localhost:${appHostPort}` : null,
        appPort: appHostPort,
        postgresPort: postgresHostPort,
      };
      await conversation.save();

      await jobLog(
        job,
        "conversations",
        "Conversation environment setup complete",
      );

      return {
        success: true,
        containerId,
        opencodeUrl,
        hostPort,
        publicUrl: publicBaseUrl,
        codeServerPort: codeServerHostPort,
        appPort: appHostPort,
        postgresPort: postgresHostPort,
      };
    } catch (error) {
      await jobLog(job, "conversations", `Setup failed: ${error.message}`);
      queueLogger.error(
        { err: error, jobId: job.id, conversationId: job.data.conversationId },
        `Conversation setup job ${job.id} failed: ${error.message}`,
      );

      // Update conversation status to indicate failure
      try {
        const conversation = await Conversation.findById(
          job.data.conversationId,
        );
        if (conversation) {
          conversation.environment = {
            container: conversation.environment?.container || "",
            status: "error",
            opencodeUrl: null,
            hostPort: null,
            opencodeSessionId: null,
            errorMessage: error.message,
          };
          await conversation.save();
        }
      } catch (updateError) {
        queueLogger.error(
          { err: updateError, conversationId: job.data.conversationId },
          "Failed to update conversation status",
        );
      }

      throw error;
    }
  },
  redisConfig,
);

conversationsWorker.on("active", (job) => {
  queueLogger.debug({ jobId: job.id, queue: "conversations" }, `Conversation job ${job.id} is now active`);
  emitJobEvent("job.active", job, "conversations");
});

conversationsWorker.on("completed", (job) => {
  queueLogger.info({ jobId: job.id, queue: "conversations" }, `Conversation job ${job.id} completed`);
  emitJobEvent("job.completed", job, "conversations");
});

conversationsWorker.on("failed", (job, err) => {
  queueLogger.error(
    { jobId: job.id, queue: "conversations", error: err.message },
    `Conversation job ${job.id} failed: ${err.message}`,
  );
  emitJobEvent("job.failed", job, "conversations", { error: err.message });
});

queueLogger.info("Conversations Worker is running and listening for jobs");

export { conversationsWorker };
