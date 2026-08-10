const asyncHandler = require('express-async-handler');
const Appointment = require('../models/Appointment');
const Prescription = require('../models/Prescription');
const PrescriptionTemplate = require('../models/PrescriptionTemplate');
const Invoice = require('../models/Invoice');
const TestReport = require('../models/TestReport');
const User = require('../models/User');
const Drug = require('../models/Drug');
const io = require('../socket'); // Import socket
const { logAction } = require('../utils/logger');

// @desc    Get assigned appointments for doctor
// @route   GET /api/doctor/appointments
// @access  Private/Doctor
const getDoctorAppointments = asyncHandler(async (req, res) => {
    let query = {};
    if (req.user.role === 'superadmin') {
        const doctorId = req.headers['x-doctor-id'] || req.query.doctorId;
        if (doctorId) {
            query.doctor = doctorId;
        }
    } else {
        query.doctor = req.user._id;
    }

    const appointments = await Appointment.find(query)
        .populate('patient', 'name email phone displayId')
        .populate('doctor', 'name');

    const appointmentsWithPayment = await Promise.all(appointments.map(async (appt) => {
        const invoice = await Invoice.findOne({ appointment: appt._id });
        const draft = await Prescription.findOne({ appointment: appt._id, isDraft: true });
        return {
            ...appt.toObject(),
            paymentStatus: invoice ? invoice.status : 'Pending',
            hasDraft: !!draft
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
            if (req.body.sessionStartTime) appointment.sessionStartTime = req.body.sessionStartTime;

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
    try {
        let { patientId, appointmentId, medications, notes, diagnosis, clinicalNotes, vitals, consultationFee, paymentStatus, followUpDate } = req.body;

        // Handle multipart/form-data parsing (if strings)
        if (typeof medications === 'string') {
            try { medications = JSON.parse(medications); } 
            catch (e) { console.error('[CreatePrescription] Medications JSON Parse Error:', e, 'Raw:', medications); }
        }
        if (typeof vitals === 'string') {
            try { vitals = JSON.parse(vitals); }
            catch (e) { console.error('[CreatePrescription] Vitals JSON Parse Error:', e, 'Raw:', vitals); }
        }

        // DIAGNOSTIC LOGGING
        console.log('[CreatePrescription] Raw req.file:', req.file);
        console.log('[CreatePrescription] Raw req.body keys:', Object.keys(req.body));

        // Get image path if uploaded (Normalized for the unified upload middleware)
        const image = req.file ? `/uploads/${req.file.filename}` : null;

        // VALIDATION FAILSAFE: If handwriting mode but no image received, throw error
        if (!image && (!medications || medications.length === 0) && !notes) {
            console.warn('[CreatePrescription] Empty prescription attempt blocked (Handwritten mode failure?)');
            res.status(400);
            throw new Error('Prescription image was not received by the server. Please try again or check your internet connection.');
        }

        const doctorId = (req.user.role === 'superadmin' && (req.headers['x-doctor-id'] || req.body.doctorId || req.query.doctorId))
            ? (req.headers['x-doctor-id'] || req.body.doctorId || req.query.doctorId)
            : req.user._id;
        // Create Prescription
        const prescription = await Prescription.create({
            doctor: doctorId,
            patient: patientId,
            appointment: appointmentId,
            medications: medications || [],
            notes,
            image,
            followUpDate,
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

        const populatedPrescription = await Prescription.findById(prescription._id)
            .populate('patient', 'name email phone displayId')
            .populate('doctor', 'name');

        res.status(201).json(populatedPrescription);
    } catch (error) {
        console.error('[CRITICAL] createPrescription failed at controller level:', error);
        throw error;
    }
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
    if (req.user.role !== 'superadmin' && req.user.role !== 'admin' && appointment.doctor.toString() !== req.user._id.toString()) {
        res.status(403);
        throw new Error('Unauthorized access to this prescription');
    }

    const prescription = await Prescription.findOne({ appointment: req.params.id })
        .sort({ createdAt: -1 })
        .populate('doctor', 'name')
        .populate('patient', 'name email phone displayId');

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
    
    let filter = {};
    if (query) {
        // Escape regex special characters properly for MongoDB
        const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        filter = { name: { $regex: escapedQuery, $options: 'i' } };
    }

    const drugs = await Drug.find(filter).limit(20);
    
    const results = drugs.map(d => d.name);

    res.json(results);
});

// @desc    Get unique patients for doctor
// @desc    Get unique patients for doctor
// @route   GET /api/doctor/patients
// @access  Private/Doctor
const getDoctorPatients = asyncHandler(async (req, res) => {
    const doctorId = (req.user.role === 'superadmin' && (req.headers['x-doctor-id'] || req.query.doctorId))
        ? (req.headers['x-doctor-id'] || req.query.doctorId)
        : req.user._id;
    const patients = await Appointment.find({ doctor: doctorId }).distinct('patient');

    const patientDetails = await User.find({
        _id: { $in: patients },
        isDeleted: { $ne: true }
    }).select('name email phone createdAt');

    const patientList = await Promise.all(patientDetails.map(async (p) => {
        const lastAppt = await Appointment.findOne({ doctor: doctorId, patient: p._id })
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
        const doctorId = (req.user.role === 'superadmin' && (req.headers['x-doctor-id'] || req.query.doctorId))
            ? (req.headers['x-doctor-id'] || req.query.doctorId)
            : req.user._id;
        // Verify link: check if doctor has at least one appointment with this patient
        const hasLink = await Appointment.findOne({ doctor: doctorId, patient: req.params.id });

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

// @desc    Reorder appointments
// @route   PUT /api/doctor/appointments/reorder
// @access  Private/Doctor
const reorderAppointments = asyncHandler(async (req, res) => {
    const { orderedIds } = req.body;
    const doctorId = (req.user.role === 'superadmin' && (req.headers['x-doctor-id'] || req.body.doctorId || req.query.doctorId))
        ? (req.headers['x-doctor-id'] || req.body.doctorId || req.query.doctorId)
        : req.user._id;

    if (!orderedIds || !Array.isArray(orderedIds)) {
        res.status(400);
        throw new Error('Invalid data');
    }

    // Bulk update approach
    const bulkOps = orderedIds.map((id, index) => ({
        updateOne: {
            filter: { _id: id, doctor: doctorId },
            update: { $set: { order: index } }
        }
    }));

    if (bulkOps.length > 0) {
        await Appointment.bulkWrite(bulkOps);
    }

    res.json({ success: true });
});

const {
    sendPrescriptionEmail
} = require('../utils/emailHelper');

const { generatePrescriptionPDF } = require('../utils/pdfHelper');

// @desc    Share prescription via email
// @route   POST /api/doctor/prescriptions/:id/share
// @access  Private/Doctor
const sharePrescription = asyncHandler(async (req, res) => {
    const { email } = req.body;
    const prescription = await Prescription.findById(req.params.id)
        .populate('doctor', 'name')
        .populate('patient', 'name email');

    if (!prescription) {
        res.status(404);
        throw new Error('Prescription not found');
    }

    const appointment = await Appointment.findById(prescription.appointment);

    const emailData = {
        prescription: prescription.toObject ? prescription.toObject() : prescription,
        clinicalDetails: {
            diagnosis: appointment?.diagnosis,
            clinicalNotes: appointment?.clinicalNotes,
            vitals: appointment?.vitals
        },
        doctorName: prescription.doctor?.name || 'Medical Officer',
        patientName: prescription.patient?.name || 'Patient',
        dateStr: new Date(prescription.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    };

    let pdfBuffer = null;
    try {
        pdfBuffer = await generatePrescriptionPDF(emailData);
    } catch (pdfError) {
        console.error('[DOCTOR CONTROLLER] PDF Generation Failed:', pdfError);
        // Continue sending email even if PDF generation fails
    }

    const success = await sendPrescriptionEmail(email || prescription.patient.email, emailData, pdfBuffer);

    if (success) {
        res.json({ message: 'Prescription shared successfully' });
    } else {
        res.status(500);
        throw new Error('Failed to send email');
    }
});

// @desc    Save prescription as draft
// @route   POST /api/doctor/appointments/:id/draft
// @access  Private/Doctor
const saveDraftPrescription = asyncHandler(async (req, res) => {
    const { medications, notes, diagnosis, clinicalNotes, vitals, patientId } = req.body;
    const appointmentId = req.params.id;
    const doctorId = (req.user.role === 'superadmin' && req.headers['x-doctor-id'])
        ? req.headers['x-doctor-id']
        : req.user._id;

    // Save clinical details to the Appointment document
    const appointment = await Appointment.findById(appointmentId);
    if (appointment) {
        if (vitals) appointment.vitals = vitals;
        if (clinicalNotes !== undefined) appointment.clinicalNotes = clinicalNotes;
        if (diagnosis !== undefined) appointment.diagnosis = diagnosis;
        await appointment.save();
    }

    // Create or update a draft Prescription document
    let draft = await Prescription.findOne({ appointment: appointmentId, isDraft: true });
    
    if (draft) {
        draft.medications = medications || [];
        draft.notes = notes || '';
        draft.diagnosis = diagnosis || '';
        await draft.save();
    } else {
        draft = await Prescription.create({
            appointment: appointmentId,
            doctor: doctorId,
            patient: appointment ? appointment.patient : patientId,
            medications: medications || [],
            notes: notes || '',
            diagnosis: diagnosis || '',
            isDraft: true
        });
    }

    res.json(draft);
});

// @desc    Save prescription as a global template
// @route   POST /api/doctor/templates
// @access  Private/Doctor
const savePrescriptionTemplate = asyncHandler(async (req, res) => {
    const { name, medications, notes, diagnosis, doctorId: bodyDoctorId } = req.body;
    const doctorId = (req.user.role === 'superadmin' && (req.headers['x-doctor-id'] || bodyDoctorId))
        ? (req.headers['x-doctor-id'] || bodyDoctorId)
        : req.user._id;

    const template = await PrescriptionTemplate.create({
        doctor: doctorId,
        name,
        medications,
        notes,
        diagnosis
    });

    res.status(201).json(template);
});

// @desc    Get all global templates for doctor
// @route   GET /api/doctor/templates
// @access  Private/Doctor
const getPrescriptionTemplates = asyncHandler(async (req, res) => {
    // Fetch all templates clinic-wide regardless of which doctor created them
    const templates = await PrescriptionTemplate.find({}).sort({ createdAt: -1 });
    res.json(templates);
});

// @desc    Update a global template
// @route   PUT /api/doctor/templates/:id
// @access  Private/Doctor
const updatePrescriptionTemplate = asyncHandler(async (req, res) => {
    const { name, medications, notes, diagnosis } = req.body;
    const template = await PrescriptionTemplate.findById(req.params.id);

    if (!template) {
        res.status(404);
        throw new Error('Template not found');
    }

    template.name = name || template.name;
    template.medications = medications || template.medications;
    template.notes = notes !== undefined ? notes : template.notes;
    template.diagnosis = diagnosis !== undefined ? diagnosis : template.diagnosis;

    const updatedTemplate = await template.save();
    res.json(updatedTemplate);
});

// @desc    Delete a global template
// @route   DELETE /api/doctor/templates/:id
// @access  Private/Doctor
const deletePrescriptionTemplate = asyncHandler(async (req, res) => {
    const template = await PrescriptionTemplate.findById(req.params.id);

    if (!template) {
        res.status(404);
        throw new Error('Template not found');
    }

    await template.deleteOne();
    res.json({ message: 'Template removed' });
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
    reorderAppointments,
    sharePrescription,
    saveDraftPrescription,
    savePrescriptionTemplate,
    getPrescriptionTemplates,
    updatePrescriptionTemplate,
    deletePrescriptionTemplate
};
