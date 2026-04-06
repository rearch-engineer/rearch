/**
 * Bitbucket provider tool definitions
 * Defines AI tools for interacting with Bitbucket repositories
 */

import { tool } from 'ai';
import { z } from 'zod';
import { searchRepositories, getRepositoryDetails } from '../../utils/attlasian/bitbucket.js';

export const listBitbucketRepositories = tool({
  description: 'List repositories in a Bitbucket workspace',
  inputSchema: z.object({
    workspace: z.string().describe('The Bitbucket workspace slug'),
    searchTerm: z.string().optional().describe('Optional search term to filter repositories'),
  }),
  execute: async ({ workspace, searchTerm }) => {
    // Note: This requires resource credentials to be passed in context
    // For now, return a placeholder response
    return {
      message: 'Bitbucket repository listing requires authentication context',
      workspace,
      searchTerm,
    };
  }
});

export const getBitbucketRepository = tool({
  description: 'Get detailed information about a specific Bitbucket repository',
  inputSchema: z.object({
    workspace: z.string().describe('The Bitbucket workspace slug'),
    repoSlug: z.string().describe('The repository slug'),
  }),
  execute: async ({ workspace, repoSlug }) => {
    // Note: This requires resource credentials to be passed in context
    // For now, return a placeholder response
    return {
      message: 'Bitbucket repository details require authentication context',
      workspace,
      repoSlug,
    };
  }
});

export const metadata = {
  category: 'bitbucket',
  description: 'Search and manage Bitbucket repositories.',
};
