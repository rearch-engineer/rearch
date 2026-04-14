import simpleGit from "simple-git";
import Docker from "dockerode";
import temp from "temp";
import fs from "node:fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import SubResource from "../../../../models/SubResource.js";
import { getInstallationToken } from "../../../../utils/github/github.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve path to the built-in templates directory
const TEMPLATES_DIR = path.resolve(__dirname, "../../../../templates");

// Valid built-in template names
const VALID_TEMPLATES = ["minimal", "node", "node-browser", "node-react-pg"];

/**
 * Rebuild action hook for GitHub repositories
 *
 * This hook:
 * 1. Generates an installation access token for cloning
 * 2. Clones the repository to a temporary folder
 * 3. Checks out to the branch specified in rearch.dockerImageFromBranch
 * 4. If .rearch/Dockerfile exists in the repo, uses it to build the image
 * 5. If not, copies the selected built-in template into .rearch/ and builds from it
 * 6. Builds a Docker image tagged as rearch_<subresource_id>_<slug>:<commitHash>
 * 7. Persists the new image tag back to subResource.rearch.dockerImage in MongoDB
 * 8. Cleans up old images for the same repository
 */
export default async function onRebuild(job, { log } = {}) {
  const _log = log || ((msg) => job.log(msg));
  const { parentResource, subResource } = job.data;

  await _log(
    `[GitHub Rebuild] Starting rebuild for repository: ${subResource.externalId}`,
  );

  const dockerImageFromBranch = subResource.rearch?.dockerImageFromBranch;
  const template = subResource.rearch?.template || "";
  const cloneLinks = subResource.data?.links?.clone;

  // Determine Docker image name
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
  await _log(`[GitHub Rebuild] Docker image name: ${dockerImageName}`);

  let dockerImageTag = null;

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

  await _log(`[GitHub Rebuild] HTTPS Clone URL: ${httpsCloneLink.href}`);

  // Generate installation token for cloning
  const token = await getInstallationToken(parentResource.data);

  // Construct authenticated clone URL
  // Format: https://x-access-token:TOKEN@github.com/owner/repo.git
  const cloneUrl = new URL(httpsCloneLink.href);
  cloneUrl.username = "x-access-token";
  cloneUrl.password = token;
  const authenticatedCloneUrl = cloneUrl.toString();

  await _log(
    `[GitHub Rebuild] Clone URL: ${httpsCloneLink.href} (credentials hidden)`,
  );
  await _log(
    `[GitHub Rebuild] Branch to checkout: ${dockerImageFromBranch}`,
  );
  if (template) {
    await _log(`[GitHub Rebuild] Using built-in template: ${template}`);
  }

  // Create temporary directory
  const tempDir = temp.mkdirSync("github-rebuild-");
  await _log(`[GitHub Rebuild] Created temp directory: ${tempDir}`);

  try {
    // Clone the repository
    await _log(`[GitHub Rebuild] Cloning repository...`);
    const git = simpleGit();
    await git.clone(authenticatedCloneUrl, tempDir, [
      "--depth",
      "1",
      "--branch",
      dockerImageFromBranch,
    ]);
    await _log(`[GitHub Rebuild] Repository cloned successfully`);

    const repoGit = simpleGit(tempDir);
    const branch = await repoGit.revparse(["--abbrev-ref", "HEAD"]);
    await _log(`[GitHub Rebuild] Current branch: ${branch.trim()}`);

    // Get the HEAD commit hash
    const commitHash = (await repoGit.revparse(["HEAD"])).trim();
    const shortHash = commitHash.substring(0, 7);
    dockerImageTag = `${dockerImageName}:${shortHash}`;
    await _log(
      `[GitHub Rebuild] Commit hash: ${shortHash} (${commitHash})`,
    );
    await _log(`[GitHub Rebuild] Docker image tag: ${dockerImageTag}`);

    // Check if the image already exists
    const docker = new Docker();
    try {
      await docker.getImage(dockerImageTag).inspect();
      await _log(
        `[GitHub Rebuild] Image ${dockerImageTag} already exists — skipping rebuild`,
      );

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
      await _log(
        `[GitHub Rebuild] Image not found locally, proceeding with build`,
      );
    }

    // Check for custom .rearch/Dockerfile
    const dockerfilePath = path.join(tempDir, ".rearch", "Dockerfile");
    let hasCustomRearch = false;
    try {
      await fs.access(dockerfilePath);
      hasCustomRearch = true;
      await _log(
        `[GitHub Rebuild] Found custom .rearch/Dockerfile in repository`,
      );
    } catch {
      await _log(
        `[GitHub Rebuild] No .rearch/Dockerfile found in repository`,
      );
    }

    if (!hasCustomRearch) {
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
      try {
        await fs.access(templateDir);
      } catch {
        throw new Error(
          `Built-in template directory not found: ${template}. This is a server configuration error.`,
        );
      }

      const targetRearchDir = path.join(tempDir, ".rearch");
      await _log(
        `[GitHub Rebuild] Copying built-in template '${template}' to .rearch/`,
      );
      await copyDirectoryRecursive(templateDir, targetRearchDir);
      await _log(`[GitHub Rebuild] Template files copied successfully`);
    }

    // Build Docker image
    await _log(
      `[GitHub Rebuild] Building Docker image: ${dockerImageTag}`,
    );

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

    await new Promise((resolve, reject) => {
      docker.modem.followProgress(
        buildStream,
        (err, output) => {
          if (err) reject(err);
          else resolve(output);
        },
        (event) => {
          if (event.stream) {
            const message = event.stream.trim();
            if (message) _log(`[Docker Build] ${message}`);
          }
          if (event.error) _log(`[Docker Build Error] ${event.error}`);
        },
      );
    });

    // Verify image was created
    try {
      await docker.getImage(dockerImageTag).inspect();
    } catch (verifyErr) {
      throw new Error(
        `Docker image '${dockerImageTag}' was not found after build. The build may have failed silently.`,
      );
    }

    // Persist image tag to MongoDB
    await SubResource.findByIdAndUpdate(subResource._id, {
      "rearch.dockerImage": dockerImageTag,
    });
    await _log(
      `[GitHub Rebuild] Updated subresource dockerImage in DB: ${dockerImageTag}`,
    );

    // Clean up old images
    await pruneOldDockerImages(docker, dockerImageTag, _log);

    await _log(
      `[GitHub Rebuild] Docker image built successfully: ${dockerImageTag}`,
    );

    return {
      success: true,
      dockerImage: dockerImageTag,
      branch: dockerImageFromBranch,
      repository: subResource.externalId,
      template: hasCustomRearch ? "custom" : template,
    };
  } catch (error) {
    await _log(`[GitHub Rebuild] Error: ${error.message}`);
    throw error;
  } finally {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
      await _log(`[GitHub Rebuild] Cleaned up temp directory: ${tempDir}`);
    } catch (cleanupError) {
      await _log(
        `[GitHub Rebuild] Warning: Failed to cleanup temp directory: ${cleanupError.message}`,
      );
    }
  }
}

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

