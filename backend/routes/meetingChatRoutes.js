const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const MeetingMessage = require('../models/MeetingMessage');

const router = express.Router();

// @desc    Get all chat messages for a meeting room
// @route   GET /api/meeting-chat/:roomId/messages
// @access  Private
router.get('/:roomId/messages', protect, async (req, res) => {
  try {
    const messages = await MeetingMessage.find({ roomId: req.params.roomId })
      .sort({ createdAt: 1 })
      .limit(500);
    res.status(200).json(messages);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
