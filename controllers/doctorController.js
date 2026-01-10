const asyncHandler = require('express-async-handler');
const Appointment = require('../models/Appointment');
const Prescription = require('../models/Prescription');
const Invoice = require('../models/Invoice');
const TestReport = require('../models/TestReport');
const User = require('../models/User');
const io = require('../socket'); // Import socket
const { logAction } = require('../utils/logger');

// @desc    Get assigned appointments for doctor
// @route   GET /api/doctor/appointments
// @access  Private/Doctor
const getDoctorAppointments = asyncHandler(async (req, res) => {
    const appointments = await Appointment.find({ doctor: req.user._id })
        .populate('patient', 'name email phone');

    const appointmentsWithPayment = await Promise.all(appointments.map(async (appt) => {
        const invoice = await Invoice.findOne({ appointment: appt._id });
        return {
            ...appt._doc,
            paymentStatus: invoice ? invoice.status : 'Unpaid'
        };
    }));

    res.json(appointmentsWithPayment);
});

// @desc    Accept or Reschedule appointment
// @route   PUT /api/doctor/appointments/:id
// @access  Private/Doctor
const updateAppointmentStatus = asyncHandler(async (req, res) => {
    try {
        const { status, date } = req.body;
        console.log(`[DoctorController] Updating appointment ${req.params.id} to status: ${status}`);

        const appointment = await Appointment.findById(req.params.id);

        if (appointment) {
            appointment.status = status || appointment.status;
            if (date) appointment.date = date;

            const updatedAppointment = await appointment.save();

            await logAction({
                user: req.user,
                action: 'Update Appointment',
                resource: 'Clinical Queue',
                details: `Updated appointment ID ${req.params.id} status to ${status}`,
                req
            });

            // Notify Superadmin via WebSocket
            try {
                // Ensure socket is initialized before emitting
                const socketIO = io.getIO();
                socketIO.emit('notification', {
                    action: 'APPOINTMENT_UPDATE',
                    // No doctorId target implies system/admin
                    message: `Doctor updated appointment ${req.params.id} status to ${status}`,
                    data: updatedAppointment
                });
            } catch (socketError) {
                console.error('[DoctorController] Socket Emission Error:', socketError.message);
                // Do not crash the response if socket fails
            }

            res.json(updatedAppointment);
        } else {
            res.status(404);
            throw new Error('Appointment not found');
        }
    } catch (error) {
        console.error('[DoctorController] Update Error:', error);
        res.status(500);
        throw error;
    }
});

