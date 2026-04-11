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
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  repository: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Resource',
    required: true
  },
  subResource: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SubResource',
    required: true
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

conversationSchema.plugin(mongoose_delete, {
  deletedAt: true,
  deletedBy: true,
  overrideMethods: 'all'
});

export default mongoose.model('Conversation', conversationSchema);
