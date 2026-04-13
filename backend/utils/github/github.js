/**
 * GitHub API client utility
 * Uses GitHub REST API with GitHub App authentication (Installation tokens)
 *
 * Authentication flow:
 * 1. Sign a JWT using the App's private key and App ID
 * 2. Exchange the JWT for a short-lived installation access token
 * 3. Use the installation token for all API operations
 *
 * @see https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app
 */

import { SignJWT } from "jose";
import { createPrivateKey } from "node:crypto";
import mongoose from "mongoose";
import { GridFSBucket } from "mongodb";

/**
 * Generate a JWT signed with the GitHub App's private key.
 * The JWT is used to request an installation access token.
 * @param {string} appId - GitHub App ID
 * @param {string} privateKey - PEM-encoded private key
 * @returns {Promise<string>} Signed JWT (valid for 10 minutes)
 */
const generateAppJwt = async (appId, privateKey) => {
  if (!appId || !privateKey) {
    throw new Error("Missing required GitHub App credentials: appId, privateKey");
  }

  const key = createPrivateKey(privateKey);
  const now = Math.floor(Date.now() / 1000);

  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: "RS256" })
    .setIssuedAt(now - 60) // 60s clock drift tolerance
    .setExpirationTime(now + 600) // 10 minutes
    .setIssuer(String(appId))
    .sign(key);

  return jwt;
};

/**
 * Read a private key PEM file from GridFS.
 * @param {string|ObjectId} fileId - GridFS file ID
 * @returns {Promise<string>} PEM file contents as string
 */
const readPrivateKeyFromGridFS = async (fileId) => {
  const db = mongoose.connection.db;
  const bucket = new GridFSBucket(db, { bucketName: "uploads" });
  const objectId = new mongoose.Types.ObjectId(fileId);

  const stream = bucket.openDownloadStream(objectId);
  const chunks = [];

  for await (const chunk of stream) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString("utf-8");
};

/**
 * Get an installation access token for the GitHub App.
 * Tokens are valid for 1 hour.
 * @param {Object} resourceData - Resource data containing GitHub App credentials
 * @returns {Promise<string>} Installation access token
 */
export const getInstallationToken = async (resourceData) => {
  const { appId, privateKey, privateKeyFileId, installationId } = resourceData;

  if (!appId || (!privateKey && !privateKeyFileId) || !installationId) {
    throw new Error(
      "Missing required GitHub App credentials: appId, privateKey/privateKeyFileId, installationId",
    );
  }

  // Resolve private key: from GridFS if fileId is present, otherwise use inline value
  const resolvedPrivateKey = privateKeyFileId
    ? await readPrivateKeyFromGridFS(privateKeyFileId)
    : privateKey;

  const jwt = await generateAppJwt(appId, resolvedPrivateKey);

  const response = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      `GitHub API error (installation token): ${response.status} - ${errorData.message || response.statusText}`,
    );
  }

  const data = await response.json();
  return data.token;
};

/**
 * Make an authenticated request to the GitHub API.
 * @param {string} token - Installation access token
 * @param {string} endpoint - API endpoint (relative to https://api.github.com)
 * @param {Object} options - Fetch options
 * @returns {Promise<Object>} API response
 */
const apiRequest = async (token, endpoint, options = {}) => {
  const baseUrl = "https://api.github.com";
  const url = endpoint.startsWith("http") ? endpoint : `${baseUrl}${endpoint}`;

  const opts = {
    ...options,
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...options.headers,
    },
  };

  const response = await fetch(url, opts);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      `GitHub API error: ${response.status} - ${errorData.message || response.statusText}`,
    );
  }

  return response.json();
};

/**
 * Search for repositories accessible to the GitHub App installation.
 * @param {Object} resourceData - Resource data containing GitHub App credentials
 * @param {string} searchTerm - Search term to filter repositories
 * @param {Object} options - Optional parameters
 * @param {number} options.perPage - Number of results per page (default: 50)
 * @returns {Promise<Object>} Search results containing repositories
 */
