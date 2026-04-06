import { Version3Client } from "jira.js";

/**
 * Initialize Jira client with credentials from resource data
 * @param {Object} resourceData - Resource data containing Jira credentials
 * @param {string} resourceData.installationUrl - Jira installation URL
 * @param {string} resourceData.email - User email for authentication
 * @param {string} resourceData.apiToken - API token for authentication
 * @returns {Version3Client} Configured Jira client instance
 * @throws {Error} If required credentials are missing
 */
const getJiraClient = (resourceData) => {
  if (!resourceData) {
    throw new Error("Resource data is required to initialize Jira client");
  }

  const host = resourceData.installationUrl;
  const email = resourceData.email;
  const apiToken = resourceData.apiToken;

  if (!host || !email || !apiToken) {
    throw new Error(
      "Missing required Jira credentials: installationUrl, email, apiToken",
    );
  }

  return new Version3Client({
    host,
    authentication: {
      basic: {
        email,
        apiToken,
      },
    },
  });
};

/**
 * Search for Jira tickets using JQL (Jira Query Language)
 * @param {Object} resourceData - Resource data containing Jira credentials
 * @param {string} jql - The JQL query string (e.g., "project = PROJ AND status = Open")
 * @param {string} term - Search term to find tickets by ID or summary
 * @param {Object} options - Optional search parameters
 * @param {number} options.maxResults - Maximum number of results to return (default: 50)
 * @param {number} options.startAt - Index of the first result to return (default: 0)
 * @param {string[]} options.fields - Array of field names to include in results (default: all fields)
 * @returns {Promise<Object>} Search results containing issues array and metadata
 * @throws {Error} If the search fails or Jira API returns an error
 */
export const searchTickets = async (resourceData, jql, term, options = {}) => {
  try {
    const client = getJiraClient(resourceData);

    const { values: projects } = await client.projects.searchProjects();

    jql = term ? `id="${term}" OR summary ~ "${term}*"` : jql;

    const searchParams = {
      jql,
      maxResults: options.maxResults || 50,
      fields: options.fields || ["*all"],
    };

    const results =
      await client.issueSearch.searchForIssuesUsingJqlEnhancedSearchPost(
        searchParams,
      );

    return {
      total: results.total,
      startAt: results.startAt,
      maxResults: results.maxResults,
      issues: results.issues.map((issue) => ({
        key: issue.key,
        id: issue.id,
        summary: issue.fields.summary,
        creator: issue.fields.creator,
      })),
    };
  } catch (error) {
    throw new Error(`Failed to search Jira tickets: ${error.message}`);
  }
};

/**
 * Get detailed information about a specific Jira ticket
 * @param {Object} resourceData - Resource data containing Jira credentials
 * @param {string} issueKey - The issue key (e.g., "PROJ-123")
 * @param {Object} options - Optional parameters
 * @param {string[]} options.fields - Array of field names to include (default: all fields)
 * @param {string[]} options.expand - Array of entities to expand (e.g., ['changelog', 'renderedFields'])
 * @returns {Promise<Object>} Complete ticket details
 * @throws {Error} If the ticket is not found or Jira API returns an error
 */
export const getTicketDetails = async (
  resourceData,
  issueKey,
  options = {},
) => {
  try {
    const client = getJiraClient(resourceData);

    if (!issueKey) {
      throw new Error("Issue key is required");
    }

    const params = {
      issueIdOrKey: issueKey,
      fields: options.fields || ["*all"],
      expand: options.expand,
    };

    const issue = await client.issues.getIssue(params);

    return {
      key: issue.key,
      id: issue.id,
      self: issue.self,
      fields: issue.fields,
      changelog: issue.changelog,
      renderedFields: issue.renderedFields,
    };
  } catch (error) {
    if (error.response?.status === 404) {
      throw new Error(`Jira ticket not found: ${issueKey}`);
    }
    throw new Error(`Failed to get Jira ticket details: ${error.message}`);
  }
};

/**
 * Download an attachment from Jira
 * @param {Object} resourceData - Resource data containing Jira credentials
 * @param {Object} attachment - Attachment object with id property
 * @param {string} attachment.id - The attachment ID
 * @returns {Promise<Buffer>} Buffer containing the attachment content
 * @throws {Error} If download fails or credentials are missing
 */
export const downloadAttachment = async (resourceData, attachment) => {
  try {
    if (!resourceData) {
      throw new Error("Resource data is required to download attachment");
    }

    if (!attachment || !attachment.id) {
      throw new Error("Attachment object with id is required");
    }

    const client = getJiraClient(resourceData);

    // Use jira.js built-in method to download attachment
    // This handles authentication properly and avoids 403 errors
    const attachmentContent =
      await client.issueAttachments.getAttachmentContent({
        id: attachment.id,
      });

    // Convert to Buffer if not already
    return Buffer.isBuffer(attachmentContent)
      ? attachmentContent
      : Buffer.from(attachmentContent);
  } catch (error) {
    throw new Error(`Failed to download Jira attachment: ${error.message}`);
  }
};

export default {
  searchTickets,
  getTicketDetails,
  downloadAttachment,
};
