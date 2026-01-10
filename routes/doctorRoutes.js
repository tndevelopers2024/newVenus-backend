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
} = require('../controllers/doctorController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);
router.use(authorize('doctor'));

router.get('/appointments', getDoctorAppointments);
router.get('/patients', getDoctorPatients);
router.get('/patients/:id/history', getPatientHistoryForDoctor);
router.get('/medications/search', searchMedications);
router.put('/appointments/:id', updateAppointmentStatus);
router.patch('/appointments/:id/payment', updatePaymentStatus);
router.get('/appointments/:id/prescription', getPrescriptionByAppointment);
router.post('/prescriptions', createPrescription);

module.exports = router;
