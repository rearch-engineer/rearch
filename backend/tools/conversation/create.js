import queue from '../../queue';

/**
 * Trigger a BullMQ job to set up a conversation environment
 * @param {string} conversationId - The ID of the conversation
 * @param {string} repositoryId - The ID of the repository resource
 * @param {string} subResourceId - The ID of the subresource (repository)
 */
export const createConversation = async (conversationId, repositoryId, subResourceId) => {
  try {
    await queue.addJobToQueue('conversations', 'setup-conversation', {
      conversationId,
      repositoryId,
      subResourceId
    });
    console.log(`✅ Conversation setup job added for conversation ${conversationId}`);
  } catch (error) {
    console.error(`❌ Failed to add conversation setup job:`, error);
    throw error;
  }
};
