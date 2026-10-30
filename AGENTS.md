# AGENTS.md

ReArch: platform for AI agents. Admins define **Agents** (container config + resources); each conversation with an agent runs an OpenCode session in an isolated Docker container. A repository (Bitbucket/GitHub) is one optional kind of resource. Backend orchestrates containers and streams over Socket.IO.

## Runtime & languages

- **Bun 1.3.10** is the runtime everywhere (backend, frontend dev server, mcp-proxy, devtools). Not Node.
- Backend & frontend are plain **JavaScript ESM (`.js`)**, not TypeScript. Only `devtools/`, `packages/cli/`, and `packages/desktop/` use TS.
- No linter, formatter, or typecheck is configured. Match surrounding code style; do not introduce tooling.

## Dev environment

- `./development.sh start` is the single entry point (delegates to `devtools/src/cli.ts`). Also `stop`, `restart [service]`, `logs [service]`, `ps`.
- Ports: frontend `:4200`, backend `:5000`, mcp-proxy `:3100`, MongoDB `:27017`, Redis `:6379`. (The `npx rearch-cli` packaged path uses different ports: 3000/5050 — that is the `packages/cli` distribution, separate from local dev.)
- Local dev runs services as background processes; logs go to `.rearch-logs/`, PIDs to `.rearch-pids`. Use `./development.sh logs` to view, not raw `bun run`.
- Docker must be running (infra via `docker-compose-dev.yml`; production stack is `docker-compose.yml` for Docker Swarm).

## Tests

- Backend unit tests use Bun's runner. **Run scoped, never bare `bun test`**: from `backend/`, `bun test middleware routes config.test.js` (this is the `test` script and what CI runs). Bare `bun test` would crawl cloned repos under `backend/data/` — `bunfig.toml` excludes `data/**` but the npm scripts further scope to specific dirs.
- Template tests are separate and slow: `bun run test:templates` (1200s timeout).
- E2E (Playwright) lives in `e2e/`, run with `bun run test:e2e`. Config is sequential single-worker (`bitbucket-flow.spec.js` is one ordered flow), needs `PLAYWRIGHT_*` env vars and a running stack; hits live Bitbucket APIs (slow, can be flaky).

## Repo layout (boundaries that matter)

- `backend/` — Elysia.js API + Socket.IO. Entry `server.js`. `queue/` = BullMQ workers (conversations, resources, scheduler). `tools/` = AI tool defs (bitbucket, github, conversation). `routes/admin/` is the admin surface. Container orchestration helpers in `utils/`.
- Domain naming (legacy, pending rename): `models/Resource.js` is a **provider connection** (Bitbucket workspace / GitHub App credentials); `models/SubResource.js` is the **resource** itself (today: repositories, `type` = `bitbucket-repository` | `github-repository`); `models/Agent.js` owns the container runtime config and an optional `repository` (SubResource). `Conversation.agent` is the source of truth; `Conversation.repository`/`subResource` are legacy mirrors kept for provider tools (PRs). `SubResource.rearch` is legacy and only read by `scripts/migrate-agents.js` / lazy migration in `utils/agents.js`.
- `frontend/` — React 18 + MUI Joy, Vite. Scripts: `bun run dev|build`.
- `devtools/` — the dev CLI (TS, Bun).
- `mcp-proxy/` — MCP proxy service.
- `agent-image/` — base Docker image for per-conversation OpenCode containers.
- `packages/cli/` — published `rearch-cli` (Apache-2.0, separate license from repo BUSL-1.1). `packages/desktop/` — Tauri v2 app.
- `keycloak/`, `traefik/` — identity provider and reverse proxy config.

## Gotchas

- README references `backend/migrations/`; it does not exist. Migrations live in `backend/scripts/` (`migrate-workspaces.js`, `migrate-agents.js` via `bun run migrate:agents`).
- Backend `.env` is created from `backend/.env.example` automatically by `development.sh`. Key vars: `MONGODB_URI`, `REDIS_URL`, `JWT_SECRET`, `AUTH_MODE` (`LOCAL`|`OAUTH`|`KEYCLOAK_FIREWALL`, default `LOCAL`), `CONVERSATION_CONTAINER_IMAGE`.
- CI (`build-images.yml`) runs backend tests then builds multi-arch images for agent-base, frontend, backend, mcp-proxy to GHCR. Push to `main` → `dev` + `sha-*`; release → `latest` + semver.
- Every PR must pass **CodeQL** (zero findings) and the **CLA bot**. New contributors add their GitHub username to `contributors.yml`.

## Conventions

- Branches off `main` with prefixes `feat/ fix/ docs/ refactor/ test/`.
- Conventional-commit-style messages (`feat:`, `fix:`, etc.).
- See `CONTRIBUTING.md` for full PR/CLA flow.
