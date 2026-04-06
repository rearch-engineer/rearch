/**
 * Manages upstream MCP server connections.
 *
 * Each upstream is an MCP Client connected via either StreamableHTTPClientTransport
 * (remote servers) or StdioClientTransport (local/stdio servers).
 *
 * Tools are exposed with a server-name prefix so that downstream consumers can
 * address them unambiguously:  `<serverName>_<toolName>`
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { upstream as upstreamLogger } from './logger.js';

const CONNECT_TIMEOUT_MS = 30_000;

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

// ---------------------------------------------------------------------------
// UpstreamManager
// ---------------------------------------------------------------------------

export class UpstreamManager {
  /** @type {Map<string, { client: Client, transport: object, tools: Array, status: string, error?: string }>} */
  #upstreams = new Map();

  /** @type {Map<string, object>} last-known raw configs for diffing */
  #currentConfigs = new Map();

  constructor() {}

  // -------------------------------------------------------------------------
  // loadServers – (re)connects upstreams based on the provided config map
  // -------------------------------------------------------------------------

  /**
   * @param {Record<string, { type?: string, url?: string, command?: string, args?: string[], headers?: Record<string,string>, environment?: Record<string,string>, enabled?: boolean }>} configs
   */
  async loadServers(configs) {
    const desired = new Map(
      Object.entries(configs).filter(([, cfg]) => cfg.enabled !== false),
    );

    // Disconnect removed / disabled servers
    for (const name of this.#upstreams.keys()) {
      if (!desired.has(name)) {
        upstreamLogger.info({ server: name }, `Removing server: ${name}`);
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
    const entry = { client: null, transport: null, tools: [], status: 'connecting', error: undefined };
    this.#upstreams.set(name, entry);

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

      upstreamLogger.info(
        { server: name, toolCount: entry.tools.length, tools: entry.tools.map((t) => t.name) },
        `Connected to ${name} - ${entry.tools.length} tool(s)`,
      );
    } catch (err) {
      entry.status = 'error';
      entry.error = err.message;
      upstreamLogger.error({ err, server: name }, `Failed to connect to ${name}`);
    }
  }

  #createTransport(name, cfg) {
    const type = cfg.type || (cfg.url ? 'remote' : 'stdio');

    if (type === 'remote' || type === 'sse' || type === 'streamable-http') {
      if (!cfg.url) throw new Error(`Remote server "${name}" requires a url`);

      const transportOpts = { url: new URL(cfg.url) };

      if (cfg.headers && Object.keys(cfg.headers).length > 0) {
        transportOpts.requestInit = {
          headers: { ...cfg.headers },
        };
      }

      return new StreamableHTTPClientTransport(transportOpts.url, {
        requestInit: transportOpts.requestInit,
      });
    }

    if (type === 'stdio') {
      if (!cfg.command) throw new Error(`Stdio server "${name}" requires a command`);

      const args = cfg.args || [];
      const env = { ...process.env, ...(cfg.environment || {}) };

      return new StdioClientTransport({ command: cfg.command, args, env });
    }

    throw new Error(`Unknown server type "${type}" for server "${name}"`);
  }

  async #disconnect(name) {
    const entry = this.#upstreams.get(name);
    if (!entry) return;

    try {
      if (entry.client) await entry.client.close();
    } catch (err) {
      upstreamLogger.warn({ err, server: name }, `Error closing client for ${name}`);
    }

    try {
      if (entry.transport && typeof entry.transport.close === 'function') {
        await entry.transport.close();
      }
    } catch (err) {
      upstreamLogger.warn({ err, server: name }, `Error closing transport for ${name}`);
    }

    this.#upstreams.delete(name);
  }

  // -------------------------------------------------------------------------
  // closeAll
  // -------------------------------------------------------------------------

  async closeAll() {
    const names = [...this.#upstreams.keys()];
    await Promise.allSettled(names.map((n) => this.#disconnect(n)));
    this.#currentConfigs.clear();
  }

  // -------------------------------------------------------------------------
  // getTools – aggregated and prefixed
  // -------------------------------------------------------------------------

  async getTools() {
    const tools = [];

    for (const [name, entry] of this.#upstreams) {
      if (entry.status !== 'connected') continue;

      // Re-fetch tools to pick up any upstream changes
      try {
        const { tools: freshTools } = await entry.client.listTools();
        entry.tools = freshTools || [];
      } catch (err) {
        upstreamLogger.warn({ err, server: name }, `Failed to refresh tools for ${name}`);
        // Fall through with cached tools
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

  async callTool(prefixedName, args) {
    // Try exact prefix match first
    let { serverName, toolName } = parsePrefixedName(prefixedName);

    if (serverName && this.#upstreams.has(serverName)) {
      const entry = this.#upstreams.get(serverName);
      if (entry.status !== 'connected') {
        throw new Error(`Server "${serverName}" is not connected (status: ${entry.status})`);
      }
      return await entry.client.callTool({ name: toolName, arguments: args });
    }

    // If the simple split didn't match a server, try longer prefixes.
    // This handles server names that themselves contain underscores.
    for (const [name, entry] of this.#upstreams) {
      if (prefixedName.startsWith(name + '_')) {
        const actualTool = prefixedName.slice(name.length + 1);
        if (entry.status !== 'connected') {
          throw new Error(`Server "${name}" is not connected (status: ${entry.status})`);
        }
        return await entry.client.callTool({ name: actualTool, arguments: args });
      }
    }

    throw new Error(`No upstream server found for tool "${prefixedName}"`);
  }

  // -------------------------------------------------------------------------
  // getStatuses
  // -------------------------------------------------------------------------

  getStatuses() {
    const statuses = {};
    for (const [name, entry] of this.#upstreams) {
      statuses[name] = {
        status: entry.status,
        toolCount: entry.tools.length,
        ...(entry.error && { error: entry.error }),
      };
    }
    return statuses;
  }
}
