import queue from "../../queue";

/**
 * Trigger a BullMQ job to set up a conversation environment.
 *
 * @param {string} conversationId - The ID of the conversation
 * @param {string} agentId - The ID of the Agent the conversation runs with
 * @param {{ connectionId?: string, resourceId?: string }} [legacy]
 *   Optional identifiers of the connection + repository resource. They
 *   are only carried in the job payload for logging/backward compatibility;
 *   the worker resolves everything from the agent.
 */
export const createConversation = async (
  conversationId,
  agentId,
  legacy = {},
) => {
  try {
    await queue.addJobToQueue("conversations", "setup-conversation", {
      conversationId,
      agentId: agentId ? agentId.toString() : null,
      ...(legacy.connectionId ? { connectionId: legacy.connectionId } : {}),
      ...(legacy.resourceId ? { resourceId: legacy.resourceId } : {}),
    });
    console.log(
      `✅ Conversation setup job added for conversation ${conversationId}`,
    );
  } catch (error) {
    console.error(`❌ Failed to add conversation setup job:`, error);
    throw error;
  }
};
