/**
 * Signed identity token handed to each conversation container.
 *
 * The container sends it to the MCP proxy as `X-MCP-Identity`. Because it is
 * HMAC-signed with a secret shared only between the backend and the proxy,
 * a container cannot impersonate another user by editing the header — which
 * matters once per-user credentials are involved.
 *
 * Format: `<base64url(json payload)>.<base64url(hmac-sha256)>`
 * Payload: `{ v: 1, userId, conversationId, iat }`
 *
 * The verifying counterpart lives in mcp-proxy/src/identity.js; keep both in
 * sync.
 */

import crypto from "crypto";

function signingSecret() {
  return process.env.MCP_PROXY_SECRET || process.env.INTERNAL_API_SECRET || "";
}

function b64url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromB64url(str) {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  return Buffer.from(str.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

export function signMcpIdentity({ userId, conversationId }, secret = signingSecret()) {
  const payload = JSON.stringify({
    v: 1,
    userId: String(userId),
    conversationId: String(conversationId),
    iat: Math.floor(Date.now() / 1000),
  });
  const encoded = b64url(payload);
  const sig = crypto.createHmac("sha256", secret).update(encoded).digest();
  return `${encoded}.${b64url(sig)}`;
}

/** @returns {{ userId: string, conversationId: string, iat: number } | null} */
export function verifyMcpIdentity(token, secret = signingSecret()) {
  if (!token || typeof token !== "string") return null;
  const [encoded, sig] = token.split(".");
  if (!encoded || !sig) return null;
  const expected = crypto.createHmac("sha256", secret).update(encoded).digest();
  const given = fromB64url(sig);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    return null;
  }
  try {
    const payload = JSON.parse(fromB64url(encoded).toString("utf8"));
    if (payload.v !== 1 || !payload.userId || !payload.conversationId) return null;
    return payload;
  } catch {
    return null;
  }
}
