/**
 * Bitbucket resource update hook
 * Called after a Bitbucket workspace resource is updated
 */
export default async function onUpdate(originalResource, updatedResource) {
  console.log(`[Bitbucket Update Hook] Resource updated: ${updatedResource.name}`);
  
  // Validate required fields from the updated resource
  const { workspace, email, apiToken } = updatedResource.data || {};
  
  if (!workspace) {
    throw new Error('Bitbucket workspace is required');
  }
  
  if (!email || !apiToken) {
    throw new Error('Bitbucket email and API token are required');
  }

  // Return the updated resource data (includes all fields like cloneUsername)
  return updatedResource.data;
}
