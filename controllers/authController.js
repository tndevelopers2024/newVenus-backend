const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const generateToken = require('../utils/generateToken');
const { generateOTP, sendOTP } = require('../utils/otpHelper');
const { logAction } = require('../utils/logger');

// @desc    Register user (Step 1: Get OTP)
// @route   POST /api/auth/register
// @access  Public
const registerUser = asyncHandler(async (req, res) => {
    const { name, email, phone, password } = req.body;

    const userExists = await User.findOne({ email });

    if (userExists) {
        if (!userExists.profileCreated) {
            // User exists but haven't verified OTP yet, let's update OTP and resend
            const otp = generateOTP();
            const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

            userExists.otp = { code: otp, expiresAt: otpExpires };
            if (password) userExists.password = password; // Update password if provided
            await userExists.save();

            await sendOTP(email, otp);
            return res.status(200).json({
                message: 'OTP resent to email',
                userId: userExists._id
            });
        } else {
            res.status(400);
            throw new Error('User already exists');
        }
    }

    const otp = generateOTP();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

    const user = await User.create({
        name,
        email,
        phone,
        password,
        otp: { code: otp, expiresAt: otpExpires }
    });

    if (user) {
        await sendOTP(email, otp);
        res.status(201).json({
            message: 'OTP sent to email',
            userId: user._id
        });
    } else {
        res.status(400);
        throw new Error('Invalid user data');
    }
});

// @desc    Verify OTP
// @route   POST /api/auth/verify-otp
// @access  Public
const verifyOTP = asyncHandler(async (req, res) => {
    const { userId, otp } = req.body;

    const user = await User.findById(userId);

    if (user && user.otp.code === otp && user.otp.expiresAt > Date.now()) {
        user.otp = undefined; // Clear OTP
        user.profileCreated = true;
        await user.save();

        res.json({
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            token: generateToken(user._id),
        });
    } else {
        res.status(400);
        throw new Error('Invalid or expired OTP');
    }
});

// @desc    Auth user & get token
// @route   POST /api/auth/login
// @access  Public
const authUser = asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    const user = await User.findOne({ email });

    if (user && (await user.comparePassword(password))) {
        res.json({
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            token: generateToken(user._id),
        });

        await logAction({
            user,
            action: 'Login',
            resource: 'Authentication',
            details: `User logged in successfully as ${user.role}`,
            req
        });
    } else {
        await logAction({
            user: null, // No user for failed login
            action: 'Login Failed',
            resource: 'Authentication',
            details: `Failed login attempt for email: ${email}`,
            req
        });
        res.status(401);
        throw new Error('Invalid email or password');
    }
});

// @desc    Forgot Password (Step 1: Get OTP)
// @route   POST /api/auth/forgot-password
// @access  Public
const forgotPassword = asyncHandler(async (req, res) => {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
        res.status(404);
        throw new Error('User not found');
    }

    const otp = generateOTP();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

    user.otp = { code: otp, expiresAt: otpExpires };
    await user.save();

    await sendOTP(email, otp);

    await logAction({
        user,
        action: 'Forgot Password',
        resource: 'User Account',
        details: 'Password reset OTP requested',
        req
    });

    res.json({
        message: 'Password reset OTP sent to email',
        email: user.email
    });
});

// @desc    Reset Password (Step 2: Verify OTP & Change Password)
// @route   POST /api/auth/reset-password
// @access  Public
const resetPassword = asyncHandler(async (req, res) => {
    const { email, otp, password } = req.body;
    const user = await User.findOne({ email });

    if (user && user.otp && user.otp.code === otp && user.otp.expiresAt > Date.now()) {
        user.password = password;
        user.otp = undefined; // Clear OTP
        await user.save();

        await logAction({
            user,
            action: 'Reset Password',
            resource: 'User Account',
            details: 'Password was successfully reset via OTP',
            req
        });

        res.json({ message: 'Password reset successful' });
    } else {
        res.status(400);
        throw new Error('Invalid or expired OTP');
    }
});

module.exports = { registerUser, verifyOTP, authUser, forgotPassword, resetPassword };
