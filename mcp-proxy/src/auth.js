/**
 * Request authentication for the MCP proxy.
 *
 * If MCP_PROXY_SECRET is unset every request is allowed (dev mode).
 * Otherwise the caller must send a matching X-MCP-Secret header.
 */

const SECRET = process.env.MCP_PROXY_SECRET;

/**
 * @param {Request} request
 * @returns {boolean} true when the request is authorised
 */
export function validateAuth(request) {
  if (!SECRET) {
    return true;
  }

  const header = request.headers.get('x-mcp-secret');
  return header === SECRET;
}
