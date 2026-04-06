# MCP Proxy

Centralized [Model Context Protocol](https://modelcontextprotocol.io/) proxy for ReArch. Runs as a standalone service that connects to upstream MCP servers and exposes a single Streamable HTTP endpoint that all conversation containers share.

## Why

Without a proxy, every container would need its own MCP server processes and credentials. The proxy solves this by running upstream connections once and multiplexing tool calls from any number of OpenCode instances.

```
┌──────────────────────────────────────────────────────┐
│  Docker Network                                      │
│                                                      │
│  ┌────────────────────────────────┐                  │
│  │  MCP Proxy (:3100)             │                  │
│  │                                │                  │
│  │  ┌─ remote: context7 ───────┐  │                  │
│  │  ├─ remote: github ─────────┤  │                  │
│  │  ├─ remote: sentry ─────────┤  │                  │
│  │  └─ stdio:  filesystem ─────┘  │                  │
│  └──────────┬─────────────────────┘                  │
│             │                                        │
│       ┌─────┼──────────┐                             │
│  ┌────▼──┐ ┌▼───────┐ ┌▼───────┐                    │
│  │ C-1   │ │ C-2    │ │ C-N    │  Conversation       │
│  │OpenCode│ │OpenCode│ │OpenCode│  containers         │
│  └───────┘ └────────┘ └────────┘                     │
└──────────────────────────────────────────────────────┘
```

## Quick start

```bash
# Install dependencies
bun install

# Start in dev mode (auto-reload on changes)
bun run dev

# Start in production mode
bun run start
```

The proxy requires a running MongoDB instance. Set `MONGODB_URI` or it defaults to `mongodb://localhost:27017/rearch`.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `MCP_PROXY_PORT` | `3100` | Port the HTTP server listens on |
| `MONGODB_URI` | `mongodb://localhost:27017/rearch` | MongoDB connection string |
| `MCP_PROXY_SECRET` | _(unset)_ | Shared secret for `X-MCP-Secret` header authentication. When unset, all requests are allowed (dev mode) |

## Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | No | Returns `{ healthy, upstreams }` |
| `POST` | `/mcp` | Yes | MCP Streamable HTTP (JSON-RPC 2.0) |
| `POST` | `/reload` | Yes | Reload upstream configs from MongoDB |

### Authentication

If `MCP_PROXY_SECRET` is set, all requests to `/mcp` and `/reload` must include the header:

```
X-MCP-Secret: <secret>
```

The `/health` endpoint is always unauthenticated.

## How it works

### Configuration

Upstream MCP servers are stored in the `mcpservers` MongoDB collection, managed through the ReArch backend API (`/api/mcp/servers`). Each document looks like:

```json
{
  "name": "context7",
  "type": "remote",
  "url": "https://mcp.context7.com/mcp",
  "headers": {},
  "enabled": true
}
```

Or for a local stdio server:

```json
{
  "name": "filesystem",
  "type": "local",
  "command": ["npx", "-y", "@modelcontextprotocol/server-filesystem", "/data"],
  "environment": { "HOME": "/tmp" },
  "enabled": true
}
```

### Startup sequence

1. Connects to MongoDB
2. Reads all enabled `McpServer` documents
3. For each server, creates an MCP client connection:
   - **remote** servers use `StreamableHTTPClientTransport`
   - **local** servers use `StdioClientTransport` (spawns a subprocess)
4. Fetches the tool list from each upstream
5. Starts watching the collection for changes (via change streams or 30s polling fallback)

### Tool name prefixing

Tools from upstream servers are exposed with a `<serverName>_<toolName>` prefix to avoid collisions. For example, a tool called `resolve_library_id` from the `context7` server becomes `context7_resolve_library_id`.

When a `tools/call` request arrives for `context7_resolve_library_id`, the proxy strips the prefix and forwards the call to the `context7` upstream.

### Container integration

The ReArch backend creates a .opencode config file, on each conversation container at creation time. This tells OpenCode to connect to the proxy as a remote MCP server.

Example content:

```json
{
  "mcp": {
    "rearch-tools": {
      "type": "remote",
      "url": "http://mcp-proxy:3100/mcp",
      "headers": { "X-MCP-Secret": "<secret>" }
    }
  }
}
```

No changes to container Dockerfiles are needed.

### Hot reload

When MCP server configurations change in MongoDB:

- **With replica set**: A change stream triggers an immediate reload
- **Without replica set**: A polling loop checks every 30 seconds
- **Manual**: `POST /reload` forces an immediate reload

Only changed or new servers are reconnected. Unchanged servers keep their existing connections.

## Source files

| File | Description |
|---|---|
| `src/index.js` | Entry point. HTTP server, MongoDB connection, startup/shutdown lifecycle |
| `src/proxy.js` | JSON-RPC 2.0 dispatcher. Handles `initialize`, `tools/list`, `tools/call`, `ping` |
| `src/upstream-manager.js` | Manages upstream MCP client connections, tool aggregation, and call routing |
| `src/config.js` | Reads `McpServer` documents from MongoDB, watches for changes |
| `src/auth.js` | Validates `X-MCP-Secret` header |

## Docker

```dockerfile
FROM oven/bun:1-alpine
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile 2>/dev/null || bun install
COPY src/ ./src/
EXPOSE 3100
CMD ["bun", "run", "src/index.js"]
```

In the production Docker Compose stack, the proxy runs as its own service on the `rearch` overlay network, accessible to both the backend and conversation containers at `http://mcp-proxy:3100`.
