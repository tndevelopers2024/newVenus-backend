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
    updateInvoiceStatus
} = require('../controllers/adminController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);
router.use(authorize('superadmin'));

router.get('/users', getUsers);
router.get('/invoices', getInvoices);
router.get('/logs', getAuditLogs);
router.delete('/users/:id', deleteUser);
router.post('/doctors', createDoctor);
router.post('/patients', createPatient);
router.post('/appointments', assignAppointment);
router.get('/appointments', getAppointments);
router.delete('/appointments/:id', deleteAppointment);
router.patch('/invoices/:id/status', updateInvoiceStatus);

module.exports = router;
