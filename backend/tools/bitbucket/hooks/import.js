import { getRepositoryDetails } from '../../../utils/attlasian/bitbucket.js';

export default async function onImport(parentResource, subResource) {
  console.log(`[Bitbucket Import Hook] Importing repository: ${subResource.externalId}`);

  const repoSlug = subResource.externalId;
  const workspace = parentResource.data?.workspace;

  if (!repoSlug) {
    throw new Error('Repository slug is required for import');
  }

  if (!workspace) {
    throw new Error('Bitbucket workspace is required');
  }

  try {
    const repoDetails = await getRepositoryDetails(parentResource.data, workspace, repoSlug);

    return {
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
      recentCommits: repoDetails.recentCommits,
    };
  } catch (error) {
    console.error(`[Bitbucket Import Hook] Error:`, error);
    throw error;
  }
}
