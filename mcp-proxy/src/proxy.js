/**
 * Core MCP JSON-RPC proxy handler.
 *
 * Accepts a raw Request, parses the JSON-RPC body, dispatches to the
 * appropriate handler, and returns a spec-compliant JSON-RPC 2.0 Response.
 */

const SERVER_INFO = {
  name: 'rearch-mcp-proxy',
  version: '1.0.0',
};

const CAPABILITIES = {
  tools: {},
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonrpcResult(id, result) {
  return Response.json(
    { jsonrpc: '2.0', id, result },
    { headers: { 'content-type': 'application/json' } },
  );
}

function jsonrpcError(id, code, message, data) {
  const body = { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
  if (data !== undefined) body.error.data = data;
  return Response.json(body, {
    status: code === -32600 ? 400 : 200,
    headers: { 'content-type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// Public handler
// ---------------------------------------------------------------------------

/**
 * @param {Request} request
 * @param {import('./upstream-manager.js').UpstreamManager} upstreamManager
 * @returns {Promise<Response>}
 */
export async function handleMcpRequest(request, upstreamManager) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonrpcError(null, -32700, 'Parse error: invalid JSON');
  }

  // Support batched requests
  if (Array.isArray(body)) {
    const responses = await Promise.all(
      body.map((req) => dispatch(req, upstreamManager)),
    );
    // Filter out null responses (notifications)
    const filtered = responses.filter(Boolean);
    if (filtered.length === 0) {
      return new Response(null, { status: 202 });
    }
    const results = await Promise.all(filtered.map((r) => r.json()));
    return Response.json(results, {
      headers: { 'content-type': 'application/json' },
    });
  }

  const response = await dispatch(body, upstreamManager);
  return response || new Response(null, { status: 202 });
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

async function dispatch(req, upstreamManager) {
  if (!req || typeof req !== 'object' || req.jsonrpc !== '2.0') {
    return jsonrpcError(req?.id ?? null, -32600, 'Invalid JSON-RPC 2.0 request');
  }

  const { id, method, params } = req;
  const isNotification = id === undefined || id === null;

  try {
    switch (method) {
      // -- Lifecycle --------------------------------------------------------
      case 'initialize':
        return jsonrpcResult(id, {
          protocolVersion: '2024-11-05',
          serverInfo: SERVER_INFO,
          capabilities: CAPABILITIES,
        });

      case 'notifications/initialized':
        // Notification – no response expected
        return null;

      // -- Tools ------------------------------------------------------------
      case 'tools/list': {
        const tools = await upstreamManager.getTools();
        return jsonrpcResult(id, { tools });
      }

      case 'tools/call': {
        const { name, arguments: args } = params || {};
        if (!name) {
          return jsonrpcError(id, -32602, 'Missing required parameter: name');
        }

        try {
          const result = await upstreamManager.callTool(name, args || {});
          return jsonrpcResult(id, result);
        } catch (err) {
          // Return tool errors as successful JSON-RPC responses with isError flag
          return jsonrpcResult(id, {
            content: [{ type: 'text', text: `Error: ${err.message}` }],
            isError: true,
          });
        }
      }

      // -- Utility ----------------------------------------------------------
      case 'ping':
        return jsonrpcResult(id, {});

      // -- Unknown ----------------------------------------------------------
      default:
        if (isNotification) {
          // Unknown notifications are silently ignored per spec
          return null;
        }
        return jsonrpcError(id, -32601, `Method not found: ${method}`);
    }
  } catch (err) {
    console.error(`[proxy] Internal error handling ${method}:`, err);
    return jsonrpcError(id, -32603, 'Internal error', err.message);
  }
}
