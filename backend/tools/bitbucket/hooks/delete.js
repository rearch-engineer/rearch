/**
 * Bitbucket connection deletion hook
 * Called before a Bitbucket workspace connection is deleted
 */
export default async function onDelete(connection) {
  console.log(`[Bitbucket Delete Hook] Connection being deleted: ${connection.name}`);
  
  // No cleanup needed for Bitbucket connections
  // Resources are automatically cascade-deleted by the main delete route
  
  return true;
}
