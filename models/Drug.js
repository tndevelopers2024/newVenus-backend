const mongoose = require('mongoose');

const drugSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true,
    },
    category: {
        type: String,
        trim: true,
        default: 'General'
    },
    dosageForm: {
        type: String,
        trim: true,
        default: 'Tablet'
    },
    strength: {
        type: String,
        trim: true,
        default: ''
    },
    manufacturer: {
        type: String,
        trim: true,
        default: ''
    },
    notes: {
        type: String,
        trim: true,
        default: ''
    },
    isActive: {
        type: Boolean,
        default: true
    },
    addedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    uploadedByDoctor: {
        type: Boolean,
        default: false
    },
    doctorName: {
        type: String,
        default: ''
    },
    source: {
        type: String,
        default: 'Pharmacy' // 'Doctor Prescription', 'Doctor Template', 'Pharmacy', 'Bulk Upload'
    }
}, { timestamps: true });

// Case-insensitive unique indexing for drug name
drugSchema.index({ name: 1 });

module.exports = mongoose.model('Drug', drugSchema);

