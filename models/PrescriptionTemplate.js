const mongoose = require('mongoose');

const templateSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
    },
    doctor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    medications: [{
        name: String,
        dosage: String,
        frequency: String,
        duration: String,
        instruction: String,
    }],
    diagnosis: String,
    notes: String,
}, { timestamps: true });

module.exports = mongoose.model('PrescriptionTemplate', templateSchema);
