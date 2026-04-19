import mongoose from "mongoose";
import User from "../models/User.js";
import Conversation from "../models/Conversation.js";
import { ensurePersonalWorkspace } from "../utils/workspace.js";
import Workspace from "../models/Workspace.js";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/rearch";

async function migrate() {
  console.log("Connecting to MongoDB...");
  await mongoose.connect(MONGODB_URI);
  console.log("Connected.");

  // Step 1: Create personal workspaces for all users
  const users = await User.find({}).lean();
  console.log(`Found ${users.length} users. Creating personal workspaces...`);
  
  let wsCreated = 0;
  for (const user of users) {
    const ws = await ensurePersonalWorkspace(user._id);
    if (ws.createdAt && new Date() - ws.createdAt < 5000) {
      wsCreated++;
    }
  }
  console.log(`Personal workspaces created: ${wsCreated} new, ${users.length - wsCreated} already existed.`);

  // Step 2: Assign orphaned conversations to their creator's personal workspace
  const orphanedConversations = await Conversation.find({
    $or: [{ workspace: null }, { workspace: { $exists: false } }],
  }).lean();
  
  console.log(`Found ${orphanedConversations.length} conversations without a workspace.`);
  
  let migrated = 0;
  for (const conv of orphanedConversations) {
    const personalWs = await Workspace.findOne({ owner: conv.createdBy, isPersonal: true });
    if (personalWs) {
      await Conversation.updateOne(
        { _id: conv._id },
        { $set: { workspace: personalWs._id } },
      );
      migrated++;
    } else {
      console.warn(`No personal workspace found for user ${conv.createdBy} (conversation ${conv._id})`);
    }
  }
  
  console.log(`Migrated ${migrated} conversations.`);
  console.log("Migration complete.");
  
  await mongoose.disconnect();
  process.exit(0);
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
