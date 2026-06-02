const express = require('express');
const { getMessages, summarizeMessages } = require('../controllers/chatController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.route('/:userId')
  .get(protect, getMessages);

router.route('/:userId/summarize')
  .post(protect, summarizeMessages);

module.exports = router;
