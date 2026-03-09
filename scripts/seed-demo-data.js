/**
 * Demo Data Seeder for Venture Fund Presentation
 * 
 * Creates realistic patient data to demonstrate Hanna's capabilities:
 * - 10 demo patients with varied conditions and demographics
 * - Vitals history (7-14 days)
 * - Risk levels (low to critical)
 * - Pending nurse tasks
 * - AI activity logs
 * 
 * Usage: node scripts/seed-demo-data.js
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('supabase') ? { rejectUnauthorized: false } : false
});

// Demo patients with realistic Thai names and varied conditions
const demoPatients = [
    { name: 'สมชาย ใจดี', age: 62, condition: 'Type 2 Diabetes', phone: '081-234-5678', riskLevel: 'critical', riskScore: 9 },
    { name: 'สมหญิง รักสุข', age: 58, condition: 'Type 2 Diabetes, Hypertension', phone: '082-345-6789', riskLevel: 'high', riskScore: 7 },
    { name: 'วิชัย แสนดี', age: 71, condition: 'Hypertension', phone: '083-456-7890', riskLevel: 'high', riskScore: 6 },
    { name: 'มาลี สุขใจ', age: 55, condition: 'Type 2 Diabetes', phone: '084-567-8901', riskLevel: 'medium', riskScore: 4 },
    { name: 'ประสิทธิ์ ชัยชนะ', age: 67, condition: 'Type 1 Diabetes', phone: '085-678-9012', riskLevel: 'low', riskScore: 2 },
    { name: 'สุภาพ มั่นคง', age: 49, condition: 'Type 2 Diabetes', phone: '086-789-0123', riskLevel: 'low', riskScore: 1 },
    { name: 'วันดี รุ่งเรือง', age: 64, condition: 'Hypertension', phone: '087-890-1234', riskLevel: 'medium', riskScore: 5 },
    { name: 'กิตติ ทองคำ', age: 73, condition: 'Type 2 Diabetes, Hypertension', phone: '088-901-2345', riskLevel: 'critical', riskScore: 8 },
    { name: 'นิรันดร์ พัฒนา', age: 52, condition: 'Type 2 Diabetes', phone: '089-012-3456', riskLevel: 'low', riskScore: 3 },
    { name: 'ปราณี สันติ', age: 60, condition: 'Type 1 Diabetes', phone: '090-123-4567', riskLevel: 'medium', riskScore: 4 }
];

// Task templates for nurse queue
const taskTemplates = [
    { type: 'vital_check', priority: 'critical', title: 'Glucose Critically High', reason: 'Blood glucose reading of 380 mg/dL requires immediate attention' },
    { type: 'follow_up', priority: 'critical', title: 'Emergency Keyword Detected', reason: 'Patient reported chest pain symptoms' },
    { type: 'vital_check', priority: 'high', title: 'Blood Pressure Elevated', reason: 'BP reading 175/105 mmHg - above safe threshold' },
    { type: 'medication_review', priority: 'high', title: 'Missed Medications', reason: 'Patient has not logged medication for 3 consecutive days' },
    { type: 'wellness_check', priority: 'normal', title: 'Silent Patient', reason: 'No check-in for 48+ hours' },
    { type: 'follow_up', priority: 'normal', title: 'Symptom Follow-up', reason: 'Patient reported dizziness yesterday' }
];

async function seedDemoData() {
    const client = await pool.connect();

    try {
        console.log('🌱 Starting demo data seeding...\n');

        // Get default tenant
        const tenantRes = await client.query("SELECT id FROM tenants WHERE code = 'HANNA_HQ' LIMIT 1");
        const tenantId = tenantRes.rows[0]?.id || null;
        console.log(`📋 Using tenant: ${tenantId || 'none'}`);

        const insertedPatients = [];

        // Insert demo patients
        console.log('\n👥 Creating demo patients...');
        for (let i = 0; i < demoPatients.length; i++) {
            const p = demoPatients[i];
            const lineUserId = `DEMO_USER_${String(i + 1).padStart(3, '0')}`;

            const result = await client.query(`
                INSERT INTO chronic_patients (
                    line_user_id, name, age, condition, phone_number,
                    enrollment_status, consent_pdpa, consent_medical_share, consent_date,
                    tenant_id, created_at
                ) VALUES ($1, $2, $3, $4, $5, 'active', true, true, NOW(), $6, NOW() - interval '${30 + Math.floor(Math.random() * 60)} days')
                ON CONFLICT (line_user_id) DO UPDATE SET
                    name = EXCLUDED.name,
                    age = EXCLUDED.age,
                    condition = EXCLUDED.condition,
                    enrollment_status = 'active'
                RETURNING id, name
            `, [lineUserId, p.name, p.age, p.condition, p.phone, tenantId]);

            const patientId = result.rows[0].id;
            insertedPatients.push({ id: patientId, ...p, lineUserId });
            console.log(`  ✅ ${p.name} (Risk: ${p.riskLevel})`);

            // Create patient_state record
            await client.query(`
                INSERT INTO patient_state (patient_id, current_risk_score, risk_level, last_assessment, status)
                VALUES ($1, $2, $3, NOW(), 'active')
                ON CONFLICT (patient_id) DO UPDATE SET
                    current_risk_score = EXCLUDED.current_risk_score,
                    risk_level = EXCLUDED.risk_level,
                    last_assessment = NOW()
            `, [patientId, p.riskScore, p.riskLevel]);
        }

        // Generate vitals history
        console.log('\n📊 Generating vitals history...');
        for (const patient of insertedPatients) {
            const daysOfData = 7 + Math.floor(Math.random() * 7); // 7-14 days

            for (let day = 0; day < daysOfData; day++) {
                const recordDate = new Date();
                recordDate.setDate(recordDate.getDate() - day);

                // Skip some days randomly (80% chance of recording)
                if (Math.random() > 0.2) {
                    // Blood glucose
                    const baseGlucose = patient.riskLevel === 'critical' ? 280 :
                        patient.riskLevel === 'high' ? 200 :
                            patient.riskLevel === 'medium' ? 150 : 110;
                    const glucose = baseGlucose + Math.floor(Math.random() * 60) - 30;

                    await client.query(`
                        INSERT INTO vitals_log (patient_id, type, value, source, recorded_at)
                        VALUES ($1, 'glucose', $2, 'self_report', $3)
                    `, [patient.id, JSON.stringify({ glucose }), recordDate]);

                    // Blood pressure
                    const baseSystolic = patient.riskLevel === 'critical' ? 170 :
                        patient.riskLevel === 'high' ? 155 :
                            patient.riskLevel === 'medium' ? 140 : 125;
                    const systolic = baseSystolic + Math.floor(Math.random() * 20) - 10;
                    const diastolic = 70 + Math.floor(Math.random() * 20);

                    await client.query(`
                        INSERT INTO vitals_log (patient_id, type, value, source, recorded_at)
                        VALUES ($1, 'blood_pressure', $2, 'self_report', $3)
                    `, [patient.id, JSON.stringify({ systolic, diastolic }), recordDate]);
                }
            }
            console.log(`  ✅ ${patient.name}: ${daysOfData} days of vitals`);
        }

        // Create check-in history
        console.log('\n📝 Creating check-in history...');
        const moods = ['good', 'okay', 'bad'];
        for (const patient of insertedPatients) {
            for (let day = 0; day < 7; day++) {
                const checkInDate = new Date();
                checkInDate.setDate(checkInDate.getDate() - day);

                // 75% chance of checking in
                if (Math.random() > 0.25) {
                    const baseGlucose = patient.riskLevel === 'critical' ? 280 :
                        patient.riskLevel === 'high' ? 200 : 130;
                    const mood = patient.riskLevel === 'critical' ? 'bad' :
                        patient.riskLevel === 'high' ? moods[Math.floor(Math.random() * 2) + 1] :
                            moods[Math.floor(Math.random() * 2)];

                    await client.query(`
                        INSERT INTO check_ins (line_user_id, check_in_time, mood, glucose_level, medication_taken, symptoms)
                        VALUES ($1, $2, $3, $4, $5, $6)
                    `, [
                        patient.lineUserId,
                        checkInDate,
                        mood,
                        baseGlucose + Math.floor(Math.random() * 40) - 20,
                        Math.random() > 0.15,
                        day === 0 && patient.riskLevel !== 'low' ? 'รู้สึกเวียนศีรษะเล็กน้อย' : null
                    ]);
                }
            }
        }
        console.log('  ✅ Check-in history created');

        // Create nurse tasks
        console.log('\n🚨 Creating nurse tasks...');
        const criticalPatients = insertedPatients.filter(p => p.riskLevel === 'critical' || p.riskLevel === 'high');

        for (let i = 0; i < Math.min(taskTemplates.length, criticalPatients.length + 2); i++) {
            const template = taskTemplates[i];
            const patient = criticalPatients[i % criticalPatients.length];

            await client.query(`
                INSERT INTO nurse_tasks (
                    patient_id, task_type, priority, status, reason, title, 
                    description, created_by, created_at
                ) VALUES ($1, $2, $3, 'pending', $4, $5, $6, 'OneBrain', NOW() - interval '${Math.floor(Math.random() * 120)} minutes')
            `, [
                patient.id,
                template.type,
                template.priority,
                template.reason,
                template.title,
                `${template.reason} - Requires nurse attention for ${patient.name}`
            ]);
            console.log(`  ✅ ${template.priority.toUpperCase()}: ${template.title}`);
        }

        // Create audit log entries
        console.log('\n🧠 Creating AI activity logs...');
        for (const patient of insertedPatients.slice(0, 5)) {
            await client.query(`
                INSERT INTO audit_log (actor, action, patient_id, details, timestamp)
                VALUES ('OneBrain', 'CALCULATE_RISK', $1, $2, NOW() - interval '${Math.floor(Math.random() * 60)} minutes')
            `, [
                patient.id,
                JSON.stringify({
                    risk_score: patient.riskScore,
                    risk_level: patient.riskLevel,
                    factors: ['vitals_analysis', 'engagement_check', 'trend_detection']
                })
            ]);
        }
        console.log('  ✅ AI activity logs created');

        // Create sample chat history
        console.log('\n💬 Creating sample conversations...');
        const sampleConversations = [
            { role: 'user', content: 'สวัสดีค่ะ วันนี้รู้สึกดีขึ้นแล้ว' },
            { role: 'assistant', content: 'ดีใจด้วยนะคะ! ยินดีที่คุณรู้สึกดีขึ้น อย่าลืมกินยาตามเวลาด้วยนะคะ 💚' },
            { role: 'user', content: 'น้ำตาล 145 ค่ะ' },
            { role: 'assistant', content: 'รับทราบค่ะ! บันทึกค่าน้ำตาล 145 mg/dL เรียบร้อยแล้ว ค่าอยู่ในเกณฑ์ที่ควบคุมได้ดีค่ะ 👍' },
        ];

        for (const patient of insertedPatients.slice(0, 3)) {
            for (const msg of sampleConversations) {
                await client.query(`
                    INSERT INTO chat_history (patient_id, role, content, message_type, metadata, created_at)
                    VALUES ($1, $2, $3, 'text', '{"source": "demo"}', NOW() - interval '${Math.floor(Math.random() * 24)} hours')
                `, [patient.id, msg.role, msg.content]);
            }
        }
        console.log('  ✅ Sample conversations created');

        console.log('\n' + '='.repeat(50));
        console.log('✅ Demo data seeding completed successfully!');
        console.log('='.repeat(50));
        console.log(`\n📊 Summary:`);
        console.log(`   - ${insertedPatients.length} demo patients created`);
        console.log(`   - Vitals history for 7-14 days per patient`);
        console.log(`   - ${taskTemplates.length} nurse tasks in queue`);
        console.log(`   - AI activity logs generated`);
        console.log(`\n🚀 You can now view the data in the Nurse Dashboard!`);

    } catch (error) {
        console.error('❌ Error seeding demo data:', error);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

// Run the seeder
seedDemoData().catch(console.error);
