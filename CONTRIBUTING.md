# Contributing to ReArch

Thanks for your interest in contributing to ReArch. This guide covers what you need to know to submit changes.

## CLA Requirement

All contributors must sign the [Contributor License Agreement](cla.md) before any PR can be merged. To sign:

1. Add your GitHub username to `contributors.yml`
2. Submit a PR with that change

The CLA bot will automatically verify your signature on every PR. Your PR cannot be merged until it passes.

## Getting Started

See the [README](README.md) for full prerequisites and setup details. In short:

- Bun 1.3.10+
- Docker and Docker Compose
- A Bitbucket or GitHub workspace
- An LLM Provider / AI API key

To start the local development environment:

```bash
./development.sh start
```

This brings up Docker infrastructure (Redis, MongoDB), installs dependencies, and starts the backend, frontend, and MCP proxy. The frontend runs at `http://localhost:4200` and the backend at `http://localhost:5000`.

## Branch Naming

Create branches from `main` using the following prefixes:

| Prefix | Purpose | Example |
|--------|---------|---------|
| `feat/` | New features | `feat/dark-mode` |
| `fix/` | Bug fixes | `fix/auth-redirect` |
| `docs/` | Documentation changes | `docs/api-examples` |
| `refactor/` | Code refactoring | `refactor/job-queue` |
| `test/` | Test additions or fixes | `test/auth-middleware` |

## Commit Messages

Use conventional-commit-style prefixes:

```
feat: add usage metrics export
fix: resolve token refresh race condition
docs: update environment variable table
refactor: extract Docker helper into shared util
test: add unit tests for role middleware
chore: update dependencies
```

Keep messages concise and focused on the "why" rather than the "what."

## Submitting a Pull Request

1. Fork the repository and clone your fork
2. Create a branch from `main` following the naming convention above
3. Make your changes
4. Run tests (see below)
5. Push your branch and open a PR against `main`

Every PR triggers:

- **CLA bot** -- verifies you have signed the CLA
- **CodeQL analysis** -- static security analysis must pass cleanly

Both checks must pass before your PR can be merged.

## Testing

### Unit tests

Run backend unit tests with:

```bash
bun test
```

from the `backend/` directory. Tests use Bun's built-in test runner.

### E2E tests

End-to-end tests use Playwright and live in the `e2e/` directory. See `e2e/README.md` for setup and execution details.

Contributors should add or update tests to cover their changes.

## Code Style

There is no formal linter or formatter configured. Follow the patterns established in the existing codebase:

- ES Modules (`import`/`export`) throughout
- Bun as the runtime for backend, frontend dev server, and MCP proxy
- JavaScript (`.js`) for backend and frontend; TypeScript (`.ts`) for devtools

## Code Review Process

All changes go through AI-assisted analysis, static code analysis (CodeQL), and human review by maintainers. PRs must pass CodeQL with no findings before merging.

## Reporting Issues

- **Bugs and feature requests** -- open a GitHub Issue
- **Security vulnerabilities** -- report privately per the [Security Policy](SECURITY.md). Do not open public issues for security concerns.

## License

ReArch is licensed under the [Business Source License 1.1](LICENSE). All contributions are subject to the terms of the [CLA](cla.md).
