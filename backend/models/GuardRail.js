import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  regularExpression: {
    type: String,
    required: true
  },
  reject: {
    type: Boolean,
    default: false
  },
  replaceWith: {
    type: String,
  }
}, {
  timestamps: true
});

export default mongoose.model('GuardRail', schema);
