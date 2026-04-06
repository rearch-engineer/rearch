// ──────────────────────────────────────────────────────────────
// services.ts — Service process management, log buffering,
//               health monitoring for the ReArch dev TUI
// ──────────────────────────────────────────────────────────────

import { spawn, type Subprocess } from "bun";
import { resolve, join } from "node:path";
import { isPortResponding } from "./ports.js";
import type {
  CombinedLogEntry,
  DockerContainer,
  ServiceDefinition,
  ServiceState,
  ServiceStatus,
} from "./types.js";

const MAX_LOG_LINES = 300;
const HEALTH_CHECK_INTERVAL = 2000;

// ── Service definitions ──────────────────────────────────────

export const SERVICE_DEFINITIONS: ServiceDefinition[] = [
  {
    name: "Redis",
    type: "docker",
    port: 6379,
    runtime: "Docker",
    composeName: "redis",
    color: "#F44336",
  },
  {
    name: "MongoDB",
    type: "docker",
    port: 27017,
    runtime: "Docker",
    composeName: "mongodb",
    color: "#4CAF50",
  },
  {
    name: "MCP Proxy",
    type: "local",
    port: 3100,
    runtime: "Bun",
    cmd: "bun",
    cwd: "mcp-proxy",
    color: "#2196F3",
  },
  {
    name: "Backend",
    type: "local",
    port: 5000,
    runtime: "Bun",
    cmd: "bun",
    cwd: "backend",
    color: "#FF9800",
  },
  {
    name: "Frontend",
    type: "local",
    port: 4200,
    runtime: "Vite",
    cmd: "bun",
    cwd: "frontend",
    color: "#9C27B0",
  },
];

// ── Service Manager ──────────────────────────────────────────

export class ServiceManager {
  private rootDir: string;
  private composeFile: string;
  private states: ServiceState[];
  private processes: Map<string, Subprocess> = new Map();
  private healthTimer: ReturnType<typeof setInterval> | null = null;
  private logReaders: Map<string, AbortController> = new Map();
  private combinedLogs: CombinedLogEntry[] = [];

  constructor(rootDir: string) {
    this.rootDir = rootDir;
    this.composeFile = join(rootDir, "docker-compose-dev.yml");
    this.states = SERVICE_DEFINITIONS.map((def) => ({
      definition: def,
      status: "pending" as ServiceStatus,
      pid: null,
      startedAt: null,
      exitCode: null,
      logs: [],
    }));
  }

  getStates(): ServiceState[] {
    return this.states;
  }

  private getState(name: string): ServiceState {
    return this.states.find((s) => s.definition.name === name)!;
  }

  private appendLog(name: string, line: string): void {
    const state = this.getState(name);
    state.logs.push(line);
    if (state.logs.length > MAX_LOG_LINES) {
      state.logs = state.logs.slice(-MAX_LOG_LINES);
    }
    // Also push to combined chronological buffer
    this.combinedLogs.push({
      service: name,
      color: state.definition.color,
      line,
    });
    if (this.combinedLogs.length > MAX_LOG_LINES * 2) {
      this.combinedLogs = this.combinedLogs.slice(-MAX_LOG_LINES);
    }
  }

  getCombinedLogs(): CombinedLogEntry[] {
    return this.combinedLogs;
  }

  async refreshDockerContainers(): Promise<DockerContainer[]> {
    try {
      const proc = spawn({
        cmd: [
          "docker",
          "ps",
          "-a",
          "--filter",
          "name=rearch_session_",
          "--format",
          "{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}\t{{.CreatedAt}}",
        ],
        stdout: "pipe",
        stderr: "pipe",
      });

      const output = await new Response(proc.stdout).text();
      await proc.exited;

      return output
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((row) => {
          const [id, name, image, status, ports, created] = row.split("\t");
          return {
            id: id || "",
            name: name || "",
            image: image || "",
            status: status || "",
            ports: ports || "",
            created: created || "",
          };
        });
    } catch {
      return [];
    }
  }

