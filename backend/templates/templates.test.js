/**
 * Integration tests for ReArch container templates.
 *
 * For each built-in template (minimal, node, node-browser) this suite:
 *   1. Builds a Docker image using the template's Dockerfile (mirrors rebuild.js)
 *   2. Launches a container via createConversationContainer (same as conversationsWorker.js)
 *   3. Verifies code-server (VS Code) responds on port 8080
 *   4. Verifies OpenCode health endpoint on port 4096
 *   5. Verifies the OpenCode config inside the container contains MCP "rearch-tools"
 *
 * Requirements:
 *   - Docker daemon must be running
 *   - Run with: bun test templates/templates.test.js --timeout 1200000
 *
 * These tests are slow (Docker builds). Use `test:integration` script.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import Docker from "dockerode";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { PassThrough } from "node:stream";

import { createConversationContainer } from "../queue/createConversationContainer.js";

const docker = new Docker();

const TEMPLATES = ["minimal", "node", "node-browser", "node-react-pg"];
const TEMPLATES_DIR = path.resolve(import.meta.dirname, ".");

// Dummy Anthropic key — OpenCode's `serve` command does not validate the key
// at startup; it only contacts Anthropic when a prompt is actually sent.
const DUMMY_ANTHROPIC_KEY = "sk-ant-dummy-key-for-integration-tests-000000";

// ─── Mock MCP Server ─────────────────────────────────────────────────────────
// A lightweight HTTP server that responds 200 to any request, used to verify
// the container can resolve the rearch-tools MCP endpoint.
let mockMcpServer;
let mockMcpPort;

// ─── Tracking for cleanup ────────────────────────────────────────────────────
const createdContainers = [];
const createdImages = [];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Copy a directory recursively (same logic as rebuild.js copyDirectoryRecursive)
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
 * Build a Docker image from a template, mirroring what rebuild.js does:
 * - Creates a temp dir with a minimal repo scaffold
 * - Copies the template into .rearch/
 * - Builds with dockerfile: ".rearch/Dockerfile"
 */
async function buildTemplateImage(templateName) {
  const tag = `rearch_test_${templateName}:latest`;
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), `rearch-test-${templateName}-`),
  );

  try {
    // Scaffold a minimal "repository" so the COPY . /repository step works
    await fs.writeFile(
      path.join(tempDir, "package.json"),
      JSON.stringify(
        { name: "test-repo", version: "1.0.0", private: true },
        null,
        2,
      ),
    );
    await fs.writeFile(
      path.join(tempDir, "README.md"),
      `# Test repo for ${templateName} template\n`,
    );

    // Copy template files into .rearch/ (same as rebuild.js lines 220-227)
    const templateDir = path.join(TEMPLATES_DIR, templateName);
    const targetRearchDir = path.join(tempDir, ".rearch");
    await copyDirectoryRecursive(templateDir, targetRearchDir);

    // Build the image (same options as rebuild.js lines 236-245)
    const buildStream = await docker.buildImage(
      { context: tempDir, src: ["."] },
      { t: tag, dockerfile: ".rearch/Dockerfile" },
    );

    // Wait for build to complete, collecting output for debugging on failure
    const buildLog = [];
    await new Promise((resolve, reject) => {
      docker.modem.followProgress(
        buildStream,
        (err, output) => (err ? reject(err) : resolve(output)),
        (event) => {
          if (event.stream) buildLog.push(event.stream.trim());
          if (event.error) buildLog.push(`ERROR: ${event.error}`);
        },
      );
    });

    // Verify the image exists
    await docker.getImage(tag).inspect();
    createdImages.push(tag);

    return { tag, buildLog };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Poll a URL until it responds with the expected condition, or time out.
 */
async function waitForService(
  url,
  { check, label, maxAttempts = 60, delayMs = 2000 } = {},
) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(url);
      if (check) {
        const ok = await check(response);
        if (ok) return true;
      } else if (response.ok) {
        return true;
      }
    } catch {
      // Service not ready yet
    }
    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error(
    `${label || url} did not become ready after ${maxAttempts} attempts (${(maxAttempts * delayMs) / 1000}s)`,
  );
}

/**
 * Execute a command inside a running container and return stdout.
 * Mirrors containerExec.js logic.
 */
