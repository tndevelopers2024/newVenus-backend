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
 * Format duration (e.g., "5 Days", "2 Weeks", "1 Month") and prevent duplicates
 */
const formatMedDuration = (duration, durationUnit = 'Days') => {
    const unitStr = String(durationUnit || '').trim();
    let durStr = duration !== undefined && duration !== null ? String(duration).trim() : '';

    if (unitStr.toLowerCase().includes('review') || durStr.toLowerCase().includes('review')) {
        return 'Till Review';
    }

    if (!durStr && durStr !== '0') return '-';

    durStr = durStr.replace(/\b(days?|weeks?|months?)(\s+\1)+\b/gi, '$1');

    const match = durStr.match(/^(\d+)\s*(days?|weeks?|months?)$/i);
    if (match) {
        const num = parseInt(match[1], 10);
        const u = match[2].toLowerCase();
        if (u.startsWith('day')) return `${num} ${num === 1 ? 'Day' : 'Days'}`;
        if (u.startsWith('week')) return `${num} ${num === 1 ? 'Week' : 'Weeks'}`;
        if (u.startsWith('month')) return `${num} ${num === 1 ? 'Month' : 'Months'}`;
        return durStr;
    }

    const num = parseInt(durStr, 10);
    if (!isNaN(num)) {
        const unit = unitStr.toLowerCase();
        if (unit.startsWith('day')) return `${num} ${num === 1 ? 'Day' : 'Days'}`;
        if (unit.startsWith('week')) return `${num} ${num === 1 ? 'Week' : 'Weeks'}`;
        if (unit.startsWith('month')) return `${num} ${num === 1 ? 'Month' : 'Months'}`;
        return `${num} ${durationUnit || 'Days'}`;
    }

    return durStr;
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

            // --- STANDARD TEMPLATE (mirrors the printed prescription layout) ---
            const PX = 0.75; // the print layout is in CSS px; PDF units are pt
            const MARGIN_LEFT = 90 * PX;   // same left gutter as the printed sheet
            const MARGIN_RIGHT = 32 * PX;
            const MARGIN_TOP = 28 * PX;
            const PAGE_W = 595.28;
            const PAGE_H = 841.89;
            const CONTENT_W = PAGE_W - MARGIN_LEFT - MARGIN_RIGHT;
            const RIGHT_X = PAGE_W - MARGIN_RIGHT;
            const INNER_X = MARGIN_LEFT + 10 * PX;       // 10px side padding used by the print layout
            const INNER_W = CONTENT_W - 20 * PX;
            const FOOTER_SEP_Y = 781;
            const BODY_LIMIT = FOOTER_SEP_Y - 14;

            const doc = new PDFDocument({
                margins: { top: MARGIN_TOP, bottom: 0, left: MARGIN_LEFT, right: MARGIN_RIGHT },
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

            const BRAND_BLUE = '#004b93';
            const BLACK = '#000000';
            const TEXT_GRAY = '#4b5563';
            const MUTED = '#64748b';
            const BOX_LINE = '#cfdcec';
            const BOX_HEAD = '#eef4fb';
            const BOX_BG = '#f8fafd';
            const LIGHT_GRAY = '#d1d5db';

            // Tamil needs a Unicode font; drop a Tamil TTF at assets/fonts/ to enable the Tamil header line.
            let tamilFont = null;
            for (const name of ['NotoSansTamil-Bold.ttf', 'NotoSansTamil-Regular.ttf', 'NotoSansTamil.ttf']) {
                const fp = path.join(__dirname, '..', 'assets', 'fonts', name);
                if (fs.existsSync(fp)) { tamilFont = fp; break; }
            }

            const hLine = (y, thickness = 1.5, color = BRAND_BLUE, dashed = false, x1 = MARGIN_LEFT, x2 = RIGHT_X) => {
                doc.strokeColor(color).lineWidth(thickness);
                if (dashed) doc.dash(2, { space: 2 }); else doc.undash();
                doc.moveTo(x1, y).lineTo(x2, y).stroke();
                doc.undash();
            };

            const hLineV = (x, y1, y2) => { doc.strokeColor(BOX_LINE).lineWidth(0.75).undash().moveTo(x, y1).lineTo(x, y2).stroke(); };

            const fmtDate = (d) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });

            // --- Doctor details (same fallbacks as the printed version) ---
            const doctorObj = prescription?.doctor;
            let docName = doctorObj?.name ? doctorObj.name.toUpperCase() : 'DR. C.R. MADHU PRABHU DOSS';
            docName = docName.replace(/^DR\.?\s*DR\.?\s*/i, 'DR. ');
            const hasDetails = !!doctorObj?.doctorDetails;
            const dd = doctorObj?.doctorDetails || {};
            const doctorQuals = hasDetails ? (dd.qualification || '') : 'M.B.B.S., M.D., D.M., Cardiology';
            const doctorTamil = hasDetails ? (dd.nameTamil || '') : 'டாக்டர். சி.ரா. மது பிரபு தாஸ், எம்.பி.பி.எஸ்., எம்.டி., டி.எம்., கார்டியாலஜி';
            const doctorAddQuals = hasDetails ? (dd.additionalQualifications || '') : 'Interventions (Canada), FESC (Europe), FSCAI (US)';
            const doctorRole = hasDetails ? (dd.roleTitle || '') : 'SENIOR CONSULTANT INTERVENTIONAL CARDIOLOGIST';
            const doctorRegd = hasDetails ? (dd.regdNo || '') : 'Regd. No. 65502';

            // --- Header ---
            let y = MARGIN_TOP;
            doc.fillColor(BRAND_BLUE).font('Times-Bold').fontSize(34 * PX);
            doc.text('NEW VENUS CLINIC', MARGIN_LEFT, y, { width: CONTENT_W, align: 'center', characterSpacing: 2.5 * PX, lineBreak: false });
            y += 34 * PX + 8;

            const centered = (text, font, size) => {
                if (!text) return;
                doc.fillColor(BRAND_BLUE).font(font).fontSize(size);
                doc.text(text, MARGIN_LEFT, y, { width: CONTENT_W, align: 'center' });
                y = doc.y + 2;
            };
            centered(`${docName}${doctorQuals ? `, ${doctorQuals}` : ''}`, 'Helvetica-Bold', 17 * PX);
            if (doctorTamil && tamilFont) {
                try { centered(doctorTamil, tamilFont, 15 * PX); } catch (e) { console.warn('[PDF Gen] Tamil font failed:', e.message); }
            }
            centered(doctorAddQuals, 'Helvetica-Bold', 15 * PX);
            centered(doctorRole ? doctorRole.toUpperCase() : '', 'Helvetica-Bold', 15 * PX);

            y += 4;
            hLine(y); y += 6;
            doc.fillColor(BRAND_BLUE).font('Helvetica-Bold').fontSize(13 * PX);
            doc.text(doctorRegd, INNER_X, y, { width: INNER_W / 2, lineBreak: false });
            doc.text('APOLLO HOSPITALS - OMR', INNER_X + INNER_W / 2, y, { width: INNER_W / 2, align: 'right', lineBreak: false });
            y += 13 * PX + 6;
            hLine(y); y += 12;

            // --- Patient info ---
            const pGender = prescription?.patient?.gender || '-';
            const pAge = prescription?.patient?.age ? `${prescription.patient.age} Y` : '-';
            const uhid = prescription?.patient?.displayId || '';
            const infoSize = 15 * PX;
            const infoRow = (label, value, yy) => {
                doc.fillColor(BRAND_BLUE).font('Helvetica-Bold').fontSize(infoSize).text(`${label} : `, INNER_X, yy, { continued: true, lineBreak: false });
                doc.fillColor(BLACK).font('Helvetica').text(value || '-', { lineBreak: false });
            };
            infoRow('Name', patientName, y);
            infoRow('Age', pAge, y + infoSize + 4);
            infoRow('Gender', pGender, y + (infoSize + 4) * 2);

            const rightRow = (label, value, yy) => {
                doc.font('Helvetica-Bold').fontSize(infoSize);
                const lw = doc.widthOfString(`${label} : `);
                doc.font('Helvetica').fontSize(infoSize);
                const vw = doc.widthOfString(value);
                const startX = INNER_X + INNER_W - lw - vw;
                doc.fillColor(BRAND_BLUE).font('Helvetica-Bold').text(`${label} : `, startX, yy, { lineBreak: false });
                doc.fillColor(BLACK).font('Helvetica').text(value, startX + lw, yy, { lineBreak: false });
            };
            rightRow('Date', dateStr, y);
            if (uhid) rightRow('UHID', String(uhid), y + infoSize + 4);
            y += (infoSize + 4) * 3 + 10;

            // --- Vitals strip ---
            const v = clinicalDetails?.vitals || {};
            const vitalCells = [
                ['BP', v.bloodPressure, 'mmHg'],
                ['Pulse', v.pulse, 'bpm'],
                ['SpO2', v.spo2, '%'],
                ['Temp', v.temperature, '°F'],
                ['Weight', v.weight, 'Kg']
            ].filter(c => c[1]);
            if (vitalCells.length > 0) {
                const stripH = 34 * PX + 4;
                doc.save();
                doc.roundedRect(INNER_X, y, INNER_W, stripH, 6).fillAndStroke(BOX_BG, BOX_LINE);
                doc.restore();
                const cellW = INNER_W / vitalCells.length;
                vitalCells.forEach((c, i) => {
                    const cx = INNER_X + cellW * i;
                    if (i > 0) hLineV(cx, y, y + stripH);
                    doc.fillColor(BRAND_BLUE).font('Helvetica-Bold').fontSize(9.5 * PX);
                    doc.text(c[0].toUpperCase(), cx, y + 6, { width: cellW, align: 'center', characterSpacing: 0.6, lineBreak: false });
                    doc.font('Helvetica-Bold').fontSize(14 * PX);
                    const val = String(c[1]);
                    const valW = doc.widthOfString(val);
                    doc.font('Helvetica').fontSize(10 * PX);
                    const unitW = doc.widthOfString(c[2]) + 3 * PX;
                    const sx = cx + (cellW - valW - unitW) / 2;
                    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(14 * PX).text(val, sx, y + 6 + 9.5 * PX + 4, { lineBreak: false });
                    doc.fillColor(MUTED).font('Helvetica').fontSize(10 * PX).text(c[2], sx + valW + 3 * PX, y + 6 + 9.5 * PX + 5, { lineBreak: false });
                });
                y += stripH + 10;
            }

            // --- Chief Complaints / Clinical Findings boxes ---
            if (clinicalDetails?.diagnosis || clinicalDetails?.clinicalNotes) {
                const gap = 12 * PX;
                const boxW = (INNER_W - gap) / 2;
                const headH = 20 * PX;
                const textSize = 13 * PX;
                const pad = 8;
                const contents = [
                    ['Chief Complaints', clinicalDetails?.diagnosis || '-'],
                    ['Clinical Findings', clinicalDetails?.clinicalNotes || '-']
                ];
                doc.font('Helvetica').fontSize(textSize);
                const bodyH = Math.max(...contents.map(c => doc.heightOfString(String(c[1]), { width: boxW - pad * 2, lineGap: 1 }))) + 12;
                contents.forEach((c, i) => {
                    const bx = INNER_X + (boxW + gap) * i;
                    doc.save();
                    doc.roundedRect(bx, y, boxW, headH + bodyH, 6).lineWidth(0.75).fillAndStroke('#ffffff', BOX_LINE);
                    doc.restore();
                    doc.save();
                    doc.roundedRect(bx, y, boxW, headH, 6).clip();
                    doc.rect(bx, y, boxW, headH).fill(BOX_HEAD);
                    doc.restore();
                    hLine(y + headH, 0.75, BOX_LINE, false, bx, bx + boxW);
                    doc.fillColor(BRAND_BLUE).font('Helvetica-Bold').fontSize(10.5 * PX);
                    doc.text(c[0].toUpperCase(), bx + pad, y + 6, { width: boxW - pad * 2, characterSpacing: 0.6, lineBreak: false });
                    doc.fillColor(BLACK).font('Helvetica').fontSize(textSize);
                    doc.text(String(c[1]), bx + pad, y + headH + 6, { width: boxW - pad * 2, lineGap: 1 });
                });
                y += headH + bodyH + 14;
            }

            // --- Rx table ---
            const colName = INNER_X;
            const colFreq = INNER_X + INNER_W * 0.46;
            const colDur = INNER_X + INNER_W * 0.82;
            const nameW = INNER_W * 0.46 - 8;
            const freqW = INNER_W * 0.36 - 8;
            const rowSize = 13 * PX;

            const drawTableHeader = () => {
                doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(rowSize);
                doc.text('Medicine Name', colName, y, { lineBreak: false });
                doc.text('Frequency', colFreq, y, { lineBreak: false });
                doc.font('Helvetica').fontSize(9.5 * PX).fillColor(TEXT_GRAY).text('(Morning-Afternoon-Evening)', colFreq, y + rowSize + 1, { lineBreak: false });
                doc.font('Helvetica-Bold').fontSize(rowSize).fillColor(BLACK).text('Duration', colDur, y, { lineBreak: false });
                y += rowSize + 9.5 * PX + 7;
                hLine(y, 1.5 * PX + 0.2, BLACK, false, INNER_X, INNER_X + INNER_W);
                y += 5;
            };

            if (prescription?.medications && prescription.medications.length > 0) {
                if (y > BODY_LIMIT - 80) { doc.addPage(); y = MARGIN_TOP; }
                doc.fillColor(BLACK).font('Times-Bold').fontSize(20 * PX).text('Rx', INNER_X, y, { lineBreak: false });
                y += 20 * PX + 6;
                drawTableHeader();

                prescription.medications.forEach((med, index) => {
                    const freqText = `${med.frequency || ''}${med.unit && med.unit !== '-' ? ` ${med.unit}` : ''}`;
                    doc.font('Helvetica-Bold').fontSize(rowSize);
                    const nameText = `${index + 1}) ${med.name ? med.name.toUpperCase() : ''}`;
                    const nameH = doc.heightOfString(nameText, { width: nameW });
                    doc.font('Helvetica').fontSize(rowSize);
                    const freqH = doc.heightOfString(freqText, { width: freqW }) + 11;
                    const rowH = Math.max(nameH, freqH, 16);

                    if (y + rowH > BODY_LIMIT) {
                        doc.addPage(); y = MARGIN_TOP;
                        drawTableHeader();
                    }

                    doc.font('Helvetica-Bold').fontSize(rowSize).fillColor(BLACK).text(nameText, colName, y, { width: nameW });
                    doc.font('Helvetica').fontSize(rowSize).fillColor(BLACK).text(freqText, colFreq, y, { width: freqW });
                    doc.font('Helvetica').fontSize(11 * PX).fillColor(TEXT_GRAY).text(`(${med.instruction || 'After Food'})`, colFreq, y + doc.heightOfString(freqText, { width: freqW }) , { width: freqW });
                    doc.font('Helvetica').fontSize(rowSize).fillColor(BLACK).text(formatMedDuration(med.duration, med.durationUnit), colDur, y, { width: INNER_X + INNER_W - colDur });

                    y += rowH + 5;
                    hLine(y, 0.75, LIGHT_GRAY, true, INNER_X, INNER_X + INNER_W);
                    y += 5;
                });
                y += 6;
            }

            // --- Instructions / Remarks box ---
            if (prescription?.notes) {
                doc.font('Helvetica').fontSize(13 * PX);
                const notesH = doc.heightOfString(String(prescription.notes), { width: INNER_W - 28, lineGap: 1 });
                const boxH = notesH + 12 * PX + 18;
                if (y + boxH > BODY_LIMIT) { doc.addPage(); y = MARGIN_TOP; }
                doc.save();
                doc.roundedRect(INNER_X, y, INNER_W, boxH, 6).lineWidth(0.75).fillAndStroke(BOX_BG, BOX_LINE);
                doc.restore();
                doc.save();
                doc.roundedRect(INNER_X, y, INNER_W, boxH, 6).clip();
                doc.rect(INNER_X, y, 4 * PX + 1, boxH).fill(BRAND_BLUE);
                doc.restore();
                doc.fillColor(BRAND_BLUE).font('Helvetica-Bold').fontSize(10.5 * PX);
                doc.text('INSTRUCTIONS / REMARKS', INNER_X + 14, y + 7, { characterSpacing: 0.6, lineBreak: false });
                doc.fillColor(BLACK).font('Helvetica').fontSize(13 * PX);
                doc.text(String(prescription.notes), INNER_X + 14, y + 7 + 10.5 * PX + 4, { width: INNER_W - 28, lineGap: 1 });
                y += boxH + 8;
            }

            if (prescription?.followUpDate) {
                if (y > BODY_LIMIT - 16) { doc.addPage(); y = MARGIN_TOP; }
                doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(13 * PX).text('Follow-up Date: ', INNER_X, y, { continued: true, lineBreak: false });
                doc.font('Helvetica').text(fmtDate(prescription.followUpDate), { lineBreak: false });
            }

            // --- Footer on every page ---
            const pageCount = doc.bufferedPageRange().count;
            const footerLogoPath = path.join(__dirname, '..', 'assets', 'venus-logo.png');
            for (let i = 0; i < pageCount; i++) {
                doc.switchToPage(i);
                hLine(FOOTER_SEP_Y, 1.5 * PX + 0.2, BRAND_BLUE);
                const hasLogo = fs.existsSync(footerLogoPath);
                if (hasLogo) {
                    doc.image(footerLogoPath, MARGIN_LEFT, FOOTER_SEP_Y + 7, { height: 34 });
                }
                const textX = hasLogo ? MARGIN_LEFT + 110 : MARGIN_LEFT;
                const textWidth = RIGHT_X - textX;
                const footerLines = [
                    'CLINIC: 200, Sri Subiksham Flats, Chitlapakkam Main Road, Ganesh Nagar, Selaiyur, Chennai - 600 073.',
                    'Ph. 70103 15857 / 77083 17826',
                    'TIMING: Morning - 10am to 12.30 pm / Evening - 6.00 pm to 9.00 pm'
                ];
                // Shrink the footer text until the longest line fits on one line
                let footerSize = 11.5 * PX;
                doc.font('Helvetica-Bold');
                while (footerSize > 5 && Math.max(...footerLines.map(l => doc.fontSize(footerSize).widthOfString(l))) > textWidth) footerSize -= 0.1;
                doc.fillColor(BRAND_BLUE).fontSize(footerSize);
                footerLines.forEach((line, n) => {
                    doc.text(line, textX, FOOTER_SEP_Y + 8 + n * 12, { align: 'center', width: textWidth + 2, lineBreak: false });
                });
            }

            doc.end();
        } catch (error) {
            console.error('[PDF Gen] Critical Error:', error);
            reject(error);
        }
    });
};

module.exports = { generatePrescriptionPDF };
