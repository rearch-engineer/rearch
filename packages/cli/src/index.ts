#!/usr/bin/env node
/**
 * ReArch CLI — runs the full ReArch stack via Docker with a single command.
 *
 * Usage:
 *   npx rearch-cli                    # start the stack (frontend on :3000)
 *   npx rearch-cli --port 4000        # custom frontend port
 *   npx rearch-cli --api-port 5050    # custom backend port
 *   npx rearch-cli --no-pull          # skip pulling images
 *   npx rearch-cli stop               # stop the stack
 *   npx rearch-cli status             # show container status
 *   npx rearch-cli logs [service]     # tail logs
 *
 * Authentication is forced to AUTH_MODE=NONE so users land directly into the
 * application without having to sign up or log in. A guest user with the
 * configured admin email is auto-created on first start.
 */

import { execSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import chalk from "chalk";
import { Command } from "commander";

// ─── Constants ────────────────────────────────────────────────────────────────

const NETWORK_NAME = "rearch-net";

const FRONTEND_CONTAINER = "rearch-frontend";
const BACKEND_CONTAINER = "rearch-backend";
const MCP_PROXY_CONTAINER = "rearch-mcp-proxy";
const MONGODB_CONTAINER = "rearch-mongodb";
const REDIS_CONTAINER = "rearch-redis";

const FRONTEND_IMAGE_BASE = "ghcr.io/rearch-engineer/rearch-frontend";
const BACKEND_IMAGE_BASE = "ghcr.io/rearch-engineer/rearch-backend";
const MCP_PROXY_IMAGE_BASE = "ghcr.io/rearch-engineer/rearch-mcp-proxy";
const MONGODB_IMAGE = "mongo:7";
const REDIS_IMAGE = "redis:7-alpine";

const DEFAULT_IMAGE_TAG = "latest";
const DEV_IMAGE_TAG = "dev";

const DEFAULT_FRONTEND_PORT = "3000";
const DEFAULT_API_PORT = "5050";
const BACKEND_INTERNAL_PORT = 5000;

/**
 * Default platform for the rearch-* images. The ReArch images are currently
 * only published for linux/amd64, so on Apple Silicon (linux/arm64/v8) we
 * fall back to amd64 emulation. Users can override with --platform.
 *
 * Mongo and Redis are multi-arch, so we don't force a platform on them.
 */
const DEFAULT_PLATFORM = "linux/amd64";

const ALL_CONTAINERS = [
  FRONTEND_CONTAINER,
  BACKEND_CONTAINER,
  MCP_PROXY_CONTAINER,
  MONGODB_CONTAINER,
  REDIS_CONTAINER,
];

// ─── State directory (persisted secrets and data) ────────────────────────────

const STATE_DIR = join(homedir(), ".rearch");
const SECRETS_FILE = join(STATE_DIR, "secrets.json");
const MONGO_DATA_DIR = join(STATE_DIR, "mongodb");
const REDIS_DATA_DIR = join(STATE_DIR, "redis");
const BACKEND_DATA_DIR = join(STATE_DIR, "backend-data");

interface Secrets {
  jwt_secret: string;
  internal_api_secret: string;
  mcp_proxy_secret: string;
  encryption_key: string;
  admin_email: string;
}

function ensureStateDir(): void {
  for (const dir of [
    STATE_DIR,
    MONGO_DATA_DIR,
    REDIS_DATA_DIR,
    BACKEND_DATA_DIR,
  ]) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
}

function loadOrCreateSecrets(): Secrets {
  ensureStateDir();
  if (existsSync(SECRETS_FILE)) {
    try {
      const parsed = JSON.parse(
        readFileSync(SECRETS_FILE, "utf-8"),
      ) as Partial<Secrets>;
      if (
        parsed.jwt_secret &&
        parsed.internal_api_secret &&
        parsed.mcp_proxy_secret &&
        parsed.encryption_key &&
        parsed.admin_email
      ) {
        return parsed as Secrets;
      }
    } catch {
      /* fall through and regenerate */
    }
  }

  const secrets: Secrets = {
    jwt_secret: randomBytes(32).toString("hex"),
    internal_api_secret: randomBytes(32).toString("hex"),
    mcp_proxy_secret: randomBytes(32).toString("hex"),
    encryption_key: randomBytes(32).toString("hex"),
    admin_email: "guest@rearch.local",
  };

  writeFileSync(SECRETS_FILE, JSON.stringify(secrets, null, 2), {
    mode: 0o600,
  });
  return secrets;
}

// ─── Process helpers ──────────────────────────────────────────────────────────

function isDockerRunning(): Promise<boolean> {
  return new Promise((resolve) => {
    const docker = spawn("docker", ["info"], { stdio: "ignore" });
    docker.on("error", () => resolve(false));
    docker.on("close", (code) => resolve(code === 0));
  });
}

function runCommand(
  command: string[],
  options: { silent?: boolean } = {},
): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn(command[0]!, command.slice(1), {
      stdio: options.silent ? "ignore" : "inherit",
    });
    proc.on("error", () => resolve(false));
    proc.on("close", (code) => resolve(code === 0));
  });
}

