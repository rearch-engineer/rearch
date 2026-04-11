import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    minlength: 1,
    maxlength: 200,
    trim: true,
  },
  prompt: {
    type: String,
    required: true,
    minlength: 1,
    maxlength: 5000,
    trim: true,
  },
  icon: {
    type: String,
    default: 'SmartToyOutlined',
    maxlength: 100,
    trim: true,
  },
  iconColor: {
    type: String,
    default: '#6b7280',
    maxlength: 20,
    trim: true,
  },
  imageFileId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null,
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SuggestedPromptCategory',
    required: true,
  },
  order: {
    type: Number,
    default: 0,
  },
}, {
  timestamps: true,
});

export default mongoose.model('SuggestedPrompt', schema);
