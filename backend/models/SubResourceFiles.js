import mongoose from 'mongoose';

const subResourceFilesSchema = new mongoose.Schema({
  subResource: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SubResource',
    required: true
  },
  filename: {
    type: String,
    required: true,
    trim: true
  },
  mimeType: {
    type: String,
    required: true,
    trim: true
  },
  size: {
    type: Number,
    required: true,
    min: 0
  },
  gridFsId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  externalId: { // Please note: this is the ID from the external system (e.g., Jira attachment ID)
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Index for efficient queries
subResourceFilesSchema.index({ subResource: 1 });
subResourceFilesSchema.index({ gridFsId: 1 });

const SubResourceFiles = mongoose.model('SubResourceFiles', subResourceFilesSchema);

export default SubResourceFiles;
