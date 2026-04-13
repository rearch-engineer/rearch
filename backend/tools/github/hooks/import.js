import { getRepositoryDetails } from "../../../utils/github/github.js";

export default async function onImport(parentResource, subResource) {
  console.log(
    `[GitHub Import Hook] Importing repository: ${subResource.externalId}`,
  );

  const fullName = subResource.externalId; // owner/repo format
  if (!fullName || !fullName.includes("/")) {
    throw new Error(
      "Repository full name (owner/repo) is required for import",
    );
  }

  const [owner, repo] = fullName.split("/");

  try {
    const repoDetails = await getRepositoryDetails(
      parentResource.data,
      owner,
      repo,
    );

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
    };
  } catch (error) {
    console.error(`[GitHub Import Hook] Error:`, error);
    throw error;
  }
}
