const mongoose = require('mongoose');
const Drug = require('../models/Drug');
const Prescription = require('../models/Prescription');
const PrescriptionTemplate = require('../models/PrescriptionTemplate');

// Utility to escape regex
const escapeRegex = (string) => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const syncDoctorDrugs = async () => {
    try {
        console.log('[SyncDoctorDrugs] Scanning database for doctor-uploaded medications...');

        // 1. Ensure all existing drugs in Drug collection have isActive: true
        await Drug.updateMany(
            { isActive: { $exists: false } },
            { $set: { isActive: true, source: 'Doctor Prescription', uploadedByDoctor: true } }
        );

        // 2. Fetch all Prescriptions with medications populated with doctor info
        const prescriptions = await Prescription.find({})
            .populate('doctor', 'name specialization')
            .lean();

        // 3. Fetch all Prescription Templates with medications
        const templates = await PrescriptionTemplate.find({})
            .populate('doctor', 'name specialization')
            .lean();

        console.log(`[SyncDoctorDrugs] Found ${prescriptions.length} prescriptions and ${templates.length} templates.`);

        const doctorMedications = [];

        // Extract from Prescriptions
        for (const p of prescriptions) {
            if (p.medications && Array.isArray(p.medications)) {
                const docName = p.doctor?.name ? (p.doctor.name.toLowerCase().startsWith('dr') ? p.doctor.name : `Dr. ${p.doctor.name}`) : 'Doctor';
                for (const med of p.medications) {
                    if (med && med.name && med.name.trim()) {
                        doctorMedications.push({
                            name: med.name.trim(),
                            dosageForm: med.unit ? med.unit.trim() : 'Tablet',
                            strength: med.dosage ? med.dosage.trim() : '',
                            category: 'Doctor Prescription',
                            notes: med.instruction ? med.instruction.trim() : (p.notes || ''),
                            uploadedByDoctor: true,
                            doctorName: docName,
                            addedBy: p.doctor?._id || p.doctor,
                            source: 'Doctor Prescription'
                        });
                    }
                }
            }
        }

        // Extract from Templates
        for (const t of templates) {
            if (t.medications && Array.isArray(t.medications)) {
                const docName = t.doctor?.name ? (t.doctor.name.toLowerCase().startsWith('dr') ? t.doctor.name : `Dr. ${t.doctor.name}`) : 'Doctor';
                for (const med of t.medications) {
                    if (med && med.name && med.name.trim()) {
                        doctorMedications.push({
                            name: med.name.trim(),
                            dosageForm: med.unit ? med.unit.trim() : 'Tablet',
                            strength: med.dosage ? med.dosage.trim() : '',
                            category: 'Doctor Template',
                            notes: med.instruction ? med.instruction.trim() : '',
                            uploadedByDoctor: true,
                            doctorName: docName,
                            addedBy: t.doctor?._id || t.doctor,
                            source: 'Doctor Template'
                        });
                    }
                }
            }
        }

        // Deduplicate in memory (case-insensitive)
        const uniqueMap = new Map();
        for (const m of doctorMedications) {
            const key = m.name.toLowerCase();
            if (!uniqueMap.has(key)) {
                uniqueMap.set(key, m);
            }
        }

        const uniqueList = Array.from(uniqueMap.values());
        console.log(`[SyncDoctorDrugs] Extracted ${uniqueList.length} unique doctor medications.`);

        let insertedCount = 0;
        let updatedCount = 0;

        for (const med of uniqueList) {
            const escaped = escapeRegex(med.name);
            const existing = await Drug.findOne({
                name: { $regex: `^${escaped}$`, $options: 'i' }
            });

            if (existing) {
                // Mark existing drug as uploaded by doctor
                existing.uploadedByDoctor = true;
                if (!existing.doctorName) existing.doctorName = med.doctorName;
                if (!existing.strength && med.strength) existing.strength = med.strength;
                if (existing.dosageForm === 'Tablet' && med.dosageForm) existing.dosageForm = med.dosageForm;
                if (existing.isActive === undefined) existing.isActive = true;
                await existing.save();
                updatedCount++;
            } else {
                // Insert new drug
                await Drug.create({
                    name: med.name,
                    category: med.category || 'General',
                    dosageForm: med.dosageForm || 'Tablet',
                    strength: med.strength || '',
                    notes: med.notes || '',
                    manufacturer: '',
                    isActive: true,
                    uploadedByDoctor: true,
                    doctorName: med.doctorName,
                    addedBy: med.addedBy,
                    source: med.source
                });
                insertedCount++;
            }
        }

        // Also check if any existing drugs in Drug have no uploadedByDoctor flag, set default
        const remainingDrugs = await Drug.find({ uploadedByDoctor: { $exists: false } });
        for (const d of remainingDrugs) {
            d.uploadedByDoctor = true; // All previously existing drugs in db came from doctors
            d.doctorName = 'Doctor';
            d.source = 'Doctor Prescription';
            d.isActive = true;
            await d.save();
        }

        const totalDrugsInDb = await Drug.countDocuments();
        console.log(`[SyncDoctorDrugs] Sync completed. Total Drugs in DB: ${totalDrugsInDb} (${insertedCount} new added, ${updatedCount} marked as doctor uploaded).`);

        return {
            success: true,
            extracted: uniqueList.length,
            insertedCount,
            updatedCount,
            totalDrugsInDb
        };
    } catch (error) {
        console.error('[SyncDoctorDrugs] Error syncing doctor drugs:', error.message);
        return { success: false, error: error.message };
    }
};

module.exports = syncDoctorDrugs;