export const searchRepositories = async (
  resourceData,
  searchTerm = "",
  options = {},
) => {
  try {
    const token = await getInstallationToken(resourceData);
    const perPage = options.perPage || 50;

    // List repositories accessible to the installation
    let endpoint = `/installation/repositories?per_page=${perPage}`;

    const results = await apiRequest(token, endpoint);

    let repositories = results.repositories || [];

    // Client-side filter by name if search term provided
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      repositories = repositories.filter(
        (repo) =>
          repo.name.toLowerCase().includes(term) ||
          repo.full_name.toLowerCase().includes(term),
      );
    }

    return {
      total: repositories.length,
      repositories: repositories.map((repo) => ({
        id: repo.id,
        slug: repo.name,
        name: repo.name,
        fullName: repo.full_name,
        description: repo.description,
        isPrivate: repo.private,
        language: repo.language,
        createdOn: repo.created_at,
        updatedOn: repo.updated_at,
        mainBranch: repo.default_branch,
        links: {
          html: repo.html_url,
          clone: [
            { name: "https", href: repo.clone_url },
            { name: "ssh", href: repo.ssh_url },
          ],
        },
        owner: {
          displayName: repo.owner?.login,
          uuid: repo.owner?.id ? String(repo.owner.id) : undefined,
        },
      })),
    };
  } catch (error) {
    throw new Error(
      `Failed to search GitHub repositories: ${error.message}`,
    );
  }
};

/**
 * Get detailed information about a specific repository.
 * @param {Object} resourceData - Resource data containing GitHub App credentials
 * @param {string} owner - Repository owner (user or org)
 * @param {string} repo - Repository name
 * @returns {Promise<Object>} Complete repository details
 */
export const getRepositoryDetails = async (resourceData, owner, repo) => {
  try {
    if (!owner || !repo) {
      throw new Error("Owner and repository name are required");
    }

    const token = await getInstallationToken(resourceData);

    const repoData = await apiRequest(token, `/repos/${owner}/${repo}`);

    // Get branches (paginate to fetch all)
    let branchesData = [];
    try {
      let page = 1;
      const maxPages = 10;
      while (page <= maxPages) {
        const pageBranches = await apiRequest(
          token,
          `/repos/${owner}/${repo}/branches?per_page=100&page=${page}`,
        );
        if (!Array.isArray(pageBranches) || pageBranches.length === 0) break;
        branchesData = branchesData.concat(pageBranches);
        if (pageBranches.length < 100) break;
        page++;
      }
    } catch (branchErr) {
      console.error(`[GitHub] Failed to fetch branches for ${owner}/${repo}:`, branchErr.message);
    }

    return {
      id: repoData.id,
      slug: repoData.name,
      name: repoData.name,
      fullName: repoData.full_name,
      description: repoData.description,
      isPrivate: repoData.private,
      language: repoData.language,
      size: repoData.size ? repoData.size * 1024 : null, // GitHub returns KB, convert to bytes
      createdOn: repoData.created_at,
      updatedOn: repoData.updated_at,
      mainBranch: repoData.default_branch,
      forkPolicy: repoData.fork ? "allow_forks" : null,
      project: null,
      links: {
        html: repoData.html_url,
        clone: [
          { name: "https", href: repoData.clone_url },
          { name: "ssh", href: repoData.ssh_url },
        ],
        commits: repoData.commits_url?.replace("{/sha}", ""),
        branches: repoData.branches_url?.replace("{/branch}", ""),
      },
      owner: {
        displayName: repoData.owner?.login,
        uuid: repoData.owner?.id ? String(repoData.owner.id) : undefined,
        accountId: repoData.owner?.login,
      },
      branches: branchesData.map(
        (branch) => ({
          name: branch.name,
          target: {
            hash: branch.commit?.sha,
            date: null,
            message: null,
            author: null,
          },
        }),
      ),
    };
  } catch (error) {
    if (error.message.includes("404")) {
      throw new Error(`GitHub repository not found: ${owner}/${repo}`);
    }
    throw new Error(
      `Failed to get GitHub repository details: ${error.message}`,
    );
  }
};

/**
 * List collaborators of a GitHub repository with optional search.
 * @param {Object} resourceData - Resource data containing GitHub App credentials
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {Object} [options] - Optional parameters
 * @param {string} [options.search] - Search term to filter collaborators
 * @returns {Promise<Array>} List of collaborators
 */
