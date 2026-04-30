const express = require('express');
const router = express.Router();
const db = require('../services/db');

/**
 * Hanna Care Plan API
 *
 * This route is the bridge between Scribe and Care Intelligence.
 *
 * Product loop:
 * Scribe note -> care plan draft -> clinician approval -> LINE follow-up enrollment -> nurse priority queue.
 *
 * The route is intentionally demo-tolerant: if the care_plans table does not exist yet,
 * it falls back to an in-memory store so the sales demo can still show the end-to-end loop.
 */

const demoCarePlans = new Map();
let demoId = 9000;

function nextDemoId() {
    demoId += 1;
    return demoId;
}

function normalizeNoteContent(note) {
    if (!note) return {};
    if (typeof note.content === 'string') {
        try { return JSON.parse(note.content); } catch (_) { return { text: note.content }; }
    }
    return note.content || {};
}

function buildCarePlanFromNote(note) {
    const content = normalizeNoteContent(note);
    const planText = content.plan || content.Plan || content.text || note?.content_text || '';
    const assessment = content.assessment || content.Assessment || '';

    const symptomsToWatch = [];
    const lower = `${planText} ${assessment}`.toLowerCase();

    if (lower.includes('fever') || lower.includes('ไข้')) symptomsToWatch.push('Fever or worsening fever');
    if (lower.includes('dizziness') || lower.includes('เวียน')) symptomsToWatch.push('Dizziness or faintness');
    if (lower.includes('bp') || lower.includes('blood pressure') || lower.includes('hypertension')) symptomsToWatch.push('High blood pressure symptoms');
    if (lower.includes('glucose') || lower.includes('diabetes') || lower.includes('dm')) symptomsToWatch.push('High or low glucose symptoms');
    if (symptomsToWatch.length === 0) symptomsToWatch.push('New or worsening symptoms');

    return {
        diagnosis_context: assessment || 'Follow-up after clinical visit',
        patient_instructions: planText || 'Follow the clinician-reviewed plan and respond to check-ins.',
        medication_or_adherence_items: [
            'Take medications as reviewed by the clinician',
            'Tell the care team if any doses are missed'
        ],
        symptoms_to_watch: symptomsToWatch,
        check_in_questions: [
            'How are you feeling today?',
            'Have you taken your medication as planned?',
            'Do you have any new or worsening symptoms?'
        ],
        check_in_schedule: {
            duration_days: 14,
            cadence: 'day_1_day_3_day_7_day_14'
        },
        escalation_rules: [
            'Severe symptoms',
            'Medication not taken',
            'No response for 72 hours',
            'Patient reports feeling worse'
        ]
    };
}

async function findNote(noteId, clinicianId) {
    const result = await db.query(
        `SELECT n.*, s.patient_name, s.patient_hn, s.id as session_id
         FROM scribe_notes n
         JOIN scribe_sessions s ON s.id = n.session_id
         WHERE n.id = $1 AND n.clinician_id = $2`,
        [noteId, clinicianId]
    );
    return result.rows[0];
}

function demoPersistCarePlan(carePlan) {
    const id = nextDemoId();
    const row = {
        id,
        ...carePlan,
        created_at: new Date(),
        updated_at: new Date()
    };
    demoCarePlans.set(String(id), row);
    return row;
}

async function persistCarePlan(carePlan) {
    try {
        const result = await db.query(
            `INSERT INTO care_plans (
                patient_name,
                patient_hn,
                patient_id,
                session_id,
                note_id,
                clinician_id,
                diagnosis_context,
                patient_instructions,
                medication_or_adherence_items,
                symptoms_to_watch,
                check_in_questions,
                check_in_schedule,
                escalation_rules,
                clinician_review_status,
                followup_status,
                created_at,
                updated_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'draft','not_enrolled',NOW(),NOW())
            RETURNING *`,
            [
                carePlan.patient_name,
                carePlan.patient_hn,
                carePlan.patient_id || null,
                carePlan.session_id,
                carePlan.note_id,
                carePlan.clinician_id,
                carePlan.diagnosis_context,
                carePlan.patient_instructions,
                JSON.stringify(carePlan.medication_or_adherence_items || []),
                JSON.stringify(carePlan.symptoms_to_watch || []),
                JSON.stringify(carePlan.check_in_questions || []),
                JSON.stringify(carePlan.check_in_schedule || {}),
                JSON.stringify(carePlan.escalation_rules || [])
            ]
        );

        if (result.rows[0]) return result.rows[0];
        return demoPersistCarePlan({ ...carePlan, clinician_review_status: 'draft', followup_status: 'not_enrolled' });
    } catch (err) {
        console.warn('[CarePlans] Falling back to demo store:', err.message);
        return demoPersistCarePlan({ ...carePlan, clinician_review_status: 'draft', followup_status: 'not_enrolled' });
    }
}

