require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Helper to get keys from env (support both formats just in case)
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY || process.env.VITE_SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function seed() {
    console.log('🌱 Seeding Nurse Tasks via HTTP...');

    // 1. Get a patient
    const { data: patients, error: pError } = await supabase
        .from('chronic_patients')
        .select('id')
        .limit(1);

    if (pError || !patients.length) {
        console.error('❌ No patients found or error:', pError);
        process.exit(1);
    }
    const patientId = patients[0].id;

    // 2. Insert Tasks
    const tasks = [
        {
            patient_id: patientId,
            task_type: 'review_risk',
            priority: 'critical',
            reason: 'Glucose 450 mg/dL (Critical High)',
            status: 'pending'
        },
        {
            patient_id: patientId,
            task_type: 'call_silent_patient',
            priority: 'high',
            reason: 'Silent for 48h - Possible fall',
            status: 'pending'
        },
        {
            patient_id: patientId,
            task_type: 'routine_check',
            priority: 'normal',
            reason: 'Weekly Adherence Review',
            status: 'pending'
        }
    ];

    const { error: iError } = await supabase
        .from('nurse_tasks')
        .insert(tasks);

    if (iError) {
        console.error('❌ Insert Error:', iError);
        process.exit(1);
    }

    console.log('✅ Seeded 3 tasks successfully.');
}

seed();