export const listCollaborators = async (
  resourceData,
  owner,
  repo,
  { search } = {},
) => {
  try {
    if (!owner || !repo) {
      throw new Error("Owner and repository name are required");
    }

    const token = await getInstallationToken(resourceData);

    const allCollaborators = [];
    let page = 1;
    const maxPages = 10;

    while (page <= maxPages) {
      const collaborators = await apiRequest(
        token,
        `/repos/${owner}/${repo}/collaborators?per_page=100&page=${page}`,
      );

      if (!Array.isArray(collaborators) || collaborators.length === 0) break;

      allCollaborators.push(
        ...collaborators.map((user) => ({
          uuid: user.id ? String(user.id) : undefined,
          displayName: user.login,
          accountId: user.login,
          nickname: user.login,
          avatarUrl: user.avatar_url,
        })),
      );

      if (collaborators.length < 100) break;
      page++;
    }

    // Filter by search term if provided
    if (search) {
      const term = search.toLowerCase();
      return allCollaborators.filter(
        (c) =>
          (c.displayName && c.displayName.toLowerCase().includes(term)) ||
          (c.nickname && c.nickname.toLowerCase().includes(term)),
      );
    }

    return allCollaborators;
  } catch (error) {
    throw new Error(
      `Failed to list GitHub collaborators: ${error.message}`,
    );
  }
};

/**
 * Create a pull request in a GitHub repository.
 * @param {Object} resourceData - Resource data containing GitHub App credentials
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {Object} options - Pull request options
 * @param {string} options.title - PR title
 * @param {string} options.description - PR body (supports Markdown)
 * @param {string} options.sourceBranch - Head branch name
 * @param {string} options.destinationBranch - Base branch name (default: main)
 * @param {Array<string>} options.reviewers - Optional list of GitHub usernames to request as reviewers
 * @returns {Promise<Object>} Created pull request details
 */
export const createPullRequest = async (
  resourceData,
  owner,
  repo,
  { title, description, sourceBranch, destinationBranch = "main", reviewers = [] },
) => {
  try {
    if (!owner || !repo) {
      throw new Error("Owner and repository name are required");
    }
    if (!sourceBranch) {
      throw new Error("Source branch is required");
    }
    if (!title) {
      throw new Error("Pull request title is required");
    }

    const token = await getInstallationToken(resourceData);

    const body = {
      title,
      body: description || "",
      head: sourceBranch,
      base: destinationBranch,
    };

    const result = await apiRequest(token, `/repos/${owner}/${repo}/pulls`, {
      method: "POST",
      body: JSON.stringify(body),
    });

    // Request reviewers if specified
    if (reviewers.length > 0 && result.number) {
      try {
        await apiRequest(
          token,
          `/repos/${owner}/${repo}/pulls/${result.number}/requested_reviewers`,
          {
            method: "POST",
            body: JSON.stringify({ reviewers }),
          },
        );
      } catch (reviewerErr) {
        // Don't fail the whole PR creation if reviewer request fails
        console.warn("Failed to request reviewers:", reviewerErr.message);
      }
    }

    return {
      id: result.number,
      title: result.title,
      description: result.body,
      state: result.state,
      sourceBranch: result.head?.ref,
      destinationBranch: result.base?.ref,
      author: result.user?.login,
      url: result.html_url,
      createdOn: result.created_at,
      reviewers: (result.requested_reviewers || []).map((r) => ({
        uuid: r.id ? String(r.id) : undefined,
        displayName: r.login,
      })),
    };
  } catch (error) {
    throw new Error(
      `Failed to create GitHub pull request: ${error.message}`,
    );
  }
};

/**
 * Get the raw contents of a file from a GitHub repository.
 * @param {Object} resourceData - Resource data containing GitHub App credentials
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} filePath - Path to the file within the repository
 * @param {string} [ref] - Branch name, tag, or commit hash (default: HEAD)
 * @returns {Promise<string>} Raw file contents as a string
 */
export const getFileContents = async (
  resourceData,
  owner,
  repo,
  filePath,
  ref = "HEAD",
) => {
  try {
    if (!owner || !repo || !filePath) {
      throw new Error("Owner, repository name, and file path are required");
    }

    const token = await getInstallationToken(resourceData);
    const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?ref=${ref}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.raw+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(
        `GitHub API error: ${response.status} - ${errorText || response.statusText}`,
      );
    }

    return response.text();
  } catch (error) {
    throw new Error(
      `Failed to get file contents from GitHub: ${error.message}`,
    );
  }
};

export default {
  getInstallationToken,
  searchRepositories,
  getRepositoryDetails,
  listCollaborators,
  createPullRequest,
  getFileContents,
};
