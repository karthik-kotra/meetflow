const express = require('express');
const {
  getWorkspaces,
  createWorkspace,
  getWorkspaceById,
  addMember,
  removeMember,
  getChannelMessages,
  getWorkspaceTasks,
  createWorkspaceTask,
  updateWorkspaceTask,
  getWorkspaceNotes,
  updateWorkspaceNotes,
  createChannel,
  getWorkspaceAnalytics,
  updateChannel,
  deleteChannel,
  summarizeChannelMessages,
  deleteWorkspaceTask
} = require('../controllers/workspaceController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.route('/')
  .get(getWorkspaces)
  .post(createWorkspace);

router.route('/:id')
  .get(getWorkspaceById);

router.route('/:id/members')
  .post(addMember);

router.route('/:id/members/:userId')
  .delete(removeMember);

router.route('/:id/channels')
  .post(createChannel);

router.route('/:id/channels/:channelId')
  .put(updateChannel)
  .delete(deleteChannel);

router.route('/:id/channels/:channelId/messages')
  .get(getChannelMessages);

router.route('/:id/channels/:channelId/summarize')
  .post(summarizeChannelMessages);

router.route('/:id/tasks')
  .get(getWorkspaceTasks)
  .post(createWorkspaceTask);

router.route('/:id/tasks/:taskId')
  .put(updateWorkspaceTask)
  .delete(deleteWorkspaceTask);

router.route('/:id/notes')
  .get(getWorkspaceNotes)
  .put(updateWorkspaceNotes);

router.route('/:id/analytics')
  .get(getWorkspaceAnalytics);

module.exports = router;
