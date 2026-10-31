/**
 * Repository file access inside a conversation container.
 *
 * Backs the "Files" panel of the chat sidebar: directory listing, file read
 * and file write for the agent's working directory (/repository). Reads and
 * listings go through `docker exec` as the `coder` user; writes upload a
 * single-file tar archive through the Docker API so arbitrary sizes work
 * without an interactive exec session.
 */
import Docker from "dockerode";
import path from "path";
import { execInContainer } from "./containerExec.js";

const docker = new Docker();

export const REPOSITORY_ROOT = "/repository";
export const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MiB
const BINARY_SNIFF_BYTES = 8192;
const USTAR_NAME_MAX = 100;

function fileError(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

/**
 * Resolve a user-supplied path (relative to the repository root) to an
 * absolute path inside the container. `..` segments cannot escape the root.
 * @param {string} relative
 * @returns {string} absolute path inside the container
 */
export function resolveRepoPath(relative = "") {
  const raw = String(relative ?? "");
  if (raw.includes("\0")) throw fileError("Invalid path", 400);
  // A leading slash makes normalize() drop any ".." that would climb above root.
  const normalized = path.posix.normalize("/" + raw);
  const abs = normalized === "/" ? REPOSITORY_ROOT : path.posix.join(REPOSITORY_ROOT, normalized);
  if (abs !== REPOSITORY_ROOT && !abs.startsWith(REPOSITORY_ROOT + "/")) {
    throw fileError("Invalid path", 400);
  }
  return abs;
}

function toRelative(abs) {
  return abs === REPOSITORY_ROOT ? "" : abs.slice(REPOSITORY_ROOT.length + 1);
}

/**
 * List the entries of a directory in the repository.
 * @returns {Promise<Array<{name: string, path: string, type: "dir"|"file", size: number, symlink?: boolean}>>}
 */
export async function listDirectory(containerId, relative = "") {
  const abs = resolveRepoPath(relative);
  const result = await execInContainer(containerId, [
    "find", abs, "-mindepth", "1", "-maxdepth", "1", "-printf", "%y\\t%Y\\t%s\\t%f\\n",
  ]);
  if (result.exitCode !== 0) {
    if (/No such file/i.test(result.stderr)) throw fileError("Directory not found", 404);
    if (/Not a directory/i.test(result.stderr)) throw fileError("Not a directory", 400);
    throw fileError(result.stderr || "Failed to list directory", 500);
  }

  const entries = [];
  for (const line of result.stdout.split("\n")) {
    if (!line) continue;
    const [type, targetType, size, ...rest] = line.split("\t");
    const name = rest.join("\t");
    if (!name || name === ".git") continue;
    const effective = type === "l" ? targetType : type;
    entries.push({
      name,
      path: toRelative(path.posix.join(abs, name)),
      type: effective === "d" ? "dir" : "file",
      size: parseInt(size, 10) || 0,
      ...(type === "l" ? { symlink: true } : {}),
    });
  }

  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
  return entries;
}

/**
 * Read a text file from the repository.
 * @returns {Promise<{path: string, size: number, binary: boolean, content?: string}>}
 */
export async function readFile(containerId, relative) {
  const abs = resolveRepoPath(relative);
  if (abs === REPOSITORY_ROOT) throw fileError("Path is a directory", 400);

  const stat = await execInContainer(containerId, ["stat", "--printf", "%F\\n%s", abs]);
  if (stat.exitCode !== 0) {
    if (/No such file/i.test(stat.stderr)) throw fileError("File not found", 404);
    throw fileError(stat.stderr || "Failed to stat file", 500);
  }
  const [kind, sizeStr] = stat.stdout.split("\n");
  const size = parseInt(sizeStr, 10) || 0;
  if (kind !== "regular file" && kind !== "regular empty file") {
    throw fileError("Not a regular file", 400);
  }
  if (size > MAX_FILE_SIZE) throw fileError("File is too large to open", 413);

  // base64 keeps the bytes intact through the exec stream (which trims output)
  const encoded = await execInContainer(containerId, ["base64", "-w0", abs], { timeout: 60000 });
  if (encoded.exitCode !== 0) throw fileError(encoded.stderr || "Failed to read file", 500);
  const buf = Buffer.from(encoded.stdout, "base64");

  const sniff = buf.subarray(0, BINARY_SNIFF_BYTES);
  if (sniff.includes(0)) return { path: toRelative(abs), size, binary: true };

  return { path: toRelative(abs), size, binary: false, content: buf.toString("utf8") };
}

/**
 * Build a minimal ustar archive holding one regular file.
 */
function tarSingleFile(name, content, { mode, uid, gid }) {
  if (Buffer.byteLength(name) > USTAR_NAME_MAX) throw fileError("File name is too long", 400);
  const header = Buffer.alloc(512, 0);
  const octal = (n, len) => n.toString(8).padStart(len - 1, "0") + "\0";
  header.write(name, 0, USTAR_NAME_MAX, "utf8");
  header.write(octal(mode, 8), 100, 8, "ascii");
  header.write(octal(uid, 8), 108, 8, "ascii");
  header.write(octal(gid, 8), 116, 8, "ascii");
  header.write(octal(content.length, 12), 124, 12, "ascii");
  header.write(octal(Math.floor(Date.now() / 1000), 12), 136, 12, "ascii");
  header.write("        ", 148, 8, "ascii"); // checksum placeholder (spaces)
  header.write("0", 156, 1, "ascii"); // regular file
  header.write("ustar\0", 257, 6, "ascii");
  header.write("00", 263, 2, "ascii");
  let sum = 0;
  for (const b of header) sum += b;
  header.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, 8, "ascii");
  const pad = (512 - (content.length % 512)) % 512;
  return Buffer.concat([header, content, Buffer.alloc(pad), Buffer.alloc(1024)]);
}

/**
 * Write (create or overwrite) a text file in the repository. Keeps the
 * existing file mode and gives new files to the `coder` user.
 * @returns {Promise<{path: string, size: number}>}
 */
export async function writeFile(containerId, relative, content) {
  const abs = resolveRepoPath(relative);
  if (abs === REPOSITORY_ROOT) throw fileError("Path is a directory", 400);
  const data = Buffer.from(String(content ?? ""), "utf8");
  if (data.length > MAX_FILE_SIZE) throw fileError("File is too large to save", 413);

  const dir = path.posix.dirname(abs);
  const name = path.posix.basename(abs);

  // One exec (as coder) to validate the target and collect uid/gid/mode.
  const probe = await execInContainer(containerId, [
    "sh", "-c",
    '[ -d "$1" ] || { echo NODIR >&2; exit 2; }; ' +
      'if [ -e "$2" ] && [ ! -f "$2" ]; then echo NOTFILE >&2; exit 3; fi; ' +
      'id -u; id -g; if [ -f "$2" ]; then stat -c %a "$2"; else echo 644; fi',
    "sh", dir, abs,
  ]);
  if (probe.exitCode === 2) throw fileError("Parent directory not found", 404);
  if (probe.exitCode === 3) throw fileError("Not a regular file", 400);
  if (probe.exitCode !== 0) throw fileError(probe.stderr || "Failed to prepare write", 500);
  const [uidStr, gidStr, modeStr] = probe.stdout.split("\n");
  const uid = parseInt(uidStr, 10) || 0;
  const gid = parseInt(gidStr, 10) || 0;
  const mode = parseInt(modeStr, 8) || 0o644;

  const archive = tarSingleFile(name, data, { mode, uid, gid });
  await docker.getContainer(containerId).putArchive(archive, { path: dir });

  return { path: toRelative(abs), size: data.length };
}
