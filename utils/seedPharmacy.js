const User = require('../models/User');

const seedPharmacyUser = async () => {
    try {
        const email = 'pharmacy@newvenusclinic.com';
        const rawPassword = 'newvenus@pharm';

        let pharmacyUser = await User.findOne({ email });

        if (!pharmacyUser) {
            pharmacyUser = new User({
                name: 'Pharmacy Department',
                email: email,
                phone: '9876543210',
                password: rawPassword,
                role: 'pharmacy',
                profileCreated: true,
                displayId: 'PHM-001',
                isDeleted: false,
                isLocked: false
            });
            await pharmacyUser.save();
            console.log('[Seed] Default Pharmacy account created: pharmacy@newvenusclinic.com / newvenus@pharm');
        } else {
            let needsSave = false;
            if (pharmacyUser.role !== 'pharmacy') {
                pharmacyUser.role = 'pharmacy';
                needsSave = true;
            }
            if (pharmacyUser.isDeleted) {
                pharmacyUser.isDeleted = false;
                needsSave = true;
            }
            if (pharmacyUser.isLocked) {
                pharmacyUser.isLocked = false;
                needsSave = true;
            }

            const isMatch = await pharmacyUser.comparePassword(rawPassword);
            if (!isMatch) {
                pharmacyUser.password = rawPassword;
                needsSave = true;
            }

            if (needsSave) {
                await pharmacyUser.save();
                console.log('[Seed] Pharmacy user refreshed and synchronized.');
            }
        }
    } catch (error) {
        console.error('[Seed] Error ensuring pharmacy user:', error.message);
    }
};

module.exports = seedPharmacyUser;
