/**
 * GitHub resource creation hook
 * Called after a GitHub App resource is created.
 * Validates the credentials by attempting to generate an installation token.
 */
import { getInstallationToken } from "../../../utils/github/github.js";

export default async function onCreate({ resource }) {
  console.log(`[GitHub Create Hook] Resource created: ${resource.name}`);

  const { appId, privateKey, privateKeyFileId, installationId } = resource.data || {};

  if (!appId) {
    throw new Error("GitHub App ID is required");
  }

  if (!privateKey && !privateKeyFileId) {
    throw new Error("GitHub App private key is required");
  }

  if (!installationId) {
    throw new Error("GitHub App installation ID is required");
  }

  // Validate credentials by generating an installation token
  try {
    await getInstallationToken(resource.data);
    console.log(`[GitHub Create Hook] Credentials validated successfully`);
  } catch (error) {
    throw new Error(
      `Invalid GitHub App credentials: ${error.message}. Please verify your App ID, private key, and installation ID.`,
    );
  }

  return resource.data;
}
