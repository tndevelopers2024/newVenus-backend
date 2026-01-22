const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    email: {
        type: String,
        required: true,
        unique: true,
    },
    phone: {
        type: String,
        required: true,
        unique: true,
    },
    password: {
        type: String,
        required: true,
    },
    role: {
        type: String,
        enum: ['patient', 'doctor', 'superadmin'],
        default: 'patient',
    },
    specialization: {
        type: String,
        required: false,
    },
    profileCreated: {
        type: Boolean,
        default: false,
    },
    otp: {
        code: String,
        expiresAt: Date,
    },
    displayId: {
        type: String,
        unique: true,
        sparse: true
    },
    isDeleted: {
        type: Boolean,
        default: false,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    }
}, { timestamps: true });

// Hash password before saving
// Hash password before saving
userSchema.pre('save', async function () {
    // Generate displayId if not present
    if (!this.displayId && this.name) {
        const prefix = this.name.slice(0, 3).toUpperCase();

        let suffix;
        if (this._id) {
            const idStr = this._id.toString();
            const decimal = parseInt(idStr.slice(-4), 16);
            suffix = (decimal % 1000).toString().padStart(3, '0');
        } else {
            suffix = Math.floor(100 + Math.random() * 900).toString();
        }
        this.displayId = `${prefix}-${suffix}`;
    }

    if (!this.isModified('password')) return;
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

// Compare password
userSchema.methods.comparePassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
