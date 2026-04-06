import simpleGit from "simple-git";
import Docker from "dockerode";
import temp from "temp";
import fs from "node:fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import SubResource from "../../../../models/SubResource.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve path to the built-in templates directory
const TEMPLATES_DIR = path.resolve(__dirname, "../../../../templates");

// Valid built-in template names
const VALID_TEMPLATES = ["minimal", "node", "node-browser", "node-react-pg"];

/**
 * Rebuild action hook for Bitbucket repositories
 *
 * This hook:
 * 1. Clones the repository to a temporary folder
 * 2. Checks out to the branch specified in rearch.dockerImageFromBranch
 * 3. Retrieves the HEAD commit hash to use as the Docker image tag
 * 4. If .rearch/Dockerfile exists in the repo, uses it to build the image
 * 5. If not, copies the selected built-in template into .rearch/ and builds from it
 * 6. Builds a Docker image tagged as rearch_<subresource_id>_<slug>:<commitHash> (7-char short hash)
 * 7. Persists the new image tag back to subResource.rearch.dockerImage in MongoDB
 * 8. Cleans up old images for the same repository (including dangling images)
 */
export default async function onRebuild(job, { log } = {}) {
  const _log = log || ((msg) => job.log(msg));
  const { parentResource, subResource } = job.data;

  await _log(
    `[Bitbucket Rebuild] Starting rebuild for repository: ${subResource.externalId}`,
  );

  // Extract required configuration
  const workspace = parentResource.data?.workspace;
  const apiToken = parentResource.data?.apiToken;
  const cloneUsername = parentResource.data?.cloneUsername;

  const dockerImageFromBranch = subResource.rearch?.dockerImageFromBranch;
  const template = subResource.rearch?.template || "";
  const cloneLinks = subResource.data?.links?.clone;

  // Determine Docker image name (the repository portion, without tag).
  // The full tag (<name>:<commitHash>) is computed after cloning, once we
  // know the HEAD commit hash of the checked-out branch.
  // Image name is always auto-generated: rearch_<subresource_id>_<slugified_repo_name>
  const subId = (subResource._id || "").toString().toLowerCase();
  const repoSlug = (
    subResource.data?.slug ||
    subResource.externalId ||
    subResource.name ||
    "repo"
  )
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const dockerImageName = `rearch_${subId}_${repoSlug}`;
  await _log(`[Bitbucket Rebuild] Docker image name: ${dockerImageName}`);

  // dockerImageTag will be set after cloning (see below)
  let dockerImageTag = null;

  // Validate required properties
  if (!workspace) {
    throw new Error("Bitbucket workspace is required");
  }

  if (!cloneUsername) {
    throw new Error(
      "Bitbucket cloneUsername is required for cloning repositories",
    );
  }

  if (!dockerImageFromBranch) {
    throw new Error(
      "dockerImageFromBranch property is required in subResource.rearch",
    );
  }

  if (!cloneLinks || !Array.isArray(cloneLinks)) {
    throw new Error("Repository clone links are not available");
  }

  // Find HTTPS clone URL
  const httpsCloneLink = cloneLinks.find((link) => link.name === "https");
  if (!httpsCloneLink || !httpsCloneLink.href) {
    throw new Error("HTTPS clone URL not found in repository links");
  }

  await _log(`[Bitbucket Rebuild] HTTPS Clone URL: ${httpsCloneLink.href}`);

  // Construct authenticated clone URL
  // Format: https://cloneUsername:apiToken@bitbucket.org/workspace/repo.git
  const cloneUrl = new URL(httpsCloneLink.href);
  cloneUrl.username = encodeURIComponent(cloneUsername);
  cloneUrl.password = encodeURIComponent(apiToken);
  const authenticatedCloneUrl = cloneUrl.toString();

  await _log(
    `[Bitbucket Rebuild] Clone URL: ${httpsCloneLink.href} (credentials hidden)`,
  );
  await _log(
    `[Bitbucket Rebuild] Authenticated Clone URL: ${authenticatedCloneUrl}`,
  );
  await _log(
    `[Bitbucket Rebuild] Branch to checkout: ${dockerImageFromBranch}`,
  );
  await _log(
    `[Bitbucket Rebuild] Docker image name: ${dockerImageName} (tag will be set to commit hash after clone)`,
  );
  if (template) {
    await _log(`[Bitbucket Rebuild] Using built-in template: ${template}`);
  }

  // Create temporary directory
  const tempDir = temp.mkdirSync("bitbucket-rebuild-");
  await _log(`[Bitbucket Rebuild] Created temp directory: ${tempDir}`);

  try {
    // Clone the repository
    await _log(`[Bitbucket Rebuild] Cloning repository...`);
    const git = simpleGit();
    await git.clone(authenticatedCloneUrl, tempDir, [
      "--depth",
      "1",
      "--branch",
      dockerImageFromBranch,
    ]);
    await _log(`[Bitbucket Rebuild] Repository cloned successfully`);

    // Verify checkout (the clone with --branch already checks out the specified branch)
    const repoGit = simpleGit(tempDir);
    const branch = await repoGit.revparse(["--abbrev-ref", "HEAD"]);
    await _log(`[Bitbucket Rebuild] Current branch: ${branch.trim()}`);

    // Get the HEAD commit hash to use as the Docker image tag
    const commitHash = (await repoGit.revparse(["HEAD"])).trim();
    const shortHash = commitHash.substring(0, 7);
    dockerImageTag = `${dockerImageName}:${shortHash}`;
    await _log(`[Bitbucket Rebuild] Commit hash: ${shortHash} (${commitHash})`);
    await _log(`[Bitbucket Rebuild] Docker image tag: ${dockerImageTag}`);

    // Check if the image for this commit already exists — skip rebuild if so
    const docker = new Docker();
    try {
      await docker.getImage(dockerImageTag).inspect();
      await _log(
        `[Bitbucket Rebuild] Image ${dockerImageTag} already exists — skipping rebuild`,
      );

      // Ensure the DB is up-to-date (defensive: it should already match)
      await SubResource.findByIdAndUpdate(subResource._id, {
        "rearch.dockerImage": dockerImageTag,
      });

      return {
        success: true,
        skipped: true,
        dockerImage: dockerImageTag,
        branch: dockerImageFromBranch,
        repository: subResource.externalId,
        template: template || "custom",
      };
    } catch {
      // Image doesn't exist yet — proceed with build
      await _log(
        `[Bitbucket Rebuild] Image not found locally, proceeding with build`,
      );
    }

    // Check if the repository has its own .rearch/Dockerfile
    const dockerfilePath = path.join(tempDir, ".rearch", "Dockerfile");
    let hasCustomRearch = false;
    try {
      await fs.access(dockerfilePath);
      hasCustomRearch = true;
      await _log(
        `[Bitbucket Rebuild] Found custom .rearch/Dockerfile in repository`,
      );
    } catch {
      // No custom .rearch/ folder in the repository
      await _log(
        `[Bitbucket Rebuild] No .rearch/Dockerfile found in repository`,
      );
    }

    if (!hasCustomRearch) {
      // No custom .rearch/ — use built-in template
      if (!template) {
        throw new Error(
          "No .rearch/Dockerfile found in the repository and no built-in template selected. " +
            "Either add a .rearch/ folder to the repository or select a template in ReArch Settings.",
        );
      }

      if (!VALID_TEMPLATES.includes(template)) {
        throw new Error(
          `Invalid template '${template}'. Valid templates: ${VALID_TEMPLATES.join(", ")}`,
        );
      }

      const templateDir = path.join(TEMPLATES_DIR, template);

      // Verify the template directory exists
      try {
        await fs.access(templateDir);
      } catch {
        throw new Error(
          `Built-in template directory not found: ${template}. This is a server configuration error.`,
        );
      }

      // Copy the template files into the cloned repo's .rearch/ folder
      const targetRearchDir = path.join(tempDir, ".rearch");
      await _log(
        `[Bitbucket Rebuild] Copying built-in template '${template}' to .rearch/`,
      );
      await copyDirectoryRecursive(templateDir, targetRearchDir);
      await _log(`[Bitbucket Rebuild] Template files copied successfully`);
    }

    // Build Docker image
    await _log(`[Bitbucket Rebuild] Building Docker image: ${dockerImageTag}`);

    // Build the image using dockerode
    const buildStream = await docker.buildImage(
      {
        context: tempDir,
        src: ["."],
      },
      {
        t: dockerImageTag,
        dockerfile: ".rearch/Dockerfile",
      },
    );

    // Wait for build to complete and log output
    await new Promise((resolve, reject) => {
      docker.modem.followProgress(
        buildStream,
        (err, output) => {
          if (err) {
            reject(err);
          } else {
            resolve(output);
          }
        },
        (event) => {
          // Log build progress
          if (event.stream) {
            const message = event.stream.trim();
            if (message) {
              _log(`[Docker Build] ${message}`);
            }
          }
          if (event.error) {
            _log(`[Docker Build Error] ${event.error}`);
          }
        },
      );
    });

    // Verify the image was actually created
    try {
      await docker.getImage(dockerImageTag).inspect();
    } catch (verifyErr) {
      throw new Error(
        `Docker image '${dockerImageTag}' was not found after build. The build may have failed silently.`,
      );
    }

    // Persist the new image tag (with commit hash) back to MongoDB so that
    // conversation containers will use the correct, freshly built image.
    await SubResource.findByIdAndUpdate(subResource._id, {
      "rearch.dockerImage": dockerImageTag,
    });
    await _log(
      `[Bitbucket Rebuild] Updated subresource dockerImage in DB: ${dockerImageTag}`,
    );

    // Clean up old images for this specific repository to free disk space
    await pruneOldDockerImages(docker, dockerImageTag, _log);

    await _log(
      `[Bitbucket Rebuild] Docker image built successfully: ${dockerImageTag}`,
    );

    return {
      success: true,
      dockerImage: dockerImageTag,
      branch: dockerImageFromBranch,
      repository: subResource.externalId,
      template: hasCustomRearch ? "custom" : template,
    };
  } catch (error) {
    await _log(`[Bitbucket Rebuild] Error: ${error.message}`);
    throw error;
  } finally {
    // Cleanup: Remove temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
      await _log(`[Bitbucket Rebuild] Cleaned up temp directory: ${tempDir}`);
    } catch (cleanupError) {
      await _log(
        `[Bitbucket Rebuild] Warning: Failed to cleanup temp directory: ${cleanupError.message}`,
      );
    }
  }
}

