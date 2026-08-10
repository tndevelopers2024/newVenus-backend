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
                margins: { top: 40, bottom: 15, left: 40, right: 40 },
                size: 'A4',
                info: { Title: `Prescription - ${patientName}`, Author: 'New Venus Clinic' },
                bufferPages: true
            });

            const buffers = [];
            doc.on('data', chunk => buffers.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(buffers)));
            doc.on('error', (err) => {
                console.error('[PDF Gen] Standard Template Error:', err);
                reject(err);
            });

            // Define colors
            const BRAND_BLUE = '#004b93';
            const BLACK = '#000000';
            const TEXT_GRAY = '#4b5563';
            const LIGHT_GRAY = '#cccccc';

            // Helper function for full width lines
            const drawHorizontalLine = (yPos, thickness = 1.5, color = BRAND_BLUE, isDashed = false) => {
                doc.strokeColor(color).lineWidth(thickness);
                if (isDashed) {
                    doc.dash(2, { space: 2 });
                } else {
                    doc.undash();
                }
                doc.moveTo(40, yPos).lineTo(555, yPos).stroke();
                doc.undash();
            };

            // --- Header Section ---
            const logoPath = path.join(__dirname, '..', 'assets', 'venus-logo.png');
            if (fs.existsSync(logoPath)) {
                // Approximate centering logic for logo (width approx 180, A4 width 595 => center is ~207)
                doc.image(logoPath, 207, 30, { height: 40 });
            }
            
            let currentY = 85;
            // Removed 'continued: true' because it breaks with 'align: center'. Using a single string instead.
            doc.fillColor(BRAND_BLUE).fontSize(13).font('Helvetica-Bold').text('Dr. C.R. MADHU PRABHU DOSS, M.B.B.S., M.D., D.M., Cardiology', 40, currentY, { align: 'center' });
            
            currentY += 18;
            // (Tamil font omitted due to PDFKit standard font limitations, using English instead)
            doc.font('Helvetica').fontSize(10).text('Interventions (Canada), FESC (Europe), FSCAI (US)', 40, currentY, { align: 'center' });
            currentY += 14;
            doc.font('Helvetica').text('SENIOR CONSULTANT INTERVENTIONAL CARDIOLOGIST', 40, currentY, { align: 'center' });
            
            currentY += 20;
            drawHorizontalLine(currentY);
            currentY += 5;
            
            doc.fillColor(BRAND_BLUE).font('Helvetica-Bold').fontSize(10);
            doc.text('Regd. No. 65582', 40, currentY);
            doc.text('APOLLO HOSPITALS - OMR', 350, currentY, { width: 205, align: 'right' });
            
            currentY += 15;
            drawHorizontalLine(currentY);
            currentY += 15;

            // --- Patient Info Row ---
            const pGender = prescription?.patient?.gender ? `(${prescription.patient.gender[0]})` : '';
            const pAge = prescription?.patient?.age ? `${prescription.patient.age} Y` : '-';
            
            doc.fillColor(BRAND_BLUE).font('Helvetica-Bold').fontSize(12);
            doc.text('Name : ', 40, currentY, { continued: true });
            doc.fillColor(BLACK).font('Helvetica').text(` ${patientName} ${pGender}`);
            
            // Fixed the date wrapping by manually aligning text blocks instead of using continued
            doc.fillColor(BRAND_BLUE).font('Helvetica-Bold').text('Date : ', 400, currentY, { width: 45, align: 'right' });
            doc.fillColor(BLACK).font('Helvetica').text(` ${dateStr}`, 445, currentY, { width: 110, align: 'left' });
            
            currentY += 20;
            doc.fillColor(BRAND_BLUE).font('Helvetica-Bold').text('Age : ', 40, currentY, { continued: true });
            doc.fillColor(BLACK).font('Helvetica').text(` ${pAge}`);
            
            currentY += 25;
            const v = clinicalDetails?.vitals || {};
            doc.fillColor(TEXT_GRAY).font('Helvetica-Bold').fontSize(9).text('Vitals: ', 40, currentY, { continued: true });
            doc.font('Helvetica').text(`BP: ${v.bloodPressure || '-'} mmHg, Pulse: ${v.pulse || '-'} bpm, SPO2: ${v.spo2 || '-'}%, Temp: ${v.temperature || '-'} °F, Weight: ${v.weight || '-'} Kg`);
            
            currentY += 25;
            
            // --- Diagnosis & Notes ---
            doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(10);
            doc.text('Chief Complaints', 40, currentY, { underline: true });
            doc.text('Clinical Findings', 300, currentY, { underline: true });
            
            currentY += 15;
            doc.font('Helvetica').fontSize(10);
            doc.text(clinicalDetails?.diagnosis || '-', 40, currentY, { width: 240 });
            doc.text(clinicalDetails?.clinicalNotes || '-', 300, currentY, { width: 240 });
            
            const diagHeight = doc.heightOfString(clinicalDetails?.diagnosis || '-', { width: 240 });
            const notesHeight = doc.heightOfString(clinicalDetails?.clinicalNotes || '-', { width: 240 });
            currentY += Math.max(diagHeight, notesHeight) + 15;
            
            // --- Rx Section ---
            doc.font('Times-Bold').fontSize(18).text('Rx', 40, currentY);
            currentY += 30;
            doc.font('Helvetica-Bold').fontSize(10);
            doc.text('Medicine Name', 40, currentY);
            doc.text('Frequency', 320, currentY);
            doc.text('Duration', 460, currentY);
            
            currentY += 15;
            drawHorizontalLine(currentY, 1.5, BLACK);
            currentY += 12;
            
            if (prescription?.medications && prescription.medications.length > 0) {
                prescription.medications.forEach((med, index) => {
                    // Check page break manually
                    if (currentY > 720) {
                        doc.addPage();
                        currentY = 50;
                    }

                    doc.font('Helvetica-Bold').fontSize(10).fillColor(BLACK);
                    doc.text(`${index + 1}) ${med.name}`, 40, currentY, { width: 270 });
                    doc.font('Helvetica').text(med.frequency, 320, currentY);
                    if (med.instruction) {
                        doc.font('Helvetica').fontSize(8).fillColor(TEXT_GRAY);
                        doc.text(`(${med.instruction})`, 320, currentY + 12);
                    }
                    doc.font('Helvetica').fontSize(10).fillColor(BLACK);
                    doc.text(`${med.duration} Days`, 460, currentY);
                    
                    currentY += Math.max(25, doc.heightOfString(`${index + 1}) ${med.name}`, { width: 270 }) + 10);
                    drawHorizontalLine(currentY, 1, LIGHT_GRAY, true);
                    currentY += 12;
                });
            } else {
                doc.font('Helvetica').fontSize(10).fillColor(TEXT_GRAY).text('No medications listed.', 40, currentY);
                currentY += 20;
                drawHorizontalLine(currentY, 1, LIGHT_GRAY, true);
                currentY += 12;
            }
            
            if (prescription?.notes) {
                if (currentY > 700) { doc.addPage(); currentY = 50; }
                currentY += 10;
                doc.font('Helvetica-Bold').fontSize(10).fillColor(BLACK).text('ADVICE:', 40, currentY, { underline: true });
                currentY += 15;
                doc.font('Helvetica').fontSize(10);
                doc.text(prescription.notes, 40, currentY, { width: 515, lineGap: 3 });
            }
            
            // Footer
            const pageCount = doc.bufferedPageRange().count;
            for (let i = 0; i < pageCount; i++) {
                doc.switchToPage(i);
                doc.font('Helvetica-Bold').fontSize(8).fillColor(BRAND_BLUE);
                drawHorizontalLine(780, 1.5, BRAND_BLUE);
                
                // Use absolute positioning with lineBreak: false to bypass auto-page wrapping
                doc.text('CLINIC: 200, Sri Subiksham Flats, Chitlapakkam Main Road, Ganesh Nagar, Selaiyur, Chennai - 600 073.', 40, 790, { align: 'center', width: 515, lineBreak: false });
                doc.text('Ph. 70103 15857 / 77083 17826 / 81480 70207', 40, 803, { align: 'center', width: 515, lineBreak: false });
                doc.text('TIMING: Morning - 10am to 12.30 pm / Evening - 6.00 pm to 9.00 pm', 40, 816, { align: 'center', width: 515, lineBreak: false });
            }

            doc.end();
        } catch (error) {
            console.error('[PDF Gen] Critical Error:', error);
            reject(error);
        }
    });
};

module.exports = { generatePrescriptionPDF };
