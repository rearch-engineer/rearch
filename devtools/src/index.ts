// ──────────────────────────────────────────────────────────────
// index.ts — ReArch Development Server TUI entry point
// ──────────────────────────────────────────────────────────────

import { resolve } from "node:path";
import logUpdate from "log-update";
import chalk from "chalk";
import { renderDashboard, getVisualPageOrder } from "./dashboard.js";
import { checkPorts } from "./ports.js";
import { ServiceManager, SERVICE_DEFINITIONS } from "./services.js";
import type { DashboardState } from "./types.js";

const brand = chalk.hex("#EE4000");
const dim = chalk.dim;

// ── Resolve project root ─────────────────────────────────────
// import.meta.dir → devtools/src/ → up twice → project root

const PROJECT_ROOT = resolve(import.meta.dir, "..", "..");

// ── State ────────────────────────────────────────────────────

let shuttingDown = false;
let renderInterval: ReturnType<typeof setInterval> | null = null;

const state: DashboardState = {
  services: [],
  activePage: 0, // Will be set to "All Logs" once services are loaded
  restarting: false,
  statusMessage: null,
  combinedLogs: [],
  dockerContainers: [],
};

// ── Entry ────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Pre-flight: check port availability
  console.log(dim("  Checking port availability..."));

  const ports = SERVICE_DEFINITIONS.map((s) => s.port);
  const availability = await checkPorts(ports);

  let blocked = false;
  for (const [port, available] of availability.entries()) {
    const svc = SERVICE_DEFINITIONS.find((s) => s.port === port);
    if (!available) {
      console.log(
        `  ${chalk.red("✗")} Port ${chalk.bold(String(port))} (${svc?.name}) is already in use`,
      );
      blocked = true;
    } else {
      console.log(
        `  ${chalk.green("✓")} Port ${chalk.bold(String(port))} (${svc?.name}) is available`,
      );
    }
  }

  if (blocked) {
    console.log("");
    console.log(
      chalk.red(
        "  One or more required ports are occupied. Free them and try again.",
      ),
    );
    process.exit(1);
  }

  console.log("");
  console.log(dim("  All ports available. Starting services..."));
  console.log("");

  // Initialize service manager
  const manager = new ServiceManager(PROJECT_ROOT);
  state.services = manager.getStates();
  state.combinedLogs = manager.getCombinedLogs();

  // Default to "All Logs" page
  state.activePage = state.services.length + 1;

  // Start Docker services first, then local services
  await manager.startDockerServices();
  await manager.startLocalServices();

  // Start health checks
  manager.startHealthChecks();

  // Initial docker container scan
  state.dockerContainers = await manager.refreshDockerContainers();

  // Clear the splash screen and start dashboard rendering
  console.clear();
  startDashboard(manager);
}

// ── Dashboard render loop ────────────────────────────────────

function startDashboard(manager: ServiceManager): void {
  // Render immediately
  logUpdate(renderDashboard(state));

  // Re-render every 250ms
  renderInterval = setInterval(() => {
    if (!shuttingDown) {
      // Keep combined logs reference in sync (it may be reassigned on trim)
      state.combinedLogs = manager.getCombinedLogs();
      logUpdate(renderDashboard(state));
    }
  }, 250);

  // Refresh docker container info every 5 seconds
  setInterval(async () => {
    if (!shuttingDown) {
      state.dockerContainers = await manager.refreshDockerContainers();
    }
  }, 5000);

  // Enable keyboard input
  setupKeyboardInput(manager);
}

// ── Keyboard input ───────────────────────────────────────────

function setupKeyboardInput(manager: ServiceManager): void {
  if (!process.stdin.isTTY) return;

  process.stdin.setRawMode(true);
  process.stdin.resume();

  process.stdin.on("data", async (data: Buffer) => {
    const key = data.toString();

    // Ctrl+C
    if (data[0] === 3) {
      await gracefulShutdown(manager);
      return;
    }

    // q — Quit
    if (key === "q" || key === "Q") {
      await gracefulShutdown(manager);
      return;
    }

    // r — Restart all
    if ((key === "r" || key === "R") && !state.restarting) {
      state.restarting = true;
      state.statusMessage = "Restarting all services...";

      try {
        await manager.restartAll();
        state.statusMessage = "All services restarted.";
        setTimeout(() => {
          state.statusMessage = null;
        }, 3000);
      } catch {
        state.statusMessage = "Restart failed. Check logs.";
        setTimeout(() => {
          state.statusMessage = null;
        }, 5000);
      } finally {
        state.restarting = false;
      }
      return;
    }

    // Arrow keys — switch page in visual bar order
    // Left: \x1b[D (27, 91, 68)   Right: \x1b[C (27, 91, 67)
    if (data.length === 3 && data[0] === 27 && data[1] === 91) {
      const visualOrder = getVisualPageOrder(state.services.length);
      const currentVisualIdx = visualOrder.indexOf(state.activePage);
      const pos = currentVisualIdx === -1 ? 0 : currentVisualIdx;

      if (data[2] === 67) {
        // Right arrow — next page in visual order
        state.activePage = visualOrder[(pos + 1) % visualOrder.length];
        return;
      }
      if (data[2] === 68) {
        // Left arrow — previous page in visual order
        state.activePage =
          visualOrder[(pos - 1 + visualOrder.length) % visualOrder.length];
        return;
      }
    }
  });
}

// ── Graceful shutdown ────────────────────────────────────────

async function gracefulShutdown(manager: ServiceManager): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  // Stop render loop
  if (renderInterval) {
    clearInterval(renderInterval);
    renderInterval = null;
  }

  logUpdate.clear();
  console.log("");
  console.log(brand("  Shutting down ReArch development server..."));
  console.log("");

  manager.stopHealthChecks();

  console.log(dim("  Stopping local dev servers..."));
  await manager.stopLocalServices();
  console.log(chalk.green("  ✓ Local servers stopped."));

  console.log(dim("  Stopping Docker containers..."));
  // shutdown() only tears down Docker here since local services are already stopped
  await manager.shutdownDocker();
  console.log(chalk.green("  ✓ Docker containers stopped."));

  console.log("");
  console.log(dim("  All services stopped. Goodbye."));
  console.log("");

  process.exit(0);
}

// ── Handle unexpected signals ────────────────────────────────

process.on("SIGINT", () => {
  // Handled by raw stdin Ctrl+C detection
});

process.on("SIGTERM", () => {
  // Will be caught by cleanup
  process.exit(0);
});

// ── Run ──────────────────────────────────────────────────────

main().catch((err) => {
  console.error(chalk.red("Fatal error:"), err);
  process.exit(1);
});
