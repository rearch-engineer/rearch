/**
 * GitHub connection update hook
 * Called after a GitHub App connection is updated.
 */
import { getInstallationToken } from "../../../utils/github/github.js";

export default async function onUpdate(originalConnection, updatedConnection) {
  console.log(`[GitHub Update Hook] Connection updated: ${updatedConnection.name}`);

  const { appId, privateKey, privateKeyFileId, installationId } = updatedConnection.data || {};

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
    await getInstallationToken(updatedConnection.data);
  } catch (error) {
    throw new Error(
      `Invalid GitHub App credentials: ${error.message}`,
    );
  }

  return updatedConnection.data;
}
