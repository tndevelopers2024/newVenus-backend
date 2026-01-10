const asyncHandler = require('express-async-handler');
const Appointment = require('../models/Appointment');
const Prescription = require('../models/Prescription');
const TestReport = require('../models/TestReport');
const Invoice = require('../models/Invoice');
const User = require('../models/User');
const Department = require('../models/Department');
const io = require('../socket'); // Import socket

// @desc    Book appointment
// @route   POST /api/patient/appointments
// @access  Private/Patient
const bookAppointment = asyncHandler(async (req, res) => {
    const { doctorId, date, type, reason } = req.body;

    const appointment = await Appointment.create({
        patient: req.user._id,
        doctor: doctorId,
        date,
        type,
        reason,
    });

    // Notify Superadmin via WebSocket
    io.getIO().emit('notification', {
        action: 'NEW_BOOKING',
        // No doctorId target implies system/admin
        message: `New appointment booking by ${req.user.name} for ${date}`,
        data: appointment
    });

    res.status(201).json(appointment);
});

// @desc    Get medical history (Timeline view)
// @route   GET /api/patient/history
// @access  Private/Patient
const getMedicalHistory = asyncHandler(async (req, res) => {
    const prescriptions = await Prescription.find({ patient: req.user._id }).populate('doctor', 'name');
    const reports = await TestReport.find({ patient: req.user._id });
    const appointments = await Appointment.find({ patient: req.user._id }).populate('doctor', 'name');
    const invoices = await Invoice.find({ patient: req.user._id }).populate('appointment', 'date');

    res.json({ prescriptions, reports, appointments, invoices });
});

// @desc    Get all doctors
// @route   GET /api/patient/doctors
// @access  Private/Patient
const getDoctors = asyncHandler(async (req, res) => {
    const doctors = await User.find({ role: 'doctor' }).select('-password');
    res.json(doctors);
});

// @desc    Get all departments
// @route   GET /api/patient/departments
// @access  Private/Patient
const getDepartments = asyncHandler(async (req, res) => {
    const departments = await Department.find({}).populate('head', 'name');
    res.json(departments);
});

// @desc    Get my appointments
// @route   GET /api/patient/appointments
// @access  Private/Patient
const getPatientAppointments = asyncHandler(async (req, res) => {
    const appointments = await Appointment.find({ patient: req.user._id })
        .populate('doctor', 'name email')
        .sort({ date: -1 });
    res.json(appointments);
});

// @desc    Upload test report
// @route   POST /api/patient/reports
// @access  Private/Patient
const uploadReport = asyncHandler(async (req, res) => {
    const { title } = req.body;

    if (!req.file) {
        res.status(400);
        throw new Error('No file uploaded');
    }

    // Correct file URL for local storage
    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;

    const report = await TestReport.create({
        patient: req.user._id,
        title,
        fileUrl,
    });

    res.status(201).json(report);
});

module.exports = {
    bookAppointment,
    getMedicalHistory,
    uploadReport,
    getDoctors,
    getDepartments,
    getPatientAppointments,
};
