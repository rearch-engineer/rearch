/**
 * MongoDB-backed configuration loader.
 *
 * Reads MCP server configs from the McpServer collection (one document per server).
 * Supports change-stream watching (replica-set) with a polling fallback.
 */

import mongoose from 'mongoose';

// ---------------------------------------------------------------------------
// Mongoose model – mirrors backend/models/McpServer.js
// ---------------------------------------------------------------------------

const mcpServerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    type: { type: String, required: true, enum: ['remote', 'local'] },
    url: { type: String },
    command: [{ type: String }],
    headers: { type: mongoose.Schema.Types.Mixed, default: {} },
    environment: { type: mongoose.Schema.Types.Mixed, default: {} },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true },
);

// Reuse existing model if already compiled (hot-reload safety)
const McpServer =
  mongoose.models.McpServer || mongoose.model('McpServer', mcpServerSchema);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load MCP server configurations from MongoDB.
 *
 * @returns {Promise<Record<string, object>>} server name → config object
 */
export async function loadMcpServers() {
  try {
    const docs = await McpServer.find({ enabled: true }).lean();
    const servers = {};
    for (const doc of docs) {
      servers[doc.name] = {
        type: doc.type,
        url: doc.url,
        command: doc.command,
        headers: doc.headers || {},
        environment: doc.environment || {},
        enabled: doc.enabled,
      };
    }
    return servers;
  } catch (err) {
    console.error('[config] Failed to load MCP servers:', err.message);
    return {};
  }
}

/**
 * Watch for changes to MCP server documents.
 *
 * Tries MongoDB change streams first (requires replica set). Falls back to
 * polling every `intervalMs` milliseconds.
 *
 * @param {(servers: Record<string, object>) => void} callback
 * @param {number} [intervalMs=30000]
 * @returns {{ stop: () => void }} handle to tear down the watcher
 */
export function watchForChanges(callback, intervalMs = 30_000) {
  let stopped = false;
  let timer;

  // -- Polling fallback --------------------------------------------------------
  function startPolling() {
    console.log(`[config] Polling for config changes every ${intervalMs / 1000}s`);
    timer = setInterval(async () => {
      if (stopped) return;
      try {
        const servers = await loadMcpServers();
        callback(servers);
      } catch (err) {
        console.error('[config] Polling error:', err.message);
      }
    }, intervalMs);
  }

  // -- Attempt change-stream ---------------------------------------------------
  try {
    const changeStream = McpServer.watch([], { fullDocument: 'updateLookup' });

    changeStream.on('change', async () => {
      if (stopped) return;
      console.log('[config] Change stream detected McpServer update');
      const servers = await loadMcpServers();
      callback(servers);
    });

    changeStream.on('error', (err) => {
      // Change streams are unavailable (standalone mongod) — fall back.
      console.warn(
        '[config] Change stream unavailable, falling back to polling:',
        err.message,
      );
      changeStream.close().catch(() => {});
      startPolling();
    });

    console.log('[config] Watching for changes via change stream');

    return {
      stop() {
        stopped = true;
        changeStream.close().catch(() => {});
        if (timer) clearInterval(timer);
      },
    };
  } catch {
    // If watch() itself throws synchronously
    startPolling();
  }

  return {
    stop() {
      stopped = true;
      if (timer) clearInterval(timer);
    },
  };
}
