import mongoose from "mongoose";

const workspaceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, maxlength: 100, trim: true },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    isPersonal: { type: Boolean, default: false },
  },
  { timestamps: true }
);

workspaceSchema.index({ owner: 1 });

export default mongoose.model("Workspace", workspaceSchema);
