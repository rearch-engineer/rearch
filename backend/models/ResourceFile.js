import mongoose from "mongoose";

/**
 * ResourceFile — a file stored in GridFS and attached to a Resource.
 * Formerly `SubResourceFiles` (collection `subresourcefiles`, now `resourcefiles`).
 */
const resourceFileSchema = new mongoose.Schema(
  {
    resource: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Resource",
      required: true,
    },
    filename: {
      type: String,
      required: true,
      trim: true,
    },
    mimeType: {
      type: String,
      required: true,
      trim: true,
    },
    size: {
      type: Number,
      required: true,
      min: 0,
    },
    gridFsId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    // ID from the external system
    externalId: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  },
);

resourceFileSchema.index({ resource: 1 });
resourceFileSchema.index({ gridFsId: 1 });

const ResourceFile = mongoose.model("ResourceFile", resourceFileSchema);

export default ResourceFile;
