const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const cookieParser = require('cookie-parser');
const http = require('http');
const { Server } = require('socket.io');

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const chatRoutes = require('./routes/chatRoutes');
const Message = require('./models/Message');
const User = require('./models/User');
const workspaceRoutes = require('./routes/workspaceRoutes');

// Load environment variables
dotenv.config();

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

// Basic health check route
app.get('/api/health', (req, res) => {
  res.status(200).json({ message: 'Server is healthy' });
});

// Socket.io Logic
const onlineUsers = new Map(); // Map of userId -> socketId

io.on('connection', (socket) => {
  console.log(`Socket Connected: ${socket.id}`);

  // User comes online
  socket.on('register_user', async (userId) => {
    onlineUsers.set(userId, socket.id);
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
      const receiverSocketId = onlineUsers.get(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit('receiveMessage', newMessage);
      }
      
      // Also send it back to the sender so their UI updates with the actual DB record
      socket.emit('receiveMessage', newMessage);
      
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
    const receiverSocketId = onlineUsers.get(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('typing', { senderId, receiverId });
    }
  });

  socket.on('stop_typing', ({ senderId, receiverId }) => {
    const receiverSocketId = onlineUsers.get(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('stop_typing', { senderId, receiverId });
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
    } catch (err) {
      console.error('Error sending workspace message:', err);
    }
  });

  // Workspace Kanban Task synchronization
  socket.on('update_workspace_task', ({ workspaceId, task }) => {
    io.to(`workspace_${workspaceId}`).emit('workspace_task_synced', task);
  });

  // Workspace Collaborative Notes sync
  socket.on('edit_workspace_notes', ({ workspaceId, content, senderId }) => {
    socket.to(`workspace_${workspaceId}`).emit('workspace_notes_synced', { content, lastUpdatedBy: senderId });
  });

  // Workspace Channel creation sync
  socket.on('create_channel', ({ workspaceId, workspace }) => {
    io.to(`workspace_${workspaceId}`).emit('workspace_updated', workspace);
  });

  // User disconnects
  socket.on('disconnect', async () => {
    console.log(`Socket Disconnected: ${socket.id}`);
    for (const [userId, socketId] of onlineUsers.entries()) {
      if (socketId === socket.id) {
        onlineUsers.delete(userId);
        io.emit('online_users', Array.from(onlineUsers.keys()));
        
        try {
          const lastSeen = new Date();
          await User.findByIdAndUpdate(userId, { status: 'offline', lastSeen });
          io.emit('status_changed', { userId, status: 'offline', lastSeen });
        } catch (err) {
          console.error('Error disconnecting user status:', err);
        }
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
