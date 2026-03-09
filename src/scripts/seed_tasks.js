const db = require('../services/db');

async function seed() {
    console.log('🌱 Seeding Nurse Tasks...');

    // 1. Get a patient
    const res = await db.query('SELECT id FROM chronic_patients LIMIT 1');
    if (res.rows.length === 0) {
        console.error('❌ No patients found. Please create a patient first.');
        process.exit(1);
    }
    const patientId = res.rows[0].id;

    // 2. Insert Tasks
    const tasks = [
        {
            type: 'review_risk',
            priority: 'critical',
            reason: 'Glucose 450 mg/dL (Critical High)',
            status: 'pending'
        },
        {
            type: 'call_silent_patient',
            priority: 'high',
            reason: 'Silent for 48h - Possible fall',
            status: 'pending'
        },
        {
            type: 'routine_check',
            priority: 'normal',
            reason: 'Weekly Adherence Review',
            status: 'pending'
        }
    ];

    for (const task of tasks) {
        await db.query(`
            INSERT INTO nurse_tasks (patient_id, task_type, priority, reason, status)
            VALUES ($1, $2, $3, $4, $5)
        `, [patientId, task.type, task.priority, task.reason, task.status]);
    }

    console.log('✅ Seeded 3 tasks.');
    process.exit(0);
}

seed().catch(console.error);
