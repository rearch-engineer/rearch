# Setting Up `.rearch/` for Your Project

This guide explains how to create a `.rearch/` directory for any repository so that, when the ReArch platform launches a container for it, the container comes fully configured with all required services running automatically.

The `projects/` repository serves as a reference implementation throughout this guide. It runs PostgreSQL, a Node.js backend, a Vite React frontend, pgweb (database UI), code-server (VS Code in the browser), and OpenCode (AI coding assistant) — all inside a single container managed by [supervisor](http://supervisord.org/).

---

## Table of Contents

1. [Overview](#overview)
2. [Directory Structure](#directory-structure)
3. [Step-by-Step Guide](#step-by-step-guide)
   - [Step 1: Create the directory](#step-1-create-the-directory)
   - [Step 2: Write the Dockerfile](#step-2-write-the-dockerfile)
   - [Step 3: Write the entrypoint script](#step-3-write-the-entrypoint-script)
   - [Step 4: Add OpenCode browser tools (optional)](#step-4-add-opencode-browser-tools-optional)
   - [Step 5: Build and test](#step-5-build-and-test)
4. [Key Concepts](#key-concepts)
   - [Supervisor: running multiple services](#supervisor-running-multiple-services)
   - [Entrypoint: runtime initialization](#entrypoint-runtime-initialization)
   - [Frontend-to-backend routing (Vite proxy)](#frontend-to-backend-routing-vite-proxy)
   - [Database inside the container](#database-inside-the-container)
   - [Port exposure and random mapping](#port-exposure-and-random-mapping)
5. [Reference: projects/ setup](#reference-projects-setup)
6. [Adapting for your project](#adapting-for-your-project)
7. [Troubleshooting](#troubleshooting)

---

## Overview

The `.rearch/` directory contains everything Docker needs to build a self-contained development environment for your project. When the ReArch platform (`backend/queue.js`) starts a conversation container, it:

1. Pulls the Docker image built from your `.rearch/Dockerfile`
2. Passes environment variables (`GIT_TOKEN`, etc.)
3. Runs the container, which executes `.rearch/entrypoint.sh`
4. The entrypoint initializes services (database, git config, .env files, etc.)
5. Supervisor starts and manages all long-running processes

The container then has a fully working development environment accessible via randomly-mapped ports.

---

## Directory Structure

```
your-project/
├── .rearch/
│   ├── Dockerfile              # Container image definition
│   ├── entrypoint.sh           # Runtime initialization script
│   ├── opencode-package.json   # Dependencies for OpenCode browser tools
│   ├── README.md               # This guide
│   └── agent-tools/            # (Optional) Custom tools for the OpenCode AI agent
│       ├── browser.ts
│       ├── browser_click.ts
│       ├── browser_close.ts
│       ├── browser_evaluate.ts
│       ├── browser_navigate.ts
│       ├── browser_screenshot.ts
│       ├── browser_type.ts
│       └── browser_wait.ts
├── backend/
├── frontend/
└── ...
```

---

## Step-by-Step Guide

### Step 1: Create the directory

```bash
mkdir -p .rearch/agent-tools
```

### Step 2: Write the Dockerfile

The Dockerfile builds a single image containing all services your project needs. It follows a consistent structure with numbered sections. See [Dockerfile](./Dockerfile) for the full reference implementation.

The general pattern is:

1. **System dependencies** — Always include `supervisor`, `build-essential`, `python3`, `git`, `curl`. Add project-specific packages (e.g., `postgresql`, `redis`).
2. **Developer tools** — Install code-server, Playwright (Chromium), OpenCode, and nodemon globally.
3. **Additional tools** — Project-specific tools like pgweb, phpMyAdmin, etc.
4. **Users and directories** — Create a `coder` user, set root password, create `/repository`.
5. **Copy repository code** — `COPY --chown=coder:coder . /repository`
6. **Install dependencies** — Run `npm install` for each project directory.
7. **Copy OpenCode tools** — Copy `agent-tools/` and `opencode-package.json` to the coder user's OpenCode config.
8. **Copy entrypoint** — Copy and `chmod +x` the entrypoint script.
9. **Supervisor configuration** — Define all service programs with priorities, users, and log files.
10. **Expose ports** — Only ports that external users/services need.
11. **Entrypoint** — Set the entrypoint to the startup script.

#### Important notes

- **Build context**: Always build from the repository root: `docker build -f .rearch/Dockerfile -t your-project .`
- **COPY**: The `COPY . /repository` copies the entire repo. Use `.dockerignore` to exclude `node_modules/`, `.git/`, etc.
- **Users**: `coder` is a non-root user for running services. `root` is used by supervisor itself.
- **Dependencies**: Run `npm install` at build time so they're baked into the image. The entrypoint handles runtime-only setup.

### Step 3: Write the entrypoint script

The entrypoint runs **once** at container startup, before supervisor takes over. See [entrypoint.sh](./entrypoint.sh) for the full reference implementation.

It handles:

1. **Git configuration** — so the coding agent can commit and push
2. **Database initialization** — create databases, set passwords, configure auth
3. **Environment file generation** — write `.env` files with container-local values
4. **Config patching** — modify config files for the container environment (e.g., Vite proxy)
5. **Start supervisor** — hand off to supervisor to manage all services

#### Important notes

- **`set -e`**: The script exits immediately if any command fails. This prevents the container from starting with a broken state.
- **`exec`**: The final `exec supervisord` replaces the shell process, so supervisor becomes PID 1 and handles signals properly.
- **Heredocs with single-quoted delimiters** (`<<'EOF'`): Use single quotes around the delimiter to prevent bash from interpolating variables inside the heredoc.
- **Avoid inline scripts with complex escaping**: If you need to run Node.js/Python code to patch config files, write the script to a temp file first using a heredoc, then execute it. Embedding code in `su -c "node -e \"...\""` causes escaping nightmares. See how [entrypoint.sh](./entrypoint.sh) writes to `/tmp/patch-vite.js` as an example.

### Step 4: Add OpenCode browser tools (optional)

The `agent-tools/` directory provides Playwright-based browser automation to the OpenCode AI agent. This lets the agent take screenshots, click buttons, fill forms, and evaluate JavaScript in the running app — useful for visual verification and debugging.

To add them:

1. Copy the [agent-tools/](./agent-tools/) directory from an existing `.rearch/` setup
2. Copy [opencode-package.json](./opencode-package.json) (defines the Playwright dependency)
3. **Update `DEFAULT_URL`** in [browser.ts](./agent-tools/browser.ts) to point to your frontend port (e.g., `http://localhost:4200`)
4. **Update URL examples** in [browser_navigate.ts](./agent-tools/browser_navigate.ts) and [browser_screenshot.ts](./agent-tools/browser_screenshot.ts) descriptions to match your app

These dependencies are resolved inside the container (Playwright and its Chromium binary are installed in the Dockerfile). LSP errors about missing modules in your local editor are expected and can be ignored.

### Step 5: Build and test

```bash
# Build from the repository root
docker build -f .rearch/Dockerfile -t your-project .

# Run with required env vars
docker run -d \
  -p 3000:3000 \
  -p 4200:4200 \
  -p 8081:8081 \
  -p 8080:8080 \
  -p 4096:4096 \
  --name your-project-dev \
  your-project

# Check the startup logs
docker logs -f your-project-dev

# Verify services are running
docker exec -it your-project-dev supervisorctl status
```

---

## Key Concepts

### Supervisor: running multiple services

[Supervisor](http://supervisord.org/) manages all long-running processes inside the container. Each service is defined as a `[program:name]` block in the supervisor configuration (embedded in the Dockerfile via a `RUN echo '...' > /etc/supervisor/conf.d/supervisord.conf` command). See the supervisor section in [Dockerfile](./Dockerfile) for the full configuration.

Key settings per program:

| Setting | Purpose |
|---------|---------|
| `command` | The command to run |
| `user` | Which OS user runs the process |
| `directory` | Working directory |
| `priority` | Startup order (lower = starts first) |
| `autostart` | Start automatically with supervisor |
| `autorestart` | Restart if the process exits |
| `startsecs` | Seconds the process must stay running to be considered "started" |
| `startretries` | How many times to retry starting on failure |
| `environment` | Environment variables for this process only |

#### Priority ordering

Use priorities to control startup order when services depend on each other:

```
priority=5   -> Database (must start first)
priority=10  -> Independent tools (code-server, opencode)
priority=15  -> Database tools (pgweb -- needs database running)
priority=20  -> Backend (needs database running)
priority=25  -> Frontend (needs backend for API proxy)
```

Services with the same priority start in parallel.

### Entrypoint: runtime initialization

The entrypoint script handles things that **can't be done at build time**:

| Task | Why runtime? |
|------|-------------|
| Git configuration | Uses `GIT_TOKEN` and `GIT_USER_EMAIL` env vars passed at runtime |
| Database initialization | Needs PostgreSQL running; apt installs the package but doesn't create your DB |
| `.env` file generation | Values may depend on runtime env vars or container-local addresses |
| Config file patching | Vite proxy setup depends on your specific backend routes |

The entrypoint must end with `exec /usr/bin/supervisord ...` to hand off to supervisor. See [entrypoint.sh](./entrypoint.sh) for the complete implementation.

### Frontend-to-backend routing (Vite proxy)

When Docker maps container ports to random host ports, the browser can't know the backend's external port. The solution: **proxy API requests through the Vite dev server**.

The [entrypoint.sh](./entrypoint.sh) patches `vite.config.ts` at startup to add proxy rules for each backend route prefix. It also sets `VITE_API_URL=` (empty) in the frontend `.env`, so the frontend uses relative URLs.

**How to identify your route prefixes**: Look at your backend's main app/router file for `app.use("/path", ...)` statements. Each unique top-level prefix needs a proxy entry.

**Important**: To avoid bash escaping issues when patching the config, write the patch script to a temp file using a heredoc, then execute it. See the vite patching section in [entrypoint.sh](./entrypoint.sh) for the exact approach.

**If your backend already uses a single `/api` prefix**, the proxy setup is much simpler — just one entry.

**If your app uses a non-Vite bundler** (e.g., webpack, Next.js), the same concept applies but the proxy configuration syntax will differ.

### Database inside the container

If your project needs a database, install it via apt in the Dockerfile and initialize it in the entrypoint. See the PostgreSQL sections in [Dockerfile](./Dockerfile) and [entrypoint.sh](./entrypoint.sh) for the full implementation.

**Key gotchas**:
- The Debian `postgresql` apt package creates a default cluster automatically during install. Do NOT run `initdb` yourself.
- Use `pg_ctlcluster` (Debian wrapper), not `pg_ctl` directly. The Debian layout splits config (`/etc/postgresql/`) and data (`/var/lib/postgresql/`), and `pg_ctlcluster` handles this.
- Always **disable SSL** (`ssl = off`) — the snakeoil certificate referenced in the default config doesn't exist in container images.
- The database port (5432) should generally **not be exposed** to the host. Use a web UI like pgweb for external access.

### Port exposure and random mapping

When the ReArch platform launches containers, it maps internal ports to **random** host ports (`HostPort: "0"` in Docker). This means:

- You don't control which host port maps to which container port
- The frontend **cannot** hardcode `http://localhost:3000` for API calls — that port is only valid inside the container
- Solution: use a Vite/webpack proxy so the frontend and backend are accessed through a single port

**What to EXPOSE**: Only ports that external users/services need to reach:
- Frontend (your app's UI)
- Code-server (VS Code in browser)
- OpenCode API
- Database web UI (e.g., pgweb)

**What NOT to EXPOSE**: Internal-only services:
- Database ports (accessed internally by backend and pgweb)
- Backend API (proxied through the frontend's dev server)

---

## Reference: projects/ setup

The `projects/` repository runs these services:

| Service | Internal Port | Exposed | Supervisor Priority |
|---------|--------------|---------|-------------------|
| PostgreSQL | 5432 | No (internal only) | 5 |
| Code-server | 8080 | Yes | 10 |
| OpenCode | 4096 | Yes | 10 |
| pgweb | 8081 | Yes | 15 |
| Backend (Express/tsx) | 3000 | Yes | 20 |
| Frontend (Vite/React) | 4200 | Yes | 25 |

The entrypoint ([entrypoint.sh](./entrypoint.sh)):

1. Configures git (email, name, Bitbucket token)
2. Initializes PostgreSQL: disables SSL, configures auth, creates `main_database` database
3. Writes `backend/.env` with local DB connection, `SKIP_AUTH=true`
4. Writes `frontend/.env` with empty `VITE_API_URL`, `VITE_SKIP_AUTH=true`
5. Patches `vite.config.ts` to proxy 10 backend route prefixes to `localhost:3000`
6. Starts supervisor

Container credentials:
- **Root password**: `root`
- **PostgreSQL**: user `postgres`, password `postgres`, database `main_database`

Full file references:
- [Dockerfile](./Dockerfile)
- [entrypoint.sh](./entrypoint.sh)
- [opencode-package.json](./opencode-package.json)
- [agent-tools/](./agent-tools/)

---

## Adapting for your project

### Checklist

1. **Identify your services**: What processes need to run? (database, backend, frontend, workers, etc.)
2. **Identify ports**: What port does each service listen on?
3. **Identify dependencies**: Which services depend on others? (This determines supervisor priorities)
4. **Identify environment variables**: What `.env` files does your app need? What values should they have in the container?
5. **Identify route prefixes**: If you have a frontend + backend, what URL paths does the backend serve? (For proxy config)

### Common variations

**No database needed** (e.g., frontend-only or API-only project):
- Skip the PostgreSQL/pgweb sections in both Dockerfile and entrypoint
- Remove the database supervisor program

**Different database** (e.g., MySQL, MongoDB, Redis):
- Replace `postgresql postgresql-client` with the appropriate apt packages
- Adjust the entrypoint initialization accordingly
- Choose an appropriate web UI (e.g., phpMyAdmin for MySQL, mongo-express for MongoDB)

**Monorepo with single package.json**:
- Single `npm install` instead of multiple
- Adjust supervisor commands to match your `package.json` scripts

**Backend has an `/api` prefix**:
- Only one proxy entry needed: `'/api': 'http://localhost:3000'`

**No frontend** (API-only project):
- Remove the frontend supervisor program, npm install, and proxy patching
- Expose the backend port directly

**Additional workers** (e.g., background job processors):
- Add another `[program:worker]` block to supervisor config
- Set appropriate priority (after the services it depends on)

---

## Troubleshooting

### Container fails to start

```bash
docker logs your-container-name
```

The entrypoint uses `set -e`, so any failed command stops startup. The logs will show which step failed.

### Supervisor service not running

```bash
# Check status of all services
docker exec -it your-container supervisorctl status

# Restart a specific service
docker exec -it your-container supervisorctl restart backend

# View service-specific logs
docker exec -it your-container cat /var/log/supervisor/backend.log
docker exec -it your-container cat /var/log/supervisor/backend.err
```

### PostgreSQL fails to start

Common causes:
- **SSL error** ("could not access private key file"): Ensure `ssl = off` is set in `postgresql.conf`
- **Permission error**: The data directory must be owned by the `postgres` user
- **Already running**: Use `pg_ctlcluster` instead of raw `pg_ctl` for Debian-managed clusters

```bash
docker exec -it your-container cat /var/log/postgresql/postgresql-15-main.log
```

### Vite proxy not working

Check that the patch was applied:
```bash
docker exec -it your-container cat /repository/frontend/vite.config.ts
```

If the patch failed, check the entrypoint logs. The most common issue is that the `oldServer` string in the patch script doesn't exactly match the content in `vite.config.ts` (whitespace matters).

### Port conflicts

If a host port is already in use, map to different ports:
```bash
docker run -d \
  -p 9200:4200 \
  -p 9080:8080 \
  -p 9096:4096 \
  --name your-project-dev \
  your-project
```
