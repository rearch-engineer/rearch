import { createOpencodeClient } from "@opencode-ai/sdk/v2/client";
import Docker from "dockerode";
import Conversation from "../models/Conversation.js";
import SubResource from "../models/SubResource.js";
import { downloadFileStream } from "./gridfs.js";
import { broadcast } from "../ws.js";
import { execInContainer } from "./containerExec.js";

const docker = new Docker();

// Cache for OpenCode clients to avoid recreating connections
const clientCache = new Map();

/**
 * Get or create an OpenCode client for a conversation's container
 * @param {string} conversationId - The conversation ID
 * @returns {Promise<Object>} OpenCode client instance
 */
export async function getContainerClient(conversationId) {
  const conversation = await Conversation.findById(conversationId);

  if (!conversation) {
    throw new Error("Conversation not found");
  }

  if (!conversation.environment?.opencodeUrl) {
    throw new Error("Container not ready or OpenCode URL not available");
  }

  if (conversation.environment.status !== "running") {
    throw new Error(
      `Container is not running (status: ${conversation.environment.status})`,
    );
  }

  const cacheKey = `${conversationId}-${conversation.environment.opencodeUrl}`;

  // Return cached client if available
  if (clientCache.has(cacheKey)) {
    return clientCache.get(cacheKey);
  }

  // Create new client
  const client = createOpencodeClient({
    baseUrl: conversation.environment.opencodeUrl,
  });

  // Verify connection is healthy
  try {
    const health = await client.global.health();
    if (!health.data?.healthy) {
      throw new Error("OpenCode server is not healthy");
    }
  } catch (error) {
    throw new Error(`Failed to connect to OpenCode server: ${error.message}`);
  }

  // Cache the client
  clientCache.set(cacheKey, client);

  return client;
}

/**
 * Get or create an OpenCode session for a conversation
 * @param {string} conversationId - The conversation ID
 * @returns {Promise<{client: Object, sessionId: string}>} Client and session ID
 */
export async function getOrCreateSession(conversationId) {
  const client = await getContainerClient(conversationId);
  const conversation = await Conversation.findById(conversationId);

  // Check if we already have a session
  if (conversation.environment.opencodeSessionId) {
    try {
      // Verify session still exists
      const session = await client.session.get({
        sessionID: conversation.environment.opencodeSessionId,
      });

      if (session.data) {
        return {
          client,
          sessionId: conversation.environment.opencodeSessionId,
          isNew: false,
        };
      }
    } catch (error) {
      // Session doesn't exist anymore, create a new one
      console.log(
        `Previous session ${conversation.environment.opencodeSessionId} not found, creating new one`,
      );
    }
  }

  // Create new session
  const session = await client.session.create({
    title: conversation.title || `Conversation ${conversationId}`,
  });

  const sessionId = session.data.id;

  // Save session ID to conversation
  conversation.environment.opencodeSessionId = sessionId;
  await conversation.save();

  return {
    client,
    sessionId,
    isNew: true,
  };
}



// Maximum file size for inline data URL encoding (10MB)
const MAX_INLINE_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Convert file attachment references to OpenCode FilePartInput objects.
 * Fetches file content from GridFS and encodes as base64 data URLs.
 * Files exceeding MAX_INLINE_FILE_SIZE are skipped with a warning.
 *
 * @param {Array<{fileId: string, filename: string, contentType: string, size: number}>} files
 * @returns {Promise<Array<{type: "file", mime: string, filename: string, url: string}>>}
 */
async function filesToParts(files) {
  if (!files || files.length === 0) return [];

  const parts = [];

  for (const file of files) {
    // Skip files that exceed the size cap
    if (file.size && file.size > MAX_INLINE_FILE_SIZE) {
      console.warn(
        `Skipping file "${file.filename}" (${(file.size / 1024 / 1024).toFixed(1)}MB) — exceeds ${MAX_INLINE_FILE_SIZE / 1024 / 1024}MB inline limit`,
      );
      continue;
    }

    try {
      const stream = downloadFileStream(file.fileId);
      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      const base64 = buffer.toString("base64");
      const dataUrl = `data:${file.contentType};base64,${base64}`;

      parts.push({
        type: "file",
        mime: file.contentType,
        filename: file.filename,
        url: dataUrl,
      });
    } catch (err) {
      console.error(
        `Failed to read file "${file.filename}" from GridFS:`,
        err.message,
      );
    }
  }

  return parts;
}

