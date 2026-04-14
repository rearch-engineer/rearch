import { Worker } from "bullmq";

import Resource from "../models/Resource.js";
import SubResource from "../models/SubResource.js";
import Conversation from "../models/Conversation.js";
import config from "../config.js";
import { clearClientCache } from "../utils/opencodeContainer.js";

import { redisConfig, docker } from "./config.js";
import { broadcast } from "../ws.js";
import { emitJobEvent, jobLog } from "./events.js";
import { waitForOpencodeReady, injectSkillsIntoContainer } from "./helpers.js";
import { createConversationContainer } from "./createConversationContainer.js";
import { CLEANUP_JOB_NAME, triggerContainerCleanup } from "./scheduler.js";
import { buildProviderConfig } from "../utils/llmProviderConfig.js";

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
        statusChangedAt: new Date(),
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

    // ── Cleanup idle containers ─────────────────────────────────────────
    if (job.name === CLEANUP_JOB_NAME) {
      console.log("🧹 Running scheduled container cleanup...");
      const result = await triggerContainerCleanup();
      console.log(
        `🧹 Cleanup complete: ${result.stoppedCount} container(s) stopped`,
      );
      return { success: true, ...result };
    }

    // ── Restart conversation (auto-restart stopped/errored containers) ──
    if (job.name === "restart-conversation") {
      const { conversationId, repositoryId, subResourceId } = job.data;

      await jobLog(
        job,
        "conversations",
        `Restarting conversation ${conversationId}`,
      );
      console.log(`♻️ Restarting conversation ${conversationId}`);

      const conversation = await Conversation.findById(conversationId);
      if (!conversation) {
        throw new Error("Conversation not found");
      }

      const containerId = conversation.environment?.container;
      let restarted = false;

      // Try restarting the existing Docker container
      if (containerId) {
        try {
          const container = docker.getContainer(containerId);
          await container.start();
          await jobLog(
            job,
            "conversations",
            `Container ${containerId} restarted`,
          );
          console.log(
            `♻️ Container ${containerId} restarted for conversation ${conversationId}`,
          );

          // Rediscover port mapping from the running container
          // (stored values are nulled when the scheduler stops a container)
          const inspectData = await container.inspect();
          const portBindings = inspectData.NetworkSettings?.Ports || {};
          const opencodePortBinding = portBindings["4096/tcp"];
          const hostPort = opencodePortBinding?.[0]?.HostPort
            ? Number(opencodePortBinding[0].HostPort)
            : null;

          // Check overlay network mode (no host port, use container network alias)
          let opencodeUrl;
          if (hostPort) {
            opencodeUrl = `http://localhost:${hostPort}`;
          } else {
            // Overlay mode: use container name on the Docker network
            opencodeUrl = `http://rearch_session_${conversationId}:4096`;
          }

          await jobLog(
            job,
            "conversations",
            `Waiting for OpenCode server at ${opencodeUrl}`,
          );
          await waitForOpencodeReady(opencodeUrl);
          await jobLog(job, "conversations", "OpenCode server is ready");

          // Reinject skills
          await injectSkillsIntoContainer(
            containerId,
            subResourceId,
            (message) => jobLog(job, "conversations", message),
          );

          // Restore environment status with rediscovered URLs
          conversation.environment = {
            ...conversation.environment,
            status: "running",
            statusChangedAt: new Date(),
            errorMessage: null,
            opencodeUrl,
            hostPort,
          };
          await conversation.save();
          broadcast("conversation.environment.status", {
            conversationId,
            status: "running",
          });

          await jobLog(
            job,
            "conversations",
            "Conversation restarted successfully",
          );
          restarted = true;
        } catch (startErr) {
          // Container is gone or cannot be started — clean it up before fallback
          await jobLog(
            job,
            "conversations",
            `Container restart failed: ${startErr.message}, will create new container`,
          );
          console.log(
            `♻️ Container restart failed for ${conversationId}: ${startErr.message}`,
          );
          clearClientCache(conversationId);

          // Stop and remove the old container so the fallback can reuse the name
          try {
            const oldContainer = docker.getContainer(containerId);
            try {
              await oldContainer.stop();
            } catch (_) {
              /* already stopped */
            }
            await oldContainer.remove();
            await jobLog(
              job,
              "conversations",
              `Old container ${containerId} removed`,
            );
          } catch (_) {
            /* container already gone */
          }
        }
      }

      if (!restarted) {
        // Fall through to full setup-conversation logic below
        await jobLog(
          job,
          "conversations",
          "Falling back to full container setup",
        );
      } else {
        return { success: true, conversationId, restarted: true };
      }
    }

    // ── Setup conversation ───────────────────────────────────────────────
    try {
      const { conversationId, repositoryId, subResourceId } = job.data;

      await jobLog(
        job,
        "conversations",
        `Setting up conversation ${conversationId}`,
      );
      console.log(
        `Setting up conversation ${conversationId} with repository ${repositoryId}, subResource ${subResourceId}`,
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
        statusChangedAt: new Date(),
      };
      await conversation.save();
      broadcast("conversation.environment.status", {
        conversationId,
        status: "starting",
      });

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
        console.log(
          `Using custom container image from subresource: ${containerImage}`,
        );
      }
      if (!containerImage) {
        throw new Error(
          "CONVERSATION_CONTAINER_IMAGE environment variable not set",
        );
      }

      // Build LLM provider config from admin-managed LlmProvider collection
      const providerConfig = await buildProviderConfig();
      const enabledProviderCount = Object.keys(providerConfig).length;
      if (enabledProviderCount === 0) {
        throw new Error(
          "No LLM providers configured. An administrator must configure at least one LLM provider with an API key in the Administration panel.",
        );
      }
      console.log(
        `✅ ${enabledProviderCount} LLM provider(s) configured: ${Object.keys(providerConfig).join(", ")}`,
      );

      await jobLog(
        job,
        "conversations",
        `Creating container with image: ${containerImage}`,
      );
      console.log(`Creating container with image: ${containerImage}`);

      // Get optional environment variables for Node.js app containers
      const appPort = repository.data.appPort || "3000";
      const appStartCommand = repository.data.appStartCommand || "npm run dev";

      // Get credentials from the parent resource based on provider type
      const provider = repository.provider || "bitbucket";
      let gitEmail = "";
      let gitToken = "";

      if (provider === "github") {
        // For GitHub Apps, generate an installation access token
        const { getInstallationToken } =
          await import("../utils/github/github.js");
        gitToken = await getInstallationToken(repository.data);
        gitEmail = "github-app@users.noreply.github.com";
      } else {
        // Bitbucket: use email + API token
        gitEmail = repository.data.email || "";
        gitToken = repository.data.apiToken || "";
      }

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
        providerConfig,
        appPort,
        appStartCommand,
        gitEmail,
        gitToken,
        gitProvider: provider,
        rearchServices: subResource.rearch?.services || [],
        resourceConstraints: subResource.rearch?.resources || {},
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
        statusChangedAt: new Date(),
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
      broadcast("conversation.environment.status", {
        conversationId,
        status: "running",
      });

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
      console.error(
        `❌ Conversation setup job ${job.id} failed:`,
        error.message,
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
            statusChangedAt: new Date(),
            opencodeUrl: null,
            hostPort: null,
            opencodeSessionId: null,
            errorMessage: error.message,
          };
          await conversation.save();
          broadcast("conversation.environment.status", {
            conversationId: job.data.conversationId,
            status: "error",
          });
        }
      } catch (updateError) {
        console.error("Failed to update conversation status:", updateError);
      }

      throw error;
    }
  },
  redisConfig,
);

conversationsWorker.on("active", (job) => {
  console.log(`Conversation job ${job.id} is now active`);
  emitJobEvent("job.active", job, "conversations");
});

conversationsWorker.on("completed", (job) => {
  console.log(`Conversation job ${job.id} has been completed`);
  emitJobEvent("job.completed", job, "conversations");
});

conversationsWorker.on("failed", (job, err) => {
  console.error(
    `Conversation job ${job.id} has failed with error: ${err.message}`,
  );
  emitJobEvent("job.failed", job, "conversations", { error: err.message });
});

console.log("✅ Conversations Worker is running and listening for jobs");

export { conversationsWorker };
