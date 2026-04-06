// ──────────────────────────────────────────────────────────────
// types.ts — Shared types for the ReArch development TUI
// ──────────────────────────────────────────────────────────────

export type ServiceStatus = "pending" | "starting" | "running" | "stopped" | "error";

export type ServiceType = "docker" | "local";

export interface ServiceDefinition {
  /** Display name shown in the dashboard */
  name: string;
  /** How this service is managed */
  type: ServiceType;
  /** Port the service listens on */
  port: number;
  /** Runtime label for the dashboard (e.g. "Docker", "Bun", "Vite") */
  runtime: string;
  /** Command to run (local services only) */
  cmd?: string;
  /** Working directory relative to project root (local services only) */
  cwd?: string;
  /** Docker compose service name (docker services only) */
  composeName?: string;
  /** Chalk color name for log prefixes */
  color: string;
}

export interface ServiceState {
  definition: ServiceDefinition;
  status: ServiceStatus;
  pid: number | null;
  startedAt: number | null;
  exitCode: number | null;
  logs: string[];
}

export interface CombinedLogEntry {
  service: string;
  color: string;
  line: string;
}

export interface DockerContainer {
  id: string;
  name: string;
  image: string;
  status: string;
  ports: string;
  created: string;
}

export interface DashboardState {
  services: ServiceState[];
  /** Currently active page index (0-based).
   *  Pages 0..N-1 = individual service logs,
   *  N = services table, N+1 = all logs, N+2 = docker sessions */
  activePage: number;
  /** Whether a restart-all is in progress */
  restarting: boolean;
  /** Message to show briefly (e.g. "Restarting...") */
  statusMessage: string | null;
  /** Combined log entries from all services (chronological) */
  combinedLogs: CombinedLogEntry[];
  /** Cached docker container info for rearch_session_* */
  dockerContainers: DockerContainer[];
}