// @desc    Create prescription and update clinical notes
// @route   POST /api/doctor/prescriptions
// @access  Private/Doctor
const createPrescription = asyncHandler(async (req, res) => {
    const { patientId, appointmentId, medications, notes, diagnosis, clinicalNotes, vitals, consultationFee, paymentStatus } = req.body;

    // Create Prescription
    const prescription = await Prescription.create({
        doctor: req.user._id,
        patient: patientId,
        appointment: appointmentId,
        medications,
        notes,
        isImmutable: true,
    });

    // Update Appointment with clinical details
    const appointment = await Appointment.findById(appointmentId);
    if (appointment) {
        appointment.diagnosis = diagnosis;
        appointment.clinicalNotes = clinicalNotes;
        appointment.vitals = vitals;
        appointment.status = 'Completed';
        await appointment.save();
    }

    // CREATE INVOICE (Dynamic Fee)
    const finalFee = consultationFee || 500;
    const invoiceNumber = `INV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    await Invoice.create({
        invoiceNumber,
        patient: patientId,
        appointment: appointmentId,
        items: [{ description: 'Consultation Fee', amount: finalFee }],
        totalAmount: finalFee,
        status: paymentStatus || 'Unpaid'
    });

    await logAction({
        user: req.user,
        action: 'Create Prescription',
        resource: 'Clinical Consultation',
        details: `Finalized clinical record and issued prescription for appointment ${appointmentId}`,
        req
    });

    res.status(201).json(prescription);
});

// @desc    Get prescription by appointment ID
// @route   GET /api/doctor/appointments/:id/prescription
// @access  Private/Doctor
const getPrescriptionByAppointment = asyncHandler(async (req, res) => {
    const appointment = await Appointment.findById(req.params.id);

    if (!appointment) {
        res.status(404);
        throw new Error('Appointment not found');
    }

    // Verify ownership
    if (appointment.doctor.toString() !== req.user._id.toString()) {
        res.status(403);
        throw new Error('Unauthorized access to this prescription');
    }

    const prescription = await Prescription.findOne({ appointment: req.params.id })
        .populate('doctor', 'name')
        .populate('patient', 'name email phone');

    res.json({
        prescription,
        clinicalDetails: {
            diagnosis: appointment.diagnosis,
            clinicalNotes: appointment.clinicalNotes,
            vitals: appointment.vitals
        }
    });
});

// @desc    Search medications (Autosuggest)
// @route   GET /api/doctor/medications/search
// @access  Private/Doctor
const searchMedications = asyncHandler(async (req, res) => {
    const { query } = req.query;
    // Mock drug database for premium feature
    const drugDatabase = [
        'Paracetamol 500mg', 'Amoxicillin 250mg', 'Ibuprofen 400mg',
        'Metformin 500mg', 'Atorvastatin 10mg', 'Amlodipine 5mg',
        'Omeprazole 20mg', 'Losartan 50mg', 'Albuterol Inhaler',
        'Azithromycin 250mg', 'Gabapentin 300mg', 'Lisinopril 10mg'
    ];

    const results = drugDatabase.filter(d =>
        d.toLowerCase().includes(query?.toLowerCase() || '')
    );

    res.json(results);
});

// @desc    Get unique patients for doctor
// @route   GET /api/doctor/patients
// @access  Private/Doctor
const getDoctorPatients = asyncHandler(async (req, res) => {
    const patients = await Appointment.find({ doctor: req.user._id }).distinct('patient');

    const patientDetails = await User.find({ _id: { $in: patients } })
        .select('name email phone createdAt');

    const patientList = await Promise.all(patientDetails.map(async (p) => {
        const lastAppt = await Appointment.findOne({ doctor: req.user._id, patient: p._id })
            .sort({ date: -1 });
        return {
            ...p._doc,
            lastVisit: lastAppt ? lastAppt.date : null
        };
    }));

    res.json(patientList);
});

// @desc    Get detailed history for a specific patient
// @route   GET /api/doctor/patients/:id/history
// @access  Private/Doctor
const getPatientHistoryForDoctor = asyncHandler(async (req, res) => {
    try {
        // Verify link: check if doctor has at least one appointment with this patient
        const hasLink = await Appointment.findOne({ doctor: req.user._id, patient: req.params.id });

        if (!hasLink) {
            res.status(403);
            throw new Error('Access denied. No clinical relationship found with this patient.');
        }

        const prescriptions = await Prescription.find({ patient: req.params.id }).populate('doctor', 'name');
        const reports = await TestReport.find({ patient: req.params.id });
        // Only show Completed appointments in history
        const appointments = await Appointment.find({
            patient: req.params.id,
            status: 'Completed'
        }).populate('doctor', 'name');
        const invoices = await Invoice.find({ patient: req.params.id });

        res.json({ prescriptions, reports, appointments, invoices });
    } catch (error) {
        console.error('[DoctorController] Get History Error:', error);
        res.status(500);
        throw error;
    }
});

// @desc    Update payment status for an appointment's invoice
// @route   PATCH /api/doctor/appointments/:id/payment
// @access  Private/Doctor
const updatePaymentStatus = asyncHandler(async (req, res) => {
    const { status } = req.body;
    const appointment = await Appointment.findById(req.params.id);

    if (!appointment) {
        res.status(404);
        throw new Error('Appointment not found');
    }

    // Verify ownership
    if (appointment.doctor.toString() !== req.user._id.toString()) {
        res.status(403);
        throw new Error('Unauthorized to update payment for this appointment');
    }

    let invoice = await Invoice.findOne({ appointment: req.params.id });

    if (!invoice) {
        // Create a default invoice if none exists (fallback)
        const invoiceNumber = `INV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        invoice = await Invoice.create({
            invoiceNumber,
            patient: appointment.patient,
            appointment: appointment._id,
            items: [{ description: 'Consultation Fee', amount: 500 }],
            totalAmount: 500,
            status: status || 'Unpaid'
        });
    } else {
        invoice.status = status;
        await invoice.save();
    }

    await logAction({
        user: req.user,
        action: 'Update Payment Status',
        resource: 'Billing Intelligence',
        details: `Updated payment status for appointment ${req.params.id} to ${status}`,
        req
    });

    res.json({ success: true, status: invoice.status });
});

module.exports = {
    getDoctorAppointments,
    updateAppointmentStatus,
    updatePaymentStatus,
    getDoctorPatients,
    getPatientHistoryForDoctor,
    createPrescription,
    searchMedications,
    getPrescriptionByAppointment,
};
