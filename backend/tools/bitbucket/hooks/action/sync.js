import { getRepositoryDetails } from '../../../../utils/attlasian/bitbucket.js';
import SubResource from '../../../../models/SubResource.js';

export default async function onSync(job) {
  const { parentResource, subResource } = job.data;
  
  console.log(`[Bitbucket Sync Action] Syncing repository: ${subResource.externalId}`);

  const repoSlug = subResource.externalId;
  const workspace = parentResource.data?.workspace;

  if (!repoSlug) {
    throw new Error('Repository slug is required for sync');
  }

  if (!workspace) {
    throw new Error('Bitbucket workspace is required');
  }

  try {
    const repoDetails = await getRepositoryDetails(parentResource.data, workspace, repoSlug);

    // Update the subresource with fresh data
    const updatedData = {
      ...subResource.data,
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
    await SubResource.findByIdAndUpdate(subResource._id, {
      $set: { data: updatedData }
    });

    console.log(`[Bitbucket Sync Action] Successfully synced repository: ${repoSlug}`);

    return updatedData;
  } catch (error) {
    console.error(`[Bitbucket Sync Action] Error:`, error);
    throw error;
  }
}
