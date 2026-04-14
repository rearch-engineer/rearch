// cli.ts — ReArch development environment CLI

import { resolve } from "node:path";
import {
  startServices,
  stopServices,
  restartService,
  showStatus,
  tailLogs,
  SERVICE_DEFINITIONS,
} from "./services.js";

const PROJECT_ROOT = resolve(import.meta.dir, "..", "..");

// ── Help ─────────────────────────────────────────────────────

const HELP = `Usage:  rearch COMMAND

ReArch development environment manager

Common Commands:
  start               Start all services (Docker infrastructure + local dev servers)
  stop                Stop all services and session containers
  restart             Restart all services
  restart [service]   Restart a specific service
  logs                Tail logs from all services and session containers
  logs [service]      Tail logs from a specific service or "sessions"
  ps                  List running services and session containers
  status              Alias for ps
  help                Show this help message

Services:
  redis               Redis cache (Docker, :6379)
  mongodb             MongoDB database (Docker, :27017)
  mcp-proxy           MCP Proxy server (Bun, :3100)
  backend             Backend API server (Bun, :5000)
  frontend            Frontend dev server (Vite, :4200)
  sessions            Active rearch_session_* containers

Run 'rearch COMMAND --help' for more information on a command.
`;

const START_HELP = `
Usage:  rearch start

Start all services in the background.

Starts Docker infrastructure (Redis, MongoDB) via docker-compose-dev.yml,
then starts local dev servers (mcp-proxy, backend, frontend) as background
processes. Logs are written to .rearch-logs/ and PIDs to .rearch-pids.

Use 'rearch logs' to tail output after starting.
`;

const STOP_HELP = `
Usage:  rearch stop

Stop all running services and session containers.

Kills local dev server processes, runs docker compose down, and stops
any rearch_session_* containers.
`;

const RESTART_HELP = `
Usage:  rearch restart [service]

Restart all services, or a specific one.

Without arguments, stops everything and starts again.
With a service name, only restarts that service.

Examples:
  rearch restart             Restart everything
  rearch restart backend     Restart only the backend
  rearch restart redis       Restart only Redis
`;

const LOGS_HELP = `
Usage:  rearch logs [service]

Tail logs from running services.

Without arguments, tails logs from all services and watches for
new session containers. With a service name, tails only that service.

Examples:
  rearch logs                Tail all logs
  rearch logs backend        Tail backend logs only
  rearch logs sessions       Tail session container logs only

Press Ctrl+C to stop.
`;

const STATUS_HELP = `
Usage:  rearch status

Show the current status of all services.

Probes each service port to determine if it is running, shows PIDs
for local services, and lists any active session containers.
`;

// ── Main ─────────────────────────────────────────────────────

const [command, ...args] = process.argv.slice(2);

async function main(): Promise<void> {
  switch (command) {
    case "start":
      if (args.includes("--help")) {
        console.log(START_HELP);
        return;
      }
      await startServices(PROJECT_ROOT);
      // Detach: let parent shell regain control.
      // The spawned processes continue because their PIDs are tracked.
      process.exit(0);
      break;

    case "stop":
      if (args.includes("--help")) {
        console.log(STOP_HELP);
        return;
      }
      await stopServices(PROJECT_ROOT);
      break;

    case "restart":
      if (args.includes("--help")) {
        console.log(RESTART_HELP);
        return;
      }
      await restartService(PROJECT_ROOT, args[0]);
      if (args[0]) {
        // Single service restart — don't exit, the process keeps running
        process.exit(0);
      }
      process.exit(0);
      break;

    case "logs":
      if (args.includes("--help")) {
        console.log(LOGS_HELP);
        return;
      }
      await tailLogs(PROJECT_ROOT, args[0]);
      break;

    case "ps":
    case "status":
      if (args.includes("--help")) {
        console.log(STATUS_HELP);
        return;
      }
      await showStatus(PROJECT_ROOT);
      break;

    case "help":
    case "--help":
    case "-h":
    case undefined:
      console.log(HELP);
      break;

    default:
      console.log(`\n  Unknown command: ${command}`);
      console.log(HELP);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
