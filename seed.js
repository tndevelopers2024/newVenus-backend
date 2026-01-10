const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./models/User');
const bcrypt = require('bcryptjs');

dotenv.config();

const users = [
    {
        name: 'Super Admin',
        email: 'admin@venus.com',
        phone: '9876543210',
        password: '123456',
        role: 'superadmin',
        profileCreated: true
    },
    {
        name: 'Doctor01',
        email: 'doctor@venus.com',
        phone: '9876543211',
        password: '123456',
        role: 'doctor',
        profileCreated: true
    },
    {
        name: 'Patient01',
        email: 'patient@venus.com',
        phone: '9876543212',
        password: '123456',
        role: 'patient',
        profileCreated: true
    }
];

const seedDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB for seeding...');

        // Clear existing users
        await User.deleteMany({ email: { $in: users.map(u => u.email) } });
        console.log('Old test users cleared.');

        // Create users
        for (const u of users) {
            await User.create(u);
            console.log(`Created ${u.role}: ${u.email}`);
        }

        console.log('Seeding completed successfully!');
        process.exit();
    } catch (err) {
        console.error('Seeding failed:', err);
        process.exit(1);
    }
};

seedDB();
