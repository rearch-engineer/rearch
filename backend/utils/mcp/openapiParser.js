/**
 * OpenAPI / Swagger spec parser.
 *
 * Normalizes a Swagger 2.0 or OpenAPI 3.x document into a flat list of
 * operations that can be presented to an admin for curation and later turned
 * into MCP tool descriptors.
 *
 * Scope is intentionally minimal: we extract operations, their parameters and
 * a (shallowly de-referenced) request body schema. We do NOT attempt full
 * JSON-Schema dereferencing — only local `#/components/...` / `#/definitions/...`
 * refs are resolved one level deep, which is enough to render an editable form.
 */

import YAML from "yaml";

// ─── Spec loading ─────────────────────────────────────────────────────────────

/**
 * Parse a raw spec string (JSON or YAML) into an object.
 * @param {string} raw
 * @returns {object}
 */
export function loadSpec(raw) {
  if (typeof raw !== "string") {
    throw new Error("Spec content must be a string");
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Spec is empty");
  }
  // Try JSON first (fast path), fall back to YAML.
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed);
    } catch (err) {
      throw new Error(`Invalid JSON spec: ${err.message}`);
    }
  }
  try {
    return YAML.parse(trimmed);
  } catch (err) {
    // Last resort: maybe it was JSON without leading brace whitespace handled.
    try {
      return JSON.parse(trimmed);
    } catch {
      throw new Error(`Invalid spec (not valid JSON or YAML): ${err.message}`);
    }
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "head", "options"];

function isOpenApi3(spec) {
  return typeof spec.openapi === "string" && spec.openapi.startsWith("3");
}

function isSwagger2(spec) {
  return spec.swagger === "2.0" || spec.swagger === 2;
}

/**
 * Resolve a single local $ref (one level). Returns the referenced node or the
 * input unchanged if it is not a resolvable local ref.
 */
function resolveRef(spec, node) {
  if (!node || typeof node !== "object" || typeof node.$ref !== "string") {
    return node;
  }
  const ref = node.$ref;
  if (!ref.startsWith("#/")) return node;
  const parts = ref.slice(2).split("/");
  let cur = spec;
  for (const part of parts) {
    if (cur == null) return node;
    cur = cur[decodeURIComponent(part.replace(/~1/g, "/").replace(/~0/g, "~"))];
  }
  return cur || node;
}

/**
 * Derive the default base URL from the spec.
 * OpenAPI 3.x: servers[0].url. Swagger 2.0: scheme + host + basePath.
 */
export function deriveBaseUrl(spec) {
  if (isOpenApi3(spec) && Array.isArray(spec.servers) && spec.servers.length > 0) {
    return spec.servers[0].url || "";
  }
  if (isSwagger2(spec)) {
    const scheme = Array.isArray(spec.schemes) && spec.schemes.length > 0 ? spec.schemes[0] : "https";
    const host = spec.host || "";
    const basePath = spec.basePath || "";
    if (host) return `${scheme}://${host}${basePath}`;
  }
  return "";
}

/**
 * Generate a safe MCP tool name from an operation.
 * Falls back to method + path when operationId is absent.
 */
function deriveToolName(op, method, path) {
  const base =
    op.operationId ||
    `${method}_${path}`
      .replace(/[{}]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  // Sanitize to the MCP/proxy-safe charset.
  return base.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 64) || `${method}_op`;
}

/**
 * Normalize a single parameter (handles both 2.0 and 3.x shapes).
 */
function normalizeParameter(spec, rawParam) {
  const param = resolveRef(spec, rawParam);
  if (!param || !param.name) return null;
  // OpenAPI 3.x puts type under `schema`; 2.0 has it inline.
  const schema = param.schema ? resolveRef(spec, param.schema) : param;
  return {
    name: param.name,
    in: param.in || "query",
    required: !!param.required || param.in === "path",
    type: (schema && schema.type) || "string",
    description: param.description || "",
  };
}

/**
 * Extract a request body JSON schema (OpenAPI 3.x) if present.
 */
function extractRequestBodySchema(spec, op) {
  if (!op.requestBody) return null;
  const body = resolveRef(spec, op.requestBody);
  const content = body && body.content;
  if (!content) return null;
  const json = content["application/json"] || content[Object.keys(content)[0]];
  if (!json || !json.schema) return null;
  return resolveRef(spec, json.schema);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Parse a raw spec string into a normalized, curation-ready result.
 *
 * @param {string} raw - raw spec content (JSON or YAML)
 * @returns {{
 *   info: { title: string, version: string },
 *   defaultBaseUrl: string,
 *   operations: Array<{
 *     operationId: string|undefined,
 *     method: string,
 *     path: string,
 *     summary: string,
 *     toolName: string,
 *     description: string,
 *     enabled: boolean,
 *     parameters: Array<object>,
 *     requestBodySchema: object|null,
 *   }>
 * }}
 */
export function parseOpenApiSpec(raw) {
  const spec = loadSpec(raw);

  if (!isOpenApi3(spec) && !isSwagger2(spec)) {
    throw new Error("Unsupported spec: expected OpenAPI 3.x or Swagger 2.0");
  }

  const paths = spec.paths || {};
  const operations = [];

  for (const [path, pathItemRaw] of Object.entries(paths)) {
    const pathItem = resolveRef(spec, pathItemRaw);
    if (!pathItem || typeof pathItem !== "object") continue;

    // Parameters declared at the path level apply to every operation.
    const pathLevelParams = Array.isArray(pathItem.parameters)
      ? pathItem.parameters.map((p) => normalizeParameter(spec, p)).filter(Boolean)
      : [];

    for (const method of HTTP_METHODS) {
      const op = pathItem[method];
      if (!op || typeof op !== "object") continue;

      const opParams = Array.isArray(op.parameters)
        ? op.parameters.map((p) => normalizeParameter(spec, p)).filter(Boolean)
        : [];

      // Merge path-level + operation-level params (operation wins on name+in).
      const byKey = new Map();
      for (const p of [...pathLevelParams, ...opParams]) {
        byKey.set(`${p.in}:${p.name}`, p);
      }
      const parameters = [...byKey.values()];

      operations.push({
        operationId: op.operationId,
        method: method.toUpperCase(),
        path,
        summary: op.summary || "",
        toolName: deriveToolName(op, method, path),
        description: op.description || op.summary || "",
        enabled: true,
        parameters,
        requestBodySchema: extractRequestBodySchema(spec, op),
      });
    }
  }

  return {
    info: {
      title: (spec.info && spec.info.title) || "",
      version: (spec.info && spec.info.version) || "",
    },
    defaultBaseUrl: deriveBaseUrl(spec),
    operations,
  };
}

export default { parseOpenApiSpec, loadSpec, deriveBaseUrl };
