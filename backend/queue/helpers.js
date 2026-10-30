import Skill from "../models/Skill.js";
import Agent from "../models/Agent.js";
import Resource from "../models/Resource.js";
import Connection from "../models/Connection.js";
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
 * Resolve a Resource ID into an authenticated git clone URL.
 * Returns { cloneUrl, name } or null if resolution fails.
 *
 * @param {string} resourceId - The Resource _id referencing a bitbucket-repository
 * @param {Function} log - jobLog callback
 * @returns {Promise<{cloneUrl: string, name: string} | null>}
 */
async function resolveSkillCloneUrl(resourceId, log) {
  try {
    const skillResource = await Resource.findById(resourceId);
    if (!skillResource) {
      await log(
        `Skills injection: Resource ${resourceId} not found, skipping`,
      );
      return null;
    }

    // Derive clone URL from Resource clone links (prefer HTTPS)
    let cloneUrl = "";
    if (skillResource.data?.links?.clone) {
      const httpsClone = skillResource.data.links.clone.find(
        (c) => c.name === "https",
      );
      const sshClone = skillResource.data.links.clone.find(
        (c) => c.name === "ssh",
      );
      cloneUrl = httpsClone?.href || sshClone?.href || "";
    }
    if (!cloneUrl && skillResource.data?.links?.html) {
      cloneUrl = skillResource.data.links.html;
    }

    if (!cloneUrl) {
      await log(
        `Skills injection: no clone URL found for Resource '${skillResource.name}', skipping`,
      );
      return null;
    }

    // Construct an authenticated clone URL using the same approach as the
    // rebuild hook (tools/bitbucket/hooks/action/rebuild.js).
    // Uses the parent Connection's cloneUsername + apiToken and the URL
    // constructor with encodeURIComponent, which is the proven working method.
    const connection = await Connection.findById(skillResource.connection);
    if (connection?.data?.apiToken && connection?.data?.cloneUsername) {
      const cloneUrlObj = new URL(cloneUrl);
      cloneUrlObj.username = encodeURIComponent(connection.data.cloneUsername);
      cloneUrlObj.password = encodeURIComponent(connection.data.apiToken);
      cloneUrl = cloneUrlObj.toString();
    }

    return { cloneUrl, name: skillResource.name };
  } catch (err) {
    await log(
      `Skills injection: failed to resolve Resource ${resourceId} — ${err.message}`,
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
 * 2. Agent-specific skills: Resource IDs stored in Agent.skills
 *
 * Each skill's skillsRepository field is a Resource ID that is resolved to get the
 * actual git clone URL and Bitbucket credentials from the parent Connection.
 *
 * Errors per-skill are non-fatal — they are logged but do not throw.
 *
 * @param {string} containerId - Running Docker container ID
 * @param {string} agentId - The conversation's Agent ID (to read agent-specific skills)
 * @param {Function} log - jobLog callback (message: string) => Promise<void>
 */
async function injectSkillsIntoContainer(containerId, agentId, log) {
  // Collect all Resource IDs to clone (deduplicated)
  const skillResourceIds = new Set();
  const skillNameMap = new Map(); // resourceId -> display name for logging

  // 1. Default skills from the Skill collection
  try {
    const defaultSkills = await Skill.find({ isDefault: true });
    for (const skill of defaultSkills) {
      if (skill.skillsRepository) {
        skillResourceIds.add(skill.skillsRepository);
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

  // 2. Agent-specific skills from Agent.skills
  try {
    const agent = agentId ? await Agent.findById(agentId) : null;
    const agentSkills = agent?.skills || [];
    for (const skillId of agentSkills) {
      if (skillId && !skillResourceIds.has(skillId)) {
        skillResourceIds.add(skillId);
        skillNameMap.set(skillId, `agent-specific:${skillId}`);
      }
    }
    await log(
      `Skills injection: found ${agentSkills.length} agent-specific skill(s)`,
    );
  } catch (err) {
    await log(
      `Skills injection: failed to read agent-specific skills — ${err.message}`,
    );
  }

  if (skillResourceIds.size === 0) {
    await log("Skills injection: no skills to inject, skipping");
    return;
  }

  await log(
    `Skills injection: injecting ${skillResourceIds.size} skill(s) into container`,
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

  for (const subResId of skillResourceIds) {
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

/**
 * Write OpenCode auth credentials (e.g. GitHub Copilot OAuth tokens) into
 * the container's auth.json.  This is done via `docker exec` so it works
 * with existing container images that don't have the entrypoint.sh change.
 *
 * The auth.json file is placed at ~/.local/share/opencode/auth.json which
 * is where OpenCode reads provider credentials from.
 *
 * @param {string} containerId - Running Docker container ID
 * @param {Object} authConfig - Auth config object (e.g. { "github-copilot": { ... } })
 * @param {Function} log - Logging callback
 */
async function injectAuthIntoContainer(containerId, authConfig, log) {
  if (!authConfig || Object.keys(authConfig).length === 0) {
    return;
  }

  const authDir = "/home/coder/.local/share/opencode";
  const authFile = `${authDir}/auth.json`;
  const authJson = JSON.stringify(authConfig);

  try {
    // Create directory and write auth.json in a single exec call.
    // Use printf instead of echo to avoid any shell interpretation issues.
    const cmd = `mkdir -p ${authDir} && printf '%s' '${authJson.replace(/'/g, "'\\''")}' > ${authFile} && chown -R coder:coder /home/coder/.local/share/opencode`;
    await execInContainer(containerId, cmd, {
      user: "root",
      workingDir: "/home/coder",
      timeout: 10000,
    });
    await log("Auth injection: auth.json written successfully");
  } catch (err) {
    await log(`Auth injection: failed to write auth.json — ${err.message}`);
  }
}

export { waitForOpencodeReady, toSkillName, injectSkillsIntoContainer, injectAuthIntoContainer };
