const express = require('express');
const router = express.Router();
const {
    getUsers,
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
router.use(authorize('superadmin'));

router.get('/users', getUsers);
router.get('/invoices', getInvoices);
router.get('/logs', getAuditLogs);
router.delete('/users/:id', deleteUser);
router.put('/users/:id/restore', restoreUser); // Restore route
router.post('/doctors', createDoctor);
router.post('/patients', createPatient);
router.post('/appointments', assignAppointment);
router.get('/appointments', getAppointments);
router.delete('/appointments/:id', deleteAppointment);
router.get('/appointments/:id/prescription', getPrescriptionByAppointment);
router.patch('/invoices/:id/status', updateInvoiceStatus);
router.post('/migrate-ids', migrateUserIds); // Temporary Migration Route

module.exports = router;
