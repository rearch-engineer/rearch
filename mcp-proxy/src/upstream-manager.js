/**
 * Manages upstream MCP server connections.
 *
 * Each upstream is an MCP Client connected via either StreamableHTTPClientTransport
 * (remote servers) or StdioClientTransport (local/stdio servers).
 *
 * Tools are exposed with a server-name prefix so that downstream consumers can
 * address them unambiguously:  `<serverName>_<toolName>`
 *
 * Servers configured with `auth.mode === "oauth-user"` are special: there is
 * no shared connection. Instead, one upstream client is opened lazily per
 * (server, user) pair using that user's own OAuth access token, which the
 * backend hands out through its internal API. Users who have not connected
 * the integration see a single `<serverName>_connect` placeholder tool whose
 * description tells the agent how to get them connected.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { buildOpenApiTools, callOpenApiTool } from './openapi-tools.js';
import {
  getUserAccessToken,
  invalidateUserToken,
  clearTokenCacheForServer,
  connectInstruction,
  NotConnectedError,
} from './user-credentials.js';

const CONNECT_TIMEOUT_MS = 30_000;
// Per-user upstream connections are closed after this much inactivity.
const USER_CLIENT_IDLE_MS = 15 * 60_000;
// Per-user tool lists are cached this long before re-fetching upstream.
const USER_TOOLS_TTL_MS = 60_000;
const CONNECT_TOOL_SUFFIX = 'connect';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function prefixTool(serverName, toolName) {
  return `${serverName}_${toolName}`;
}

function parsePrefixedName(prefixed) {
  const idx = prefixed.indexOf('_');
  if (idx === -1) return { serverName: null, toolName: prefixed };
  return {
    serverName: prefixed.slice(0, idx),
    toolName: prefixed.slice(idx + 1),
  };
}

function isUnauthorizedError(err) {
  if (!err) return false;
  if (err.code === 401 || err.status === 401) return true;
  const msg = String(err.message || '');
  return /\b401\b|unauthori[sz]ed|invalid[_ ]token/i.test(msg);
}

function isOAuthUser(cfg) {
  return cfg?.auth?.mode === 'oauth-user';
}

function connectPlaceholderTool(serverName, reason) {
  return {
    name: prefixTool(serverName, CONNECT_TOOL_SUFFIX),
    description:
      `[${serverName}] NOT CONNECTED. ${connectInstruction(serverName, reason)} ` +
      `Calling this tool only returns these instructions; it cannot connect on the user's behalf.`,
    inputSchema: { type: 'object', properties: {} },
  };
}

function errorResult(message) {
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
}

// ---------------------------------------------------------------------------
// UpstreamManager
// ---------------------------------------------------------------------------

export class UpstreamManager {
  /** @type {Map<string, { client: Client, transport: object, tools: Array, status: string, error?: string, kind?: string, cfg: object }>} */
  #upstreams = new Map();

  /** @type {Map<string, object>} last-known raw configs for diffing */
  #currentConfigs = new Map();

  /**
   * Per-user upstream clients for oauth-user servers.
   * key: `${serverName}:${userId}`
   * @type {Map<string, { client: Client, transport: object, tools: Array, toolsFetchedAt: number, lastUsed: number, accessToken: string }>}
   */
  #userClients = new Map();

  #sweepTimer = null;

  constructor() {
    this.#sweepTimer = setInterval(() => this.#sweepIdleUserClients(), 60_000);
    // Don't keep the process alive just for the sweeper.
    if (typeof this.#sweepTimer.unref === 'function') this.#sweepTimer.unref();
  }

  // -------------------------------------------------------------------------
  // loadServers – (re)connects upstreams based on the provided config map
  // -------------------------------------------------------------------------

  /**
   * @param {Record<string, { type?: string, url?: string, command?: string, args?: string[], headers?: Record<string,string>, environment?: Record<string,string>, auth?: object, enabled?: boolean }>} configs
   */
  async loadServers(configs) {
    const desired = new Map(
      Object.entries(configs).filter(([, cfg]) => cfg.enabled !== false),
    );

    // Disconnect removed / disabled servers
    for (const name of this.#upstreams.keys()) {
      if (!desired.has(name)) {
        console.log(`[upstream] Removing server: ${name}`);
        await this.#disconnect(name);
      }
    }

    // Connect new / changed servers
    const connectPromises = [];
    for (const [name, cfg] of desired) {
      const prev = this.#currentConfigs.get(name);
      if (prev && JSON.stringify(prev) === JSON.stringify(cfg)) {
        continue; // unchanged
      }

      // If it existed before, disconnect first
      if (this.#upstreams.has(name)) {
        await this.#disconnect(name);
      }

      connectPromises.push(this.#connect(name, cfg));
    }

    await Promise.allSettled(connectPromises);

    this.#currentConfigs = new Map(
      Object.entries(configs).filter(([, cfg]) => cfg.enabled !== false),
    );
  }

  // -------------------------------------------------------------------------
  // connect / disconnect
  // -------------------------------------------------------------------------

  async #connect(name, cfg) {
    const entry = { client: null, transport: null, tools: [], status: 'connecting', error: undefined, cfg };
    this.#upstreams.set(name, entry);

    // OpenAPI ("API Definition") servers are synthetic: no transport is opened.
    // Tools are derived from the admin-curated operation descriptors and the
    // proxy executes the underlying HTTP calls itself.
    if (cfg.type === 'openapi') {
      try {
        entry.tools = buildOpenApiTools(name, cfg);
        entry.status = 'connected';
        entry.kind = 'openapi';
        console.log(
          `[upstream] Loaded OpenAPI server ${name} — ${entry.tools.length} tool(s)`,
        );
      } catch (err) {
        entry.status = 'error';
        entry.error = err.message;
        console.error(`[upstream] Failed to load OpenAPI server ${name}:`, err.message);
      }
      return;
    }

    // Per-user OAuth servers have no shared connection: clients are opened on
    // demand per user (see #getUserClient). Mark as ready.
    if (isOAuthUser(cfg)) {
      entry.kind = 'oauth-user';
      entry.status = 'connected';
      console.log(`[upstream] Registered per-user OAuth server ${name} (${cfg.url})`);
      return;
    }

    try {
      const transport = this.#createTransport(name, cfg);
      const client = new Client({ name: `rearch-proxy/${name}`, version: '1.0.0' });

      entry.transport = transport;
      entry.client = client;

      // Connect with timeout
      await Promise.race([
        client.connect(transport),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Connection timeout')), CONNECT_TIMEOUT_MS),
        ),
      ]);

      // Fetch tools
      const { tools } = await client.listTools();
      entry.tools = tools || [];
      entry.status = 'connected';

      console.log(
        `[upstream] Connected to ${name} — ${entry.tools.length} tool(s): ${entry.tools.map((t) => t.name).join(', ') || '(none)'}`,
      );
    } catch (err) {
      entry.status = 'error';
      entry.error = err.message;
      console.error(`[upstream] Failed to connect to ${name}:`, err.message);
    }
  }

  #createTransport(name, cfg, extraHeaders = {}) {
    const type = cfg.type || (cfg.url ? 'remote' : 'stdio');

    if (type === 'remote' || type === 'sse' || type === 'streamable-http') {
      if (!cfg.url) throw new Error(`Remote server "${name}" requires a url`);

      const headers = { ...(cfg.headers || {}), ...extraHeaders };
      const requestInit = Object.keys(headers).length > 0 ? { headers } : undefined;

      return new StreamableHTTPClientTransport(new URL(cfg.url), { requestInit });
    }

    if (type === 'stdio' || type === 'local') {
      if (!cfg.command) throw new Error(`Stdio server "${name}" requires a command`);

      const command = Array.isArray(cfg.command) ? cfg.command[0] : cfg.command;
      const args = Array.isArray(cfg.command) ? cfg.command.slice(1) : cfg.args || [];
      const env = { ...process.env, ...(cfg.environment || {}) };

      return new StdioClientTransport({ command, args, env });
    }

    throw new Error(`Unknown server type "${type}" for server "${name}"`);
  }

  async #disconnect(name) {
    const entry = this.#upstreams.get(name);
    if (!entry) return;

    try {
      if (entry.client) await entry.client.close();
    } catch (err) {
      console.warn(`[upstream] Error closing client for ${name}:`, err.message);
    }

    try {
      if (entry.transport && typeof entry.transport.close === 'function') {
        await entry.transport.close();
      }
    } catch (err) {
      console.warn(`[upstream] Error closing transport for ${name}:`, err.message);
    }

    // Drop every per-user client of this server too.
    for (const key of [...this.#userClients.keys()]) {
      if (key.startsWith(`${name}:`)) await this.#closeUserClient(key);
    }
    clearTokenCacheForServer(name);

    this.#upstreams.delete(name);
  }

  // -------------------------------------------------------------------------
  // Per-user clients (oauth-user servers)
  // -------------------------------------------------------------------------

  async #closeUserClient(key) {
    const uc = this.#userClients.get(key);
    if (!uc) return;
    this.#userClients.delete(key);
    try {
      await uc.client.close();
    } catch {
      // ignore
    }
    try {
      if (typeof uc.transport?.close === 'function') await uc.transport.close();
    } catch {
      // ignore
    }
  }

  async #sweepIdleUserClients() {
    const cutoff = Date.now() - USER_CLIENT_IDLE_MS;
    for (const [key, uc] of this.#userClients) {
      if (uc.lastUsed < cutoff) {
        console.log(`[upstream] Closing idle per-user client ${key}`);
        await this.#closeUserClient(key);
      }
    }
  }

  /**
   * Get (or open) the upstream client for a user on an oauth-user server.
   *
   * @throws {NotConnectedError} when the user has no usable credential
   */
  async #getUserClient(name, entry, userId, { forceRefresh = false } = {}) {
    const key = `${name}:${userId}`;
    const token = await getUserAccessToken(userId, name, { forceRefresh });

    const existing = this.#userClients.get(key);
    if (existing && existing.accessToken === token.accessToken) {
      existing.lastUsed = Date.now();
      return existing;
    }
    if (existing) await this.#closeUserClient(key);

    const transport = this.#createTransport(name, entry.cfg, {
      Authorization: `${token.tokenType || 'Bearer'} ${token.accessToken}`,
    });
    const client = new Client({ name: `rearch-proxy/${name}/${userId}`, version: '1.0.0' });

    await Promise.race([
      client.connect(transport),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Connection timeout')), CONNECT_TIMEOUT_MS),
      ),
    ]);

    const uc = {
      client,
      transport,
      tools: [],
      toolsFetchedAt: 0,
      lastUsed: Date.now(),
      accessToken: token.accessToken,
    };
    this.#userClients.set(key, uc);
    console.log(`[upstream] Opened per-user client ${key}`);
    return uc;
  }

  /**
   * Run `fn(client)` for a user on an oauth-user server, retrying once with a
   * freshly refreshed token when the upstream answers 401.
   */
  async #withUserClient(name, entry, userId, fn) {
    let uc = await this.#getUserClient(name, entry, userId);
    try {
      return await fn(uc);
    } catch (err) {
      if (!isUnauthorizedError(err)) throw err;
      console.warn(`[upstream] ${name}: token rejected for user ${userId}, refreshing once`);
      await this.#closeUserClient(`${name}:${userId}`);
      invalidateUserToken(userId, name);
      uc = await this.#getUserClient(name, entry, userId, { forceRefresh: true });
      return await fn(uc);
    }
  }

  async #userTools(name, entry, userId) {
    return this.#withUserClient(name, entry, userId, async (uc) => {
      if (Date.now() - uc.toolsFetchedAt > USER_TOOLS_TTL_MS) {
        const { tools } = await uc.client.listTools();
        uc.tools = tools || [];
        uc.toolsFetchedAt = Date.now();
      }
      return uc.tools;
    });
  }

  // -------------------------------------------------------------------------
  // closeAll
  // -------------------------------------------------------------------------

  async closeAll() {
    if (this.#sweepTimer) clearInterval(this.#sweepTimer);
    const names = [...this.#upstreams.keys()];
    await Promise.allSettled(names.map((n) => this.#disconnect(n)));
    const keys = [...this.#userClients.keys()];
    await Promise.allSettled(keys.map((k) => this.#closeUserClient(k)));
    this.#currentConfigs.clear();
  }

  // -------------------------------------------------------------------------
  // getTools – aggregated and prefixed
  // -------------------------------------------------------------------------

  /**
   * @param {{ userId: string } | null} [identity] verified caller identity
   */
  async getTools(identity = null) {
    const tools = [];

    for (const [name, entry] of this.#upstreams) {
      if (entry.status !== 'connected') continue;

      if (entry.kind === 'oauth-user') {
        let userTools = null;
        let reason = null;
        if (!identity?.userId) {
          reason = 'The calling container did not present a verified user identity.';
        } else {
          try {
            userTools = await this.#userTools(name, entry, identity.userId);
          } catch (err) {
            if (err instanceof NotConnectedError) {
              reason = err.message;
            } else {
              console.warn(`[upstream] Failed to list tools for ${name} (user ${identity.userId}):`, err.message);
              reason = `The integration is connected but currently unreachable: ${err.message}`;
            }
          }
        }

        if (!userTools) {
          tools.push(connectPlaceholderTool(name, reason));
          continue;
        }

        for (const tool of userTools) {
          tools.push({
            name: prefixTool(name, tool.name),
            description: tool.description ? `[${name}] ${tool.description}` : `Tool from ${name}`,
            inputSchema: tool.inputSchema,
          });
        }
        continue;
      }

      // OpenAPI servers have statically-derived tools — no upstream to refresh.
      if (entry.kind !== 'openapi') {
        // Re-fetch tools to pick up any upstream changes
        try {
          const { tools: freshTools } = await entry.client.listTools();
          entry.tools = freshTools || [];
        } catch (err) {
          console.warn(`[upstream] Failed to refresh tools for ${name}:`, err.message);
          // Fall through with cached tools
        }
      }

      for (const tool of entry.tools) {
        tools.push({
          name: prefixTool(name, tool.name),
          description: tool.description
            ? `[${name}] ${tool.description}`
            : `Tool from ${name}`,
          inputSchema: tool.inputSchema,
        });
      }
    }

    return tools;
  }

  // -------------------------------------------------------------------------
  // callTool – route to the correct upstream
  // -------------------------------------------------------------------------

  /**
   * @param {string} prefixedName
   * @param {object} args
   * @param {{ userId: string } | null} [identity] verified caller identity
   */
  async callTool(prefixedName, args, identity = null) {
    // Try exact prefix match first
    let { serverName, toolName } = parsePrefixedName(prefixedName);

    if (serverName && this.#upstreams.has(serverName)) {
      const entry = this.#upstreams.get(serverName);
      if (entry.status !== 'connected') {
        throw new Error(`Server "${serverName}" is not connected (status: ${entry.status})`);
      }
      return await this.#invoke(serverName, entry, toolName, args, identity);
    }

    // If the simple split didn't match a server, try longer prefixes.
    // This handles server names that themselves contain underscores.
    for (const [name, entry] of this.#upstreams) {
      if (prefixedName.startsWith(name + '_')) {
        const actualTool = prefixedName.slice(name.length + 1);
        if (entry.status !== 'connected') {
          throw new Error(`Server "${name}" is not connected (status: ${entry.status})`);
        }
        return await this.#invoke(name, entry, actualTool, args, identity);
      }
    }

    throw new Error(`No upstream server found for tool "${prefixedName}"`);
  }

  /**
   * Invoke a single (unprefixed) tool on a connected upstream entry, routing
   * OpenAPI servers to the local HTTP executor, per-user OAuth servers to the
   * caller's own client, and everything else to the shared MCP client.
   */
  async #invoke(name, entry, toolName, args, identity) {
    if (entry.kind === 'openapi') {
      const tool = (entry.tools || []).find((t) => t.name === toolName);
      if (!tool || !tool._operation) {
        throw new Error(`Unknown OpenAPI tool "${toolName}"`);
      }
      return await callOpenApiTool(entry.cfg, tool._operation, args);
    }

    if (entry.kind === 'oauth-user') {
      if (!identity?.userId) {
        return errorResult(
          connectInstruction(name, 'The calling container did not present a verified user identity.'),
        );
      }
      if (toolName === CONNECT_TOOL_SUFFIX) {
        // Placeholder: report the current state for this user.
        try {
          await getUserAccessToken(identity.userId, name);
          return {
            content: [{ type: 'text', text: `"${name}" is connected for this user. Call tools/list again to see its tools.` }],
          };
        } catch (err) {
          return errorResult(err instanceof NotConnectedError ? connectInstruction(name, err.message) : err.message);
        }
      }
      try {
        return await this.#withUserClient(name, entry, identity.userId, (uc) =>
          uc.client.callTool({ name: toolName, arguments: args }),
        );
      } catch (err) {
        if (err instanceof NotConnectedError) {
          return errorResult(connectInstruction(name, err.message));
        }
        throw err;
      }
    }

    return await entry.client.callTool({ name: toolName, arguments: args });
  }

  // -------------------------------------------------------------------------
  // getStatuses
  // -------------------------------------------------------------------------

  getStatuses() {
    const statuses = {};
    for (const [name, entry] of this.#upstreams) {
      const base = {
        status: entry.status,
        toolCount: entry.tools.length,
        ...(entry.error && { error: entry.error }),
      };
      if (entry.kind === 'oauth-user') {
        let activeUsers = 0;
        for (const key of this.#userClients.keys()) {
          if (key.startsWith(`${name}:`)) activeUsers += 1;
        }
        statuses[name] = { ...base, authMode: 'oauth-user', activeUsers };
      } else {
        statuses[name] = base;
      }
    }
    return statuses;
  }
}
