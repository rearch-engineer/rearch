/**
 * Creates and starts a Docker container for a conversation.
 *
 * Extracted from conversationsWorker.js so that the same container creation
 * logic can be reused in integration tests without requiring MongoDB, BullMQ,
 * or Redis dependencies.
 */
import Docker from "dockerode";

const docker = new Docker();

/**
 * Create and start a conversation container.
 *
 * This function handles:
 * - Building the Docker create options (env vars, ports, labels, networking)
 * - Creating the container
 * - Connecting to overlay network if configured
 * - Starting the container
 * - Inspecting to resolve mapped host ports
 *
 * It does NOT handle:
 * - Loading data from MongoDB (caller must provide all params)
 * - Waiting for OpenCode readiness (caller should use waitForOpencodeReady)
 * - Injecting skills (caller should use injectSkillsIntoContainer)
 * - Updating conversation status in the database
 *
 * @param {Object} params
 * @param {string} params.containerImage - Docker image to use
 * @param {string} params.conversationId - Unique conversation ID
 * @param {string} params.repoUrl - Repository clone URL (can be empty)
 * @param {string} params.repoBranch - Branch name (default: "main")
 * @param {string} params.anthropicApiKey - Anthropic API key
 * @param {string} [params.appPort="3000"] - Application port
 * @param {string} [params.appStartCommand="npm run dev"] - Application start command
 * @param {string} [params.bitbucketEmail=""] - Bitbucket email
 * @param {string} [params.bitbucketToken=""] - Bitbucket API token
 * @param {Array}  [params.rearchServices=[]] - Service port definitions from subResource.rearch.services
 * @param {(msg: string) => Promise<void>} [params.log] - Async logging callback
 * @returns {Promise<{container: object, containerId: string, opencodeUrl: string, hostPort: number|null, codeServerHostPort: number|null, appHostPort: number|null, postgresHostPort: number|null, publicBaseUrl: string|null}>}
 */
