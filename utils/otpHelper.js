const nodemailer = require('nodemailer');

/**
 * OTP Helper using Nodemailer
 */

const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

const sendOTP = async (email, otp) => {
    try {
        const transporter = nodemailer.createTransport({
            service: process.env.EMAIL_SERVICE,
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
        });

        const mailOptions = {
            from: `"Venus Healthcare" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: 'Your Venus Healthcare OTP',
            text: `Your OTP for registration is: ${otp}. It will expire in 10 minutes.`,
            html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; rounded-lg: 12px;">
          <h2 style="color: #0d9488; text-align: center;">Venus Healthcare Portal</h2>
          <p>Hello,</p>
          <p>Your verification code for the Venus Healthcare Portal is:</p>
          <div style="background-color: #f0fdfa; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 10px; color: #0f766e;">${otp}</span>
          </div>
          <p>This code will expire in 10 minutes.</p>
          <p>If you didn't request this code, please ignore this email.</p>
          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;">
          <p style="font-size: 12px; color: #64748b; text-align: center;">&copy; 2026 Venus Healthcare. All rights reserved.</p>
        </div>
      `,
        };

        await transporter.sendMail(mailOptions);
        console.log(`[OTP SERVICE] OTP ${otp} sent to ${email}`);
        return true;
    } catch (error) {
        console.error('Email sending failed:', error.message);
        // In dev, we still want to see the OTP in console if email fails
        console.log(`[DEV FALLBACK] OTP for ${email} is ${otp}`);
        return false;
    }
};

const generateRandomPassword = (name) => {
    // Take first name, remove spaces, and append 4 random digits
    // Fallback to 'User' if name is missing
    const base = name ? name.split(' ')[0] : 'User';
    const baseName = base.replace(/[^a-zA-Z]/g, '');
    const randomDigits = Math.floor(1000 + Math.random() * 9000).toString();
    return `${baseName}${randomDigits}`;
};

const sendWelcomeEmail = async (email, name, password, role) => {
    try {
        const transporter = nodemailer.createTransport({
            service: process.env.EMAIL_SERVICE,
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
        });

        const mailOptions = {
            from: `"Venus Healthcare" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: 'Welcome to Venus Healthcare Portal',
            text: `Hello ${name}, your account as a ${role} has been created. Your password is: ${password}`,
            html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
          <h2 style="color: #0d9488; text-align: center;">Welcome to Venus Healthcare</h2>
          <p>Hello <strong>${name}</strong>,</p>
          <p>Your account has been successfully created as a <strong>${role}</strong> on our portal.</p>
          <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px dashed #cbd5e1;">
            <p style="margin: 0; color: #64748b; font-size: 14px;">Log in with these credentials:</p>
            <p style="margin: 10px 0 5px 0;"><strong>Email:</strong> ${email}</p>
            <p style="margin: 0;"><strong>Password:</strong> <code style="background: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-size: 16px;">${password}</code></p>
          </div>
          <p>Please change your password after your first login for security reasons.</p>
          <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/login" style="display: block; width: 200px; margin: 30px auto; padding: 12px; background-color: #0d9488; color: white; text-decoration: none; text-align: center; border-radius: 8px; font-weight: bold;">Login Now</a>
          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;">
          <p style="font-size: 12px; color: #64748b; text-align: center;">&copy; 2026 Venus Healthcare. All rights reserved.</p>
        </div>
      `,
        };

        await transporter.sendMail(mailOptions);
        console.log(`[EMAIL SERVICE] Welcome email sent to ${email}`);
        return true;
    } catch (error) {
        console.error('Welcome email failed:', error.message);
        console.log(`[DEV FALLBACK] Credentials for ${email}: ${password}`);
        return false;
    }
};

module.exports = { generateOTP, sendOTP, generateRandomPassword, sendWelcomeEmail };
