const express = require('express');
const router = express.Router();
const {
    getDoctorAppointments,
    updateAppointmentStatus,
    getDoctorPatients,
    getPatientHistoryForDoctor,
    createPrescription,
    searchMedications,
    getPrescriptionByAppointment,
    updatePaymentStatus,
    reorderAppointments,
    sharePrescription
} = require('../controllers/doctorController');
const upload = require('../middleware/uploadMiddleware');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.get('/appointments', authorize('doctor'), getDoctorAppointments);
router.get('/patients', authorize('doctor'), getDoctorPatients);
router.get('/patients/:id/history', authorize('doctor'), getPatientHistoryForDoctor);
router.get('/medications/search', authorize('doctor'), searchMedications);
router.put('/appointments/reorder', authorize('doctor'), reorderAppointments);
router.put('/appointments/:id', authorize('doctor'), updateAppointmentStatus);
router.patch('/appointments/:id/payment', authorize('doctor'), updatePaymentStatus);
router.get('/appointments/:id/prescription', authorize('doctor'), getPrescriptionByAppointment);
router.post('/prescriptions', authorize('doctor'), upload.single('image'), createPrescription);
router.post('/prescriptions/:id/share', authorize('doctor', 'superadmin'), sharePrescription);

module.exports = router;
