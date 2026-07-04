/**
 * OpenAPI ("API Definition") MCP tools.
 *
 * An `openapi` MCP server is not a real upstream transport. It is a set of
 * admin-curated operation descriptors (stored on the McpServer document). This
 * module turns those descriptors into MCP tool definitions and executes the
 * underlying HTTP requests when an agent calls them.
 *
 * Auth/base URL: requests go to `cfg.baseUrl + path`, with `cfg.headers`
 * (e.g. an Authorization header) injected on every call.
 */

const REQUEST_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Tool building
// ---------------------------------------------------------------------------

/**
 * Build MCP tool definitions for an openapi server config.
 * @param {string} serverName
 * @param {object} cfg - { baseUrl, headers, operations: [...] }
 * @returns {Array<{ name: string, description: string, inputSchema: object, _operation: object }>}
 */
export function buildOpenApiTools(serverName, cfg) {
  const operations = Array.isArray(cfg?.operations) ? cfg.operations : [];
  const tools = [];

  for (const op of operations) {
    if (op.enabled === false) continue;
    if (!op.toolName || !op.method || !op.path) continue;

    tools.push({
      name: op.toolName,
      description: op.description || `${op.method} ${op.path}`,
      inputSchema: buildInputSchema(op),
      // Attach the operation so the manager can route without a second lookup.
      _operation: op,
    });
  }

  return tools;
}

/**
 * Synthesize a JSON-Schema input from an operation's parameters + request body.
 */
function buildInputSchema(op) {
  const properties = {};
  const required = [];

  for (const param of op.parameters || []) {
    properties[param.name] = {
      type: mapType(param.type),
      description: param.description || `${param.in} parameter`,
    };
    if (param.required) required.push(param.name);
  }

  if (op.requestBodySchema) {
    properties.body = {
      ...op.requestBodySchema,
      description:
        op.requestBodySchema.description || 'Request body (JSON).',
    };
    required.push('body');
  }

  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
}

function mapType(t) {
  const allowed = ['string', 'number', 'integer', 'boolean', 'array', 'object'];
  return allowed.includes(t) ? t : 'string';
}

// ---------------------------------------------------------------------------
// Tool execution
// ---------------------------------------------------------------------------

/**
 * Execute an openapi tool by performing the real HTTP request.
 * @param {object} cfg - server config ({ baseUrl, headers })
 * @param {object} operation - the curated operation descriptor
 * @param {object} args - arguments supplied by the agent
 * @returns {Promise<object>} MCP tool result
 */
export async function callOpenApiTool(cfg, operation, args) {
  const params = args || {};
  const baseUrl = (cfg.baseUrl || '').replace(/\/+$/, '');

  // Substitute path params and split the remaining params by location.
  let path = operation.path;
  const query = new URLSearchParams();
  const headers = { ...(cfg.headers || {}) };

  for (const param of operation.parameters || []) {
    const value = params[param.name];
    if (value === undefined || value === null) {
      if (param.required) {
        return errorResult(`Missing required parameter "${param.name}".`);
      }
      continue;
    }

    switch (param.in) {
      case 'path':
        path = path.replace(
          new RegExp(`\\{${escapeRegExp(param.name)}\\}`, 'g'),
          encodeURIComponent(String(value)),
        );
        break;
      case 'query':
        query.set(param.name, String(value));
        break;
      case 'header':
        headers[param.name] = String(value);
        break;
      // cookie params are uncommon for agent tools — ignored for now.
      default:
        break;
    }
  }

  const qs = query.toString();
  const url = `${baseUrl}${path}${qs ? `?${qs}` : ''}`;

  const init = {
    method: operation.method || 'GET',
    headers,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  };

  if (operation.requestBodySchema && params.body !== undefined) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    init.body =
      typeof params.body === 'string'
        ? params.body
        : JSON.stringify(params.body);
  }

  let response;
  try {
    response = await fetch(url, init);
  } catch (err) {
    return errorResult(`Request failed: ${err.message}`);
  }

  const text = await response.text();
  const summary = `HTTP ${response.status} ${response.statusText} — ${operation.method} ${url}`;

  return {
    content: [
      {
        type: 'text',
        text: `${summary}\n\n${text}`,
      },
    ],
    isError: !response.ok,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function errorResult(message) {
  return {
    content: [{ type: 'text', text: `Error: ${message}` }],
    isError: true,
  };
}

export default { buildOpenApiTools, callOpenApiTool };
