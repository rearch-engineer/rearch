/**
 * Bitbucket connection creation hook
 * Called after a Bitbucket workspace connection is created
 */
export default async function onCreate({ connection }) {
  console.log(`[Bitbucket Create Hook] Connection created: ${connection.name}`);

  // Validate required fields
  const { workspace, email, apiToken } = connection.data || {};

  if (!workspace) {
    throw new Error("Bitbucket workspace is required");
  }

  if (!email || !apiToken) {
    throw new Error("Bitbucket email and API token are required");
  }

  // Return the connection data as-is (no additional processing needed on create)
  return connection.data;
}