function runCommandCapture(command: string[]): {
  ok: boolean;
  stdout: string;
} {
  try {
    const out = execSync(
      command.map((c) => (c.includes(" ") ? `"${c}"` : c)).join(" "),
      { stdio: ["ignore", "pipe", "ignore"] },
    ).toString();
    return { ok: true, stdout: out };
  } catch {
    return { ok: false, stdout: "" };
  }
}

// ─── Docker helpers ───────────────────────────────────────────────────────────

async function ensureNetworkExists(): Promise<boolean> {
  const { stdout } = runCommandCapture([
    "docker",
    "network",
    "ls",
    "--format",
    "{{.Name}}",
  ]);
  if (stdout.split("\n").includes(NETWORK_NAME)) return true;

  console.log(chalk.blue(`🔄 Creating Docker network '${NETWORK_NAME}'...`));
  return runCommand(["docker", "network", "create", NETWORK_NAME], {
    silent: true,
  });
}

async function pullImage(image: string, platform?: string): Promise<boolean> {
  const platformLabel = platform ? ` (${platform})` : "";
  console.log(chalk.blue(`🔄 Pulling ${image}${platformLabel}...`));
  const cmd = ["docker", "pull"];
  if (platform) cmd.push("--platform", platform);
  cmd.push(image);
  return runCommand(cmd);
}

function stopAndRemoveContainer(name: string): void {
  try {
    execSync(`docker stop ${name}`, { stdio: "ignore" });
  } catch {
    /* ignore */
  }
  try {
    execSync(`docker rm ${name}`, { stdio: "ignore" });
  } catch {
    /* ignore */
  }
}

function cleanupExistingContainers(): void {
  console.log(chalk.blue("🧹 Cleaning up existing ReArch containers..."));
  for (const name of ALL_CONTAINERS) {
    stopAndRemoveContainer(name);
  }
}

