import Workspace from "../models/Workspace.js";
import WorkspaceMember from "../models/WorkspaceMember.js";

/**
 * Ensure a user has a personal workspace. Idempotent — safe to call multiple times.
 * Creates the workspace and membership record if they don't exist.
 * Returns the personal workspace document.
 */
export async function ensurePersonalWorkspace(userId) {
  let workspace = await Workspace.findOne({ owner: userId, isPersonal: true });
  if (workspace) return workspace;

  workspace = await Workspace.create({
    name: "Personal",
    owner: userId,
    isPersonal: true,
  });

  await WorkspaceMember.create({
    workspace: workspace._id,
    user: userId,
    role: "admin",
  });

  return workspace;
}

/**
 * Check if a user is a member of a workspace.
 * Returns the WorkspaceMember document or null.
 */
export async function checkWorkspaceMembership(workspaceId, userId) {
  return WorkspaceMember.findOne({ workspace: workspaceId, user: userId });
}

/**
 * Check if a user is an admin of a workspace.
 * Returns the WorkspaceMember document or null.
 */
export async function checkWorkspaceAdmin(workspaceId, userId) {
  return WorkspaceMember.findOne({
    workspace: workspaceId,
    user: userId,
    role: "admin",
  });
}

/**
 * Get all workspace IDs a user is a member of.
 * Returns an array of ObjectIds.
 */
export async function getUserWorkspaceIds(userId) {
  return WorkspaceMember.find({ user: userId }).distinct("workspace");
}
