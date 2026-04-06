// ──────────────────────────────────────────────────────────────
// ports.ts — Cross-platform port availability checker
// ──────────────────────────────────────────────────────────────

import { createServer, Socket } from "node:net";

/**
 * Check if a port is available by attempting to listen on it.
 * Works on macOS, Linux, and Windows — no `lsof` dependency.
 */
export function checkPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();

    server.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        resolve(false);
      } else {
        // Other errors (permission, etc.) — treat as unavailable
        resolve(false);
      }
    });

    server.once("listening", () => {
      server.close(() => resolve(true));
    });

    server.listen(port, "127.0.0.1");
  });
}

/**
 * Check if a port is accepting connections (service is responding).
 * Used for health-checking running services.
 */
export function isPortResponding(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new Socket();
    const timeout = 500;

    socket.setTimeout(timeout);

    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });

    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });

    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });

    socket.connect(port, "127.0.0.1");
  });
}

/**
 * Check multiple ports and return a map of port → available.
 */
export async function checkPorts(
  ports: number[]
): Promise<Map<number, boolean>> {
  const results = await Promise.all(
    ports.map(async (port) => [port, await checkPort(port)] as const)
  );
  return new Map(results);
}
