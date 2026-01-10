const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema({
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
    date: {
        type: Date,
        default: Date.now,
    },
    type: {
        type: String,
        enum: ['In-person', 'Online'],
        default: 'In-person',
    },
    status: {
        type: String,
        enum: ['Pending', 'Accepted', 'Rescheduled', 'Completed', 'Cancelled'],
        default: 'Pending',
    },
    reason: String,
    diagnosis: String,
    clinicalNotes: String,
    vitals: {
        bloodPressure: String,
        temperature: String,
        pulse: String,
        weight: String
    },
}, { timestamps: true });

module.exports = mongoose.model('Appointment', appointmentSchema);
