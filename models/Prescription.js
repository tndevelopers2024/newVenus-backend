const mongoose = require('mongoose');

const prescriptionSchema = new mongoose.Schema({
    patient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    doctor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    appointment: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Appointment',
        required: true,
    },
    medications: [{
        name: String,
        dosage: String,
        frequency: String,
        duration: String,
    }],
    notes: String,
    pdfUrl: String, // URL to generated PDF in storage
    isImmutable: {
        type: Boolean,
        default: true, // As per requirements: "Prescription Immutable"
    },
}, { timestamps: true });

module.exports = mongoose.model('Prescription', prescriptionSchema);
