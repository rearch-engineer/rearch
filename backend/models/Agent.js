import mongoose from "mongoose";

/**
 * Agent
 *
 * An Agent is the unit a user picks when starting a conversation. It owns the
 * runtime configuration of the OpenCode container (template, image, services,
 * limits, skills) and declares which resources it works with.
 *
 * A repository is just one kind of resource an agent may use. `repository`
 * points to the Resource (kind: repository) that gets cloned into the
 * container; it is optional so agents can exist without any repository.
 *
 * This replaces the former `Resource.rearch` block, which coupled the
 * runtime configuration to a single repository.
 */

export const AGENT_TEMPLATES = [
  "",
  "minimal",
  "node",
  "node-browser",
  "node-react-pg",
];

const agentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      minlength: 1,
      maxlength: 100,
      trim: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    // Whether users can start conversations with this agent
    enabled: {
      type: Boolean,
      default: false,
    },
    // Optional workspace scoping (null = available to every workspace)
    workspace: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Workspace",
      default: null,
    },

    // ── Resources ───────────────────────────────────────────────────────
    // Primary repository cloned into the container (optional)
    repository: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Resource",
      default: null,
    },
    // Additional resources exposed to the agent (any kind). Reserved for
    // non-repository resource kinds (Jira projects, databases, ...).
    resources: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Resource",
      },
    ],

    // ── Container runtime ───────────────────────────────────────────────
    template: {
      type: String,
      default: "",
      enum: AGENT_TEMPLATES,
    },
    // Branch of `repository` used to build a custom image (.rearch/Dockerfile)
    dockerImageFromBranch: {
      type: String,
      default: "",
    },
    // Image tag produced by the rebuild action; empty = use the default image
    dockerImage: {
      type: String,
      default: "",
    },
    services: [
      {
        label: String,
        icon: { type: String, default: "Widgets" },
        internalPort: Number,
      },
    ],
    // Resource ids of repositories containing skills to clone into the container
    skills: [
      {
        type: String,
      },
    ],
    limits: {
      memoryMb: { type: Number, default: 0 },
      cpuQuota: { type: Number, default: 0 },
      pidsLimit: { type: Number, default: 0 },
    },

    // ── Conversation UX ─────────────────────────────────────────────────
    suggestedPrompts: {
      mode: {
        type: String,
        enum: ["all", "selected", "categories"],
        default: "all",
      },
      selectedIds: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "SuggestedPrompt",
        },
      ],
      selectedCategories: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "SuggestedPromptCategory",
        },
      ],
    },
  },
  {
    timestamps: true,
  },
);

agentSchema.index({ name: 1 });
agentSchema.index({ repository: 1 });
agentSchema.index({ enabled: 1 });

const Agent = mongoose.model("Agent", agentSchema);

export default Agent;
