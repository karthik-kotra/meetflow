const mongoose = require('mongoose');

const workspaceNotesSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      unique: true,
    },
    content: {
      type: String,
      default: '',
    },
    lastUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    }
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('WorkspaceNotes', workspaceNotesSchema);
