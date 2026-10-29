import mongoose from "mongoose";

/**
 * Per-user OAuth credentials for an MCP server configured with
 * `auth.mode === "oauth-user"`.
 *
 * Tokens are encrypted at rest with the same AES-256-GCM helper used for
 * LLM provider keys and the GitHub Copilot token (utils/encryption.js).
 * They never leave the backend in plaintext except through the internal
 * service API consumed by the MCP proxy.
 */
const encryptedSchema = new mongoose.Schema(
  {
    ciphertext: { type: String, default: null },
    iv: { type: String, default: null },
    tag: { type: String, default: null },
  },
  { _id: false },
);

const schema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // McpServer.name (not _id) so the proxy can resolve by the tool prefix.
    server: { type: String, required: true, trim: true },
    accessToken: { type: encryptedSchema, default: () => ({}) },
    refreshToken: { type: encryptedSchema, default: () => ({}) },
    tokenType: { type: String, default: "Bearer" },
    scope: { type: String, default: "" },
    expiresAt: { type: Date, default: null },
    connectedAt: { type: Date, default: Date.now },
    lastRefreshedAt: { type: Date, default: null },
    // Set when a refresh fails; the user must re-authorise.
    lastError: { type: String, default: null },
    needsReauth: { type: Boolean, default: false },
  },
  { timestamps: true },
);

schema.index({ user: 1, server: 1 }, { unique: true });

/** Status object safe to expose to the owning user. */
schema.methods.toStatusJSON = function () {
  return {
    connected: !!this.accessToken?.ciphertext && !this.needsReauth,
    connectedAt: this.connectedAt,
    expiresAt: this.expiresAt,
    scope: this.scope,
    needsReauth: !!this.needsReauth,
    lastError: this.lastError,
  };
};

export default mongoose.model("McpUserCredential", schema);
