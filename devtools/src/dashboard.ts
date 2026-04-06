// ──────────────────────────────────────────────────────────────
// dashboard.ts — Renders the TUI dashboard using log-update
// ──────────────────────────────────────────────────────────────

import chalk from "chalk";
import type {
  DashboardState,
  ServiceState,
  CombinedLogEntry,
  DockerContainer,
} from "./types.js";

const brand = chalk.hex("#EE4000");
const brandBold = chalk.hex("#EE4000").bold;
const dim = chalk.dim;

// ── Git SHA (resolved once at load time) ─────────────────────

let gitSha = "dev";
try {
  const result = Bun.spawnSync(["git", "rev-parse", "--short", "HEAD"]);
  const sha = result.stdout.toString().trim();
  if (sha) gitSha = sha;
} catch {
  // keep "dev" fallback
}

// ── Page helpers ─────────────────────────────────────────────

export function getTotalPages(serviceCount: number): number {
  return serviceCount + 3; // service logs + services table + all logs + docker sessions
}

function getPageTitle(
  pageIndex: number,
  services: ServiceState[],
): { label: string; color: string } {
  if (pageIndex < services.length) {
    const svc = services[pageIndex];
    return {
      label: `LOGS ${dim("──")} ${chalk.hex(svc.definition.color).bold(svc.definition.name)}`,
      color: svc.definition.color,
    };
  }
  const extra = pageIndex - services.length;
  switch (extra) {
    case 0:
      return { label: `${brand("SERVICES")}`, color: "#EE4000" };
    case 1:
      return {
        label: `LOGS ${dim("──")} ${brand("All Services")}`,
        color: "#EE4000",
      };
    case 2:
      return { label: `${brand("DOCKER SESSIONS")}`, color: "#EE4000" };
    default:
      return { label: "Unknown", color: "#888888" };
  }
}

// ── Status indicators ────────────────────────────────────────

function statusIcon(status: string): string {
  switch (status) {
    case "running":
      return chalk.green("●");
    case "starting":
      return chalk.yellow("●");
    case "stopped":
      return chalk.gray("●");
    case "error":
      return chalk.red("●");
    case "pending":
      return chalk.dim("○");
    default:
      return chalk.dim("?");
  }
}

function statusText(status: string): string {
  switch (status) {
    case "running":
      return chalk.green("Running");
    case "starting":
      return chalk.yellow("Starting");
    case "stopped":
      return chalk.gray("Stopped");
    case "error":
      return chalk.red("Error");
    case "pending":
      return chalk.dim("Pending");
    default:
      return chalk.dim(status);
  }
}

// ── Uptime formatting ────────────────────────────────────────

function formatUptime(startedAt: number | null): string {
  if (!startedAt) return dim("--");

  const elapsed = Math.floor((Date.now() - startedAt) / 1000);

  if (elapsed < 60) return `${elapsed}s`;
  if (elapsed < 3600) {
    const m = Math.floor(elapsed / 60);
    const s = elapsed % 60;
    return `${m}m ${s}s`;
  }
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  return `${h}h ${m}m`;
}

// ── Horizontal service bar ───────────────────────────────────

function renderServiceBar(
  services: ServiceState[],
  activePage: number,
): string {
  const header = `${brandBold("ReArch")} ${dim(`(${gitSha})`)}`;
  const activeServiceIndex = activePage < services.length ? activePage : -1;
  const allServicesPage = activePage === services.length + 1;

  const serviceParts = services.map((svc, i) => {
    const icon = statusIcon(svc.status);
    const isActive = i === activeServiceIndex || allServicesPage;
    const name = isActive
      ? chalk.white.bold(svc.definition.name)
      : dim(svc.definition.name);
    return `${icon} ${name}`;
  });

  if (serviceParts.length === 0) {
    return `  ${header}`;
  }

  return `  ${header}      ${serviceParts.join("      ")}`;
}

// ── Page: Service logs ───────────────────────────────────────

