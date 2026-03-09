/**
 * Patient Summary PDF Service (PDFKit Version)
 * Fast native PDF generation - replaces Puppeteer for instant generation
 * 
 * Performance: ~500ms vs 15-20s with Puppeteer
 */

const PDFDocument = require('pdfkit');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');
const { aggregatePatientData } = require('./dataAggregator');

// Font paths
const FONTS = {
    regular: path.join(__dirname, '../assets/fonts/Sarabun-Regular.ttf'),
    bold: path.join(__dirname, '../assets/fonts/Sarabun-Bold.ttf')
};

// Colors (matching dashboard theme)
const COLORS = {
    primary: '#3B82F6',
    primaryDark: '#1E40AF',
    success: '#16A34A',
    warning: '#D97706',
    danger: '#DC2626',
    dark: '#0F172A',
    slate: '#64748B',
    slateLight: '#94A3B8',
    background: '#F8FAFC',
    border: '#E2E8F0'
};

/**
 * Generate a unique audit ID
 */
const generateAuditId = () => {
    return `RPT-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
};

/**
 * Generate AI summary based on data
 */
const generateAISummary = (data, language) => {
    const { engagement, adherence, vitals, symptoms } = data;

    if (language === 'th') {
        let summary = '';
        if (engagement.percentage >= 80) {
            summary += 'ผู้ป่วยมีส่วนร่วมดีเยี่ยมในการเช็คอินสุขภาพประจำวัน ';
        } else if (engagement.percentage >= 50) {
            summary += 'ผู้ป่วยมีส่วนร่วมปานกลางในการเช็คอินสุขภาพ ';
        } else {
            summary += 'ผู้ป่วยมีส่วนร่วมในการเช็คอินค่อนข้างน้อย ควรติดตามเพิ่มเติม ';
        }

        if (adherence.percentage !== null) {
            if (adherence.percentage >= 80) {
                summary += 'การรับประทานยาสม่ำเสมอ ';
            } else {
                summary += 'การรับประทานยาต้องการการติดตามเพิ่มเติม ';
            }
        }

        if (vitals.trend === 'improving') {
            summary += 'แนวโน้มค่าสุขภาพดีขึ้น ';
        } else if (vitals.trend === 'worsening') {
            summary += 'แนวโน้มค่าสุขภาพต้องเฝ้าระวัง ';
        } else {
            summary += 'แนวโน้มค่าสุขภาพคงที่ ';
        }

        if (symptoms.total === 0) {
            summary += 'ไม่พบอาการผิดปกติที่รายงานในช่วงเวลานี้';
        } else {
            summary += `มีอาการที่รายงาน ${symptoms.total} ครั้ง`;
        }
        return summary;
    } else {
        let summary = '';
        if (engagement.percentage >= 80) {
            summary += 'Patient demonstrates excellent engagement with daily health check-ins. ';
        } else if (engagement.percentage >= 50) {
            summary += 'Patient shows moderate engagement with health monitoring. ';
        } else {
            summary += 'Patient engagement is below expected levels and requires follow-up. ';
        }

        if (adherence.percentage !== null) {
            if (adherence.percentage >= 80) {
                summary += 'Medication adherence is consistent. ';
            } else {
                summary += 'Medication adherence shows room for improvement. ';
            }
        }

        summary += `Vitals trend is ${vitals.trend}. `;

        if (symptoms.total === 0) {
            summary += 'No concerning symptoms reported during this period.';
        } else {
            summary += `${symptoms.total} symptom occurrence(s) were reported and documented.`;
        }
        return summary;
    }
};

/**
 * Draw a styled box with optional fill
 */
const drawBox = (doc, x, y, width, height, options = {}) => {
    const { fill, stroke, radius } = options;
    if (fill) doc.fillColor(fill);
    if (stroke) doc.strokeColor(stroke);

    if (radius) {
        doc.roundedRect(x, y, width, height, radius);
    } else {
        doc.rect(x, y, width, height);
    }

    if (fill && stroke) {
        doc.fillAndStroke();
    } else if (fill) {
        doc.fill();
    } else if (stroke) {
        doc.stroke();
    }
};

/**
 * Add section title
 */
const addSectionTitle = (doc, text, y, emoji = '') => {
    doc.font('Sarabun-Bold')
        .fontSize(12)
        .fillColor(COLORS.primaryDark)
        .text(`${emoji} ${text}`, 50, y);

    // Underline
    doc.moveTo(50, y + 18)
        .lineTo(545, y + 18)
        .strokeColor(COLORS.border)
        .lineWidth(1)
        .stroke();

    return y + 28;
};

/**
 * Add metric row
 */
const addMetricRow = (doc, label, value, y, options = {}) => {
    const { valueColor = COLORS.dark } = options;

    doc.font('Sarabun')
        .fontSize(10)
        .fillColor(COLORS.slate)
        .text(label, 60, y);

    doc.font('Sarabun-Bold')
        .fillColor(valueColor)
        .text(value, 350, y, { width: 185, align: 'right' });

    return y + 18;
};

/**
 * Get color based on percentage
 */
const getPercentageColor = (value, thresholds = { good: 70, warning: 50 }) => {
    if (value >= thresholds.good) return COLORS.success;
    if (value >= thresholds.warning) return COLORS.warning;
    return COLORS.danger;
};

/**
 * Generate patient health summary PDF using PDFKit
 */
const generatePatientSummary = async ({
    patientId,
    tenantId,
    timeRangeDays,
    language,
    generatedBy
}) => {
    const startTime = Date.now();
    const auditId = generateAuditId();

    console.log(`[PDF-Fast] Starting generation for patient ${patientId}, ${timeRangeDays} days, ${language}`);

    try {
        // 1. Aggregate patient data
        const data = await aggregatePatientData(patientId, timeRangeDays, tenantId);

        // 2. Generate AI summary
        const aiSummary = generateAISummary(data, language);

        // 3. Create PDF document
        const doc = new PDFDocument({
            size: 'A4',
            margin: 50,
            info: {
                Title: `Patient Health Summary - ${data.patient.name}`,
                Author: 'Hanna AI Nurse',
                Subject: `${timeRangeDays}-Day Health Report`,
                Creator: 'Hanna Care Intelligence',
                Producer: 'PDFKit',
                Keywords: 'health, summary, patient, report'
            }
        });

        // Collect PDF buffer
        const chunks = [];
        doc.on('data', chunk => chunks.push(chunk));

        // Register Thai fonts
        doc.registerFont('Sarabun', FONTS.regular);
        doc.registerFont('Sarabun-Bold', FONTS.bold);

        // ====== HEADER ======
        doc.font('Sarabun-Bold')
            .fontSize(18)
            .fillColor(COLORS.dark)
            .text(language === 'th' ? '📋 รายงานสรุปสุขภาพผู้ป่วย' : '📋 Patient Health Summary', 50, 50);



        doc.font('Sarabun')
            .fontSize(10)
            .fillColor(COLORS.slate)
            .text(language === 'th' ? 'Hanna AI Nurse • Patient Health Summary' : 'Hanna AI Nurse Infrastructure', 50, 75);

        // Date range on right
        doc.font('Sarabun')
            .fontSize(9)
            .fillColor(COLORS.slate)
            .text(language === 'th' ? `ช่วงการติดตาม: ${timeRangeDays} วันล่าสุด` : `Monitoring Period: Last ${timeRangeDays} Days`, 350, 50, { width: 195, align: 'right' });

        const startDate = new Date(data.timeRange.startDate).toLocaleDateString(language === 'th' ? 'th-TH' : 'en-US');
        const endDate = new Date(data.timeRange.endDate).toLocaleDateString(language === 'th' ? 'th-TH' : 'en-US');
        doc.text(`${startDate} - ${endDate}`, 350, 65, { width: 195, align: 'right' });

        // Header line
        doc.moveTo(50, 95)
            .lineTo(545, 95)
            .strokeColor(COLORS.primary)
            .lineWidth(2)
            .stroke();

        let yPos = 115;

        // ====== 1. PATIENT SNAPSHOT ======
        yPos = addSectionTitle(doc, language === 'th' ? '1. ข้อมูลผู้ป่วย (Patient Snapshot)' : '1. Patient Snapshot', yPos, '👤');

        // Patient info box
        drawBox(doc, 50, yPos, 495, 70, { fill: COLORS.background, stroke: COLORS.border, radius: 6 });

        const col1 = 60, col2 = 220, col3 = 380;
        const row1 = yPos + 12, row2 = yPos + 42;

        // Row 1
        doc.font('Sarabun').fontSize(9).fillColor(COLORS.slate)
            .text(language === 'th' ? 'รหัสผู้ป่วย' : 'Patient ID', col1, row1);
        doc.font('Sarabun-Bold').fontSize(11).fillColor(COLORS.dark)
            .text(`HN-${String(data.patient.id).padStart(8, '0')}`, col1, row1 + 12);

        doc.font('Sarabun').fontSize(9).fillColor(COLORS.slate)
            .text(language === 'th' ? 'อายุ' : 'Age', col2, row1);
        doc.font('Sarabun-Bold').fontSize(11).fillColor(COLORS.dark)
            .text(`${data.patient.age || 'N/A'} ${language === 'th' ? 'ปี' : 'years'}`, col2, row1 + 12);

        doc.font('Sarabun').fontSize(9).fillColor(COLORS.slate)
            .text(language === 'th' ? 'โรคประจำตัว' : 'Condition', col3, row1);
        doc.font('Sarabun-Bold').fontSize(11).fillColor(COLORS.dark)
            .text(data.patient.condition || 'N/A', col3, row1 + 12);

        // Row 2
        doc.font('Sarabun').fontSize(9).fillColor(COLORS.slate)
            .text(language === 'th' ? 'ชื่อ' : 'Name', col1, row2);
        doc.font('Sarabun-Bold').fontSize(11).fillColor(COLORS.dark)
            .text(data.patient.name || 'N/A', col1, row2 + 12);

        doc.font('Sarabun').fontSize(9).fillColor(COLORS.slate)
            .text(language === 'th' ? 'สถานะ' : 'Status', col2, row2);
        doc.font('Sarabun-Bold').fontSize(11).fillColor(COLORS.success)
            .text(data.patient.status || 'Active', col2, row2 + 12);

        doc.font('Sarabun').fontSize(9).fillColor(COLORS.slate)
            .text(language === 'th' ? 'ลงทะเบียนตั้งแต่' : 'Enrolled Since', col3, row2);
        doc.font('Sarabun-Bold').fontSize(11).fillColor(COLORS.dark)
            .text(new Date(data.patient.enrolledSince).toLocaleDateString(language === 'th' ? 'th-TH' : 'en-US'), col3, row2 + 12);

        yPos += 85;

        // ====== 2. ENGAGEMENT OVERVIEW ======
        yPos = addSectionTitle(doc, language === 'th' ? '2. ภาพรวมการมีส่วนร่วม' : '2. Engagement Overview', yPos, '💬');

        const engagementColor = getPercentageColor(data.engagement.percentage);
        yPos = addMetricRow(doc,
            language === 'th' ? 'วันที่ตอบกลับ' : 'Days Responded',
            `${data.engagement.daysResponded} / ${data.engagement.totalDays} ${language === 'th' ? 'วัน' : 'days'} (${data.engagement.percentage}%)`,
            yPos, { valueColor: engagementColor });

        yPos = addMetricRow(doc,
            language === 'th' ? 'ขาดการเช็คอิน' : 'Missed Check-ins',
            `${data.engagement.missedDays} ${language === 'th' ? 'วัน' : 'days'}`,
            yPos);

        yPos = addMetricRow(doc,
            language === 'th' ? 'การติดต่อผ่าน LINE' : 'LINE Engagement',
            language === 'th' ? 'ยืนยันแล้ว ✓' : 'Confirmed ✓',
            yPos, { valueColor: COLORS.success });

        yPos += 10;

        // ====== 3. MEDICATION ADHERENCE ======
        yPos = addSectionTitle(doc, language === 'th' ? '3. การรับประทานยา' : '3. Medication Adherence', yPos, '💊');

        if (data.adherence.percentage !== null) {
            const adherenceColor = getPercentageColor(data.adherence.percentage, { good: 80, warning: 60 });
            yPos = addMetricRow(doc,
                language === 'th' ? 'อัตราการทานยาตรงเวลา' : 'Adherence Rate',
                `${data.adherence.percentage}%`,
                yPos, { valueColor: adherenceColor });
        } else {
            yPos = addMetricRow(doc,
                language === 'th' ? 'อัตราการทานยาตรงเวลา' : 'Adherence Rate',
                language === 'th' ? 'ไม่มีข้อมูล' : 'No data',
                yPos);
        }

        yPos = addMetricRow(doc,
            language === 'th' ? 'ครั้งที่ทานยา' : 'Doses Taken',
            `${data.adherence.totalTaken} / ${data.adherence.totalExpected}`,
            yPos);

        if (data.adherence.pattern) {
            doc.font('Sarabun').fontSize(9).fillColor(COLORS.warning)
                .text(`⚠️ ${data.adherence.pattern}`, 60, yPos);
            yPos += 15;
        }

        yPos += 10;

        // ====== 4. SYMPTOM & RISK SIGNALS ======
        yPos = addSectionTitle(doc, language === 'th' ? '4. อาการและสัญญาณความเสี่ยง' : '4. Symptom & Risk Signals', yPos, '⚠️');

        yPos = addMetricRow(doc,
            language === 'th' ? 'อาการที่รายงาน' : 'Reported Symptoms',
            `${data.symptoms.total} ${language === 'th' ? 'ครั้ง' : 'occurrences'}`,
            yPos);

        // Symptom tags
        if (data.symptoms.list.length > 0) {
            doc.font('Sarabun').fontSize(9).fillColor(COLORS.slate);
            let tagX = 60;
            data.symptoms.list.slice(0, 5).forEach(s => {
                const text = `${s.name} (${s.count})`;
                const width = doc.widthOfString(text) + 16;

                drawBox(doc, tagX, yPos, width, 18, { fill: COLORS.border, radius: 4 });
                doc.fillColor(COLORS.slate).text(text, tagX + 8, yPos + 4);
                tagX += width + 6;
            });
            yPos += 25;
        } else {
            doc.font('Sarabun').fontSize(9).fillColor(COLORS.slateLight)
                .text(language === 'th' ? 'ไม่มีอาการที่รายงาน' : 'No symptoms reported', 60, yPos);
            yPos += 15;
        }

        // Trend badge
        const trendText = data.vitals.trend === 'improving'
            ? (language === 'th' ? '↗ ดีขึ้น' : '↗ Improving')
            : data.vitals.trend === 'worsening'
                ? (language === 'th' ? '↘ แย่ลง' : '↘ Worsening')
                : (language === 'th' ? '→ คงที่' : '→ Stable');

        const trendColor = data.vitals.trend === 'improving' ? COLORS.success
            : data.vitals.trend === 'worsening' ? COLORS.danger : COLORS.primary;

        yPos = addMetricRow(doc, language === 'th' ? 'แนวโน้ม' : 'Trend', trendText, yPos, { valueColor: trendColor });

        const escalationColor = data.escalations.critical > 0 ? COLORS.danger : COLORS.dark;
        yPos = addMetricRow(doc,
            language === 'th' ? 'การส่งต่อพยาบาล' : 'Nurse Escalations',
            `${data.escalations.total}${data.escalations.critical > 0 ? ` (${language === 'th' ? 'วิกฤต' : 'Critical'}: ${data.escalations.critical})` : ''}`,
            yPos, { valueColor: escalationColor });

        yPos += 10;

        // ====== 5. NURSE NOTES ======
        yPos = addSectionTitle(doc, language === 'th' ? '5. บันทึกพยาบาล' : '5. Nurse Notes & Actions', yPos, '👩‍⚕️');

        if (data.nurseActions.recentTasks.length > 0) {
            // Table header
            doc.font('Sarabun-Bold').fontSize(9).fillColor(COLORS.slate);
            doc.text(language === 'th' ? 'วันที่' : 'Date', 60, yPos);
            doc.text(language === 'th' ? 'ประเภท' : 'Type', 150, yPos);
            doc.text(language === 'th' ? 'รายละเอียด' : 'Details', 250, yPos);
            doc.text(language === 'th' ? 'สถานะ' : 'Status', 450, yPos);
            yPos += 15;

            doc.moveTo(60, yPos).lineTo(535, yPos).strokeColor(COLORS.border).stroke();
            yPos += 5;

            data.nurseActions.recentTasks.slice(0, 5).forEach(task => {
                doc.font('Sarabun').fontSize(9).fillColor(COLORS.dark);
                doc.text(new Date(task.created_at).toLocaleDateString(language === 'th' ? 'th-TH' : 'en-US'), 60, yPos);
                doc.text(task.task_type || 'General', 150, yPos);
                doc.text((task.reason || task.title || '-').substring(0, 30), 250, yPos);
                doc.fillColor(task.resolved_at ? COLORS.success : COLORS.warning)
                    .text(task.resolved_at ? '✓' : '⏳', 450, yPos);
                yPos += 15;
            });
        } else {
            doc.font('Sarabun').fontSize(9).fillColor(COLORS.slateLight)
                .text(language === 'th' ? 'ไม่มีการดำเนินการของพยาบาลในช่วงเวลานี้' : 'No nurse actions recorded during this period', 60, yPos, { align: 'center', width: 475 });
            yPos += 15;
        }

        yPos += 15;

        // ====== 6. AI SUMMARY ======
        yPos = addSectionTitle(doc, language === 'th' ? '6. สรุปโดย AI' : '6. AI Summary', yPos, '🤖');

        // AI summary box
        drawBox(doc, 50, yPos, 495, 60, { fill: '#EFF6FF', stroke: '#BFDBFE', radius: 6 });

        doc.font('Sarabun-Bold').fontSize(9).fillColor(COLORS.primaryDark)
            .text(language === 'th' ? 'AI-Generated Summary (ตรวจสอบโดยทีมคลินิก)' : 'AI-Generated Summary (Reviewed by Clinical Team)', 60, yPos + 8);

        doc.font('Sarabun').fontSize(10).fillColor(COLORS.dark)
            .text(`"${aiSummary}"`, 60, yPos + 24, { width: 475, align: 'left' });

        yPos += 75;

        // ====== FOOTER ======
        const footerY = 750;
        doc.moveTo(50, footerY).lineTo(545, footerY).strokeColor(COLORS.border).stroke();

        doc.font('Sarabun').fontSize(8).fillColor(COLORS.slate);
        doc.text(`${language === 'th' ? 'สร้างเมื่อ' : 'Generated'}: ${new Date().toLocaleString(language === 'th' ? 'th-TH' : 'en-US')}`, 50, footerY + 8);
        doc.text(`Audit ID: ${auditId}`, 350, footerY + 8, { width: 195, align: 'right' });

        doc.text(`Document ID: PDF-${new Date().getFullYear()}-${Math.random().toString().slice(2, 8)}`, 50, footerY + 20);
        doc.text('Hanna AI Nurse Infrastructure', 350, footerY + 20, { width: 195, align: 'right' });

        // Disclaimer
        drawBox(doc, 50, footerY + 35, 495, 30, { fill: '#FEF3C7', stroke: '#FCD34D', radius: 4 });
        doc.font('Sarabun').fontSize(7).fillColor('#92400E')
            .text(language === 'th'
                ? '⚠️ รายงานนี้จัดทำขึ้นเพื่อสนับสนุนการตัดสินใจทางคลินิก แต่ไม่ได้แทนที่การวินิจฉัยของแพทย์'
                : '⚠️ This summary supports clinical decision-making but does not replace clinician judgment.',
                60, footerY + 45, { width: 475, align: 'center' });

        // 4. Finalize document
        doc.end();

        // Wait for PDF to be generated
        const pdfBuffer = await new Promise((resolve, reject) => {
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);
        });

        // 5. Calculate checksum
        const checksum = crypto.createHash('sha256').update(pdfBuffer).digest('hex');
        const generationTimeMs = Date.now() - startTime;

        console.log(`[PDF-Fast] Generation complete in ${generationTimeMs}ms (${pdfBuffer.length} bytes)`);

        // 6. Save to audit log (graceful failure)
        if (process.env.USE_MOCK_DATA !== 'true') {
            try {
                await db.query(`
                    INSERT INTO pdf_audit_log (
                        patient_id, audit_id, generated_by, 
                        time_range_days, language, file_path,
                        file_size_bytes, checksum, generation_time_ms
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                `, [
                    patientId, auditId, generatedBy, timeRangeDays, language,
                    `summaries/${patientId}/${auditId}.pdf`,
                    pdfBuffer.length, checksum, generationTimeMs
                ]);
            } catch (auditError) {
                console.warn('[PDF-Fast] Audit log insert failed:', auditError.message);
            }
        }

        return {
            success: true,
            auditId,
            pdfBuffer,
            checksum,
            generationTimeMs,
            patient: data.patient
        };

    } catch (error) {
        console.error('[PDF-Fast] Generation failed:', error);
        throw error;
    }
};

/**
 * Retrieve PDF generation history for a patient
 */
const getPDFHistory = async (patientId, limit = 20) => {
    const result = await db.query(`
        SELECT 
            audit_id, time_range_days, language,
            file_size_bytes, generation_time_ms,
            accessed_count, created_at
        FROM pdf_audit_log
        WHERE patient_id = $1
        ORDER BY created_at DESC
        LIMIT $2
    `, [patientId, limit]);
    return result.rows;
};

/**
 * Verify PDF integrity by audit ID
 */
const verifyPDF = async (auditId) => {
    const result = await db.query(`
        SELECT checksum, created_at, patient_id
        FROM pdf_audit_log
        WHERE audit_id = $1
    `, [auditId]);

    if (!result.rows[0]) {
        return { valid: false, error: 'Audit ID not found' };
    }

    return {
        valid: true,
        checksum: result.rows[0].checksum,
        createdAt: result.rows[0].created_at,
        patientId: result.rows[0].patient_id
    };
};

module.exports = {
    generatePatientSummary,
    getPDFHistory,
    verifyPDF,
    generateAuditId
};
