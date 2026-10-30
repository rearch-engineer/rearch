/**
 * GitHub connection deletion hook
 * Called before a GitHub App connection is deleted.
 */
export default async function onDelete(connection) {
  console.log(`[GitHub Delete Hook] Connection being deleted: ${connection.name}`);

  // No cleanup needed — Resources are cascade-deleted upstream
  return true;
}
