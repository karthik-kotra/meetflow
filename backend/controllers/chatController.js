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

// @desc    Summarize chat history between two users via Groq
// @route   POST /api/chat/:userId/summarize
// @access  Private
exports.summarizeMessages = async (req, res) => {
  try {
    const user1 = req.user._id;
    const user2 = req.params.userId;

    const messages = await Message.find({
      $or: [
        { senderId: user1, receiverId: user2 },
        { senderId: user2, receiverId: user1 },
      ],
    }).populate('senderId', 'name').sort({ createdAt: 1 });

    if (messages.length === 0) {
      return res.status(200).json({ summary: "No chat messages recorded yet." });
    }

    const formattedChats = messages.map(m => `${m.senderId?.name || 'Unknown'}: ${m.text}`).join('\n');

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ message: 'GROQ_API_KEY is not configured in backend .env file.' });
    }

    const prompt = `You are a chat assistant. Summarize the following direct chat message log between two users in a brief, concise paragraph (2-3 sentences max). Focus only on key questions, answers, and decisions made in the chat:

${formattedChats}

Summary:`;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 150
      })
    });

    if (!response.ok) {
      return res.status(response.status).json({ message: 'Error calling Groq API' });
    }

    const result = await response.json();
    const summaryText = result.choices?.[0]?.message?.content?.trim() || "Could not generate summary.";

    res.status(200).json({ summary: summaryText });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