async function execInContainer(containerId, command, { timeout = 30000 } = {}) {
  const container = docker.getContainer(containerId);
  const exec = await container.exec({
    Cmd: ["sh", "-c", command],
    AttachStdout: true,
    AttachStderr: true,
    User: "coder",
    WorkingDir: "/repository",
  });

  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Exec timed out after ${timeout}ms`)),
      timeout,
    );

    exec.start({}, (err, stream) => {
      if (err) {
        clearTimeout(timer);
        return reject(err);
      }

      let stdout = "";
      let stderr = "";

      const stdoutPT = new PassThrough();
      const stderrPT = new PassThrough();

      stdoutPT.on("data", (chunk) => {
        stdout += chunk.toString("utf8");
      });
      stderrPT.on("data", (chunk) => {
        stderr += chunk.toString("utf8");
      });

      docker.modem.demuxStream(stream, stdoutPT, stderrPT);

      stream.on("end", async () => {
        clearTimeout(timer);
        try {
          const inspectData = await exec.inspect();
          resolve({
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            exitCode: inspectData.ExitCode,
          });
        } catch {
          resolve({
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            exitCode: -1,
          });
        }
      });

      stream.on("error", (streamErr) => {
        clearTimeout(timer);
        reject(streamErr);
      });
    });
  });
}

/**
 * Stop and remove a container, swallowing errors.
 */
async function removeContainer(containerId) {
  try {
    const container = docker.getContainer(containerId);
    try {
      await container.stop({ t: 5 });
    } catch {
      /* already stopped */
    }
    try {
      await container.remove({ force: true });
    } catch {
      /* already removed */
    }
  } catch {
    /* ignore */
  }
}

/**
 * Remove a Docker image, swallowing errors.
 */
async function removeImage(imageTag) {
  try {
    await docker.getImage(imageTag).remove({ force: true });
  } catch {
    /* ignore */
  }
}

// ─── Pre-flight: verify Docker is available ──────────────────────────────────

let dockerAvailable = false;
try {
  await docker.ping();
  dockerAvailable = true;
} catch {
  console.warn(
    "Docker daemon is not available — skipping template integration tests",
  );
}

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe.if(dockerAvailable)("templates integration", () => {
  // ── Global setup / teardown ──────────────────────────────────────────────

  // Save original env values to restore after tests
  const origMcpProxy = process.env.MCP_PROXY_FROM_DEV_CONTAINERS;
  const origDockerNetwork = process.env.DOCKER_NETWORK;
  const origAppDomain = process.env.APP_DOMAIN;

  beforeAll(async () => {
    // Start the mock MCP server on a random port
    mockMcpServer = Bun.serve({
      port: 0, // random available port
      fetch() {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    });
    mockMcpPort = mockMcpServer.port;
    console.log(`[Test] Mock MCP server started on port ${mockMcpPort}`);

    // Point the MCP proxy env var to our mock server so that
    // createConversationContainer builds the correct OPENCODE_CONFIG_CONTENT
    process.env.MCP_PROXY_FROM_DEV_CONTAINERS = `http://host.docker.internal:${mockMcpPort}`;

    // Ensure host-port mode (not overlay network) for local testing
    delete process.env.DOCKER_NETWORK;
    delete process.env.APP_DOMAIN;
  });

  afterAll(async () => {
    // Restore original env values
    if (origMcpProxy !== undefined) {
      process.env.MCP_PROXY_FROM_DEV_CONTAINERS = origMcpProxy;
    } else {
      delete process.env.MCP_PROXY_FROM_DEV_CONTAINERS;
    }
    if (origDockerNetwork !== undefined) {
      process.env.DOCKER_NETWORK = origDockerNetwork;
    }
    if (origAppDomain !== undefined) {
      process.env.APP_DOMAIN = origAppDomain;
    }

    // Stop mock MCP server
    if (mockMcpServer) {
      mockMcpServer.stop(true);
      console.log("[Test] Mock MCP server stopped");
    }

    // Clean up all containers
    for (const id of createdContainers) {
      console.log(`[Test] Cleaning up container ${id.substring(0, 12)}`);
      await removeContainer(id);
    }

    // Clean up all images
    for (const tag of createdImages) {
      console.log(`[Test] Cleaning up image ${tag}`);
      await removeImage(tag);
    }
  });

  // ── Per-template tests ───────────────────────────────────────────────────

  for (const template of TEMPLATES) {
    describe(`template: ${template}`, () => {
      let imageTag;
      let containerId;
      let opencodePort;
      let codeServerPort;

      // ── Build ──────────────────────────────────────────────────────────

      it(
        "builds a Docker image from the template Dockerfile",
        async () => {
          const result = await buildTemplateImage(template);
          imageTag = result.tag;

          // Verify the image exists in Docker
          const imageInfo = await docker.getImage(imageTag).inspect();
          expect(imageInfo).toBeDefined();
          expect(imageInfo.RepoTags).toContain(imageTag);
        },
        10 * 60 * 1000, // 10 minutes — Playwright + Chromium install is slow
      );

      // ── Launch ─────────────────────────────────────────────────────────

      it(
        "starts a container via createConversationContainer",
        async () => {
          expect(imageTag).toBeDefined(); // build must have succeeded

          const conversationId = `test-${template}-${Date.now()}`;

          const result = await createConversationContainer({
            containerImage: imageTag,
            conversationId,
            repoUrl: "",
            repoBranch: "main",
            anthropicApiKey: DUMMY_ANTHROPIC_KEY,
            appPort: "3000",
            appStartCommand: "echo noop",
            log: (msg) => console.log(`[Test:${template}] ${msg}`),
          });

          containerId = result.containerId;
          createdContainers.push(containerId);

          opencodePort = result.hostPort;
          codeServerPort = result.codeServerHostPort;

          expect(containerId).toBeDefined();
          expect(opencodePort).toBeGreaterThan(0);
          expect(codeServerPort).toBeGreaterThan(0);

          // Verify the container is running
          const info = await docker.getContainer(containerId).inspect();
          expect(info.State.Running).toBe(true);
        },
        60 * 1000, // 1 minute
      );

      // ── VS Code Server ─────────────────────────────────────────────────

      it(
        "VS Code server (code-server) responds with HTTP 200 on port 8080",
        async () => {
          expect(codeServerPort).toBeDefined();

          const url = `http://localhost:${codeServerPort}`;
          await waitForService(url, {
            label: `code-server (${template})`,
            maxAttempts: 60,
            delayMs: 2000,
          });

          // Final verification
          const response = await fetch(url);
          expect(response.status).toBe(200);
        },
        3 * 60 * 1000, // 3 minutes
      );

      // ── OpenCode Server ────────────────────────────────────────────────

      it(
        "OpenCode health endpoint returns { healthy: true } on port 4096",
        async () => {
          expect(opencodePort).toBeDefined();

          const healthUrl = `http://localhost:${opencodePort}/global/health`;

          // Same readiness check as waitForOpencodeReady in queue/helpers.js
          await waitForService(healthUrl, {
            label: `OpenCode health (${template})`,
            maxAttempts: 60,
            delayMs: 2000,
            check: async (response) => {
              if (!response.ok) return false;
              try {
                const data = await response.json();
                return data.healthy === true;
              } catch {
                return false;
              }
            },
          });

          // Final verification
          const response = await fetch(healthUrl);
          expect(response.ok).toBe(true);
          const data = await response.json();
          expect(data.healthy).toBe(true);
        },
        3 * 60 * 1000, // 3 minutes
      );

      // ── MCP rearch-tools Config ────────────────────────────────────────

      it(
        'OpenCode config contains MCP "rearch-tools" with correct URL',
        async () => {
          expect(containerId).toBeDefined();

          // Read the config file written by entrypoint.sh
          const result = await execInContainer(
            containerId,
            "cat /home/coder/.config/opencode/opencode.json",
          );

          expect(result.exitCode).toBe(0);
          expect(result.stdout).toBeTruthy();

          const config = JSON.parse(result.stdout);

          // Verify the MCP section exists and has rearch-tools
          expect(config.mcp).toBeDefined();
          expect(config.mcp["rearch-tools"]).toBeDefined();
          expect(config.mcp["rearch-tools"].type).toBe("remote");
          expect(config.mcp["rearch-tools"].url).toBe(
            `http://host.docker.internal:${mockMcpPort}/mcp`,
          );
        },
        30 * 1000, // 30 seconds
      );

      // ── Per-template cleanup ───────────────────────────────────────────

      afterAll(async () => {
        if (containerId) {
          console.log(
            `[Test] Stopping container for ${template}: ${containerId.substring(0, 12)}`,
          );
          await removeContainer(containerId);
          // Remove from global tracking since we already cleaned up
          const idx = createdContainers.indexOf(containerId);
          if (idx !== -1) createdContainers.splice(idx, 1);
        }
      });
    });
  }
});
