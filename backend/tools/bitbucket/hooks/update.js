/**
 * Bitbucket connection update hook
 * Called after a Bitbucket workspace connection is updated
 */
export default async function onUpdate(originalConnection, updatedConnection) {
  console.log(`[Bitbucket Update Hook] Connection updated: ${updatedConnection.name}`);
  
  // Validate required fields from the updated connection
  const { workspace, email, apiToken } = updatedConnection.data || {};
  
  if (!workspace) {
    throw new Error('Bitbucket workspace is required');
  }
  
  if (!email || !apiToken) {
    throw new Error('Bitbucket email and API token are required');
  }

  // Return the updated connection data (includes all fields like cloneUsername)
  return updatedConnection.data;
}