/**
 * Send a prompt to the container agent and get the response
 * OpenCode stores messages internally; no local DB saving needed.
 * @param {string} conversationId - The conversation ID
 * @param {string} prompt - The user prompt
 * @param {Object} options - Configuration options
 * @returns {Promise<Object>} The response from OpenCode
 */
export async function sendPrompt(conversationId, prompt, options = {}) {
  const { client, sessionId } = await getOrCreateSession(conversationId);

  // Broadcast busy status via WebSocket
  broadcast("conversation.busy", { conversationId });

  // Convert attached files to OpenCode FilePartInput objects
  const fileParts = await filesToParts(options.files);

  const promptParams = {
    sessionID: sessionId,
    model: options.model || {
      providerID: "anthropic",
      modelID: "claude-sonnet-4-20250514",
    },
    parts: [{ type: "text", text: prompt }, ...fileParts],
  };
  if (options.agent) {
    promptParams.agent = options.agent;
  }

  const response = await client.session.prompt(promptParams);

  // Broadcast idle status via WebSocket
  broadcast("conversation.idle", { conversationId });

  // Fetch latest session info, persist to MongoDB, and push via Socket.IO
  try {
    const sessionInfo = await getSessionInfo(conversationId);

    await Conversation.findByIdAndUpdate(conversationId, {
      contextUsage: sessionInfo.contextUsage,
      cost: sessionInfo.cost,
      updatedAt: new Date(),
    });

    // Push real-time update via WebSocket
    broadcast("conversation.sessionInfo", {
      conversationId,
      contextUsage: sessionInfo.contextUsage,
      cost: sessionInfo.cost,
    });
  } catch (err) {
    console.error("Error updating session info after prompt:", err.message);
    // Still update the timestamp even if session info fetch fails
    await Conversation.findByIdAndUpdate(conversationId, {
      updatedAt: new Date(),
    });
  }

  return response;
}

/**
 * Send a prompt asynchronously and stream events
 * OpenCode stores messages internally; no local DB saving needed.
 * @param {string} conversationId - The conversation ID
 * @param {string} prompt - The user prompt
 * @param {Object} options - Configuration options
 * @yields {Object} Event objects from the OpenCode stream
 */
