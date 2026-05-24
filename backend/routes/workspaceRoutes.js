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
  createChannel
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

router.route('/:id/channels/:channelId/messages')
  .get(getChannelMessages);

router.route('/:id/tasks')
  .get(getWorkspaceTasks)
  .post(createWorkspaceTask);

router.route('/:id/tasks/:taskId')
  .put(updateWorkspaceTask);

router.route('/:id/notes')
  .get(getWorkspaceNotes)
  .put(updateWorkspaceNotes);

module.exports = router;
