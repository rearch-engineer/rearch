import { getRepositoryDetails } from "../../../../utils/github/github.js";
import Resource from "../../../../models/Resource.js";

export default async function onSync(job) {
  const { connection, resource } = job.data;

  console.log(
    `[GitHub Sync Action] Syncing repository: ${resource.externalId}`,
  );

  const fullName =
    resource.data?.fullName || resource.externalId;
  if (!fullName || !fullName.includes("/")) {
    throw new Error("Repository full name (owner/repo) is required for sync");
  }

  const [owner, repo] = fullName.split("/");

  try {
    const repoDetails = await getRepositoryDetails(
      connection.data,
      owner,
      repo,
    );

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

    await Resource.findByIdAndUpdate(resource._id, {
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
