const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

/**
 * Utility to find 'image' field anywhere in a nested object (Backend version)
 */
const findImageField = (obj) => {
    if (!obj || typeof obj !== 'object') return null;
    
    // 1. Direct check
    if (obj.image && typeof obj.image === 'string') return obj.image;
    
    // 2. Check in 'prescription' property
    if (obj.prescription && obj.prescription.image && typeof obj.prescription.image === 'string') {
        return obj.prescription.image;
    }

    // 3. Search children (except potentially circular or large sub-objects)
    for (const key in obj) {
        if (obj[key] && typeof obj[key] === 'object' && key !== 'patient' && key !== 'doctor') {
            const result = findImageField(obj[key]);
            if (result) return result;
        }
    }
    return null;
};

/**
 * Generates a professional PDF for a prescription
 */
const generatePrescriptionPDF = async (data) => {
    return new Promise((resolve, reject) => {
        try {
            const { prescription, doctorName, patientName, dateStr, clinicalDetails } = data;
            const patientId = prescription?.patient?.displayId || 'N/A';
            const patientPhone = prescription?.patient?.phone || '';

            // --- IMAGE-ONLY DETECTION ---
            const imageField = findImageField(data);
            console.log('[PDF Gen] Detected Image Field:', imageField);

            if (imageField) {
                // Clean the path (remove leading slashes)
                const cleanRelativePath = imageField.replace(/^\/+/, '');
                
                const possiblePaths = [
                    path.resolve(__dirname, '..', cleanRelativePath),
                    path.join(process.cwd(), cleanRelativePath),
                    path.resolve(__dirname, '..', 'uploads', 'prescriptions', path.basename(cleanRelativePath)),
                    path.join(process.cwd(), 'uploads', 'prescriptions', path.basename(cleanRelativePath))
                ];

                let imagePath = null;
                for (const p of possiblePaths) {
                    if (fs.existsSync(p)) {
                        imagePath = p;
                        break;
                    }
                }

                if (imagePath) {
                    console.log('[PDF Gen] Using Image Path:', imagePath);
                    const doc = new PDFDocument({ margin: 0, size: 'A4' });
                    const buffers = [];
                    doc.on('data', chunk => buffers.push(chunk));
                    doc.on('end', () => resolve(Buffer.concat(buffers)));
                    doc.on('error', (err) => {
                        console.error('[PDF Gen] PDFKit Image Mode Error:', err);
                        reject(err);
                    });

                    doc.image(imagePath, 0, 0, {
                        fit: [595.28, 841.89],
                        align: 'center',
                        valign: 'center'
                    });
                    doc.end();
                    return; // EXIT EARLY IF IMAGE IS FOUND
                } else {
                    console.warn('[PDF Gen] Image not found in strategies for:', imageField);
                }
            }

            // --- STANDARD TEMPLATE (FALLBACK) ---
            const doc = new PDFDocument({ 
                margin: 40, 
                size: 'A4',
                info: { Title: `Prescription - ${patientName}`, Author: 'Venus Healthcare' }
            });

            const buffers = [];
            doc.on('data', chunk => buffers.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(buffers)));
            doc.on('error', (err) => {
                console.error('[PDF Gen] Standard Template Error:', err);
                reject(err);
            });

            // Define colors
            const BRAND_BLUE = '#1e3a8a';
            const BLACK = '#000000';
            const TEXT_GRAY = '#4b5563';

            // Helper function for full width lines
            const drawHorizontalLine = (yPos, thickness = 2) => {
                doc.strokeColor(BLACK).lineWidth(thickness).moveTo(40, yPos).lineTo(555, yPos).stroke();
            };

            // --- Header Section ---
            doc.fillColor(BLACK).fontSize(14).font('Helvetica-Bold').text(`DR. ${doctorName.toUpperCase()}`, 40, 40, { width: 300 });

            const logoPath = path.join(__dirname, '..', '..', 'venus-frontend', 'public', 'images', 'venus-logo.png');
            if (fs.existsSync(logoPath)) {
                doc.image(logoPath, 365, 30, { width: 190, align: 'right' });
            }
            
            doc.font('Helvetica').fontSize(7).fillColor(TEXT_GRAY);
            doc.text('200, Sri Subiksham Flats, Chitlapakkam Main Road,', 300, 75, { align: 'right', width: 255 });
            doc.text('Ganesh Nagar, Selaiyur, Chennai - 600 073', 300, 85, { align: 'right', width: 255 });
            doc.text('Ph: 7708317826, 7010315857', 300, 95, { align: 'right', width: 255 });

            doc.moveDown(1.5);
            let currentY = 120;
            drawHorizontalLine(currentY);

            // --- Patient Info Row ---
            currentY += 10;
            doc.font('Helvetica-Bold').fontSize(8).fillColor(BLACK);
            doc.text(`ID: ${patientId} - ${patientName.toUpperCase()}`, 40, currentY);
            doc.text(`MOB. NO.: ${patientPhone}`, 180, currentY);
            doc.text(`DATE: ${dateStr.toUpperCase()}`, 400, currentY, { align: 'right', width: 155 });

            currentY += 15;
            const v = clinicalDetails?.vitals || {};
            doc.text(`WEIGHT (KG): ${v.weight || '-'}, HEIGHT (CM): ${v.height || '-'}, BP: ${v.bloodPressure || '-'} MMHG`, 40, currentY);

            currentY += 15;
            drawHorizontalLine(currentY);

            // --- Diagnosis & Notes ---
            currentY += 10;
            doc.font('Helvetica-Bold').fontSize(8);
            doc.text('CHIEF COMPLAINTS', 40, currentY, { underline: true });
            doc.text('CLINICAL FINDINGS', 300, currentY, { underline: true });
            
            currentY += 12;
            doc.font('Helvetica-Bold').fontSize(7);
            doc.text(clinicalDetails?.diagnosis || '-', 40, currentY, { width: 240 });
            doc.text(clinicalDetails?.clinicalNotes || '-', 300, currentY, { width: 240 });

            currentY += Math.max(doc.heightOfString(clinicalDetails?.diagnosis || '-', { width: 240 }), doc.heightOfString(clinicalDetails?.clinicalNotes || '-', { width: 240 }));
            currentY += 10;
            drawHorizontalLine(currentY);

            // --- Rx Section ---
            currentY += 10;
            doc.font('Helvetica-Bold').fontSize(14).text('Rx', 40, currentY);
            currentY += 25;
            doc.font('Helvetica-Bold').fontSize(8);
            doc.text('MEDICINE NAME', 40, currentY);
            doc.text('FREQUENCY', 280, currentY);
            doc.text('DURATION', 440, currentY);

            currentY += 12;
            drawHorizontalLine(currentY);
            currentY += 10;

            if (prescription?.medications && prescription.medications.length > 0) {
                prescription.medications.forEach((med, index) => {
                    doc.font('Helvetica-Bold').fontSize(8).fillColor(BLACK);
                    doc.text(`${index + 1}) ${med.name.toUpperCase()}`, 40, currentY, { width: 230 });
                    doc.text(med.frequency, 280, currentY);
                    if (med.instruction) {
                        doc.font('Helvetica').fontSize(7).fillColor(TEXT_GRAY);
                        doc.text(`(${med.instruction})`, 280, currentY + 10);
                    }
                    doc.font('Helvetica-Bold').fontSize(8).fillColor(BLACK);
                    doc.text(`${med.duration} Days`, 440, currentY);
                    currentY += 22;
                });
            } else {
                doc.font('Helvetica').fontSize(8).fillColor(TEXT_GRAY).text('No medications listed.', 40, currentY);
                currentY += 20;
            }

            currentY += 5;
            drawHorizontalLine(currentY);

            if (prescription?.notes) {
                currentY += 15;
                doc.font('Helvetica-Bold').fontSize(8).fillColor(BLACK).text('ADVICE:', 40, currentY, { underline: true });
                currentY += 12;
                doc.font('Helvetica-Bold').fontSize(7);
                const notesText = prescription.notes.toUpperCase();
                doc.text(notesText, 40, currentY, { width: 515, lineGap: 3 });
            }

            // Footer
            const pageCount = doc.bufferedPageRange().count;
            for (let i = 0; i < pageCount; i++) {
                doc.switchToPage(i);
                drawHorizontalLine(775, 1);
                doc.font('Helvetica-Bold').fontSize(6).fillColor(TEXT_GRAY);
                doc.text('SUBSTITUTE WITH EQUIVALENT GENERICS AS REQUIRED.', 40, 765, { align: 'center', width: 515 });
                doc.font('Helvetica-Bold').fontSize(8).fillColor(BRAND_BLUE);
                doc.text('NEWVENUSCLINIC.COM', 40, 785, { align: 'center', width: 515, characterSpacing: 2 });
            }

            doc.end();
        } catch (error) {
            console.error('[PDF Gen] Critical Error:', error);
            reject(error);
        }
    });
};

module.exports = { generatePrescriptionPDF };
