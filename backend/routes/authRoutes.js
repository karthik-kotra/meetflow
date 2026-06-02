const express = require('express');
const { 
  register, 
  login, 
  logout, 
  getProfile,
  updateProfile,
  updatePassword,
  deleteAccount
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.post('/logout', logout);

router.route('/profile')
  .get(protect, getProfile)
  .put(protect, updateProfile)
  .delete(protect, deleteAccount);

router.put('/password', protect, updatePassword);

module.exports = router;
