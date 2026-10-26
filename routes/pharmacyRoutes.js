const express = require('express');
const router = express.Router();
const multer = require('multer');
const {
    getDrugs,
    addDrug,
    bulkUploadDrugs,
    updateDrug,
    toggleDrugStatus,
    deleteDrug,
    bulkDeleteDrugs,
    getPharmacyStats,
    getSampleCsv,
    triggerSyncDoctorDrugs
} = require('../controllers/pharmacyController');
const { protect, authorize } = require('../middleware/auth');

// Memory storage for CSV/file uploads
const uploadMemory = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 10 MB limit
});

// All pharmacy routes require authenticated pharmacy staff or superadmin/admin
router.use(protect);
router.use(authorize('pharmacy', 'superadmin', 'admin'));

router.get('/stats', getPharmacyStats);
router.get('/sample-csv', getSampleCsv);
router.post('/sync-doctor-drugs', triggerSyncDoctorDrugs);

router.get('/drugs', getDrugs);
router.post('/drugs', addDrug);
router.post('/drugs/bulk-upload', uploadMemory.single('file'), bulkUploadDrugs);
router.post('/drugs/bulk-delete', bulkDeleteDrugs);
router.put('/drugs/:id', updateDrug);
router.patch('/drugs/:id/status', toggleDrugStatus);
router.delete('/drugs/:id', deleteDrug);

module.exports = router;
