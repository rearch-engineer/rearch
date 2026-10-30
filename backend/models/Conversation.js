import mongoose from 'mongoose';
import mongoose_delete from 'mongoose-delete';

const conversationSchema = new mongoose.Schema({
  title: {
    type: String,
    default: 'New Conversation'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  workspace: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace',
    default: null
  },
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  // The agent this conversation runs with (owns container config + resources)
  agent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Agent',
    default: null
  },
  // Mirrors of the agent's repository, kept for provider tools (PRs, reviewers)
  // and for conversations created before agents existed.
  connection: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Connection',
    default: null
  },
  resource: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Resource',
    default: null
  },
  contextUsage: {
    used: {
      type: Number,
      default: 0
    },
    limit: {
      type: Number,
      default: 0
    },
    percent: {
      type: Number,
      default: 0
    }
  },
  cost: {
    total: {
      type: Number,
      default: 0
    },
    currency: {
      type: String,
      default: 'USD'
    }
  },
  environment: {
    container: {
      type: String,
    },
    status: {
      type: String,
      enum: ['running', 'stopped', 'starting', 'error'],
      default: 'stopped'
    },
    // OpenCode server URL for ACP communication
    opencodeUrl: {
      type: String,
    },
    // OpenCode session ID for conversation continuity
    opencodeSessionId: {
      type: String,
    },
    // Host port mapped to container's OpenCode server
    hostPort: {
      type: Number,
    },
    // Error message if container failed to start
    errorMessage: {
      type: String,
    },
    // Additional ports for Node.js template containers
    codeServerUrl: {
      type: String,
    },
    codeServerPort: {
      type: Number,
    },
    appUrl: {
      type: String,
    },
    appPort: {
      type: Number,
    },
    postgresPort: {
      type: Number,
    },
    // Timestamp of the last environment.status change (used for idle cleanup thresholds)
    statusChangedAt: {
      type: Date,
    }
  },
  // Per-user timestamp of when they last fetched messages (for unread detection)
  lastReadBy: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    at: { type: Date }
  }],
  // Initial prompt to send automatically after container setup (set via MCP tool)
  initialPrompt: {
    type: String,
    default: null
  },
  // Pull requests created from this conversation
  pullRequests: [{
    url: { type: String, required: true },
    title: { type: String, default: '' },
    sourceBranch: { type: String, default: '' },
    externalId: { type: String },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    createdAt: { type: Date, default: Date.now }
  }]
}, {
  timestamps: true
});

conversationSchema.index({ workspace: 1 });
conversationSchema.index({ agent: 1 });

conversationSchema.plugin(mongoose_delete, {
  deletedAt: true,
  deletedBy: true,
  overrideMethods: 'all'
});

export default mongoose.model('Conversation', conversationSchema);
