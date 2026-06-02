const express = require('express');
const {
  createMeeting,
  getMeetings,
  getMeetingByIdOrRoomId,
  updateMeetingStatus,
  deleteMeeting,
  updateMeetingNotes,
  processMeetingAI,
  summarizeMeetingChats,
} = require('../controllers/meetingController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.route('/')
  .post(protect, createMeeting)
  .get(protect, getMeetings);

router.route('/:id')
  .get(protect, getMeetingByIdOrRoomId)
  .delete(protect, deleteMeeting);

router.route('/:id/status')
  .patch(protect, updateMeetingStatus);

router.route('/:id/notes')
  .patch(protect, updateMeetingNotes);

router.route('/:id/process-ai')
  .post(protect, processMeetingAI);

router.route('/:id/summarize-chats')
  .post(protect, summarizeMeetingChats);

module.exports = router;
