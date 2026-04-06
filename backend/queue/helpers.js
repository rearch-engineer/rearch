import Skill from "../models/Skill.js";
import SubResource from "../models/SubResource.js";
import Resource from "../models/Resource.js";
import { execInContainer } from "../utils/containerExec.js";

/**
 * Wait for OpenCode server to be ready inside the container
 * @param {string} url - The OpenCode server URL to check
 * @param {number} maxAttempts - Maximum number of health check attempts
 * @param {number} delayMs - Delay between attempts in milliseconds
 * @returns {Promise<boolean>} - True if server is ready
 */
async function waitForOpencodeReady(url, maxAttempts = 30, delayMs = 1000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(`${url}/global/health`);
      if (response.ok) {
        const data = await response.json();
        if (data.healthy) {
          console.log(
            `✅ OpenCode server ready at ${url} (attempt ${attempt})`,
          );
          return true;
        }
      }
    } catch (error) {
      // Server not ready yet, continue waiting
    }

    if (attempt < maxAttempts) {
      console.log(
        `⏳ Waiting for OpenCode server at ${url} (attempt ${attempt}/${maxAttempts})`,
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw new Error(
    `OpenCode server at ${url} did not become ready after ${maxAttempts} attempts`,
  );
}

/**
 * Slugify a skill title into a valid OpenCode skill name.
 * Must match ^[a-z0-9]+(-[a-z0-9]+)*$
 * @param {string} title
 * @returns {string}
 */
function toSkillName(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Resolve a SubResource ID into an authenticated git clone URL.
 * Returns { cloneUrl, name } or null if resolution fails.
 *
 * @param {string} subResourceId - The SubResource _id referencing a bitbucket-repository
 * @param {Function} log - jobLog callback
 * @returns {Promise<{cloneUrl: string, name: string} | null>}
 */
async function resolveSkillCloneUrl(subResourceId, log) {
  try {
    const skillSubResource = await SubResource.findById(subResourceId);
    if (!skillSubResource) {
      await log(
        `Skills injection: SubResource ${subResourceId} not found, skipping`,
      );
      return null;
    }

    // Derive clone URL from SubResource clone links (prefer HTTPS)
    let cloneUrl = "";
    if (skillSubResource.data?.links?.clone) {
      const httpsClone = skillSubResource.data.links.clone.find(
        (c) => c.name === "https",
      );
      const sshClone = skillSubResource.data.links.clone.find(
        (c) => c.name === "ssh",
      );
      cloneUrl = httpsClone?.href || sshClone?.href || "";
    }
    if (!cloneUrl && skillSubResource.data?.links?.html) {
      cloneUrl = skillSubResource.data.links.html;
    }

    if (!cloneUrl) {
      await log(
        `Skills injection: no clone URL found for SubResource '${skillSubResource.name}', skipping`,
      );
      return null;
    }

    // Construct an authenticated clone URL using the same approach as the
    // rebuild hook (tools/bitbucket/hooks/action/rebuild.js).
    // Uses the parent Resource's cloneUsername + apiToken and the URL
    // constructor with encodeURIComponent, which is the proven working method.
    const parentResource = await Resource.findById(skillSubResource.resource);
    if (parentResource?.data?.apiToken && parentResource?.data?.cloneUsername) {
      const cloneUrlObj = new URL(cloneUrl);
      cloneUrlObj.username = encodeURIComponent(parentResource.data.cloneUsername);
      cloneUrlObj.password = encodeURIComponent(parentResource.data.apiToken);
      cloneUrl = cloneUrlObj.toString();
    }

    return { cloneUrl, name: skillSubResource.name };
  } catch (err) {
    await log(
      `Skills injection: failed to resolve SubResource ${subResourceId} — ${err.message}`,
    );
    return null;
  }
}

/**
 * Clone all applicable skills into the container at
 * /home/coder/.config/opencode/skills/<skill-name>/
 *
 * Skills come from two sources:
 * 1. Default skills: Skill documents with isDefault=true (global, cloned into every container)
 * 2. Repo-specific skills: SubResource IDs stored in subResource.rearch.skills
 *
 * Each skill's skillsRepository field is a SubResource ID that is resolved to get the
 * actual git clone URL and Bitbucket credentials from the parent Resource.
 *
 * Errors per-skill are non-fatal — they are logged but do not throw.
 *
 * @param {string} containerId - Running Docker container ID
 * @param {string} subResourceId - The conversation's SubResource ID (to read repo-specific skills)
 * @param {Function} log - jobLog callback (message: string) => Promise<void>
 */
async function injectSkillsIntoContainer(containerId, subResourceId, log) {
  // Collect all SubResource IDs to clone (deduplicated)
  const skillSubResourceIds = new Set();
  const skillNameMap = new Map(); // subResourceId -> display name for logging

  // 1. Default skills from the Skill collection
  try {
    const defaultSkills = await Skill.find({ isDefault: true });
    for (const skill of defaultSkills) {
      if (skill.skillsRepository) {
        skillSubResourceIds.add(skill.skillsRepository);
        skillNameMap.set(skill.skillsRepository, skill.title);
      }
    }
    await log(
      `Skills injection: found ${defaultSkills.length} default skill(s)`,
    );
  } catch (err) {
    await log(
      `Skills injection: failed to fetch default skills — ${err.message}`,
    );
  }

  // 2. Repo-specific skills from SubResource.rearch.skills
  try {
    const subResource = await SubResource.findById(subResourceId);
    const repoSkills = subResource?.rearch?.skills || [];
    for (const skillId of repoSkills) {
      if (skillId && !skillSubResourceIds.has(skillId)) {
        skillSubResourceIds.add(skillId);
        skillNameMap.set(skillId, `repo-specific:${skillId}`);
      }
    }
    await log(
      `Skills injection: found ${repoSkills.length} repo-specific skill(s)`,
    );
  } catch (err) {
    await log(
      `Skills injection: failed to read repo-specific skills — ${err.message}`,
    );
  }

  if (skillSubResourceIds.size === 0) {
    await log("Skills injection: no skills to inject, skipping");
    return;
  }

  await log(
    `Skills injection: injecting ${skillSubResourceIds.size} skill(s) into container`,
  );

  // Ensure the skills directory exists
  const skillsDir = "/home/coder/.config/opencode/skills";
  try {
    await execInContainer(containerId, `mkdir -p ${skillsDir}`, {
      user: "coder",
      workingDir: "/home/coder",
      timeout: 10000,
    });
  } catch (err) {
    await log(
      `Skills injection: could not create skills directory — ${err.message}`,
    );
    return;
  }

  for (const subResId of skillSubResourceIds) {
    const displayName = skillNameMap.get(subResId) || subResId;

    const resolved = await resolveSkillCloneUrl(subResId, log);
    if (!resolved) {
      continue;
    }

    // Clone to a temporary directory, strip the .git metadata, then copy
    // the contents into the shared skills folder.  This ensures:
    //   1. No per-repo subfolder — all files land directly in skillsDir
    //   2. The result is not a git repository (no .git/)
    const tmpDir = `/tmp/_skill_inject_${Date.now()}`;
    try {
      const cloneCmd = `git clone ${resolved.cloneUrl} ${tmpDir}`;
      const { exitCode: cloneExit, stderr: cloneErr } = await execInContainer(
        containerId,
        cloneCmd,
        { user: "coder", workingDir: "/home/coder", timeout: 60000 },
      );

      if (cloneExit !== 0) {
        await log(
          `Skills injection: clone of '${displayName}' exited with code ${cloneExit} — ${cloneErr}`,
        );
        // Clean up on failure
        await execInContainer(containerId, `rm -rf ${tmpDir}`, {
          user: "coder",
          workingDir: "/home/coder",
          timeout: 10000,
        }).catch(() => {});
        continue;
      }

      // Remove .git so the skills folder is not a git repo, then copy
      // contents into the shared skills directory and clean up.
      const copyCmd = [
        `rm -rf ${tmpDir}/.git`,
        `cp -a ${tmpDir}/. ${skillsDir}/`,
        `rm -rf ${tmpDir}`,
      ].join(" && ");

      const { exitCode: copyExit, stderr: copyErr } = await execInContainer(
        containerId,
        copyCmd,
        { user: "coder", workingDir: "/home/coder", timeout: 30000 },
      );

      if (copyExit === 0) {
        await log(
          `Skills injection: injected '${displayName}' (${resolved.name}) successfully`,
        );
      } else {
        await log(
          `Skills injection: copy of '${displayName}' failed with code ${copyExit} — ${copyErr}`,
        );
      }
    } catch (err) {
      await log(
        `Skills injection: failed to inject '${displayName}' — ${err.message}`,
      );
      // Best-effort cleanup
      await execInContainer(containerId, `rm -rf ${tmpDir}`, {
        user: "coder",
        workingDir: "/home/coder",
        timeout: 10000,
      }).catch(() => {});
    }
  }

  await log("Skills injection: complete");
}

export { waitForOpencodeReady, toSkillName, injectSkillsIntoContainer };