export async function* streamPrompt(conversationId, prompt, options = {}) {
  const { client, sessionId, isNew } = await getOrCreateSession(conversationId);

  // Yield session info
  yield {
    type: "session.info",
    sessionId,
    isNew,
    conversationId,
  };

  // Broadcast busy status via WebSocket so all clients (including other tabs) know
  broadcast("conversation.busy", { conversationId });

  // Subscribe to events before sending prompt
  const events = await client.event.subscribe();

  // Track assistant message for response.complete event
  let currentAssistantMessageId = null;

  // Convert attached files to OpenCode FilePartInput objects
  const fileParts = await filesToParts(options.files);

  // Build prompt parameters
  const promptParams = {
    sessionID: sessionId,
    model: options.model || {
      providerID: "anthropic",
      modelID: "claude-sonnet-4-20250514",
    },
    parts: [{ type: "text", text: prompt }, ...fileParts],
  };
  if (options.agent) {
    promptParams.agent = options.agent;
  }

  // Send prompt asynchronously (don't wait for full response)
  const promptPromise = client.session.prompt(promptParams);

  // Stream events
  try {
    for await (const event of events.stream) {
      // Normalize event data: support both SDK-wrapped (event.properties) and flat event shapes.
      const props = event.properties || event;
      const eventType = event.type;

      // Filter to our session
      const eventSessionId = props.sessionID || props.session_id;
      if (eventSessionId && eventSessionId !== sessionId) {
        continue;
      }

      // --- Handle message.updated (new message created) ---
      if (eventType === "message.updated") {
        const info = props.info;
        if (info?.role === "assistant" && !currentAssistantMessageId) {
          currentAssistantMessageId = info.id;
        }
      }

      // --- Handle message.part.delta (incremental text streaming) ---
      if (eventType === "message.part.delta") {
        // Just forward the event — no DB saving
      }

      // --- Handle message.part.updated (part snapshot) ---
      if (eventType === "message.part.updated") {
        const part = props.part;

        // Tool part — emit tool.state.saved event for frontend
        if (part?.type === "tool") {
          const stateType = part.state?.type || "pending";
          yield {
            type: "tool.state.saved",
            toolCallId: part.callID,
            toolName: part.tool,
            state: stateType,
          };

          // If this is a completed tool part with truncated output, enrich it
          // before forwarding so the frontend receives the full content inline.
          if (
            part.state?.status === "completed" &&
            part.state?.metadata?.truncated === true &&
            part.state.metadata.outputPath &&
            !part.state.metadata.truncatedContent
          ) {
            const content = await readTruncatedOutput(
              conversationId,
              part.state.metadata.outputPath,
            );
            if (content !== null) {
              part.state.metadata.truncatedContent = content;
            }
          }
        }
      }

      // --- Handle question.asked (agent is asking the user a question) ---
      if (eventType === "question.asked") {
        const questionRequest = props;

        // Yield the question event to the SSE client
        yield {
          type: "question.asked",
          requestId: questionRequest.id,
          sessionID: questionRequest.sessionID,
          questions: questionRequest.questions,
          tool: questionRequest.tool || null,
        };

        // Do NOT break — the stream stays open waiting for the user to answer
        continue;
      }

      // --- Handle question.replied (user answered, agent continues) ---
      if (eventType === "question.replied") {
        yield {
          type: "question.replied",
          requestId: props.requestID,
          answers: props.answers,
        };
        continue;
      }

      // --- Handle question.rejected (user dismissed the question) ---
      if (eventType === "question.rejected") {
        yield {
          type: "question.rejected",
          requestId: props.requestID,
        };
        continue;
      }

      // --- Handle permission.asked (agent needs permission for an action) ---
      if (eventType === "permission.asked") {
        const permissionRequest = props;

        yield {
          type: "permission.asked",
          requestId: permissionRequest.id,
          sessionID: permissionRequest.sessionID,
          permission: permissionRequest.permission,
          patterns: permissionRequest.patterns,
          metadata: permissionRequest.metadata,
          always: permissionRequest.always,
          tool: permissionRequest.tool || null,
        };

        // Do NOT break — the stream stays open waiting for the user to respond
        continue;
      }

      // --- Handle permission.replied (user responded to permission request) ---
      if (eventType === "permission.replied") {
        yield {
          type: "permission.replied",
          requestId: props.requestID,
          sessionID: props.sessionID,
          reply: props.reply,
        };
        continue;
      }

      // Yield event to client — flatten the structure for downstream consumers
      if (event.properties) {
        yield {
          type: eventType,
          ...event.properties,
        };
      } else {
        yield { ...event };
      }

      // --- Check for completion ---
      if (eventType === "session.idle" || eventType === "session.error") {
        break;
      }
    }
  } catch (error) {
    yield {
      type: "error",
      error: error.message,
    };
  }

  // Wait for prompt to complete (cleanup)
  try {
    await promptPromise;
  } catch (error) {
    console.error("Prompt error:", error.message);
    yield {
      type: "error",
      error: error.message,
    };
  }

  // Fetch latest session info, persist to MongoDB, and push via Socket.IO
  let updatedContextUsage = null;
  let updatedCost = null;
  try {
    const sessionInfo = await getSessionInfo(conversationId);
    updatedContextUsage = sessionInfo.contextUsage;
    updatedCost = sessionInfo.cost;

    await Conversation.findByIdAndUpdate(conversationId, {
      contextUsage: updatedContextUsage,
      cost: updatedCost,
      updatedAt: new Date(),
    });

    // Push real-time update via WebSocket
    broadcast("conversation.sessionInfo", {
      conversationId,
      contextUsage: updatedContextUsage,
      cost: updatedCost,
    });
  } catch (err) {
    console.error("Error updating session info after prompt:", err.message);
    await Conversation.findByIdAndUpdate(conversationId, {
      updatedAt: new Date(),
    });
  }

  // Broadcast idle status via WebSocket
  broadcast("conversation.idle", { conversationId });

  yield {
    type: "response.complete",
    assistantMessageId: currentAssistantMessageId,
    ...(updatedContextUsage && { contextUsage: updatedContextUsage }),
    ...(updatedCost && { cost: updatedCost }),
  };
}

/**
 * Read a truncated tool output file from inside the conversation's container
 * and return its content as a string. Returns null on failure.
 * @param {string} conversationId
 * @param {string} outputPath - Absolute path inside the container
 */
