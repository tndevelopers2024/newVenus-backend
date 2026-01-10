const mongoose = require('mongoose');

const testReportSchema = new mongoose.Schema({
    patient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    title: {
        type: String,
        required: true,
    },
    fileUrl: {
        type: String,
        required: true,
    },
    ocrData: {
        type: Object, // Stores processed text from OCR as per diagram
    },
    uploadedAt: {
        type: Date,
        default: Date.now,
    },
}, { timestamps: true });

module.exports = mongoose.model('TestReport', testReportSchema);
