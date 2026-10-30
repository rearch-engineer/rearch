import { getRepositoryDetails } from '../../../utils/attlasian/bitbucket.js';

export default async function onImport(connection, resource) {
  console.log(`[Bitbucket Import Hook] Importing repository: ${resource.externalId}`);

  const repoSlug = resource.externalId;
  const workspace = connection.data?.workspace;

  if (!repoSlug) {
    throw new Error('Repository slug is required for import');
  }

  if (!workspace) {
    throw new Error('Bitbucket workspace is required');
  }

  try {
    const repoDetails = await getRepositoryDetails(connection.data, workspace, repoSlug);

    return {
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
    };
  } catch (error) {
    console.error(`[Bitbucket Import Hook] Error:`, error);
    throw error;
  }
}