async function readTruncatedOutput(conversationId, outputPath) {
  try {
    const conversation = await Conversation.findById(conversationId).select(
      "environment.container",
    );
    const containerId = conversation?.environment?.container;
    if (!containerId || !outputPath) return null;

    const result = await execInContainer(
      containerId,
      `cat "${outputPath}"`,
      { timeout: 10000 },
    );

    if (result.exitCode === 0 && result.stdout) {
      return result.stdout;
    }
    return null;
  } catch (err) {
    console.warn(
      `[truncatedOutput] Could not read ${outputPath}:`,
      err.message,
    );
    return null;
  }
}

/**
 * Post-process messages: for any tool part whose state.metadata.truncated is
 * true, read the full output from the container and attach it as
 * state.metadata.truncatedContent.
 * @param {string} conversationId
 * @param {Array} messages - Raw messages from OpenCode SDK
 */
async function enrichTruncatedToolOutputs(conversationId, messages) {
  const enrichPromises = [];

  for (const message of messages) {
    if (!Array.isArray(message.parts)) continue;
    for (const part of message.parts) {
      if (
        part.type === "tool" &&
        part.state?.metadata?.truncated === true &&
        part.state.metadata.outputPath &&
        !part.state.metadata.truncatedContent
      ) {
        enrichPromises.push(
          readTruncatedOutput(conversationId, part.state.metadata.outputPath).then(
            (content) => {
              if (content !== null) {
                part.state.metadata.truncatedContent = content;
              }
            },
          ),
        );
      }
    }
  }

  await Promise.all(enrichPromises);
  return messages;
}

/**
 * Get messages from an OpenCode session
 * @param {string} conversationId - The conversation ID
 * @returns {Promise<Array>} Array of messages
 */
export async function getSessionMessages(conversationId) {
  const { client, sessionId } = await getOrCreateSession(conversationId);

  const messages = await client.session.messages({
    sessionID: sessionId,
  });

  const rawMessages = messages.data;
  await enrichTruncatedToolOutputs(conversationId, rawMessages);
  return rawMessages;
}

/**
 * Execute a slash command in the OpenCode session
 * @param {string} conversationId - The conversation ID
 * @param {string} command - The command name (e.g., 'init', 'help')
 * @param {Object} args - Command arguments
 * @returns {Promise<Object>} Command response
 */
export async function executeCommand(conversationId, command, args = {}) {
  const { client, sessionId } = await getOrCreateSession(conversationId);

  const response = await client.session.command({
    sessionID: sessionId,
    command,
    arguments: args,
  });

  return response;
}

/**
 * Abort a running session
 * @param {string} conversationId - The conversation ID
 * @returns {Promise<boolean>} True if aborted successfully
 */
export async function abortSession(conversationId) {
  const { client, sessionId } = await getOrCreateSession(conversationId);

  const result = await client.session.abort({
    sessionID: sessionId,
  });

  return result.data;
}

/**
 * Query session statuses for a batch of conversations with running containers.
 * Groups by opencodeUrl to minimise network calls (one call per unique container).
 *
 * @param {Array<Object>} conversations - Mongoose conversation docs with environment populated
 * @returns {Promise<Object>} Map of conversationId → "busy" | "idle" | null
 */
export async function getSessionStatuses(conversations) {
  const result = {};

  // Only consider conversations with a running container and a session
  const eligible = conversations.filter(
    (c) =>
      c.environment?.status === "running" &&
      c.environment?.opencodeUrl &&
      c.environment?.opencodeSessionId,
  );

  if (eligible.length === 0) return result;

  // Group by opencodeUrl so we make one status() call per container
  const byUrl = new Map();
  for (const conv of eligible) {
    const url = conv.environment.opencodeUrl;
    if (!byUrl.has(url)) byUrl.set(url, []);
    byUrl.get(url).push(conv);
  }

  await Promise.all(
    Array.from(byUrl.entries()).map(async ([url, convs]) => {
      try {
        const client = createOpencodeClient({ baseUrl: url });
        const statusResp = await client.session.status();
        const statusMap = statusResp.data || {};

        for (const conv of convs) {
          const sessionStatus = statusMap[conv.environment.opencodeSessionId];
          result[conv._id.toString()] = sessionStatus?.type || "idle";
        }
      } catch (err) {
        // Container unreachable — mark all its conversations as idle
        for (const conv of convs) {
          result[conv._id.toString()] = null;
        }
      }
    }),
  );

  return result;
}

