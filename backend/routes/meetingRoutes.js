const express = require('express');
const {
  createMeeting,
  getMeetings,
  getMeetingByIdOrRoomId,
  updateMeetingStatus,
  deleteMeeting,
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

module.exports = router;
