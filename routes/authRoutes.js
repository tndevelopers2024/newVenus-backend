const express = require('express');
const router = express.Router();
const { registerUser, verifyOTP, authUser, forgotPassword, resetPassword } = require('../controllers/authController');

// router.post('/register', registerUser); // Disabled: Admin-only registration
router.post('/verify-otp', verifyOTP);
router.post('/login', authUser);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

module.exports = router;
