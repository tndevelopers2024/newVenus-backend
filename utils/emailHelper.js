const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');

const createTransporter = () => {
    return nodemailer.createTransport({
        service: process.env.EMAIL_SERVICE,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });
};

const sendPrescriptionEmail = async (patientEmail, data, pdfBuffer = null) => {
    try {
        const { prescription, clinicalDetails, doctorName, patientName, dateStr } = data;
        const transporter = createTransporter();

        // Construct Medications HTML
        const hasMedications = prescription.medications && prescription.medications.length > 0;
        const medicationsHtml = hasMedications 
            ? prescription.medications.map((med, idx) => `
                <tr>
                    <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0;">
                        <div style="font-weight: bold; color: #1e293b; font-size: 14px;">${idx + 1}. ${med.name}</div>
                        <div style="font-size: 12px; color: #64748b; margin-top: 4px;">${med.frequency} | ${med.duration} Days | ${med.instruction || 'After Food'}</div>
                    </td>
                </tr>
            `).join('')
            : prescription.image 
                ? '<tr><td style="padding: 12px 0; color: #64748b; font-weight: bold;">Handwritten prescription is attached as a PDF document.</td></tr>'
                : '<tr><td style="padding: 12px 0; color: #64748b; font-style: italic;">No medications specified.</td></tr>';

        // Image Attachment (Removed from body because it's in the PDF attachment)
        const imagePart = '';

        const mailOptions = {
            from: `"Venus Healthcare" <${process.env.EMAIL_USER}>`,
            to: patientEmail,
            subject: `Digital Prescription - ${dateStr} - Venus Healthcare`,
            html: `
                <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: auto; padding: 30px; border: 1px solid #e2e8f0; border-radius: 24px; color: #1e293b;">
                    <div style="text-align: center; margin-bottom: 30px;">
                        <img src="cid:venus-logo" alt="Venus Healthcare Logo" style="height: 60px; max-width: 100%; object-fit: contain; margin: 0 auto;" />
                    </div>

                    <div style="background-color: #f0fdfa; border-radius: 16px; padding: 20px; margin-bottom: 30px;">
                        <table style="width: 100%;">
                            <tr>
                                <td>
                                    <p style="margin: 0; font-size: 10px; text-transform: uppercase; font-weight: bold; color: #0d9488;">Doctor</p>
                                    <p style="margin: 2px 0 0 0; font-weight: bold; font-size: 16px;">Dr. ${doctorName}</p>
                                </td>
                                <td style="text-align: right;">
                                    <p style="margin: 0; font-size: 10px; text-transform: uppercase; font-weight: bold; color: #0d9488;">Date</p>
                                    <p style="margin: 2px 0 0 0; font-weight: bold; font-size: 16px;">${dateStr}</p>
                                </td>
                            </tr>
                        </table>
                    </div>

                    <p style="font-size: 14px; margin-bottom: 20px;">Dear <strong>${patientName}</strong>, your prescription from your recent consultation has been generated. For your convenience, a PDF copy is attached to this email.</p>

                    <h3 style="font-size: 16px; border-bottom: 2px solid #f1f5f9; padding-bottom: 8px; margin-bottom: 15px; color: #0f172a;">Prescribed Medications</h3>
                    <table style="width: 100%; border-collapse: collapse;">
                        ${medicationsHtml}
                    </table>

                    ${prescription.notes ? `
                        <div style="margin-top: 25px;">
                            <h3 style="font-size: 16px; border-bottom: 2px solid #f1f5f9; padding-bottom: 8px; margin-bottom: 10px; color: #0f172a;">Doctor's Advice</h3>
                            <p style="font-size: 13px; color: #475569; white-space: pre-line; line-height: 1.6;">${prescription.notes}</p>
                        </div>
                    ` : ''}

                    ${imagePart}

                    ${prescription.followUpDate ? `
                        <div style="margin-top: 30px; text-align: center; padding: 15px; background-color: #f1f5f9; border-radius: 12px;">
                            <p style="margin: 0; font-size: 13px; font-weight: bold;">Next Follow-up Date: ${new Date(prescription.followUpDate).toLocaleDateString('en-GB')}</p>
                        </div>
                    ` : ''}

                    <div style="margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 20px; text-align: center;">
                        <p style="font-size: 11px; color: #94a3b8; margin: 0;">This is an automated health record. For any emergencies, please visit the clinic directly.</p>
                        <p style="font-size: 14px; font-weight: bold; color: #0d9488; margin-top: 15px;">Venus Healthcare Clinic</p>
                        <p style="font-size: 11px; color: #64748b;">Chennai, Tamil Nadu</p>
                    </div>
                </div>
            `,
            attachments: (() => {
                const att = [];
                if (pdfBuffer) {
                    att.push({
                        filename: `Prescription_${patientName.replace(/\s+/g, '_')}_${dateStr}.pdf`,
                        content: pdfBuffer
                    });
                }
                const logoPath = path.join(__dirname, '..', 'assets', 'venus-logo.png');
                if (fs.existsSync(logoPath)) {
                    att.push({
                        filename: 'venus-logo.png',
                        path: logoPath,
                        cid: 'venus-logo'
                    });
                }
                return att;
            })()
        };

        await transporter.sendMail(mailOptions);
        return true;
    } catch (error) {
        console.error('[EMAIL HELPER] Prescription Send Failed:', error);
        return false;
    }
};

module.exports = {
    sendPrescriptionEmail,
    // Helper to keep old logic working
    sendOTP: async (email, otp) => {
        const transporter = createTransporter();
        const mailOptions = {
            from: `"Venus Healthcare" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: 'Your Venus Healthcare OTP',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
                    <h2 style="color: #0d9488; text-align: center;">Venus Healthcare Portal</h2>
                    <p>Your verification code is:</p>
                    <div style="background-color: #f0fdfa; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
                        <span style="font-size: 32px; font-weight: bold; letter-spacing: 10px; color: #0f766e;">${otp}</span>
                    </div>
                </div>
            `,
        };
        await transporter.sendMail(mailOptions);
    },
    sendWelcomeEmail: async (email, name, password, role) => {
        const transporter = createTransporter();
        const mailOptions = {
            from: `"Venus Healthcare" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: 'Welcome to Venus Healthcare Portal',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
                    <h2 style="color: #0d9488; text-align: center;">Welcome to Venus Healthcare</h2>
                    <p>Hello <strong>${name}</strong>, your account has been created as a <strong>${role}</strong>.</p>
                    <p>Password: <code>${password}</code></p>
                </div>
            `,
        };
        await transporter.sendMail(mailOptions);
    }
};
