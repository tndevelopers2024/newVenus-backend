const express = require('express');
const router = express.Router();
const {
    getUsers,
    getUserById,
    createDoctor,
    createPatient,
    deleteUser,
    getInvoices,
    getAuditLogs,
    assignAppointment,
    getAppointments,
    deleteAppointment,
    updateInvoiceStatus,
    restoreUser,
    migrateUserIds
} = require('../controllers/adminController');
const { getPrescriptionByAppointment } = require('../controllers/doctorController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.get('/users', authorize('superadmin', 'admin'), getUsers);
router.get('/users/:id', authorize('superadmin', 'admin'), getUserById);
router.get('/invoices', authorize('superadmin', 'admin'), getInvoices);
router.get('/logs', authorize('superadmin'), getAuditLogs);
router.delete('/users/:id', authorize('superadmin'), deleteUser);
router.put('/users/:id/restore', authorize('superadmin'), restoreUser); // Restore route
router.post('/doctors', authorize('superadmin'), createDoctor);
router.post('/patients', authorize('superadmin', 'admin'), createPatient);
router.post('/appointments', authorize('superadmin', 'admin'), assignAppointment);
router.get('/appointments', authorize('superadmin', 'admin'), getAppointments);
router.delete('/appointments/:id', authorize('superadmin', 'admin'), deleteAppointment);
router.get('/appointments/:id/prescription', authorize('superadmin', 'admin', 'doctor'), getPrescriptionByAppointment);
router.patch('/invoices/:id/status', authorize('superadmin', 'admin'), updateInvoiceStatus);
router.post('/migrate-ids', authorize('superadmin'), migrateUserIds); // Temporary Migration Route

module.exports = router;
