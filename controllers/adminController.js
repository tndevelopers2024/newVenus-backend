const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const Appointment = require('../models/Appointment');
const Invoice = require('../models/Invoice');
const AuditLog = require('../models/AuditLog');
const io = require('../socket');
const { generateRandomPassword, sendWelcomeEmail } = require('../utils/otpHelper');
const { logAction } = require('../utils/logger');

// @desc    Get all users (Admins only)
// @route   GET /api/admin/users
// @access  Private/Admin
const getUsers = asyncHandler(async (req, res) => {
    const users = await User.find({}).select('-password');
    res.json(users);
});

// @desc    Get all hospital invoices
// @route   GET /api/admin/invoices
// @access  Private/Admin
const getInvoices = asyncHandler(async (req, res) => {
    const invoices = await Invoice.find({})
        .populate('patient', 'name')
        .populate('appointment', 'date status')
        .sort({ createdAt: -1 });
    res.json(invoices);
});

// @desc    Get all audit logs
// @route   GET /api/admin/logs
// @access  Private/Admin
const getAuditLogs = asyncHandler(async (req, res) => {
    const logs = await AuditLog.find({})
        .populate('user', 'name role')
        .sort({ createdAt: -1 });
    res.json(logs);
});

// @desc    Manage Doctors (Create/Update/Delete)
// @route   POST /api/admin/doctors
// @access  Private/Admin
const createDoctor = asyncHandler(async (req, res) => {
    const { name, email, phone } = req.body;

    const userExists = await User.findOne({ email });
    if (userExists) {
        res.status(400);
        throw new Error('User already exists');
    }

    const password = generateRandomPassword(name);

    const doctor = await User.create({
        name,
        email,
        phone,
        password,
        role: 'doctor',
        profileCreated: true
    });

    await sendWelcomeEmail(email, name, password, 'doctor');

    await logAction({
        user: req.user,
        action: 'Create Doctor',
        resource: 'User Management',
        details: `Created doctor profile for ${name} (${email})`,
        req
    });

    res.status(201).json(doctor);
});

// @desc    Delete user
// @route   DELETE /api/admin/users/:id
// @access  Private/Admin
const deleteUser = asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) {
        res.status(404);
        throw new Error('User not found');
    }
    if (user.role === 'superadmin') {
        res.status(403);
        throw new Error('Superadmin accounts cannot be deleted');
    }

    // Soft Delete
    user.isDeleted = true;
    await user.save();

    await logAction({
        user: req.user,
        action: 'Delete User',
        resource: 'User Management',
        details: `Soft deleted user ${user.name} (${user.email}) - Data preserved`,
        req
    });

    res.json({ message: 'User removed from active registry' });
});

// @desc    Restore a soft-deleted user
// @route   PUT /api/admin/users/:id/restore
// @access  Private/Admin
const restoreUser = asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) {
        res.status(404);
        throw new Error('User not found');
    }

    // Restore User
    user.isDeleted = false;
    await user.save();

    await logAction({
        user: req.user,
        action: 'Restore User',
        resource: 'User Management',
        details: `Restored user ${user.name} (${user.email}) from archives`,
        req
    });

    res.json({ message: 'User restored successfully' });
});

// @desc    Assign appointment to a doctor
// @route   POST /api/admin/appointments
// @access  Private/Admin
const assignAppointment = asyncHandler(async (req, res) => {
    const { patientId, doctorId, date, type, reason } = req.body;

    const appointment = await Appointment.create({
        patient: patientId,
        doctor: doctorId,
        date,
        type,
        reason,
        status: 'Accepted' // Assigned by admin, so pre-accepted
    });

    await logAction({
        user: req.user,
        action: 'Assign Appointment',
        resource: 'Appointment Management',
        details: `Assigned new appointment to doctor ID ${doctorId} for patient ID ${patientId}`,
        req
    });


    // Notify the doctor via WebSocket
    io.getIO().emit('notification', {
        action: 'ASSIGN_APPOINTMENT',
        doctorId: doctorId.toString(),
        message: `New appointment assigned for ${date} (${reason})`,
        data: appointment
    });

    res.status(201).json(appointment);
});

// @desc    Onboard a new patient
// @route   POST /api/admin/patients
// @access  Private/Admin
const createPatient = asyncHandler(async (req, res) => {
    const { name, email, phone } = req.body;

    const userExists = await User.findOne({ email });
    if (userExists) {
        res.status(400);
        throw new Error('User already exists');
    }

    const password = generateRandomPassword(name);

    const patient = await User.create({
        name,
        email,
        phone,
        password,
        role: 'patient',
        profileCreated: true
    });

    await sendWelcomeEmail(email, name, password, 'patient');

    await logAction({
        user: req.user,
        action: 'Create Patient',
        resource: 'User Management',
        details: `Registered new patient ${name} (${email}) through portal manager`,
        req
    });

    res.status(201).json(patient);
});

// @desc    Get all appointments
// @route   GET /api/admin/appointments
// @access  Private/Admin
const getAppointments = asyncHandler(async (req, res) => {
    const appointments = await Appointment.find({})
        .populate('patient', 'name email')
        .populate('doctor', 'name email')
        .sort({ createdAt: -1 });
    res.json(appointments);
});

// @desc    Delete/Cancel appointment
// @route   DELETE /api/admin/appointments/:id
// @access  Private/Admin
const deleteAppointment = asyncHandler(async (req, res) => {
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) {
        res.status(404);
        throw new Error('Appointment not found');
    }
    if (appointment.status === 'Completed') {
        res.status(403);
        throw new Error('Completed appointments cannot be removed');
    }
    await appointment.deleteOne();

    await logAction({
        user: req.user,
        action: 'Cancel Appointment',
        resource: 'Appointment Management',
        details: `Cancelled appointment ID ${req.params.id}`,
        req
    });

    res.json({ message: 'Appointment removed' });
});

// @desc    Update invoice status
// @route   PATCH /api/admin/invoices/:id/status
// @access  Private/Admin
const updateInvoiceStatus = asyncHandler(async (req, res) => {
    const { status } = req.body;
    const invoice = await Invoice.findById(req.params.id);

    if (!invoice) {
        res.status(404);
        throw new Error('Invoice not found');
    }

    invoice.status = status;
    const updatedInvoice = await invoice.save();

    await logAction({
        user: req.user,
        action: 'Update Invoice',
        resource: 'Financial Hub',
        details: `Updated status of invoice ${invoice.invoiceNumber} to ${status}`,
        req
    });

    res.json(updatedInvoice);
});

module.exports = {
    getUsers,
    createDoctor,
    createPatient,
    deleteUser,
    restoreUser,
    getInvoices,
    getAuditLogs,
    assignAppointment,
    getAppointments,
    deleteAppointment,
    updateInvoiceStatus
};