/**
 * Get the status of a conversation's container and OpenCode server
 * @param {string} conversationId - The conversation ID
 * @returns {Promise<Object>} Status information
 */
export async function getContainerStatus(conversationId) {
  const conversation = await Conversation.findById(conversationId);

  if (!conversation) {
    return { status: "not_found" };
  }

  const status = {
    conversationId,
    containerStatus: conversation.environment?.status || "unknown",
    containerId: conversation.environment?.container || null,
    opencodeUrl: conversation.environment?.opencodeUrl || null,
    sessionId: conversation.environment?.opencodeSessionId || null,
    errorMessage: conversation.environment?.errorMessage || null,
    serverHealthy: false,
  };

  // Check OpenCode server health if URL is available
  if (
    conversation.environment?.opencodeUrl &&
    conversation.environment?.status === "running"
  ) {
    try {
      const client = await getContainerClient(conversationId);
      const health = await client.global.health();
      status.serverHealthy = health.data?.healthy || false;
      status.serverVersion = health.data?.version;
    } catch (error) {
      status.serverHealthy = false;
      status.healthCheckError = error.message;
    }
  }

  // Reconcile: if stored status is "running" but health check failed,
  // verify actual Docker container state and update MongoDB accordingly
  if (
    status.containerStatus === "running" &&
    !status.serverHealthy
  ) {
    let containerRunning = false;

    if (status.containerId) {
      try {
        const container = docker.getContainer(status.containerId);
        const info = await container.inspect();
        containerRunning = info.State.Running === true;
      } catch (inspectError) {
        // Container doesn't exist or can't be inspected — treat as stopped
        containerRunning = false;
      }
    }

    if (!containerRunning) {
      // Docker container is not running — update DB to "stopped"
      conversation.environment.status = "stopped";
      conversation.environment.statusChangedAt = new Date();
      await conversation.save();
      status.containerStatus = "stopped";
    } else {
      // Container is running but OpenCode SDK is unhealthy — update DB to "error"
      conversation.environment.status = "error";
      conversation.environment.statusChangedAt = new Date();
      conversation.environment.errorMessage =
        status.healthCheckError || "OpenCode server is not healthy";
      await conversation.save();
      status.containerStatus = "error";
      status.errorMessage =
        conversation.environment.errorMessage;
    }
  }

  return status;
}

/**
 * Get available providers and models from the container's OpenCode instance
 * @param {string} conversationId - The conversation ID
 * @returns {Promise<Object>} Provider list with models, defaults, and connected providers
 */
export async function getProviders(conversationId) {
  const client = await getContainerClient(conversationId);
  const result = await client.provider.list();
  return result.data;
}

/**
 * Get available agents from the container's OpenCode instance
 * Returns only user-facing agents (primary or all mode, not hidden, not internal)
 * @param {string} conversationId - The conversation ID
 * @returns {Promise<Array>} Array of agent objects
 */
export async function getAgents(conversationId) {
  const client = await getContainerClient(conversationId);
  const result = await client.app.agents();

  const internalAgents = ["title", "summary", "compaction"];
  const agents = (result.data || []).filter(
    (a) =>
      !a.hidden &&
      !internalAgents.includes(a.name) &&
      (a.mode === "primary" || a.mode === "all"),
  );

  return agents;
}

/**
 * Get session info including repo name, context window usage, and cost
 * @param {string} conversationId - The conversation ID
 * @returns {Promise<Object>} Session info with repoName, contextUsage, cost
 */
