import queue from '../../queue';

/**
 * Trigger a BullMQ job to destroy a conversation environment
 * @param {string} conversationId - The ID of the conversation
 */
export const destroyConversation = async (conversationId) => {
  try {
    await queue.addJobToQueue('conversations', 'destroy-conversation', {
      conversationId
    });
    console.log(`Conversation destroy job added for conversation ${conversationId}`);
  } catch (error) {
    console.error(`Failed to add conversation destroy job:`, error);
    throw error;
  }
};
