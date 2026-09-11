const express = require('express');
const router = express.Router();
const { register, login, guestLogin, getMe, searchUsers } = require('../controllers/authController');
const { protect } = require('../middleware/auth');

router.post('/register', register);
router.post('/login', login);
router.post('/guest', guestLogin);
router.get('/me', protect, getMe);
router.get('/search', protect, searchUsers);

module.exports = router;