export async function getSessionInfo(conversationId) {
  const conversation = await Conversation.findById(conversationId);
  if (!conversation) {
    throw new Error("Conversation not found");
  }

  // Get repository name from subResource
  let repoName = "Unknown";
  if (conversation.subResource) {
    const subResource = await SubResource.findById(conversation.subResource);
    if (subResource) {
      repoName = subResource.name;
    }
  }

  // Default response when container isn't ready
  const info = {
    repoName,
    contextUsage: { used: 0, limit: 0, percent: 0 },
    cost: { total: 0, currency: "USD" },
  };

  // If container is not running, return defaults
  if (
    !conversation.environment?.opencodeUrl ||
    conversation.environment?.status !== "running"
  ) {
    return info;
  }

  try {
    const client = await getContainerClient(conversationId);
    const sessionId = conversation.environment.opencodeSessionId;

    if (!sessionId) {
      return info;
    }

    // Get all messages in the session to compute cost and token usage
    const messagesResult = await client.session.messages({
      sessionID: sessionId,
    });
    const messages = messagesResult.data || [];

    let totalCost = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalReasoningTokens = 0;
    let modelID = null;
    let providerID = null;

    for (const msg of messages) {
      const msgInfo = msg.info;
      if (msgInfo?.role === "assistant") {
        totalCost += msgInfo.cost || 0;
        if (msgInfo.tokens) {
          totalInputTokens += msgInfo.tokens.input || 0;
          totalOutputTokens += msgInfo.tokens.output || 0;
          totalReasoningTokens += msgInfo.tokens.reasoning || 0;
        }
        // Track the most recent model used
        if (msgInfo.modelID) modelID = msgInfo.modelID;
        if (msgInfo.providerID) providerID = msgInfo.providerID;
      }
    }

    // Get context window limit from provider info
    let contextLimit = 0;
    if (modelID && providerID) {
      try {
        const providers = await client.provider.list();
        const providerData = (providers.data?.all || []).find(
          (p) => p.id === providerID,
        );
        if (providerData?.models?.[modelID]) {
          contextLimit = providerData.models[modelID].limit?.context || 0;
        }
      } catch (e) {
        console.error(
          "Error fetching provider info for context limit:",
          e.message,
        );
      }
    }

    const totalTokensUsed =
      totalInputTokens + totalOutputTokens + totalReasoningTokens;
    const contextPercent =
      contextLimit > 0
        ? Math.min(100, Math.round((totalTokensUsed / contextLimit) * 100))
        : 0;

    info.contextUsage = {
      used: totalTokensUsed,
      limit: contextLimit,
      percent: contextPercent,
    };
    info.cost = {
      total: Math.round(totalCost * 10000) / 10000, // round to 4 decimal places
      currency: "USD",
    };
  } catch (error) {
    console.error("Error computing session info:", error.message);
  }

  return info;
}

/**
 * Reply to a question asked by the OpenCode agent during a session.
 * @param {string} conversationId - The conversation ID
 * @param {string} requestID - The question request ID (from QuestionRequest.id)
 * @param {Array<Array<string>>} answers - Array of answers, one per question. Each answer is an array of selected option labels.
 * @returns {Promise<Object>} Reply result
 */
export async function replyToQuestion(conversationId, requestID, answers) {
  const client = await getContainerClient(conversationId);

  const result = await client.question.reply({
    requestID,
    answers,
  });

  return result.data;
}

/**
 * Reject (dismiss) a question asked by the OpenCode agent during a session.
 * @param {string} conversationId - The conversation ID
 * @param {string} requestID - The question request ID (from QuestionRequest.id)
 * @returns {Promise<Object>} Reject result
 */
export async function rejectQuestion(conversationId, requestID) {
  const client = await getContainerClient(conversationId);

  const result = await client.question.reject({
    requestID,
  });

  return result.data;
}

/**
 * Reply to a permission request from the OpenCode agent during a session.
 * @param {string} conversationId - The conversation ID
 * @param {string} requestID - The permission request ID (from PermissionRequest.id)
 * @param {"once"|"always"|"reject"} reply - The permission response
 * @param {string} [message] - Optional explanation message (useful when rejecting)
 * @returns {Promise<Object>} Reply result
 */
export async function replyToPermission(conversationId, requestID, reply, message) {
  const client = await getContainerClient(conversationId);

  const params = { requestID, reply };
  if (message) {
    params.message = message;
  }

  const result = await client.permission.reply(params);

  return result.data;
}

/**
 * Clear the client cache for a conversation (useful when container restarts)
 * @param {string} conversationId - The conversation ID
 */
export function clearClientCache(conversationId) {
  for (const [key] of clientCache) {
    if (key.startsWith(conversationId)) {
      clientCache.delete(key);
    }
  }
}

/**
 * Clear all cached clients
 */
export function clearAllClientCache() {
  clientCache.clear();
}

export default {
  getContainerClient,
  getOrCreateSession,
  sendPrompt,
  streamPrompt,
  getSessionMessages,
  executeCommand,
  abortSession,
  getContainerStatus,
  getProviders,
  getAgents,
  getSessionInfo,
  replyToQuestion,
  rejectQuestion,
  replyToPermission,
  clearClientCache,
  clearAllClientCache,
};
