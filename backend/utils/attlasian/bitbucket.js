/**
 * Bitbucket Cloud API client utility
 * Uses Bitbucket REST API 2.0 with API Token authentication
 *
 * Note: App Passwords are deprecated. API Tokens are the replacement.
 * Authentication uses Atlassian account email + API token (Basic Auth).
 * @see https://support.atlassian.com/bitbucket-cloud/docs/api-tokens/
 */

/**
 * Create authorization header for Bitbucket API
 * @param {Object} resourceData - Resource data containing Bitbucket credentials
 * @returns {string} Base64 encoded authorization string
 */
const getAuthHeader = (resourceData) => {
  const { email, apiToken } = resourceData;
  if (!email || !apiToken) {
    throw new Error("Missing required Bitbucket credentials: email, apiToken");
  }
  return "Basic " + Buffer.from(`${email}:${apiToken}`).toString("base64");
};

/**
 * Make a request to the Bitbucket API
 * @param {Object} resourceData - Resource data containing credentials
 * @param {string} endpoint - API endpoint (relative to base URL)
 * @param {Object} options - Fetch options
 * @returns {Promise<Object>} API response
 */
const apiRequest = async (resourceData, endpoint, options = {}) => {
  const baseUrl = "https://api.bitbucket.org/2.0";
  const url = `${baseUrl}${endpoint}`;

  const opts = {
    ...options,
    headers: {
      Authorization: getAuthHeader(resourceData),
      "Content-Type": "application/json",
      ...options.headers,
    },
  };

  const response = await fetch(url, opts);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      `Bitbucket API error: ${response.status} - ${errorData.error?.message || response.statusText}`,
    );
  }

  return response.json();
};

/**
 * Search for repositories in a workspace
 * @param {Object} resourceData - Resource data containing Bitbucket credentials
 * @param {string} workspace - Workspace slug
 * @param {string} searchTerm - Search term to filter repositories
 * @param {Object} options - Optional parameters
 * @param {number} options.pageLen - Number of results per page (default: 50)
 * @returns {Promise<Object>} Search results containing repositories
 */
export const searchRepositories = async (
  resourceData,
  workspace,
  searchTerm = "",
  options = {},
) => {
  try {
    const pageLen = options.pageLen || 50;

    // Build query - search by name if term provided
    let endpoint = `/repositories/${workspace}?pagelen=${pageLen}`;

    if (searchTerm) {
      // Bitbucket uses q parameter for filtering
      endpoint += `&q=name~"${encodeURIComponent(searchTerm)}"`;
    }

    const results = await apiRequest(resourceData, endpoint);

    return {
      total: results.size || results.values?.length || 0,
      repositories: (results.values || []).map((repo) => ({
        uuid: repo.uuid,
        slug: repo.slug,
        name: repo.name,
        fullName: repo.full_name,
        description: repo.description,
        isPrivate: repo.is_private,
        language: repo.language,
        createdOn: repo.created_on,
        updatedOn: repo.updated_on,
        mainBranch: repo.mainbranch?.name,
        links: {
          html: repo.links?.html?.href,
          clone: repo.links?.clone,
        },
        owner: {
          displayName: repo.owner?.display_name,
          uuid: repo.owner?.uuid,
        },
      })),
    };
  } catch (error) {
    throw new Error(
      `Failed to search Bitbucket repositories: ${error.message}`,
    );
  }
};

/**
 * Get detailed information about a specific repository
 * @param {Object} resourceData - Resource data containing Bitbucket credentials
 * @param {string} workspace - Workspace slug
 * @param {string} repoSlug - Repository slug
 * @returns {Promise<Object>} Complete repository details
 */
