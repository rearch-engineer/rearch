import mongoose from "mongoose";

const modelSchema = new mongoose.Schema(
  {
    modelId: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    enabled: {
      type: Boolean,
      default: true,
    },
  },
  { _id: false },
);

const schema = new mongoose.Schema(
  {
    providerId: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    enabled: {
      type: Boolean,
      default: true,
    },
    // Custom base URL for OpenAI-compatible providers
    baseUrl: {
      type: String,
      trim: true,
      default: null,
    },
    // Encrypted API key components (AES-256-GCM)
    apiKey: {
      ciphertext: { type: String, default: null },
      iv: { type: String, default: null },
      tag: { type: String, default: null },
    },
    // Models available for this provider
    models: [modelSchema],
  },
  {
    timestamps: true,
  },
);

export default mongoose.model("LlmProvider", schema);
