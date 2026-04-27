# rearch-cli

Run [ReArch](https://github.com/rearch-engineer/rearch) with a single command — no manual configuration, no auth setup.

```bash
npx rearch-cli
```

That's it. ReArch will be available at [http://localhost:3000](http://localhost:3000), with authentication disabled (`AUTH_MODE=NONE`) so you land directly into the app as a guest user.

## Requirements

- [Docker](https://www.docker.com/) installed and running
- Node.js 18+

## Usage

### Start

```bash
npx rearch-cli                       # frontend on :3000, API on :5050
npx rearch-cli --port 4000           # custom frontend port
npx rearch-cli --api-port 5555       # custom API port
npx rearch-cli --no-pull             # skip pulling the latest images
npx rearch-cli --dev                 # use the 'dev' image tag (latest main build)
npx rearch-cli --image-tag sha-abc1  # pin to a specific image tag
npx rearch-cli --platform linux/arm64  # use a native arm64 image (when available)
```

### Platform / Apple Silicon

The ReArch images on `ghcr.io` are currently published for `linux/amd64` only. On Apple Silicon Macs (and other arm64 hosts) the CLI defaults to `--platform linux/amd64`, which runs the rearch-* containers under emulation. Mongo and Redis are multi-arch and always use the host's native platform.

Once multi-arch builds (`linux/amd64,linux/arm64`) are published, you can opt into the native build with:

```bash
npx rearch-cli --platform linux/arm64
```

If you see an error like `no matching manifest for linux/arm64/v8 in the manifest list entries`, the tag you requested hasn't been published for arm64 yet — stick with the default (`linux/amd64`) or pick a tag that has both arches.

### Image tags

By default the CLI pulls images tagged `latest`, which are only published when a GitHub Release is cut. While iterating you may prefer the rolling `dev` tag (built on every push to `main`) or a specific commit SHA:

| Flag                    | Effect                                                              |
| ----------------------- | ------------------------------------------------------------------- |
| (none)                  | Pull `:latest`                                                      |
| `--dev`                 | Pull `:dev` (shortcut for `--image-tag dev`)                        |
| `--image-tag <tag>`     | Pull any tag — useful for pinning to `sha-XXXXXXX` or a release ver |

`--dev` takes precedence over `--image-tag` when both are passed.

Press `Ctrl+C` to stop and clean up the containers.

### Stop

```bash
npx rearch-cli stop
```

### Status

```bash
npx rearch-cli status
```

### Logs

```bash
npx rearch-cli logs              # tail the backend (most useful)
npx rearch-cli logs frontend
npx rearch-cli logs backend
npx rearch-cli logs mcp-proxy
npx rearch-cli logs mongodb
npx rearch-cli logs redis
```

## What gets started

The CLI launches five containers on a dedicated `rearch-net` Docker network:

| Container          | Image                                                   | Purpose                              |
| ------------------ | ------------------------------------------------------- | ------------------------------------ |
| `rearch-frontend`  | `ghcr.io/rearch-engineer/rearch-frontend:latest`        | React SPA served by nginx            |
| `rearch-backend`   | `ghcr.io/rearch-engineer/rearch-backend:latest`         | Elysia.js API + Socket.IO            |
| `rearch-mcp-proxy` | `ghcr.io/rearch-engineer/rearch-mcp-proxy:latest`       | MCP proxy for conversation containers|
| `rearch-mongodb`   | `mongo:7`                                               | Application database                 |
| `rearch-redis`     | `redis:7-alpine`                                        | BullMQ job queue                     |

## Authentication

This CLI forces `AUTH_MODE=NONE`. On first start, the backend bootstraps a single guest user (`guest@rearch.local`) and the frontend auto-logs in via `/api/auth/none-login` — there is no sign-up screen, no password prompt, nothing.

If you need real auth (LOCAL email/password, OpenID Connect, or Keycloak), use the production `docker-compose.yml` from the [main repo](https://github.com/rearch-engineer/rearch) instead.

## Persistent state

Data and generated secrets are stored in `~/.rearch/`:

```
~/.rearch/
├── secrets.json       # JWT, encryption, and internal API secrets (auto-generated, 0600)
├── mongodb/           # MongoDB data volume
├── redis/             # Redis AOF data
└── backend-data/      # Backend file uploads / GridFS cache
```

These survive across `start` / `stop` cycles. Delete the directory to reset everything from scratch.

## Why two ports?

The bundled frontend image serves only static files via nginx — it doesn't proxy `/api`. Rather than ship a custom reverse proxy, the CLI publishes the backend on its own port (default `:5050`) and configures the SPA's runtime config to talk to it directly. This keeps the image identical to the one used in production.

## Troubleshooting

**"Docker is not running or not installed"** — start Docker Desktop (macOS / Windows) or `sudo systemctl start docker` (Linux).

**Backend health check timed out** — run `npx rearch-cli logs backend` to see what's happening. Most often this is MongoDB taking longer than expected on a slow disk; just rerun the command.

**Port already in use** — pass `--port` and/or `--api-port` to pick free ports.

**Want a clean slate** — `npx rearch-cli stop && rm -rf ~/.rearch && npx rearch-cli`.

## License

Apache-2.0
