/**
 * Unit tests for the per-user MCP OAuth building blocks.
 *
 * Lives under routes/ so the scoped `bun test middleware routes config.test.js`
 * script (what CI runs) picks it up. Pure functions only — no network, no DB.
 */
import { describe, it, expect } from "bun:test";
import {
  signMcpIdentity,
  verifyMcpIdentity,
} from "../utils/mcp/identityToken.js";
import {
  generatePkce,
  generateState,
  parseWwwAuthenticate,
  wellKnownCandidates,
  buildAuthorizationUrl,
} from "../utils/mcp/oauth.js";

const SECRET = "test-secret";

describe("MCP identity token", () => {
  it("round-trips a signed identity", () => {
    const token = signMcpIdentity(
      { userId: "64b000000000000000000001", conversationId: "64b000000000000000000002" },
      SECRET,
    );
    const payload = verifyMcpIdentity(token, SECRET);
    expect(payload).not.toBeNull();
    expect(payload.userId).toBe("64b000000000000000000001");
    expect(payload.conversationId).toBe("64b000000000000000000002");
    expect(typeof payload.iat).toBe("number");
  });

  it("rejects a token signed with a different secret", () => {
    const token = signMcpIdentity({ userId: "u", conversationId: "c" }, SECRET);
    expect(verifyMcpIdentity(token, "other-secret")).toBeNull();
  });

  it("rejects a tampered payload", () => {
    const token = signMcpIdentity({ userId: "u1", conversationId: "c1" }, SECRET);
    const [, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ v: 1, userId: "u2", conversationId: "c1", iat: 1 }))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(verifyMcpIdentity(`${forged}.${sig}`, SECRET)).toBeNull();
  });

  it("rejects malformed input", () => {
    expect(verifyMcpIdentity("", SECRET)).toBeNull();
    expect(verifyMcpIdentity("abc", SECRET)).toBeNull();
    expect(verifyMcpIdentity(null, SECRET)).toBeNull();
  });
});

describe("OAuth helpers", () => {
  it("generates a valid S256 PKCE pair", async () => {
    const { codeVerifier, codeChallenge, codeChallengeMethod } = generatePkce();
    expect(codeChallengeMethod).toBe("S256");
    expect(codeVerifier.length).toBeGreaterThanOrEqual(43);
    expect(codeVerifier.length).toBeLessThanOrEqual(128);
    expect(codeVerifier).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(codeChallenge).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(generateState()).not.toBe(generateState());
  });

  it("parses WWW-Authenticate parameters", () => {
    const params = parseWwwAuthenticate(
      'Bearer realm="OAuth", resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource/mcp", scope="read write"',
    );
    expect(params.realm).toBe("OAuth");
    expect(params.resource_metadata).toBe(
      "https://mcp.example.com/.well-known/oauth-protected-resource/mcp",
    );
    expect(params.scope).toBe("read write");
    expect(parseWwwAuthenticate(null)).toEqual({});
  });

  it("builds path-aware well-known candidates first, origin-level last", () => {
    expect(wellKnownCandidates("https://mcp.example.com/v1/mcp", "oauth-authorization-server")).toEqual([
      "https://mcp.example.com/.well-known/oauth-authorization-server/v1/mcp",
      "https://mcp.example.com/.well-known/oauth-authorization-server",
    ]);
    expect(wellKnownCandidates("https://mcp.example.com", "oauth-protected-resource")).toEqual([
      "https://mcp.example.com/.well-known/oauth-protected-resource",
    ]);
  });

  it("builds an authorization URL with PKCE, state and resource indicator", () => {
    const href = buildAuthorizationUrl({
      authorizationEndpoint: "https://auth.example.com/authorize?audience=x",
      clientId: "client-123",
      redirectUri: "http://localhost:4200/account/integrations/callback",
      scopes: "read write",
      state: "st",
      codeChallenge: "chal",
      resource: "https://mcp.example.com/mcp",
    });
    const url = new URL(href);
    expect(url.origin + url.pathname).toBe("https://auth.example.com/authorize");
    expect(url.searchParams.get("audience")).toBe("x");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("client-123");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe("chal");
    expect(url.searchParams.get("scope")).toBe("read write");
    expect(url.searchParams.get("resource")).toBe("https://mcp.example.com/mcp");
    expect(url.searchParams.get("state")).toBe("st");
  });
});
