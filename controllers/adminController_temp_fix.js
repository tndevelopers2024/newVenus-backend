// @desc    Onboard a new patient
// @route   POST /api/admin/patients
// @access  Private/Admin
const createPatient = asyncHandler(async (req, res) => {
    const { name, email, phone } = req.body;

    // Check for Email Duplicate
    const emailExists = await User.findOne({ email });
    if (emailExists) {
        res.status(400);
        if (emailExists.isDeleted) {
            throw new Error('User with this email exists (Archived). Please restore from Archive.');
        }
        throw new Error('Email is already registered');
    }

    // Check for Phone Duplicate
    const phoneExists = await User.findOne({ phone });
    if (phoneExists) {
        res.status(400);
        if (phoneExists.isDeleted) {
            throw new Error('User with this mobile number exists (Archived). Please restore from Archive.');
        }
        throw new Error('Mobile number is already registered');
    }

    const password = generateRandomPassword(name);

    const patient = await User.create({
        name,
        email,
        phone,
        password,
        role: 'patient',
        profileCreated: true
    });

    await sendWelcomeEmail(email, name, password, 'patient');

    await logAction({
        user: req.user,
        action: 'Create Patient',
        resource: 'User Management',
        details: `Registered new patient ${name} (${email}) through portal manager`,
        req
    });

    res.status(201).json(patient);
});