export async function createConversationContainer({
  containerImage,
  conversationId,
  repoUrl = "",
  repoBranch = "main",
  anthropicApiKey,
  appPort = "3000",
  appStartCommand = "npm run dev",
  bitbucketEmail = "",
  bitbucketToken = "",
  rearchServices = [],
  log,
}) {
  const _log = log || (() => {});

  await _log(`Creating container with image: ${containerImage}`);

  // OpenCode server port inside container
  const OPENCODE_PORT = "4096";

  // ── Detect networking mode ──────────────────────────────────────────────
  const dockerNetwork = process.env.DOCKER_NETWORK;
  const appDomain = process.env.APP_DOMAIN;
  const useOverlayNetwork = !!(dockerNetwork && appDomain);

  // Build ExposedPorts and PortBindings dynamically from rearch.services
  // Always expose the OpenCode port
  const exposedPorts = { [`${OPENCODE_PORT}/tcp`]: {} };
  const portBindings = useOverlayNetwork
    ? {} // No host port bindings in overlay mode
    : { [`${OPENCODE_PORT}/tcp`]: [{ HostPort: "0" }] };

  if (rearchServices.length > 0) {
    // Use rearch.services as the source of truth for additional ports
    for (const service of rearchServices) {
      const portKey = `${service.internalPort}/tcp`;
      exposedPorts[portKey] = {};
      if (!useOverlayNetwork) {
        portBindings[portKey] = [{ HostPort: "0" }];
      }
    }
    console.log(
      `📦 Exposing ${rearchServices.length} service ports from rearch.services: ${rearchServices.map((s) => `${s.label}:${s.internalPort}`).join(", ")}`,
    );
  } else if (!useOverlayNetwork) {
    // Fallback: hard-coded ports for backward compatibility (host-port mode only)
    exposedPorts[`${appPort}/tcp`] = {};
    exposedPorts["8080/tcp"] = {};
    exposedPorts["5432/tcp"] = {};
    portBindings[`${appPort}/tcp`] = [{ HostPort: "0" }];
    portBindings["8080/tcp"] = [{ HostPort: "0" }];
    portBindings["5432/tcp"] = [{ HostPort: "0" }];
  }

  // ── Container name (used for Docker DNS in overlay network) ──────────
  const containerName = `rearch_session_${conversationId}`;

  // ── Traefik labels (only in overlay mode) ────────────────────────────
  const labels = {};
  if (useOverlayNetwork) {
    const convSubdomain = `conv-${conversationId}`;
    const convHost = `${convSubdomain}.${appDomain}`;

    labels["traefik.enable"] = "true";
    labels["traefik.docker.network"] = dockerNetwork;

    // OpenCode API router (default, port 4096)
    labels[`traefik.http.routers.${containerName}.rule`] =
      `Host(\`${convHost}\`)`;
    labels[`traefik.http.routers.${containerName}.entrypoints`] = "web";
    labels[`traefik.http.routers.${containerName}.middlewares`] =
      "keycloak-auth@file";
    labels[`traefik.http.services.${containerName}.loadbalancer.server.port`] =
      OPENCODE_PORT;

    // Code-server router (port 8080, path /code)
    labels[`traefik.http.routers.${containerName}-code.rule`] =
      `Host(\`${convHost}\`) && PathPrefix(\`/code\`)`;
    labels[`traefik.http.routers.${containerName}-code.entrypoints`] = "web";
    labels[`traefik.http.routers.${containerName}-code.middlewares`] =
      "keycloak-auth@file";
    labels[
      `traefik.http.services.${containerName}-code.loadbalancer.server.port`
    ] = "8080";

    // Add service-specific routers from rearch.services
    for (const service of rearchServices) {
      const svcRouterName = `${containerName}-${service.label.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
      const svcPath = service.path || `/${service.label.toLowerCase()}`;
      labels[`traefik.http.routers.${svcRouterName}.rule`] =
        `Host(\`${convHost}\`) && PathPrefix(\`${svcPath}\`)`;
      labels[`traefik.http.routers.${svcRouterName}.entrypoints`] = "web";
      labels[`traefik.http.routers.${svcRouterName}.middlewares`] =
        "keycloak-auth@file";
      labels[
        `traefik.http.services.${svcRouterName}.loadbalancer.server.port`
      ] = String(service.internalPort);
    }
  }

  // ── Create container ─────────────────────────────────────────────────
  const createOptions = {
    Image: containerImage,
    name: containerName,
    Labels: labels,
    Env: [
      `CONVERSATION_ID=${conversationId}`,
      `REPOSITORY_URL=${repoUrl}`,
      `REPOSITORY_BRANCH=${repoBranch}`,
      `ANTHROPIC_API_KEY=${anthropicApiKey}`,
      // Node.js app specific environment variables
      `APP_PORT=${appPort}`,
      `APP_START_COMMAND=${appStartCommand}`,
      // Bitbucket credentials from parent Resource
      `BITBUCKET_EMAIL=${bitbucketEmail}`,
      `BITBUCKET_TOKEN=${bitbucketToken}`,
      // GIT_TOKEN used by entrypoint.sh to configure git push authentication
      `GIT_TOKEN=${bitbucketToken}`,
      // OpenCode config JSON — written by entrypoint.sh before supervisord
      // starts, so OpenCode has MCP tools available at launch time
      `OPENCODE_CONFIG_CONTENT=${JSON.stringify({
        mcp: {
          "rearch-tools": {
            type: "remote",
            url: `${process.env.MCP_PROXY_FROM_DEV_CONTAINERS || "http://host.docker.internal:3100"}/mcp`,
            ...(process.env.MCP_PROXY_SECRET
              ? {
                  headers: { "X-MCP-Secret": process.env.MCP_PROXY_SECRET },
                }
              : {}),
          },
        },
      })}`,
    ],
    ExposedPorts: exposedPorts,
    HostConfig: {
      AutoRemove: false,
      PortBindings: useOverlayNetwork ? undefined : portBindings,
    },
  };

  const container = await docker.createContainer(createOptions);

  // ── Connect to overlay network if configured ─────────────────────────
  if (useOverlayNetwork) {
    try {
      const network = docker.getNetwork(dockerNetwork);
      await network.connect({ Container: container.id });
      console.log(
        `📡 Container connected to overlay network: ${dockerNetwork}`,
      );
    } catch (netErr) {
      console.error(
        `Failed to connect container to network ${dockerNetwork}:`,
        netErr.message,
      );
      // Continue anyway; the container may still work on the default bridge
    }

    // Also connect to the bridge network for internet egress.
    // Overlay networks do not provide external connectivity by default.
    try {
      const bridgeNetwork = docker.getNetwork("bridge");
      await bridgeNetwork.connect({ Container: container.id });
      console.log(
        `🌐 Container connected to bridge network for internet access`,
      );
    } catch (bridgeErr) {
      console.error(
        `Failed to connect container to bridge network:`,
        bridgeErr.message,
      );
    }
  }

  // Start the container
  await container.start();
  await _log("Container created and started");

  // Get container info including mapped ports
  const containerInfo = await container.inspect();
  const containerId = containerInfo.Id;

  let opencodeUrl;
  let hostPort = null;
  let appHostPort = null;
  let codeServerHostPort = null;
  let postgresHostPort = null;

  if (useOverlayNetwork) {
    // ── Overlay mode: access via Docker DNS name ───────────────────────
    opencodeUrl = `http://${containerName}:${OPENCODE_PORT}`;
    console.log(
      `✅ Container ${containerId} started for conversation ${conversationId} (overlay network)`,
    );
    console.log(`📡 OpenCode server (internal): ${opencodeUrl}`);
    console.log(`🌐 Public URL: https://conv-${conversationId}.${appDomain}`);
  } else {
    // ── Host-port mode: access via localhost ───────────────────────────
    const ports = containerInfo.NetworkSettings.Ports;

    const opencodePortBindings = ports[`${OPENCODE_PORT}/tcp`];
    if (!opencodePortBindings || opencodePortBindings.length === 0) {
      throw new Error("Failed to get port binding for OpenCode server");
    }
    hostPort = parseInt(opencodePortBindings[0].HostPort, 10);
    opencodeUrl = `http://localhost:${hostPort}`;

    // Get optional port mappings (may not exist in basic container image)
    const appPortBind = ports[`${appPort}/tcp`];
    const codeServerPortBind = ports["8080/tcp"];
    const postgresPortBind = ports["5432/tcp"];

    appHostPort = appPortBind?.[0]?.HostPort
      ? parseInt(appPortBind[0].HostPort, 10)
      : null;
    codeServerHostPort = codeServerPortBind?.[0]?.HostPort
      ? parseInt(codeServerPortBind[0].HostPort, 10)
      : null;
    postgresHostPort = postgresPortBind?.[0]?.HostPort
      ? parseInt(postgresPortBind[0].HostPort, 10)
      : null;

    console.log(
      `✅ Container ${containerId} started for conversation ${conversationId}`,
    );
    console.log(`📡 OpenCode server will be available at ${opencodeUrl}`);
    if (codeServerHostPort)
      console.log(
        `💻 Code-server (VS Code) will be available at http://localhost:${codeServerHostPort}`,
      );
    if (appHostPort)
      console.log(
        `🚀 Node.js app will be available at http://localhost:${appHostPort}`,
      );
    if (postgresHostPort)
      console.log(
        `🐘 PostgreSQL will be available at localhost:${postgresHostPort}`,
      );
  }

  // Build public URLs for overlay mode
  const publicBaseUrl = useOverlayNetwork
    ? `https://conv-${conversationId}.${appDomain}`
    : null;

  return {
    container,
    containerId,
    containerName,
    opencodeUrl,
    hostPort,
    codeServerHostPort,
    appHostPort,
    postgresHostPort,
    publicBaseUrl,
  };
}