  // ── Docker services ──────────────────────────────────────

  async startDockerServices(): Promise<void> {
    const dockerServices = this.states.filter(
      (s) => s.definition.type === "docker"
    );
    for (const svc of dockerServices) {
      svc.status = "starting";
      this.appendLog(svc.definition.name, "Starting Docker container...");
    }

    try {
      const proc = spawn({
        cmd: [
          "docker",
          "compose",
          "-f",
          this.composeFile,
          "up",
          "--build",
          "-d",
        ],
        stdout: "pipe",
        stderr: "pipe",
        cwd: this.rootDir,
      });

      // Capture docker compose output
      this.readStream(proc.stdout, (line) => {
        for (const svc of dockerServices) {
          this.appendLog(svc.definition.name, line);
        }
      });
      this.readStream(proc.stderr, (line) => {
        for (const svc of dockerServices) {
          this.appendLog(svc.definition.name, line);
        }
      });

      const exitCode = await proc.exited;

      if (exitCode === 0) {
        for (const svc of dockerServices) {
          svc.status = "running";
          svc.startedAt = Date.now();
          this.appendLog(svc.definition.name, "Container started.");
        }
        // Start tailing docker logs
        this.tailDockerLogs();
      } else {
        for (const svc of dockerServices) {
          svc.status = "error";
          svc.exitCode = exitCode;
          this.appendLog(
            svc.definition.name,
            `Docker compose failed with exit code ${exitCode}`
          );
        }
      }
    } catch (err) {
      for (const svc of dockerServices) {
        svc.status = "error";
        this.appendLog(
          svc.definition.name,
          `Failed to start: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

  private tailDockerLogs(): void {
    const dockerServices = this.states.filter(
      (s) => s.definition.type === "docker"
    );

    for (const svc of dockerServices) {
      const composeName = svc.definition.composeName;
      if (!composeName) continue;

      const controller = new AbortController();
      this.logReaders.set(svc.definition.name, controller);

      try {
        const proc = spawn({
          cmd: [
            "docker",
            "compose",
            "-f",
            this.composeFile,
            "logs",
            "--follow",
            "--tail",
            "20",
            "--no-log-prefix",
            composeName,
          ],
          stdout: "pipe",
          stderr: "pipe",
          cwd: this.rootDir,
        });

        this.readStream(proc.stdout, (line) => {
          this.appendLog(svc.definition.name, line);
        });
        this.readStream(proc.stderr, (line) => {
          this.appendLog(svc.definition.name, line);
        });

        // Store process so we can kill it on shutdown
        this.processes.set(`docker-logs-${composeName}`, proc);
      } catch {
        // Non-critical — logs just won't tail
      }
    }
  }

  // ── Local services ───────────────────────────────────────

  async startLocalServices(): Promise<void> {
    const localServices = this.states.filter(
      (s) => s.definition.type === "local"
    );

    for (const svc of localServices) {
      this.startLocalService(svc);
    }
  }

  private startLocalService(svc: ServiceState): void {
    const def = svc.definition;
    const cwd = resolve(this.rootDir, def.cwd!);

    svc.status = "starting";
    svc.exitCode = null;
    this.appendLog(def.name, `Starting ${def.runtime} service...`);

    try {
      const proc = spawn({
        cmd: [def.cmd!, "run", "dev"],
        stdout: "pipe",
        stderr: "pipe",
        cwd,
        env: { ...process.env, FORCE_COLOR: "1" },
      });

      svc.pid = proc.pid;
      svc.startedAt = Date.now();
      this.processes.set(def.name, proc);

      this.appendLog(def.name, `Process started (PID ${proc.pid})`);

      // Read stdout
      this.readStream(proc.stdout, (line) => {
        this.appendLog(def.name, line);
      });

      // Read stderr
      this.readStream(proc.stderr, (line) => {
        this.appendLog(def.name, line);
      });

      // Monitor exit
      proc.exited.then((code: number) => {
        svc.exitCode = code;
        if (svc.status !== "stopped") {
          svc.status = code === 0 ? "stopped" : "error";
          this.appendLog(
            def.name,
            `Process exited with code ${code}`
          );
        }
        svc.pid = null;
        this.processes.delete(def.name);
      });
    } catch (err) {
      svc.status = "error";
      this.appendLog(
        def.name,
        `Failed to start: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // ── Health checking ──────────────────────────────────────

  startHealthChecks(): void {
    this.healthTimer = setInterval(async () => {
      for (const svc of this.states) {
        if (svc.status === "starting" || svc.status === "running") {
          const responding = await isPortResponding(svc.definition.port);
          if (responding && svc.status === "starting") {
            svc.status = "running";
            this.appendLog(
              svc.definition.name,
              `Service is ready on port ${svc.definition.port}`
            );
          } else if (!responding && svc.status === "running") {
            // Only mark as error if the process is also gone (for local services)
            if (
              svc.definition.type === "local" &&
              !this.processes.has(svc.definition.name)
            ) {
              svc.status = "error";
              this.appendLog(
                svc.definition.name,
                `Port ${svc.definition.port} stopped responding`
              );
            }
          }
        }
      }
    }, HEALTH_CHECK_INTERVAL);
  }

  stopHealthChecks(): void {
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }
  }

  // ── Restart all ──────────────────────────────────────────

  async restartAll(): Promise<void> {
    // Stop local services
    await this.stopLocalServices();

    // Restart docker
    try {
      const proc = spawn({
        cmd: [
          "docker",
          "compose",
          "-f",
          this.composeFile,
          "restart",
        ],
        stdout: "pipe",
        stderr: "pipe",
        cwd: this.rootDir,
      });
      await proc.exited;
    } catch {
      // Best-effort restart
    }

    // Reset docker service states
    for (const svc of this.states.filter(
      (s) => s.definition.type === "docker"
    )) {
      svc.status = "starting";
      svc.startedAt = Date.now();
      this.appendLog(svc.definition.name, "Restarting container...");
    }

    // Start local services again
    await this.startLocalServices();
  }

  // ── Shutdown ─────────────────────────────────────────────

  async stopLocalServices(): Promise<void> {
    const localServices = this.states.filter(
      (s) => s.definition.type === "local"
    );

    for (const svc of localServices) {
      const proc = this.processes.get(svc.definition.name);
      if (proc) {
        svc.status = "stopped";
        this.appendLog(svc.definition.name, "Stopping...");
        try {
          proc.kill();
        } catch {
          // Process may already be dead
        }
      }
    }

    // Kill docker log tailers
    for (const [key, proc] of this.processes.entries()) {
      if (key.startsWith("docker-logs-")) {
        try {
          proc.kill();
        } catch {
          // Best-effort
        }
      }
    }

    // Wait briefly for processes to exit
    await new Promise((r) => setTimeout(r, 500));
  }

  async shutdown(): Promise<void> {
    this.stopHealthChecks();

    // Stop local services
    await this.stopLocalServices();

    // Stop docker containers
    await this.shutdownDocker();
  }

  async shutdownDocker(): Promise<void> {
    try {
      const proc = spawn({
        cmd: [
          "docker",
          "compose",
          "-f",
          this.composeFile,
          "down",
        ],
        stdout: "pipe",
        stderr: "pipe",
        cwd: this.rootDir,
      });
      await proc.exited;
    } catch {
      // Best-effort shutdown
    }
  }

  // ── Helpers ──────────────────────────────────────────────

  private readStream(
    stream: ReadableStream<Uint8Array> | null,
    onLine: (line: string) => void
  ): void {
    if (!stream) return;

    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    const read = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trimEnd();
            if (trimmed) onLine(trimmed);
          }
        }

        // Flush remaining buffer
        if (buffer.trim()) {
          onLine(buffer.trimEnd());
        }
      } catch {
        // Stream closed — expected during shutdown
      }
    };

    read();
  }
}