export const getRepositoryDetails = async (
  resourceData,
  workspace,
  repoSlug,
) => {
  try {
    if (!workspace || !repoSlug) {
      throw new Error("Workspace and repository slug are required");
    }

    const repo = await apiRequest(
      resourceData,
      `/repositories/${workspace}/${repoSlug}`,
    );

    // Get additional info: branches, commits
    const branchesData = await apiRequest(
      resourceData,
      `/repositories/${workspace}/${repoSlug}/refs/branches?pagelen=20`,
    ).catch(() => ({ values: [] }));

    return {
      uuid: repo.uuid,
      slug: repo.slug,
      name: repo.name,
      fullName: repo.full_name,
      description: repo.description,
      isPrivate: repo.is_private,
      language: repo.language,
      size: repo.size,
      createdOn: repo.created_on,
      updatedOn: repo.updated_on,
      mainBranch: repo.mainbranch?.name,
      forkPolicy: repo.fork_policy,
      project: repo.project
        ? {
            key: repo.project.key,
            name: repo.project.name,
            uuid: repo.project.uuid,
          }
        : null,
      links: {
        html: repo.links?.html?.href,
        clone: repo.links?.clone,
        commits: repo.links?.commits?.href,
        branches: repo.links?.branches?.href,
      },
      owner: {
        displayName: repo.owner?.display_name,
        uuid: repo.owner?.uuid,
        accountId: repo.owner?.account_id,
      },
      branches: (branchesData.values || []).map((branch) => ({
        name: branch.name,
        target: {
          hash: branch.target?.hash,
          date: branch.target?.date,
          message: branch.target?.message,
          author: branch.target?.author?.raw,
        },
      })),
    };
  } catch (error) {
    if (error.message.includes("404")) {
      throw new Error(
        `Bitbucket repository not found: ${workspace}/${repoSlug}`,
      );
    }
    throw new Error(
      `Failed to get Bitbucket repository details: ${error.message}`,
    );
  }
};

/**
 * List all workspaces accessible to the authenticated user
 * @param {Object} resourceData - Resource data containing Bitbucket credentials
 * @returns {Promise<Array>} List of workspaces
 */
export const listWorkspaces = async (resourceData) => {
  try {
    const results = await apiRequest(resourceData, "/workspaces?pagelen=100");

    return (results.values || []).map((workspace) => ({
      uuid: workspace.uuid,
      slug: workspace.slug,
      name: workspace.name,
    }));
  } catch (error) {
    throw new Error(`Failed to list Bitbucket workspaces: ${error.message}`);
  }
};

/**
 * List members of a Bitbucket workspace with auto-pagination and optional search.
 * The Bitbucket members endpoint does not support query filtering, so we fetch
 * all pages and filter server-side by display name / nickname.
 * @param {Object} resourceData - Resource data containing Bitbucket credentials
 * @param {string} workspace - Workspace slug
 * @param {Object} [options] - Optional parameters
 * @param {string} [options.search] - Search term to filter members by display name (case-insensitive)
 * @returns {Promise<Array>} List of workspace members
 */
export const listWorkspaceMembers = async (
  resourceData,
  workspace,
  { search } = {},
) => {
  try {
    if (!workspace) {
      throw new Error("Workspace is required");
    }

    const allMembers = [];
    let url = `/workspaces/${workspace}/members?pagelen=100`;

    // Auto-paginate through all pages (capped at 10 pages = 1000 members for safety)
    for (let page = 0; page < 10; page++) {
      const results = await apiRequest(resourceData, url);

      const members = (results.values || []).map((member) => ({
        uuid: member.user?.uuid,
        displayName: member.user?.display_name,
        accountId: member.user?.account_id,
        nickname: member.user?.nickname,
        avatarUrl: member.user?.links?.avatar?.href,
      }));

      allMembers.push(...members);

      // Check if there's a next page
      if (results.next) {
        // results.next is a full URL; extract the path + query relative to base
        const nextUrl = new URL(results.next);
        url = nextUrl.pathname.replace("/2.0", "") + nextUrl.search;
      } else {
        break;
      }
    }

    // Filter server-side if a search term was provided
    if (search) {
      const term = search.toLowerCase();
      return allMembers.filter(
        (m) =>
          (m.displayName && m.displayName.toLowerCase().includes(term)) ||
          (m.nickname && m.nickname.toLowerCase().includes(term)),
      );
    }

    return allMembers;
  } catch (error) {
    throw new Error(
      `Failed to list Bitbucket workspace members: ${error.message}`,
    );
  }
};

