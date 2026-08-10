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
    sharePrescription,
    saveDraftPrescription,
    savePrescriptionTemplate,
    getPrescriptionTemplates,
    updatePrescriptionTemplate,
    deletePrescriptionTemplate
} = require('../controllers/doctorController');
const upload = require('../middleware/uploadMiddleware');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.get('/appointments', authorize('doctor', 'superadmin'), getDoctorAppointments);
router.get('/patients', authorize('doctor', 'superadmin'), getDoctorPatients);
router.get('/patients/:id/history', authorize('doctor', 'superadmin'), getPatientHistoryForDoctor);
router.get('/medications/search', authorize('doctor', 'superadmin'), searchMedications);
router.put('/appointments/reorder', authorize('doctor', 'superadmin'), reorderAppointments);
router.put('/appointments/:id', authorize('doctor', 'superadmin'), updateAppointmentStatus);
router.patch('/appointments/:id/payment', authorize('doctor', 'superadmin'), updatePaymentStatus);
router.get('/appointments/:id/prescription', authorize('doctor', 'superadmin'), getPrescriptionByAppointment);
router.post('/appointments/:id/draft', authorize('doctor', 'superadmin'), saveDraftPrescription);
router.post('/templates', authorize('doctor', 'superadmin'), savePrescriptionTemplate);
router.get('/templates', authorize('doctor', 'superadmin'), getPrescriptionTemplates);
router.put('/templates/:id', authorize('doctor', 'superadmin'), updatePrescriptionTemplate);
router.delete('/templates/:id', authorize('doctor', 'superadmin'), deletePrescriptionTemplate);
router.post('/prescriptions', 
    authorize('doctor', 'superadmin'), 
    (req, res, next) => {
        console.log('[INSPECTION] Upload Request Headers:', {
            contentType: req.headers['content-type'],
            origin: req.headers['origin'],
            length: req.headers['content-length']
        });
        next();
    },
    upload.single('image'), 
    createPrescription
);
router.post('/prescriptions/:id/share', authorize('doctor', 'superadmin'), sharePrescription);

module.exports = router;
