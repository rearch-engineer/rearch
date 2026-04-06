/**
 * Bitbucket resource creation hook
 * Called after a Bitbucket workspace resource is created
 */
export default async function onCreate({ resource }) {
  console.log(`[Bitbucket Create Hook] Resource created: ${resource.name}`);

  // Validate required fields
  const { workspace, email, apiToken } = resource.data || {};

  if (!workspace) {
    throw new Error("Bitbucket workspace is required");
  }

  if (!email || !apiToken) {
    throw new Error("Bitbucket email and API token are required");
  }

  // Return the resource data as-is (no additional processing needed on create)
  return resource.data;
}
