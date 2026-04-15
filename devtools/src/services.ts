// services.ts — Service process management for the ReArch CLI

import { spawn, type Subprocess } from "bun";
import { existsSync, copyFileSync, mkdirSync, writeFileSync, readFileSync, unlinkSync, openSync } from "node:fs";
import { resolve, join } from "node:path";
import { isPortResponding } from "./ports.js";

// ── Types ────────────────────────────────────────────────────

export type ServiceType = "docker" | "local";

export interface ServiceDefinition {
  name: string;
  key: string; // lowercase key for CLI (e.g. "mcp-proxy")
  type: ServiceType;
  port: number;
  runtime: string;
  cmd?: string;
  cwd?: string;
  composeName?: string;
}

// ── Service definitions ──────────────────────────────────────

export const SERVICE_DEFINITIONS: ServiceDefinition[] = [
  {
    name: "Redis",
    key: "redis",
    type: "docker",
    port: 6379,
    runtime: "Docker",
    composeName: "redis",
  },
  {
    name: "MongoDB",
    key: "mongodb",
    type: "docker",
    port: 27017,
    runtime: "Docker",
    composeName: "mongodb",
  },
  {
    name: "MCP Proxy",
    key: "mcp-proxy",
    type: "local",
    port: 3100,
    runtime: "Bun",
    cmd: "bun",
    cwd: "mcp-proxy",
  },
  {
    name: "Backend",
    key: "backend",
    type: "local",
    port: 5000,
    runtime: "Bun",
    cmd: "bun",
    cwd: "backend",
  },
  {
    name: "Frontend",
    key: "frontend",
    type: "local",
    port: 4200,
    runtime: "Vite",
    cmd: "bun",
    cwd: "frontend",
  },
];

// ── Paths ────────────────────────────────────────────────────

export function getPaths(rootDir: string) {
  return {
    composeFile: join(rootDir, "docker-compose-dev.yml"),
    pidFile: join(rootDir, ".rearch-pids"),
    logsDir: join(rootDir, ".rearch-logs"),
  };
}

function ensureLogsDir(rootDir: string): void {
  const { logsDir } = getPaths(rootDir);
  if (!existsSync(logsDir)) {
    mkdirSync(logsDir, { recursive: true });
  }
}

// ── PID file management ──────────────────────────────────────

export function readPids(rootDir: string): Record<string, number> {
  const { pidFile } = getPaths(rootDir);
  try {
    return JSON.parse(readFileSync(pidFile, "utf-8"));
  } catch {
    return {};
  }
}

export function writePids(rootDir: string, pids: Record<string, number>): void {
  const { pidFile } = getPaths(rootDir);
  writeFileSync(pidFile, JSON.stringify(pids, null, 2));
}