/**
 * Recursively copy a directory and all its contents.
 * @param {string} src - Source directory path
 * @param {string} dest - Destination directory path
 */
async function copyDirectoryRecursive(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDirectoryRecursive(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

/**
 * Remove old Docker images for a specific repository after a rebuild.
 *
 * Inspects the current image behind `dockerImageTag`, lists all images that
 * share the same repository name (the part before the colon), and removes
 * every image whose ID differs from the freshly built one.
 *
 * Also removes dangling (untagged) images to clean up <none>:<none> images
 * left over from previous builds that used static tags.
 *
 * Uses `force: false` so images still referenced by running containers are
 * skipped rather than forcibly removed. Errors are logged but never thrown,
 * so a failed cleanup will not fail the overall rebuild job.
 *
 * @param {import('dockerode')} docker - Dockerode client instance
 * @param {string} dockerImageTag - Full image tag (e.g. "rearch_abc123_myrepo:a1b2c3d")
 * @param {(msg: string) => Promise<void>} log - Async logging callback
 * @returns {Promise<{ removedCount: number, skippedCount: number }>}
 */
export async function pruneOldDockerImages(docker, dockerImageTag, log) {
  const _log = log || (() => {});
  let removedCount = 0;
  let skippedCount = 0;

  try {
    const newImageInfo = await docker.getImage(dockerImageTag).inspect();
    const newImageId = newImageInfo.Id;

    // Parse repository name from the tag (e.g., "rearch_abc123_myrepo" from "rearch_abc123_myrepo:a1b2c3d")
    const repoName = dockerImageTag.split(":")[0];

    // List all tagged images matching this repository name
    const allImages = await docker.listImages({
      filters: { reference: [repoName] },
    });

    for (const img of allImages) {
      if (img.Id !== newImageId) {
        try {
          await docker.getImage(img.Id).remove({ force: false });
          removedCount++;
          const tagLabel =
            (img.RepoTags && img.RepoTags[0]) || img.Id.substring(0, 19);
          await _log(`[Bitbucket Rebuild] Removed old image: ${tagLabel}`);
        } catch (removeErr) {
          skippedCount++;
          await _log(
            `[Bitbucket Rebuild] Warning: Could not remove old image ${img.Id.substring(0, 19)}: ${removeErr.message}`,
          );
        }
      }
    }

    // Also clean up dangling (<none>:<none>) images.
    // These may have been created by previous builds that used static tags
    // (the old image loses its tag when a new image is built with the same name:tag).
    try {
      const danglingImages = await docker.listImages({
        filters: { dangling: ["true"] },
      });

      for (const img of danglingImages) {
        if (img.Id !== newImageId) {
          try {
            await docker.getImage(img.Id).remove({ force: false });
            removedCount++;
            await _log(
              `[Bitbucket Rebuild] Removed dangling image: ${img.Id.substring(0, 19)}`,
            );
          } catch (removeErr) {
            skippedCount++;
            // Dangling images in use by containers will fail to remove — that's fine
            await _log(
              `[Bitbucket Rebuild] Warning: Could not remove dangling image ${img.Id.substring(0, 19)}: ${removeErr.message}`,
            );
          }
        }
      }
    } catch (danglingErr) {
      await _log(
        `[Bitbucket Rebuild] Warning: Failed to list dangling images: ${danglingErr.message}`,
      );
    }

    if (removedCount > 0) {
      await _log(
        `[Bitbucket Rebuild] Cleaned up ${removedCount} old image(s) for ${repoName}`,
      );
    } else {
      await _log(
        `[Bitbucket Rebuild] No old images to clean up for ${repoName}`,
      );
    }
  } catch (cleanupErr) {
    await _log(
      `[Bitbucket Rebuild] Warning: Failed to clean up old images: ${cleanupErr.message}`,
    );
  }

  return { removedCount, skippedCount };
}
