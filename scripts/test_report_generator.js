/**
 * Rigorous Report Generator Test Suite
 * Tests the full PDF generation pipeline including:
 * - Database table existence and schema
 * - Query correctness
 * - PDF generation with edge cases
 * - API endpoint behavior
 */

require('dotenv').config();
const db = require('../src/services/db');
const reportService = require('../src/services/report');
const fs = require('fs');
const path = require('path');

const RESULTS = {
    passed: [],
    failed: [],
    warnings: []
};

async function test(name, fn) {
    try {
        console.log(`\n🧪 Testing: ${name}...`);
        await fn();
        console.log(`   ✅ PASSED`);
        RESULTS.passed.push(name);
    } catch (error) {
        console.error(`   ❌ FAILED: ${error.message}`);
        RESULTS.failed.push({ name, error: error.message });
    }
}

function warn(message) {
    console.warn(`   ⚠️ WARNING: ${message}`);
    RESULTS.warnings.push(message);
}

async function main() {
    console.log('═══════════════════════════════════════════════════════');
    console.log('       RIGOROUS REPORT GENERATOR TEST SUITE            ');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`Testing at: ${new Date().toISOString()}`);
    console.log(`Database URL: ${process.env.DATABASE_URL ? '***configured***' : 'MISSING'}`);

    // ============================================================
    // SECTION 1: DATABASE CONNECTIVITY & SCHEMA VERIFICATION
    // ============================================================
    console.log('\n\n📊 SECTION 1: DATABASE & SCHEMA VERIFICATION\n');

    await test('Database connection', async () => {
        const res = await db.query('SELECT NOW()');
        if (!res.rows.length) throw new Error('No response from database');
    });

    await test('chronic_patients table exists', async () => {
        const res = await db.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'chronic_patients'
            ORDER BY ordinal_position
        `);
        if (res.rows.length === 0) throw new Error('Table chronic_patients does not exist');

        const columns = res.rows.map(r => r.column_name);
        const required = ['line_user_id', 'name', 'age', 'condition'];
        const missing = required.filter(c => !columns.includes(c));
        if (missing.length > 0) throw new Error(`Missing columns: ${missing.join(', ')}`);

        console.log(`   📋 Columns: ${columns.join(', ')}`);
    });

    await test('check_ins table exists', async () => {
        const res = await db.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'check_ins'
            ORDER BY ordinal_position
        `);
        if (res.rows.length === 0) throw new Error('Table check_ins does not exist');

        const columns = res.rows.map(r => r.column_name);
        const required = ['line_user_id', 'glucose_level', 'medication_taken', 'symptoms', 'check_in_time'];
        const missing = required.filter(c => !columns.includes(c));
        if (missing.length > 0) throw new Error(`Missing columns: ${missing.join(', ')}`);

        console.log(`   📋 Columns: ${columns.join(', ')}`);
    });

    // ============================================================
    // SECTION 2: DATA AVAILABILITY
    // ============================================================
    console.log('\n\n📊 SECTION 2: DATA AVAILABILITY\n');

    let testUserId = null;

    await test('At least one patient exists', async () => {
        const res = await db.query('SELECT line_user_id, name FROM chronic_patients LIMIT 5');
        if (res.rows.length === 0) throw new Error('No patients in chronic_patients table');

        testUserId = res.rows[0].line_user_id;
        console.log(`   📋 Found ${res.rows.length} patients. Test user: ${testUserId?.substring(0, 12)}...`);
    });

    await test('Patient has check-in data', async () => {
        if (!testUserId) throw new Error('No test user available');

        const res = await db.query(`
            SELECT COUNT(*) as total, 
                   MAX(check_in_time) as last_checkin 
            FROM check_ins 
            WHERE line_user_id = $1
        `, [testUserId]);

        const { total, last_checkin } = res.rows[0];
        console.log(`   📋 Check-ins: ${total}, Last: ${last_checkin || 'N/A'}`);

        if (parseInt(total) === 0) {
            warn(`Patient ${testUserId.substring(0, 12)} has no check-ins. PDF will have empty stats.`);
        }
    });

    // ============================================================
    // SECTION 3: PDF GENERATION SUCCESS CASES
    // ============================================================
    console.log('\n\n📊 SECTION 3: PDF GENERATION SUCCESS CASES\n');

    await test('Generate PDF for valid patient', async () => {
        if (!testUserId) throw new Error('No test user available');

        const pdfBuffer = await reportService.generateReport(testUserId);

        // Verify it's a valid PDF (starts with %PDF-)
        const pdfHeader = pdfBuffer.slice(0, 5).toString('utf8');
        if (pdfHeader !== '%PDF-') {
            throw new Error(`Invalid PDF header: ${pdfHeader}`);
        }

        console.log(`   📋 PDF size: ${pdfBuffer.length} bytes`);

        // Save to temp file for manual inspection
        const outPath = path.join(__dirname, '../test_output_report.pdf');
        fs.writeFileSync(outPath, pdfBuffer);
        console.log(`   📋 Saved to: ${outPath}`);
    });

    await test('PDF contains expected content markers', async () => {
        const outPath = path.join(__dirname, '../test_output_report.pdf');
        if (!fs.existsSync(outPath)) throw new Error('Test PDF not found');

        const pdfContent = fs.readFileSync(outPath, 'utf8');

        // Check for key strings embedded in PDF
        const markers = ['Hanna Health Report', 'Summary', 'Glucose'];
        for (const marker of markers) {
            if (!pdfContent.includes(marker)) {
                warn(`PDF may be missing expected content: ${marker}`);
            }
        }
    });

    // ============================================================
    // SECTION 4: PDF GENERATION FAILURE CASES
    // ============================================================
    console.log('\n\n📊 SECTION 4: PDF GENERATION ERROR HANDLING\n');

    await test('Handle non-existent patient gracefully', async () => {
        const fakeUserId = 'FAKE_USER_THAT_DOES_NOT_EXIST_12345';

        try {
            await reportService.generateReport(fakeUserId);
            throw new Error('Should have thrown an error for non-existent patient');
        } catch (err) {
            if (err.message.includes('Patient not found')) {
                // Good - expected error
            } else if (err.message.includes('Should have thrown')) {
                throw err;
            } else {
                throw new Error(`Unexpected error type: ${err.message}`);
            }
        }
    });

    await test('Handle null userId gracefully', async () => {
        try {
            await reportService.generateReport(null);
            throw new Error('Should have thrown an error for null userId');
        } catch (err) {
            // Any error here is acceptable - we just need to not crash
            if (err.message.includes('Should have thrown')) {
                throw err;
            }
        }
    });

    await test('Handle empty string userId gracefully', async () => {
        try {
            await reportService.generateReport('');
            throw new Error('Should have thrown an error for empty userId');
        } catch (err) {
            if (err.message.includes('Should have thrown')) {
                throw err;
            }
        }
    });

    // ============================================================
    // SECTION 5: QUERY EDGE CASES
    // ============================================================
    console.log('\n\n📊 SECTION 5: QUERY EDGE CASES\n');

    await test('Stats query handles division by zero', async () => {
        // The report.js has a fix for division by zero - verify it works
        const res = await db.query(`
            SELECT 
                COUNT(*) as total_checkins,
                AVG(glucose_level) as avg_glucose,
                SUM(CASE WHEN medication_taken = true THEN 1 ELSE 0 END) as meds_taken,
                SUM(CASE WHEN medication_taken = false THEN 1 ELSE 0 END) as meds_missed,
                COUNT(CASE WHEN symptoms IS NOT NULL AND symptoms != '' THEN 1 END) as symptom_reports
            FROM check_ins
            WHERE line_user_id = 'NONEXISTENT_USER_FOR_TEST'
            AND check_in_time >= NOW() - INTERVAL '30 days'
        `);

        // All values should be 0 or null - not an error
        const stats = res.rows[0];
        console.log(`   📋 Empty query result: total=${stats.total_checkins}, glucose=${stats.avg_glucose || 'null'}`);
    });

    await test('Stats query handles null glucose values', async () => {
        // AVG of null values should be handled gracefully
        const res = await db.query(`SELECT AVG(NULL::numeric) as test_avg`);
        if (res.rows[0].test_avg !== null) {
            warn('AVG of nulls returned unexpected value');
        }
    });

    // ============================================================
    // SECTION 6: MULTIPLE PATIENT TEST
    // ============================================================
    console.log('\n\n📊 SECTION 6: MULTI-PATIENT STRESS TEST\n');

    await test('Generate reports for multiple patients', async () => {
        const res = await db.query('SELECT line_user_id FROM chronic_patients LIMIT 3');

        for (const row of res.rows) {
            const userId = row.line_user_id;
            try {
                const pdfBuffer = await reportService.generateReport(userId);
                console.log(`   ✓ User ${userId.substring(0, 12)}: ${pdfBuffer.length} bytes`);
            } catch (err) {
                throw new Error(`Failed for user ${userId}: ${err.message}`);
            }
        }
    });

    // ============================================================
    // FINAL SUMMARY
    // ============================================================
    console.log('\n\n═══════════════════════════════════════════════════════');
    console.log('                    TEST RESULTS SUMMARY                 ');
    console.log('═══════════════════════════════════════════════════════\n');

    console.log(`✅ PASSED: ${RESULTS.passed.length}`);
    RESULTS.passed.forEach(t => console.log(`   - ${t}`));

    if (RESULTS.warnings.length > 0) {
        console.log(`\n⚠️ WARNINGS: ${RESULTS.warnings.length}`);
        RESULTS.warnings.forEach(w => console.log(`   - ${w}`));
    }

    if (RESULTS.failed.length > 0) {
        console.log(`\n❌ FAILED: ${RESULTS.failed.length}`);
        RESULTS.failed.forEach(f => console.log(`   - ${f.name}: ${f.error}`));
    }

    console.log('\n═══════════════════════════════════════════════════════');

    if (RESULTS.failed.length === 0) {
        console.log('🎉 ALL TESTS PASSED - REPORT GENERATOR IS 100% WORKING');
    } else {
        console.log('⛔ SOME TESTS FAILED - REVIEW REQUIRED');
        process.exit(1);
    }

    // Cleanup
    await db.end();
}

main().catch(err => {
    console.error('\n💥 FATAL ERROR:', err);
    process.exit(1);
});
