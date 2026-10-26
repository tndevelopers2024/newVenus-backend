const asyncHandler = require('express-async-handler');
const Drug = require('../models/Drug');
const { logAction } = require('../utils/logger');

// Utility to escape regex special characters
const escapeRegex = (string) => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

// @desc    Get drugs list with pagination, search, and filters
// @route   GET /api/pharmacy/drugs
// @access  Private/Pharmacy, Superadmin, Admin
const getDrugs = asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limitParam = req.query.limit;
    const isAll = limitParam === 'all' || limitParam === '0';
    const limit = isAll ? 10000 : (parseInt(limitParam) || 10);
    const skip = (page - 1) * limit;

    const { search, category, dosageForm, status, source, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

    const filter = {};

    // Source filter (Doctor Uploaded vs Pharmacy)
    if (source === 'doctor') {
        filter.uploadedByDoctor = true;
    } else if (source === 'pharmacy') {
        filter.uploadedByDoctor = { $ne: true };
    }

    // Search query on name, category, dosageForm, strength, manufacturer, doctorName
    if (search && search.trim()) {
        const escaped = escapeRegex(search.trim());
        filter.$or = [
            { name: { $regex: escaped, $options: 'i' } },
            { category: { $regex: escaped, $options: 'i' } },
            { dosageForm: { $regex: escaped, $options: 'i' } },
            { strength: { $regex: escaped, $options: 'i' } },
            { manufacturer: { $regex: escaped, $options: 'i' } },
            { doctorName: { $regex: escaped, $options: 'i' } }
        ];
    }

    // Category filter
    if (category && category !== 'all') {
        filter.category = category;
    }

    // Dosage Form filter
    if (dosageForm && dosageForm !== 'all') {
        filter.dosageForm = dosageForm;
    }

    // Status filter - use $ne: false so documents without isActive field count as active
    if (status === 'active') {
        filter.isActive = { $ne: false };
    } else if (status === 'inactive') {
        filter.isActive = false;
    }

    // Sorting
    const sort = {};
    if (sortBy === 'name') {
        sort.name = sortOrder === 'desc' ? -1 : 1;
    } else {
        sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
    }

    const total = await Drug.countDocuments(filter);
    const drugs = await Drug.find(filter)
        .sort(sort)
        .skip(isAll ? 0 : skip)
        .limit(limit)
        .populate('addedBy', 'name email');

    res.json({
        drugs,
        total,
        page,
        totalPages: isAll ? 1 : Math.ceil(total / limit) || 1
    });
});

// @desc    Add a single drug
// @route   POST /api/pharmacy/drugs
// @access  Private/Pharmacy, Superadmin, Admin
const addDrug = asyncHandler(async (req, res) => {
    const { name, category, dosageForm, strength, manufacturer, notes, isActive } = req.body;

    if (!name || !name.trim()) {
        res.status(400);
        throw new Error('Drug name is required');
    }

    const trimmedName = name.trim();

    // Check if drug already exists (case-insensitive)
    const existing = await Drug.findOne({
        name: { $regex: `^${escapeRegex(trimmedName)}$`, $options: 'i' }
    });

    if (existing) {
        res.status(400);
        throw new Error(`Drug "${trimmedName}" already exists in the formulary`);
    }

    const drug = await Drug.create({
        name: trimmedName,
        category: category ? category.trim() : 'General',
        dosageForm: dosageForm ? dosageForm.trim() : 'Tablet',
        strength: strength ? strength.trim() : '',
        manufacturer: manufacturer ? manufacturer.trim() : '',
        notes: notes ? notes.trim() : '',
        isActive: isActive !== undefined ? Boolean(isActive) : true,
        addedBy: req.user._id
    });

    await logAction({
        user: req.user,
        action: 'Add Drug',
        resource: 'Pharmacy Management',
        details: `Added new drug to formulary: ${drug.name} (${drug.dosageForm})`,
        req
    });

    res.status(201).json(drug);
});

