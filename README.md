# Introduction

A full-stack AI-powered application that connects developers with AI coding assistants running in isolated Docker containers. Each conversation spins up a dedicated [OpenCode](https://opencode.ai) container with access to a Bitbucket repository, enabling collaborative development workflows.

## Overview

ReArch provides a familiar user interface where users can have AI-assisted conversations scoped to specific code repositories. The backend orchestrates Docker containers running OpenCode sessions, streams responses in real time via Socket.IO, and integrates with Bitbucket and Jira for end-to-end developer workflows.

**Key capabilities:**

- Per-conversation Docker containers running OpenCode AI sessions
- Real-time streaming chat via Socket.IO
- Bitbucket repository integration (clone, browse, create pull requests)
- Jira issue tracking integration
- Role-based access control (admin / user)
- File upload and management via GridFS (MongoDB)
- Background job processing with BullMQ and Redis
- Flexible authentication: local email/password, OpenID Connect, or Keycloak

## Architecture

```
[Traefik] ──► app.rearch.yourdomain   → React frontend (nginx)
          ──► api.rearch.yourdomain   → Elysia.js backend
          ──► auth.rearch.yourdomain  → Keycloak (identity provider)
          ──► conv-*.rearch.yourdomain → Per-conversation OpenCode containers
```

**Services:**

| Service | Technology | Purpose |
|---|---|---|
| Frontend | React 18, MUI Joy | UI |
| Backend | Bun, Elysia.js | REST API + Socket.IO |
| MongoDB | Mongo 7 | Conversations, messages, users |
| Redis | Redis 7 | BullMQ job queue |
| Keycloak | Keycloak 24 | Identity provider (production) |
| Traefik | Traefik v3 | Reverse proxy + TLS |

## Prerequisites

- bun 1.3.10
- Docker and Docker Compose
- A Bitbucket workspace (for repository integration)
- An Anthropic AI API key

## Local Development

### 1. Start infrastructure

```bash
docker compose -f docker-compose-dev.yml up -d
```

This starts MongoDB (port 27017) and Redis (port 6379).

### 2. Configure the backend

```bash
cd backend
cp .env.example .env
# Edit .env and fill in your values
npm install
npm run dev
```

The backend starts on `http://localhost:5000`.

### 3. Configure the frontend

```bash
cd frontend
npm install
npm start
```

The frontend starts on `http://localhost:4200`.

### One-command start

Alternatively, use the convenience script to start all services together:

```bash
./development.sh
```

This launches everything. Using docker. Press `Ctrl+C` to stop everything.

## Backend Environment Variables

Copy `backend/.env.example` to `backend/.env` and configure:

| Variable | Required | Description |
|---|---|---|
| `MONGODB_URI` | Yes | MongoDB connection string |
| `REDIS_URL` | Yes | Redis connection URL |
| `JWT_SECRET` | Yes | Secret key for JWT signing |
| `JWT_EXPIRY` | No | Token expiry (default: `24h`) |
| `AUTH_MODE` | No | `LOCAL`, `OAUTH`, or `KEYCLOAK_FIREWALL` (default: `LOCAL`) |
| `ADMIN_EMAIL` | Yes | Bootstrap admin email (first run only) |
| `ADMIN_PASSWORD` | Yes (LOCAL) | Bootstrap admin password |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key |
| `CONVERSATION_CONTAINER_IMAGE` | Yes | Docker image for OpenCode sessions |
| `FRONTEND_URL` | No | Frontend URL for CORS |

### Authentication Modes

**LOCAL** — Email and password stored in MongoDB. Default for development.

**OAUTH** — Generic OpenID Connect. Set `OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET`, `OAUTH_REDIRECT_URI`, and `OAUTH_ISSUER_URL`.

**KEYCLOAK_FIREWALL** — Validates Keycloak JWTs. Set `KEYCLOAK_REALM_URL`, `KEYCLOAK_CLIENT_ID`, and `KEYCLOAK_CLIENT_SECRET`.

## Production Deployment (Docker Swarm)

### 1. Create overlay networks

```bash
docker network create --driver overlay --attachable rearch-net
docker network create --driver overlay traefik-public
```

### 2. Configure environment

```bash
cp .env.stack.example .env
# Edit .env with production values
```

### 3. Deploy the stack

```bash
docker stack deploy -c docker-compose.yml rearch
```

Services are exposed at:

- `https://app.rearch.yourdomain` — Frontend
- `https://api.rearch.yourdomain` — Backend API
- `https://auth.rearch.yourdomain` — Keycloak

## API

Interactive API documentation is available at `http://localhost:5000/api-docs` (Swagger UI).

### Key endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/auth/login` | Authenticate and receive JWT |
| `GET` | `/api/conversations` | List conversations |
| `POST` | `/api/conversations` | Create a conversation |
| `POST` | `/api/conversations/:id/messages` | Send a message |
| `GET` | `/api/resources` | List Bitbucket resources |
| `GET` | `/api/users` | List users (admin) |
| `GET` | `/health` | Health check |

## Project Structure

```
rearch/
├── backend/               # Elysia.js API server
│   ├── models/            # Mongoose models
│   ├── routes/            # API route handlers
│   ├── middleware/        # Auth and role middleware
│   ├── utils/             # Docker, GridFS, Git, Bitbucket helpers
│   ├── tools/             # AI tool definitions (Jira, Bitbucket, etc.)
│   ├── migrations/        # Database migrations
│   └── server.js          # Entry point
├── frontend/              # React SPA
│   ├── src/
│   │   ├── pages/         # Route-level page components
│   │   ├── components/    # Reusable UI components
│   │   ├── api/           # API client
│   │   └── contexts/      # React contexts
│   └── nginx.conf         # nginx config for production
├── keycloak/              # Keycloak realm export
├── traefik/               # Traefik static and dynamic config
├── docker-compose.yml     # Production Docker Swarm stack
├── docker-compose-dev.yml # Local dev infrastructure (MongoDB + Redis)
└── development.sh               # One-command local dev launcher
```