async function waitForMongo(): Promise<boolean> {
  for (let i = 0; i < 60; i++) {
    try {
      execSync(
        `docker exec ${MONGODB_CONTAINER} mongosh --quiet --eval "db.runCommand({ ping: 1 }).ok"`,
        { stdio: "ignore" },
      );
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  return false;
}

async function waitForRedis(): Promise<boolean> {
  for (let i = 0; i < 30; i++) {
    try {
      execSync(`docker exec ${REDIS_CONTAINER} redis-cli ping`, {
        stdio: "ignore",
      });
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  return false;
}

async function waitForBackendHealth(): Promise<boolean> {
  for (let i = 0; i < 60; i++) {
    try {
      execSync(
        `docker exec ${BACKEND_CONTAINER} wget -q -O- http://127.0.0.1:${BACKEND_INTERNAL_PORT}/health`,
        { stdio: "ignore" },
      );
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  return false;
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────

/**
 * Wait for the backend to bootstrap the guest user (it does this on first
 * Mongo connect when AUTH_MODE=NONE and ADMIN_EMAIL is set).
 */
async function waitForGuestUser(email: string): Promise<boolean> {
  for (let i = 0; i < 30; i++) {
    try {
      const out = execSync(
        `docker exec ${MONGODB_CONTAINER} mongosh --quiet rearch --eval "db.users.countDocuments({ 'account.email': '${email}' })"`,
        { stdio: ["ignore", "pipe", "ignore"] },
      )
        .toString()
        .trim();
      if (out === "1") return true;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

// ─── Start command ────────────────────────────────────────────────────────────

interface StartOptions {
  port: string;
  apiPort: string;
  pull: boolean;
  imageTag: string;
  platform: string;
}

async function start(options: StartOptions): Promise<void> {
  console.log(chalk.bold.blue("🚀 Starting ReArch..."));

  if (!(await isDockerRunning())) {
    console.error(
      chalk.red(
        "❌ Docker is not running or not installed. Please start Docker and try again.",
      ),
    );
    process.exit(1);
  }

  ensureStateDir();
  const secrets = loadOrCreateSecrets();
  const port = options.port;
  const apiPort = options.apiPort;

  // The SPA reads its config from window.__RUNTIME_CONFIG__, generated at
  // container startup by the frontend's docker-entrypoint.sh from the
  // API_BASE_URL and SOCKET_URL env vars. The frontend container has no
  // proxy for /api, so we publish the backend on its own host port and
  // point the SPA there directly.
  const apiBaseUrl = `http://localhost:${apiPort}/api`;
  const socketUrl = `http://localhost:${apiPort}`;
  const frontendUrl = `http://localhost:${port}`;

  // Resolve image refs from the requested tag (e.g. 'latest', 'dev', 'sha-abc').
  const tag = options.imageTag;
  const platform = options.platform;
  const FRONTEND_IMAGE = `${FRONTEND_IMAGE_BASE}:${tag}`;
  const BACKEND_IMAGE = `${BACKEND_IMAGE_BASE}:${tag}`;
  const MCP_PROXY_IMAGE = `${MCP_PROXY_IMAGE_BASE}:${tag}`;
  console.log(chalk.gray(`   Image tag:  ${tag}`));
  console.log(chalk.gray(`   Platform:   ${platform} (rearch-* images)`));

  // The rearch-* images are pinned to `platform` (default linux/amd64).
  // Mongo/Redis are multi-arch and use the host's native platform.
  const rearchImages = [MCP_PROXY_IMAGE, BACKEND_IMAGE, FRONTEND_IMAGE];
  const isRearchImage = (image: string) => rearchImages.includes(image);

  // 1. Pull images
  if (options.pull) {
    for (const image of [
      MONGODB_IMAGE,
      REDIS_IMAGE,
      MCP_PROXY_IMAGE,
      BACKEND_IMAGE,
      FRONTEND_IMAGE,
    ]) {
      const ok = await pullImage(
        image,
        isRearchImage(image) ? platform : undefined,
      );
      if (!ok) {
        console.error(chalk.red(`❌ Failed to pull ${image}`));
        process.exit(1);
      }
    }
  }

  // 2. Network
  if (!(await ensureNetworkExists())) {
    console.error(chalk.red("❌ Failed to create Docker network"));
    process.exit(1);
  }

  // 3. Wipe any prior containers (so re-runs are idempotent)
  cleanupExistingContainers();

  // 4. MongoDB
  console.log(chalk.blue("🔄 Starting MongoDB..."));
  const mongoOk = await runCommand(
    [
      "docker",
      "run",
      "-d",
      "--name",
      MONGODB_CONTAINER,
      "--network",
      NETWORK_NAME,
      "--restart",
      "unless-stopped",
      "-v",
      `${MONGO_DATA_DIR}:/data/db`,
      MONGODB_IMAGE,
      "mongod",
      "--quiet",
      "--logpath",
      "/dev/null",
    ],
    { silent: true },
  );
  if (!mongoOk) {
    console.error(chalk.red("❌ Failed to start MongoDB"));
    process.exit(1);
  }

  // 5. Redis
  console.log(chalk.blue("🔄 Starting Redis..."));
  const redisOk = await runCommand(
    [
      "docker",
      "run",
      "-d",
      "--name",
      REDIS_CONTAINER,
      "--network",
      NETWORK_NAME,
      "--restart",
      "unless-stopped",
      "-v",
      `${REDIS_DATA_DIR}:/data`,
      REDIS_IMAGE,
      "redis-server",
      "--appendonly",
      "yes",
    ],
    { silent: true },
  );
  if (!redisOk) {
    console.error(chalk.red("❌ Failed to start Redis"));
    process.exit(1);
  }

  console.log(chalk.blue("⏳ Waiting for MongoDB and Redis..."));
  if (!(await waitForMongo())) {
    console.error(chalk.red("❌ MongoDB never became ready"));
    process.exit(1);
  }
  if (!(await waitForRedis())) {
    console.error(chalk.red("❌ Redis never became ready"));
    process.exit(1);
  }

  // 6. MCP Proxy
  console.log(chalk.blue("🔄 Starting MCP Proxy..."));
  const mcpOk = await runCommand(
    [
      "docker",
      "run",
      "-d",
      "--name",
      MCP_PROXY_CONTAINER,
      "--platform",
      platform,
      "--network",
      NETWORK_NAME,
      "--restart",
      "unless-stopped",
      "-e",
      `MONGODB_URI=mongodb://${MONGODB_CONTAINER}:27017/rearch`,
      "-e",
      `MCP_PROXY_SECRET=${secrets.mcp_proxy_secret}`,
      "-e",
      "MCP_PROXY_PORT=3100",
      "-e",
      `BACKEND_API_URL=http://${BACKEND_CONTAINER}:5000`,
      "-e",
      `INTERNAL_API_SECRET=${secrets.internal_api_secret}`,
      "-e",
      `FRONTEND_URL=${frontendUrl}`,
      "-e",
      "NODE_ENV=production",
      MCP_PROXY_IMAGE,
    ],
    { silent: true },
  );
  if (!mcpOk) {
    console.error(chalk.red("❌ Failed to start MCP Proxy"));
    process.exit(1);
  }

  // 7. Backend (published on apiPort so the SPA can reach it from the host)
  console.log(chalk.blue("🔄 Starting Backend (AUTH_MODE=NONE)..."));
  const backendOk = await runCommand(
    [
      "docker",
      "run",
      "-d",
      "--name",
      BACKEND_CONTAINER,
      "--platform",
      platform,
      "--network",
      NETWORK_NAME,
      "--restart",
      "unless-stopped",
      "-p",
      `${apiPort}:${BACKEND_INTERNAL_PORT}`,
      "-v",
      "/var/run/docker.sock:/var/run/docker.sock",
      "-v",
      `${BACKEND_DATA_DIR}:/app/data`,
      "-e",
      `PORT=${BACKEND_INTERNAL_PORT}`,
      "-e",
      `MONGODB_URI=mongodb://${MONGODB_CONTAINER}:27017/rearch`,
      "-e",
      `REDIS_URL=redis://${REDIS_CONTAINER}:6379`,
      "-e",
      "AUTH_MODE=NONE",
      "-e",
      `JWT_SECRET=${secrets.jwt_secret}`,
      "-e",
      "JWT_EXPIRY=24h",
      "-e",
      `ADMIN_EMAIL=${secrets.admin_email}`,
      "-e",
      `ENCRYPTION_KEY=${secrets.encryption_key}`,
      "-e",
      `MCP_PROXY_URL=http://${MCP_PROXY_CONTAINER}:3100`,
      "-e",
      `MCP_PROXY_SECRET=${secrets.mcp_proxy_secret}`,
      "-e",
      `INTERNAL_API_SECRET=${secrets.internal_api_secret}`,
      "-e",
      `DOCKER_NETWORK=${NETWORK_NAME}`,
      "-e",
      `FRONTEND_URL=${frontendUrl}`,
      "-e",
      "NODE_ENV=production",
      BACKEND_IMAGE,
    ],
    { silent: true },
  );
  if (!backendOk) {
    console.error(chalk.red("❌ Failed to start Backend"));
    process.exit(1);
  }

  console.log(chalk.blue("⏳ Waiting for Backend to be ready..."));
  const backendReady = await waitForBackendHealth();
  if (!backendReady) {
    console.error(
      chalk.yellow(
        "⚠️  Backend health check timed out — continuing anyway. Run 'rearch logs backend' to inspect.",
      ),
    );
  }

  // Wait for the guest user to exist (the backend's bootstrap creates it).
  await waitForGuestUser(secrets.admin_email);

  // 8. Frontend
  console.log(chalk.blue("🔄 Starting Frontend..."));
  const frontendOk = await runCommand(
    [
      "docker",
      "run",
      "-d",
      "--name",
      FRONTEND_CONTAINER,
      "--platform",
      platform,
      "--network",
      NETWORK_NAME,
      "--restart",
      "unless-stopped",
      "-p",
      `${port}:80`,
      "-e",
      `API_BASE_URL=${apiBaseUrl}`,
      "-e",
      `SOCKET_URL=${socketUrl}`,
      FRONTEND_IMAGE,
    ],
    { silent: true },
  );
  if (!frontendOk) {
    console.error(chalk.red("❌ Failed to start Frontend"));
    process.exit(1);
  }

  console.log("");
  console.log(
    chalk.green(`✅ ReArch is now running at ${chalk.bold(frontendUrl)}`),
  );
  console.log(chalk.gray(`   API:        http://localhost:${apiPort}`));
  console.log(
    chalk.gray(`   Auth mode:  NONE (auto-login as ${secrets.admin_email})`),
  );
  console.log(chalk.gray(`   Data:       ${STATE_DIR}`));
  console.log("");
  console.log(
    chalk.yellow(
      `🛑 To stop ReArch, run: ${chalk.bold("npx rearch-cli stop")}`,
    ),
  );
  console.log(chalk.gray(`   (or press Ctrl+C in this terminal)`));

  // Handle Ctrl+C → stop containers and exit.
  const shutdown = async () => {
    console.log(chalk.yellow("\n🛑 Stopping ReArch..."));
    for (const name of ALL_CONTAINERS) {
      stopAndRemoveContainer(name);
    }
    console.log(chalk.green("✅ ReArch has been stopped"));
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Keep the CLI running so Ctrl+C can clean up.
  console.log(chalk.gray("\nPress Ctrl+C to stop ReArch."));
  await new Promise(() => {
    /* run forever */
  });
}

// ─── Stop / status / logs ─────────────────────────────────────────────────────

async function stop(): Promise<void> {
  console.log(chalk.yellow("🛑 Stopping ReArch..."));
  for (const name of ALL_CONTAINERS) {
    stopAndRemoveContainer(name);
  }
  console.log(chalk.green("✅ ReArch has been stopped"));
}

async function status(): Promise<void> {
  await runCommand([
    "docker",
    "ps",
    "-a",
    "--filter",
    "name=^rearch-",
    "--format",
    "table {{.Names}}\t{{.Status}}\t{{.Ports}}",
  ]);
}

async function logs(service: string | undefined): Promise<void> {
  const candidates = [
    service,
    service ? `rearch-${service}` : undefined,
  ].filter((s): s is string => Boolean(s));

  const target = candidates.find((c) => ALL_CONTAINERS.includes(c));

  if (target) {
    await runCommand(["docker", "logs", "-f", "--tail", "200", target]);
    return;
  }

  if (service) {
    console.error(chalk.red(`❌ Unknown service '${service}'.`));
    console.error(chalk.gray(`Available: ${ALL_CONTAINERS.join(", ")}`));
    process.exit(1);
  }

  // No service given → tail backend (the most useful for debugging).
  console.log(
    chalk.gray("Tailing backend logs. Use 'rearch logs <service>' for others."),
  );
  console.log(chalk.gray(`Available: ${ALL_CONTAINERS.join(", ")}`));
  await runCommand([
    "docker",
    "logs",
    "-f",
    "--tail",
    "200",
    BACKEND_CONTAINER,
  ]);
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name("rearch")
  .description("Run ReArch with a single command (AUTH_MODE=NONE)")
  .version("0.1.0");

program
  .command("start", { isDefault: true })
  .description("Start ReArch (default command)")
  .option(
    "-p, --port <port>",
    "Port to expose the frontend on",
    DEFAULT_FRONTEND_PORT,
  )
  .option(
    "-a, --api-port <port>",
    "Port to expose the backend API on",
    DEFAULT_API_PORT,
  )
  .option("--no-pull", "Skip pulling the latest Docker images")
  .option(
    "-t, --image-tag <tag>",
    "Docker image tag to pull (e.g. 'latest', 'dev', 'sha-abc123')",
    DEFAULT_IMAGE_TAG,
  )
  .option("--dev", "Use the 'dev' image tag (shortcut for --image-tag dev)")
  .option(
    "--platform <platform>",
    "Docker platform for the rearch-* images (e.g. 'linux/amd64', 'linux/arm64'). Default forces amd64 since ReArch images are currently amd64-only.",
    DEFAULT_PLATFORM,
  )
  .action(
    async (opts: {
      port: string;
      apiPort: string;
      pull: boolean;
      imageTag: string;
      dev?: boolean;
      platform: string;
    }) => {
      const imageTag = opts.dev ? DEV_IMAGE_TAG : opts.imageTag;
      await start({
        port: opts.port,
        apiPort: opts.apiPort,
        pull: opts.pull,
        imageTag,
        platform: opts.platform,
      });
    },
  );

program
  .command("stop")
  .description("Stop ReArch and remove its containers")
  .action(async () => {
    await stop();
  });

program
  .command("status")
  .description("Show the status of ReArch containers")
  .action(async () => {
    await status();
  });

program
  .command("logs [service]")
  .description(
    "Tail logs from a ReArch container (frontend, backend, mcp-proxy, mongodb, redis)",
  )
  .action(async (service: string | undefined) => {
    await logs(service);
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(chalk.red("❌ An error occurred:"), err);
  process.exit(1);
});
