import { getRepositoryDetails } from '../../../../utils/attlasian/bitbucket.js';
import Resource from '../../../../models/Resource.js';

export default async function onSync(job) {
  const { connection, resource } = job.data;
  
  console.log(`[Bitbucket Sync Action] Syncing repository: ${resource.externalId}`);

  const repoSlug = resource.externalId;
  const workspace = connection.data?.workspace;

  if (!repoSlug) {
    throw new Error('Repository slug is required for sync');
  }

  if (!workspace) {
    throw new Error('Bitbucket workspace is required');
  }

  try {
    const repoDetails = await getRepositoryDetails(connection.data, workspace, repoSlug);

    // Update the resource with fresh data
    const updatedData = {
      ...resource.data,
      slug: repoDetails.slug,
      fullName: repoDetails.fullName,
      description: repoDetails.description,
      isPrivate: repoDetails.isPrivate,
      language: repoDetails.language,
      size: repoDetails.size,
      createdOn: repoDetails.createdOn,
      updatedOn: repoDetails.updatedOn,
      mainBranch: repoDetails.mainBranch,
      forkPolicy: repoDetails.forkPolicy,
      project: repoDetails.project,
      links: repoDetails.links,
      owner: repoDetails.owner,
      branches: repoDetails.branches,
      lastSyncedAt: new Date().toISOString(),
    };

    // Save the updated data to the database
    // Only update the 'data' field - preserve user-edited 'description' field
    await Resource.findByIdAndUpdate(resource._id, {
      $set: { data: updatedData }
    });

    console.log(`[Bitbucket Sync Action] Successfully synced repository: ${repoSlug}`);

    return updatedData;
  } catch (error) {
    console.error(`[Bitbucket Sync Action] Error:`, error);
    throw error;
  }
}
