import mongoose from 'mongoose';

// Curated descriptor for a single OpenAPI operation exposed as an MCP tool.
// The admin (and, in the future, an AI curation pass) edits these descriptors;
// they are the runtime source of truth — NOT the raw uploaded spec.
const openApiParameterSchema = new mongoose.Schema({
  name: { type: String, required: true },
  in: { type: String, enum: ['path', 'query', 'header', 'cookie'], required: true },
  required: { type: Boolean, default: false },
  type: { type: String, default: 'string' },
  description: { type: String, default: '' }
}, { _id: false });

const openApiOperationSchema = new mongoose.Schema({
  operationId: { type: String },
  method: { type: String, required: true },
  path: { type: String, required: true },
  toolName: { type: String, required: true },
  description: { type: String, default: '' },
  enabled: { type: Boolean, default: true },
  parameters: { type: [openApiParameterSchema], default: [] },
  requestBodySchema: { type: mongoose.Schema.Types.Mixed, default: null }
}, { _id: false });

const schema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    match: /^[a-zA-Z0-9_-]+$/
  },
  type: {
    type: String,
    required: true,
    enum: ['remote', 'local', 'openapi']
  },
  url: {
    type: String,
    required: function () { return this.type === 'remote'; }
  },
  command: {
    type: [String],
    required: function () { return this.type === 'local'; }
  },
  headers: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  environment: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  // ─── OpenAPI ("API Definition") fields ─────────────────────────────────────
  // GridFS id of the raw uploaded Swagger/OpenAPI spec (kept for re-parsing/audit).
  specFileId: {
    type: mongoose.Schema.Types.ObjectId,
    required: function () { return this.type === 'openapi'; }
  },
  // Base URL the generated tools call against (defaults to the spec's server URL).
  baseUrl: {
    type: String,
    required: function () { return this.type === 'openapi'; }
  },
  // Admin-curated tool descriptors generated from the spec.
  operations: {
    type: [openApiOperationSchema],
    default: undefined,
    required: function () { return this.type === 'openapi'; }
  },
  // ─── Authentication ────────────────────────────────────────────────────────
  // `shared`     – the admin-provided headers/environment are used for every
  //                call (legacy behaviour, one identity for all users).
  // `oauth-user` – each ReArch user authorises the upstream MCP server with
  //                their own account via OAuth 2.1 (PKCE + dynamic client
  //                registration). Tokens live in McpUserCredential; the
  //                proxy opens one upstream connection per user.
  auth: {
    mode: {
      type: String,
      enum: ['shared', 'oauth-user'],
      default: 'shared'
    },
    oauth: {
      // Space-separated scopes requested at authorisation time (optional —
      // most servers apply sensible defaults when omitted).
      scopes: { type: String, default: '' },
      // Discovered metadata (RFC 9728 protected-resource + RFC 8414 AS).
      resource: { type: String, default: null },
      authorizationServer: { type: String, default: null },
      authorizationEndpoint: { type: String, default: null },
      tokenEndpoint: { type: String, default: null },
      registrationEndpoint: { type: String, default: null },
      revocationEndpoint: { type: String, default: null },
      codeChallengeMethods: { type: [String], default: [] },
      scopesSupported: { type: [String], default: [] },
      // Client obtained through dynamic client registration (RFC 7591).
      clientId: { type: String, default: null },
      clientSecret: {
        ciphertext: { type: String, default: null },
        iv: { type: String, default: null },
        tag: { type: String, default: null }
      },
      tokenEndpointAuthMethod: { type: String, default: 'none' },
      redirectUri: { type: String, default: null },
      registeredAt: { type: Date, default: null },
      discoveredAt: { type: Date, default: null }
    }
  },
  enabled: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

/**
 * Plain object safe to return to admin clients: the (encrypted) client secret
 * is replaced by a boolean.
 */
schema.methods.toAdminJSON = function () {
  const obj = this.toObject();
  if (obj.auth?.oauth) {
    obj.auth.oauth.hasClientSecret = !!obj.auth.oauth.clientSecret?.ciphertext;
    delete obj.auth.oauth.clientSecret;
  }
  return obj;
};

export default mongoose.model('McpServer', schema);
