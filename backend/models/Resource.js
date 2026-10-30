import mongoose from "mongoose";

/**
 * Resource
 *
 * Something an agent can work with, imported through a `Connection`.
 * `kind` says what it is (today only "repository"); `provider` says where it
 * lives (bitbucket, github). Provider-specific payload goes in `data`.
 *
 * Formerly named `SubResource` with a composite `type` ("github-repository");
 * the `type` virtual keeps that shape available for consumers that still read it.
 *
 * The `rearch` block is legacy: container configuration now lives in `Agent`.
 * It is only read by scripts/migrate-agents.js and the lazy fallback in
 * utils/agents.js, and will be removed once every deployment has migrated.
 */

export const RESOURCE_KINDS = ["repository"];

const resourceSchema = new mongoose.Schema(
  {
    connection: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Connection",
      required: true,
    },
    kind: {
      type: String,
      required: true,
      enum: RESOURCE_KINDS,
      default: "repository",
    },
    provider: {
      type: String,
      required: true,
      enum: ["bitbucket", "github"],
    },
    externalId: {
      type: String,
      required: false,
      trim: true,
    },
    imported: {
      type: Boolean,
      default: false,
    },
    name: {
      type: String,
      required: true,
      minlength: 1,
      maxlength: 100,
      trim: true,
    },
    description: {
      type: String,
      required: false,
      trim: true,
      default: "",
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    // Legacy per-repository container configuration (see note above)
    rearch: {
      type: mongoose.Schema.Types.Mixed,
      required: false,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Backward-compatible composite type, e.g. "github-repository"
resourceSchema.virtual("type").get(function () {
  return `${this.provider}-${this.kind}`;
});

resourceSchema.index({ connection: 1 });
resourceSchema.index({ kind: 1, provider: 1 });
resourceSchema.index({ name: 1 });

const Resource = mongoose.model("Resource", resourceSchema);

export default Resource;
