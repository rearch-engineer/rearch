import { tool } from 'ai';
import { z } from 'zod';

export const createJiraTask = tool({
  description: 'Create a new task in Jira',
  inputSchema: z.object({
    projectId: z.string().describe('The ID of the Jira project'),
    summary: z.string().describe('A brief summary of the task'),
    description: z.string().optional().describe('A detailed description of the task'),
  }),
  execute: async ({ projectId, summary, description }) => {
    const ticketId = 'JIRA-' + Math.floor(Math.random() * 10000);
    
    return {
      ticketId,
      projectId,
      summary,
      description: description || '',
      status: 'Created',
    };
  }
});

export const metadata = {
  category: 'jira',
  description: 'Create and manage tasks in Jira.',
};
