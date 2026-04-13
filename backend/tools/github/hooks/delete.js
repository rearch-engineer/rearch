/**
 * GitHub resource deletion hook
 * Called before a GitHub App resource is deleted.
 */
export default async function onDelete(resource) {
  console.log(`[GitHub Delete Hook] Resource being deleted: ${resource.name}`);

  // No cleanup needed — SubResources are cascade-deleted upstream
  return true;
}
