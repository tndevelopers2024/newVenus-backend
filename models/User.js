const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    email: {
        type: String,
        required: false,
        unique: true,
        sparse: true,
    },
    phone: {
        type: String,
        required: true,
    },
    password: {
        type: String,
        required: true,
    },
    role: {
        type: String,
        enum: ['patient', 'doctor', 'admin', 'superadmin'],
        default: 'patient',
    },
    age: {
        type: Number,
        required: false,
    },
    gender: {
        type: String,
        enum: ['Male', 'Female', 'Other'],
        required: false,
    },
    occupation: {
        type: String,
        required: false,
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
    if (!this.displayId) {
        if (this.role === 'patient') {
            const year = new Date().getFullYear();
            try {
                const lastUser = await mongoose.models.User.findOne({
                    role: 'patient',
                    displayId: { $regex: `^NVC-${year}-` }
                }).sort({ createdAt: -1 });

                let nextSeq = 1;
                if (lastUser && lastUser.displayId) {
                    const parts = lastUser.displayId.split('-');
                    if (parts.length === 3) {
                        const lastSeq = parseInt(parts[2], 10);
                        if (!isNaN(lastSeq)) {
                            nextSeq = lastSeq + 1;
                        }
                    }
                }
                this.displayId = `NVC-${year}-${nextSeq.toString().padStart(6, '0')}`;
            } catch (err) {
                console.error('Error generating displayId', err);
                this.displayId = `NVC-${year}-${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`;
            }
        } else {
            const prefix = this.name ? this.name.slice(0, 3).toUpperCase() : 'USR';
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
