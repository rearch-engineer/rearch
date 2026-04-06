import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    validate: {
      validator: function(value) {
        // Check if slug is URL-safe (alphanumeric, hyphens, underscores)
        const isUrlSafe = /^[a-z0-9_-]+$/.test(value);
        
        // Check against reserved words
        const reservedWords = ['description'];
        const isNotReserved = !reservedWords.includes(value.toLowerCase());
        
        return isUrlSafe && isNotReserved;
      },
      message: 'Slug must be URL-safe (lowercase letters, numbers, hyphens, underscores) and cannot be "description"'
    }
  },
  systemPrompt: {
    type: String,
    default: ''
  },
  prompt: {
    type: String,
    default: ''
  },
  code: {
    type: Boolean,
    default: false
  },
  active: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

export default mongoose.model('FlowPersona', schema);
