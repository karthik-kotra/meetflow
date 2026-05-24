const User = require('../models/User');
const Message = require('../models/Message');

// @desc    Get all users except the currently logged in user
// @route   GET /api/users
// @access  Private
exports.getUsers = async (req, res) => {
  try {
    const users = await User.find({ _id: { $ne: req.user._id } }).select('-password');
    
    const usersWithUnreadCount = await Promise.all(
      users.map(async (u) => {
        const unreadCount = await Message.countDocuments({
          senderId: u._id,
          receiverId: req.user._id,
          read: false
        });
        return {
          ...u.toObject(),
          unreadCount
        };
      })
    );

    res.status(200).json(usersWithUnreadCount);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