/**
 * Create a pull request in a Bitbucket repository
 * @param {Object} resourceData - Resource data containing Bitbucket credentials
 * @param {string} workspace - Workspace slug
 * @param {string} repoSlug - Repository slug
 * @param {Object} options - Pull request options
 * @param {string} options.title - PR title
 * @param {string} options.description - PR description (supports Markdown)
 * @param {string} options.sourceBranch - Source branch name
 * @param {string} options.destinationBranch - Destination branch name (default: main)
 * @param {Array<string>} options.reviewers - Optional list of Bitbucket user UUIDs to assign as reviewers
 * @returns {Promise<Object>} Created pull request details
 */
export const createPullRequest = async (
  resourceData,
  workspace,
  repoSlug,
  { title, description, sourceBranch, destinationBranch = "main", reviewers = [] },
) => {
  try {
    if (!workspace || !repoSlug) {
      throw new Error("Workspace and repository slug are required");
    }
    if (!sourceBranch) {
      throw new Error("Source branch is required");
    }
    if (!title) {
      throw new Error("Pull request title is required");
    }

    const body = {
      title,
      description: description || "",
      source: {
        branch: { name: sourceBranch },
      },
      destination: {
        branch: { name: destinationBranch },
      },
      close_source_branch: false,
    };

    if (reviewers.length > 0) {
      body.reviewers = reviewers.map((uuid) => ({ uuid }));
    }

    const result = await apiRequest(
      resourceData,
      `/repositories/${workspace}/${repoSlug}/pullrequests`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );

    return {
      id: result.id,
      title: result.title,
      description: result.description,
      state: result.state,
      sourceBranch: result.source?.branch?.name,
      destinationBranch: result.destination?.branch?.name,
      author: result.author?.display_name,
      url: result.links?.html?.href,
      createdOn: result.created_on,
      reviewers: (result.reviewers || []).map((r) => ({
        uuid: r.uuid,
        displayName: r.display_name,
      })),
    };
  } catch (error) {
    throw new Error(`Failed to create Bitbucket pull request: ${error.message}`);
  }
};

/**
 * Get the raw contents of a file from a Bitbucket repository
 * @param {Object} resourceData - Resource data containing Bitbucket credentials
 * @param {string} workspace - Workspace slug
 * @param {string} repoSlug - Repository slug
 * @param {string} filePath - Path to the file within the repository (e.g. '.rearch/Dockerfile')
 * @param {string} [ref] - Branch name, tag, or commit hash (default: HEAD of main branch)
 * @returns {Promise<string>} Raw file contents as a string
 */
export const getFileContents = async (
  resourceData,
  workspace,
  repoSlug,
  filePath,
  ref = "HEAD",
) => {
  try {
    if (!workspace || !repoSlug || !filePath) {
      throw new Error("Workspace, repository slug, and file path are required");
    }

    const baseUrl = "https://api.bitbucket.org/2.0";
    const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");
    const url = `${baseUrl}/repositories/${workspace}/${repoSlug}/src/${ref}/${encodedPath}`;

    const response = await fetch(url, {
      headers: {
        Authorization: getAuthHeader(resourceData),
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(
        `Bitbucket API error: ${response.status} - ${errorText || response.statusText}`,
      );
    }

    return response.text();
  } catch (error) {
    throw new Error(
      `Failed to get file contents from Bitbucket: ${error.message}`,
    );
  }
};

export default {
  searchRepositories,
  getRepositoryDetails,
  listWorkspaces,
  listWorkspaceMembers,
  createPullRequest,
  getFileContents,
};
