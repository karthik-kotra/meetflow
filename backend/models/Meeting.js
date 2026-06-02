const mongoose = require('mongoose');

const meetingSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Please provide a meeting title'],
    trim: true,
  },
  description: {
    type: String,
    default: '',
  },
  date: {
    type: String,
    required: [true, 'Please select a date'],
  },
  time: {
    type: String,
    required: [true, 'Please select a time'],
  },
  host: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  roomId: {
    type: String,
    required: true,
    unique: true,
  },
  status: {
    type: String,
    enum: ['upcoming', 'ongoing', 'completed'],
    default: 'upcoming',
  },
  isPrivate: {
    type: Boolean,
    default: false,
  },
  participants: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  ],
  workspaceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace',
  },
  startedAt: {
    type: Date,
  },
  endedAt: {
    type: Date,
  },
  duration: {
    type: Number,
    default: 0,
  },
  notes: {
    type: String,
    default: '',
  },
  summary: {
    type: String,
    default: '',
  },
  actionItems: [
    {
      task: { type: String, required: true },
      priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
      assigneeName: { type: String, default: '' },
    }
  ],
  aiProcessed: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Meeting', meetingSchema);
