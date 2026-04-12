import mongoose from 'mongoose';

const resourceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    minlength: 2,
    maxlength: 100,
    trim: true
  },
  provider: {
    type: String,
    required: true,
    enum: ['bitbucket']
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
    // validate: {
    //   validator: function(value) {
    //     console.log(value, this.provider);
    //     // Validate based on provider type
    //     if (this.provider === 'file') {
    //       return value.fileId && value.filename && value.size && value.mimeType;
    //     } else if (this.provider === 'jira') {
    //       return value.projectKey && value.issueType && value.url;
    //     } else if (this.provider === 'repository') {
    //       return value.url && value.branch;
    //     }
    //     else {
    //       console.log('Unknown provider type');
    //     }
    //     return false;
    //   },
    //   message: 'Invalid data structure for the selected provider'
    // }
  }
}, {
  timestamps: true
});

const Resource = mongoose.model('Resource', resourceSchema);

export default Resource;
