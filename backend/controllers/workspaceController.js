const Workspace = require('../models/Workspace');
const WorkspaceMessage = require('../models/WorkspaceMessage');
const WorkspaceTask = require('../models/WorkspaceTask');
const WorkspaceNotes = require('../models/WorkspaceNotes');
const User = require('../models/User');

// @desc    Get all workspaces the current user is a member of
// @route   GET /api/workspaces
// @access  Private
exports.getWorkspaces = async (req, res) => {
  try {
    const workspaces = await Workspace.find({
      'members.user': req.user._id
    }).populate('members.user', 'name email status role');
    
    res.status(200).json(workspaces);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Create a new team workspace
// @route   POST /api/workspaces
// @access  Private
exports.createWorkspace = async (req, res) => {
  try {
    const { name, description } = req.body;
    
    if (!name) {
      return res.status(400).json({ message: 'Please provide a workspace name' });
    }

    const existing = await Workspace.findOne({ name });
    if (existing) {
      return res.status(400).json({ message: 'Workspace name already exists' });
    }

    const newWorkspace = await Workspace.create({
      name,
      description,
      createdBy: req.user._id,
      members: [{ user: req.user._id, role: 'admin' }],
      channels: [
        { name: 'general', description: 'Company-wide announcements and work-based chat' },
        { name: 'announcements', description: 'Official announcements and notices' }
      ]
    });

    // Initialize blank notes for this workspace
    await WorkspaceNotes.create({
      workspaceId: newWorkspace._id,
      content: `# Welcome to ${name} Shared Notes! \n\nUse this collaborative canvas to document sprints, outline architectures, and auto-save checklists together in real time. 📝`,
      lastUpdatedBy: req.user._id
    });

    const populated = await Workspace.findById(newWorkspace._id).populate('members.user', 'name email status role');

    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get single workspace details by ID
// @route   GET /api/workspaces/:id
// @access  Private
exports.getWorkspaceById = async (req, res) => {
  try {
    const workspace = await Workspace.findById(req.params.id)
      .populate('members.user', 'name email status role');

    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    // Verify user membership
    const isMember = workspace.members.some(m => m.user._id.toString() === req.user._id.toString());
    if (!isMember) {
      return res.status(403).json({ message: 'Not authorized to access this workspace' });
    }

    res.status(200).json(workspace);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Add member to workspace by email
// @route   POST /api/workspaces/:id/members
// @access  Private
exports.addMember = async (req, res) => {
  try {
    const { email, role } = req.body;
    const workspace = await Workspace.findById(req.params.id);

    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    // Verify current user is admin in workspace
    const userRole = workspace.members.find(m => m.user.toString() === req.user._id.toString());
    if (!userRole || userRole.role !== 'admin') {
      return res.status(403).json({ message: 'Only workspace admins can invite members' });
    }

    const invitedUser = await User.findOne({ email });
    if (!invitedUser) {
      return res.status(404).json({ message: 'User not found with this email' });
    }

    const alreadyMember = workspace.members.some(m => m.user.toString() === invitedUser._id.toString());
    if (alreadyMember) {
      return res.status(400).json({ message: 'User is already a member of this workspace' });
    }

    workspace.members.push({ user: invitedUser._id, role: role || 'member' });
    await workspace.save();

    const populated = await Workspace.findById(workspace._id).populate('members.user', 'name email status role');
    res.status(200).json(populated);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Remove member from workspace
// @route   DELETE /api/workspaces/:id/members/:userId
// @access  Private
exports.removeMember = async (req, res) => {
  try {
    const workspace = await Workspace.findById(req.params.id);

    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    // Verify current user is admin (or removing themselves)
    const currentMember = workspace.members.find(m => m.user.toString() === req.user._id.toString());
    const isSelfRemoval = req.params.userId === req.user._id.toString();

    if (!isSelfRemoval && (!currentMember || currentMember.role !== 'admin')) {
      return res.status(403).json({ message: 'Only workspace admins can remove members' });
    }

    workspace.members = workspace.members.filter(m => m.user.toString() !== req.params.userId);
    await workspace.save();

    const populated = await Workspace.findById(workspace._id).populate('members.user', 'name email status role');
    res.status(200).json(populated);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get channel messages
// @route   GET /api/workspaces/:id/channels/:channelId/messages
// @access  Private
exports.getChannelMessages = async (req, res) => {
  try {
    const messages = await WorkspaceMessage.find({
      workspaceId: req.params.id,
      channelId: req.params.channelId
    }).sort({ createdAt: 1 });

    res.status(200).json(messages);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get workspace tasks (Kanban)
// @route   GET /api/workspaces/:id/tasks
// @access  Private
exports.getWorkspaceTasks = async (req, res) => {
  try {
    const tasks = await WorkspaceTask.find({ workspaceId: req.params.id })
      .populate('assignee', 'name email status');
      
    res.status(200).json(tasks);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Create workspace task
// @route   POST /api/workspaces/:id/tasks
// @access  Private
exports.createWorkspaceTask = async (req, res) => {
  try {
    const { title, description, status, priority, assigneeId, dueDate } = req.body;
    
    if (!title) {
      return res.status(400).json({ message: 'Please provide a task title' });
    }

    const newTask = await WorkspaceTask.create({
      workspaceId: req.params.id,
      title,
      description,
      status: status || 'todo',
      priority: priority || 'medium',
      assignee: assigneeId || null,
      dueDate: dueDate || null
    });

    if (assigneeId && assigneeId.toString() !== req.user._id.toString()) {
      try {
        const Notification = require('../models/Notification');
        const assignedTaskNotification = await Notification.create({
          recipient: assigneeId,
          sender: req.user._id,
          senderName: req.user.name,
          type: 'task_assigned',
          title: 'New Task Assigned',
          message: `${req.user.name} assigned you the task: "${title}"`,
          relatedId: newTask._id,
          relatedModel: 'WorkspaceTask'
        });
        const io = req.app.get('io');
        const onlineUsers = req.app.get('onlineUsers');
        if (io && onlineUsers) {
          const receiverSockets = onlineUsers.get(assigneeId.toString());
          if (receiverSockets) {
            for (const socketId of receiverSockets) {
              io.to(socketId).emit('new_notification', assignedTaskNotification);
            }
          }
        }
      } catch (err) {
        console.error('Error creating task assignment notification:', err);
      }
    }

    const populated = await WorkspaceTask.findById(newTask._id).populate('assignee', 'name email status');

    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Update workspace task status/content
// @route   PUT /api/workspaces/:id/tasks/:taskId
// @access  Private
exports.updateWorkspaceTask = async (req, res) => {
  try {
    const { title, description, status, priority, assigneeId, dueDate } = req.body;

    const task = await WorkspaceTask.findById(req.params.taskId);
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    const oldAssignee = task.assignee ? task.assignee.toString() : null;

    if (title !== undefined) task.title = title;
    if (description !== undefined) task.description = description;
    if (status !== undefined) task.status = status;
    if (priority !== undefined) task.priority = priority;
    if (assigneeId !== undefined) task.assignee = assigneeId || null;
    if (dueDate !== undefined) task.dueDate = dueDate || null;

    await task.save();

    const newAssignee = task.assignee ? task.assignee.toString() : null;
    if (newAssignee && newAssignee !== oldAssignee && newAssignee !== req.user._id.toString()) {
      try {
        const Notification = require('../models/Notification');
        const assignedTaskNotification = await Notification.create({
          recipient: newAssignee,
          sender: req.user._id,
          senderName: req.user.name,
          type: 'task_assigned',
          title: 'Task Assigned to You',
          message: `${req.user.name} assigned you the task: "${task.title}"`,
          relatedId: task._id,
          relatedModel: 'WorkspaceTask'
        });
        const io = req.app.get('io');
        const onlineUsers = req.app.get('onlineUsers');
        if (io && onlineUsers) {
          const receiverSockets = onlineUsers.get(newAssignee);
          if (receiverSockets) {
            for (const socketId of receiverSockets) {
              io.to(socketId).emit('new_notification', assignedTaskNotification);
            }
          }
        }
      } catch (err) {
        console.error('Error creating task assignment update notification:', err);
      }
    }

    const populated = await WorkspaceTask.findById(task._id).populate('assignee', 'name email status');

    res.status(200).json(populated);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Delete workspace task
// @route   DELETE /api/workspaces/:id/tasks/:taskId
// @access  Private
exports.deleteWorkspaceTask = async (req, res) => {
  try {
    const workspace = await Workspace.findById(req.params.id);
    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    // Verify user role is admin or creator
    const isCreator = workspace.createdBy && workspace.createdBy.toString() === req.user._id.toString();
    const memberRecord = workspace.members.find(m => m.user && m.user.toString() === req.user._id.toString());
    const isAdmin = isCreator || (memberRecord && memberRecord.role === 'admin');

    if (!isAdmin) {
      return res.status(403).json({ message: 'Only workspace admins can delete tasks' });
    }

    const task = await WorkspaceTask.findById(req.params.taskId);
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    await task.deleteOne();
    res.status(200).json({ message: 'Task deleted successfully', taskId: req.params.taskId });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get collaborative notes
// @route   GET /api/workspaces/:id/notes
// @access  Private
exports.getWorkspaceNotes = async (req, res) => {
  try {
    let notes = await WorkspaceNotes.findOne({ workspaceId: req.params.id })
      .populate('lastUpdatedBy', 'name');

    if (!notes) {
      notes = await WorkspaceNotes.create({
        workspaceId: req.params.id,
        content: '# Team Notes\n\nUse this canvas for shared planning.',
        lastUpdatedBy: req.user._id
      });
    }

    res.status(200).json(notes);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Update collaborative notes
// @route   PUT /api/workspaces/:id/notes
// @access  Private
exports.updateWorkspaceNotes = async (req, res) => {
  try {
    const { content } = req.body;

    let notes = await WorkspaceNotes.findOne({ workspaceId: req.params.id });
    if (!notes) {
      notes = new WorkspaceNotes({ workspaceId: req.params.id });
    }

    notes.content = content;
    notes.lastUpdatedBy = req.user._id;
    await notes.save();

    const populated = await WorkspaceNotes.findById(notes._id).populate('lastUpdatedBy', 'name');

    res.status(200).json(populated);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Create a new channel inside workspace
// @route   POST /api/workspaces/:id/channels
// @access  Private
exports.createChannel = async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) {
      return res.status(400).json({ message: 'Please provide a channel name' });
    }

    const workspace = await Workspace.findById(req.params.id);
    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    const normalizedName = name.trim().toLowerCase().replace(/\s+/g, '-');

    // Check if channel name exists
    const channelExists = workspace.channels.some(c => c.name === normalizedName);
    if (channelExists) {
      return res.status(400).json({ message: 'A channel with this name already exists' });
    }

    workspace.channels.push({ name: normalizedName, description });
    await workspace.save();

    const populated = await Workspace.findById(workspace._id).populate('members.user', 'name email status role');
    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get workspace analytics
// @route   GET /api/workspaces/:id/analytics
// @access  Private
exports.getWorkspaceAnalytics = async (req, res) => {
  try {
    const Meeting = require('../models/Meeting');
    const workspaceId = req.params.id;
    const workspace = await Workspace.findById(workspaceId).populate('members.user', 'name email');
    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    // Verify user membership
    const isMember = workspace.members.some(m => m.user._id.toString() === req.user._id.toString());
    if (!isMember) {
      return res.status(403).json({ message: 'Not authorized to access this workspace' });
    }

    const memberIds = workspace.members.map(m => m.user._id);

    // 1. Task Completion & Productivity Metrics
    const tasks = await WorkspaceTask.find({ workspaceId }).populate('assignee', 'name email');
    const totalTasks = tasks.length;
    const todoTasks = tasks.filter(t => t.status === 'todo').length;
    const inProgressTasks = tasks.filter(t => t.status === 'in-progress').length;
    const completedTasks = tasks.filter(t => t.status === 'done').length;
    const productivityRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    const lowPriority = tasks.filter(t => t.priority === 'low');
    const mediumPriority = tasks.filter(t => t.priority === 'medium');
    const highPriority = tasks.filter(t => t.priority === 'high');

    const priorityStats = {
      low: { total: lowPriority.length, completed: lowPriority.filter(t => t.status === 'done').length },
      medium: { total: mediumPriority.length, completed: mediumPriority.filter(t => t.status === 'done').length },
      high: { total: highPriority.length, completed: highPriority.filter(t => t.status === 'done').length },
    };

    // Task velocity (completed tasks in the last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const completedTasksLast7Days = tasks.filter(t => 
      t.status === 'done' && 
      t.updatedAt >= sevenDaysAgo
    );

    const dailyVelocity = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date();
      date.setDate(date.getDate() - (6 - i));
      const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      
      const count = completedTasksLast7Days.filter(t => {
        const d = new Date(t.updatedAt);
        return d.getDate() === date.getDate() && d.getMonth() === date.getMonth() && d.getFullYear() === date.getFullYear();
      }).length;

      dailyVelocity.push({ name: dateStr, completed: count });
    }

    // Tasks completed by member
    const taskAssigneeStats = workspace.members.map(member => {
      const memberTasks = tasks.filter(t => t.assignee && t.assignee._id.toString() === member.user._id.toString());
      return {
        userId: member.user._id,
        name: member.user.name,
        total: memberTasks.length,
        completed: memberTasks.filter(t => t.status === 'done').length
      };
    });

    // 2. Chat Engagement Metrics (Messages sent in channels)
    const chatStats = [];
    for (const member of workspace.members) {
      const messageCount = await WorkspaceMessage.countDocuments({
        workspaceId,
        senderId: member.user._id
      });
      chatStats.push({
        userId: member.user._id,
        name: member.user.name,
        count: messageCount
      });
    }

    // 3. Meeting Frequency and Duration Metrics
    // Query completed meetings of this workspace exclusively
    const meetings = await Meeting.find({
      status: 'completed',
      workspaceId: workspaceId
    }).sort({ date: 1, time: 1 });

    const totalMeetings = meetings.length;
    const totalDuration = meetings.reduce((acc, m) => acc + (m.duration || 0), 0); // in seconds
    const avgDuration = totalMeetings > 0 ? Math.round(totalDuration / totalMeetings) : 0; // in seconds

    // Weekly/daily meeting call duration tracking for the last 7 days
    const dailyMeetingDurations = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date();
      date.setDate(date.getDate() - (6 - i));
      const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      const durationForDay = meetings.filter(m => {
        // Parse the date string of the meeting (or fall back to createdAt)
        const mDate = m.date ? new Date(m.date) : new Date(m.createdAt);
        return mDate.getDate() === date.getDate() && mDate.getMonth() === date.getMonth() && mDate.getFullYear() === date.getFullYear();
      }).reduce((acc, m) => acc + (m.duration || 0), 0);

      dailyMeetingDurations.push({ name: dateStr, duration: Math.round(durationForDay / 60) }); // in minutes
    }

    // Call presence (meetings attended per member)
    const callPresence = workspace.members.map(member => {
      const attended = meetings.filter(m => 
        (m.host && m.host.toString() === member.user._id.toString()) || 
        (Array.isArray(m.participants) && m.participants.some(p => p.toString() === member.user._id.toString()))
      ).length;
      return {
        userId: member.user._id,
        name: member.user.name,
        meetingsAttended: attended
      };
    });

    res.status(200).json({
      tasks: {
        total: totalTasks,
        todo: todoTasks,
        inProgress: inProgressTasks,
        completed: completedTasks,
        productivityRate,
        priorityStats,
        velocity: dailyVelocity,
        assigneeStats: taskAssigneeStats
      },
      engagement: {
        chatStats
      },
      meetings: {
        total: totalMeetings,
        totalDuration,
        avgDuration,
        dailyDurations: dailyMeetingDurations,
        callPresence
      }
    });

  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Update a channel inside workspace
// @route   PUT /api/workspaces/:id/channels/:channelId
// @access  Private
exports.updateChannel = async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) {
      return res.status(400).json({ message: 'Please provide a channel name' });
    }

    const workspace = await Workspace.findById(req.params.id);
    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    // Verify current user is admin in workspace or creator
    const isCreator = workspace.createdBy && workspace.createdBy.toString() === req.user._id.toString();
    const userRole = workspace.members.find(m => m.user && m.user.toString() === req.user._id.toString());
    const isAdmin = isCreator || (userRole && userRole.role === 'admin');

    if (!isAdmin) {
      return res.status(403).json({ message: 'Only workspace admins can modify channels' });
    }

    const channel = workspace.channels.id(req.params.channelId);
    if (!channel) {
      return res.status(404).json({ message: 'Channel not found' });
    }

    // Default channels cannot be modified
    if (channel.name === 'general' || channel.name === 'announcements') {
      return res.status(400).json({ message: 'Default channels cannot be modified' });
    }

    const normalizedName = name.trim().toLowerCase().replace(/\s+/g, '-');

    // Check if duplicate name (other than this channel)
    const duplicate = workspace.channels.some(c => c.name === normalizedName && c._id.toString() !== req.params.channelId);
    if (duplicate) {
      return res.status(400).json({ message: 'Another channel with this name already exists' });
    }

    channel.name = normalizedName;
    channel.description = description || '';
    await workspace.save();

    const populated = await Workspace.findById(workspace._id).populate('members.user', 'name email status role');
    res.status(200).json(populated);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Delete a channel from workspace
// @route   DELETE /api/workspaces/:id/channels/:channelId
// @access  Private
exports.deleteChannel = async (req, res) => {
  try {
    const workspace = await Workspace.findById(req.params.id);
    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    // Verify current user is admin in workspace or creator
    const isCreator = workspace.createdBy && workspace.createdBy.toString() === req.user._id.toString();
    const userRole = workspace.members.find(m => m.user && m.user.toString() === req.user._id.toString());
    const isAdmin = isCreator || (userRole && userRole.role === 'admin');

    if (!isAdmin) {
      return res.status(403).json({ message: 'Only workspace admins can delete channels' });
    }

    const channel = workspace.channels.id(req.params.channelId);
    if (!channel) {
      return res.status(404).json({ message: 'Channel not found' });
    }

    // Default channels cannot be deleted
    if (channel.name === 'general' || channel.name === 'announcements') {
      return res.status(400).json({ message: 'Default channels cannot be deleted' });
    }

    // Remove the channel
    workspace.channels.pull(req.params.channelId);
    await workspace.save();

    // Also delete associated messages
    await WorkspaceMessage.deleteMany({ channelId: req.params.channelId });

    const populated = await Workspace.findById(workspace._id).populate('members.user', 'name email status role');
    res.status(200).json(populated);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Summarize workspace channel messages via Groq
// @route   POST /api/workspaces/:id/channels/:channelId/summarize
// @access  Private
exports.summarizeChannelMessages = async (req, res) => {
  try {
    const workspaceId = req.params.id;
    const channelId = req.params.channelId;

    const messages = await WorkspaceMessage.find({
      workspaceId,
      channelId
    }).sort({ createdAt: 1 });

    if (messages.length === 0) {
      return res.status(200).json({ summary: "No channel messages recorded yet." });
    }

    const formattedChats = messages.map(m => `${m.senderName}: ${m.text}`).join('\n');

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ message: 'GROQ_API_KEY is not configured in backend .env file.' });
    }

    const prompt = `You are a chat assistant. Summarize the following workspace channel chat message log in a brief, concise paragraph (2-3 sentences max). Focus only on key questions, answers, and decisions made in the chat:

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


