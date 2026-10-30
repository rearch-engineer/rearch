import mongoose from "mongoose";

/**
 * Connection
 *
 * Credentials and settings for an external provider (a Bitbucket workspace, a
 * GitHub App installation, ...). A connection is only authentication: the
 * things an agent actually works with are `Resource` documents imported
 * through a connection (repositories today, other kinds later).
 *
 * Formerly named `Resource` (collection `resources`); the collection is now
 * `connections` (see scripts/migrate-rename-resources.js).
 */
const connectionSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      minlength: 2,
      maxlength: 100,
      trim: true,
    },
    provider: {
      type: String,
      required: true,
      enum: ["bitbucket", "github"],
    },
    // Provider-specific credentials/settings (workspace, apiToken, appId, privateKey, ...)
    data: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

const Connection = mongoose.model("Connection", connectionSchema);

export default Connection;
