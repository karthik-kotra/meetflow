const Message = require('../models/Message');

// @desc    Get chat history between two users
// @route   GET /api/chat/:userId
// @access  Private
exports.getMessages = async (req, res) => {
  try {
    const user1 = req.user._id;
    const user2 = req.params.userId;

    const messages = await Message.find({
      $or: [
        { senderId: user1, receiverId: user2 },
        { senderId: user2, receiverId: user1 },
      ],
    }).sort({ createdAt: 1 });

    // Mark messages from other user as read
    await Message.updateMany(
      { senderId: user2, receiverId: user1, read: false },
      { $set: { read: true } }
    );

    res.status(200).json(messages);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
