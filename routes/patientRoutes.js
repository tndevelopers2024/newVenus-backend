const express = require('express');
const router = express.Router();
const {
    bookAppointment,
    getMedicalHistory,
    uploadReport,
    getDoctors,
    getDepartments,
    getPatientAppointments,
} = require('../controllers/patientController');
const { protect, authorize } = require('../middleware/auth');
const upload = require('../middleware/uploadMiddleware');

router.use(protect);
router.use(authorize('patient'));

// router.post('/appointments', bookAppointment); // Disabled: Centralized Assignment Only
router.get('/appointments', getPatientAppointments);
router.get('/history', getMedicalHistory);
router.post('/reports', upload.single('report'), uploadReport);
router.get('/doctors', getDoctors);
router.get('/departments', getDepartments);

module.exports = router;
