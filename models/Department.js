const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
    },
    description: String,
    head: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', // Usually a Doctor
    },
}, { timestamps: true });

module.exports = mongoose.model('Department', departmentSchema);
