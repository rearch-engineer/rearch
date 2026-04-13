import { getRepositoryDetails } from "../../../../utils/github/github.js";
import SubResource from "../../../../models/SubResource.js";

export default async function onSync(job) {
  const { parentResource, subResource } = job.data;

  console.log(
    `[GitHub Sync Action] Syncing repository: ${subResource.externalId}`,
  );

  const fullName =
    subResource.data?.fullName || subResource.externalId;
  if (!fullName || !fullName.includes("/")) {
    throw new Error("Repository full name (owner/repo) is required for sync");
  }

  const [owner, repo] = fullName.split("/");

  try {
    const repoDetails = await getRepositoryDetails(
      parentResource.data,
      owner,
      repo,
    );

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

    await SubResource.findByIdAndUpdate(subResource._id, {
      $set: { data: updatedData },
    });

    console.log(
      `[GitHub Sync Action] Successfully synced repository: ${fullName}`,
    );

    return updatedData;
  } catch (error) {
    console.error(`[GitHub Sync Action] Error:`, error);
    throw error;
  }
}