function renderServiceLogPage(
  service: ServiceState,
  maxLines: number,
  termWidth: number,
): string[] {
  const lines: string[] = [];
  const logLines = service.logs.slice(-maxLines);

  if (logLines.length === 0) {
    lines.push(`  ${dim("No logs yet...")}`);
  } else {
    const maxWidth = termWidth - 4;
    for (const log of logLines) {
      const display =
        log.length > maxWidth ? log.slice(0, maxWidth - 1) + "…" : log;
      lines.push(`  ${display}`);
    }
  }

  return lines;
}

// ── Page: Services table ─────────────────────────────────────

function renderServicesTablePage(
  services: ServiceState[],
  termWidth: number,
): string[] {
  const lines: string[] = [];

  // Column widths
  const cols = {
    num: 4,
    name: 14,
    status: 14,
    runtime: 9,
    address: 20,
    pid: 8,
    uptime: 10,
  };

  const pad = (s: string, w: number) => {
    // Strip ANSI to measure visible length
    const visible = s.replace(/\x1b\[[0-9;]*m/g, "");
    const padding = Math.max(0, w - visible.length);
    return s + " ".repeat(padding);
  };

  // Header
  lines.push(
    `  ${dim(pad("#", cols.num))}${dim(pad("Service", cols.name))}${dim(pad("Status", cols.status))}${dim(pad("Runtime", cols.runtime))}${dim(pad("Address", cols.address))}${dim(pad("PID", cols.pid))}${dim("Uptime")}`,
  );
  lines.push(
    `  ${dim("─".repeat(Math.min(cols.num + cols.name + cols.status + cols.runtime + cols.address + cols.pid + cols.uptime, termWidth - 4)))}`,
  );

  services.forEach((svc, i) => {
    const num = dim(`${i + 1}`);
    const name = chalk.white(svc.definition.name);
    const status = `${statusIcon(svc.status)} ${statusText(svc.status)}`;
    const runtime = dim(svc.definition.runtime);
    const address = `localhost:${svc.definition.port}`;
    const pid = svc.pid ? dim(String(svc.pid)) : dim("--");
    const uptime = formatUptime(svc.startedAt);

    lines.push(
      `  ${pad(num, cols.num)}${pad(name, cols.name)}${pad(status, cols.status)}${pad(runtime, cols.runtime)}${pad(address, cols.address)}${pad(pid, cols.pid)}${uptime}`,
    );
  });

  return lines;
}

// ── Page: All logs ───────────────────────────────────────────

function renderAllLogsPage(
  combinedLogs: CombinedLogEntry[],
  maxLines: number,
  termWidth: number,
): string[] {
  const lines: string[] = [];
  const entries = combinedLogs.slice(-maxLines);

  if (entries.length === 0) {
    lines.push(`  ${dim("No logs yet...")}`);
  } else {
    const maxWidth = termWidth - 4;
    for (const entry of entries) {
      const tag = chalk.hex(entry.color)(`[${entry.service}]`);
      const content =
        entry.line.length > maxWidth - entry.service.length - 4
          ? entry.line.slice(0, maxWidth - entry.service.length - 5) + "…"
          : entry.line;
      lines.push(`  ${tag} ${content}`);
    }
  }

  return lines;
}

// ── Page: Docker sessions ────────────────────────────────────

function renderDockerSessionsPage(
  containers: DockerContainer[],
  termWidth: number,
): string[] {
  const lines: string[] = [];

  if (containers.length === 0) {
    lines.push(`  ${dim("No rearch_session_* containers found.")}`);
    lines.push("");
    lines.push(`  ${dim("Session containers appear when agents spawn")}`);
    lines.push(`  ${dim("sandboxed environments via ReArch.")}`);
    return lines;
  }

  const cols = { id: 14, name: 32, image: 24, status: 20 };

  const pad = (s: string, w: number) => {
    const visible = s.replace(/\x1b\[[0-9;]*m/g, "");
    const padding = Math.max(0, w - visible.length);
    return s + " ".repeat(padding);
  };

  // Header
  lines.push(
    `  ${dim(pad("ID", cols.id))}${dim(pad("Name", cols.name))}${dim(pad("Image", cols.image))}${dim("Status")}`,
  );
  lines.push(
    `  ${dim("─".repeat(Math.min(cols.id + cols.name + cols.image + cols.status, termWidth - 4)))}`,
  );

  for (const c of containers) {
    const id = dim(c.id.slice(0, 12));
    const name = chalk.white(c.name);
    const image = dim(c.image);
    const status = c.status.toLowerCase().includes("up")
      ? chalk.green(c.status)
      : chalk.yellow(c.status);

    lines.push(
      `  ${pad(id, cols.id)}${pad(name, cols.name)}${pad(image, cols.image)}${status}`,
    );
  }

  lines.push("");
  lines.push(
    `  ${dim(`${containers.length} container${containers.length === 1 ? "" : "s"} found`)}`,
  );

  return lines;
}

// ── Main render function ─────────────────────────────────────

export function renderDashboard(state: DashboardState): string {
  const termHeight = process.stdout.rows || 40;
  const termWidth = process.stdout.columns || 80;
  const sepWidth = Math.min(56, termWidth - 4);
  const totalPages = getTotalPages(state.services.length);

  const lines: string[] = [];

  // ── 1. Service bar at top ──────────────────────────────────
  lines.push(renderServiceBar(state.services, state.activePage));
  lines.push("");

  // ── 2. Page header ─────────────────────────────────────────
  const pageInfo = getPageTitle(state.activePage, state.services);
  lines.push(
    `  ${pageInfo.label} ${dim(`(${state.activePage + 1}/${totalPages})`)}`,
  );
  lines.push(`  ${dim("─".repeat(sepWidth))}`);

  // ── 3. Page content ────────────────────────────────────────
  // Available lines for content:
  // top: service bar (1) + blank (1) = 2
  // page header: title (1) + separator (1) = 2
  // footer: separator (1) + status message (0 or 1) + options (1) = 2-3
  const footerSize = state.statusMessage ? 3 : 2;
  const availableLines = Math.max(5, termHeight - 4 - footerSize);

  let contentLines: string[];

  if (state.activePage < state.services.length) {
    // Individual service log page
    contentLines = renderServiceLogPage(
      state.services[state.activePage],
      availableLines,
      termWidth,
    );
  } else {
    const extraPage = state.activePage - state.services.length;
    switch (extraPage) {
      case 0:
        contentLines = renderServicesTablePage(state.services, termWidth);
        break;
      case 1:
        contentLines = renderAllLogsPage(
          state.combinedLogs,
          availableLines,
          termWidth,
        );
        break;
      case 2:
        contentLines = renderDockerSessionsPage(
          state.dockerContainers,
          termWidth,
        );
        break;
      default:
        contentLines = [`  ${dim("Unknown page")}`];
    }
  }

  lines.push(...contentLines);

  // ── 4. Pad to push footer to very bottom ───────────────────
  // Reserve 1 extra line because log-update appends a trailing newline,
  // which would otherwise scroll the service bar off the top.
  const targetContentLines = termHeight - footerSize - 1;
  while (lines.length < targetContentLines) {
    lines.push("");
  }

  // ── 5. Footer pinned at bottom ─────────────────────────────
  lines.push(`  ${dim("─".repeat(sepWidth))}`);

  if (state.statusMessage) {
    lines.push(`  ${chalk.yellow(state.statusMessage)}`);
  }

  const keys = [
    `${brand("← →")} Switch page`,
    `${brand("r")} Restart all`,
    `${brand("q")} Quit`,
  ];

  if (state.restarting) {
    lines.push(`  ${chalk.yellow("⟳ Restarting all services...")}`);
  } else {
    lines.push(`  ${keys.join(dim("  │  "))}`);
  }

  return lines.join("\n");
}
