import mongoose from "mongoose";
import { broadcast } from "../ws.js";

const subResourceSchema = new mongoose.Schema(
  {
    resource: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Resource",
      required: true,
    },
    externalId: {
      type: String,
      required: false,
      trim: true,
    },
    imported: {
      type: Boolean,
      default: false,
    },
    name: {
      type: String,
      required: true,
      minlength: 1,
      maxlength: 100,
      trim: true,
    },
    description: {
      type: String,
      required: false,
      trim: true,
      default: "",
    },
    type: {
      type: String,
      required: true,
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
    },
    // User-editable fields that are NOT overwritten during sync operations
    rearch: {
      enabled: {
        type: Boolean,
        required: false,
        default: false,
      },
      template: {
        type: String,
        required: false,
        default: "",
        enum: ["", "minimal", "node", "node-browser", "node-react-pg"],
      },
      dockerImageFromBranch: {
        type: String,
        required: false,
        default: "",
      },
      dockerImage: {
        type: String,
        required: false,
        default: "",
      },
      services: [
        {
          label: String,
          icon: { type: String, default: "Widgets" },
          internalPort: Number,
        },
      ],
      skills: [
        {
          type: String,
        },
      ],
      resources: {
        memoryMb: {
          type: Number,
          required: false,
          default: 0,
        },
        cpuQuota: {
          type: Number,
          required: false,
          default: 0,
        },
        pidsLimit: {
          type: Number,
          required: false,
          default: 0,
        },
      },
    },
  },
  {
    timestamps: true,
  },
);

subResourceSchema.post("save", async function (doc) {
  // Check if the flow array was modified
  if (this.isModified("flow") && doc.flow && doc.flow.length > 0) {
    try {
      // Get the last (newly added) flow item
      const newFlowItem = doc.flow[doc.flow.length - 1];

      // Broadcast WebSocket event
      broadcast("subresource.flow", {
        subresourceId: doc._id,
        persona: newFlowItem.persona,
        output: newFlowItem.output,
      });

      console.log(
        `✅ Emitted subresource.flow event for persona: ${newFlowItem.persona}`,
      );
    } catch (error) {
      // Log error but don't fail the save operation
      console.error("❌ Error emitting subresource.flow event:", error.message);
    }
  }
});

const SubResource = mongoose.model("SubResource", subResourceSchema);

export default SubResource;
