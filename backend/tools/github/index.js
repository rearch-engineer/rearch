/**
 * GitHub provider tool definitions
 * Defines AI tools for interacting with GitHub repositories
 */

import { tool } from "ai";
import { z } from "zod";

export const listGithubRepositories = tool({
  description: "List repositories accessible to the GitHub App installation",
  inputSchema: z.object({
    searchTerm: z
      .string()
      .optional()
      .describe("Optional search term to filter repositories"),
  }),
  execute: async ({ searchTerm }) => {
    // Note: This requires resource credentials to be passed in context
    return {
      message: "GitHub repository listing requires authentication context",
      searchTerm,
    };
  },
});

export const getGithubRepository = tool({
  description:
    "Get detailed information about a specific GitHub repository",
  inputSchema: z.object({
    owner: z.string().describe("The repository owner (user or organization)"),
    repo: z.string().describe("The repository name"),
  }),
  execute: async ({ owner, repo }) => {
    return {
      message: "GitHub repository details require authentication context",
      owner,
      repo,
    };
  },
});

export const metadata = {
  category: "github",
  description: "Search and manage GitHub repositories.",
};
