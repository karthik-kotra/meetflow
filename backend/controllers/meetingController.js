const mongoose = require('mongoose');
const Meeting = require('../models/Meeting');

// Helper to generate a unique 3-3-3 room code (e.g. abc-defg-hij)
const generateUniqueRoomId = async () => {
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  const part = (len) => Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  let roomId;
  let exists = true;
  
  while (exists) {
    roomId = `${part(3)}-${part(4)}-${part(3)}`;
    const duplicate = await Meeting.findOne({ roomId });
    if (!duplicate) {
      exists = false;
    }
  }
  return roomId;
};

// @desc    Create a new meeting
// @route   POST /api/meetings
// @access  Private
exports.createMeeting = async (req, res) => {
  try {
    const { title, description, date, time, isPrivate, participants, workspaceId } = req.body;

    const roomId = await generateUniqueRoomId();

    const meeting = await Meeting.create({
      title,
      description,
      date,
      time,
      isPrivate: !!isPrivate,
      host: req.user._id,
      roomId,
      participants: isPrivate ? [req.user._id, ...(participants || [])] : [req.user._id],
      workspaceId: workspaceId || null,
    });

    const populatedMeeting = await Meeting.findById(meeting._id).populate('host', 'name email');

    // Send a system-wide or participant-restricted notification about the new meeting
    try {
      const User = require('../models/User');
      const Notification = require('../models/Notification');
      
      const inviteIds = isPrivate ? (participants || []) : [];
      const queryUsers = isPrivate 
        ? { _id: { $ne: req.user._id, $in: inviteIds } } 
        : { _id: { $ne: req.user._id } };

      const otherUsers = await User.find(queryUsers);
      
      const io = req.app.get('io');
      const onlineUsers = req.app.get('onlineUsers');
      
      for (const u of otherUsers) {
        const newMeetNotification = await Notification.create({
          recipient: u._id,
          sender: req.user._id,
          senderName: req.user.name,
          type: 'meeting_invite',
          title: 'New Meeting Scheduled',
          message: `${req.user.name} created a new meeting: "${title}" scheduled for ${date} at ${time}.`,
          relatedId: meeting._id,
          relatedModel: 'Meeting'
        });
        
        if (io && onlineUsers) {
          const receiverSockets = onlineUsers.get(u._id.toString());
          if (receiverSockets) {
            for (const socketId of receiverSockets) {
              io.to(socketId).emit('new_notification', newMeetNotification);
            }
          }
        }
      }
    } catch (err) {
      console.error('Error generating system meeting notifications:', err);
    }

    res.status(201).json(populatedMeeting);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get all meetings
// @route   GET /api/meetings
// @access  Private
exports.getMeetings = async (req, res) => {
  try {
    const meetings = await Meeting.find({
      $or: [
        { isPrivate: false },
        { host: req.user._id },
        { participants: req.user._id }
      ]
    })
      .populate('host', 'name email')
      .populate('participants', 'name email')
      .sort({ date: 1, time: 1 }); // Sort chronologically
    res.status(200).json(meetings);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get meeting by MongoDB ID or unique room code
// @route   GET /api/meetings/:id
// @access  Private
exports.getMeetingByIdOrRoomId = async (req, res) => {
  try {
    const identifier = req.params.id;

    // Build query checking if valid ObjectId, else check roomId
    const query = mongoose.isValidObjectId(identifier)
      ? { _id: identifier }
      : { roomId: identifier };

    const meeting = await Meeting.findOne(query).populate('host', 'name email').populate('participants', 'name email');

    if (!meeting) {
      return res.status(404).json({ message: 'Meeting not found' });
    }

    // Security Check: Enforce access rules if the meeting is private
    if (meeting.isPrivate) {
      const userIdStr = req.user._id.toString();
      const hostIdStr = meeting.host._id.toString();
      const isHost = hostIdStr === userIdStr;
      const isParticipant = meeting.participants.some(p => {
        const pId = p._id || p;
        return pId.toString() === userIdStr;
      });
      const isAdmin = req.user.role === 'admin';

      if (!isHost && !isParticipant && !isAdmin) {
        return res.status(403).json({ 
          message: 'This meeting room is private. You are not authorized to join.' 
        });
      }
    }

    // Auto-update to ongoing if scheduled time has passed and it is still 'upcoming'
    if (meeting.status === 'upcoming') {
      try {
        const meetingDateTime = new Date(`${meeting.date}T${meeting.time}`);
        if (meetingDateTime <= new Date()) {
          meeting.status = 'ongoing';
          meeting.startedAt = new Date();
          await meeting.save();
          console.log(`Auto-updated meeting ${meeting.roomId} to ongoing because schedule time arrived.`);
        }
      } catch (err) {
        console.error('Error auto-updating meeting status:', err);
      }
    }

    res.status(200).json(meeting);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Update meeting status
// @route   PATCH /api/meetings/:id/status
// @access  Private
exports.updateMeetingStatus = async (req, res) => {
  try {
    const { status, duration } = req.body;
    
    if (!['upcoming', 'ongoing', 'completed'].includes(status)) {
      return res.status(400).json({ message: 'Invalid meeting status' });
    }

    const meeting = await Meeting.findById(req.params.id);

    if (!meeting) {
      return res.status(404).json({ message: 'Meeting not found' });
    }

    // Only host can update meeting status
    if (meeting.host.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to modify this meeting' });
    }

    if (status === 'ongoing' && !meeting.startedAt) {
      meeting.startedAt = new Date();
    }

    if (status === 'completed') {
      meeting.endedAt = new Date();
      if (meeting.startedAt) {
        meeting.duration = Math.round((meeting.endedAt - meeting.startedAt) / 1000); // duration in seconds
      } else if (duration !== undefined) {
        meeting.duration = duration;
      } else {
        meeting.duration = Math.round((meeting.endedAt - meeting.createdAt) / 1000);
      }
    }

    meeting.status = status;
    await meeting.save();

    const updatedMeeting = await Meeting.findById(meeting._id).populate('host', 'name email').populate('participants', 'name email');
    res.status(200).json(updatedMeeting);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Delete meeting
// @route   DELETE /api/meetings/:id
// @access  Private
exports.deleteMeeting = async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id);

    if (!meeting) {
      return res.status(404).json({ message: 'Meeting not found' });
    }

    await meeting.deleteOne();
    res.status(200).json({ message: 'Meeting deleted successfully', id: req.params.id });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Update meeting notes
// @route   PATCH /api/meetings/:id/notes
// @access  Private
exports.updateMeetingNotes = async (req, res) => {
  try {
    const { notes } = req.body;
    const meeting = await Meeting.findById(req.params.id);

    if (!meeting) {
      return res.status(404).json({ message: 'Meeting not found' });
    }

    meeting.notes = notes;
    await meeting.save();

    res.status(200).json(meeting);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Trigger AI summarization and action items extraction via Groq
// @route   POST /api/meetings/:id/process-ai
// @access  Private
exports.processMeetingAI = async (req, res) => {
  try {
    const MeetingMessage = require('../models/MeetingMessage');
    const meeting = await Meeting.findById(req.params.id);

    if (!meeting) {
      return res.status(404).json({ message: 'Meeting not found' });
    }

    // Fetch all logs (transcripts & chats)
    const messages = await MeetingMessage.find({ roomId: meeting.roomId }).sort({ createdAt: 1 });

    const formattedLogs = messages.map(m => {
      const time = m.createdAt ? m.createdAt.toISOString() : new Date().toISOString();
      if (m.type === 'transcript') {
        return `[${time}] (Spoken) ${m.senderName}: ${m.text}`;
      } else if (m.type === 'system') {
        return `[${time}] (System): ${m.text}`;
      } else {
        return `[${time}] (Chat) ${m.senderName}: ${m.text}`;
      }
    }).join('\n');

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ 
        message: 'GROQ_API_KEY is not configured in backend .env file. Please check settings.' 
      });
    }

    const systemPrompt = `You are an AI meeting assistant. Your task is to analyze the provided meeting details, transcripts, chat logs, and shared notes, then generate:
1. A concise meeting summary.
2. A list of actionable items with proposed titles, assignee names, and priority levels.

You MUST reply ONLY with a JSON object matching the following structure:
{
  "summary": "Markdown-formatted summary of the meeting. Include headers, bullet points, and key takeaways.",
  "actionItems": [
    {
      "task": "Clean and concise task description",
      "priority": "high", // must be 'high', 'medium', or 'low'
      "assigneeName": "Name of the person who should do this task, or leave blank if unspecified"
    }
  ]
}

Do not include any extra text, markdown code blocks (such as \`\`\`json), or explanations outside of the JSON.`;

    const userPrompt = `
Meeting Title: ${meeting.title}
Meeting Description: ${meeting.description || '(No description)'}
Shared Notes: ${meeting.notes || '(No notes saved)'}

Meeting Logs (Chat & Spoken Transcript):
${formattedLogs || '(No chat or transcript recorded)'}
`;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.2,
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ 
        message: `Groq API responded with error: ${response.status}`, 
        error: errorText 
      });
    }

    const result = await response.json();
    const contentText = result.choices?.[0]?.message?.content;
    
    if (!contentText) {
      return res.status(500).json({ message: 'Invalid response structure from Groq API' });
    }

    // Parse the JSON object from the LLM
    let aiData;
    try {
      aiData = JSON.parse(contentText);
    } catch (parseErr) {
      console.error('Failed to parse AI content as JSON:', contentText);
      return res.status(500).json({ 
        message: 'AI output could not be parsed as valid JSON', 
        rawContent: contentText 
      });
    }

    // Update the meeting fields
    meeting.summary = aiData.summary || 'Summary could not be generated.';
    meeting.actionItems = (aiData.actionItems || []).map(item => ({
      task: item.task,
      priority: ['low', 'medium', 'high'].includes(item.priority) ? item.priority : 'medium',
      assigneeName: item.assigneeName || ''
    }));
    meeting.aiProcessed = true;

    await meeting.save();

    const populated = await Meeting.findById(meeting._id).populate('host', 'name email').populate('participants', 'name email');
    res.status(200).json(populated);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Summarize chat messages of an ongoing meeting
// @route   POST /api/meetings/:id/summarize-chats
// @access  Private
exports.summarizeMeetingChats = async (req, res) => {
  try {
    const MeetingMessage = require('../models/MeetingMessage');
    const meeting = await Meeting.findById(req.params.id);

    if (!meeting) {
      return res.status(404).json({ message: 'Meeting not found' });
    }

    // Fetch only chat messages (type: 'message')
    const messages = await MeetingMessage.find({ 
      roomId: meeting.roomId, 
      type: 'message' 
    }).sort({ createdAt: 1 });

    if (messages.length === 0) {
      return res.status(200).json({ summary: "No chat messages recorded yet." });
    }

    const formattedChats = messages.map(m => `${m.senderName}: ${m.text}`).join('\n');

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ message: 'GROQ_API_KEY is not configured in backend .env file.' });
    }

    const prompt = `You are a meeting assistant. Summarize the following meeting chat log in a brief, concise paragraph (2-3 sentences max). Focus only on key questions, answers, and decisions made in the chat:

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
