import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  schema_version: {
    type: String,
    default: '1.0'
  },
  account: {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    status: {
      type: String,
      enum: ['active', 'suspended', 'pending_verification'],
      default: 'pending_verification'
    }
  },
  profile: {
    display_name: {
      type: String,
      default: ''
    },
    avatar_url: {
      type: String,
      default: ''
    },
    avatar_fileId: {
      type: String,
      default: ''
    },
    preferences: {
      theme: {
        type: String,
        enum: ['light', 'dark', 'system'],
        default: 'system'
      },
      voice_language: {
        type: String,
        default: ''
      },
      notifications: {
        email: { type: Boolean, default: true },
        push: { type: Boolean, default: false }
      }
    }
  },
  auth: {
    password_hash: {
      type: String,
      default: null
    },
    last_login: {
      type: Date,
      default: null
    },
    roles: {
      type: [String],
      default: ['user']
    }
  },
  oauth: {
    provider: {
      type: String,
      default: null
    },
    subject: {
      type: String,
      default: null
    }
  },
  metadata: {
    tags: {
      type: [String],
      default: []
    }
  },
  recent_activity: {
    type: [{
      action: { type: String, required: true },
      timestamp: { type: Date, default: Date.now },
      ip: { type: String, default: '' }
    }],
    default: []
  }
}, {
  timestamps: true
});

// Index for OAUTH lookups
userSchema.index({ 'oauth.provider': 1, 'oauth.subject': 1 });

// Ensure recent_activity never exceeds 5 entries (Subset Pattern)
userSchema.methods.addActivity = function (action, ip = '') {
  this.recent_activity.unshift({
    action,
    timestamp: new Date(),
    ip
  });
  if (this.recent_activity.length > 5) {
    this.recent_activity = this.recent_activity.slice(0, 5);
  }
};

// Never expose password_hash in JSON
userSchema.methods.toSafeJSON = function () {
  const obj = this.toObject();
  delete obj.auth.password_hash;
  return obj;
};

export default mongoose.model('User', userSchema);
