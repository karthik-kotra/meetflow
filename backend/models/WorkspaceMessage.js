const mongoose = require('mongoose');

const workspaceMessageSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
    },
    channelId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    senderName: {
      type: String,
      required: true,
    },
    text: {
      type: String,
      required: true,
    }
  },
  {
    timestamps: true,
  }
);

// Create TTL index or simple query indexing for message retrieval optimization
workspaceMessageSchema.index({ workspaceId: 1, channelId: 1, createdAt: 1 });

module.exports = mongoose.model('WorkspaceMessage', workspaceMessageSchema);
