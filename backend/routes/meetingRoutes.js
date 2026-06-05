const express = require('express');
const multer = require('multer');
const {
  createMeeting,
  getMeetings,
  getMeetingByIdOrRoomId,
  updateMeetingStatus,
  deleteMeeting,
  updateMeetingNotes,
  processMeetingAI,
  summarizeMeetingChats,
  uploadRecording,
  getIceServers,
} = require('../controllers/meetingController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100 MB max recording size limit
  }
});

router.route('/')
  .post(protect, createMeeting)
  .get(protect, getMeetings);

router.route('/ice-servers')
  .get(protect, getIceServers);

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

router.route('/:id/recording')
  .post(protect, upload.single('recording'), uploadRecording);

module.exports = router;

