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

    if (title !== undefined) task.title = title;
    if (description !== undefined) task.description = description;
    if (status !== undefined) task.status = status;
    if (priority !== undefined) task.priority = priority;
    if (assigneeId !== undefined) task.assignee = assigneeId || null;
    if (dueDate !== undefined) task.dueDate = dueDate || null;

    await task.save();

    const populated = await WorkspaceTask.findById(task._id).populate('assignee', 'name email status');

    res.status(200).json(populated);
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
