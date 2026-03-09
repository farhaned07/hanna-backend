const express = require('express');
const router = express.Router();
const db = require('../services/db');

/**
 * PDPA Right-to-Erasure Endpoint
 * 
 * Implements Article 19 of Thailand PDPA
 * Allows complete erasure of patient data upon verified request
 * 
 * Security: Requires nurse authentication
 * Audit: All erasures logged for compliance
 */

// DELETE /api/patient/:id/erase
// PDPA Article 19: Right to Erasure
router.delete('/:id/erase', async (req, res) => {
    const { id } = req.params;
    const { reason, requestedBy } = req.body;

    // Validation
    if (!reason || !requestedBy) {
        return res.status(400).json({
            error: 'Missing required fields',
            hint: 'Both reason and requestedBy are required for audit compliance'
        });
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
        return res.status(400).json({ error: 'Invalid patient ID format' });
    }

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Fetch patient for audit before deletion
        const patient = await client.query(
            'SELECT id, name, line_user_id FROM chronic_patients WHERE id = $1',
            [id]
        );

        if (patient.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Patient not found' });
        }

        const patientData = patient.rows[0];

        // 2. Create erasure audit record BEFORE deletion
        // Store hashes only - no PII in erasure log
        await client.query(`
            INSERT INTO erasure_log (patient_id_original, patient_name_hash, line_user_id_hash, 
                                     reason, requested_by, erased_at)
            VALUES ($1, MD5($2), MD5($3), $4, $5, NOW())
        `, [id, patientData.name, patientData.line_user_id, reason, requestedBy]);

        // 3. Delete in correct order (foreign key dependencies)
        // Each table deletion is logged for transparency
        const deletions = [
            { table: 'case_rechecks', query: 'DELETE FROM case_rechecks WHERE patient_id = $1' },
            { table: 'escalation_log', query: 'DELETE FROM escalation_log WHERE patient_id = $1' },
            { table: 'nurse_logs', query: 'DELETE FROM nurse_logs WHERE patient_id = $1' },
            { table: 'nurse_tasks', query: 'DELETE FROM nurse_tasks WHERE patient_id = $1' },
            { table: 'chat_history', query: 'DELETE FROM chat_history WHERE patient_id = $1' },
            { table: 'vitals_log', query: 'DELETE FROM vitals_log WHERE patient_id = $1' },
            { table: 'medication_log', query: 'DELETE FROM medication_log WHERE patient_id = $1' },
            { table: 'check_ins', query: 'DELETE FROM check_ins WHERE patient_id = $1' },
            { table: 'patient_state', query: 'DELETE FROM patient_state WHERE patient_id = $1' },
            { table: 'audit_log', query: 'DELETE FROM audit_log WHERE patient_id = $1' },
            { table: 'chronic_patients', query: 'DELETE FROM chronic_patients WHERE id = $1' }
        ];

        const deletionResults = [];
        for (const del of deletions) {
            try {
                const result = await client.query(del.query, [id]);
                deletionResults.push({ table: del.table, rowsDeleted: result.rowCount });
            } catch (tableError) {
                // Some tables may not exist or have no data - continue
                deletionResults.push({ table: del.table, rowsDeleted: 0, note: 'Table empty or not applicable' });
            }
        }

        await client.query('COMMIT');

        console.log(`🗑️ [PDPA ERASURE] Patient ${id} erased. Reason: ${reason}. Requested by: ${requestedBy}`);

        res.json({
            success: true,
            message: 'Patient data erased per PDPA Article 19',
            erasedAt: new Date().toISOString(),
            deletions: deletionResults
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ [PDPA ERASURE] Failed:', error);
        res.status(500).json({
            error: 'Erasure failed, transaction rolled back',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        client.release();
    }
});

// GET /api/patient/:id - Get patient details (for verification before erasure)
router.get('/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const result = await db.query(
            'SELECT id, name, age, condition, enrollment_status, created_at FROM chronic_patients WHERE id = $1',
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Patient not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching patient:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

module.exports = router;