async function getCarePlan(id) {
    try {
        const result = await db.query(`SELECT * FROM care_plans WHERE id = $1`, [id]);
        if (result.rows[0]) return result.rows[0];
    } catch (err) {
        console.warn('[CarePlans] DB read fallback:', err.message);
    }
    return demoCarePlans.get(String(id));
}

async function updateCarePlan(id, updates) {
    const current = await getCarePlan(id);
    if (!current) return null;

    const merged = { ...current, ...updates, updated_at: new Date() };

    try {
        const result = await db.query(
            `UPDATE care_plans SET
                diagnosis_context = COALESCE($1, diagnosis_context),
                patient_instructions = COALESCE($2, patient_instructions),
                medication_or_adherence_items = COALESCE($3, medication_or_adherence_items),
                symptoms_to_watch = COALESCE($4, symptoms_to_watch),
                check_in_questions = COALESCE($5, check_in_questions),
                check_in_schedule = COALESCE($6, check_in_schedule),
                escalation_rules = COALESCE($7, escalation_rules),
                updated_at = NOW()
             WHERE id = $8
             RETURNING *`,
            [
                updates.diagnosis_context || null,
                updates.patient_instructions || null,
                updates.medication_or_adherence_items ? JSON.stringify(updates.medication_or_adherence_items) : null,
                updates.symptoms_to_watch ? JSON.stringify(updates.symptoms_to_watch) : null,
                updates.check_in_questions ? JSON.stringify(updates.check_in_questions) : null,
                updates.check_in_schedule ? JSON.stringify(updates.check_in_schedule) : null,
                updates.escalation_rules ? JSON.stringify(updates.escalation_rules) : null,
                id
            ]
        );
        if (result.rows[0]) return result.rows[0];
    } catch (err) {
        console.warn('[CarePlans] DB update fallback:', err.message);
    }

    demoCarePlans.set(String(id), merged);
    return merged;
}

router.post('/from-note', async (req, res) => {
    try {
        const { note_id, clinician_id } = req.body;
        const clinicianId = clinician_id || req.clinicianId || 1;

        if (!note_id) return res.status(400).json({ error: 'note_id is required' });

        const note = await findNote(note_id, clinicianId);
        if (!note) return res.status(404).json({ error: 'Scribe note not found' });

        const draft = buildCarePlanFromNote(note);
        const carePlan = await persistCarePlan({
            ...draft,
            patient_name: note.patient_name,
            patient_hn: note.patient_hn,
            session_id: note.session_id,
            note_id,
            clinician_id: clinicianId
        });

        res.json({ success: true, care_plan: carePlan });
    } catch (err) {
        console.error('[CarePlans] Create from note error:', err);
        res.status(500).json({ error: 'Failed to create care plan from note', details: err.message });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const carePlan = await getCarePlan(req.params.id);
        if (!carePlan) return res.status(404).json({ error: 'Care plan not found' });
        res.json({ care_plan: carePlan });
    } catch (err) {
        res.status(500).json({ error: 'Failed to load care plan', details: err.message });
    }
});

router.patch('/:id', async (req, res) => {
    try {
        const updated = await updateCarePlan(req.params.id, req.body || {});
        if (!updated) return res.status(404).json({ error: 'Care plan not found' });
        res.json({ success: true, care_plan: updated });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update care plan', details: err.message });
    }
});

router.post('/:id/approve', async (req, res) => {
    try {
        const approved = await updateCarePlan(req.params.id, {
            clinician_review_status: 'approved',
            approved_at: new Date()
        });
        if (!approved) return res.status(404).json({ error: 'Care plan not found' });
        res.json({ success: true, care_plan: approved });
    } catch (err) {
        res.status(500).json({ error: 'Failed to approve care plan', details: err.message });
    }
});

router.post('/:id/enroll-followup', async (req, res) => {
    try {
        const carePlan = await getCarePlan(req.params.id);
        if (!carePlan) return res.status(404).json({ error: 'Care plan not found' });

        const enrollment = {
            patient_name: carePlan.patient_name,
            patient_hn: carePlan.patient_hn,
            phone: req.body.phone || req.body.patient_phone,
            line_consent: req.body.line_consent !== false,
            type: req.body.type || 'chronic',
            duration_days: req.body.duration_days || carePlan.check_in_schedule?.duration_days || 14,
            scribe_session_id: carePlan.session_id,
            care_plan_id: carePlan.id
        };

        if (!enrollment.phone) {
            return res.status(400).json({ error: 'phone is required to enroll patient into follow-up' });
        }

        // Mark care plan as enrollment-ready. The existing /api/followup/enroll route remains the canonical enrollment endpoint.
        const updated = await updateCarePlan(req.params.id, {
            followup_status: 'ready_for_enrollment',
            enrollment_payload: enrollment
        });

        res.json({
            success: true,
            care_plan: updated,
            enrollment_payload: enrollment,
            next_step: 'POST this enrollment_payload to /api/followup/enroll'
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to prepare follow-up enrollment', details: err.message });
    }
});

module.exports = router;