export async function pruneOldDockerImages(docker, dockerImageTag, log) {
  const _log = log || (() => {});
  let removedCount = 0;
  let skippedCount = 0;

  try {
    const newImageInfo = await docker.getImage(dockerImageTag).inspect();
    const newImageId = newImageInfo.Id;
    const repoName = dockerImageTag.split(":")[0];

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
          await _log(`[GitHub Rebuild] Removed old image: ${tagLabel}`);
        } catch (removeErr) {
          skippedCount++;
          await _log(
            `[GitHub Rebuild] Warning: Could not remove old image ${img.Id.substring(0, 19)}: ${removeErr.message}`,
          );
        }
      }
    }

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
              `[GitHub Rebuild] Removed dangling image: ${img.Id.substring(0, 19)}`,
            );
          } catch (removeErr) {
            skippedCount++;
          }
        }
      }
    } catch (danglingErr) {
      await _log(
        `[GitHub Rebuild] Warning: Failed to list dangling images: ${danglingErr.message}`,
      );
    }

    if (removedCount > 0) {
      await _log(
        `[GitHub Rebuild] Cleaned up ${removedCount} old image(s) for ${repoName}`,
      );
    }
  } catch (cleanupErr) {
    await _log(
      `[GitHub Rebuild] Warning: Failed to clean up old images: ${cleanupErr.message}`,
    );
  }

  return { removedCount, skippedCount };
}
