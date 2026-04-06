import mongoose from 'mongoose';

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
    enum: ['remote', 'local']
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
  enabled: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

export default mongoose.model('McpServer', schema);
