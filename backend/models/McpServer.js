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
  enabled: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

export default mongoose.model('McpServer', schema);