// @desc    Parse CSV or text to array of drug objects
const parseDrugInput = (rawText) => {
    const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return [];

    const firstLine = lines[0].toLowerCase();
    const hasHeader = firstLine.includes('name') || firstLine.includes('drug') || firstLine.includes('medicine');
    const dataLines = hasHeader ? lines.slice(1) : lines;

    const parsed = [];

    for (const line of dataLines) {
        // Check if comma or tab separated
        if (line.includes(',') || line.includes('\t')) {
            // Split respecting basic CSV quotes if any
            const delimiter = line.includes('\t') ? '\t' : ',';
            const parts = line.split(delimiter).map(p => p.replace(/^["']|["']$/g, '').trim());

            if (parts[0]) {
                parsed.push({
                    name: parts[0],
                    category: parts[1] || 'General',
                    dosageForm: parts[2] || 'Tablet',
                    strength: parts[3] || '',
                    manufacturer: parts[4] || '',
                    notes: parts[5] || ''
                });
            }
        } else {
            // Single drug name per line
            if (line.length > 0) {
                parsed.push({
                    name: line,
                    category: 'General',
                    dosageForm: 'Tablet',
                    strength: '',
                    manufacturer: '',
                    notes: ''
                });
            }
        }
    }

    return parsed;
};

// @desc    Bulk upload drugs via CSV file or raw text / array
// @route   POST /api/pharmacy/drugs/bulk-upload
// @access  Private/Pharmacy, Superadmin, Admin
const bulkUploadDrugs = asyncHandler(async (req, res) => {
    let drugsToProcess = [];

    // 1. Check if uploaded via Multer file
    if (req.file && req.file.buffer) {
        const fileContent = req.file.buffer.toString('utf-8');
        drugsToProcess = parseDrugInput(fileContent);
    }
    // 2. Check if text sent in body
    else if (req.body.text && typeof req.body.text === 'string') {
        drugsToProcess = parseDrugInput(req.body.text);
    }
    // 3. Check if structured array sent in body
    else if (Array.isArray(req.body.drugs)) {
        drugsToProcess = req.body.drugs.map(item => {
            if (typeof item === 'string') {
                return {
                    name: item.trim(),
                    category: 'General',
                    dosageForm: 'Tablet',
                    strength: '',
                    manufacturer: '',
                    notes: ''
                };
            }
            return {
                name: (item.name || '').trim(),
                category: (item.category || 'General').trim(),
                dosageForm: (item.dosageForm || 'Tablet').trim(),
                strength: (item.strength || '').trim(),
                manufacturer: (item.manufacturer || '').trim(),
                notes: (item.notes || '').trim()
            };
        }).filter(d => Boolean(d.name));
    }

    if (!drugsToProcess || drugsToProcess.length === 0) {
        res.status(400);
        throw new Error('No valid drug records found to upload. Please provide a CSV file, text list, or drug array.');
    }

    // Deduplicate in memory first (case-insensitive)
    const uniqueMap = new Map();
    for (const d of drugsToProcess) {
        if (!d.name || d.name.length < 2) continue;
        const key = d.name.toLowerCase();
        if (!uniqueMap.has(key)) {
            uniqueMap.set(key, d);
        }
    }

    const uniqueDrugs = Array.from(uniqueMap.values());

    // Prepare bulk write operations with upsert
    const bulkOps = uniqueDrugs.map(drug => ({
        updateOne: {
            filter: { name: new RegExp(`^${escapeRegex(drug.name)}$`, 'i') },
            update: {
                $setOnInsert: {
                    name: drug.name,
                    category: drug.category || 'General',
                    dosageForm: drug.dosageForm || 'Tablet',
                    strength: drug.strength || '',
                    manufacturer: drug.manufacturer || '',
                    notes: drug.notes || '',
                    isActive: true,
                    addedBy: req.user._id
                }
            },
            upsert: true
        }
    }));

    const result = await Drug.bulkWrite(bulkOps, { ordered: false });

    const insertedCount = result.upsertedCount || 0;
    const existingCount = result.matchedCount || 0;

    await logAction({
        user: req.user,
        action: 'Bulk Upload Drugs',
        resource: 'Pharmacy Management',
        details: `Bulk uploaded ${uniqueDrugs.length} drugs: ${insertedCount} new added, ${existingCount} already existed`,
        req
    });

    res.status(200).json({
        success: true,
        totalProcessed: uniqueDrugs.length,
        insertedCount,
        existingCount,
        message: `Successfully processed ${uniqueDrugs.length} drugs (${insertedCount} new added, ${existingCount} already in catalog)`
    });
});

// @desc    Update a drug
// @route   PUT /api/pharmacy/drugs/:id
// @access  Private/Pharmacy, Superadmin, Admin
const updateDrug = asyncHandler(async (req, res) => {
    const drug = await Drug.findById(req.params.id);

    if (!drug) {
        res.status(404);
        throw new Error('Drug not found');
    }

    const { name, category, dosageForm, strength, manufacturer, notes, isActive } = req.body;

    if (name && name.trim() && name.trim().toLowerCase() !== drug.name.toLowerCase()) {
        const trimmedName = name.trim();
        const exists = await Drug.findOne({
            _id: { $ne: drug._id },
            name: { $regex: `^${escapeRegex(trimmedName)}$`, $options: 'i' }
        });
        if (exists) {
            res.status(400);
            throw new Error(`Another drug with the name "${trimmedName}" already exists`);
        }
        drug.name = trimmedName;
    }

    if (category !== undefined) drug.category = category.trim();
    if (dosageForm !== undefined) drug.dosageForm = dosageForm.trim();
    if (strength !== undefined) drug.strength = strength.trim();
    if (manufacturer !== undefined) drug.manufacturer = manufacturer.trim();
    if (notes !== undefined) drug.notes = notes.trim();
    if (isActive !== undefined) drug.isActive = Boolean(isActive);

    const updated = await drug.save();

    await logAction({
        user: req.user,
        action: 'Update Drug',
        resource: 'Pharmacy Management',
        details: `Updated drug information for: ${updated.name}`,
        req
    });

    res.json(updated);
});

// @desc    Toggle drug active/inactive status
// @route   PATCH /api/pharmacy/drugs/:id/status
// @access  Private/Pharmacy, Superadmin, Admin
const toggleDrugStatus = asyncHandler(async (req, res) => {
    const drug = await Drug.findById(req.params.id);

    if (!drug) {
        res.status(404);
        throw new Error('Drug not found');
    }

    drug.isActive = !drug.isActive;
    const updated = await drug.save();

    res.json({
        _id: updated._id,
        name: updated.name,
        isActive: updated.isActive,
        message: `Drug marked as ${updated.isActive ? 'Active' : 'Inactive'}`
    });
});

// @desc    Delete a drug
// @route   DELETE /api/pharmacy/drugs/:id
// @access  Private/Pharmacy, Superadmin, Admin
const deleteDrug = asyncHandler(async (req, res) => {
    const drug = await Drug.findById(req.params.id);

    if (!drug) {
        res.status(404);
        throw new Error('Drug not found');
    }

    const drugName = drug.name;
    await Drug.deleteOne({ _id: drug._id });

    await logAction({
        user: req.user,
        action: 'Delete Drug',
        resource: 'Pharmacy Management',
        details: `Deleted drug from formulary: ${drugName}`,
        req
    });

    res.json({ message: `Drug "${drugName}" successfully removed` });
});

// @desc    Bulk delete drugs
// @route   POST /api/pharmacy/drugs/bulk-delete
// @access  Private/Pharmacy, Superadmin, Admin
const bulkDeleteDrugs = asyncHandler(async (req, res) => {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        res.status(400);
        throw new Error('Array of drug IDs is required for bulk deletion');
    }

    const result = await Drug.deleteMany({ _id: { $in: ids } });

    await logAction({
        user: req.user,
        action: 'Bulk Delete Drugs',
        resource: 'Pharmacy Management',
        details: `Deleted ${result.deletedCount} drugs in bulk`,
        req
    });

    res.json({
        message: `Successfully deleted ${result.deletedCount} drugs`,
        deletedCount: result.deletedCount
    });
});

// @desc    Get pharmacy stats
// @route   GET /api/pharmacy/stats
// @access  Private/Pharmacy, Superadmin, Admin
const getPharmacyStats = asyncHandler(async (req, res) => {
    const [totalDrugs, activeDrugs, inactiveDrugs, doctorDrugs, categories, dosageForms, recentlyAdded] = await Promise.all([
        Drug.countDocuments(),
        Drug.countDocuments({ isActive: { $ne: false } }),
        Drug.countDocuments({ isActive: false }),
        Drug.countDocuments({ uploadedByDoctor: true }),
        Drug.distinct('category'),
        Drug.distinct('dosageForm'),
        Drug.find().sort({ createdAt: -1 }).limit(5).select('name dosageForm category strength uploadedByDoctor doctorName createdAt')
    ]);

    res.json({
        totalDrugs,
        activeDrugs,
        inactiveDrugs,
        doctorDrugs,
        categoryCount: categories.length,
        dosageFormCount: dosageForms.length,
        categories: categories.sort(),
        dosageForms: dosageForms.sort(),
        recentlyAdded
    });
});

// @desc    Download sample CSV template
// @route   GET /api/pharmacy/sample-csv
// @access  Private/Pharmacy, Superadmin, Admin
const getSampleCsv = asyncHandler(async (req, res) => {
    const sampleCsv = `Drug Name,Category,Dosage Form,Strength,Manufacturer,Notes
Paracetamol 650mg,Analgesics & Antipyretics,Tablet,650mg,Micro Labs,Take after food for fever or pain
Amoxicillin 500mg,Antibiotics,Capsule,500mg,GlaxoSmithKline,Complete full antibiotic course
Cetirizine 10mg,Antihistamines,Tablet,10mg,Cipla,Take once daily at bedtime
Pantoprazole 40mg,Antacids & PPIs,Tablet,40mg,Sun Pharma,Take 30 mins before breakfast
Azithromycin 500mg,Antibiotics,Tablet,500mg,Alkem,Take once daily for 3 days
Cough Syrup Dextromethorphan,Respiratory,Syrup,100ml,Abbott,5ml twice a day
Metformin 500mg,Antidiabetics,Tablet,500mg,USV,Take with meals
Atorvastatin 10mg,Cardiovascular,Tablet,10mg,Zydus Cadila,Take at night`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="venus_drugs_sample_template.csv"');
    res.status(200).send(sampleCsv);
});

// @desc    Trigger sync of medications from Prescriptions & Templates into Drug formulary
// @route   POST /api/pharmacy/sync-doctor-drugs
// @access  Private/Pharmacy, Superadmin, Admin
const triggerSyncDoctorDrugs = asyncHandler(async (req, res) => {
    const syncDoctorDrugs = require('../utils/syncDoctorDrugs');
    const result = await syncDoctorDrugs();
    res.json(result);
});

module.exports = {
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
};
