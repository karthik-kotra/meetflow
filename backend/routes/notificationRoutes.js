const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} = require('../controllers/notificationController');

const router = express.Router();

router.route('/')
  .get(protect, getNotifications);

router.route('/read-all')
  .patch(protect, markAllAsRead);

router.route('/:id/read')
  .patch(protect, markAsRead);

router.route('/:id')
  .delete(protect, deleteNotification);

module.exports = router;
