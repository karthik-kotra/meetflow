const express = require('express');
const dotenv = require('dotenv');
// Load environment variables immediately
dotenv.config();

const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const http = require('http');
const { Server } = require('socket.io');

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const chatRoutes = require('./routes/chatRoutes');
const Message = require('./models/Message');
const User = require('./models/User');
const Meeting = require('./models/Meeting');
const MeetingMessage = require('./models/MeetingMessage');
const workspaceRoutes = require('./routes/workspaceRoutes');
const meetingRoutes = require('./routes/meetingRoutes');
const meetingChatRoutes = require('./routes/meetingChatRoutes');
const notificationRoutes = require('./routes/notificationRoutes');

const app = express();
const server = http.createServer(app);

// Initialize Socket.io
const io = new Server(server, {
  cors: {
    origin: 'http://localhost:5173', // Vite default port
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

const onlineUsers = new Map(); // Map of userId -> socketId
app.set('io', io);
app.set('onlineUsers', onlineUsers);

// Middleware
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// Database Connection
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log('✅ MongoDB Connected'))
.catch(err => console.error('❌ MongoDB Connection Error:', err));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/workspaces', workspaceRoutes);
app.use('/api/meetings', meetingRoutes);
app.use('/api/meeting-chat', meetingChatRoutes);
app.use('/api/notifications', notificationRoutes);

// Serve static uploads folder
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Basic health check route
app.get('/api/health', (req, res) => {
  res.status(200).json({ message: 'Server is healthy' });
});

// Socket.io Logic
const meetingRooms = new Map(); // Map of roomId -> Map of socketId -> { userId, name, mic, cam }

io.on('connection', (socket) => {
  console.log(`Socket Connected: ${socket.id}`);

  // User comes online
  socket.on('register_user', async (userId) => {
    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
    }
    onlineUsers.get(userId).add(socket.id);
    io.emit('online_users', Array.from(onlineUsers.keys()));
    
    try {
      const lastSeen = new Date();
      await User.findByIdAndUpdate(userId, { status: 'online', lastSeen });
      io.emit('status_changed', { userId, status: 'online', lastSeen });
    } catch (err) {
      console.error('Error registering user status:', err);
    }
  });

  // Handle sending messages
  socket.on('sendMessage', async (data) => {
    const { senderId, receiverId, text } = data;

    try {
      // Save message to MongoDB
      const newMessage = await Message.create({
        senderId,
        receiverId,
        text,
      });

      // Send to the receiver if they are online
      const receiverSockets = onlineUsers.get(receiverId);
      if (receiverSockets) {
        for (const socketId of receiverSockets) {
          io.to(socketId).emit('receiveMessage', newMessage);
        }
      }
      
      // Send back to the sender's sockets so all active tabs of the sender sync
      const senderSockets = onlineUsers.get(senderId);
      if (senderSockets) {
        for (const socketId of senderSockets) {
          io.to(socketId).emit('receiveMessage', newMessage);
        }
      } else {
        socket.emit('receiveMessage', newMessage);
      }

      // Parse user mentions in direct chat messages
      try {
        const sender = await User.findById(senderId);
        const receiver = await User.findById(receiverId);
        if (sender && receiver && receiverId.toString() !== senderId.toString()) {
          const mentionRegex = new RegExp(`@${receiver.name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}`, 'i');
          if (mentionRegex.test(text)) {
            const Notification = require('./models/Notification');
            const mentionNotification = await Notification.create({
              recipient: receiverId,
              sender: senderId,
              senderName: sender.name,
              type: 'mention',
              title: 'Mentioned in Direct Chat',
              message: `${sender.name} mentioned you in direct chat: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`,
              relatedId: senderId,
              relatedModel: 'User'
            });
            if (receiverSockets) {
              for (const socketId of receiverSockets) {
                io.to(socketId).emit('new_notification', mentionNotification);
              }
            }
          }
        }
      } catch (mentionErr) {
        console.error('Error handling direct chat mention parsing:', mentionErr);
      }
      
    } catch (err) {
      console.error('Error saving message:', err);
    }
  });

  // Status manual update
  socket.on('update_status', async ({ userId, status }) => {
    try {
      const lastSeen = new Date();
      await User.findByIdAndUpdate(userId, { status, lastSeen });
      io.emit('status_changed', { userId, status, lastSeen });
    } catch (err) {
      console.error('Error updating status:', err);
    }
  });

  // Typing indicators
  socket.on('typing', ({ senderId, receiverId }) => {
    const receiverSockets = onlineUsers.get(receiverId);
    if (receiverSockets) {
      for (const socketId of receiverSockets) {
        io.to(socketId).emit('typing', { senderId, receiverId });
      }
    }
  });

  socket.on('stop_typing', ({ senderId, receiverId }) => {
    const receiverSockets = onlineUsers.get(receiverId);
    if (receiverSockets) {
      for (const socketId of receiverSockets) {
        io.to(socketId).emit('stop_typing', { senderId, receiverId });
      }
    }
  });

  // Mark read event
  socket.on('mark_read', async ({ senderId, receiverId }) => {
    try {
      await Message.updateMany(
         { senderId, receiverId, read: false },
         { $set: { read: true } }
      );
    } catch (err) {
      console.error('Error marking messages as read:', err);
    }
  });

  // Workspace Rooms joining
  socket.on('join_workspace', ({ workspaceId }) => {
    socket.join(`workspace_${workspaceId}`);
    console.log(`Socket ${socket.id} joined workspace room: workspace_${workspaceId}`);
  });

  // Workspace Chat Message routing
  socket.on('send_workspace_message', async ({ workspaceId, channelId, senderId, senderName, text }) => {
    try {
      const WorkspaceMessage = require('./models/WorkspaceMessage');
      const newMessage = await WorkspaceMessage.create({
        workspaceId,
        channelId,
        senderId,
        senderName,
        text
      });
      io.to(`workspace_${workspaceId}`).emit('workspace_message_received', newMessage);

      // Parse user mentions in workspace chat
      const Workspace = require('./models/Workspace');
      const workspace = await Workspace.findById(workspaceId).populate('members.user');
      if (workspace) {
        for (const member of workspace.members) {
          const memberUser = member.user;
          if (memberUser && memberUser._id.toString() !== senderId.toString()) {
            const name = memberUser.name;
            const mentionRegex = new RegExp(`@${name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}`, 'i');
            if (mentionRegex.test(text)) {
              const Notification = require('./models/Notification');
              const mentionNotification = await Notification.create({
                recipient: memberUser._id,
                sender: senderId,
                senderName,
                type: 'mention',
                title: 'Mentioned in Chat',
                message: `${senderName} mentioned you in workspace chat: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`,
                relatedId: workspaceId,
                relatedModel: 'Workspace'
              });
              const receiverSockets = onlineUsers.get(memberUser._id.toString());
              if (receiverSockets) {
                for (const socketId of receiverSockets) {
                  io.to(socketId).emit('new_notification', mentionNotification);
                }
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('Error sending workspace message:', err);
    }
  });

  // Workspace Kanban Task synchronization
  socket.on('update_workspace_task', ({ workspaceId, task }) => {
    io.to(`workspace_${workspaceId}`).emit('workspace_task_synced', task);
  });

  // Workspace Kanban Task deletion sync
  socket.on('delete_workspace_task', ({ workspaceId, taskId }) => {
    io.to(`workspace_${workspaceId}`).emit('workspace_task_deleted', taskId);
  });

  // Workspace Collaborative Notes sync
  socket.on('edit_workspace_notes', ({ workspaceId, content, senderId }) => {
    socket.to(`workspace_${workspaceId}`).emit('workspace_notes_synced', { content, lastUpdatedBy: senderId });
  });

  // Workspace Channel creation sync
  socket.on('create_channel', ({ workspaceId, workspace }) => {
    io.to(`workspace_${workspaceId}`).emit('workspace_updated', workspace);
  });

  // Workspace Channel Typing Telemetry
  socket.on('workspace_typing', ({ workspaceId, channelId, userId, userName }) => {
    socket.to(`workspace_${workspaceId}`).emit('workspace_user_typing', { channelId, userId, userName });
  });

  socket.on('workspace_stop_typing', ({ workspaceId, channelId, userId }) => {
    socket.to(`workspace_${workspaceId}`).emit('workspace_user_stop_typing', { channelId, userId });
  });

  // --- WebRTC Video Call Signaling ---

  // User joins a meeting room
  socket.on('join_meeting', async ({ roomId, userId, name, mic, cam }) => {
    socket.join(`meeting_${roomId}`);
    
    // Add user to database participants array dynamically
    try {
      const Meeting = require('./models/Meeting');
      await Meeting.updateOne(
        { roomId },
        { $addToSet: { participants: userId } }
      );
    } catch (err) {
      console.error('Error adding participant to database meeting:', err);
    }
    
    if (!meetingRooms.has(roomId)) {
      meetingRooms.set(roomId, new Map());
    }
    const roomParticipants = meetingRooms.get(roomId);
    roomParticipants.set(socket.id, { userId, name, mic, cam });

    console.log(`Socket ${socket.id} (${name}) joined meeting room: meeting_${roomId}`);

    // Compile list of other participants already in the room
    const otherParticipants = [];
    for (const [sId, meta] of roomParticipants.entries()) {
      if (sId !== socket.id) {
        otherParticipants.push({
          socketId: sId,
          userId: meta.userId,
          name: meta.name,
          mic: meta.mic,
          cam: meta.cam
        });
      }
    }

    // Send the list of existing participants to the joiner
    socket.emit('room_participants', otherParticipants);

    // Broadcast user joined event to other participants
    socket.to(`meeting_${roomId}`).emit('peer_joined', {
      socketId: socket.id,
      userId,
      name,
      mic,
      cam
    });

    // Save system message for join & broadcast to others
    MeetingMessage.create({
      roomId,
      senderName: 'System',
      text: `${name} joined the meeting`,
      type: 'system'
    }).then(msg => {
      socket.to(`meeting_${roomId}`).emit('meeting_receive_message', msg);
    }).catch(err => {
      console.error('Error saving join system message:', err);
    });
  });

  // Relay SDP offer to target peer
  socket.on('send_offer', ({ targetSocketId, offer, senderName, senderId }) => {
    io.to(targetSocketId).emit('receive_offer', {
      senderSocketId: socket.id,
      offer,
      senderName,
      senderId
    });
  });

  // Relay SDP answer to target peer
  socket.on('send_answer', ({ targetSocketId, answer }) => {
    io.to(targetSocketId).emit('receive_answer', {
      senderSocketId: socket.id,
      answer
    });
  });

  // Relay ICE candidate to target peer
  socket.on('send_ice_candidate', ({ targetSocketId, candidate }) => {
    io.to(targetSocketId).emit('receive_ice_candidate', {
      senderSocketId: socket.id,
      candidate
    });
  });

  // Broadcast mic/cam status toggles
  socket.on('toggle_media', ({ roomId, type, enabled }) => {
    const roomParticipants = meetingRooms.get(roomId);
    if (roomParticipants && roomParticipants.has(socket.id)) {
      const meta = roomParticipants.get(socket.id);
      if (type === 'audio') meta.mic = enabled;
      if (type === 'video') meta.cam = enabled;
    }
    socket.to(`meeting_${roomId}`).emit('peer_media_toggled', {
      socketId: socket.id,
      type,
      enabled
    });
  });

  // User leaves a meeting room cleanly
  socket.on('leave_meeting', async ({ roomId }) => {
    const roomParticipants = meetingRooms.get(roomId);
    if (roomParticipants && roomParticipants.has(socket.id)) {
      const meta = roomParticipants.get(socket.id);
      const name = meta.name;

      // Save system message for leave & broadcast
      MeetingMessage.create({
        roomId,
        senderName: 'System',
        text: `${name} left the meeting`,
        type: 'system'
      }).then(msg => {
        socket.to(`meeting_${roomId}`).emit('meeting_receive_message', msg);
      }).catch(err => {
        console.error('Error saving leave system message:', err);
      });

      roomParticipants.delete(socket.id);
      if (roomParticipants.size === 0) {
        meetingRooms.delete(roomId);
        try {
          const meeting = await Meeting.findOne({ roomId });
          if (meeting && meeting.status !== 'completed') {
            meeting.status = 'completed';
            meeting.endedAt = new Date();
            if (meeting.startedAt) {
              meeting.duration = Math.round((meeting.endedAt - meeting.startedAt) / 1000);
            } else {
              meeting.duration = Math.round((meeting.endedAt - meeting.createdAt) / 1000);
            }
            await meeting.save();
            console.log(`Meeting room ${roomId} is empty. Status cleanly updated to completed with duration ${meeting.duration}s.`);
          }
        } catch (err) {
          console.error(`Failed to mark meeting ${roomId} as completed:`, err);
        }
      }
    }
    socket.leave(`meeting_${roomId}`);
    socket.to(`meeting_${roomId}`).emit('peer_left', {
      socketId: socket.id
    });
    console.log(`Socket ${socket.id} cleanly left meeting room: meeting_${roomId}`);
  });

  // --- In-Meeting Collaboration socket handlers ---
  socket.on('meeting_send_message', async ({ roomId, senderId, senderName, text }) => {
    try {
      const newMessage = await MeetingMessage.create({
        roomId,
        senderId,
        senderName,
        text,
        type: 'message'
      });
      io.to(`meeting_${roomId}`).emit('meeting_receive_message', newMessage);
    } catch (err) {
      console.error('Error saving meeting message:', err);
    }
  });

  socket.on('meeting_typing', ({ roomId, userId, userName }) => {
    socket.to(`meeting_${roomId}`).emit('meeting_user_typing', { userId, userName });
  });

  socket.on('meeting_stop_typing', ({ roomId, userId }) => {
    socket.to(`meeting_${roomId}`).emit('meeting_user_stop_typing', { userId });
  });

  socket.on('meeting_reaction', ({ roomId, emoji, senderName }) => {
    io.to(`meeting_${roomId}`).emit('meeting_reaction_received', { emoji, senderName, id: Math.random().toString(36).substr(2, 9) });
  });

  socket.on('meeting_raise_hand', ({ roomId, userId, userName }) => {
    io.to(`meeting_${roomId}`).emit('meeting_hand_raised', { userId, userName });
  });

  socket.on('meeting_lower_hand', ({ roomId, userId, userName }) => {
    io.to(`meeting_${roomId}`).emit('meeting_hand_lowered', { userId, userName });
  });

  socket.on('meeting_update_notes', async ({ roomId, content, senderId }) => {
    socket.to(`meeting_${roomId}`).emit('meeting_notes_synced', { content, lastUpdatedBy: senderId });
    try {
      const Meeting = require('./models/Meeting');
      await Meeting.updateOne({ roomId }, { notes: content });
    } catch (err) {
      console.error('Error auto-saving meeting notes:', err);
    }
  });

  socket.on('meeting_transcription_segment', async ({ roomId, senderId, senderName, text }) => {
    try {
      const MeetingMessage = require('./models/MeetingMessage');
      const segment = await MeetingMessage.create({
        roomId,
        senderId,
        senderName,
        text,
        type: 'transcript'
      });
      io.to(`meeting_${roomId}`).emit('meeting_transcription_received', segment);
    } catch (err) {
      console.error('Error handling meeting transcription segment:', err);
    }
  });

  // User disconnects
  socket.on('disconnect', async () => {
    console.log(`Socket Disconnected: ${socket.id}`);
    
    // Cleanup video calling rooms
    for (const [roomId, roomParticipants] of meetingRooms.entries()) {
      if (roomParticipants.has(socket.id)) {
        const meta = roomParticipants.get(socket.id);
        const name = meta ? meta.name : 'Participant';

        // Save system message for leave & broadcast
        MeetingMessage.create({
          roomId,
          senderName: 'System',
          text: `${name} left the meeting`,
          type: 'system'
        }).then(msg => {
          socket.to(`meeting_${roomId}`).emit('meeting_receive_message', msg);
        }).catch(err => {
          console.error('Error saving disconnect system message:', err);
        });

        roomParticipants.delete(socket.id);
        socket.to(`meeting_${roomId}`).emit('peer_left', {
          socketId: socket.id
        });
        if (roomParticipants.size === 0) {
          meetingRooms.delete(roomId);
          try {
            const meeting = await Meeting.findOne({ roomId });
            if (meeting && meeting.status !== 'completed') {
              meeting.status = 'completed';
              meeting.endedAt = new Date();
              if (meeting.startedAt) {
                meeting.duration = Math.round((meeting.endedAt - meeting.startedAt) / 1000);
              } else {
                meeting.duration = Math.round((meeting.endedAt - meeting.createdAt) / 1000);
              }
              await meeting.save();
              console.log(`Disconnected clean up: meeting ${roomId} marked completed with duration ${meeting.duration}s.`);
            }
          } catch (err) {
            console.error(`Failed to mark meeting ${roomId} as completed on disconnect:`, err);
          }
        }
        console.log(`Cleaned up disconnected socket ${socket.id} from meeting room: meeting_${roomId}`);
      }
    }

    for (const [userId, socketIds] of onlineUsers.entries()) {
      if (socketIds.has(socket.id)) {
        socketIds.delete(socket.id);
        if (socketIds.size === 0) {
          onlineUsers.delete(userId);
          io.emit('online_users', Array.from(onlineUsers.keys()));
          
          try {
            const lastSeen = new Date();
            await User.findByIdAndUpdate(userId, { status: 'offline', lastSeen });
            io.emit('status_changed', { userId, status: 'offline', lastSeen });
          } catch (err) {
            console.error('Error disconnecting user status:', err);
          }
        }
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
