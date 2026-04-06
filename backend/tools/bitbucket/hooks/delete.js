/**
 * Bitbucket resource deletion hook
 * Called before a Bitbucket workspace resource is deleted
 */
export default async function onDelete(resource) {
  console.log(`[Bitbucket Delete Hook] Resource being deleted: ${resource.name}`);
  
  // No cleanup needed for Bitbucket resources
  // SubResources are automatically cascade-deleted by the main delete route
  
  return true;
}