export function removePidFile(rootDir: string): void {
  const { pidFile } = getPaths(rootDir);
  try { unlinkSync(pidFile); } catch { /* noop */ }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// ── Log file helpers ─────────────────────────────────────────

export function logFilePath(rootDir: string, key: string): string {
  return join(getPaths(rootDir).logsDir, `${key}.log`);
}



// ── Dependency installation ──────────────────────────────────

async function ensureDependencies(rootDir: string): Promise<void> {
  const locals = SERVICE_DEFINITIONS.filter(s => s.type === "local");
  const tasks = locals
    .filter(s => !existsSync(join(resolve(rootDir, s.cwd!), "node_modules")))
    .map(async (s) => {
      const cwd = resolve(rootDir, s.cwd!);
      console.log(`  Installing dependencies for ${s.name}...`);
      const proc = spawn({ cmd: ["bun", "install"], stdout: "pipe", stderr: "pipe", cwd });
      const code = await proc.exited;
      if (code !== 0) {
        console.log(`  Failed to install dependencies for ${s.name} (exit ${code})`);
      }
    });
  if (tasks.length > 0) await Promise.all(tasks);
}

function ensureBackendEnv(rootDir: string): void {
  const envFile = join(resolve(rootDir, "backend"), ".env");
  const envExample = join(resolve(rootDir, "backend"), ".env.example");
  if (!existsSync(envFile) && existsSync(envExample)) {
    copyFileSync(envExample, envFile);
    console.log("  Copied backend/.env.example -> backend/.env");
  }
}

// ── Start ────────────────────────────────────────────────────

export async function startServices(rootDir: string): Promise<void> {
  const { composeFile } = getPaths(rootDir);
  ensureLogsDir(rootDir);

  // Check if already running
  const existingPids = readPids(rootDir);
  const aliveServices = Object.entries(existingPids).filter(([, pid]) => isProcessAlive(pid));
  if (aliveServices.length > 0) {
    console.log("  Services already running:");
    for (const [key, pid] of aliveServices) {
      console.log(`    ${key} (PID ${pid})`);
    }
    console.log("\n  Run 'rearch stop' first, or 'rearch restart'.");
    process.exit(1);
  }

  // 1. Start docker infrastructure
  console.log("  Starting Docker infrastructure...");
  const dockerProc = spawn({
    cmd: ["docker", "compose", "-f", composeFile, "up", "--build", "-d"],
    stdout: "pipe",
    stderr: "pipe",
    cwd: rootDir,
  });
  const dockerExit = await dockerProc.exited;
  if (dockerExit !== 0) {
    const err = await new Response(dockerProc.stderr).text();
    console.log(`  Docker compose failed (exit ${dockerExit})`);
    if (err.trim()) console.log(`  ${err.trim()}`);
    process.exit(1);
  }
  console.log("  Docker infrastructure started (Redis, MongoDB)");

  // 2. Install deps + env setup
  ensureBackendEnv(rootDir);
  await ensureDependencies(rootDir);

  // 3. Start local services
  const pids: Record<string, number> = {};
  const locals = SERVICE_DEFINITIONS.filter(s => s.type === "local");

  for (const svc of locals) {
    const cwd = resolve(rootDir, svc.cwd!);
    const logFile = logFilePath(rootDir, svc.key);

    // Open log file as a file descriptor so the OS handles redirection
    // directly — this survives the parent CLI process exiting.
    const logFd = openSync(logFile, "w");

    const proc = spawn({
      cmd: [svc.cmd!, "run", "dev"],
      stdout: logFd,
      stderr: logFd,
      cwd,
      detached: true,
      env: { ...process.env, FORCE_COLOR: "0" },
    });

    pids[svc.key] = proc.pid; // PID == PGID for the group leader

    console.log(`  Started ${svc.name} (PGID ${proc.pid})`);
  }

  writePids(rootDir, pids);

  // 4. Wait for services to be ready
  console.log("\n  Waiting for services to be ready...");
  const allServices = SERVICE_DEFINITIONS;
  const ready = new Set<string>();
  const timeout = Date.now() + 60_000;

  while (ready.size < allServices.length && Date.now() < timeout) {
    for (const svc of allServices) {
      if (ready.has(svc.key)) continue;
      if (await isPortResponding(svc.port)) {
        ready.add(svc.key);
        console.log(`  [ok] ${svc.name} ready on :${svc.port}`);
      }
    }
    if (ready.size < allServices.length) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  const notReady = allServices.filter(s => !ready.has(s.key));
  if (notReady.length > 0) {
    console.log("");
    for (const svc of notReady) {
      console.log(`  [!!] ${svc.name} not responding on :${svc.port}`);
    }
  }

  console.log("\n  All services started. Use 'rearch logs' to tail output.");
}

// ── Stop ─────────────────────────────────────────────────────

export async function stopServices(rootDir: string): Promise<void> {
  const { composeFile } = getPaths(rootDir);

  // 1. Kill local services
  const pids = readPids(rootDir);
  const pidEntries = Object.entries(pids);
  if (pidEntries.length > 0) {
    for (const [key, pid] of pidEntries) {
      if (isProcessAlive(pid)) {
        try {
          process.kill(-pid, "SIGTERM"); // kill entire process group
          console.log(`  Stopped ${key} (PGID ${pid})`);
        } catch {
          console.log(`  Could not stop ${key} (PID ${pid})`);
        }
      }
    }
    removePidFile(rootDir);
  } else {
    console.log("  No local services running.");
  }

  // 2. Stop docker compose
  console.log("  Stopping Docker infrastructure...");
  const proc = spawn({
    cmd: ["docker", "compose", "-f", composeFile, "down"],
    stdout: "pipe",
    stderr: "pipe",
    cwd: rootDir,
  });
  await proc.exited;
  console.log("  Docker infrastructure stopped.");

  // 3. Stop session containers
  await stopSessionContainers();
}

async function stopSessionContainers(): Promise<void> {
  try {
    const listProc = spawn({
      cmd: ["docker", "ps", "-q", "--filter", "name=rearch_session_"],
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = await new Response(listProc.stdout).text();
    await listProc.exited;

    const ids = output.trim().split("\n").filter(Boolean);
    if (ids.length === 0) return;

    console.log(`  Stopping ${ids.length} session container(s)...`);
    const stopProc = spawn({ cmd: ["docker", "stop", ...ids], stdout: "pipe", stderr: "pipe" });
    await stopProc.exited;
    const rmProc = spawn({ cmd: ["docker", "rm", "-f", ...ids], stdout: "pipe", stderr: "pipe" });
    await rmProc.exited;
    console.log("  Session containers stopped.");
  } catch {
    // best effort
  }
}

// ── Restart ──────────────────────────────────────────────────

export async function restartService(rootDir: string, serviceKey?: string): Promise<void> {
  if (!serviceKey) {
    // Full restart
    await stopServices(rootDir);
    await startServices(rootDir);
    return;
  }

  const svc = SERVICE_DEFINITIONS.find(s => s.key === serviceKey);
  if (!svc) {
    console.log(`  Unknown service: ${serviceKey}`);
    console.log(`  Available: ${SERVICE_DEFINITIONS.map(s => s.key).join(", ")}`);
    process.exit(1);
  }

  if (svc.type === "docker") {
    const { composeFile } = getPaths(rootDir);
    console.log(`  Restarting ${svc.name}...`);
    const proc = spawn({
      cmd: ["docker", "compose", "-f", composeFile, "restart", svc.composeName!],
      stdout: "pipe",
      stderr: "pipe",
      cwd: rootDir,
    });
    await proc.exited;
    console.log(`  ${svc.name} restarted.`);
    return;
  }

  // Local service restart
  const pids = readPids(rootDir);
  const pid = pids[svc.key];
  if (pid && isProcessAlive(pid)) {
    process.kill(-pid, "SIGTERM"); // kill entire process group
    await new Promise(r => setTimeout(r, 500));
    console.log(`  Stopped ${svc.name} (PGID ${pid})`);
  }

  ensureLogsDir(rootDir);
  const cwd = resolve(rootDir, svc.cwd!);
  const logFile = logFilePath(rootDir, svc.key);
  const logFd = openSync(logFile, "w");

  const proc = spawn({
    cmd: [svc.cmd!, "run", "dev"],
    stdout: logFd,
    stderr: logFd,
    cwd,
    detached: true,
    env: { ...process.env, FORCE_COLOR: "0" },
  });

  pids[svc.key] = proc.pid;
  writePids(rootDir, pids);

  console.log(`  Started ${svc.name} (PID ${proc.pid})`);

  // Wait for it
  const timeout = Date.now() + 30_000;
  while (Date.now() < timeout) {
    if (await isPortResponding(svc.port)) {
      console.log(`  [ok] ${svc.name} ready on :${svc.port}`);
      return;
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  console.log(`  [!!] ${svc.name} not responding on :${svc.port}`);
}

// ── Status ───────────────────────────────────────────────────

interface PsRow {
  id: string;
  name: string;
  type: string;
  command: string;
  created: string;
  status: string;
  ports: string;
}

async function getDockerContainerInfo(composeName: string, composeFile: string, rootDir: string): Promise<{ id: string; status: string; created: string } | null> {
  try {
    const proc = spawn({
      cmd: [
        "docker", "compose", "-f", composeFile, "ps", "--format",
        "{{.ID}}\t{{.Status}}\t{{.CreatedAt}}",
        composeName,
      ],
      stdout: "pipe",
      stderr: "pipe",
      cwd: rootDir,
    });
    const output = await new Response(proc.stdout).text();
    await proc.exited;
    const line = output.trim().split("\n").filter(Boolean)[0];
    if (!line) return null;
    const [id, status, created] = line.split("\t");
    return { id: id?.slice(0, 12) || "", status: status || "", created: created || "" };
  } catch {
    return null;
  }
}

function formatCreated(created: string): string {
  if (!created) return "";
  try {
    // Docker outputs "2026-04-14 20:32:35 +0200 CEST" — strip trailing tz name
    const cleaned = created.replace(/\s+[A-Z]{2,5}$/, "");
    const date = new Date(cleaned);
    if (isNaN(date.getTime())) return created;
    const diff = Date.now() - date.getTime();
    const secs = Math.floor(diff / 1000);
    if (secs < 60) return `${secs} seconds ago`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins} minutes ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} hours ago`;
    const days = Math.floor(hours / 24);
    return `${days} days ago`;
  } catch {
    return created;
  }
}

async function formatPidCreated(pid: number): Promise<string> {
  try {
    const proc = spawn({
      cmd: ["ps", "-o", "lstart=", "-p", String(pid)],
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = (await new Response(proc.stdout).text()).trim();
    await proc.exited;
    if (!output) return "";
    return formatCreated(output);
  } catch {
    return "";
  }
}

export async function showStatus(rootDir: string): Promise<void> {
  const pids = readPids(rootDir);
  const { composeFile, pidFile } = getPaths(rootDir);

  // Get PID file mtime for "created" of local services
  let pidFileCreated = "";
  try {
    const stat = Bun.file(pidFile);
    // not reliable, skip
  } catch { /* noop */ }

  const rows: PsRow[] = [];

  // Docker services
  for (const svc of SERVICE_DEFINITIONS.filter(s => s.type === "docker")) {
    const info = await getDockerContainerInfo(svc.composeName!, composeFile, rootDir);
    const responding = await isPortResponding(svc.port);

    rows.push({
      id: info?.id || "",
      name: svc.name,
      type: "docker",
      command: `docker compose (${svc.composeName})`,
      created: info ? formatCreated(info.created) : "",
      status: info?.status || (responding ? "Up" : "Stopped"),
      ports: `0.0.0.0:${svc.port}`,
    });
  }

  // Local services
  for (const svc of SERVICE_DEFINITIONS.filter(s => s.type === "local")) {
    const pid = pids[svc.key];
    const alive = pid ? isProcessAlive(pid) : false;
    const responding = await isPortResponding(svc.port);

    const created = pid && alive ? await formatPidCreated(pid) : "";

    rows.push({
      id: pid && alive ? String(pid) : "",
      name: svc.name,
      type: "local",
      command: `bun run dev (${svc.cwd})`,
      created,
      status: responding ? "Up" : alive ? "Starting" : "Stopped",
      ports: responding || alive ? `0.0.0.0:${svc.port}` : "",
    });
  }

  // Session containers
  let sessionRows: PsRow[] = [];
  try {
    const listProc = spawn({
      cmd: [
        "docker", "ps", "-a",
        "--filter", "name=rearch_session_",
        "--format", "{{.ID}}\t{{.Names}}\t{{.Command}}\t{{.CreatedAt}}\t{{.Status}}\t{{.Ports}}",
      ],
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = await new Response(listProc.stdout).text();
    await listProc.exited;

    for (const line of output.trim().split("\n").filter(Boolean)) {
      const [id, name, command, created, status, ports] = line.split("\t");
      sessionRows.push({
        id: (id || "").slice(0, 12),
        name: (name || "").replace("rearch_session_", "session:"),
        type: "session",
        command: command || "",
        created: formatCreated(created || ""),
        status: status || "",
        ports: ports || "",
      });
    }
  } catch {
    // no docker
  }

  const allRows = [...rows, ...sessionRows];

  // Calculate column widths
  const cols = {
    id:      Math.max(12, ...allRows.map(r => r.id.length)),
    name:    Math.max(7,  ...allRows.map(r => r.name.length)),
    command: Math.max(7,  ...allRows.map(r => r.command.length)),
    created: Math.max(7,  ...allRows.map(r => r.created.length)),
    status:  Math.max(6,  ...allRows.map(r => r.status.length)),
    ports:   Math.max(5,  ...allRows.map(r => r.ports.length)),
  };

  const header = [
    "ID".padEnd(cols.id + 3),
    "NAME".padEnd(cols.name + 3),
    "COMMAND".padEnd(cols.command + 3),
    "CREATED".padEnd(cols.created + 3),
    "STATUS".padEnd(cols.status + 3),
    "PORTS",
  ].join("");

  console.log(header);

  for (const row of allRows) {
    const line = [
      row.id.padEnd(cols.id + 3),
      row.name.padEnd(cols.name + 3),
      row.command.padEnd(cols.command + 3),
      row.created.padEnd(cols.created + 3),
      row.status.padEnd(cols.status + 3),
      row.ports,
    ].join("");
    console.log(line);
  }
}

// ── Logs ─────────────────────────────────────────────────────

export async function tailLogs(rootDir: string, filter?: string): Promise<void> {
  const { composeFile } = getPaths(rootDir);
  const processes: Subprocess[] = [];

  const cleanup = () => {
    for (const p of processes) {
      try { p.kill(); } catch { /* noop */ }
    }
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  // Determine what to tail
  const wantSessions = !filter || filter === "sessions";
  const wantDocker = SERVICE_DEFINITIONS.filter(s => s.type === "docker" && (!filter || filter === s.key));
  const wantLocal = SERVICE_DEFINITIONS.filter(s => s.type === "local" && (!filter || filter === s.key));

  // Validate filter
  if (filter && filter !== "sessions") {
    const valid = SERVICE_DEFINITIONS.find(s => s.key === filter);
    if (!valid) {
      console.log(`  Unknown service: ${filter}`);
      console.log(`  Available: ${SERVICE_DEFINITIONS.map(s => s.key).join(", ")}, sessions`);
      process.exit(1);
    }
  }

  // Tail docker service logs
  for (const svc of wantDocker) {
    const proc = spawn({
      cmd: ["docker", "compose", "-f", composeFile, "logs", "--follow", "--tail", "50", "--no-log-prefix", svc.composeName!],
      stdout: "pipe",
      stderr: "pipe",
      cwd: rootDir,
    });
    processes.push(proc);
    prefixStream(proc.stdout, svc.key);
    prefixStream(proc.stderr, svc.key);
  }

  // Tail local service log files
  for (const svc of wantLocal) {
    const logFile = logFilePath(rootDir, svc.key);
    if (!existsSync(logFile)) {
      writeFileSync(logFile, "");
    }
    const proc = spawn({
      cmd: ["tail", "-n", "50", "-f", logFile],
      stdout: "pipe",
      stderr: "pipe",
    });
    processes.push(proc);
    prefixStream(proc.stdout, svc.key);
  }

  // Tail session container logs
  if (wantSessions && !filter) {
    // Periodically check for new session containers and tail them
    const tailedSessions = new Set<string>();
    const pollSessions = async () => {
      while (true) {
        try {
          const listProc = spawn({
            cmd: ["docker", "ps", "-q", "--filter", "name=rearch_session_"],
            stdout: "pipe",
            stderr: "pipe",
          });
          const output = await new Response(listProc.stdout).text();
          await listProc.exited;

          for (const id of output.trim().split("\n").filter(Boolean)) {
            if (tailedSessions.has(id)) continue;
            tailedSessions.add(id);

            // Get container name
            const nameProc = spawn({
              cmd: ["docker", "inspect", "--format", "{{.Name}}", id],
              stdout: "pipe",
              stderr: "pipe",
            });
            const name = (await new Response(nameProc.stdout).text()).trim().replace(/^\//, "");
            await nameProc.exited;

            const logProc = spawn({
              cmd: ["docker", "logs", "--follow", "--tail", "20", id],
              stdout: "pipe",
              stderr: "pipe",
            });
            processes.push(logProc);
            const label = name.replace("rearch_session_", "session:");
            prefixStream(logProc.stdout, label);
            prefixStream(logProc.stderr, label);
          }
        } catch {
          // best effort
        }
        await new Promise(r => setTimeout(r, 5000));
      }
    };
    pollSessions();
  }

  if (filter === "sessions") {
    // Only tail sessions
    const tailedSessions = new Set<string>();
    const pollSessions = async () => {
      while (true) {
        try {
          const listProc = spawn({
            cmd: ["docker", "ps", "-q", "--filter", "name=rearch_session_"],
            stdout: "pipe",
            stderr: "pipe",
          });
          const output = await new Response(listProc.stdout).text();
          await listProc.exited;

          for (const id of output.trim().split("\n").filter(Boolean)) {
            if (tailedSessions.has(id)) continue;
            tailedSessions.add(id);

            const nameProc = spawn({
              cmd: ["docker", "inspect", "--format", "{{.Name}}", id],
              stdout: "pipe",
              stderr: "pipe",
            });
            const name = (await new Response(nameProc.stdout).text()).trim().replace(/^\//, "");
            await nameProc.exited;

            const logProc = spawn({
              cmd: ["docker", "logs", "--follow", "--tail", "20", id],
              stdout: "pipe",
              stderr: "pipe",
            });
            processes.push(logProc);
            const label = name.replace("rearch_session_", "session:");
            prefixStream(logProc.stdout, label);
            prefixStream(logProc.stderr, label);
          }
        } catch {
          // best effort
        }
        await new Promise(r => setTimeout(r, 5000));
      }
    };
    pollSessions();
  }

  // Keep alive
  await new Promise(() => {});
}

function prefixStream(stream: ReadableStream<Uint8Array> | null, prefix: string): void {
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
          if (trimmed) console.log(`[${prefix}] ${trimmed}`);
        }
      }
      if (buffer.trim()) console.log(`[${prefix}] ${buffer.trimEnd()}`);
    } catch {
      // stream closed
    }
  };
  read();
}
