/**
 * GitHub resource update hook
 * Called after a GitHub App resource is updated.
 */
import { getInstallationToken } from "../../../utils/github/github.js";

export default async function onUpdate(originalResource, updatedResource) {
  console.log(`[GitHub Update Hook] Resource updated: ${updatedResource.name}`);

  const { appId, privateKey, privateKeyFileId, installationId } = updatedResource.data || {};

  if (!appId) {
    throw new Error("GitHub App ID is required");
  }

  if (!privateKey && !privateKeyFileId) {
    throw new Error("GitHub App private key is required");
  }

  if (!installationId) {
    throw new Error("GitHub App installation ID is required");
  }

  // Re-validate credentials
  try {
    await getInstallationToken(updatedResource.data);
  } catch (error) {
    throw new Error(
      `Invalid GitHub App credentials: ${error.message}`,
    );
  }

  return updatedResource.data;
}
