/**
 * Docker container exec utility
 * Executes shell commands inside running Docker containers via dockerode
 */
import Docker from "dockerode";
import { PassThrough } from "stream";

const docker = new Docker();

/**
 * Execute a command inside a running Docker container
 * @param {string} containerId - Docker container ID
 * @param {string|string[]} command - Command to execute (string will be wrapped in sh -c)
 * @param {Object} options - Execution options
 * @param {string} options.user - User to run the command as (default: 'coder')
 * @param {string} options.workingDir - Working directory inside the container (default: '/repository')
 * @param {number} options.timeout - Timeout in milliseconds (default: 30000)
 * @returns {Promise<{stdout: string, stderr: string, exitCode: number}>}
 */
export async function execInContainer(containerId, command, options = {}) {
  const {
    user = "coder",
    workingDir = "/repository",
    timeout = 30000,
  } = options;

  const container = docker.getContainer(containerId);

  // Ensure the container is running
  const info = await container.inspect();
  if (!info.State.Running) {
    throw new Error("Container is not running");
  }

  // Build the command array
  const cmd = typeof command === "string"
    ? ["sh", "-c", command]
    : command;

  const exec = await container.exec({
    Cmd: cmd,
    AttachStdout: true,
    AttachStderr: true,
    User: user,
    WorkingDir: workingDir,
  });

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Command timed out after ${timeout}ms`));
    }, timeout);

    // Use non-hijack mode to avoid HTTP 101 Switching Protocols errors.
    // docker-modem's statusCodes map for exec.start doesn't include 101,
    // causing hijack:true to fail in some Docker socket configurations.
    exec.start({}, (err, stream) => {
      if (err) {
        clearTimeout(timer);
        return reject(err);
      }

      let stdout = "";
      let stderr = "";

      // Use dockerode's built-in demuxStream to split the multiplexed
      // stdout/stderr stream instead of manual frame parsing.
      const stdoutPassThrough = new PassThrough();
      const stderrPassThrough = new PassThrough();

      stdoutPassThrough.on("data", (chunk) => {
        stdout += chunk.toString("utf8");
      });

      stderrPassThrough.on("data", (chunk) => {
        stderr += chunk.toString("utf8");
      });

      docker.modem.demuxStream(stream, stdoutPassThrough, stderrPassThrough);

      stream.on("end", async () => {
        clearTimeout(timer);
        try {
          const inspectData = await exec.inspect();
          resolve({
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            exitCode: inspectData.ExitCode,
          });
        } catch (inspectErr) {
          resolve({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode: -1 });
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
 * Execute a git command inside a container
 * Convenience wrapper for git-specific operations
 * @param {string} containerId - Docker container ID
 * @param {string} gitCommand - Git command (without the 'git' prefix)
 * @param {Object} options - Additional exec options
 * @returns {Promise<{stdout: string, stderr: string, exitCode: number}>}
 */
export async function gitExec(containerId, gitCommand, options = {}) {
  return execInContainer(containerId, `git ${gitCommand}`, options);
}
