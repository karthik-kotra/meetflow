const mongoose = require('mongoose');
const Meeting = require('../models/Meeting');
const storageService = require('../services/storage/index');
const aiService = require('../services/aiService');

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
    const updated = await aiService.generateSummaryAndActionItems(req.params.id);
    res.status(200).json(updated);
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

// @desc    Upload meeting recording to temporary storage, cache in Redis, and trigger background AI transcription
// @route   POST /api/meetings/:id/recording
// @access  Private
exports.uploadRecording = async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id);
    if (!meeting) {
      return res.status(404).json({ message: 'Meeting not found' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'No recording file uploaded' });
    }

    const fileKey = `recording_${meeting._id}_${Date.now()}`;
    const fileBuffer = req.file.buffer;
    const mimeType = req.file.mimetype;

    console.log(`[meetingController] Uploading recording for meeting ${meeting.roomId} using StorageService. File size: ${fileBuffer.length} bytes`);

    // Store in selected storage layer (Redis for temp, S3 in prod)
    await storageService.upload(fileKey, fileBuffer, mimeType);

    // If storage is persistent (local or cloud), save playback path and ownership to Meeting document
    if (!storageService.isTemporary) {
      const ext = mimeType.includes('wav') ? 'wav' : 'webm';
      meeting.recordingUrl = `/uploads/recordings/${fileKey}.${ext}`;
      // Track who recorded this meeting so only they can play it back
      meeting.recordedBy = req.user._id;
      await meeting.save();
      console.log(`[meetingController] Recording url saved to DB: ${meeting.recordingUrl}, recorded by: ${req.user._id}`);
    }

    // Run async background processing: download, transcribe, summarize, clean up Redis
    const io = req.app.get('io');
    aiService.processRecordingAndSummary(meeting._id, fileKey, mimeType, io);

    // Respond immediately with 202 Accepted
    res.status(202).json({
      message: 'Recording uploaded successfully. AI transcription and summary generation started in the background.',
      fileKey,
      recordingUrl: meeting.recordingUrl || null,
      recordedBy: meeting.recordedBy || null
    });

  } catch (error) {
    console.error('Error uploading recording:', error);
    res.status(500).json({ message: 'Server error during recording upload', error: error.message });
  }
};

// @desc    Get WebRTC ICE servers (STUN/TURN config)
// @route   GET /api/meetings/ice-servers
// @access  Private
exports.getIceServers = async (req, res) => {
  try {
    const urls = process.env.TURN_SERVER_URLS;
    const username = process.env.TURN_SERVER_USERNAME;
    const credential = process.env.TURN_SERVER_CREDENTIAL;

    let iceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' }
    ];

    if (urls) {
      const urlList = urls.split(',').map(u => u.trim());
      iceServers.push({
        urls: urlList,
        username: username || '',
        credential: credential || ''
      });
    } else {
      // Fallback: Use free public OpenRelayProject STUN/TURN servers provided by Metered.ca
      iceServers.push(
        {
          urls: 'stun:openrelay.metered.ca:80'
        },
        {
          urls: [
            'turn:openrelay.metered.ca:80',
            'turn:openrelay.metered.ca:443',
            'turn:openrelay.metered.ca:443?transport=tcp'
          ],
          username: 'openrelayproject',
          credential: 'openrelayproject'
        }
      );
    }

    res.status(200).json({ iceServers });
  } catch (error) {
    console.error('Error getting ICE servers:', error);
    res.status(500).json({ message: 'Server error fetching ICE servers', error: error.message });
  }
};

